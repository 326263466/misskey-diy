/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { MiUser, ChatMessagesRepository, MiChatMessage, ChatRoomsRepository, MiChatRoom, MiChatRoomInvitation, ChatRoomInvitationsRepository, MiChatRoomMembership, ChatRoomMembershipsRepository, DriveFilesRepository, MiDriveFile } from '@/models/_.js';
import { awaitAll } from '@/misc/prelude/await-all.js';
import type { Packed } from '@/misc/json-schema.js';
import type { } from '@/models/Blocking.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import { RedPacketService, type RedPacketSummary } from '@/core/RedPacketService.js';
import { UserEntityService } from './UserEntityService.js';
import { DriveFileEntityService } from './DriveFileEntityService.js';
import { In } from 'typeorm';

@Injectable()
export class ChatEntityService {
	constructor(
		@Inject(DI.chatMessagesRepository)
		private chatMessagesRepository: ChatMessagesRepository,

		@Inject(DI.chatRoomsRepository)
		private chatRoomsRepository: ChatRoomsRepository,

		@Inject(DI.chatRoomInvitationsRepository)
		private chatRoomInvitationsRepository: ChatRoomInvitationsRepository,

		@Inject(DI.chatRoomMembershipsRepository)
		private chatRoomMembershipsRepository: ChatRoomMembershipsRepository,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		private userEntityService: UserEntityService,
		private driveFileEntityService: DriveFileEntityService,
		private idService: IdService,
		private redPacketService: RedPacketService,
	) {
	}

	private async packReplies(messages: MiChatMessage[]): Promise<Map<string, Packed<'ChatMessage'>['reply']>> {
		const ids = [...new Set(messages.flatMap(message => message.replyId ? [message.replyId] : []))];
		if (ids.length === 0) return new Map();
		const originals = await this.chatMessagesRepository.find({ where: { id: In(ids) }, relations: { file: true } });
		const users = new Map((await this.userEntityService.packMany(originals.map(message => message.fromUserId))).map(user => [user.id, user]));
		return new Map(originals.map(message => [message.id, {
			id: message.id,
			fromUser: users.get(message.fromUserId)!,
			text: message.text == null ? null : Array.from(message.text).slice(0, 200).join(''),
			fileName: message.file?.name ?? null,
			hasRedPacket: message.redPacketId != null,
		}]));
	}

	private async packPokeUser(message: MiChatMessage, users?: Map<string, Packed<'UserLite'>>, me?: { id: string }): Promise<Packed<'UserLite'> | null> {
		if (!message.pokeUserId) return null;
		return users?.get(message.pokeUserId) ?? await this.userEntityService.pack(message.pokeUser ?? message.pokeUserId, me).catch(() => null);
	}

	private async packSystemEvent(message: MiChatMessage, users?: Map<string, Packed<'UserLite'>>) {
		if (!message.systemEvent) return null;
		const targets = users
			? message.systemEvent.userIds.flatMap(id => users.has(id) ? [users.get(id)!] : [])
			: await this.userEntityService.packMany(message.systemEvent.userIds);
		return { ...message.systemEvent, users: targets };
	}

