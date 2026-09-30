/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import type * as Misskey from 'misskey-js';
import MkUserWork from '@/components/MkUserWork.vue';
import MkNoteHeader from '@/components/MkNoteHeader.vue';
import MkUserName from '@/components/global/MkUserName.vue';
import { i18n } from '@/i18n.js';
import { publishUserProfileUpdate } from '@/composables/use-user-profile.js';

vi.mock('@/filters/user.js', () => ({ userPage: () => '/@alice' }));
vi.mock('@/filters/note.js', () => ({ notePage: () => '/notes/note' }));

afterEach(cleanup);

describe('professional profile line', () => {
	test.each([
		{},
		{ company: null, jobTitle: null },
		{ company: '', jobTitle: '' },
		{ company: '  ', jobTitle: '\t' },
	])('does not reserve space when both fields are empty: %j', user => {
		const view = render(MkUserWork, { props: { user } });
		expect(view.container.children).toHaveLength(0);
	});

	test.each([
		{ company: 'Example Company', jobTitle: null },
		{ company: null, jobTitle: 'Engineer' },
		{ company: 'Example Company', jobTitle: 'Engineer' },
	])('renders available values without dangling separators: %j', user => {
		const view = render(MkUserWork, { props: { user } });
		for (const [key, value] of Object.entries(user)) {
			if (value) expect(view.getByTitle(`${i18n.ts._profile[key as 'company' | 'jobTitle']}: ${value}`).textContent).toBe(key === 'company' ? `@${value}` : value);
		}
		expect(view.container.textContent).toBe([user.jobTitle, user.company ? `@${user.company}` : null].filter(Boolean).join('·'));
		expect(view.container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(user.company && user.jobTitle ? 1 : 0);
	});

	test('updates and removes the line when profile values change', async () => {
		const view = render(MkUserWork, { props: { user: { company: '  Company  ', jobTitle: ' Engineer ' } } });
		expect(view.getByText('@Company')).toBeTruthy();
		expect(view.getByText('Engineer')).toBeTruthy();
		await view.rerender({ user: { company: null, jobTitle: 'Designer' } });
		expect(view.queryByText('@Company')).toBeNull();
		expect(view.getByText('Designer')).toBeTruthy();
		expect(view.container.querySelector('[aria-hidden="true"]')).toBeNull();
		await view.rerender({ user: {} });
		expect(view.container.children).toHaveLength(0);
	});
});

describe('note author profile', () => {
	test('updates old note snapshots after confirmed profile edits and clears removed work without placeholders', async () => {
		const snapshot = { id: 'saved-profile-note', name: 'Old name', username: 'alice', company: null, jobTitle: null };
		const note = { id: 'note', visibility: 'public', createdAt: new Date().toISOString(), user: snapshot } as Misskey.entities.Note;
		const view = render(MkNoteHeader, {
			props: { note },
			global: {
				directives: { 'user-preview': {}, tooltip: {} },
				stubs: {
					MkA: { template: '<a><slot/></a>' }, MkAcct: true,
					MkTime: { template: '<span>now</span>' },
					Mfm: { props: ['text'], template: '<span>{{ text }}</span>' },
				},
				components: { MkUserName },
			},
		});
		expect(view.getByText('Old name')).toBeTruthy();
		publishUserProfileUpdate(snapshot.id, { name: 'New name', company: 'New Company', jobTitle: 'Designer' });
		await nextTick();
		expect(view.getByText('New name')).toBeTruthy();
		expect(view.queryByText('Old name')).toBeNull();
		expect(view.container.querySelector('header')!.lastElementChild!.textContent).toBe('Designer·@New Company·now');
		expect(snapshot).toMatchObject({ name: 'Old name', company: null, jobTitle: null });
		publishUserProfileUpdate(snapshot.id, { company: null, jobTitle: null });
		await nextTick();
		expect(view.container.querySelector('header')!.lastElementChild!.textContent).toBe('now');
		await view.rerender({ showTime: false });
		expect(view.container.querySelector('header')!.children).toHaveLength(1);
	});

	test('applies confirmed names to newly mounted views and keeps other users separate', async () => {
		publishUserProfileUpdate('saved-profile-name', { name: 'Saved name' });
		const view = render(MkUserName, {
			props: { user: { id: 'saved-profile-name', name: 'Stale name', username: 'alice' } as Misskey.entities.User },
			global: { stubs: { Mfm: { props: ['text'], template: '<span>{{ text }}</span>' } } },
		});
		expect(view.getByText('Saved name')).toBeTruthy();
		await view.rerender({ user: { id: 'someone-else', name: 'Other user', username: 'alice' } });
		expect(view.getByText('Other user')).toBeTruthy();
		expect(view.queryByText('Saved name')).toBeNull();
	});

	test.each([
		{ work: {}, expected: 'now' },
		{ work: { company: 'Example Company' }, expected: '@Example Company·now' },
		{ work: { jobTitle: 'Engineer' }, expected: 'Engineer·now' },
		{ work: { company: 'Example Company', jobTitle: 'Engineer' }, expected: 'Engineer·@Example Company·now' },
		{ work: { company: '  ', jobTitle: '\t' }, expected: 'now' },
	])('keeps time on the second line with only available work fields: $expected', ({ work, expected }) => {
		const note = {
			id: 'note', visibility: 'public', createdAt: new Date().toISOString(),
			channel: { id: 'channel', name: 'Channel' },
			user: { id: 'alice', name: 'Alice', username: 'alice', host: null, ...work },
		} as Misskey.entities.Note;
		const view = render(MkNoteHeader, {
			props: { note },
			global: {
				directives: { 'user-preview': {}, tooltip: {} },
				stubs: {
					MkA: { props: ['to'], template: '<a :href="to"><slot/></a>' },
					MkUserName: { template: '<span>Alice</span>' },
					MkAcct: { template: '<span>@alice</span>' },
					MkTime: { template: '<span>now</span>' },
				},
			},
		});
		const header = view.container.querySelector('header')!;
		const primary = header.firstElementChild!;
		expect(header.querySelector('[title="Channel"]')).toBeNull();
		expect(primary.textContent).toBe('Alice@alice');
		expect(header.children).toHaveLength(2);
		expect(header.lastElementChild!.textContent).toBe(expected);
		expect(view.getByRole('link', { name: 'now' }).getAttribute('href')).toBe('/notes/note');
	});

	test('does not leave an empty secondary row when time and work are absent', () => {
		const view = render(MkNoteHeader, {
			props: { note: { user: { company: ' ', jobTitle: null }, visibility: 'public' } as Misskey.entities.Note, showTime: false },
			global: { directives: { 'user-preview': {}, tooltip: {} }, stubs: { MkA: true, MkUserName: true, MkAcct: true } },
		});
		expect(view.container.querySelector('header')!.children).toHaveLength(1);
	});
});
