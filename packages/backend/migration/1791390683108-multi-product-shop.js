/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class MultiProductShop1791390683108 {
    name = 'MultiProductShop1791390683108';

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "shopProducts" SET DEFAULT '[]'`);
        // 清除上一版自动预置且未修改的商品，保留管理员修改过的配置。
        await queryRunner.query(`UPDATE "meta" SET "shopProducts" = COALESCE((SELECT jsonb_agg(p || '{"type":"makeup-card","category":"","imageUrl":"","unit":"张","perOrderLimit":10,"perUserLimit":0,"stockLimit":0,"deliveryText":"","version":"initial"}'::jsonb) FROM jsonb_array_elements("shopProducts") p WHERE p <> '{"id":"checkin-makeup-card","name":"补签卡","description":"用于补签缺失的签到日期。","price":60,"enabled":true}'::jsonb), '[]'::jsonb)`);
        await queryRunner.query(`ALTER TABLE "wallet_transaction" ADD "shopReceipt" jsonb`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "shopSoldCounts" jsonb NOT NULL DEFAULT '{}'`);
		await queryRunner.query(`UPDATE "meta" SET "shopSoldCounts" = COALESCE((SELECT jsonb_object_agg("productId", "total") FROM (SELECT "relatedId" AS "productId", SUM("shopQuantity") AS "total" FROM "wallet_transaction" WHERE "type" = 'shopPurchase' AND "relatedId" IS NOT NULL GROUP BY "relatedId") sales), '{}'::jsonb)`);
        await queryRunner.query(`UPDATE "wallet_transaction" SET "shopReceipt" = jsonb_build_object('name', COALESCE(REPLACE("description", '商城兑换：', ''), '补签卡'), 'type', 'makeup-card', 'unit', '张', 'deliveryText', '', 'version', 'initial') WHERE "type" = 'shopPurchase'`);
        await queryRunner.query(`CREATE INDEX "IDX_wallet_transaction_shop_product_user" ON "wallet_transaction" ("type", "relatedId", "userId")`);
    }

    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX "IDX_wallet_transaction_shop_product_user"`);
        await queryRunner.query(`ALTER TABLE "wallet_transaction" DROP COLUMN "shopReceipt"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "shopSoldCounts"`);
        await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "shopProducts" SET DEFAULT '[{"id":"checkin-makeup-card","name":"补签卡","description":"用于补签缺失的签到日期。","price":60,"enabled":true}]'`);
        // 保留新增商品配置，回滚不丢弃管理员录入的内容。
    }
}
