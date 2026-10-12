/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ShopProductTypes1791425093782 {
    name = 'ShopProductTypes1791425093782';

    async up(queryRunner) {
        await queryRunner.query(`UPDATE "meta" SET "shopProducts" = COALESCE((
            SELECT jsonb_agg(CASE WHEN p->>'type' IN ('makeup-card', 'digital-content')
                THEN p || jsonb_build_object('type', 'virtual', 'deliveryType', CASE WHEN p->>'type' = 'makeup-card' THEN 'makeup-card' ELSE 'instructions' END)
                ELSE p END ORDER BY position)
            FROM jsonb_array_elements("shopProducts") WITH ORDINALITY AS product(p, position)
        ), '[]'::jsonb)`);
        await queryRunner.query(`UPDATE "wallet_transaction" SET "shopReceipt" = "shopReceipt" || jsonb_build_object(
            'type', 'virtual', 'deliveryType', CASE WHEN "shopReceipt"->>'type' = 'makeup-card' THEN 'makeup-card' ELSE 'instructions' END
        ) WHERE "type" = 'shopPurchase' AND "shopReceipt"->>'type' IN ('makeup-card', 'digital-content')`);
    }

    async down(queryRunner) {
        // 旧版无法表示实物商品，阻止有损回滚，保留商品与订单信息。
        const [row] = await queryRunner.query(`SELECT
            EXISTS (SELECT 1 FROM "meta", jsonb_array_elements("shopProducts") p WHERE p->>'type' = 'physical') OR
            EXISTS (SELECT 1 FROM "wallet_transaction" WHERE "type" = 'shopPurchase' AND "shopReceipt"->>'type' = 'physical') AS "hasPhysical"`);
        if (row.hasPhysical) throw new Error('Cannot revert shop product types while physical products or orders exist.');
        await queryRunner.query(`UPDATE "meta" SET "shopProducts" = COALESCE((
            SELECT jsonb_agg(CASE WHEN p->>'type' = 'virtual'
                THEN (p - 'deliveryType') || jsonb_build_object('type', CASE WHEN p->>'deliveryType' = 'makeup-card' THEN 'makeup-card' ELSE 'digital-content' END)
                ELSE p END ORDER BY position)
            FROM jsonb_array_elements("shopProducts") WITH ORDINALITY AS product(p, position)
        ), '[]'::jsonb)`);
        await queryRunner.query(`UPDATE "wallet_transaction" SET "shopReceipt" = ("shopReceipt" - 'deliveryType') || jsonb_build_object(
            'type', CASE WHEN "shopReceipt"->>'deliveryType' = 'makeup-card' THEN 'makeup-card' ELSE 'digital-content' END
        ) WHERE "type" = 'shopPurchase' AND "shopReceipt"->>'type' = 'virtual'`);
    }
}
