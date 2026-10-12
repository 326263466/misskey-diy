/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const MAX_BALANCE = 2000000000;
const MARKER_PREFIX = '0001';

export class WalletPointsUnification1791317993237 {
	name = 'WalletPointsUnification1791317993237';

	async up(queryRunner) {
		await queryRunner.query('DO $$ BEGIN LOCK TABLE "user_profile", "wallet", "wallet_transaction" IN SHARE ROW EXCLUSIVE MODE; END $$;');
		await queryRunner.query('ALTER TABLE "wallet_transaction" DROP CONSTRAINT "CHK_wallet_transaction_amount"');
		await queryRunner.query('ALTER TABLE "wallet_transaction" DROP CONSTRAINT "CHK_wallet_transaction_balance"');
		await queryRunner.query('ALTER TABLE "wallet_transaction" ADD CONSTRAINT "CHK_wallet_transaction_amount" CHECK (("amount" <> 0 OR "reservedAmount" <> 0) AND "amount" >= -2000000000 AND "amount" <= 2000000000 AND "reservedAmount" >= -2000000000 AND "reservedAmount" <= 2000000000)');
		await queryRunner.query('ALTER TABLE "wallet_transaction" ADD CONSTRAINT "CHK_wallet_transaction_balance" CHECK ("balance" >= 0 AND "balance" <= 2000000000 AND "reservedBalance" >= 0 AND "reservedBalance" <= 2000000000 AND "balance" + "reservedBalance" <= 2000000000)');

		const invalid = await queryRunner.query(`
			SELECT p."userId"
			FROM "user_profile" p
			LEFT JOIN "wallet" w ON w."userId" = p."userId"
			WHERE p."checkinPoints" < 0
				OR p."checkinPoints" > ${MAX_BALANCE}
				OR (COALESCE(w."balance", 0) + p."checkinPoints" + COALESCE(w."reservedBalance", 0) > ${MAX_BALANCE}
					AND NOT EXISTS (
						SELECT 1 FROM "wallet_transaction" t
						WHERE t."userId" = p."userId" AND t."type" = 'pointsUnification'
							AND t."id" = '${MARKER_PREFIX}' || substr(md5('wallet-points-unification:' || p."userId"), 1, 28)
					))
			LIMIT 1
		`);
		if (invalid.length > 0) throw new Error(`Invalid points balance for user ${invalid[0].userId}: cannot merge into wallet.`);

		// Create wallets only where the legacy points account has a non-zero balance.
		await queryRunner.query(`
			INSERT INTO "wallet" ("userId", "balance", "reservedBalance")
			SELECT p."userId", 0, 0
			FROM "user_profile" p
			WHERE p."checkinPoints" > 0
				AND NOT EXISTS (SELECT 1 FROM "wallet" w WHERE w."userId" = p."userId")
				AND NOT EXISTS (
					SELECT 1 FROM "wallet_transaction" t
					WHERE t."userId" = p."userId" AND t."type" = 'pointsUnification'
						AND t."id" = '${MARKER_PREFIX}' || substr(md5('wallet-points-unification:' || p."userId"), 1, 28)
				)
		`);
		await queryRunner.query(`
			UPDATE "wallet" w
			SET "balance" = w."balance" + p."checkinPoints"
			FROM "user_profile" p
			WHERE w."userId" = p."userId"
				AND p."checkinPoints" <> 0
				AND NOT EXISTS (
					SELECT 1 FROM "wallet_transaction" t
					WHERE t."userId" = p."userId" AND t."type" = 'pointsUnification'
						AND t."id" = '${MARKER_PREFIX}' || substr(md5('wallet-points-unification:' || p."userId"), 1, 28)
				)
		`);
		await queryRunner.query(`
			INSERT INTO "wallet_transaction"
				("id", "userId", "createdAt", "type", "currency", "amount", "balance", "reservedAmount", "reservedBalance", "description", "relatedId", "requestId", "pointsSpent", "actorId")
			SELECT '${MARKER_PREFIX}' || substr(md5('wallet-points-unification:' || p."userId"), 1, 28),
				p."userId", CURRENT_TIMESTAMP, 'pointsUnification', 'points', p."checkinPoints",
				w."balance", 0, w."reservedBalance", 'Merged legacy check-in points into the points wallet', NULL, NULL, NULL, NULL
			FROM "user_profile" p
			JOIN "wallet" w ON w."userId" = p."userId"
			WHERE p."checkinPoints" > 0
				AND NOT EXISTS (
					SELECT 1 FROM "wallet_transaction" t
					WHERE t."userId" = p."userId" AND t."type" = 'pointsUnification'
						AND t."id" = '${MARKER_PREFIX}' || substr(md5('wallet-points-unification:' || p."userId"), 1, 28)
				)
		`);
		await queryRunner.query(`
			UPDATE "user_profile" p
			SET "checkinPoints" = 0
			WHERE p."checkinPoints" > 0
				AND EXISTS (
					SELECT 1 FROM "wallet_transaction" t
					WHERE t."userId" = p."userId" AND t."type" = 'pointsUnification'
						AND t."id" = '${MARKER_PREFIX}' || substr(md5('wallet-points-unification:' || p."userId"), 1, 28)
				)
		`);
	}

