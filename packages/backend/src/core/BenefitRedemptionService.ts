/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource, In, IsNull } from 'typeorm';
import { CONTENT_LIMITS } from 'misskey-js';
import { DI } from '@/di-symbols.js';
import { MiUser } from '@/models/User.js';
import { BENEFIT_REWARD_TYPES, MiBenefitRedemptionCode, type BenefitRewardType } from '@/models/BenefitRedemptionCode.js';
import { MiBenefitRedemptionClaim } from '@/models/BenefitRedemptionClaim.js';
import { CheckinService } from '@/core/CheckinService.js';
import { WalletService } from '@/core/WalletService.js';
import { IdService } from '@/core/IdService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { bindThis } from '@/decorators.js';

type CodeConfiguration = {
	name: string;
	rewardType: BenefitRewardType;
	amount: number;
	maxRedemptions: number;
	expiresAt?: string | null;
	enabled: boolean;
};

type NewCodeConfiguration = Omit<CodeConfiguration, 'enabled'>;

function validateConfiguration(params: CodeConfiguration, previousExpiry?: Date | null) {
	const expiresAt = params.expiresAt == null ? null : new Date(params.expiresAt);
	const amountLimit = params.rewardType === 'points' ? 1_000_000 : 10_000;
	if (!params.name.trim() || Array.from(params.name.trim()).length > CONTENT_LIMITS.collectionName || !BENEFIT_REWARD_TYPES.includes(params.rewardType) ||
		!Number.isSafeInteger(params.amount) || params.amount < 1 || params.amount > amountLimit ||
		!Number.isSafeInteger(params.maxRedemptions) || params.maxRedemptions < 1 || params.maxRedemptions > 1_000_000 ||
		(expiresAt && (!Number.isFinite(expiresAt.getTime()) || (expiresAt <= new Date() && expiresAt.getTime() !== previousExpiry?.getTime())))) throw new BenefitRedemptionService.InvalidConfigurationError();
	return { name: params.name.trim(), rewardType: params.rewardType, amount: params.amount, maxRedemptions: params.maxRedemptions, expiresAt, enabled: params.enabled };
}

function packCode(code: MiBenefitRedemptionCode) {
	return {
		id: code.id, name: code.name, code: code.code, rewardType: code.rewardType, amount: code.amount, maxRedemptions: code.maxRedemptions,
		redemptions: code.redemptions, expiresAt: code.expiresAt?.toISOString() ?? null, enabled: code.enabled, createdAt: code.createdAt.toISOString(),
	};
}

@Injectable()
export class BenefitRedemptionService {
	public static InvalidConfigurationError = class extends Error {};
	public static NotAllowedError = class extends Error {};
	public static NoSuchCodeError = class extends Error {};
	public static DisabledCodeError = class extends Error {};
	public static ExpiredCodeError = class extends Error {};
	public static ExhaustedCodeError = class extends Error {};
	public static RewardLockedError = class extends Error {};
	public static ClaimLimitError = class extends Error {};

	constructor(
		@Inject(DI.db) private db: DataSource,
		private checkinService: CheckinService,
		private walletService: WalletService,
		private idService: IdService,
		private userEntityService: UserEntityService,
	) {
	}

	@bindThis
	public async create(params: NewCodeConfiguration, administrator: MiUser) {
		const now = new Date();
		const configuration = validateConfiguration({ ...params, enabled: true });
		const code = this.db.getRepository(MiBenefitRedemptionCode).create({
			...configuration, id: this.idService.gen(), code: randomBytes(16).toString('hex'),
			redemptions: 0, deletedAt: null, createdAt: now, createdBy: administrator.id,
		});
		await this.db.getRepository(MiBenefitRedemptionCode).insert(code);
		return packCode(code);
	}

	@bindThis
	public async list(offset: number, limit: number) {
		return this.db.transaction('REPEATABLE READ', async manager => {
			const repository = manager.getRepository(MiBenefitRedemptionCode);
			const total = await repository.countBy({ deletedAt: IsNull() });
			const codes = await repository.find({ where: { deletedAt: IsNull() }, order: { createdAt: 'DESC', id: 'DESC' }, skip: offset, take: limit });
			return { total, items: codes.map(packCode) };
		});
	}

	@bindThis
	public async update(id: string, params: CodeConfiguration) {
		return this.db.transaction(async manager => {
			const code = await manager.findOne(MiBenefitRedemptionCode, { where: { id, deletedAt: IsNull() }, lock: { mode: 'pessimistic_write' } });
			if (!code) throw new BenefitRedemptionService.NoSuchCodeError();
			const configuration = validateConfiguration(params, code.expiresAt);
			if (code.redemptions > 0 && (configuration.rewardType !== code.rewardType || configuration.amount !== code.amount)) throw new BenefitRedemptionService.RewardLockedError();
			if (configuration.maxRedemptions < code.redemptions) throw new BenefitRedemptionService.ClaimLimitError();
			await manager.update(MiBenefitRedemptionCode, { id }, configuration);
			return packCode({ ...code, ...configuration });
		});
	}

