/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class IndependentCommerce1791695979943 {
	name = 'IndependentCommerce1791695979943';

	async up(queryRunner) {
		await queryRunner.query(`CREATE TABLE "product" (
			"id" character varying(64) NOT NULL,
			"sellerId" character varying(32),
			"createRequestId" uuid,
			"createFingerprint" character varying(64),
			"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
			"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
			"version" character varying(64) NOT NULL,
			"name" character varying(40) NOT NULL,
			"description" character varying(200) NOT NULL,
			"type" character varying(16) NOT NULL,
			"category" character varying(20) NOT NULL,
			"imageUrl" character varying(2048) NOT NULL,
			"unit" character varying(8) NOT NULL,
			"price" integer NOT NULL,
			"perUserLimit" integer NOT NULL DEFAULT 0,
			"stockLimit" integer NOT NULL DEFAULT 0,
			"soldCount" bigint NOT NULL DEFAULT 0,
			"deliveryText" character varying(2000) NOT NULL,
			"enabled" boolean NOT NULL DEFAULT true,
			CONSTRAINT "PK_product" PRIMARY KEY ("id"),
			CONSTRAINT "CHK_product_price" CHECK ("price" >= 1 AND "price" <= 1000000),
			CONSTRAINT "CHK_product_limits" CHECK ("perUserLimit" >= 0 AND "perUserLimit" <= 1000000 AND "stockLimit" >= 0 AND "stockLimit" <= 1000000 AND "soldCount" >= 0 AND "soldCount" <= 9007199254740991),
			CONSTRAINT "CHK_product_type" CHECK ("type" IN ('physical', 'virtual'))
		)`);
		await queryRunner.query(`CREATE INDEX "IDX_product_seller_id" ON "product" ("sellerId", "id")`);
		await queryRunner.query(`CREATE INDEX "IDX_product_enabled_created_id" ON "product" ("enabled", "createdAt", "id")`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_product_create_request" ON "product" ("sellerId", "createRequestId")`);
		await queryRunner.query(`ALTER TABLE "product" ADD CONSTRAINT "FK_product_seller" FOREIGN KEY ("sellerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);

		await queryRunner.query(`CREATE SEQUENCE "order_number_seq" AS bigint START WITH 1000000000000000000 MINVALUE 1000000000000000000 MAXVALUE 9223372036854775807 NO CYCLE`);
		await queryRunner.query(`CREATE TABLE "order" (
			"id" character varying(19) NOT NULL,
			"buyerId" character varying(32) NOT NULL,
			"sellerId" character varying(32),
			"productId" character varying(64) NOT NULL,
			"requestId" uuid,
			"transactionId" character varying(32),
			"sellerTransactionId" character varying(32),
			"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
			"quantity" integer NOT NULL,
			"total" integer NOT NULL,
			"receipt" jsonb NOT NULL,
			"redemptionCode" character varying(20),
			CONSTRAINT "PK_order" PRIMARY KEY ("id"),
			CONSTRAINT "CHK_order_number" CHECK ("id" ~ '^[0-9]{19}$'),
			CONSTRAINT "CHK_order_amount" CHECK ("quantity" >= 1 AND "quantity" <= 1000000 AND "total" >= 1 AND "total" <= 2000000000),
			CONSTRAINT "CHK_order_redemption_code" CHECK ("redemptionCode" IS NULL OR "redemptionCode" ~ '^[0-9A-Z]{20}$')
		)`);
		await queryRunner.query(`CREATE INDEX "IDX_order_buyer_id" ON "order" ("buyerId", "id")`);
		await queryRunner.query(`CREATE INDEX "IDX_order_seller_id" ON "order" ("sellerId", "id")`);
		await queryRunner.query(`CREATE INDEX "IDX_order_product_buyer" ON "order" ("productId", "buyerId")`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_order_request" ON "order" ("buyerId", "requestId")`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_order_transaction" ON "order" ("transactionId")`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_order_seller_transaction" ON "order" ("sellerTransactionId")`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_order_redemption_code" ON "order" ("redemptionCode")`);

		const [site] = await queryRunner.query(`SELECT "shopProducts", "shopSoldCounts", "rootUserId" FROM "meta" ORDER BY "id" DESC LIMIT 1`);
		const [publisher] = await queryRunner.query(`SELECT u."id" FROM "user" u
			WHERE u."host" IS NULL AND u."isSuspended" = false AND u."isDeleted" = false AND u."movedToUri" IS NULL AND u."username" NOT LIKE '%.%'
			AND (u."id" = $1 OR EXISTS (
				SELECT 1 FROM "role_assignment" a INNER JOIN "role" r ON r."id" = a."roleId"
				WHERE a."userId" = u."id" AND r."isAdministrator" = true AND (a."expiresAt" IS NULL OR a."expiresAt" > CURRENT_TIMESTAMP)
			))
			ORDER BY CASE WHEN u."id" = $1 THEN 0 ELSE 1 END, u."id" LIMIT 1`, [site?.rootUserId ?? null]);
		const sales = await queryRunner.query(`SELECT "relatedId", SUM("shopQuantity") AS "quantity" FROM "wallet_transaction" WHERE "type" = 'shopPurchase' GROUP BY "relatedId"`);
		const totals = new Map(sales.map(row => [row.relatedId, Number(row.quantity)]));
		const now = new Date();
		for (const product of site?.shopProducts ?? []) {
			const configuredCount = Object.hasOwn(site.shopSoldCounts ?? {}, product.id) ? Number(site.shopSoldCounts[product.id]) : 0;
			const soldCount = Math.max(configuredCount, totals.get(product.id) ?? 0);
			if (!Number.isSafeInteger(soldCount) || soldCount < 0) throw new Error('Cannot migrate an invalid marketplace inventory count.');
			// 旧补签卡仅保留商品资料并下架；集市不再执行签到发卡。
			const deliveryText = product.deliveryType === 'makeup-card' ? '' : product.deliveryText ?? '';
			const enabled = !!publisher && product.enabled && product.deliveryType !== 'makeup-card' && deliveryText.trim().length > 0;
			await queryRunner.query(`INSERT INTO "product" ("id", "sellerId", "createRequestId", "createFingerprint", "createdAt", "updatedAt", "version", "name", "description", "type", "category", "imageUrl", "unit", "price", "perUserLimit", "stockLimit", "soldCount", "deliveryText", "enabled")
				VALUES ($1, $2, NULL, NULL, $3, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`, [
				product.id, publisher?.id ?? null, now, product.version ?? 'initial', product.name, product.description ?? '',
				product.type === 'physical' ? 'physical' : 'virtual', product.category ?? '', product.imageUrl ?? '', product.unit ?? '件',
				product.price, product.perUserLimit ?? 0, product.stockLimit ?? 0, soldCount, deliveryText, enabled,
			]);
		}

		const [invalid] = await queryRunner.query(`SELECT EXISTS (
			SELECT 1 FROM "wallet_transaction" WHERE "type" = 'shopPurchase' AND (
				"shopQuantity" IS NULL OR "shopQuantity" < 1 OR "shopQuantity" > 1000000 OR
				COALESCE("pointsSpent", -"amount") < 1 OR COALESCE("pointsSpent", -"amount") > 2000000000 OR
				COALESCE("pointsSpent", -"amount") <> TRUNC(COALESCE("pointsSpent", -"amount"))
			)
		) AS "found"`);
		if (invalid.found) throw new Error('Cannot migrate invalid marketplace purchase quantities or totals.');
		await queryRunner.query(`INSERT INTO "order" ("id", "buyerId", "sellerId", "productId", "requestId", "transactionId", "sellerTransactionId", "createdAt", "quantity", "total", "receipt", "redemptionCode")
			SELECT nextval('order_number_seq')::text, t."userId", COALESCE(p."sellerId", $1), COALESCE(t."relatedId", ''), t."requestId", t."id", NULL, t."createdAt", t."shopQuantity", COALESCE(t."pointsSpent", -t."amount")::integer,
				jsonb_build_object(
					'name', COALESCE(t."shopReceipt"->>'name', t."description", ''),
					'type', CASE WHEN t."shopReceipt"->>'type' = 'physical' THEN 'physical' ELSE 'virtual' END,
					'unit', COALESCE(t."shopReceipt"->>'unit', ''),
					'deliveryText', CASE WHEN t."shopReceipt"->>'deliveryType' = 'makeup-card' THEN '此订单已在购买时完成交付。' ELSE COALESCE(t."shopReceipt"->>'deliveryText', '') END,
					'version', COALESCE(t."shopReceipt"->>'version', 'initial')
				), NULL
			FROM "wallet_transaction" t LEFT JOIN "product" p ON p."id" = t."relatedId"
			WHERE t."type" = 'shopPurchase' ORDER BY t."createdAt", t."id"`, [publisher?.id ?? null]);
		// 钱包只保留支付记录及订单引用，订单内容不再重复存入账本。
		await queryRunner.query(`UPDATE "wallet_transaction" t SET "type" = 'orderPayment', "relatedId" = o."id" FROM "order" o WHERE o."transactionId" = t."id"`);
		await queryRunner.query(`DROP INDEX "IDX_wallet_transaction_shop_product_user"`);
		await queryRunner.query(`ALTER TABLE "wallet_transaction" DROP COLUMN "shopQuantity", DROP COLUMN "shopReceipt"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "shopProducts", DROP COLUMN "shopSoldCounts"`);
	}

	async down(queryRunner) {
		// 旧结构无法还原发布人和独立交付规则；存在任何业务数据时拒绝有损回滚。
		const [state] = await queryRunner.query(`SELECT
			EXISTS (SELECT 1 FROM "product") OR
			EXISTS (SELECT 1 FROM "order") AS "hasData"`);
		if (state.hasData) throw new Error('Cannot revert the independent marketplace while products or orders exist.');
		await queryRunner.query(`ALTER TABLE "meta" ADD "shopProducts" jsonb NOT NULL DEFAULT '[]', ADD "shopSoldCounts" jsonb NOT NULL DEFAULT '{}'`);
		await queryRunner.query(`ALTER TABLE "wallet_transaction" ADD "shopQuantity" integer, ADD "shopReceipt" jsonb`);
		await queryRunner.query(`CREATE INDEX "IDX_wallet_transaction_shop_product_user" ON "wallet_transaction" ("type", "relatedId", "userId")`);
		await queryRunner.query(`DROP TABLE "order"`);
		await queryRunner.query(`DROP TABLE "product"`);
		await queryRunner.query(`DROP SEQUENCE "order_number_seq"`);
	}
}
