/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { EntityManager, FindOptionsWhere } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { MiArticleComment, MiBlocking, MiChatMessage, MiChatRoom, MiDriveFile, MiFlash, MiFollowing, MiGalleryPost, MiNote, MiPage, MiPoll, MiRedPacket, MiUser, MiUserProfile } from '@/models/_.js';
import type { AbuseReportSnapshot } from '@/models/AbuseUserReport.js';
import { canReadArticle, isArticle } from '@/misc/article-access.js';
import { isDeletedReply } from '@/misc/is-reply.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import { ChatService } from '@/core/ChatService.js';
import { RoleService } from '@/core/RoleService.js';
import { AbuseReportEvidenceService } from '@/core/AbuseReportEvidenceService.js';

export type AbuseReportTarget = {
	type: AbuseReportSnapshot['type'];
	id?: string;
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
				case 'note': {
					const note = await manager.getRepository(MiNote).findOneBy({ id: target.id });
					if (note == null || isDeletedReply(note) || !await this.noteEntityService.isContentVisible(note, reporter)) throw new Error('INVALID_REPORT_TARGET');
					snapshot.sourceUrl = `${this.config.url}/notes/${note.id}`;
					if (note.userId !== user.id) throw new Error('INVALID_REPORT_TARGET');
					const poll = note.hasPoll ? await manager.getRepository(MiPoll).findOneBy({ noteId: note.id }) : null;
					snapshot.content = [note.cw, note.text, ...(poll?.choices ?? [])].filter(value => value != null && value !== '').join('\n\n');
					fileIds = [...note.fileIds];
					await this.captureRedPacket(note.redPacketId, note.userId, snapshot, fileIds, manager);
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
						await this.captureRedPacket(referenced.redPacketId, referenced.userId, snapshot, fileIds, manager);
						visited.add(referenced.id);
						current = referenced;
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
					if (message.isPoke) snapshot.content = `Poke: ${message.pokeUserId ?? ''}`;
					await this.captureRedPacket(message.redPacketId, message.fromUserId, snapshot, fileIds, manager);
					if (message.replyId != null) {
						const reply = await manager.getRepository(MiChatMessage).findOneBy({ id: message.replyId });
						const sameConversation = reply != null && (message.toRoomId != null ? reply.toRoomId === message.toRoomId : reply.toRoomId == null && (
							(reply.fromUserId === message.fromUserId && reply.toUserId === message.toUserId) ||
							(reply.fromUserId === message.toUserId && reply.toUserId === message.fromUserId)
						));
						if (reply != null && sameConversation && reply.systemEvent == null) {
							const author = await manager.getRepository(MiUser).findOneBy({ id: reply.fromUserId });
							const identity = author == null ? reply.fromUserId : `@${author.username}${author.host == null ? '' : `@${author.host}`}`;
							snapshot.content = [snapshot.content, `Reply: ${this.config.url}/chat/messages/${reply.id}\n${identity}\n${reply.text ?? ''}`].filter(Boolean).join('\n\n');
							if (reply.fileId != null) fileIds.push(reply.fileId);
							await this.captureRedPacket(reply.redPacketId, reply.fromUserId, snapshot, fileIds, manager);
						}
					}
					break;
				}
				case 'article':
				case 'page': {
					const page = await manager.getRepository(MiPage).findOneBy({ id: target.id });
					if (page == null || page.userId !== user.id) throw new Error('INVALID_REPORT_TARGET');
					const article = isArticle(page);
					if (target.type === 'article' && !article) throw new Error('INVALID_REPORT_TARGET');
					if (article) {
						// 旧客户端仍可能把文章标成 Page，不能借此绕过文章门禁。
						if (!await canReadArticle(page, reporter, manager)) throw new Error('INVALID_REPORT_TARGET');
						snapshot.type = 'article';
					} else if (page.userId !== reporter.id) {
						const visible = page.visibility === 'public' || (page.visibility === 'specified' && page.visibleUserIds.includes(reporter.id)) || (page.visibility === 'followers' && await manager.getRepository(MiFollowing).existsBy({ followeeId: user.id, followerId: reporter.id }));
						if (!visible) throw new Error('INVALID_REPORT_TARGET');
					}
					snapshot.sourceUrl = article ? `${this.config.url}/articles/${page.id}` : `${this.config.url}/@${encodeURIComponent(user.username)}/pages/${encodeURIComponent(page.name)}`;
					snapshot.content = (article ? [page.title, page.summary, page.content[0].text] : [page.title, page.summary, JSON.stringify(page.content, null, 2), JSON.stringify(page.variables, null, 2), page.script]).filter(value => value != null && value !== '').join('\n\n');
					fileIds = page.eyeCatchingImageId == null ? [] : [page.eyeCatchingImageId];
					this.collectPageFiles(page.content, fileIds);
					fileOwnerId = page.userId;
					break;
				}
				case 'article_comment': {
					const comments = manager.getRepository(MiArticleComment);
					const comment = await comments.findOneBy({ id: target.id });
					if (comment == null || comment.isDeleted || comment.userId !== user.id) throw new Error('INVALID_REPORT_TARGET');
					const article = await manager.getRepository(MiPage).findOne({ where: { id: comment.articleId }, lock: { mode: 'for_no_key_update' } });
					if (article == null || !isArticle(article) || !await canReadArticle(article, reporter, manager)) throw new Error('INVALID_REPORT_TARGET');
					if (await manager.existsBy(MiBlocking, [{ blockerId: reporter.id, blockeeId: user.id }, { blockerId: user.id, blockeeId: reporter.id }])) throw new Error('INVALID_REPORT_TARGET');
					const current = await comments.findOneBy({ id: comment.id, articleId: article.id });
					if (current == null || current.isDeleted || current.userId !== user.id) throw new Error('INVALID_REPORT_TARGET');
					snapshot.sourceUrl = `${this.config.url}/articles/${article.id}#comment-${current.id}`;
					snapshot.content = current.text;
					fileIds = [...current.fileIds];
					fileOwnerId = current.userId;
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

		const linkedIds = await this.collectLinkedFiles(snapshot.content, manager);
		if (fileIds.length > 0 || linkedIds.length > 0) {
			const files = fileIds.length === 0 ? [] : await manager.getRepository(MiDriveFile).findBy({ id: In([...new Set(fileIds)]), ...(fileOwnerId == null ? {} : { userId: fileOwnerId }) });
			if (fileIds.some(id => !files.some(file => file.id === id))) throw new Error('REPORT_EVIDENCE_UNAVAILABLE');
			const remainingIds = linkedIds.filter(id => !fileIds.includes(id));
			if (remainingIds.length > 0) files.push(...await manager.getRepository(MiDriveFile).findBy({ id: In(remainingIds) }));
			const filesById = new Map(files.map(file => [file.id, file]));
			try {
				for (const id of new Set([...fileIds, ...linkedIds])) {
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

	private async captureRedPacket(id: string | null | undefined, userId: string, snapshot: AbuseReportSnapshot, fileIds: string[], manager: EntityManager): Promise<void> {
		if (id == null) return;
		const packet = await manager.getRepository(MiRedPacket).findOneBy({ id, userId });
		if (packet == null) return;
		// 仅保留宿主卡片展示的祝福语和封面，不复制口令、收款人或财务明细。
		snapshot.content = [snapshot.content, `Red packet: ${packet.id}\n${packet.message}`, packet.coverUrl].filter(Boolean).join('\n\n');
		if (packet.coverFileId != null) fileIds.push(packet.coverFileId);
	}

	private async collectLinkedFiles(content: string, manager: EntityManager): Promise<string[]> {
		if (content === '') return [];
		const origin = new URL(this.config.url).origin;
		const urls = new Set<string>();
		const keys = new Set<string>();
		const limit = 128;
		const addUrl = (address: string) => {
			if (urls.size >= limit) return;
			try {
				const url = new URL(address, this.config.url);
				if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return;
				if (url.href.length <= 1024) urls.add(url.href);
				url.search = '';
				url.hash = '';
				if (url.href.length > 1024 || urls.size >= limit) return;
				urls.add(url.href);
				const match = url.origin === origin ? /^\/files\/([^/]+)$/.exec(url.pathname) : null;
				if (match) {
					const key = decodeURIComponent(match[1]);
					if (key.length <= 256 && !key.includes('/') && !key.includes('\u0000')) keys.add(key);
				}
			} catch { /* 损坏的正文 URL 不影响其他证据。 */ }
		};
		// 只还原 JSON 的 URL 分隔符，不解码外链查询中的嵌套地址。
		const text = content.replace(/\\\//g, '/').replace(/\\u002f/gi, '/').replace(/\\u003a/gi, ':');
		let count = 0;
		for (const match of text.matchAll(/(https?:\/\/[^\s<>"'`\\]+)|(?:^|[\s<>"'`(\[{=])(\/(?!\/)[^\s<>"'`\\]+)/gi)) {
			if (++count > limit || urls.size >= limit) break;
			const address = match[1] ?? match[2];
			if (address.length > 4096) continue;
			const chinese = address.search(/[\u3000-\u303f\u3400-\u9fff]/u);
			const candidates = chinese > 0 ? [address, address.slice(0, chinese)] : [address];
			for (let candidate of candidates) {
				// 保留完整文件名，也尝试去掉 Markdown 的结束符。
				for (let trims = 0; trims < 8; trims++) {
					addUrl(candidate);
					if (!/[)\]},.;!?，。；！]$/u.test(candidate) || urls.size >= limit) break;
					candidate = candidate.slice(0, -1);
				}
			}
		}
		if (urls.size === 0) return [];
		const values = [...urls];
		const where: FindOptionsWhere<MiDriveFile>[] = [
			{ url: In(values) }, { thumbnailUrl: In(values) }, { webpublicUrl: In(values) },
		];
		if (keys.size > 0) {
			const internalKeys = [...keys];
			where.push(
				{ storedInternal: true, accessKey: In(internalKeys) },
				{ storedInternal: true, thumbnailAccessKey: In(internalKeys) },
				{ storedInternal: true, webpublicAccessKey: In(internalKeys) },
			);
		}
		const files = await manager.getRepository(MiDriveFile).findBy(where);
		return files.map(file => file.id);
	}

	private collectPageFiles(blocks: Record<string, unknown>[], fileIds: string[]): void {
		for (const block of blocks) {
			if (block.type === 'image' && typeof block.fileId === 'string') fileIds.push(block.fileId);
			if (Array.isArray(block.children)) this.collectPageFiles(block.children, fileIds);
		}
	}
}
