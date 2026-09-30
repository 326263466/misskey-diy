/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { effect, reactive, shallowRef, stop } from 'vue';
import type * as Misskey from 'misskey-js';
import { publishUserProfileUpdate, useUserProfile } from '@/composables/use-user-profile.js';

describe('confirmed public profile updates', () => {
	test('does not rerun subscribers for duplicate pushes, private updates or other users', () => {
		const user = useUserProfile({ id: 'stable-profile', name: 'Old' } as Misskey.entities.UserDetailed);
		const profile = {
			name: 'Confirmed', fields: [{ name: 'Website', value: 'https://example.test' }],
			verifiedLinks: ['https://example.test'], emojis: { smile: 'smile.png', wave: 'wave.png' },
			avatarDecorations: [{ id: 'decoration', url: 'decoration.png', angle: 1 }],
		};
		publishUserProfileUpdate('stable-profile', profile);
		const confirmed = user.value;
		let runs = 0;
		const subscriber = effect(() => {
			void user.value;
			runs++;
		});
		try {
			publishUserProfileUpdate('stable-profile', { ...structuredClone(profile), emojis: { wave: 'wave.png', smile: 'smile.png' } });
			publishUserProfileUpdate('stable-profile', { notesCount: 100 });
			publishUserProfileUpdate('unrelated-profile', { name: 'Someone else' });
			expect(user.value).toBe(confirmed);
			expect(runs).toBe(1);

			publishUserProfileUpdate('stable-profile', { ...structuredClone(profile), name: 'Changed' });
			expect(user.value.name).toBe('Changed');
			expect(user.value.fields).toBe(confirmed.fields);
			expect(user.value.verifiedLinks).toBe(confirmed.verifiedLinks);
			expect(user.value.emojis).toBe(confirmed.emojis);
			expect(user.value.avatarDecorations).toBe(confirmed.avatarDecorations);
			expect(runs).toBe(2);
		} finally {
			stop(subscriber);
		}
	});

	test('notifies subscribers when collection values change or are cleared', () => {
		const user = useUserProfile({ id: 'collection-edits' } as Misskey.entities.UserDetailed);
		publishUserProfileUpdate('collection-edits', {
			fields: [{ name: 'Website', value: 'old' }], verifiedLinks: ['old'],
			emojis: { smile: 'old' }, avatarDecorations: [{ id: 'decoration', url: 'old', angle: 1 }],
		});
		let runs = 0;
		const subscriber = effect(() => {
			void user.value;
			runs++;
		});
		try {
			publishUserProfileUpdate('collection-edits', { fields: [{ name: 'Website', value: 'new' }] });
			publishUserProfileUpdate('collection-edits', { verifiedLinks: ['new'] });
			publishUserProfileUpdate('collection-edits', { emojis: { smile: 'new' } });
			publishUserProfileUpdate('collection-edits', { avatarDecorations: [{ id: 'decoration', url: 'old', angle: 2 }] });
			expect(runs).toBe(5);
			expect(user.value.fields?.[0].value).toBe('new');
			expect(user.value.avatarDecorations[0].angle).toBe(2);
			publishUserProfileUpdate('collection-edits', { fields: [], verifiedLinks: [], emojis: {}, avatarDecorations: [] });
			expect(runs).toBe(6);
			expect(user.value).toMatchObject({ fields: [], verifiedLinks: [], emojis: {}, avatarDecorations: [] });
		} finally {
			stop(subscriber);
		}
	});

	test('keeps untouched snapshots and empty sources unchanged', () => {
		const source = { id: 'untouched', name: 'Old name' };
		expect(useUserProfile(source).value).toBe(source);
		expect(useUserProfile(null).value).toBeNull();
		expect(useUserProfile(undefined).value).toBeUndefined();
	});

	test('updates independent mounted snapshots and pages opened after saving', () => {
		const profileSnapshot = { id: 'shared', name: 'Old name', company: 'Old company', jobTitle: 'Old job' };
		const noteSnapshot = { id: 'shared', name: 'Old name', company: 'Old company', jobTitle: 'Old job' };
		const profile = useUserProfile(profileSnapshot);
		const note = useUserProfile(noteSnapshot);
		expect(profile.value.name).toBe('Old name');
		expect(note.value.name).toBe('Old name');

		publishUserProfileUpdate('shared', { name: 'New name', company: 'New company', jobTitle: 'New job' });
		for (const user of [profile.value, note.value, useUserProfile({ ...profileSnapshot }).value]) {
			expect(user).toMatchObject({ name: 'New name', company: 'New company', jobTitle: 'New job' });
		}
		expect(profileSnapshot.name).toBe('Old name');
		expect(noteSnapshot.company).toBe('Old company');
	});

	test('preserves confirmed edits when an old server response replaces the source', () => {
		const source = shallowRef({ id: 'late-response', name: 'Old name', company: 'Old company', notesCount: 1 });
		const user = useUserProfile(source);
		publishUserProfileUpdate('late-response', { name: 'New name', company: 'New company' });
		expect(user.value.name).toBe('New name');
		source.value = { id: 'late-response', name: 'Old name', company: 'Old company', notesCount: 2 };
		expect(user.value).toMatchObject({ name: 'New name', company: 'New company', notesCount: 2 });
	});

	test('merges only explicitly supplied values, retaining null and false', () => {
		const user = useUserProfile({ id: 'partial', name: 'Old', company: 'Old company', jobTitle: 'Old job', isCat: true });
		publishUserProfileUpdate('partial', { name: 'New', company: 'New company', jobTitle: 'New job' });
		publishUserProfileUpdate('partial', { name: undefined, company: null, isCat: false });
		expect(user.value).toMatchObject({ name: 'New', company: null, jobTitle: 'New job', isCat: false });
		publishUserProfileUpdate('partial', Object.create({ name: 'Inherited name' }) as Partial<Misskey.entities.UserDetailed>);
		expect(user.value.name).toBe('New');
	});

	test('never copies credentials, private settings or unrelated state from the account', () => {
		const account = {
			id: 'private', name: 'New name', company: 'New company', token: 'secret', email: 'private@example.test',
			username: 'replacement', host: 'other.example', memo: 'private memo', moderationNote: 'staff only',
			hideOnlineStatus: true, onlineStatus: 'away', customStatus: { icon: 'coffee', text: 'Resting' },
			onlineStatusAutoReplies: { away: 'Private reply' }, followersCount: 100, isFollowing: true,
		} as Misskey.entities.MeDetailed & { token: string };
		const source = { id: 'private', name: 'Old name', username: 'original', host: null, onlineStatus: 'unknown', followersCount: 2 };
		publishUserProfileUpdate('private', account);
		expect(useUserProfile(source).value).toEqual({ ...source, name: 'New name', company: 'New company' });
	});

	test('cannot affect another account, including when a reused component changes users', () => {
		const props = reactive({ user: { id: 'first-account', name: 'First' } });
		const user = useUserProfile(() => props.user);
		publishUserProfileUpdate('first-account', { name: 'First edited' });
		expect(user.value.name).toBe('First edited');
		props.user = { id: 'second-account', name: 'Second' };
		expect(user.value).toEqual({ id: 'second-account', name: 'Second' });
		publishUserProfileUpdate('first-account', { name: 'First edited again' });
		expect(user.value.name).toBe('Second');
		publishUserProfileUpdate('second-account', { id: 'first-account', name: 'Wrong account' });
		expect(user.value.name).toBe('Second');
	});

	test('supports a user arriving asynchronously and nullable navigation', () => {
		const source = shallowRef<{ id: string; name: string } | null>(null);
		const user = useUserProfile(source);
		publishUserProfileUpdate('async-user', { name: 'New name' });
		expect(user.value).toBeNull();
		source.value = { id: 'async-user', name: 'Old name' };
		expect(user.value?.name).toBe('New name');
		source.value = null;
		expect(user.value).toBeNull();
	});

	test('keeps confirmed nested public data independent of later form mutations', () => {
		const account = {
			fields: [{ name: 'Website', value: 'https://example.test', token: 'private' }],
			verifiedLinks: ['https://example.test'],
			emojis: { smile: 'https://example.test/smile.png' },
			avatarDecorations: [{ id: 'decoration', url: 'https://example.test/decoration.png', angle: 1, token: 'private' }],
		};
		publishUserProfileUpdate('nested', account);
		const user = useUserProfile({ id: 'nested' } as Misskey.entities.UserDetailed);
		account.fields[0].value = 'Draft';
		account.verifiedLinks.push('https://draft.example');
		account.emojis.smile = 'https://draft.example/smile.png';
		account.avatarDecorations[0].angle = 2;
		expect(user.value.fields).toEqual([{ name: 'Website', value: 'https://example.test' }]);
		expect(user.value.verifiedLinks).toEqual(['https://example.test']);
		expect(user.value.emojis).toEqual({ smile: 'https://example.test/smile.png' });
		expect(user.value.avatarDecorations).toEqual([{ id: 'decoration', url: 'https://example.test/decoration.png', angle: 1 }]);
	});
});
