/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class IsolatedProductImages1792121187306 {
	name = 'IsolatedProductImages1792121187306';

	async up(queryRunner) {
		await queryRunner.query(`CREATE TABLE "product_image" (
			"id" character varying(32) NOT NULL,
			"userId" character varying(32),
			"productId" character varying(64),
			"createdAt" timestamp with time zone NOT NULL,
			"expiresAt" timestamp with time zone,
			"deletingAt" timestamp with time zone,
			"ready" boolean NOT NULL DEFAULT false,
			"storedInternal" boolean NOT NULL,
			"storageKey" character varying(1024) NOT NULL,
			"url" character varying(2048) NOT NULL,
			"type" character varying(32) NOT NULL,
			"size" integer NOT NULL,
			CONSTRAINT "PK_product_image" PRIMARY KEY ("id"),
			CONSTRAINT "CHK_product_image_size" CHECK ("size" >= 1 AND "size" <= 10485760),
			CONSTRAINT "FK_product_image_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
			CONSTRAINT "FK_product_image_product" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE SET NULL ON UPDATE NO ACTION
		)`);
		await queryRunner.query(`CREATE INDEX "IDX_product_image_user" ON "product_image" ("userId")`);
		await queryRunner.query(`CREATE INDEX "IDX_product_image_cleanup" ON "product_image" ("expiresAt")`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_product_image_url" ON "product_image" ("url")`);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP TABLE "product_image"`);
	}
}
