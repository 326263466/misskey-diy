/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Module } from '@nestjs/common';
import { IdService } from './IdService.js';

@Module({ providers: [IdService], exports: [IdService] })
export class IdModule {}
