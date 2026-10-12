/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class WalletPointsOpeningBalance1791309050878 {
	name = 'WalletPointsOpeningBalance1791309050878';

	async up(queryRunner) {
		// 只补当前余额中尚未记账的历史本金；低序 ID 使期初记录排在正常流水之前。
		const openingBalances = `
			SELECT
				'0000' || substr(md5('points-opening:' || p."userId"), 1, 28) AS "id",
				p."userId",
				p."checkinPoints" - COALESCE(ledger."amount", 0) AS "amount",
				COALESCE(ledger."firstCreatedAt" - INTERVAL '1 millisecond', CURRENT_TIMESTAMP) AS "createdAt"
			FROM "user_profile" p
			LEFT JOIN (
				SELECT "userId", SUM("amount") AS "amount", MIN("createdAt") AS "firstCreatedAt"
				FROM "wallet_transaction"
				WHERE "currency" = 'points' AND "type" <> 'pointsOpeningBalance'
				GROUP BY "userId"
			) ledger ON ledger."userId" = p."userId"
			WHERE NOT EXISTS (
				SELECT 1 FROM "wallet_transaction" t
				WHERE t."userId" = p."userId" AND t."currency" = 'points' AND t."type" = 'pointsOpeningBalance'
					AND t."id" = '0000' || substr(md5('points-opening:' || p."userId"), 1, 28)
			)
		`;
		// 校验和写入保持原子性，并阻止余额在两次汇总之间被修改。
		await queryRunner.query(`
			DO $$
			DECLARE invalid_user varchar(32);
			BEGIN
				LOCK TABLE "user_profile", "wallet_transaction" IN SHARE ROW EXCLUSIVE MODE;
				SELECT opening."userId" INTO invalid_user
				FROM (${openingBalances}) opening
				WHERE opening."amount" < 0 OR opening."amount" > 2000000000
				LIMIT 1;
				IF invalid_user IS NOT NULL THEN
					RAISE EXCEPTION 'Invalid points opening balance for user %: historical ledger does not match the current balance.', invalid_user;
				END IF;

				INSERT INTO "wallet_transaction"
					("id", "userId", "createdAt", "type", "currency", "amount", "balance", "reservedAmount", "reservedBalance", "description", "relatedId", "requestId", "pointsSpent", "actorId")
				SELECT opening."id", opening."userId", opening."createdAt", 'pointsOpeningBalance', 'points',
					opening."amount", opening."amount", 0, 0, NULL, NULL, NULL, NULL, NULL
				FROM (${openingBalances}) opening
				WHERE opening."amount" > 0;
			END;
			$$;
		`);
	}

	async down(queryRunner) {
		await queryRunner.query(`
			DELETE FROM "wallet_transaction" t
			WHERE t."type" = 'pointsOpeningBalance'
				AND t."currency" = 'points'
				AND t."id" = '0000' || substr(md5('points-opening:' || t."userId"), 1, 28)
		`);
	}
}
