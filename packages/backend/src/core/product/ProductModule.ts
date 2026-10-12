/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Module } from '@nestjs/common';
import { ProductService } from '@/core/product/ProductService.js';

@Module({ providers: [ProductService], exports: [ProductService] })
export class ProductModule {}
