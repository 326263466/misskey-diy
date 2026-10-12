/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DataSource, In, LessThan, type EntityManager } from 'typeorm';
import { DI } from '@/di-symbols.js';
import { WalletService } from '@/core/WalletService.js';
import { TipService } from '@/core/TipService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { MiTip, type TipTarget } from '@/models/Tip.js';
import { MiNote } from '@/models/Note.js';
import { MiPage } from '@/models/Page.js';
import { MiUser } from '@/models/User.js';
import { MiBlocking } from '@/models/Blocking.js';
import { canReadArticle } from '@/misc/article-access.js';

type Viewer = { id: string };

@Injectable()
export class ContentTipService {
	public static NoSuchTargetError = class extends Error {};

	constructor(
		@Inject(DI.db) private db: DataSource,
		private tipService: TipService,
		private noteEntityService: NoteEntityService,
		private userEntityService: UserEntityService,
	) {}

	public async send(senderId: string, recipientId: string, amount: number, message: string, requestId: string, target: TipTarget) {
		return this.db.transaction(async manager => {
			// 成功后的重试按原凭证核对，不依赖内容仍存在或仍对付款人可见。
			const existing = await manager.findOneBy(MiTip, { senderId, requestId: requestId.toLowerCase() });
			if (!existing) {
				// 与内容删除保持同一锁序：先内容，再用户和钱包。
				const authorId = await this.authorizeTarget(target, { id: senderId }, manager, true);
				if (authorId !== recipientId) throw new WalletService.NotAllowedError();
			}
			return this.tipService.send(senderId, recipientId, amount, message, requestId, { manager, target });
		});
	}

	public async list(target: TipTarget, viewer: Viewer | null, limit: number, untilId?: string) {
		return this.db.transaction('REPEATABLE READ', async manager => {
			await this.authorizeTarget(target, viewer, manager);
			const tips = manager.getRepository(MiTip);
			const rows = await tips.find({ where: { ...target, ...(untilId ? { id: LessThan(untilId) } : {}) }, order: { id: 'DESC' }, take: limit });
			const totals = await tips.createQueryBuilder('tip').select('COUNT(*)', 'count').addSelect('COALESCE(SUM(tip.amount), 0)', 'amount')
				.where('tip.targetType = :targetType AND tip.targetId = :targetId', target).getRawOne<{ count: string; amount: string }>();
			const senderIds = rows.flatMap(tip => tip.senderId ? [tip.senderId] : []);
			const senders = senderIds.length ? await manager.findBy(MiUser, { id: In(senderIds), isSuspended: false, isDeleted: false }) : [];
			const users = new Map((await this.userEntityService.packMany(senders, viewer)).map(user => [user.id, user]));
			return {
				items: rows.map(tip => ({ id: tip.id, createdAt: tip.createdAt.toISOString(), user: tip.senderId ? users.get(tip.senderId) ?? null : null, amount: tip.amount, message: tip.message })),
				totalCount: Number(totals?.count ?? 0), totalAmount: Number(totals?.amount ?? 0),
			};
		});
	}

	private async authorizeTarget(target: TipTarget, viewer: Viewer | null, manager: EntityManager, lock = false): Promise<string> {
		const options = { where: { id: target.targetId }, ...(lock ? { lock: { mode: 'for_no_key_update' as const } } : {}) };
		const content = target.targetType === 'note' ? await manager.findOne(MiNote, options) : await manager.findOne(MiPage, options);
		if (!content) throw new ContentTipService.NoSuchTargetError();
		const author = await manager.findOneBy(MiUser, { id: content.userId });
		if (!author || author.host != null || author.isSuspended || author.isDeleted || author.movedToUri) throw new ContentTipService.NoSuchTargetError();
		if (viewer && await manager.existsBy(MiBlocking, [{ blockerId: viewer.id, blockeeId: author.id }, { blockerId: author.id, blockeeId: viewer.id }])) throw new ContentTipService.NoSuchTargetError();
		const visible = target.targetType === 'note'
			? await this.noteEntityService.isContentVisible(content as MiNote, viewer)
			: await canReadArticle(content as MiPage, viewer, manager);
		if (!visible) throw new ContentTipService.NoSuchTargetError();
		return content.userId;
	}
}
