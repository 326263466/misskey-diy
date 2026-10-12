/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Brackets } from 'typeorm';
import type { DataSource, EntityTarget, ObjectLiteral } from 'typeorm';
import { DI } from '@/di-symbols.js';
import {
	MiAccessToken, MiAd, MiAnnouncement, MiArticleComment, MiAvatarDecoration, MiChannel, MiChatMessage, MiChatRoom,
	MiClip, MiEmoji, MiFeedback, MiFlash, MiFollowing, MiGalleryPost, MiInstance, MiMeta, MiNote,
	MiNoteDraft, MiPage, MiRedPacket, MiRegistryItem, MiRole, MiUser, MiUserProfile,
} from '@/models/_.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import { bindThis } from '@/decorators.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { ChatService } from '@/core/ChatService.js';
import { RoleService } from '@/core/RoleService.js';
import { MiDriveFileDraft } from '@/models/DriveFileDraft.js';
import { MiDriveFileReference } from '@/models/DriveFileReference.js';
import { canReadArticle, isArticle } from '@/misc/article-access.js';

export const driveFileUsageTypes = ['note', 'page', 'article', 'chat', 'profile', 'channel', 'gallery', 'clip', 'draft', 'settings', 'other'] as const;

type FileReference = {
	type: typeof driveFileUsageTypes[number];
	sourceId: string;
	name: string | null;
	url: string | null;
};

@Injectable()
export class DriveFileUsageService {
	constructor(
		@Inject(DI.db)
		private db: DataSource,
		private noteEntityService: NoteEntityService,
		private chatService: ChatService,
		private roleService: RoleService,
	) {}

	private candidateUrls(file: MiDriveFile): string[] {
		const normalize = (value: string): string | null => {
			try {
				const relative = value.startsWith('/files/');
				const url = new URL(value, relative ? 'https://relative.invalid' : undefined);
				if (url.username || url.password || !['http:', 'https:'].includes(url.protocol)) return null;
				return `${relative ? '' : url.origin}${url.pathname}`;
			} catch { return null; }
		};
		const targets = new Set([
			file.url, file.thumbnailUrl, file.webpublicUrl,
			...(file.storedInternal ? [file.accessKey, file.thumbnailAccessKey, file.webpublicAccessKey].filter(Boolean).map(key => `/files/${key}`) : []),
		].flatMap(value => value ? [normalize(value)].filter((url): url is string => url != null) : []));
		return [...new Set([...targets].flatMap(url => [url, encodeURI(url), encodeURIComponent(url)]))];
	}

	private async findReferences<T extends ObjectLiteral>(entity: EntityTarget<T>, fileId: string, urls: string[], fields: (keyof T & string)[], direct?: string, select?: (keyof T & string)[]): Promise<T[]> {
		const repository = this.db.getRepository(entity);
		const query = repository.createQueryBuilder('source');
		const sourceId = repository.metadata.tableName === 'drive_file_draft'
			? 'source."userId" || \':\' || source."draftId"'
			: `source."${repository.metadata.primaryColumns[0].databaseName}"::text`;
		const payload = `jsonb_build_object(${fields.map(field => `'${field}', source."${field}"`).join(', ')})`;
		if (select) query.select(select.map(field => `source.${field}`));
		// 先复用登记表找到点路径、编码等 URL 变体；保留文本候选以兼容尚未登记的历史来源。
		query.where(new Brackets(where => {
			where.where(`EXISTS (SELECT 1 FROM "drive_file_reference" reference WHERE reference."fileId" = :fileId AND reference."sourceType" = :sourceType AND reference."sourceId" = ${sourceId})`);
			if (direct) where.orWhere(direct);
			if (fields.length > 0 && urls.length > 0) {
				const text = `concat_ws(' ', ${fields.map(field => `source."${field}"::text`).join(', ')})`;
				where.orWhere(`EXISTS (SELECT 1 FROM unnest(:urls::text[]) candidate(url) WHERE strpos(replace(${text}, chr(92), ''), candidate.url) > 0)`);
			}
		})).andWhere(`EXISTS (
			SELECT 1 FROM drive_file_tokens(${payload}) candidate
			INNER JOIN "drive_file_target" target ON target."tokenHash" = md5(candidate.token) AND target."token" = candidate.token
			WHERE target."fileId" = :fileId
		)`).setParameters({ fileId, urls, sourceType: repository.metadata.tableName });
		return query.getMany();
	}

