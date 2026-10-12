/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { MiChatRoom } from '@/models/ChatRoom.js';
import { MiChatRoomMembership } from '@/models/ChatRoomMembership.js';
import { MiChatRoomInvitation } from '@/models/ChatRoomInvitation.js';
import { MiUser } from '@/models/User.js';
import { IdService } from '@/core/IdService.js';
import { api, castAsError, initTestDb, signup, uploadFile } from '../utils.js';
import type { DataSource } from 'typeorm';
import type * as Misskey from 'misskey-js';

describe('chat message editing', () => {
	let db: DataSource;
	let alice: Misskey.entities.SignupResponse;
	let bob: Misskey.entities.SignupResponse;

	beforeAll(async () => {
		if (!/test/i.test(loadConfig().db.db)) throw new Error('An isolated test database is required.');
		db = await initTestDb(true);
		// 首个账户会成为站点管理员，权限测试使用后续创建的普通账户。
		await signup({ username: 'chatroot' });
		alice = await signup({ username: 'chatalice' });
		bob = await signup({ username: 'chatbob' });
		await api('i/update', { chatScope: 'everyone' }, alice);
		await api('i/update', { chatScope: 'everyone' }, bob);
	}, 120000);
	afterAll(async () => { if (db?.isInitialized) await db.destroy(); });

	test('审核群可搜索，重复申请不授予聊天权限，群主同意后只加入一次', async () => {
		const owner = await signup({ username: 'chatapprovalowner' });
		const applicant = await signup({ username: 'chatapplicant' });
		expect(applicant.token).toBeTypeOf('string');
		const created = await api('chat/rooms/create', { name: 'approval discovery', joinPolicy: 'approval' }, owner);
		expect(created.status).toBe(200);
		const roomId = created.body.id;
		const secret = await api('chat/messages/create-to-room', { toRoomId: roomId, text: 'members only' }, owner);
		const discovery = await api('chat/rooms/search', { query: 'approval discovery' }, applicant);
		expect(discovery.status, JSON.stringify(discovery.body)).toBe(200);
		expect(discovery.body.some(room => room.id === roomId)).toBe(true);
		const submissions = await Promise.all([1, 2].map(() => api('chat/rooms/requests/create', { roomId, requestMessage: '  请让我加入  ' }, applicant)));
		for (const submission of submissions) {
			expect(submission.status).toBe(200);
			expect(submission.body).toMatchObject({ isMember: false, joinRequestPending: true, invitationExists: false });
		}
		expect(await db.getRepository(MiChatRoomInvitation).countBy({ roomId, userId: applicant.id, isRequest: true })).toBe(1);
		expect((await api('chat/rooms/join', { roomId }, applicant)).status).toBe(400);
		expect((await api('chat/messages/room-timeline', { roomId }, applicant)).status).toBe(400);
		expect((await api('chat/messages/show', { messageId: secret.body.id }, applicant)).status).toBe(400);
		expect((await api('chat/messages/create-to-room', { toRoomId: roomId, text: 'not yet' }, applicant)).status).toBe(400);
		expect((await api('chat/rooms/invitations/inbox', {}, applicant)).body.some(invitation => invitation.roomId === roomId)).toBe(false);
		expect((await api('chat/rooms/invitations/outbox', { roomId, isRequest: true }, applicant)).status).toBe(400);
		const requests = await api('chat/rooms/invitations/outbox', { roomId, isRequest: true }, owner);
		expect(requests.body).toHaveLength(1);
		expect(requests.body[0]).toMatchObject({ isRequest: true, requestMessage: '请让我加入' });
		const requestId = requests.body[0].id;
		expect((await api('chat/rooms/requests/answer', { roomId, requestId, approve: true }, applicant)).status).toBe(400);
		const approvals = await Promise.all([1, 2].map(() => api('chat/rooms/requests/answer', { roomId, requestId, approve: true }, owner)));
		expect(approvals.map(result => result.status)).toEqual([204, 204]);
		expect(await db.getRepository(MiChatRoomMembership).countBy({ roomId, userId: applicant.id })).toBe(1);
		expect((await api('chat/rooms/show', { roomId }, applicant)).body).toMatchObject({ isMember: true, joinRequestPending: false, memberCount: 2 });
		const timeline = await api('chat/messages/room-timeline', { roomId }, applicant);
		expect(timeline.status).toBe(200);
		expect(timeline.body.filter(message => message.systemEvent?.userIds.includes(applicant.id))).toHaveLength(1);
		expect(timeline.body.some(message => message.id === secret.body.id)).toBe(true);
	});

	test('群管理员可拒绝申请，旧审核不能处理新申请，关闭群与仅邀请群拒绝主动申请', async () => {
		const owner = await signup({ username: 'chatrequestowner' });
		const administrator = await signup({ username: 'chatrequestadmin' });
		const applicant = await signup({ username: 'chatrequestuser' });
		const created = await api('chat/rooms/create', { joinPolicy: 'public' }, owner);
		const roomId = created.body.id;
		expect((await api('chat/rooms/join', { roomId }, administrator)).status).toBe(204);
		expect((await api('chat/rooms/members/update', { roomId, userId: administrator.id, role: 'administrator' }, owner)).status).toBe(200);
		await api('chat/rooms/update', { roomId, joinPolicy: 'approval' }, owner);
		await api('chat/rooms/requests/create', { roomId }, applicant);
		const initial = (await api('chat/rooms/invitations/outbox', { roomId, isRequest: true }, administrator)).body[0];
		for (let i = 0; i < 2; i++) expect((await api('chat/rooms/requests/answer', { roomId, requestId: initial.id, approve: false }, administrator)).status).toBe(204);
		expect((await api('chat/rooms/show', { roomId }, applicant)).body).toMatchObject({ isMember: false, joinRequestPending: false });
		await api('chat/rooms/requests/create', { roomId }, applicant);
		const current = (await api('chat/rooms/invitations/outbox', { roomId, isRequest: true }, administrator)).body[0];
		expect(current.id).not.toBe(initial.id);
		await api('chat/rooms/requests/answer', { roomId, requestId: initial.id, approve: true }, administrator);
		expect(await db.getRepository(MiChatRoomMembership).countBy({ roomId, userId: applicant.id })).toBe(0);
		await api('chat/rooms/update', { roomId, joinPolicy: 'closed' }, owner);
		expect((await api('chat/rooms/requests/answer', { roomId, requestId: current.id, approve: true }, administrator)).status).toBe(400);
		expect((await api('chat/rooms/requests/create', { roomId }, applicant)).status).toBe(400);
		expect((await api('chat/rooms/requests/answer', { roomId, requestId: current.id, approve: false }, administrator)).status).toBe(204);
		await api('chat/rooms/update', { roomId, joinPolicy: 'invitation' }, owner);
		expect((await api('chat/rooms/requests/create', { roomId }, applicant)).status).toBe(400);
		expect((await api('chat/rooms/join', { roomId }, applicant)).status).toBe(400);
	});

	test('并发同意两个申请时只有一人占用最后名额，满员失败保留另一份申请', async () => {
		const owner = await signup({ username: 'chatapprovalcapacity' });
		const created = await api('chat/rooms/create', { joinPolicy: 'approval' }, owner);
		const roomId = created.body.id;
		const ids = new IdService({ id: 'aidx' } as never);
		const fillers = Array.from({ length: 48 }, () => {
			const id = ids.gen();
			return { id, username: `approval${id}`, usernameLower: `approval${id}` };
		});
		await db.getRepository(MiUser).insert(fillers);
		await db.getRepository(MiChatRoomMembership).insert(fillers.map(user => ({ id: ids.gen(), roomId, userId: user.id })));
		for (const applicant of [alice, bob]) expect((await api('chat/rooms/requests/create', { roomId }, applicant)).status).toBe(200);
		const requests = (await api('chat/rooms/invitations/outbox', { roomId, isRequest: true }, owner)).body;
		const approvals = await Promise.all(requests.map(request => api('chat/rooms/requests/answer', { roomId, requestId: request.id, approve: true }, owner)));
		expect(approvals.filter(result => result.status === 204)).toHaveLength(1);
		const full = approvals.find(result => result.status === 400)!;
		expect(castAsError(full.body).error.code).toBe('CHAT_ROOM_FULL');
		expect(await db.getRepository(MiChatRoomMembership).countBy({ roomId })).toBe(49);
		expect(await db.getRepository(MiChatRoomInvitation).countBy({ roomId, isRequest: true })).toBe(1);
	});

	test('sender can edit own direct message and the recipient sees the update', async () => {
		const created = await api('chat/messages/create-to-user', { toUserId: bob.id, text: 'original' }, alice);
		expect(created.status).toBe(200);
		const messageId = created.body.id;

		const edited = await api('chat/messages/update', { messageId, text: '  edited  ' }, alice);
		expect(edited.status).toBe(200);
		expect(edited.body.text).toBe('edited');
		expect(edited.body.editedAt).not.toBeNull();

		const shown = await api('chat/messages/show', { messageId }, bob);
		expect(shown.status).toBe(200);
		expect(shown.body.text).toBe('edited');
		expect(shown.body.editedAt).not.toBeNull();
	});

	test('editing rejects empty text and other users\' messages', async () => {
		const created = await api('chat/messages/create-to-user', { toUserId: bob.id, text: 'hello' }, alice);
		expect(created.status).toBe(200);
		const messageId = created.body.id;

		const empty = await api('chat/messages/update', { messageId, text: '   ' }, alice);
		expect(empty.status).toBe(400);
		expect(castAsError(empty.body).error.code).toBe('CONTENT_REQUIRED');

		const foreign = await api('chat/messages/update', { messageId, text: 'hijack' }, bob);
		expect(foreign.status).toBe(400);
		expect(castAsError(foreign.body).error.code).toBe('NO_SUCH_MESSAGE');
	});

	test('editing can clear text when the message keeps a file', async () => {
		const file = (await uploadFile(alice)).body!;
		const created = await api('chat/messages/create-to-user', { toUserId: bob.id, fileId: file.id }, alice);
		expect(created.status).toBe(200);
		const messageId = created.body.id;

		const withText = await api('chat/messages/update', { messageId, text: 'caption' }, alice);
		expect(withText.status).toBe(200);
		expect(withText.body.text).toBe('caption');

		const cleared = await api('chat/messages/update', { messageId, text: null }, alice);
		expect(cleared.status).toBe(200);
		expect(cleared.body.text).toBeNull();
		expect(cleared.body.file).not.toBeNull();
		expect(cleared.body.editedAt).not.toBeNull();
	});

	test('room messages can be edited and report the edit time', async () => {
		const room = await api('chat/rooms/create', { name: 'edit test' }, alice);
		expect(room.status).toBe(200);
		const message = await api('chat/messages/create-to-room', { toRoomId: room.body.id, text: 'room original' }, alice);
		expect(message.status).toBe(200);

		const edited = await api('chat/messages/update', { messageId: message.body.id, text: 'room edited' }, alice);
		expect(edited.status).toBe(200);
		expect(edited.body.text).toBe('room edited');
		expect(edited.body.editedAt).not.toBeNull();
	});

	test.each(['reply', 'quote'] as const)('%s keeps the reference separate from a full-length response', async replyType => {
		const original = await api('chat/messages/create-to-user', { toUserId: bob.id, text: 'a'.repeat(2000) }, alice);
		expect(original.status).toBe(200);
		const response = await api('chat/messages/create-to-user', { toUserId: alice.id, text: 'b'.repeat(2000), replyId: original.body.id, replyType }, bob);
		expect(response.status).toBe(200);
		expect(response.body.text).toBe('b'.repeat(2000));
		expect(response.body.replyId).toBe(original.body.id);
		expect(response.body.replyType).toBe(replyType);
		expect(response.body.reply?.fromUser.id).toBe(alice.id);
		expect(response.body.reply?.text).toHaveLength(200);
		const timeline = await api('chat/messages/user-timeline', { userId: bob.id }, alice);
		expect(timeline.body.find(message => message.id === response.body.id)?.reply?.id).toBe(original.body.id);
		const shown = await api('chat/messages/show', { messageId: response.body.id }, alice);
		expect(shown.body.reply?.id).toBe(original.body.id);
		await api('chat/messages/delete', { messageId: original.body.id }, alice);
		const afterDelete = await api('chat/messages/show', { messageId: response.body.id }, bob);
		expect(afterDelete.body.reply).toBeNull();
		expect(afterDelete.body.replyType).toBe(replyType);
		expect(afterDelete.body.text).toBe('b'.repeat(2000));
	});

	test('room references stay in the same room and do not recursively include earlier replies', async () => {
		const room = await api('chat/rooms/create', { name: 'reference test' }, alice);
		const otherRoom = await api('chat/rooms/create', { name: 'other reference test' }, alice);
		const original = await api('chat/messages/create-to-room', { toRoomId: room.body.id, text: 'original' }, alice);
		const response = await api('chat/messages/create-to-room', { toRoomId: room.body.id, text: 'answer', replyId: original.body.id, replyType: 'quote' }, alice);
		expect(response.status).toBe(200);
		expect(response.body.reply?.text).toBe('original');
		const nested = await api('chat/messages/create-to-room', { toRoomId: room.body.id, text: 'next', replyId: response.body.id }, alice);
		expect(nested.body.reply).not.toHaveProperty('reply');
		const timeline = await api('chat/messages/room-timeline', { roomId: room.body.id }, alice);
		expect(timeline.body.find(message => message.id === response.body.id)?.reply?.id).toBe(original.body.id);
		const crossRoom = await api('chat/messages/create-to-room', { toRoomId: otherRoom.body.id, text: 'leak', replyId: original.body.id }, alice);
		expect(castAsError(crossRoom.body).error.code).toBe('NO_SUCH_REPLY');
		const roomToDirect = await api('chat/messages/create-to-user', { toUserId: bob.id, text: 'leak', replyId: original.body.id }, alice);
		expect(castAsError(roomToDirect.body).error.code).toBe('NO_SUCH_REPLY');
	});

	test('rejects private references from another conversation, even for its sender', async () => {
		const charlie = await signup({ username: 'chatcharlie' });
		await api('i/update', { chatScope: 'everyone' }, charlie);
		const original = await api('chat/messages/create-to-user', { toUserId: bob.id, text: 'private' }, alice);
		const ownOtherConversation = await api('chat/messages/create-to-user', { toUserId: charlie.id, text: 'leak', replyId: original.body.id }, alice);
		expect(castAsError(ownOtherConversation.body).error.code).toBe('NO_SUCH_REPLY');
		const outsider = await api('chat/messages/create-to-user', { toUserId: alice.id, text: 'leak', replyId: original.body.id }, charlie);
		expect(castAsError(outsider.body).error.code).toBe('NO_SUCH_REPLY');
		const room = await api('chat/rooms/create', { name: 'private leak test' }, alice);
		const directToRoom = await api('chat/messages/create-to-room', { toRoomId: room.body.id, text: 'leak', replyId: original.body.id }, alice);
		expect(castAsError(directToRoom.body).error.code).toBe('NO_SUCH_REPLY');
	});

	test.each([false, true])('paginates distinct conversations by their latest message with room=%s', async room => {
		let firstMessage: { id: string };
		let secondMessage: { id: string };
		if (room) {
			const firstRoom = await api('chat/rooms/create', { name: 'first paginated room' }, alice);
			const secondRoom = await api('chat/rooms/create', { name: 'second paginated room' }, alice);
			expect(firstRoom.status).toBe(200);
			expect(secondRoom.status).toBe(200);
			await api('chat/messages/create-to-room', { toRoomId: firstRoom.body.id, text: 'older message' }, alice);
			secondMessage = (await api('chat/messages/create-to-room', { toRoomId: secondRoom.body.id, text: 'second conversation' }, alice)).body;
			firstMessage = (await api('chat/messages/create-to-room', { toRoomId: firstRoom.body.id, text: 'latest message' }, alice)).body;
		} else {
			const peer = await signup({ username: 'chathistorypeer' });
			expect((await api('i/update', { chatScope: 'everyone' }, alice)).status).toBe(200);
			expect((await api('i/update', { chatScope: 'everyone' }, bob)).status).toBe(200);
			expect((await api('chat/messages/create-to-user', { toUserId: bob.id, text: 'older message' }, alice)).status).toBe(200);
			const second = await api('chat/messages/create-to-user', { toUserId: alice.id, text: 'second conversation' }, peer);
			const first = await api('chat/messages/create-to-user', { toUserId: alice.id, text: 'latest message' }, bob);
			expect(second.status).toBe(200);
			expect(first.status).toBe(200);
			secondMessage = second.body;
			firstMessage = first.body;
		}
		const all = await api('chat/history', { room, limit: 100 }, alice);
		expect(all.status).toBe(200);
		expect(all.body.slice(0, 2).map(message => message.id)).toEqual([firstMessage.id, secondMessage.id]);
		const firstPage = await api('chat/history', { room, limit: 1, offset: 0 }, alice);
		const secondPage = await api('chat/history', { room, limit: 1, offset: 1 }, alice);
		expect(firstPage.body.map(message => message.id)).toEqual([firstMessage.id]);
		expect(secondPage.body.map(message => message.id)).toEqual([secondMessage.id]);
		expect((await api('chat/history', { room, limit: 100, offset: 2 }, alice)).body.map(message => message.id)).toEqual(all.body.slice(2).map(message => message.id));
		expect((await api('chat/history', { room, offset: all.body.length }, alice)).body).toEqual([]);
		expect((await api('chat/history', { room, offset: -1 }, alice)).status).toBe(400);
	});

	test('群聊搜索只发现公开群或有权查看的群，加入前不能读取聊天记录', async () => {
		const visitor = await signup({ username: 'chatsearchvisitor' });
		await api('i/update', { chatScope: 'everyone' }, visitor);
		const prefix = 'search-policy-';
		const publicRoom = await api('chat/rooms/create', { name: `${prefix}public`, description: '公开群简介', joinPolicy: 'public' }, alice);
		const privateRoom = await api('chat/rooms/create', { name: `${prefix}private`, joinPolicy: 'invitation' }, alice);
		expect(publicRoom.status).toBe(200);
		expect(privateRoom.status).toBe(200);
		expect(publicRoom.body.joinPolicy).toBe('public');
		expect(publicRoom.body.isMember).toBe(true);
		const found = await api('chat/rooms/search', { query: prefix }, visitor);
		expect(found.status).toBe(200);
		expect(found.body.map(room => room.id)).toEqual([publicRoom.body.id]);
		expect(found.body[0].isMember).toBe(false);
		const byPublicId = await api('chat/rooms/search', { query: ` ${publicRoom.body.id} ` }, visitor);
		expect(byPublicId.status).toBe(200);
		expect(byPublicId.body.map(room => room.id)).toEqual([publicRoom.body.id]);
		const byPrivateId = await api('chat/rooms/search', { query: privateRoom.body.id }, visitor);
		expect(byPrivateId.status).toBe(200);
		expect(byPrivateId.body).toEqual([]);
		expect((await api('chat/rooms/show', { roomId: privateRoom.body.id }, visitor)).status).toBe(400);
		expect((await api('chat/messages/room-timeline', { roomId: publicRoom.body.id }, visitor)).status).toBe(400);
		expect((await api('chat/rooms/join', { roomId: publicRoom.body.id }, visitor)).status).toBe(204);
		expect((await api('chat/messages/room-timeline', { roomId: publicRoom.body.id }, visitor)).status).toBe(200);
		expect((await api('chat/rooms/show', { roomId: publicRoom.body.id }, visitor)).body.isMember).toBe(true);
		expect((await api('chat/rooms/invitations/create', { roomId: privateRoom.body.id, userId: visitor.id }, alice)).status).toBe(200);
		const invited = await api('chat/rooms/search', { query: prefix }, visitor);
		expect(invited.body.map(room => room.id)).toContain(privateRoom.body.id);
		const invitedById = await api('chat/rooms/search', { query: privateRoom.body.id }, visitor);
		expect(invitedById.status).toBe(200);
		expect(invitedById.body.map(room => room.id)).toEqual([privateRoom.body.id]);
		const descriptionSearch = await api('chat/rooms/search', { query: '公开群简介' }, visitor);
		expect(descriptionSearch.body.map(room => room.id)).toEqual([publicRoom.body.id]);
	});

	test('仅限邀请须有有效邀请，禁止加入立即阻止邀请和加入且仅群主能改策略', async () => {
		const visitor = await signup({ username: 'chatjoinvisitor' });
		await api('i/update', { chatScope: 'everyone' }, visitor);
		const created = await api('chat/rooms/create', { name: 'join-policy-test', joinPolicy: 'invitation' }, alice);
		expect(created.status).toBe(200);
		const roomId = created.body.id;
		expect(created.body.joinPolicy).toBe('invitation');
		const denied = await api('chat/rooms/join', { roomId }, visitor);
		expect(denied.status).toBe(400);
		expect(castAsError(denied.body).error.code).toBe('CHAT_ROOM_JOIN_DENIED');
		expect((await api('chat/rooms/update', { roomId, joinPolicy: 'public' }, visitor)).status).toBe(400);
		expect((await api('chat/rooms/invitations/create', { roomId, userId: visitor.id }, alice)).status).toBe(200);
		expect((await api('chat/rooms/update', { roomId, joinPolicy: 'closed' }, alice)).body.joinPolicy).toBe('closed');
		expect((await api('chat/rooms/join', { roomId }, visitor)).status).toBe(400);
		expect((await api('chat/rooms/invitations/create', { roomId, userId: bob.id }, alice)).status).toBe(400);
		expect((await api('chat/rooms/update', { roomId, joinPolicy: 'invitation' }, alice)).status).toBe(200);
		expect((await api('chat/rooms/join', { roomId }, visitor)).status).toBe(204);
		expect((await api('chat/rooms/join', { roomId }, visitor)).status).toBe(204);
		expect((await api('chat/rooms/show', { roomId }, visitor)).body.memberCount).toBe(2);
	});

	test('群头像使用自己的图片，支持更换、恢复默认和删除文件后回到默认', async () => {
		const owner = await signup({ username: 'chatavatarowner' });
		const first = await uploadFile(owner);
		const second = await uploadFile(owner);
		expect(first.status).toBe(200);
		expect(second.status).toBe(200);
		const created = await api('chat/rooms/create', { name: 'avatar-room', avatarId: first.body!.id, joinPolicy: 'public' }, owner);
		expect(created.status).toBe(200);
		const roomId = created.body.id;
		expect(created.body.avatarId).toBe(first.body!.id);
		expect(created.body.avatarUrl).toBeTruthy();
		const found = await api('chat/rooms/search', { query: 'avatar-room' }, bob);
		expect(found.body.find(room => room.id === roomId)?.avatarUrl).toBe(created.body.avatarUrl);
		const renamed = await api('chat/rooms/update', { roomId, name: 'renamed-avatar-room' }, owner);
		expect(renamed.body.avatarId).toBe(first.body!.id);
		const replaced = await api('chat/rooms/update', { roomId, avatarId: second.body!.id }, owner);
		expect(replaced.body.avatarId).toBe(second.body!.id);
		expect(replaced.body.avatarUrl).toBeTruthy();
		const reset = await api('chat/rooms/update', { roomId, avatarId: null }, owner);
		expect(reset.body.avatarId).toBeNull();
		expect(reset.body.avatarUrl).toBeNull();
		await api('chat/rooms/update', { roomId, avatarId: first.body!.id }, owner);
		expect((await api('drive/files/delete', { fileId: first.body!.id }, owner)).status).toBe(204);
		const shown = await api('chat/rooms/show', { roomId }, owner);
		expect(shown.body.avatarId).toBeNull();
		expect(shown.body.avatarUrl).toBeNull();
	});

	test('创建和更新群头像均拒绝他人的文件、非图片和非群主更新', async () => {
		const owner = await signup({ username: 'chatavatarsecurity' });
		const foreign = await uploadFile(bob);
		const audio = await uploadFile(owner, { path: 'kick_gaba7.mp3' });
		expect(foreign.status).toBe(200);
		expect(audio.status).toBe(200);
		expect(audio.body!.type).toMatch(/^audio\//);
		const foreignCreate = await api('chat/rooms/create', { name: 'foreign-avatar', avatarId: foreign.body!.id }, owner);
		expect(foreignCreate.status).toBe(400);
		expect(castAsError(foreignCreate.body).error.code).toBe('NO_SUCH_AVATAR');
		const audioCreate = await api('chat/rooms/create', { name: 'audio-avatar', avatarId: audio.body!.id }, owner);
		expect(audioCreate.status).toBe(400);
		expect(castAsError(audioCreate.body).error.code).toBe('AVATAR_NOT_AN_IMAGE');
		const created = await api('chat/rooms/create', { name: 'valid-default-avatar' }, owner);
		expect(created.status).toBe(200);
		const roomId = created.body.id;
		expect(created.body.avatarId).toBeNull();
		expect(created.body.avatarUrl).toBeNull();
		const foreignUpdate = await api('chat/rooms/update', { roomId, avatarId: foreign.body!.id }, owner);
		expect(foreignUpdate.status).toBe(400);
		expect(castAsError(foreignUpdate.body).error.code).toBe('NO_SUCH_AVATAR');
		const audioUpdate = await api('chat/rooms/update', { roomId, avatarId: audio.body!.id }, owner);
		expect(audioUpdate.status).toBe(400);
		expect(castAsError(audioUpdate.body).error.code).toBe('AVATAR_NOT_AN_IMAGE');
		expect((await api('chat/rooms/update', { roomId, avatarId: foreign.body!.id }, bob)).status).toBe(400);
		const unchanged = await api('chat/rooms/show', { roomId }, owner);
		expect(unchanged.body.avatarId).toBeNull();
	});

	test('批量建群直接加入成员并保存真实系统提示，拒收和屏蔽时不创建半成品', async () => {
		const owner = await signup({ username: 'chatbatchowner' });
		const first = await signup({ username: 'chatbatchfirst' });
		const second = await signup({ username: 'chatbatchsecond' });
		for (const member of [first, second]) await api('i/update', { chatScope: 'everyone' }, member);
		await api('i/update', { chatScope: 'none' }, second);
		const request = { initialUserIds: [first.id, second.id], joinPolicy: 'invitation' as const };
		const privacyDenied = await api('chat/rooms/create', request, owner);
		expect(privacyDenied.status).toBe(400);
		expect(castAsError(privacyDenied.body).error).toMatchObject({ code: 'INVALID_INVITEES', info: { reason: 'privacy', userId: second.id } });
		expect(await db.getRepository(MiChatRoom).countBy({ ownerId: owner.id })).toBe(0);
		await api('i/update', { chatScope: 'everyone' }, second);
		await api('blocking/create', { userId: owner.id }, second);
		const blocked = await api('chat/rooms/create', request, owner);
		expect(blocked.status).toBe(400);
		expect(castAsError(blocked.body).error.info).toEqual({ reason: 'blocked', userId: second.id });
		expect(await db.getRepository(MiChatRoom).countBy({ ownerId: owner.id })).toBe(0);
		await api('blocking/delete', { userId: owner.id }, second);
		const created = await api('chat/rooms/create', request, owner);
		expect(created.status).toBe(200);
		expect(created.body.memberCount).toBe(3);
		expect(created.body.name).toBe('chatbatchowner的群组');
		expect(created.body.announcement).toBe('');
		const roomId = created.body.id;
		expect((await api('chat/rooms/show', { roomId }, first)).body.isMember).toBe(true);
		const timeline = await api('chat/messages/room-timeline', { roomId }, first);
		expect(timeline.body).toHaveLength(1);
		const system = timeline.body[0];
		expect(system).toMatchObject({ fromUserId: owner.id, systemEvent: { type: 'membersJoined', userIds: [first.id, second.id], invited: true } });
		expect(system.systemEvent?.users.map(user => user.id).sort()).toEqual([first.id, second.id].sort());
		expect((await api('chat/messages/update', { messageId: system.id, text: 'fake event' }, owner)).status).toBe(400);
		const deleted = await api('chat/messages/delete', { messageId: system.id }, owner);
		expect(deleted.status).toBe(400);
		expect(castAsError(deleted.body).error.code).toBe('NO_SUCH_MESSAGE');
		expect((await api('chat/messages/show', { messageId: system.id }, owner)).body.systemEvent).toMatchObject({ type: 'membersJoined' });
		expect((await api('chat/messages/react', { messageId: system.id, reaction: '👍' }, first)).status).toBe(400);
		const forged = await api('chat/messages/create-to-room', { toRoomId: roomId, text: 'ordinary', systemEvent: { type: 'membersJoined', userIds: [owner.id], invited: true } } as never, first);
		expect(forged.status).toBe(200);
		expect(forged.body.systemEvent).toBeNull();
	});

	test.each(['followers', 'following', 'mutual'] as const)('邀请与私聊、升级建群遵守 %s 的关注方向', async scope => {
		const owner = await signup({ username: `chat${scope}owner` });
		const invitee = await signup({ username: `chat${scope}invitee` });
		const peer = await signup({ username: `chat${scope}peer` });
		await api('i/update', { chatScope: scope }, invitee);
		await api('i/update', { chatScope: 'everyone' }, peer);
		const room = await api('chat/rooms/create', { joinPolicy: 'invitation' }, owner);
		expect(room.status).toBe(200);
		const wrongFollower = scope === 'followers' ? invitee : owner;
		const wrongFollowee = scope === 'followers' ? owner : invitee;
		expect((await api('following/create', { userId: wrongFollowee.id }, wrongFollower)).status).toBe(200);
		const directDenied = await api('chat/messages/create-to-user', { toUserId: invitee.id, text: 'not allowed' }, owner);
		expect(directDenied.status).toBe(400);
		expect(castAsError(directDenied.body).error.code).toBe('RECIPIENT_REJECTS_CHAT');
		const invitationDenied = await api('chat/rooms/invitations/create', { roomId: room.body.id, userId: invitee.id }, owner);
		expect(invitationDenied.status).toBe(400);
		expect(castAsError(invitationDenied.body).error).toMatchObject({ code: 'INVALID_INVITEE', info: { reason: 'privacy', userId: invitee.id } });
		const groupDenied = await api('chat/rooms/create', { initialUserIds: [invitee.id, peer.id] }, owner);
		expect(groupDenied.status).toBe(400);
		expect(castAsError(groupDenied.body).error.info).toEqual({ reason: 'privacy', userId: invitee.id, chatScope: scope });
		expect((await api('chat/rooms/invitations/outbox', { roomId: room.body.id }, owner)).body).toEqual([]);
		expect((await api('following/create', { userId: wrongFollower.id }, wrongFollowee)).status).toBe(200);
		expect((await api('chat/rooms/invitations/create', { roomId: room.body.id, userId: invitee.id }, owner)).status).toBe(200);
		expect((await api('chat/rooms/create', { initialUserIds: [invitee.id, peer.id] }, owner)).status).toBe(200);
		expect((await api('chat/messages/create-to-user', { toUserId: invitee.id, text: 'allowed' }, owner)).status).toBe(200);
	});

	test('只有收件人的聊天批准可放行邀请，批准不能绕过屏蔽或群禁止加入', async () => {
		const owner = await signup({ username: 'chatapprovalowner' });
		const invitee = await signup({ username: 'chatapprovalinvitee' });
		for (const user of [owner, invitee]) await api('i/update', { chatScope: 'everyone' }, user);
		const room = await api('chat/rooms/create', { joinPolicy: 'invitation' }, owner);
		const params = { roomId: room.body.id, userId: invitee.id };
		expect((await api('chat/messages/create-to-user', { toUserId: invitee.id, text: 'sender approval only' }, owner)).status).toBe(200);
		await api('i/update', { chatScope: 'none' }, invitee);
		const denied = await api('chat/rooms/invitations/create', params, owner);
		expect(denied.status).toBe(400);
		expect(castAsError(denied.body).error.info).toEqual({ reason: 'privacy', userId: invitee.id, chatScope: 'none' });
		expect((await api('chat/messages/create-to-user', { toUserId: owner.id, text: 'recipient approval' }, invitee)).status).toBe(200);
		expect((await api('chat/rooms/invitations/create', params, owner)).status).toBe(200);
		for (const [blocker, blocked] of [[invitee, owner], [owner, invitee]]) {
			expect((await api('blocking/create', { userId: blocked.id }, blocker)).status).toBe(200);
			const rejected = await api('chat/rooms/invitations/create', params, owner);
			expect(rejected.status).toBe(400);
			expect(castAsError(rejected.body).error.info).toEqual({ reason: 'blocked', userId: invitee.id });
			await api('blocking/delete', { userId: blocked.id }, blocker);
		}
		await api('chat/rooms/update', { roomId: room.body.id, joinPolicy: 'closed' }, owner);
		const closed = await api('chat/rooms/invitations/create', params, owner);
		expect(closed.status).toBe(400);
		expect(castAsError(closed.body).error.info).toEqual({ reason: 'closed' });
	});

	test('邀请成功不会提前显示入群，接受与重复加入只保存一条入群提示', async () => {
		const owner = await signup({ username: 'chatjoinowner' });
		const invitee = await signup({ username: 'chatjoininvitee' });
		await api('i/update', { chatScope: 'everyone' }, invitee);
		const created = await api('chat/rooms/create', { name: 'invitation events', joinPolicy: 'invitation' }, owner);
		const roomId = created.body.id;
		expect((await api('chat/rooms/invitations/create', { roomId, userId: invitee.id }, owner)).status).toBe(200);
		expect((await api('chat/messages/room-timeline', { roomId }, owner)).body).toEqual([]);
		expect((await api('chat/rooms/show', { roomId }, owner)).body.memberCount).toBe(1);
		expect((await api('chat/rooms/join', { roomId }, invitee)).status).toBe(204);
		expect((await api('chat/rooms/join', { roomId }, invitee)).status).toBe(204);
		const timeline = await api('chat/messages/room-timeline', { roomId }, invitee);
		expect(timeline.body).toHaveLength(1);
		expect(timeline.body[0]).toMatchObject({ fromUserId: owner.id, systemEvent: { userIds: [invitee.id], invited: true } });
	});

	test('公告、群昵称和个人定时禁言遵循群角色权限', async () => {
		const owner = await signup({ username: 'chatsettingsowner' });
		const admin = await signup({ username: 'chatsettingsadmin' });
		const member = await signup({ username: 'chatsettingsmember' });
		const peer = await signup({ username: 'chatsettingspeer' });
		for (const user of [admin, member, peer]) await api('i/update', { chatScope: 'everyone' }, user);
		const created = await api('chat/rooms/create', { initialUserIds: [admin.id, member.id, peer.id], description: 'description' }, owner);
		expect(created.status).toBe(200);
		const roomId = created.body.id;
		for (const userId of [admin.id, peer.id]) expect((await api('chat/rooms/members/update', { roomId, userId, role: 'administrator' }, owner)).status).toBe(200);
		expect((await api('chat/rooms/update', { roomId, announcement: 'notice' }, admin)).body).toMatchObject({ announcement: 'notice', description: 'description' });
		expect((await api('chat/rooms/update', { roomId, announcement: 'overwrite' }, member)).status).toBe(400);
		expect((await api('chat/rooms/members/update', { roomId, userId: owner.id, nickname: '群主昵称' }, owner)).body).toMatchObject({ role: 'owner', nickname: '群主昵称' });
		expect((await api('chat/rooms/members/update', { roomId, userId: member.id, nickname: '自己昵称' }, member)).body.nickname).toBe('自己昵称');
		expect((await api('chat/rooms/members/update', { roomId, userId: member.id, nickname: '新昵称' }, admin)).body.nickname).toBe('新昵称');
		for (const userId of [owner.id, peer.id]) expect((await api('chat/rooms/members/update', { roomId, userId, nickname: '越权' }, admin)).status).toBe(400);
		for (const userId of [owner.id, peer.id, admin.id]) expect((await api('chat/rooms/members/update', { roomId, userId, isSilenced: true }, admin)).status).toBe(400);
		const silenceUntil = new Date(Date.now() + 60000).toISOString();
		expect((await api('chat/rooms/members/update', { roomId, userId: member.id, isSilenced: true, silenceUntil }, admin)).body.isSilenced).toBe(true);
		expect((await api('chat/rooms/show', { roomId }, member)).body).toMatchObject({ myNickname: '新昵称', myIsSilenced: true, mySilenceUntil: silenceUntil });
		expect((await api('chat/messages/create-to-room', { toRoomId: roomId, text: 'blocked' }, member)).status).toBe(400);
		expect((await api('chat/rooms/members/update', { roomId, userId: member.id, isSilenced: false }, member)).status).toBe(400);
		await db.getRepository(MiChatRoomMembership).update({ roomId, userId: member.id }, { silenceUntil: new Date(Date.now() - 1000) });
		expect((await api('chat/messages/create-to-room', { toRoomId: roomId, text: 'expired' }, member)).status).toBe(200);
		expect((await api('chat/messages/create-to-room', { toRoomId: roomId, pokeUserId: member.id }, member)).status).toBe(200);
	});

	test('自聊允许保存及查询自己的消息且不产生未读', async () => {
		const self = await signup({ username: 'chatselfuser' });
		await api('i/update', { chatScope: 'none' }, self);
		const created = await api('chat/messages/create-to-user', { toUserId: self.id, text: 'personal note' }, self);
		expect(created.status).toBe(200);
		expect(created.body).toMatchObject({ fromUserId: self.id, toUserId: self.id });
		expect((await api('chat/messages/user-timeline', { userId: self.id }, self)).body.map(message => message.id)).toEqual([created.body.id]);
		expect((await api('chat/unread', { userId: self.id }, self)).body.count).toBe(0);
		expect((await api('chat/history', { room: false }, self)).body.map(message => message.id)).toEqual([created.body.id]);
	});

	test('定向历史预览同步编辑与删除，隔离自聊和他人会话且不修改未读', async () => {
		const owner = await signup({ username: 'historyviewowner' });
		const peer = await signup({ username: 'historyviewpeer' });
		const outsider = await signup({ username: 'historyviewother' });
		for (const user of [owner, peer]) {
			expect(user.id, 'fixture registration').toBeTypeOf('string');
			const updated = await api('i/update', { chatScope: 'everyone' }, user);
			expect(updated.status, castAsError(updated.body).error?.code).toBe(200);
		}
		const first = await api('chat/messages/create-to-user', { toUserId: owner.id, text: 'first preview' }, peer);
		const last = await api('chat/messages/create-to-user', { toUserId: owner.id, text: 'latest preview' }, peer);
		expect(first.status, castAsError(first.body).error?.code).toBe(200);
		expect(last.status).toBe(200);
		const target = { userId: peer.id };
		await api('chat/conversations/update', { ...target, unread: true }, owner);
		const unread = await api('chat/unread', target, owner);
		expect(unread.body.count).toBe(2);
		const preview = await api('chat/history', target, owner);
		expect(preview.status).toBe(200);
		expect(preview.body.map(message => message.id)).toEqual([last.body.id]);
		expect((await api('chat/unread', target, owner)).body).toEqual(unread.body);
		expect((await api('chat/conversations', {}, owner)).body.find(conversation => conversation.userId === peer.id)?.markedUnread).toBe(true);
		await api('chat/messages/update', { messageId: last.body.id, text: 'edited preview' }, peer);
		expect((await api('chat/history', target, owner)).body.map(message => message.text)).toEqual(['edited preview']);
		const self = await api('chat/messages/create-to-user', { toUserId: owner.id, text: 'self only' }, owner);
		expect((await api('chat/history', { userId: owner.id }, owner)).body.map(message => message.id)).toEqual([self.body.id]);
		expect((await api('chat/history', { userId: owner.id }, outsider)).body).toEqual([]);
		await api('chat/messages/delete', { messageId: last.body.id }, peer);
		expect((await api('chat/history', target, owner)).body.map(message => message.id)).toEqual([first.body.id]);
		await api('chat/messages/delete', { messageId: first.body.id }, peer);
		expect((await api('chat/history', target, owner)).body).toEqual([]);

		const room = await api('chat/rooms/create', { joinPolicy: 'invitation' }, owner);
		const roomTarget = { room: true, roomId: room.body.id };
		const roomFirst = await api('chat/messages/create-to-room', { toRoomId: room.body.id, text: 'first room preview' }, owner);
		const roomLast = await api('chat/messages/create-to-room', { toRoomId: room.body.id, text: 'last room preview' }, owner);
		expect(roomFirst.status).toBe(200);
		expect(roomLast.status).toBe(200);
		expect((await api('chat/history', roomTarget, owner)).body.map(message => message.id)).toEqual([roomLast.body.id]);
		expect((await api('chat/history', roomTarget, outsider)).body).toEqual([]);
		await api('chat/messages/update', { messageId: roomLast.body.id, text: 'edited room preview' }, owner);
		expect((await api('chat/history', roomTarget, owner)).body.map(message => message.text)).toEqual(['edited room preview']);
		await api('chat/messages/delete', { messageId: roomLast.body.id }, owner);
		expect((await api('chat/history', roomTarget, owner)).body.map(message => message.id)).toEqual([roomFirst.body.id]);
		await api('chat/messages/delete', { messageId: roomFirst.body.id }, owner);
		expect((await api('chat/history', roomTarget, owner)).body).toEqual([]);
	});

	test('会话偏好隔离账号、移出后新消息恢复，人工未读不倒退真实游标', async () => {
		const owner = await signup({ username: 'chatprefowner' });
		const other = await signup({ username: 'chatprefother' });
		for (const user of [owner, other]) await api('i/update', { chatScope: 'everyone' }, user);
		const target = { userId: other.id };
		const first = await api('chat/messages/create-to-user', { toUserId: owner.id, text: 'first' }, other);
		expect(first.status).toBe(200);
		await api('chat/conversations/update', { ...target, unread: false }, owner);
		const hidden = await api('chat/conversations/update', { ...target, hidden: true, notificationMode: 'silent' }, owner);
		expect(hidden.status).toBe(200);
		expect(hidden.body).toMatchObject({ userId: other.id, roomId: null, hidden: true, hiddenThroughId: first.body.id, notificationMode: 'silent', markedUnread: false });
		expect((await api('chat/conversations', {}, other)).body).toEqual([]);
		await api('chat/conversations/update', { ...target, unread: true }, owner);
		expect((await api('chat/history', { room: false }, owner)).body[0].isRead).toBe(false);
		expect((await api('i', {}, owner)).body.hasUnreadChatMessages).toBe(true);
		expect((await api('chat/unread', target, owner)).body.count).toBe(0);
		await api('chat/messages/user-timeline', { ...target, markAsRead: false }, owner);
		expect((await api('chat/conversations', {}, owner)).body[0].markedUnread).toBe(false);
		expect((await api('i', {}, owner)).body.hasUnreadChatMessages).toBe(false);
		const second = await api('chat/messages/create-to-user', { toUserId: owner.id, text: 'second' }, other);
		expect(second.status).toBe(200);
		expect((await api('chat/conversations', {}, owner)).body[0].hidden).toBe(false);
		expect((await api('chat/unread', target, owner)).body.count).toBe(1);
		await api('chat/conversations/update', { ...target, unread: true }, owner);
		await api('chat/messages/user-timeline', { ...target, markAsRead: false }, owner);
		expect((await api('chat/unread', target, owner)).body.count).toBe(1);
		await api('chat/read-all', {}, owner);
		expect((await api('chat/conversations', {}, owner)).body[0].markedUnread).toBe(false);
		expect((await api('chat/unread', target, owner)).body.count).toBe(0);
	});

	test('群会话静音保留未读，屏蔽不产生新未读，旧静音兼容且无权用户不能改群偏好', async () => {
		const owner = await signup({ username: 'chatmodeowner' });
		const member = await signup({ username: 'chatmodemember' });
		const outsider = await signup({ username: 'chatmodeoutsider' });
		const room = await api('chat/rooms/create', { name: 'conversation modes', joinPolicy: 'public' }, owner);
		const roomId = room.body.id;
		const target = { roomId };
		expect((await api('chat/conversations/update', { ...target, notificationMode: 'silent' }, outsider)).status).toBe(400);
		expect((await api('chat/conversations', {}, outsider)).body).toEqual([]);
		expect((await api('chat/rooms/show', target, owner)).body.isMuted).toBe(false);
		expect((await api('chat/conversations/update', { ...target, userId: owner.id, unread: true }, owner)).status).toBe(400);
		await api('chat/rooms/join', target, member);
		await api('chat/conversations/update', { ...target, unread: false }, member);
		expect((await api('chat/rooms/mute', { ...target, mute: true, duration: 60 }, member)).status).toBe(204);
		expect((await api('chat/conversations', {}, member)).body[0]).toMatchObject({ roomId, notificationMode: 'silent', mutedUntil: expect.any(String) });
		await api('chat/messages/create-to-room', { toRoomId: roomId, text: 'silent still unread' }, owner);
		expect((await api('chat/unread', target, member)).body.count).toBe(1);
		await api('chat/conversations/update', { ...target, notificationMode: 'blocked' }, member);
		expect((await api('chat/unread', target, member)).body.count).toBe(0);
		await api('chat/messages/create-to-room', { toRoomId: roomId, text: 'blocked message' }, owner);
		expect((await api('chat/unread', target, member)).body.count).toBe(0);
		expect((await api('chat/messages/room-timeline', { ...target, markAsRead: false }, member)).body.some(message => message.text === 'blocked message')).toBe(true);
		const allowed = await api('chat/conversations/update', { ...target, notificationMode: 'all' }, member);
		expect(allowed.body.mutedUntil).toBeNull();
		expect((await api('chat/rooms/show', target, member)).body.isMuted).toBe(false);
		await api('chat/messages/create-to-room', { toRoomId: roomId, text: 'unblocked' }, owner);
		expect((await api('chat/unread', target, member)).body.count).toBe(1);
		await api('chat/rooms/leave', target, member);
		expect((await api('chat/conversations', {}, member)).body).toEqual([]);
	});

	test('群主只能任免当前群成员，角色对成员可见且退群后不会保留', async () => {
		const owner = await signup({ username: 'chatroleowner' });
		const outsider = await signup({ username: 'chatroleoutsider' });
		const created = await api('chat/rooms/create', { name: 'roles', joinPolicy: 'public' }, owner);
		expect(created.status).toBe(200);
		const roomId = created.body.id;
		expect(created.body.myRole).toBe('owner');
		expect((await api('chat/rooms/show', { roomId }, outsider)).body.myRole).toBeNull();
		expect((await api('chat/rooms/join', { roomId }, bob)).status).toBe(204);
		expect((await api('chat/rooms/show', { roomId }, bob)).body.myRole).toBe('member');
		const promote = { roomId, userId: bob.id, role: 'administrator' as const };
		expect((await api('chat/rooms/members/update', promote, bob)).status).toBe(400);
		expect((await api('chat/rooms/members/update', promote, outsider)).status).toBe(400);
		for (const userId of [owner.id, outsider.id]) {
			const invalid = await api('chat/rooms/members/update', { ...promote, userId }, owner);
			expect(invalid.status).toBe(400);
			expect(castAsError(invalid.body).error.code).toBe('INVALID_CHAT_ROOM_MEMBER');
		}
		const promoted = await api('chat/rooms/members/update', promote, owner);
		expect(promoted.status).toBe(200);
		expect(promoted.body).toMatchObject({ userId: bob.id, role: 'administrator' });
		expect((await api('chat/rooms/show', { roomId }, bob)).body.myRole).toBe('administrator');
		expect((await api('chat/rooms/members', { roomId }, owner)).body).toEqual(expect.arrayContaining([expect.objectContaining({ userId: bob.id, role: 'administrator' })]));
		expect((await api('chat/rooms/members/update', { ...promote, role: 'member' }, owner)).body.role).toBe('member');
		expect((await api('chat/rooms/invitations/create', { roomId, userId: outsider.id }, bob)).status).toBe(400);
		expect((await api('chat/rooms/members/update', promote, owner)).status).toBe(200);
		expect((await api('chat/rooms/leave', { roomId }, bob)).status).toBe(204);
		expect((await api('chat/rooms/invitations/create', { roomId, userId: outsider.id }, bob)).status).toBe(400);
		expect((await api('chat/rooms/join', { roomId }, bob)).status).toBe(204);
		expect((await api('chat/rooms/show', { roomId }, bob)).body.myRole).toBe('member');
	});

	test('群管理员可以邀请、禁言和移除普通成员，但不能越权管理群主或其他管理员', async () => {
		const owner = await signup({ username: 'chatmanageowner' });
		const otherAdmin = await signup({ username: 'chatmanageadmin' });
		const invitee = await signup({ username: 'chatmanageinvitee' });
		await api('i/update', { chatScope: 'everyone' }, invitee);
		const created = await api('chat/rooms/create', { name: 'managed room', joinPolicy: 'public' }, owner);
		expect(created.status).toBe(200);
		const roomId = created.body.id;
		for (const member of [alice, bob, otherAdmin]) {
			expect((await api('chat/rooms/join', { roomId }, member)).status).toBe(204);
		}
		for (const userId of [alice.id, otherAdmin.id]) {
			expect((await api('chat/rooms/members/update', { roomId, userId, role: 'administrator' }, owner)).status).toBe(200);
		}
		expect((await api('chat/rooms/invitations/create', { roomId, userId: invitee.id }, alice)).status).toBe(200);
		expect((await api('chat/rooms/invitations/create', { roomId, userId: owner.id }, alice)).status).toBe(400);
		expect((await api('chat/rooms/invitations/outbox', { roomId }, alice)).body).toEqual(expect.arrayContaining([expect.objectContaining({ userId: invitee.id })]));
		expect((await api('chat/rooms/invitations/outbox', { roomId }, bob)).status).toBe(400);
		const silenced = await api('chat/rooms/update', { roomId, isSilenced: true, silenceUntil: new Date(Date.now() + 60000).toISOString() }, alice);
		expect(silenced.status).toBe(200);
		expect(silenced.body.isSilenced).toBe(true);
		expect((await api('chat/messages/create-to-room', { toRoomId: roomId, text: '管理员通知' }, alice)).status).toBe(200);
		const blocked = await api('chat/messages/create-to-room', { toRoomId: roomId, text: '普通成员' }, bob);
		expect(blocked.status).toBe(400);
		expect(castAsError(blocked.body).error.code).toBe('CHAT_ROOM_SILENCED');
		expect((await api('chat/rooms/update', { roomId, isSilenced: false }, bob)).status).toBe(400);
		expect((await api('chat/rooms/update', { roomId, name: 'unauthorized', isSilenced: false }, alice)).status).toBe(400);
		expect((await api('chat/rooms/update', { roomId, joinPolicy: 'closed' }, alice)).status).toBe(400);
		expect((await api('chat/rooms/show', { roomId }, alice)).body).toMatchObject({ name: 'managed room', isSilenced: true, joinPolicy: 'public' });
		expect((await api('chat/rooms/delete', { roomId }, alice)).status).toBe(400);
		expect((await api('chat/rooms/members/update', { roomId, userId: bob.id, role: 'administrator' }, alice)).status).toBe(400);
		for (const userId of [owner.id, otherAdmin.id, alice.id]) {
			expect((await api('chat/rooms/members/delete', { roomId, userId }, alice)).status).toBe(400);
		}
		expect((await api('chat/rooms/members/delete', { roomId, userId: otherAdmin.id }, bob)).status).toBe(400);
		expect((await api('chat/rooms/members/delete', { roomId, userId: bob.id }, alice)).status).toBe(204);
		expect((await api('chat/messages/room-timeline', { roomId }, bob)).status).toBe(400);
		expect((await api('chat/rooms/update', { roomId, isSilenced: false }, alice)).body.isSilenced).toBe(false);
		expect((await api('chat/rooms/members/delete', { roomId, userId: alice.id }, owner)).status).toBe(204);
		expect((await api('chat/rooms/update', { roomId, isSilenced: true }, alice)).status).toBe(400);
	});
});
