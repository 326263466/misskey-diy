/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import UpdateEndpoint from '@/server/api/endpoints/i/update.js';
import { getUserOnlineStatus } from '@/misc/user-online-status.js';
import type { MiLocalUser } from '@/models/User.js';

function createFixture(hideOnlineStatus = false) {
	const user = { id: 'alice', username: 'alice', name: null, isLocked: false, hideOnlineStatus, onlineStatusOverride: 'online', onlineStatusAutoReplies: {}, customStatus: null, lastActiveDate: new Date() } as MiLocalUser;
	const profile = { description: null, followedMessage: null, company: null as string | null, jobTitle: null as string | null, fields: [{ name: 'Website', value: 'https://example.test' }], verifiedLinks: ['https://example.test'] };
	const users = {
		findOneByOrFail: vi.fn(async () => ({ ...user })),
		update: vi.fn(async (_id, updates) => Object.assign(user, updates)),
		createQueryBuilder: vi.fn(() => {
			let updates: object;
			let autoRepliesPatch: string;
			const query = {
				update: vi.fn().mockReturnThis(),
				set: vi.fn((value: object) => {
					updates = value;
					return query;
				}),
				where: vi.fn().mockReturnThis(),
				setParameter: vi.fn((_name: string, value: string) => {
					autoRepliesPatch = value;
					return query;
				}),
				execute: vi.fn(async () => Object.assign(user, updates, {
					onlineStatusAutoReplies: { ...user.onlineStatusAutoReplies, ...JSON.parse(autoRepliesPatch) },
				})),
			};
			return query;
		}),
	};
	const profiles = { findOneByOrFail: vi.fn(async () => profile), update: vi.fn(async (_id, updates) => Object.assign(profile, updates)) };
	const events = { publishInternalEvent: vi.fn(), publishUserStats: vi.fn(), publishMainStream: vi.fn() };
	const actor = { publishToFollowers: vi.fn() };
	const hashtags = { updateUsertags: vi.fn() };
	const http = { getHtml: vi.fn().mockResolvedValue('') };
	const endpoint = new UpdateEndpoint(
		{ url: 'https://misskey.test' } as never,
		{} as never,
		users as never,
		profiles as never,
		{} as never,
		{} as never,
		{ pack: vi.fn(async () => ({ ...user, onlineStatus: getUserOnlineStatus(user) })) } as never,
		{} as never,
		events as never,
		{} as never,
		actor as never,
		{} as never,
		{} as never,
		hashtags as never,
		{ isModerator: vi.fn().mockResolvedValue(true) } as never,
		{ userProfileCache: { set: vi.fn() } } as never,
		http as never,
		{} as never,
		{} as never,
	);
	return { user, users, profile, profiles, events, actor, hashtags, http, exec: (params: object) => endpoint.exec(params, user, null) };
}

describe('i/update professional profile', () => {
	test('trims company and job title while preserving the existing custom profile fields', async () => {
		const fixture = createFixture();
		const fields = [...fixture.profile.fields];
		await fixture.exec({ company: '  示例科技  ', jobTitle: '  产品设计师  ', onlineStatusOverride: 'busy' });
		expect(fixture.profile).toMatchObject({ company: '示例科技', jobTitle: '产品设计师', fields });
		expect(fixture.profiles.update).toHaveBeenCalledWith('alice', expect.objectContaining({ company: '示例科技', jobTitle: '产品设计师' }));
		expect(fixture.events.publishMainStream).toHaveBeenCalledWith('alice', 'meUpdated', expect.anything());
		expect(fixture.user.onlineStatusOverride).toBe('busy');
	});

	test.each([null, '', '   '])('clears a field with %j while preserving the omitted sibling', async value => {
		const fixture = createFixture();
		Object.assign(fixture.profile, { company: 'Example', jobTitle: 'Designer' });
		await fixture.exec({ company: value });
		expect(fixture.profile).toMatchObject({ company: null, jobTitle: 'Designer' });
		fixture.profile.company = 'Example';
		await fixture.exec({ jobTitle: value });
		expect(fixture.profile).toMatchObject({ company: 'Example', jobTitle: null });
	});

	test.each(['company', 'jobTitle'] as const)('counts Unicode code points and retains 128-character %s values', async field => {
		const fixture = createFixture();
		const value = '😀'.repeat(128);
		await fixture.exec({ [field]: value });
		expect(fixture.profile[field]).toBe(value);
		await expect(fixture.exec({ [field]: `${value}a` })).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		expect(fixture.profile[field]).toBe(value);
	});

	test.each(['company', 'jobTitle'] as const)('rejects invalid %s before writing the profile', async field => {
		for (const value of [1, {}, 'a'.repeat(129), 'a\u0000b', 'a\nb', 'a\tb', 'a\u007fb', 'a\u202eb', 'a\u2066b']) {
			const fixture = createFixture();
			await expect(fixture.exec({ [field]: value })).rejects.toMatchObject({ code: 'INVALID_PARAM' });
			expect(fixture.profiles.update).not.toHaveBeenCalled();
			expect(fixture.users.update).not.toHaveBeenCalled();
		}
	});

	test('leaves company and job title unchanged when another profile property is edited', async () => {
		const fixture = createFixture();
		Object.assign(fixture.profile, { company: 'Example', jobTitle: 'Designer' });
		await fixture.exec({ name: 'Updated' });
		expect(fixture.profile).toMatchObject({ company: 'Example', jobTitle: 'Designer' });
		expect(fixture.profiles.update.mock.calls[0][1]).not.toHaveProperty('company');
		expect(fixture.profiles.update.mock.calls[0][1]).not.toHaveProperty('jobTitle');
	});
});

