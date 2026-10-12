/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Module } from '@nestjs/common';
import { WalletModule } from '@/core/wallet/WalletModule.js';
import { PaymentService } from '@/core/payment/PaymentService.js';

@Module({ imports: [WalletModule], providers: [PaymentService], exports: [PaymentService] })
export class PaymentModule {}
