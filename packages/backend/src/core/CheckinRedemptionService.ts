/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { DI } from '@/di-symbols.js';
import { MiUser } from '@/models/User.js';
import { MiUserProfile } from '@/models/UserProfile.js';
import { MiCheckinRedemptionCode } from '@/models/CheckinRedemptionCode.js';
import { MiCheckinRedemptionClaim } from '@/models/CheckinRedemptionClaim.js';
import { CheckinService } from '@/core/CheckinService.js';
import { IdService } from '@/core/IdService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { bindThis } from '@/decorators.js';

function packCode(code: MiCheckinRedemptionCode) {
	return {
		id: code.id, name: code.name, code: code.code, amount: code.amount, maxRedemptions: code.maxRedemptions,
		redemptions: code.redemptions, expiresAt: code.expiresAt?.toISOString() ?? null, enabled: code.enabled, createdAt: code.createdAt.toISOString(),
	};
}

@Injectable()
export class CheckinRedemptionService {
	public static InvalidConfigurationError = class extends Error {};
	public static NoSuchCodeError = class extends Error {};
	public static DisabledCodeError = class extends Error {};
	public static ExpiredCodeError = class extends Error {};
	public static ExhaustedCodeError = class extends Error {};

	constructor(
		@Inject(DI.db) private db: DataSource,
		private checkinService: CheckinService,
		private idService: IdService,
		private userEntityService: UserEntityService,
	) {
	}

	@bindThis
	public async create(params: { name: string; amount: number; maxRedemptions: number; expiresAt?: string | null }, administrator: MiUser) {
		const now = new Date();
		const expiresAt = params.expiresAt == null ? null : new Date(params.expiresAt);
		if (!params.name.trim() || (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now))) throw new CheckinRedemptionService.InvalidConfigurationError();
		const code = this.db.getRepository(MiCheckinRedemptionCode).create({
			id: this.idService.gen(), code: randomBytes(16).toString('hex'), name: params.name.trim(), amount: params.amount,
			maxRedemptions: params.maxRedemptions, redemptions: 0, expiresAt, enabled: true, createdAt: now, createdBy: administrator.id,
		});
		await this.db.getRepository(MiCheckinRedemptionCode).insert(code);
		return packCode(code);
	}

	@bindThis
	public async list(offset: number, limit: number) {
		return this.db.transaction('REPEATABLE READ', async manager => {
			const repository = manager.getRepository(MiCheckinRedemptionCode);
			const total = await repository.count();
			const codes = await repository.find({ order: { createdAt: 'DESC', id: 'DESC' }, skip: offset, take: limit });
			return { total, items: codes.map(packCode) };
		});
	}

	@bindThis
	public async update(id: string, enabled: boolean) {
		return this.db.transaction(async manager => {
			const code = await manager.findOne(MiCheckinRedemptionCode, { where: { id }, lock: { mode: 'pessimistic_write' } });
			if (!code) throw new CheckinRedemptionService.NoSuchCodeError();
			await manager.update(MiCheckinRedemptionCode, { id }, { enabled });
			return packCode({ ...code, enabled });
		});
	}

	@bindThis
	public async claims(codeId: string, offset: number, limit: number, me: MiUser) {
		const result = await this.db.transaction('REPEATABLE READ', async manager => {
			const repository = manager.getRepository(MiCheckinRedemptionClaim);
			const total = await repository.countBy({ codeId });
			const rows = await repository.find({ where: { codeId }, order: { createdAt: 'DESC', id: 'DESC' }, skip: offset, take: limit });
			return { total, rows };
		});
		const userIds = [...new Set(result.rows.map(row => row.userId))];
		const users = userIds.length > 0 ? await this.db.getRepository(MiUser).findBy({ id: In(userIds) }) : [];
		const packed = await this.userEntityService.packMany(users, me, { schema: 'UserLite' });
		const byId = new Map(packed.map(user => [user.id, user]));
		return { total: result.total, items: result.rows.map(row => ({ id: row.id, createdAt: row.createdAt.toISOString(), userId: row.userId, user: byId.get(row.userId) ?? null, amount: row.amount })) };
	}

	@bindThis
	public async redeem(userId: string, value: string): Promise<{ newlyRedeemed: boolean; amount: number; makeupCards: number; points: number }> {
		return this.db.transaction(async manager => {
			// Always lock user before code, matching every other card balance mutation.
			const user = await manager.findOne(MiUser, { where: { id: userId }, lock: { mode: 'for_no_key_update' } });
			if (!user || user.host !== null || user.isSuspended || user.isDeleted || user.movedToUri || user.username.includes('.')) throw new CheckinService.NotAllowedError();
			const code = await manager.findOne(MiCheckinRedemptionCode, { where: { code: value.trim().toLowerCase() }, lock: { mode: 'pessimistic_write' } });
			if (!code) throw new CheckinRedemptionService.NoSuchCodeError();
			if (await manager.existsBy(MiCheckinRedemptionClaim, { userId, codeId: code.id })) {
				const profile = await manager.findOneByOrFail(MiUserProfile, { userId });
				return { newlyRedeemed: false, amount: 0, makeupCards: profile.checkinMakeupCards, points: profile.checkinPoints };
			}
			const now = new Date();
			if (!code.enabled) throw new CheckinRedemptionService.DisabledCodeError();
			if (code.expiresAt && code.expiresAt <= now) throw new CheckinRedemptionService.ExpiredCodeError();
			if (code.redemptions >= code.maxRedemptions) throw new CheckinRedemptionService.ExhaustedCodeError();
			const result = await this.checkinService.creditRedemptionCards(manager, userId, code.amount, now);
			await manager.insert(MiCheckinRedemptionClaim, { id: this.idService.gen(), userId, codeId: code.id, batchId: result.batchId, amount: code.amount, createdAt: now });
			await manager.increment(MiCheckinRedemptionCode, { id: code.id }, 'redemptions', 1);
			return { newlyRedeemed: true, amount: code.amount, makeupCards: result.makeupCards, points: result.points };
		});
	}
}
