/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Module } from '@nestjs/common';
import { IdModule } from '@/core/IdModule.js';
import { WalletService } from '@/core/WalletService.js';

@Module({ imports: [IdModule], providers: [WalletService], exports: [WalletService] })
export class WalletModule {}