	private async profileUrl(userId: string, hideSuspended = false): Promise<string | null> {
		const user = await this.db.getRepository(MiUser).findOneBy({ id: userId, ...(hideSuspended ? { isSuspended: false } : {}) });
		return user ? `/@${encodeURIComponent(user.username)}${user.host ? `@${encodeURIComponent(user.host)}` : ''}` : null;
	}

	private async canViewPage(page: MiPage, me: MiUser): Promise<boolean> {
		if (isArticle(page)) return canReadArticle(page, me, this.db.manager);
		if (page.userId === me.id || page.visibility === 'public') return true;
		if (page.visibility === 'specified') return page.visibleUserIds.includes(me.id);
		return page.visibility === 'followers' && await this.db.getRepository(MiFollowing).existsBy({ followeeId: page.userId, followerId: me.id });
	}

	@bindThis
	public async getUsage(file: MiDriveFile, me: MiUser, limit: number, offset: number) {
		const urls = this.candidateUrls(file);
		const references: FileReference[] = [];
		const seen = new Set<string>();
		let hiddenCount = 0;
		const add = (key: string, visible: boolean, type: FileReference['type'], sourceId: string, name: string | null, url: string | null) => {
			if (seen.has(key)) return;
			seen.add(key);
			if (visible) references.push({ type, sourceId, name: name?.slice(0, 160) ?? null, url });
			else hiddenCount++;
		};
		const find = <T extends ObjectLiteral>(entity: EntityTarget<T>, fields: (keyof T & string)[], direct?: string, select?: (keyof T & string)[]) => this.findReferences(entity, file.id, urls, fields, direct, select);
		const isModerator = await this.roleService.isModerator(me);
		const chatReadable = (await this.chatService.getChatAvailability(me.id)).read;

		for (const note of await find(MiNote, ['fileIds', 'text', 'cw'], 'source."fileIds" @> ARRAY[:fileId]::varchar[]')) {
			add(`note:${note.id}`, await this.noteEntityService.isContentVisible(note, me), 'note', note.id, note.cw ?? note.text, `/notes/${note.id}`);
		}
		for (const page of await find(MiPage, ['eyeCatchingImageId', 'content', 'variables', 'script', 'summary'], 'source."eyeCatchingImageId" = :fileId OR strpos(source.content::text, :fileId) > 0 OR strpos(source.variables::text, :fileId) > 0')) {
			const article = page.content.length === 1 && page.content[0].type === 'markdown' && typeof page.content[0].text === 'string';
			const visible = await this.canViewPage(page, me);
			const authorUrl = !article && visible ? await this.profileUrl(page.userId) : null;
			add(`page:${page.id}`, visible, article ? 'article' : 'page', page.id, page.title, article ? `/articles/${page.id}` : authorUrl ? `${authorUrl}/pages/${encodeURIComponent(page.name)}` : null);
		}
		for (const message of await find(MiChatMessage, ['fileId', 'text'], 'source."fileId" = :fileId')) {
			let visible = chatReadable && (message.fromUserId === me.id || message.toUserId === me.id);
			if (chatReadable && message.toRoomId) {
				const room = await this.db.getRepository(MiChatRoom).findOneBy({ id: message.toRoomId });
				visible = room != null && await this.chatService.hasPermissionToViewRoomTimeline(me.id, room);
			}
			add(`message:${message.id}`, visible, 'chat', message.id, message.text, message.toRoomId ? `/chat/room/${message.toRoomId}` : `/chat/messages/${message.id}`);
		}
		for (const room of await find(MiChatRoom, ['avatarId', 'description'], 'source."avatarId" = :fileId')) {
			add(`room:${room.id}`, chatReadable && await this.chatService.hasPermissionToViewRoomInfo(me.id, room), 'chat', room.id, room.name, `/chat/room/${room.id}`);
		}
		for (const draft of await find(MiNoteDraft, ['fileIds', 'text', 'cw'], 'source."fileIds" @> ARRAY[:fileId]::varchar[]')) {
			add(`draft:${draft.id}`, draft.userId === me.id, 'draft', draft.id, draft.cw ?? draft.text, null);
		}
		for (const draft of await find(MiDriveFileDraft, ['data'], 'source.data->\'fileIds\' @> to_jsonb(ARRAY[:fileId]::text[])')) {
			const sourceId = `${draft.userId}:${draft.draftId}`;
			add(`composer:${sourceId}`, draft.userId === me.id, 'draft', sourceId, null, null);
		}
		for (const comment of await find(MiArticleComment, ['text', 'fileIds'], 'source."fileIds" @> ARRAY[:fileId]::varchar[]')) {
			const article = await this.db.getRepository(MiPage).findOneBy({ id: comment.articleId });
			const visible = article != null && await canReadArticle(article, me, this.db.manager);
			add(`article-comment:${comment.id}`, visible, 'article', comment.id, comment.text, `/articles/${comment.articleId}`);
		}
		for (const feedback of await find(MiFeedback, ['description', 'response', 'fileIds', 'responseFileIds'], 'source."fileIds" @> ARRAY[:fileId]::varchar[] OR source."responseFileIds" @> ARRAY[:fileId]::varchar[]')) {
			add(`feedback:${feedback.id}`, true, 'other', feedback.id, feedback.title, '/feedback');
		}
		for (const user of await find(MiUser, ['avatarId', 'bannerId', 'avatarUrl', 'bannerUrl'], 'source."avatarId" = :fileId OR source."bannerId" = :fileId')) {
			const url = await this.profileUrl(user.id, !isModerator);
			add(`profile:${user.id}`, url != null, 'profile', user.id, user.name ?? user.username, url);
		}
		const publicProfiles = await find(MiUserProfile, ['description', 'fields']);
		const publicProfileIds = new Set(publicProfiles.map(profile => profile.userId));
		const privateProfiles = await find(MiUserProfile, ['followedMessage']);
		for (const profile of [...publicProfiles, ...privateProfiles.filter(profile => !publicProfileIds.has(profile.userId))]) {
			const url = await this.profileUrl(profile.userId, !isModerator);
			add(`profile:${profile.userId}`, url != null && (publicProfileIds.has(profile.userId) || profile.userId === me.id), 'profile', profile.userId, null, url);
		}
		for (const channel of await find(MiChannel, ['bannerId', 'description'], 'source."bannerId" = :fileId')) {
			add(`channel:${channel.id}`, true, 'channel', channel.id, channel.name, `/channels/${channel.id}`);
		}
		for (const post of await find(MiGalleryPost, ['fileIds', 'description'], 'source."fileIds" @> ARRAY[:fileId]::varchar[]')) {
			add(`gallery:${post.id}`, true, 'gallery', post.id, post.title, `/gallery/${post.id}`);
		}
		for (const clip of await find(MiClip, ['description'])) {
			add(`clip:${clip.id}`, clip.isPublic || clip.userId === me.id, 'clip', clip.id, clip.name, `/clips/${clip.id}`);
		}
		for (const item of await find(MiRegistryItem, ['value'], 'strpos(source.value::text, :fileId) > 0')) {
			const path = [item.domain ?? '@', ...item.scope, item.key].map(encodeURIComponent).join('/');
			add(`registry:${item.id}`, item.userId === me.id, 'settings', item.id, item.key, item.key.includes('/') ? '/registry' : `/registry/value/${path}`);
		}
		for (const token of await find(MiAccessToken, ['iconUrl'], undefined, ['id', 'userId', 'name', 'iconUrl'])) {
			add(`app:${token.id}`, token.userId === me.id, 'settings', token.id, token.name, '/settings/apps');
		}
		for (const flash of await find(MiFlash, ['script', 'summary'])) {
			add(`flash:${flash.id}`, flash.visibility === 'public' || flash.userId === me.id, 'other', flash.id, flash.title, `/play/${flash.id}`);
		}
		for (const packet of await find(MiRedPacket, ['coverFileId', 'coverUrl'], 'source."coverFileId" = :fileId')) {
			// 红包详情还受收件人、群成员与领取状态限制；这里只列本人发出的封面。
			add(`packet:${packet.id}`, packet.userId === me.id, 'other', packet.id, null, null);
		}
		for (const announcement of await find(MiAnnouncement, ['imageUrl', 'text'])) {
			add(`announcement:${announcement.id}`, announcement.userId == null || announcement.userId === me.id, 'other', announcement.id, announcement.title, `/announcements/${announcement.id}`);
		}
		for (const role of await find(MiRole, ['iconUrl', 'description'])) {
			add(`role:${role.id}`, role.isPublic || isModerator, 'other', role.id, role.name, role.isPublic ? `/roles/${role.id}` : `/admin/roles/${role.id}`);
		}
		for (const ad of await find(MiAd, ['imageUrl', 'url'])) {
			const active = ad.startsAt.getTime() <= Date.now() && ad.expiresAt.getTime() > Date.now();
			add(`ad:${ad.id}`, active || isModerator, 'other', ad.id, null, isModerator ? '/admin/ads' : '/ads');
		}
		for (const emoji of await find(MiEmoji, ['originalUrl', 'publicUrl'])) {
			add(`emoji:${emoji.id}`, true, 'other', emoji.id, `:${emoji.name}:`, '/about#emojis');
		}
		for (const decoration of await find(MiAvatarDecoration, ['url'])) {
			add(`decoration:${decoration.id}`, true, 'other', decoration.id, decoration.name, '/settings/avatar-decoration');
		}
		for (const instance of await find(MiInstance, ['iconUrl', 'faviconUrl'])) {
			add(`instance:${instance.id}`, true, 'other', instance.id, instance.name ?? instance.host, `/instance-info/${encodeURIComponent(instance.host)}`);
		}
		const brandingFields = ['mascotImageUrl', 'bannerUrl', 'backgroundImageUrl', 'logoImageUrl', 'iconUrl', 'app192IconUrl', 'app512IconUrl', 'serverErrorImageUrl', 'notFoundImageUrl', 'infoImageUrl'] as const;
		for (const meta of await find(MiMeta, [...brandingFields], undefined, ['id', ...brandingFields])) {
			add(`meta:${meta.id}`, true, 'settings', meta.id, null, isModerator ? '/admin/branding' : '/about');
		}

		const registered = await this.db.getRepository(MiDriveFileReference).findBy({ fileId: file.id });
		const sourceKeys: Record<string, string> = {
			note: 'note', page: 'page', article_comment: 'article-comment', chat_message: 'message', chat_room: 'room',
			note_draft: 'draft', drive_file_draft: 'composer', user: 'profile', user_profile: 'profile', channel: 'channel',
			gallery_post: 'gallery', clip: 'clip', registry_item: 'registry', access_token: 'app', flash: 'flash',
			red_packet: 'packet', announcement: 'announcement', role: 'role', ad: 'ad', emoji: 'emoji',
			avatar_decoration: 'decoration', instance: 'instance', meta: 'meta',
			feedback: 'feedback',
		};
		// 登记表保护的来源可能尚无可展示入口；不能把这些引用报告为未使用。
		for (const reference of registered) {
			const key = `${sourceKeys[reference.sourceType] ?? reference.sourceType}:${reference.sourceId}`;
			add(key, false, 'other', reference.sourceId, null, null);
		}
		references.sort((a, b) => a.type.localeCompare(b.type) || a.sourceId.localeCompare(b.sourceId));
		return {
			fileId: file.id,
			used: seen.size > 0,
			registeredReferenceCount: registered.length,
			lifecycle: {
				isManaged: file.isManaged,
				isPinned: file.isPinned,
				cleanupAt: file.cleanupAt?.toISOString() ?? null,
				deleting: file.deletingAt != null,
			},
			// 浏览器本地草稿、站外引用和扩展自定义数据无法由此接口穷举。
			referenceCoverage: 'partial' as const,
			references: references.slice(offset, offset + limit),
			hiddenCount,
			totalCount: seen.size,
			hasMore: offset + limit < references.length,
		};
	}
}
