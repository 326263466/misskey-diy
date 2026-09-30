/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { MiChatMessage, MiChatRoom, MiDriveFile, MiFlash, MiFollowing, MiGalleryPost, MiNote, MiNoteReaction, MiPage, MiPoll, MiUser, MiUserProfile } from '@/models/_.js';
import type { AbuseReportSnapshot } from '@/models/AbuseUserReport.js';
import { isDeletedReply } from '@/misc/is-reply.js';
import { normalizeTextReaction, TEXT_REACTION_PREFIX } from '@/misc/reaction.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import { ChatService } from '@/core/ChatService.js';
import { RoleService } from '@/core/RoleService.js';
import { AbuseReportEvidenceService } from '@/core/AbuseReportEvidenceService.js';

export type AbuseReportTarget = {
	type: 'user' | 'note' | 'boost' | 'chat' | 'page' | 'gallery' | 'play';
	id?: string;
	reaction?: string;
};

@Injectable()
export class AbuseReportSnapshotService {
	constructor(
		@Inject(DI.config)
		private config: Config,
		private noteEntityService: NoteEntityService,
		private driveFileEntityService: DriveFileEntityService,
		private chatService: ChatService,
		private roleService: RoleService,
		private evidenceService: AbuseReportEvidenceService,
	) {
	}