	@bindThis
	public async packMessageDetailed(
		src: MiChatMessage['id'] | MiChatMessage,
		me?: { id: MiUser['id'] },
		options?: {
			_hint_?: {
				packedFiles?: Map<MiChatMessage['fileId'], Packed<'DriveFile'> | null>;
				packedUsers?: Map<MiChatMessage['id'], Packed<'UserLite'>>;
				packedRooms?: Map<MiChatMessage['toRoomId'], Packed<'ChatRoom'> | null>;
				redPackets?: Map<string, RedPacketSummary>;
				replies?: Map<string, Packed<'ChatMessage'>['reply']>;
			};
		},
	): Promise<Packed<'ChatMessage'>> {
		const packedUsers = options?._hint_?.packedUsers;
		const packedFiles = options?._hint_?.packedFiles;
		const packedRooms = options?._hint_?.packedRooms;

		const message = typeof src === 'object' ? src : await this.chatMessagesRepository.findOneByOrFail({ id: src });

		// userは削除されている可能性があるのでnull許容
		const reactions: { user: Packed<'UserLite'> | null; reaction: string; }[] = [];

		for (const record of message.reactions) {
			const [userId, reaction] = record.split('/');
			reactions.push({
				user: packedUsers?.get(userId) ?? (await this.userEntityService.pack(userId).catch(() => null)),
				reaction,
			});
		}

		return {
			id: message.id,
			createdAt: this.idService.parse(message.id).date.toISOString(),
			text: message.text,
			systemEvent: await this.packSystemEvent(message, packedUsers),
			isPoke: message.isPoke ?? false,
			pokeUserId: message.pokeUserId ?? null,
			pokeUser: await this.packPokeUser(message, packedUsers, me),
			replyId: message.replyId ?? null,
			replyType: message.replyType ?? null,
			reply: message.replyId ? (options?._hint_?.replies ?? await this.packReplies([message])).get(message.replyId) ?? null : null,
			editedAt: message.editedAt ? message.editedAt.toISOString() : null,
			redPacketId: message.redPacketId ?? undefined,
			redPacket: message.redPacketId ? (options?._hint_?.redPackets?.get(message.redPacketId) ?? await this.redPacketService.packById(message.redPacketId, me)) : undefined,
			fromUserId: message.fromUserId,
			fromUser: packedUsers?.get(message.fromUserId) ?? (await this.userEntityService.pack(message.fromUser ?? message.fromUserId, me)),
			toUserId: message.toUserId,
			toUser: message.toUserId ? (packedUsers?.get(message.toUserId) ?? (await this.userEntityService.pack(message.toUser ?? message.toUserId, me))) : undefined,
			toRoomId: message.toRoomId,
			isAutoReply: message.isAutoReply ?? false,
			toRoom: message.toRoomId ? (packedRooms?.get(message.toRoomId) ?? (await this.packRoom(message.toRoom ?? message.toRoomId, me))) : undefined,
			fileId: message.fileId,
			file: message.fileId ? (packedFiles?.get(message.fileId) ?? (await this.driveFileEntityService.pack(message.file ?? message.fileId))) : null,
			reactions: reactions.filter((r): r is { user: Packed<'UserLite'>; reaction: string; } => r.user != null),
		};
	}

	@bindThis
	public async packMessagesDetailed(
		messages: MiChatMessage[],
		me: { id: MiUser['id'] },
	) {
		if (messages.length === 0) return [];

		const excludeMe = (x: MiUser | string) => {
			if (typeof x === 'string') {
				return x !== me.id;
			} else {
				return x.id !== me.id;
			}
		};

		const users = [
			...messages.map((m) => m.fromUser ?? m.fromUserId).filter(excludeMe),
			...messages.map((m) => m.toUser ?? m.toUserId).filter(x => x != null).filter(excludeMe),
			...messages.flatMap(m => m.pokeUserId ? [m.pokeUser ?? m.pokeUserId] : []),
			...messages.flatMap(m => m.systemEvent?.userIds ?? []),
		];

		const reactedUserIds = messages.flatMap(x => x.reactions.map(r => r.split('/')[0]));

		for (const reactedUserId of reactedUserIds) {
			if (!users.some(x => typeof x === 'string' ? x === reactedUserId : x.id === reactedUserId)) {
				users.push(reactedUserId);
			}
		}

		// TODO: packedUsersに削除されたユーザーもnullとして含める
		const [packedUsers, packedFiles, packedRooms, redPackets, replies] = await Promise.all([
			this.userEntityService.packMany(users, me)
				.then(users => new Map(users.map(u => [u.id, u]))),
			this.driveFileEntityService.packMany(messages.map(m => m.file).filter(x => x != null))
				.then(files => new Map(files.map(f => [f.id, f]))),
			this.packRooms(messages.map(m => m.toRoom ?? m.toRoomId).filter(x => x != null), me)
				.then(rooms => new Map(rooms.map(r => [r.id, r]))),
			this.redPacketService.packByIds(messages.flatMap(message => message.redPacketId ? [message.redPacketId] : []), me),
			this.packReplies(messages),
		]);

		return Promise.all(messages.map(message => this.packMessageDetailed(message, me, { _hint_: { packedUsers, packedFiles, packedRooms, redPackets, replies } })));
	}

