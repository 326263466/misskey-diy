/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { ModerationLogsRepository } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import { IdService } from '@/core/IdService.js';
import { bindThis } from '@/decorators.js';
import type { ModerationLogPayloads } from '@/types.js';
import { moderationLogTypes } from '@/types.js';
import { MiModerationLog } from '@/models/ModerationLog.js';

@Injectable()
export class ModerationLogService {
	constructor(
		@Inject(DI.moderationLogsRepository)
		private moderationLogsRepository: ModerationLogsRepository,

		private idService: IdService,
	) {
	}

	@bindThis
	public async log<T extends typeof moderationLogTypes[number]>(moderator: { id: MiUser['id'] }, type: T, info?: ModerationLogPayloads[T], transaction?: EntityManager, logId?: string) {
		const repository = transaction?.getRepository(MiModerationLog) ?? this.moderationLogsRepository;
		await repository.insert({
			id: logId ?? this.idService.gen(),
			userId: moderator.id,
			type: type,
			info: (info as any) ?? {},
		});
	}
}
