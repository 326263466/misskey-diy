/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { describe, beforeAll, test } from 'vitest';
import { MiNote } from '@/models/Note.js';
import { MiUser } from '@/models/User.js';
import { isDeletedReply } from '@/misc/is-reply.js';
import { api, castAsError, initTestDb, post, signup } from '../utils.js';
import type * as misskey from 'misskey-js';

describe('Channel', () => {
	let alice: misskey.entities.SignupResponse;
	beforeAll(async () => {
		alice = await signup({ username: 'alice' });
	});

	test('参与者去重、分页及删除过滤后人数与列表一致', async () => {
		const db = await initTestDb(true);
		try {
			const created = await api('channels/create', { name: 'participants-test-channel' }, alice);
			assert.strictEqual(created.status, 200);
			const channelId = created.body.id;
			const active: misskey.entities.SignupResponse[] = [];
			for (let i = 0; i < 6; i++) active.push(await signup());
			const deletedOnly = await signup();
			const suspended = await signup();
			const deleted = await signup();
			const root = await post(active[0], { channelId, text: 'root' });
			for (const user of active.slice(1)) await post(user, { channelId, text: 'participant' });
			await post(active[0], { channelId, text: 'latest remaining post' });
			const latestReply = await post(active[1], { replyId: root.id, text: 'delete latest activity' });
			const onlyReply = await post(deletedOnly, { replyId: root.id, text: 'delete only activity' });
			for (const user of [suspended, deleted]) await post(user, { channelId, text: 'excluded user' });

			const before = await api('channels/participants', { channelId, limit: 100 });
			assert.strictEqual(before.status, 200);
			assert.strictEqual(before.body.length, 9);
			assert.strictEqual(new Set(before.body.map(user => user.id)).size, 9);
			const beforeShow = await api('channels/show', { channelId });
			assert.strictEqual(beforeShow.status, 200);
			assert.strictEqual(beforeShow.body.participantsCount, before.body.length);

			assert.strictEqual((await api('notes/delete', { noteId: latestReply.id }, active[1])).status, 204);
			assert.strictEqual((await api('notes/delete', { noteId: onlyReply.id }, deletedOnly)).status, 204);
			for (const reply of [latestReply, onlyReply]) {
				const placeholder = await db.getRepository(MiNote).findOneByOrFail({ id: reply.id });
				assert.strictEqual(placeholder.channelId, channelId);
				assert.ok(isDeletedReply(placeholder));
			}
			await db.getRepository(MiUser).update(suspended.id, { isSuspended: true });
			await db.getRepository(MiUser).update(deleted.id, { isDeleted: true });

			// 按首次发帖排序：active[0] 之后再发帖也不会提前，删除最新回复也不影响加入时间。
			const expectedIds = [...active].reverse().map(user => user.id);
			for (const viewer of [undefined, alice]) {
				const list = await api('channels/participants', { channelId, limit: 100 }, viewer);
				const show = await api('channels/show', { channelId }, viewer);
				assert.strictEqual(list.status, 200);
				assert.strictEqual(show.status, 200);
				assert.deepStrictEqual(list.body.map(user => user.id), expectedIds);
				assert.strictEqual(show.body.participantsCount, list.body.length);

				const pagedIds: string[] = [];
				for (const offset of [0, 5, 10]) {
					const page = await api('channels/participants', { channelId, limit: 5, offset }, viewer);
					assert.strictEqual(page.status, 200);
					assert.deepStrictEqual(page.body.map(user => user.id), expectedIds.slice(offset, offset + 5));
					pagedIds.push(...page.body.map(user => user.id));
				}
				assert.deepStrictEqual(pagedIds, expectedIds);
			}
		} finally {
			await db.destroy();
		}
	});

	describe('Follow', () => {
		let channel: misskey.entities.ChannelsCreateResponse;

		beforeAll(async () => {
			const res = await api('channels/create', { name: 'follow-test-channel' }, alice);
			channel = res.body;
		});

		test('フォローしているチャンネルを再度フォローするとALREADY_FOLLOWINGエラーになる', async () => {
			const res1 = await api('channels/follow', { channelId: channel.id }, alice);
			assert.strictEqual(res1.status, 204);

			const res2 = await api('channels/follow', { channelId: channel.id }, alice);
			assert.strictEqual(res2.status, 400);
			assert.strictEqual(castAsError(res2.body as any).error.code, 'ALREADY_FOLLOWING');
		});
	});
});
