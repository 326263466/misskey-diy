/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In, type SelectQueryBuilder } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type {
	ChannelFavoritesRepository,
	ChannelFollowingsRepository, ChannelMutingRepository,
	ChannelsRepository,
	DriveFilesRepository,
	MiDriveFile,
	MiNote,
	NotesRepository,
} from '@/models/_.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiUser } from '@/models/User.js';
import type { MiChannel } from '@/models/Channel.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import { QueryService } from '@/core/QueryService.js';
import { DriveFileEntityService } from './DriveFileEntityService.js';
import { NoteEntityService } from './NoteEntityService.js';

type ChannelStats = { usersCount: number; notesCount: number };

@Injectable()
export class ChannelEntityService {
	constructor(
		@Inject(DI.channelsRepository)
		private channelsRepository: ChannelsRepository,
		@Inject(DI.channelFollowingsRepository)
		private channelFollowingsRepository: ChannelFollowingsRepository,
		@Inject(DI.channelFavoritesRepository)
		private channelFavoritesRepository: ChannelFavoritesRepository,
		@Inject(DI.channelMutingRepository)
		private channelMutingRepository: ChannelMutingRepository,
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,
		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,
		private noteEntityService: NoteEntityService,
		private driveFileEntityService: DriveFileEntityService,
		private idService: IdService,
		private queryService: QueryService,
	) {
	}

	@bindThis
	public async pack(
		src: MiChannel['id'] | MiChannel,
		me?: { id: MiUser['id'] } | null | undefined,
		detailed?: boolean,
		opts?: {
			bannerFiles?: Map<MiDriveFile['id'], MiDriveFile>;
			followings?: Set<MiChannel['id']>;
			favorites?: Set<MiChannel['id']>;
			muting?: Set<MiChannel['id']>;
			pinnedNotes?: Map<MiNote['id'], MiNote>;
			stats?: Map<MiChannel['id'], ChannelStats>;
		},
	): Promise<Packed<'Channel'>> {
		const channel = typeof src === 'object' ? src : await this.channelsRepository.findOneByOrFail({ id: src });
		const stats = opts?.stats?.get(channel.id) ?? (await this.countStats([channel.id])).get(channel.id)!;

		let bannerFile: MiDriveFile | null = null;
		if (channel.bannerId) {
			bannerFile = opts?.bannerFiles?.get(channel.bannerId)
				?? await this.driveFilesRepository.findOneByOrFail({ id: channel.bannerId });
		}

		let isFollowing = false;
		let isFavorited = false;
		let isMuting = false;
		if (me) {
			isFollowing = opts?.followings?.has(channel.id) ?? await this.channelFollowingsRepository.exists({
				where: {
					followerId: me.id,
					followeeId: channel.id,
				},
			});

			isFavorited = opts?.favorites?.has(channel.id) ?? await this.channelFavoritesRepository.exists({
				where: {
					userId: me.id,
					channelId: channel.id,
				},
			});

			isMuting = opts?.muting?.has(channel.id) ?? await this.channelMutingRepository.exists({
				where: {
					userId: me.id,
					channelId: channel.id,
				},
			});
		}

		const pinnedNotes = Array.of<MiNote>();
		if (channel.pinnedNoteIds.length > 0) {
			pinnedNotes.push(
				...(
					opts?.pinnedNotes
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						? channel.pinnedNoteIds.map(it => opts.pinnedNotes!.get(it)).filter(it => it != null)
						: await this.notesRepository.findBy({ id: In(channel.pinnedNoteIds) })
				),
			);
		}

		return {
			id: channel.id,
			createdAt: this.idService.parse(channel.id).date.toISOString(),
			lastNotedAt: channel.lastNotedAt ? channel.lastNotedAt.toISOString() : null,
			name: channel.name,
			description: channel.description,
			userId: channel.userId,
			bannerUrl: bannerFile ? this.driveFileEntityService.getPublicUrl(bannerFile) : null,
			bannerId: channel.bannerId,
			pinnedNoteIds: channel.pinnedNoteIds,
			color: channel.color,
			isArchived: channel.isArchived,
			usersCount: stats.usersCount,
			notesCount: stats.notesCount,
			isSensitive: channel.isSensitive,
			allowRenoteToExternal: channel.allowRenoteToExternal,

			...(me ? {
				isFollowing,
				isFavorited,
				isMuting,
				hasUnreadNote: false, // 後方互換性のため
			} : {}),

			...(detailed ? {
				pinnedNotes: (await this.noteEntityService.packMany(pinnedNotes, me)).sort((a, b) => channel.pinnedNoteIds.indexOf(a.id) - channel.pinnedNoteIds.indexOf(b.id)),
				participantsCount: stats.usersCount,
			} : {}),
		};
	}