	public async capture(user: MiUser, reporter: MiUser, target: AbuseReportTarget, manager: EntityManager): Promise<AbuseReportSnapshot> {
		const snapshot: AbuseReportSnapshot = {
			version: 1,
			capturedAt: new Date().toISOString(),
			type: target.type,
			sourceUrl: `${this.config.url}/users/${user.id}`,
			user: { id: user.id, username: user.username, host: user.host, name: user.name },
			content: '',
			files: [],
		};
		let fileIds: string[] = [];
		let fileOwnerId: string | undefined;

		if (target.type === 'user') {
			if (target.id != null && target.id !== user.id) throw new Error('INVALID_REPORT_TARGET');
			const profile = await manager.getRepository(MiUserProfile).findOneBy({ userId: user.id });
			if (profile == null) throw new Error('INVALID_REPORT_TARGET');
			snapshot.content = [user.name, profile.description, ...profile.fields.map(field => `${field.name}: ${field.value}`)].filter(value => value != null && value !== '').join('\n\n');
			fileIds = [user.avatarId, user.bannerId].filter((id): id is string => id != null);
		} else {
			if (target.id == null) throw new Error('INVALID_REPORT_TARGET');
			switch (target.type) {
				case 'note':
				case 'boost': {
					const note = await manager.getRepository(MiNote).findOneBy({ id: target.id });
					if (note == null || isDeletedReply(note) || !await this.noteEntityService.isContentVisible(note, reporter)) throw new Error('INVALID_REPORT_TARGET');
					snapshot.sourceUrl = `${this.config.url}/notes/${note.id}`;
					if (target.type === 'boost') {
						const reaction = await manager.getRepository(MiNoteReaction).findOneBy({ noteId: note.id, userId: user.id });
						if (reaction == null || target.reaction == null || this.normalizeReaction(reaction.reaction) !== this.normalizeReaction(target.reaction)) throw new Error('INVALID_REPORT_TARGET');
						snapshot.content = reaction.reaction.startsWith(TEXT_REACTION_PREFIX) ? reaction.reaction.slice(TEXT_REACTION_PREFIX.length) : reaction.reaction;
					} else {
						if (note.userId !== user.id) throw new Error('INVALID_REPORT_TARGET');
						const poll = note.hasPoll ? await manager.getRepository(MiPoll).findOneBy({ noteId: note.id }) : null;
						snapshot.content = [note.cw, note.text, ...(poll?.choices ?? [])].filter(value => value != null && value !== '').join('\n\n');
						fileIds = [...note.fileIds];
						let current = note;
						const visited = new Set([note.id]);
						while (current.renoteId != null) {
							if (visited.size >= 8 || visited.has(current.renoteId)) throw new Error('INVALID_REPORT_TARGET');
							const referenced = await manager.getRepository(MiNote).findOneBy({ id: current.renoteId });
							if (referenced == null || isDeletedReply(referenced) || !await this.noteEntityService.isContentVisible(referenced, reporter)) throw new Error('INVALID_REPORT_TARGET');
							const author = await manager.getRepository(MiUser).findOneBy({ id: referenced.userId });
							if (author == null) throw new Error('INVALID_REPORT_TARGET');
							const referencedPoll = referenced.hasPoll ? await manager.getRepository(MiPoll).findOneBy({ noteId: referenced.id }) : null;
							const content = `${this.config.url}/notes/${referenced.id}\n@${author.username}${author.host == null ? '' : `@${author.host}`}\n${[referenced.cw, referenced.text, ...(referencedPoll?.choices ?? [])].filter(value => value != null && value !== '').join('\n\n')}`;
							snapshot.content = [snapshot.content, content].filter(value => value !== '').join('\n\n');
							fileIds.push(...referenced.fileIds);
							visited.add(referenced.id);
							current = referenced;
						}
					}
					break;
				}
				case 'chat': {
					const message = await manager.getRepository(MiChatMessage).findOneBy({ id: target.id });
					if (message == null || message.fromUserId !== user.id || !(await this.chatService.getChatAvailability(reporter.id)).read) throw new Error('INVALID_REPORT_TARGET');
					if (message.toRoomId != null) {
						const room = await manager.getRepository(MiChatRoom).findOneBy({ id: message.toRoomId });
						if (room == null || !await this.chatService.hasPermissionToViewRoomTimeline(reporter.id, room)) throw new Error('INVALID_REPORT_TARGET');
					} else if (message.fromUserId !== reporter.id && message.toUserId !== reporter.id && !await this.roleService.isModerator(reporter)) {
						throw new Error('INVALID_REPORT_TARGET');
					}
					snapshot.sourceUrl = `${this.config.url}/chat/messages/${message.id}`;
					snapshot.content = message.text ?? '';
					fileIds = message.fileId == null ? [] : [message.fileId];
					break;
				}
				case 'page': {
					const page = await manager.getRepository(MiPage).findOneBy({ id: target.id });
					if (page == null || page.userId !== user.id) throw new Error('INVALID_REPORT_TARGET');
					if (page.userId !== reporter.id) {
						const visible = page.visibility === 'public' || (page.visibility === 'specified' && page.visibleUserIds.includes(reporter.id)) || (page.visibility === 'followers' && await manager.getRepository(MiFollowing).existsBy({ followeeId: user.id, followerId: reporter.id }));
						if (!visible) throw new Error('INVALID_REPORT_TARGET');
					}
					snapshot.sourceUrl = `${this.config.url}/@${encodeURIComponent(user.username)}/pages/${encodeURIComponent(page.name)}`;
					snapshot.content = [page.title, page.summary, JSON.stringify(page.content, null, 2), JSON.stringify(page.variables, null, 2), page.script].filter(value => value != null && value !== '').join('\n\n');
					fileIds = page.eyeCatchingImageId == null ? [] : [page.eyeCatchingImageId];
					this.collectPageFiles(page.content, fileIds);
					fileOwnerId = page.userId;
					break;
				}
				case 'gallery': {
					const post = await manager.getRepository(MiGalleryPost).findOneBy({ id: target.id });
					if (post == null || post.userId !== user.id) throw new Error('INVALID_REPORT_TARGET');
					snapshot.sourceUrl = `${this.config.url}/gallery/${post.id}`;
					snapshot.content = [post.title, post.description].filter(value => value != null && value !== '').join('\n\n');
					fileIds = [...post.fileIds];
					break;
				}
				case 'play': {
					const play = await manager.getRepository(MiFlash).findOneBy({ id: target.id });
					if (play == null || play.userId !== user.id) throw new Error('INVALID_REPORT_TARGET');
					snapshot.sourceUrl = `${this.config.url}/play/${play.id}`;
					snapshot.content = [play.title, play.summary, play.script].join('\n\n');
					break;
				}
			}
		}

		if (fileIds.length > 0) {
			const files = await manager.getRepository(MiDriveFile).findBy({ id: In([...new Set(fileIds)]), ...(fileOwnerId == null ? {} : { userId: fileOwnerId }) });
			const filesById = new Map(files.map(file => [file.id, file]));
			try {
				for (const id of new Set(fileIds)) {
					const file = filesById.get(id);
					if (file == null) throw new Error('REPORT_EVIDENCE_UNAVAILABLE');
					const archive = await this.evidenceService.archive(file);
					snapshot.files.push({ id: file.id, name: file.name, type: file.type, size: archive.size, url: this.driveFileEntityService.getPublicUrl(file), comment: file.comment, archive });
				}
			} catch (error) {
				await Promise.allSettled(snapshot.files.map(file => this.evidenceService.delete(file.archive)));
				throw error;
			}
		}
		return snapshot;
	}

	private normalizeReaction(reaction: string): string {
		if (reaction.startsWith(TEXT_REACTION_PREFIX)) return normalizeTextReaction(reaction) ?? reaction;
		const normalized = reaction.replace(/@\.:$/, ':');
		return normalized.includes('\u200d') ? normalized : normalized.replace(/\ufe0f/g, '');
	}

	private collectPageFiles(blocks: Record<string, unknown>[], fileIds: string[]): void {
		for (const block of blocks) {
			if (block.type === 'image' && typeof block.fileId === 'string') fileIds.push(block.fileId);
			if (Array.isArray(block.children)) this.collectPageFiles(block.children, fileIds);
		}
	}
}
