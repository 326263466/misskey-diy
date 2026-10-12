/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Module } from '@nestjs/common';
import { OrderService } from '@/core/order/OrderService.js';

@Module({ providers: [OrderService], exports: [OrderService] })
export class OrderModule {}