	// 计数与列表共用筛选，避免删除占位或用户状态造成口径差异。
	private makeVisibleNotesQuery(channelIds: MiChannel['id'][]): SelectQueryBuilder<MiNote> {
		const query = this.notesRepository.createQueryBuilder('note')
			.innerJoin('note.user', 'user')
			.where('note.channelId IN (:...channelIds)', { channelIds })
			.andWhere('user.isSuspended = FALSE')
			.andWhere('user.isDeleted = FALSE');
		this.queryService.generateDeletedReplyQuery(query);
		return query;
	}

	@bindThis
	public makeParticipantsQuery(channelId: MiChannel['id']): SelectQueryBuilder<MiNote> {
		return this.makeVisibleNotesQuery([channelId]);
	}

	// 频道表的 usersCount / notesCount 只在发帖时累加，删帖、封禁后不会减少。
	// 列表和详情都按同一筛选实时统计，确保与参与者列表、频道时间线一致。
	@bindThis
	public async countStats(channelIds: MiChannel['id'][]): Promise<Map<MiChannel['id'], ChannelStats>> {
		const stats = new Map<MiChannel['id'], ChannelStats>(channelIds.map(id => [id, { usersCount: 0, notesCount: 0 }]));
		if (channelIds.length === 0) return stats;
		const rows = await this.makeVisibleNotesQuery(channelIds)
			.select('note.channelId', 'channelId')
			.addSelect('COUNT(*)', 'notesCount')
			.addSelect('COUNT(DISTINCT note.userId)', 'usersCount')
			.groupBy('note.channelId')
			.getRawMany<{ channelId: string; notesCount: string; usersCount: string }>();
		for (const row of rows) stats.set(row.channelId, { usersCount: Number(row.usersCount), notesCount: Number(row.notesCount) });
		return stats;
	}

	@bindThis
	public async packMany(
		src: MiChannel['id'][] | MiChannel[],
		me?: { id: MiUser['id'] } | null | undefined,
		detailed?: boolean,
	): Promise<Packed<'Channel'>[]> {
		// IDのみの要素がある場合、DBからオブジェクトを取得して補う
		const channels = src.filter(it => typeof it === 'object') as MiChannel[];
		channels.push(
			...(await this.channelsRepository.find({
				where: {
					id: In(src.filter(it => typeof it !== 'object') as MiChannel['id'][]),
				},
			})),
		);
		channels.sort((a, b) => a.id.localeCompare(b.id));

		const bannerFiles = await this.driveFilesRepository
			.findBy({
				id: In(channels.map(it => it.bannerId).filter(it => it != null)),
			})
			.then(it => new Map(it.map(it => [it.id, it])));

		const followings = me
			? await this.channelFollowingsRepository
				.findBy({
					followerId: me.id,
					followeeId: In(channels.map(it => it.id)),
				})
				.then(it => new Set(it.map(it => it.followeeId)))
			: new Set<MiChannel['id']>();

		const favorites = me
			? await this.channelFavoritesRepository
				.findBy({
					userId: me.id,
					channelId: In(channels.map(it => it.id)),
				})
				.then(it => new Set(it.map(it => it.channelId)))
			: new Set<MiChannel['id']>();

		const muting = me
			? await this.channelMutingRepository
				.findBy({
					userId: me.id,
					channelId: In(channels.map(it => it.id)),
				})
				.then(it => new Set(it.map(it => it.channelId)))
			: new Set<MiChannel['id']>();

		const pinnedNotes = await this.notesRepository
			.find({
				where: {
					id: In(channels.flatMap(it => it.pinnedNoteIds)),
				},
			})
			.then(it => new Map(it.map(it => [it.id, it])));

		const stats = await this.countStats(channels.map(it => it.id));

		return Promise.all(channels.map(it => this.pack(it, me, detailed, {
			bannerFiles,
			followings,
			favorites,
			muting,
			pinnedNotes,
			stats,
		})));
	}
}

