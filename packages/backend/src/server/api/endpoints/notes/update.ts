/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import ms from 'ms';
import * as mfm from 'mfm-js';
import { In } from 'typeorm';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { GetterService } from '@/server/api/GetterService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { NoteCreateService } from '@/core/NoteCreateService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { SearchService } from '@/core/SearchService.js';
import { HashtagService } from '@/core/HashtagService.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { ApDeliverManagerService } from '@/core/activitypub/ApDeliverManagerService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { RelayService } from '@/core/RelayService.js';
import { ApiLoggerService } from '@/server/api/ApiLoggerService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { extractCustomEmojisFromMfm } from '@/misc/extract-custom-emojis-from-mfm.js';
import { extractHashtags } from '@/misc/extract-hashtags.js';
import { normalizeForSearch } from '@/misc/normalize-for-search.js';
import { MAX_NOTE_TEXT_LENGTH } from '@/const.js';
import { DI } from '@/di-symbols.js';
import type { NotesRepository, PollsRepository, UsersRepository } from '@/models/_.js';
import type { MiNote } from '@/models/Note.js';
import type { MiLocalUser } from '@/models/User.js';
import type { MiMeta } from '@/models/Meta.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['notes'],
	requireCredential: true,
	kind: 'write:notes',
	prohibitMoved: true,
	limit: {
		duration: ms('1hour'),
		max: 300,
	},
	errors: {
		noSuchNote: {
			message: 'No such note.',
			code: 'NO_SUCH_NOTE',
			id: 'd9b4369d-cbb1-4da2-8b02-3728fd99d3a5',
		},
		accessDenied: {
			message: 'Only your local replies can be edited.',
			code: 'ACCESS_DENIED',
			id: '568dfab3-54bb-4b20-8c35-0b943b274acf',
		},
		containsProhibitedWords: {
			message: 'Cannot update because it contains prohibited words.',
			code: 'CONTAINS_PROHIBITED_WORDS',
			id: '82d5f473-77a0-4cd0-af6b-6d82a6e6f6ec',
		},
		editConflict: {
			message: 'The reply has changed or been deleted. Refresh it before editing again.',
			code: 'EDIT_CONFLICT',
			id: 'eed00a41-d651-43a7-91c2-364163e0f321',
		},
		containsSensitiveWords: {
			message: 'This edit contains words that cannot be published with the reply\'s current visibility.',
			code: 'CONTAINS_SENSITIVE_WORDS',
			id: '24bf05cc-502e-427c-9c1d-eccd54d64d4c',
		},
	},
	res: {
		type: 'object',
		optional: false,
		nullable: false,
		ref: 'Note',
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		noteId: { type: 'string', format: 'misskey:id' },
		text: {
			type: 'string',
			minLength: 1,
			maxLength: MAX_NOTE_TEXT_LENGTH,
			pattern: '[^\\s]+',
		},
		cw: { type: 'string', nullable: true, minLength: 1, maxLength: 100 },
	},
	required: ['noteId', 'text'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.pollsRepository)
		private pollsRepository: PollsRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.meta)
		private serverSettings: MiMeta,

		private getterService: GetterService,
		private noteCreateService: NoteCreateService,
		private noteEntityService: NoteEntityService,
		private globalEventService: GlobalEventService,
		private searchService: SearchService,
		private hashtagService: HashtagService,
		private apRendererService: ApRendererService,
		private apDeliverManagerService: ApDeliverManagerService,
		private userEntityService: UserEntityService,
		private relayService: RelayService,
		private apiLoggerService: ApiLoggerService,
		private utilityService: UtilityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const note = await this.getterService.getNote(ps.noteId).catch(err => {
				if (err.id === '9725d0ce-ba28-4dde-95a7-2cbb2c15de24') throw new ApiError(meta.errors.noSuchNote);
				throw err;
			});

			if (note.userId !== me.id || note.userHost !== null || note.replyId === null) {
				throw new ApiError(meta.errors.accessDenied);
			}

			const text = ps.text.trim();
			const cw = ps.cw === undefined ? note.cw : ps.cw;
			if (this.noteCreateService.checkProhibitedWordsContain({ text, cw })) {
				throw new ApiError(meta.errors.containsProhibitedWords);
			}
			if (note.visibility === 'public' && note.channelId == null && this.utilityService.isKeyWordIncluded(cw ?? text, this.serverSettings.sensitiveWords)) {
				throw new ApiError(meta.errors.containsSensitiveWords);
			}

			const poll = note.hasPoll ? await this.pollsRepository.findOneByOrFail({ noteId: note.id }) : null;
			const tokens = mfm.parse(text).concat(cw ? mfm.parse(cw) : [], poll?.choices.flatMap(choice => mfm.parse(choice)) ?? []);
			const tags = extractHashtags(tokens).filter(tag => Array.from(tag).length <= 128).slice(0, 32).map(normalizeForSearch);
			const emojis = extractCustomEmojisFromMfm(tokens);
			const values: { text: string; cw?: string | null; tags: string[]; emojis: string[] } = {
				text,
				tags,
				emojis,
			};
			if (ps.cw !== undefined) values.cw = cw;

			// Match the original content as well, so concurrent edits cannot leave
			// text, content warnings and their derived metadata out of sync.
			const editedAt = new Date().toISOString();
			const result = await this.notesRepository.createQueryBuilder().update().set(values)
				.where('"id" = :id AND "userId" = :userId AND "userHost" IS NULL AND "replyId" IS NOT NULL', {
					id: note.id,
					userId: me.id,
				})
				.andWhere('"text" IS NOT DISTINCT FROM :previousText AND "cw" IS NOT DISTINCT FROM :previousCw', {
					previousText: note.text,
					previousCw: note.cw,
				})
				.returning('*')
				.execute();
			if (result.affected !== 1) throw new ApiError(meta.errors.editConflict);

			const updated = this.notesRepository.create(result.raw[0] as MiNote);
			this.globalEventService.publishNoteStream(updated, 'updated', { cw: updated.cw, text });

			// Side-effect failures must not make a successfully saved edit look unsaved.
			await this.searchService.indexNote(updated).catch(err => {
				this.apiLoggerService.logger.error('Failed to index edited reply', { noteId: note.id, err });
			});
			if (['public', 'home'].includes(updated.visibility)) {
				await this.hashtagService.updateHashtags(me, tags.filter(tag => !note.tags.includes(tag))).catch(err => {
					this.apiLoggerService.logger.error('Failed to update edited reply hashtags', { noteId: note.id, err });
				});
			}
			if (!updated.localOnly) {
				await this.deliverUpdate(updated, me, editedAt).catch(err => {
					this.apiLoggerService.logger.error('Failed to deliver edited reply', { noteId: note.id, err });
				});
			}

			return await this.noteEntityService.pack(updated, me, { detail: true });
		});
	}

	private async deliverUpdate(note: MiNote, me: MiLocalUser, editedAt: string): Promise<void> {
		const object = { ...await this.apRendererService.renderNote(note, false), updated: editedAt };
		const update = this.apRendererService.renderUpdate(object, me);
		const activity = this.apRendererService.addContext({
			...update,
			id: `${update.id}/${randomUUID()}`,
			to: object.to,
			cc: object.cc,
		});
		const dm = this.apDeliverManagerService.createDeliverManager(me, activity);
		const recipientIds = Array.from(new Set([...note.mentions, note.replyUserId, note.renoteUserId].filter(id => id != null)));
		const recipients = recipientIds.length > 0 ? await this.usersRepository.findBy({ id: In(recipientIds) }) : [];
		for (const recipient of recipients) {
			if (this.userEntityService.isRemoteUser(recipient)) dm.addDirectRecipe(recipient);
		}
		if (['public', 'home', 'followers'].includes(note.visibility)) dm.addFollowersRecipe();
		await dm.execute();
		if (note.visibility === 'public') await this.relayService.deliverToRelays(me, activity);
	}
}