	@bindThis
	public async packMessageLiteFor1on1(
		src: MiChatMessage['id'] | MiChatMessage,
		options?: {
			_hint_?: {
				packedFiles: Map<MiChatMessage['fileId'], Packed<'DriveFile'> | null>;
				packedUsers?: Map<string, Packed<'UserLite'>>;
				redPackets?: Map<string, RedPacketSummary>;
				replies?: Map<string, Packed<'ChatMessage'>['reply']>;
			};
		},
	): Promise<Packed<'ChatMessageLiteFor1on1'>> {
		const packedFiles = options?._hint_?.packedFiles;

		const message = typeof src === 'object' ? src : await this.chatMessagesRepository.findOneByOrFail({ id: src });

		const reactions: { reaction: string; }[] = [];

		for (const record of message.reactions) {
			const [, reaction] = record.split('/');
			reactions.push({
				reaction,
			});
		}

		return {
			id: message.id,
			createdAt: this.idService.parse(message.id).date.toISOString(),
			text: message.text,
			isPoke: message.isPoke ?? false,
			pokeUserId: message.pokeUserId ?? null,
			pokeUser: await this.packPokeUser(message, options?._hint_?.packedUsers),
			replyId: message.replyId ?? null,
			replyType: message.replyType ?? null,
			reply: message.replyId ? (options?._hint_?.replies ?? await this.packReplies([message])).get(message.replyId) ?? null : null,
			editedAt: message.editedAt ? message.editedAt.toISOString() : null,
			redPacketId: message.redPacketId ?? undefined,
			redPacket: message.redPacketId ? (options?._hint_?.redPackets?.get(message.redPacketId) ?? await this.redPacketService.packById(message.redPacketId)) : undefined,
			fromUserId: message.fromUserId,
			toUserId: message.toUserId!,
			systemEvent: null,
			isAutoReply: message.isAutoReply ?? false,
			fileId: message.fileId,
			file: message.fileId ? (packedFiles?.get(message.fileId) ?? (await this.driveFileEntityService.pack(message.file ?? message.fileId))) : null,
			reactions,
		};
	}

	@bindThis
	public async packMessagesLiteFor1on1(
		messages: MiChatMessage[],
	) {
		if (messages.length === 0) return [];

		const [packedFiles, redPackets, replies, packedUsers] = await Promise.all([
			this.driveFileEntityService.packMany(messages.map(m => m.file).filter(x => x != null))
				.then(files => new Map(files.map(f => [f.id, f]))),
			this.redPacketService.packByIds(messages.flatMap(message => message.redPacketId ? [message.redPacketId] : [])),
			this.packReplies(messages),
			messages.some(message => message.pokeUserId) ? this.userEntityService.packMany([...new Set(messages.flatMap(message => message.pokeUserId ? [message.pokeUserId] : []))]).then(users => new Map(users.map(user => [user.id, user]))) : new Map<string, Packed<'UserLite'>>(),
		]);

		return Promise.all(messages.map(message => this.packMessageLiteFor1on1(message, { _hint_: { packedFiles, redPackets, replies, packedUsers } })));
	}

	@bindThis
	public async packMessageLiteForRoom(
		src: MiChatMessage['id'] | MiChatMessage,
		options?: {
			_hint_?: {
				packedFiles: Map<MiChatMessage['fileId'], Packed<'DriveFile'> | null>;
				packedUsers: Map<MiUser['id'], Packed<'UserLite'>>;
				redPackets?: Map<string, RedPacketSummary>;
				replies?: Map<string, Packed<'ChatMessage'>['reply']>;
			};
		},
	): Promise<Packed<'ChatMessageLiteForRoom'>> {
		const packedFiles = options?._hint_?.packedFiles;
		const packedUsers = options?._hint_?.packedUsers;

		const message = typeof src === 'object' ? src : await this.chatMessagesRepository.findOneByOrFail({ id: src });

		// userは削除されている可能性があるのでnull許容
		const reactions: { user: Packed<'UserLite'> | null; reaction: string; }[] = [];

		for (const record of message.reactions) {
			const [userId, reaction] = record.split('/');
			reactions.push({
				user: packedUsers?.get(userId) ?? (await this.userEntityService.pack(userId).catch(() => null)),
				reaction,
			});
		}

		return {
			id: message.id,
			createdAt: this.idService.parse(message.id).date.toISOString(),
			text: message.text,
			isPoke: message.isPoke ?? false,
			pokeUserId: message.pokeUserId ?? null,
			pokeUser: await this.packPokeUser(message, packedUsers),
			replyId: message.replyId ?? null,
			replyType: message.replyType ?? null,
			reply: message.replyId ? (options?._hint_?.replies ?? await this.packReplies([message])).get(message.replyId) ?? null : null,
			editedAt: message.editedAt ? message.editedAt.toISOString() : null,
			redPacketId: message.redPacketId ?? undefined,
			redPacket: message.redPacketId ? (options?._hint_?.redPackets?.get(message.redPacketId) ?? await this.redPacketService.packById(message.redPacketId)) : undefined,
			fromUserId: message.fromUserId,
			fromUser: packedUsers?.get(message.fromUserId) ?? (await this.userEntityService.pack(message.fromUser ?? message.fromUserId)),
			toRoomId: message.toRoomId!,
			systemEvent: await this.packSystemEvent(message, packedUsers),
			fileId: message.fileId,
			file: message.fileId ? (packedFiles?.get(message.fileId) ?? (await this.driveFileEntityService.pack(message.file ?? message.fileId))) : null,
			reactions: reactions.filter((r): r is { user: Packed<'UserLite'>; reaction: string; } => r.user != null),
		};
	}