	@bindThis
	public async remove(id: string) {
		await this.db.transaction(async manager => {
			const code = await manager.findOne(MiBenefitRedemptionCode, { where: { id, deletedAt: IsNull() }, lock: { mode: 'pessimistic_write' } });
			if (!code) throw new BenefitRedemptionService.NoSuchCodeError();
			await manager.update(MiBenefitRedemptionCode, { id }, { enabled: false, deletedAt: new Date() });
		});
	}

	@bindThis
	public async claims(codeId: string, offset: number, limit: number, me: MiUser) {
		const result = await this.db.transaction('REPEATABLE READ', async manager => {
			const repository = manager.getRepository(MiBenefitRedemptionClaim);
			const total = await repository.countBy({ codeId });
			const rows = await repository.find({ where: { codeId }, order: { createdAt: 'DESC', id: 'DESC' }, skip: offset, take: limit });
			return { total, rows };
		});
		const userIds = [...new Set(result.rows.map(row => row.userId))];
		const users = userIds.length > 0 ? await this.db.getRepository(MiUser).findBy({ id: In(userIds) }) : [];
		const packed = await this.userEntityService.packMany(users, me, { schema: 'UserLite' });
		const byId = new Map(packed.map(user => [user.id, user]));
		return { total: result.total, items: result.rows.map(row => ({ id: row.id, createdAt: row.createdAt.toISOString(), userId: row.userId, user: byId.get(row.userId) ?? null, rewardType: row.rewardType, amount: row.amount })) };
	}

	@bindThis
	public async history(userId: string, offset: number, limit: number) {
		return this.db.transaction('REPEATABLE READ', async manager => {
			const [rows, total] = await manager.getRepository(MiBenefitRedemptionClaim).findAndCount({
				where: { userId }, order: { createdAt: 'DESC', id: 'DESC' }, skip: offset, take: limit,
			});
			return { total, items: rows.map(row => ({
				id: row.id, rewardType: row.rewardType, amount: row.amount, createdAt: row.createdAt.toISOString(),
			})) };
		});
	}

	@bindThis
	public async redeem(userId: string, value: string): Promise<{ newlyRedeemed: boolean; rewardType: BenefitRewardType; amount: number }> {
		return this.db.transaction(async manager => {
			const user = await manager.findOne(MiUser, { where: { id: userId }, lock: { mode: 'for_no_key_update' } });
			if (!user || user.host !== null || user.isSuspended || user.isDeleted || user.movedToUri || user.username.includes('.')) throw new BenefitRedemptionService.NotAllowedError();
			const code = await manager.findOne(MiBenefitRedemptionCode, { where: { code: value.trim().toLowerCase(), deletedAt: IsNull() }, lock: { mode: 'pessimistic_write' } });
			if (!code) throw new BenefitRedemptionService.NoSuchCodeError();
			const existing = await manager.findOneBy(MiBenefitRedemptionClaim, { userId, codeId: code.id });
			if (existing) {
				return { newlyRedeemed: false, rewardType: existing.rewardType, amount: 0 };
			}
			const now = new Date();
			if (!code.enabled) throw new BenefitRedemptionService.DisabledCodeError();
			if (code.expiresAt && code.expiresAt <= now) throw new BenefitRedemptionService.ExpiredCodeError();
			if (code.redemptions >= code.maxRedemptions) throw new BenefitRedemptionService.ExhaustedCodeError();
			let batchId: string | null = null;
			if (code.rewardType === 'points') {
				await this.walletService.changePointsInTransaction(manager, userId, code.amount, {
					type: 'redemptionReward', relatedId: code.id, actorId: code.createdBy,
				});
			} else if (code.rewardType === 'makeupCards') {
				const result = await this.checkinService.creditRedemptionCards(manager, userId, code.amount, now);
				batchId = result.batchId;
			} else {
				throw new Error('Unknown benefit reward type.');
			}
			await manager.insert(MiBenefitRedemptionClaim, { id: this.idService.gen(), userId, codeId: code.id, batchId, rewardType: code.rewardType, amount: code.amount, createdAt: now });
			await manager.increment(MiBenefitRedemptionCode, { id: code.id }, 'redemptions', 1);
			return { newlyRedeemed: true, rewardType: code.rewardType, amount: code.amount };
		});
	}
}
