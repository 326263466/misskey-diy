/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, Scope } from '@nestjs/common';
import { isUserFromMutedInstance } from '@/misc/is-instance-muted.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { bindThis } from '@/decorators.js';
import type { JsonObject } from '@/misc/json-value.js';
import type { MainEventTypes, EventTypesToEventPayload } from '@/core/GlobalEventService.js';
import Channel, { type ChannelRequest } from '../channel.js';
import { REQUEST } from '@nestjs/core';

@Injectable({ scope: Scope.TRANSIENT })
export class MainChannel extends Channel {
	public readonly chName = 'main';
	public static shouldShare = true;
	public static requireCredential = true as const;
	public static kind = 'read:account';

	constructor(
		@Inject(REQUEST)
		request: ChannelRequest,

		private noteEntityService: NoteEntityService,
	) {
		super(request);
	}

	@bindThis
	public async init(params: JsonObject): Promise<boolean> {
		if (!this.user) return false;

		this.subscriber.on(`mainStream:${this.user.id}`, this.onData);
		return true;
	}

	@bindThis
	private async onData(data: EventTypesToEventPayload<MainEventTypes>) {
		switch (data.type) {
			case 'newChatMessage': {
				if (this.blockedUserIds.has(data.body.fromUserId) || this.userIdsWhoMeMuting.has(data.body.fromUserId)) return;
				break;
			}
			case 'notification': {
				if (data.body.type === 'chatRoomMemberRemoved') break;
				// Ignore notifications from instances the user has muted
				if (isUserFromMutedInstance(data.body, this.userMutedInstances)) return;
				if (data.body.userId && this.userIdsWhoMeMuting.has(data.body.userId)) return;
				if (data.body.userId && this.blockedUserIds.has(data.body.userId)) return;

				if (data.body.note && data.body.note.isHidden) {
					const note = await this.noteEntityService.pack(data.body.note.id, this.user, {
						detail: true,
					});
					data.body.note = note;
				}
				break;
			}
			case 'reply':
			case 'renote':
			case 'mention': {
				if (!this.isNoteVisibleForMe(data.body)) return;
				if (this.isNoteMutedOrBlocked(data.body)) return;
				// 公共流的原始快照未按收件人隐藏，深层引用也必须重新检查。
				const note = await this.noteEntityService.pack(data.body.id, this.user, { detail: true });
				this.send(data.type, note);
				return;
			}
		}

		this.send(data.type, data.body);
	}

	@bindThis
	public dispose() {
		this.subscriber.off(`mainStream:${this.user?.id}`, this.onData);
	}
}