	@bindThis
	public async packMessagesLiteForRoom(
		messages: MiChatMessage[],
	) {
		if (messages.length === 0) return [];

		const users = messages.map(x => x.fromUser ?? x.fromUserId);
		const reactedUserIds = messages.flatMap(x => [...x.reactions.map(r => r.split('/')[0]), ...(x.pokeUserId ? [x.pokeUserId] : []), ...(x.systemEvent?.userIds ?? [])]);

		for (const reactedUserId of reactedUserIds) {
			if (!users.some(x => typeof x === 'string' ? x === reactedUserId : x.id === reactedUserId)) {
				users.push(reactedUserId);
			}
		}

		const [packedUsers, packedFiles, redPackets, replies] = await Promise.all([
			this.userEntityService.packMany(users)
				.then(users => new Map(users.map(u => [u.id, u]))),
			this.driveFileEntityService.packMany(messages.map(m => m.file).filter(x => x != null))
				.then(files => new Map(files.map(f => [f.id, f]))),
			this.redPacketService.packByIds(messages.flatMap(message => message.redPacketId ? [message.redPacketId] : [])),
			this.packReplies(messages),
		]);

		return Promise.all(messages.map(message => this.packMessageLiteForRoom(message, { _hint_: { packedFiles, packedUsers, redPackets, replies } })));
	}

	@bindThis
	public async packRoom(
		src: MiChatRoom['id'] | MiChatRoom,
		me?: { id: MiUser['id'] },
		options?: {
			_hint_?: {
				packedOwners: Map<MiChatRoom['id'], Packed<'UserLite'>>;
				memberCounts?: Map<MiChatRoom['id'], number>;
				myMemberships?: Map<MiChatRoom['id'], MiChatRoomMembership | null | undefined>;
				myInvitations?: Map<MiChatRoom['id'], MiChatRoomInvitation | null | undefined>;
				avatarFiles?: Map<MiDriveFile['id'], MiDriveFile>;
			};
		},
	): Promise<Packed<'ChatRoom'>> {
		const room = typeof src === 'object' ? src : await this.chatRoomsRepository.findOneByOrFail({ id: src });
		const avatarFile = room.avatarId
			? options?._hint_?.avatarFiles?.get(room.avatarId) ?? room.avatar ?? await this.driveFilesRepository.findOneBy({ id: room.avatarId })
			: null;

		const membership = me && me.id !== room.ownerId ? (options?._hint_?.myMemberships?.has(room.id) ? options._hint_.myMemberships.get(room.id) : await this.chatRoomMembershipsRepository.findOneBy({ roomId: room.id, userId: me.id })) : null;
		const invitation = me && me.id !== room.ownerId ? (options?._hint_?.myInvitations?.has(room.id) ? options._hint_.myInvitations.get(room.id) : await this.chatRoomInvitationsRepository.findOneBy({ roomId: room.id, userId: me.id })) : null;
		const mutedUntil = me?.id === room.ownerId ? room.ownerMutedUntil : membership?.mutedUntil;
		const isMuted = Boolean((me?.id === room.ownerId ? room.ownerIsMuted : membership?.isMuted) && (mutedUntil == null || mutedUntil.getTime() > Date.now()));

		return {
			id: room.id,
			createdAt: this.idService.parse(room.id).date.toISOString(),
			name: room.name,
			memberCount: (options?._hint_?.memberCounts?.get(room.id) ?? await this.chatRoomMembershipsRepository.countBy({ roomId: room.id })) + 1,
			description: room.description,
			avatarId: room.avatarId ?? null,
			avatarUrl: avatarFile ? this.driveFileEntityService.getPublicUrl(avatarFile) : null,
			joinPolicy: room.joinPolicy,
			isSilenced: Boolean(room.isSilenced && (room.silenceUntil == null || room.silenceUntil.getTime() > Date.now())),
			silenceUntil: room.silenceUntil?.toISOString() ?? null,
			isMember: me ? room.ownerId === me.id || membership != null : undefined,
			myRole: me?.id === room.ownerId ? 'owner' : membership?.role ?? null,
			announcement: room.announcement ?? '',
			ownerNickname: room.ownerNickname ?? '',
			myNickname: me?.id === room.ownerId ? room.ownerNickname ?? '' : membership?.nickname ?? '',
			myIsSilenced: Boolean(membership?.isSilenced && (membership.silenceUntil == null || membership.silenceUntil.getTime() > Date.now())),
			mySilenceUntil: membership?.silenceUntil?.toISOString() ?? null,
			ownerId: room.ownerId,
			owner: options?._hint_?.packedOwners.get(room.ownerId) ?? (await this.userEntityService.pack(room.owner ?? room.ownerId, me)),
			isMuted,
			mutedUntil: isMuted ? mutedUntil?.toISOString() ?? null : null,
			invitationExists: invitation != null && !invitation.isRequest && !invitation.ignored && room.joinPolicy !== 'closed',
			joinRequestPending: invitation?.isRequest === true && !invitation.ignored,
		};
	}

