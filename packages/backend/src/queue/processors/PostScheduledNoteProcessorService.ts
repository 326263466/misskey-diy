/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { NoteDraftsRepository } from '@/models/_.js';
import type Logger from '@/logger.js';
import { NotificationService } from '@/core/NotificationService.js';
import { bindThis } from '@/decorators.js';
import { NoteCreateService } from '@/core/NoteCreateService.js';
import { NoteDraftService } from '@/core/NoteDraftService.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';
import type { PostScheduledNoteJobData } from '../types.js';

@Injectable()
export class PostScheduledNoteProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.noteDraftsRepository)
		private noteDraftsRepository: NoteDraftsRepository,

		private noteCreateService: NoteCreateService,
		private notificationService: NotificationService,
		private queueLoggerService: QueueLoggerService,
		private noteDraftService: NoteDraftService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('post-scheduled-note');
	}

	@bindThis
	public async process(job: Bull.Job<PostScheduledNoteJobData>): Promise<void> {
		const draft = await this.noteDraftsRepository.findOne({
			where: { id: job.data.noteDraftId },
			relations: { user: true },
		});
		if (draft == null || draft.user == null || draft.scheduledAt == null || !draft.isActuallyScheduled) {
			return;
		}

		try {
			const note = await this.noteCreateService.fetchAndCreate(draft.user, {
				createdAt: new Date(),
				fileIds: draft.fileIds,
				poll: draft.hasPoll ? {
					choices: draft.pollChoices,
					multiple: draft.pollMultiple,
					expiresAt: draft.pollExpiredAfter ? new Date(Date.now() + draft.pollExpiredAfter) : draft.pollExpiresAt ? new Date(draft.pollExpiresAt) : null,
				} : null,
				text: draft.text ?? null,
				replyId: draft.replyId,
				publishReply: draft.replyId != null ? await this.noteDraftService.getPublication(draft) : undefined,
				renoteId: draft.renoteId,
				cw: draft.cw,
				localOnly: draft.localOnly,
				reactionAcceptance: draft.reactionAcceptance,
				visibility: draft.visibility,
				visibleUserIds: draft.visibleUserIds,
				channelId: draft.channelId,
			});

			// await不要
			this.noteDraftsRepository.remove(draft);
			void this.noteDraftService.clearPublication(draft).catch(error => this.logger.error('Failed to clear reply publication preference', { error }));

			// await不要
			this.notificationService.createNotification(draft.userId, 'scheduledNotePosted', {
				noteId: note.id,
			});
		} catch (_) {
			this.notificationService.createNotification(draft.userId, 'scheduledNotePostFailed', {
				noteDraftId: draft.id,
			});
		}
	}
}
