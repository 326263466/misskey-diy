/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Module } from '@nestjs/common';
import { CatalogService } from '@/core/shop/CatalogService.js';
import { CheckoutService } from '@/core/shop/CheckoutService.js';
import { OrderModule } from '@/core/order/OrderModule.js';
import { PaymentModule } from '@/core/payment/PaymentModule.js';
import { ProductModule } from '@/core/product/ProductModule.js';

@Module({
	imports: [ProductModule, OrderModule, PaymentModule],
	providers: [CatalogService, CheckoutService],
	exports: [ProductModule, OrderModule, PaymentModule, CatalogService, CheckoutService],
})
export class ShopModule {}
