/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { EventEmitter } from 'eventemitter3';
import * as Misskey from 'misskey-js';
import { onBeforeUnmount } from 'vue';

export type NoteEditContent = Pick<Misskey.entities.Note, 'text' | 'cw'> & Partial<Pick<Misskey.entities.Note, 'emojis' | 'tags' | 'files' | 'fileIds' | 'reactionAcceptance'>>;

type Events = {
	clientNotification: (notification: Misskey.entities.Notification) => void;
	notePosted: (note: Misskey.entities.Note) => void;
	likesUpdated: (noteId: Misskey.entities.Note['id'], state: Misskey.entities.LikeState) => void;
	noteEdited: (noteId: string, content: NoteEditContent) => void;
	noteDeleted: (
		noteId: Misskey.entities.Note['id'],
		replyId?: Misskey.entities.Note['replyId'],
		renoteId?: Misskey.entities.Note['renoteId'],
		deletedBy?: Misskey.entities.Note['deletedBy'],
	) => void;
	noteRemovedFromAntenna: (antennaId: Misskey.entities.Antenna['id'], noteId: Misskey.entities.Note['id']) => void;
	driveFileCreated: (file: Misskey.entities.DriveFile) => void;
	driveFilesUpdated: (files: Misskey.entities.DriveFile[]) => void;
	driveFilesDeleted: (files: Misskey.entities.DriveFile[]) => void;
	driveFoldersUpdated: (folders: Misskey.entities.DriveFolder[]) => void;
	driveFoldersDeleted: (folders: Misskey.entities.DriveFolder[]) => void;
};

export const globalEvents = new EventEmitter<Events>();

export function useGlobalEvent<T extends keyof Events>(
	event: T,
	callback: EventEmitter.EventListener<Events, T>,
): void {
	globalEvents.on(event, callback);
	onBeforeUnmount(() => {
		globalEvents.off(event, callback);
	});
}