	async down(queryRunner) {
		await queryRunner.query('DO $$ BEGIN LOCK TABLE "user_profile", "wallet", "wallet_transaction" IN SHARE ROW EXCLUSIVE MODE; END $$;');
		const markers = await queryRunner.query(`
			SELECT t."id", t."userId", t."createdAt", t."amount", t."balance", t."reservedBalance", w."balance" AS "currentBalance", w."reservedBalance" AS "currentReservedBalance"
			FROM "wallet_transaction" t
			JOIN "wallet" w ON w."userId" = t."userId"
			WHERE t."type" = 'pointsUnification' AND t."currency" = 'points'
				AND t."id" = '${MARKER_PREFIX}' || substr(md5('wallet-points-unification:' || t."userId"), 1, 28)
		`);
		for (const marker of markers) {
			if (Number(marker.currentBalance) !== Number(marker.balance) || Number(marker.currentReservedBalance) !== Number(marker.reservedBalance)) {
				throw new Error(`Cannot revert points unification for user ${marker.userId}: wallet changed after migration.`);
			}
			const later = await queryRunner.query(`
				SELECT 1 FROM "wallet_transaction"
				WHERE "userId" = $1 AND "id" <> $2
					AND ("createdAt" > $3 OR "createdAt" = $3)
				LIMIT 1
			`, [marker.userId, marker.id, marker.createdAt]);
			if (later.length > 0) throw new Error(`Cannot revert points unification for user ${marker.userId}: later wallet activity exists.`);
		}
		for (const marker of markers) {
			await queryRunner.query('UPDATE "user_profile" SET "checkinPoints" = "checkinPoints" + ($1::numeric)::integer WHERE "userId" = $2', [marker.amount, marker.userId]);
			await queryRunner.query('UPDATE "wallet" SET "balance" = "balance" - $1 WHERE "userId" = $2', [marker.amount, marker.userId]);
			const walletRows = await queryRunner.query(`
				SELECT w."balance", w."reservedBalance",
					(SELECT COUNT(*)::integer FROM "wallet_transaction" t WHERE t."userId" = $1 AND t."id" <> $2) AS "activityCount"
				FROM "wallet" w WHERE w."userId" = $1
			`, [marker.userId, marker.id]);
			if (walletRows.length === 1 && Number(walletRows[0].balance) === 0 && Number(walletRows[0].reservedBalance) === 0 && Number(walletRows[0].activityCount) === 0) {
				await queryRunner.query('DELETE FROM "wallet" WHERE "userId" = $1', [marker.userId]);
			}
		}
		await queryRunner.query(`DELETE FROM "wallet_transaction"
			WHERE "type" = 'pointsUnification' AND "currency" = 'points'
				AND "id" = '${MARKER_PREFIX}' || substr(md5('wallet-points-unification:' || "userId"), 1, 28)`);
		await queryRunner.query('ALTER TABLE "wallet_transaction" DROP CONSTRAINT "CHK_wallet_transaction_amount"');
		await queryRunner.query('ALTER TABLE "wallet_transaction" DROP CONSTRAINT "CHK_wallet_transaction_balance"');
		await queryRunner.query('ALTER TABLE "wallet_transaction" ADD CONSTRAINT "CHK_wallet_transaction_amount" CHECK (("amount" <> 0 OR "reservedAmount" <> 0) AND "amount" >= -2000000000 AND "amount" <= 2000000000 AND "reservedAmount" >= -2000000000 AND "reservedAmount" <= 2000000000 AND ("currency" = \'coins\' OR ("currency" = \'points\' AND "amount" = trunc("amount") AND "reservedAmount" = 0)))');
		await queryRunner.query('ALTER TABLE "wallet_transaction" ADD CONSTRAINT "CHK_wallet_transaction_balance" CHECK ("balance" >= 0 AND "balance" <= 2000000000 AND "reservedBalance" >= 0 AND "reservedBalance" <= 2000000000 AND ("currency" = \'points\' OR "balance" + "reservedBalance" <= 2000000000) AND ("currency" = \'coins\' OR ("balance" = trunc("balance") AND "reservedBalance" = 0)))');
	}
}