	@bindThis
	public async packRooms(
		rooms: (MiChatRoom | MiChatRoom['id'])[],
		me: { id: MiUser['id'] },
	) {
		if (rooms.length === 0) return [];

		const _rooms = rooms.filter((room): room is MiChatRoom => typeof room !== 'string');
		if (_rooms.length !== rooms.length) {
			_rooms.push(
				...(await this.chatRoomsRepository.find({
					where: {
						id: In(rooms.filter((room): room is string => typeof room === 'string')),
					},
					relations: { owner: true },
				})),
			);
		}

		if (_rooms.length === 0) return [];

		const owners = _rooms.map(x => x.owner ?? x.ownerId);

		const [packedOwners, myMemberships, myInvitations, memberCounts, avatarFiles] = await Promise.all([
			this.userEntityService.packMany(owners, me)
				.then(users => new Map(users.map(u => [u.id, u]))),
			this.chatRoomMembershipsRepository.find({
				where: {
					roomId: In(_rooms.map(x => x.id)),
					userId: me.id,
				},
			}).then(memberships => new Map(_rooms.map(r => [r.id, memberships.find(m => m.roomId === r.id)]))),
			this.chatRoomInvitationsRepository.find({
				where: {
					roomId: In(_rooms.map(x => x.id)),
					userId: me.id,
				},
			}).then(invitations => new Map(_rooms.map(r => [r.id, invitations.find(i => i.roomId === r.id)]))),
			this.chatRoomMembershipsRepository.createQueryBuilder('membership')
				.select('membership.roomId', 'roomId')
				.addSelect('COUNT(*)', 'count')
				.where('membership.roomId IN (:...roomIds)', { roomIds: _rooms.map(r => r.id) })
				.groupBy('membership.roomId')
				.getRawMany<{ roomId: string; count: string }>()
				.then(counts => {
					const byRoom = new Map(counts.map(count => [count.roomId, Number(count.count)]));
					return new Map(_rooms.map(room => [room.id, byRoom.get(room.id) ?? 0]));
				}),
			this.driveFilesRepository.findBy({ id: In(_rooms.flatMap(room => room.avatarId ? [room.avatarId] : [])) })
				.then(files => new Map(files.map(file => [file.id, file]))),
		]);

		return Promise.all(_rooms.map(room => this.packRoom(room, me, { _hint_: { packedOwners, myMemberships, myInvitations, memberCounts, avatarFiles } })));
	}