describe('i/update presence', () => {
	test('persists presence and refreshes local views without modifying or federating the profile', async () => {
		const fixture = createFixture();
		const result = await fixture.exec({ onlineStatusOverride: 'away', hideOnlineStatus: false, i: 'token' });
		expect(result.onlineStatus).toBe('away');
		expect(fixture.users.update).toHaveBeenCalledWith('alice', { onlineStatusOverride: 'away', hideOnlineStatus: false, lastActiveDate: expect.any(Date) });
		expect(fixture.events.publishUserStats).toHaveBeenCalledWith('alice');
		expect(fixture.events.publishMainStream).toHaveBeenCalledWith('alice', 'meUpdated', result);
		expect(fixture.profiles.findOneByOrFail).not.toHaveBeenCalled();
		expect(fixture.profiles.update).not.toHaveBeenCalled();
		expect(fixture.actor.publishToFollowers).not.toHaveBeenCalled();
		expect(fixture.hashtags.updateUsertags).not.toHaveBeenCalled();
		expect(fixture.http.getHtml).not.toHaveBeenCalled();
	});

	test.each([{ onlineStatusOverride: 'busy' }, { onlineStatusOverride: 'doNotDisturb' }, { onlineStatusOverride: 'invisible' }, { hideOnlineStatus: true }, { onlineStatusOverride: 'online', hideOnlineStatus: true }])('does not broadcast unchanged hidden presence for %j', async params => {
		const fixture = createFixture(true);
		expect((await fixture.exec(params)).onlineStatus).toBeNull();
		expect(fixture.events.publishUserStats).not.toHaveBeenCalled();
		expect(fixture.actor.publishToFollowers).not.toHaveBeenCalled();
		expect(fixture.http.getHtml).not.toHaveBeenCalled();
	});

	test.each([false, true])('invalidates visible presence when toggling complete hiding from %s', async hidden => {
		const fixture = createFixture(hidden);
		await fixture.exec({ hideOnlineStatus: !hidden });
		expect(fixture.events.publishUserStats).toHaveBeenCalledOnce();
	});

	test('switches to invisible without enabling complete hiding, and preserves it when hiding is toggled', async () => {
		const fixture = createFixture();
		expect(await fixture.exec({ onlineStatusOverride: 'invisible' })).toMatchObject({ onlineStatus: 'unknown', hideOnlineStatus: false, onlineStatusOverride: 'invisible' });
		expect(fixture.events.publishUserStats).toHaveBeenCalledOnce();
		expect(await fixture.exec({ hideOnlineStatus: true })).toMatchObject({ onlineStatus: null, hideOnlineStatus: true, onlineStatusOverride: 'invisible' });
		expect(await fixture.exec({ hideOnlineStatus: false })).toMatchObject({ onlineStatus: 'unknown', hideOnlineStatus: false, onlineStatusOverride: 'invisible' });
	});

	test('does not broadcast a visible no-op', async () => {
		const fixture = createFixture();
		await fixture.exec({ onlineStatusOverride: 'online', hideOnlineStatus: false });
		expect(fixture.events.publishUserStats).not.toHaveBeenCalled();
	});

	test('saves, changes and clears a custom status without federating', async () => {
		const fixture = createFixture();
		const customStatus = { icon: 'music', text: ' Music ' };
		const result = await fixture.exec({ customStatus, onlineStatusOverride: 'online', hideOnlineStatus: false });
		expect(result.customStatus).toEqual({ icon: 'music', text: 'Music' });
		expect(fixture.events.publishUserStats).toHaveBeenCalledOnce();
		await fixture.exec({ customStatus: { icon: 'coffee', text: 'Music' } });
		expect(fixture.events.publishUserStats).toHaveBeenCalledTimes(2);
		await fixture.exec({ customStatus: { icon: 'coffee', text: 'Break' } });
		expect(fixture.events.publishUserStats).toHaveBeenCalledTimes(3);
		await fixture.exec({ customStatus: null });
		expect(fixture.user.customStatus).toBeNull();
		expect(fixture.events.publishUserStats).toHaveBeenCalledTimes(4);
		expect(fixture.actor.publishToFollowers).not.toHaveBeenCalled();
		expect(fixture.profiles.update).not.toHaveBeenCalled();
	});

	test.each([
		'coffee', 'music', 'gamepad', 'briefcase', 'book', 'moon', 'heart', 'plane',
		'food', 'home', 'pet', 'code', 'focus', 'film', 'car', 'vacation',
		'exercise', 'sun', 'cloud', 'battery', 'chat', 'celebrate', 'gift', 'handshake',
	])('accepts and preserves the %s custom status icon', async icon => {
		const fixture = createFixture();
		const customStatus = { icon, text: '自定义状态' };
		expect((await fixture.exec({ customStatus })).customStatus).toEqual(customStatus);
		expect(fixture.users.update).toHaveBeenCalledWith('alice', expect.objectContaining({ customStatus }));
		expect(fixture.events.publishUserStats).toHaveBeenCalledOnce();
		expect(fixture.actor.publishToFollowers).not.toHaveBeenCalled();
	});

	test('does not reveal custom edits while invisible and restores them when visible', async () => {
		const fixture = createFixture(true);
		const customStatus = { icon: 'book', text: 'Reading' };
		await fixture.exec({ customStatus });
		expect(fixture.user.customStatus).toEqual(customStatus);
		expect(fixture.events.publishUserStats).not.toHaveBeenCalled();
		await fixture.exec({ hideOnlineStatus: false, onlineStatusOverride: 'online' });
		expect(fixture.events.publishUserStats).toHaveBeenCalledOnce();
		await fixture.exec({ customStatus });
		expect(fixture.events.publishUserStats).toHaveBeenCalledOnce();
	});

	test('counts astral Unicode text as code points', async () => {
		const fixture = createFixture();
		await fixture.exec({ customStatus: { icon: 'heart', text: '😀'.repeat(8) } });
		expect(Array.from(fixture.user.customStatus!.text)).toHaveLength(8);
		await expect(fixture.exec({ customStatus: { icon: 'heart', text: '😀'.repeat(9) } })).rejects.toMatchObject({ code: 'INVALID_PARAM' });
	});

	test.each([
		{}, { icon: 'music' }, { text: 'Music' }, { icon: 'unknown', text: 'Music' },
		{ icon: 'music', text: '' }, { icon: 'music', text: '   ' }, { icon: 'music', text: 'a'.repeat(9) },
		{ icon: 'music', text: 'hello\nworld' }, { icon: 'music', text: 'hello\tworld' },
		{ icon: 'music', text: 'hello\u0000' }, { icon: 'music', text: 'hello\u2028world' },
		{ icon: 'music', text: 'hello\u202eworld' }, { icon: 'music', text: 'Music', extra: true },
	])('rejects invalid custom status %j before writing', async customStatus => {
		const fixture = createFixture();
		await expect(fixture.exec({ customStatus })).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		expect(fixture.users.update).not.toHaveBeenCalled();
		expect(fixture.events.publishUserStats).not.toHaveBeenCalled();
	});

	test.each(['away', 'busy', 'doNotDisturb'] as const)('saves the %s reply with its status in one local update', async status => {
		const fixture = createFixture();
		const result = await fixture.exec({ onlineStatusOverride: status, onlineStatusAutoReplies: { [status]: ' 稍后联系 ' } });
		expect(result.onlineStatus).toBe(status);
		expect(fixture.user.onlineStatusAutoReplies).toEqual({ [status]: '稍后联系' });
		expect(fixture.users.createQueryBuilder).toHaveBeenCalledOnce();
		expect(fixture.profiles.update).not.toHaveBeenCalled();
		expect(fixture.actor.publishToFollowers).not.toHaveBeenCalled();
	});

	test.each([false, true])('preserves unconfigured replies and explicit None without public activity (invisible: %s)', async invisible => {
		const fixture = createFixture(invisible);
		await fixture.exec({ onlineStatusAutoReplies: { away: 'Away', busy: 'Busy' } });
		await fixture.exec({ onlineStatusAutoReplies: { away: null } });
		expect(fixture.user.onlineStatusAutoReplies).toEqual({ away: null, busy: 'Busy' });
		expect(fixture.user.onlineStatusAutoReplies).not.toHaveProperty('doNotDisturb');
		expect(fixture.events.publishMainStream).toHaveBeenCalledTimes(2);
		expect(fixture.events.publishUserStats).not.toHaveBeenCalled();
		expect(fixture.profiles.update).not.toHaveBeenCalled();
		expect(fixture.actor.publishToFollowers).not.toHaveBeenCalled();
	});

	test.each(['away', 'busy', 'doNotDisturb'] as const)('only changes the configured %s reply while preserving the other two', async status => {
		const fixture = createFixture();
		const replies = { away: 'Away', busy: 'Busy', doNotDisturb: 'Do not disturb' };
		await fixture.exec({ onlineStatusAutoReplies: replies });
		await fixture.exec({ onlineStatusOverride: status, onlineStatusAutoReplies: { [status]: null } });
		expect(fixture.user.onlineStatusAutoReplies).toEqual({ ...replies, [status]: null });
		await fixture.exec({ onlineStatusOverride: 'online' });
		expect(fixture.user.onlineStatusAutoReplies).toEqual({ ...replies, [status]: null });
	});

	test('preserves independent replies saved concurrently by separate clients', async () => {
		const fixture = createFixture();
		await Promise.all([
			fixture.exec({ onlineStatusAutoReplies: { away: 'Away' } }),
			fixture.exec({ onlineStatusAutoReplies: { busy: 'Busy' } }),
			fixture.exec({ onlineStatusAutoReplies: { doNotDisturb: null } }),
		]);
		expect(fixture.user.onlineStatusAutoReplies).toEqual({ away: 'Away', busy: 'Busy', doNotDisturb: null });
	});

	test('allows multiline replies and counts the 500 character limit as code points', async () => {
		const fixture = createFixture();
		await fixture.exec({ onlineStatusAutoReplies: { away: '您好，\n稍后联系。', busy: '😀'.repeat(500) } });
		expect(fixture.user.onlineStatusAutoReplies.away).toBe('您好，\n稍后联系。');
		expect(Array.from(fixture.user.onlineStatusAutoReplies.busy!)).toHaveLength(500);
	});

	test.each([
		null, { away: '' }, { busy: ' \n\t ' }, { doNotDisturb: '😀'.repeat(501) },
		{ away: 'hello\u0000' }, { online: 'Hi' }, { away: 123 },
	])('rejects invalid automatic reply settings %j before writing', async onlineStatusAutoReplies => {
		const fixture = createFixture();
		await expect(fixture.exec({ onlineStatusAutoReplies })).rejects.toMatchObject({ code: 'INVALID_PARAM' });
		expect(fixture.users.update).not.toHaveBeenCalled();
		expect(fixture.users.createQueryBuilder).not.toHaveBeenCalled();
	});

	test.each([{}, { onlineStatusOverride: 'busy' }, { onlineStatusAutoReplies: { away: 'Away' } }])('preserves the profile update workflow when editing a name along with %j', async presence => {
		const fixture = createFixture();
		await fixture.exec({ name: 'Updated name', ...presence });
		expect(fixture.user.name).toBe('Updated name');
		expect(fixture.profiles.update).toHaveBeenCalled();
		expect(fixture.actor.publishToFollowers).toHaveBeenCalledWith('alice');
		expect(fixture.hashtags.updateUsertags).toHaveBeenCalled();
		expect(fixture.http.getHtml).toHaveBeenCalledWith('https://example.test');
	});
});
