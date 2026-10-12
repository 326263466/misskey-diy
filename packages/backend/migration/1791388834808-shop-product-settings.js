/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ShopProductSettings1791388834808 {
    name = 'ShopProductSettings1791388834808';

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "shopProducts" jsonb NOT NULL DEFAULT '[{"id":"checkin-makeup-card","name":"补签卡","description":"用于补签缺失的签到日期。","price":60,"enabled":true}]'`);
        await queryRunner.query(`ALTER TABLE "wallet_transaction" ADD "shopQuantity" integer`);
        await queryRunner.query(`UPDATE "wallet_transaction" SET "shopQuantity" = "pointsSpent" / 60 WHERE "type" = 'shopPurchase' AND "relatedId" = 'checkin-makeup-card' AND "pointsSpent" > 0 AND "pointsSpent" % 60 = 0`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "wallet_transaction" DROP COLUMN "shopQuantity"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "shopProducts"`);
    }
}