	@bindThis
	public async packRoomInvitation(
		src: MiChatRoomInvitation['id'] | MiChatRoomInvitation,
		me: { id: MiUser['id'] },
		options?: {
			_hint_?: {
				packedRooms: Map<MiChatRoomInvitation['roomId'], Packed<'ChatRoom'>>;
				packedUsers: Map<MiChatRoomInvitation['id'], Packed<'UserLite'>>;
			};
		},
	): Promise<Packed<'ChatRoomInvitation'>> {
		const invitation = typeof src === 'object' ? src : await this.chatRoomInvitationsRepository.findOneByOrFail({ id: src });

		return {
			id: invitation.id,
			isRequest: invitation.isRequest ?? false,
			requestMessage: invitation.requestMessage ?? null,
			createdAt: this.idService.parse(invitation.id).date.toISOString(),
			roomId: invitation.roomId,
			room: options?._hint_?.packedRooms.get(invitation.roomId) ?? (await this.packRoom(invitation.room ?? invitation.roomId, me)),
			userId: invitation.userId,
			user: options?._hint_?.packedUsers.get(invitation.userId) ?? (await this.userEntityService.pack(invitation.user ?? invitation.userId, me)),
		};
	}

	@bindThis
	public async packRoomInvitations(
		invitations: MiChatRoomInvitation[],
		me: { id: MiUser['id'] },
	) {
		if (invitations.length === 0) return [];

		const [packedRooms, packedUsers] = await Promise.all([
			this.packRooms([...new Set(invitations.map(invitation => invitation.roomId))], me).then(rooms => new Map(rooms.map(room => [room.id, room]))),
			this.userEntityService.packMany([...new Set(invitations.map(invitation => invitation.userId))], me).then(users => new Map(users.map(user => [user.id, user]))),
		]);
		return Promise.all(invitations.map(invitation => this.packRoomInvitation(invitation, me, { _hint_: { packedRooms, packedUsers } })));
	}

	@bindThis
	public async packRoomMembership(
		src: MiChatRoomMembership['id'] | MiChatRoomMembership,
		me: { id: MiUser['id'] },
		options?: {
			populateUser?: boolean;
			populateRoom?: boolean;
			_hint_?: {
				packedRooms: Map<MiChatRoomMembership['roomId'], Packed<'ChatRoom'>>;
				packedUsers: Map<MiChatRoomMembership['id'], Packed<'UserLite'>>;
			};
		},
	): Promise<Packed<'ChatRoomMembership'>> {
		const membership = typeof src === 'object' ? src : await this.chatRoomMembershipsRepository.findOneByOrFail({ id: src });

		return {
			id: membership.id,
			createdAt: this.idService.parse(membership.id).date.toISOString(),
			userId: membership.userId,
			role: membership.role,
			nickname: membership.nickname ?? '',
			isSilenced: Boolean(membership.isSilenced && (membership.silenceUntil == null || membership.silenceUntil.getTime() > Date.now())),
			silenceUntil: membership.silenceUntil?.toISOString() ?? null,
			user: options?.populateUser ? (options._hint_?.packedUsers.get(membership.userId) ?? (await this.userEntityService.pack(membership.user ?? membership.userId, me))) : undefined,
			roomId: membership.roomId,
			room: options?.populateRoom ? (options._hint_?.packedRooms.get(membership.roomId) ?? (await this.packRoom(membership.room ?? membership.roomId, me))) : undefined,
		};
	}

	@bindThis
	public async packRoomMemberships(
		memberships: MiChatRoomMembership[],
		me: { id: MiUser['id'] },
		options: {
			populateUser?: boolean;
			populateRoom?: boolean;
		} = {},
	) {
		if (memberships.length === 0) return [];

		const users = memberships.map(x => x.user ?? x.userId);
		const rooms = memberships.map(x => x.room ?? x.roomId);

		const [packedUsers, packedRooms] = await Promise.all([
			options.populateUser ? this.userEntityService.packMany(users, me).then(users => new Map(users.map(u => [u.id, u]))) : new Map(),
			options.populateRoom ? this.packRooms(rooms, me).then(rooms => new Map(rooms.map(r => [r.id, r]))) : new Map(),
		]);

		return Promise.all(memberships.map(membership => this.packRoomMembership(membership, me, { ...options, _hint_: { packedUsers, packedRooms } })));
	}
}
