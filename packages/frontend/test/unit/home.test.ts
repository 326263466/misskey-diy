/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, assert, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, type RenderResult } from '@testing-library/vue';
import * as Misskey from 'misskey-js';
import { directives } from '@/directives/index.js';
import { components } from '@/components/index.js';
import XHome from '@/pages/user/home.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import 'intersection-observer';

const login = vi.hoisted(() => ({ account: null as { id: string } | null }));
vi.mock('@/composables/use-user-statistics.js', () => ({ useUserStatistics: vi.fn() }));

vi.mock('@/i.js', async importOriginal => ({
	...await importOriginal<typeof import('@/i.js')>(),
	get $i() { return login.account; },
	iAmModerator: true,
}));

const flushPromises = () => new Promise<void>(resolve => window.setTimeout(resolve, 0));

describe('XHome', () => {
	const renderHome = (user: Partial<Misskey.entities.UserDetailed>): RenderResult => {
		return render(XHome, {
			props: { user: user as Misskey.entities.UserDetailed, disableNotes: true },
			global: { directives, components, stubs: { MkFollowButton: true } },
		});
	};
	const renderMemo = (memo = 'Saved memo') => renderHome({
		id: 'memo-user',
		username: 'memo-user',
		name: 'Memo user',
		host: 'example.com',
		uri: 'https://example.com/@memo-user',
		roles: [],
		createdAt: '1970-01-01T00:00:00.000Z',
		fields: [],
		pinnedNotes: [],
		avatarDecorations: [],
		memo,
	});

	beforeEach(() => {
		login.account = { id: 'memo-user' };
	});

	afterEach(() => {
		cleanup();
		login.account = null;
		vi.restoreAllMocks();
	});

	test('Should render the remote caution when user.host exists', async () => {
		const home = renderHome({
			id: 'blobcat',
			name: 'blobcat',
			host: 'example.com',
			uri: 'https://example.com/@user',
			url: 'https://example.com/@user/profile',
			roles: [],
			createdAt: '1970-01-01T00:00:00.000Z',
			fields: [],
			pinnedNotes: [],
			avatarUrl: 'https://example.com',
			avatarDecorations: [],
		});

		const anchor = home.container.querySelector<HTMLAnchorElement>('a[href^="https://example.com/"]');
		assert.exists(anchor, 'anchor to the remote exists');
		assert.strictEqual(anchor?.href, 'https://example.com/@user/profile');
	});

	test.each([
		{ company: 'Example Company', jobTitle: 'Engineer' },
		{ company: 'Example Company', jobTitle: null },
		{ company: null, jobTitle: 'Engineer' },
		{ company: null, jobTitle: null },
	])('shows only populated company and job title fields: %j', profile => {
		const home = renderHome({
			id: 'work-user', username: 'work-user', host: null,
			roles: [], fields: [], pinnedNotes: [], avatarDecorations: [],
			createdAt: '1970-01-01T00:00:00.000Z', ...profile,
		});
		const fields = home.container.querySelector('.fields.system')!;
		for (const [key, value] of Object.entries(profile)) {
			const label = i18n.ts._profile[key as 'company' | 'jobTitle'];
			const field = [...fields.querySelectorAll('dl')].find(row => row.querySelector('dt')?.textContent?.trim() === label);
			if (value) expect(field?.querySelector('dd')?.textContent).toBe(value);
			else expect(field).toBeUndefined();
		}
	});

	test('The remote caution should fall back to uri if url is null', async () => {
		const home = renderHome({
			id: 'blobcat',
			name: 'blobcat',
			host: 'example.com',
			uri: 'https://example.com/@user',
			url: null,
			roles: [],
			createdAt: '1970-01-01T00:00:00.000Z',
			fields: [],
			pinnedNotes: [],
			avatarUrl: 'https://example.com',
			avatarDecorations: [],
		});

		const anchor = home.container.querySelector<HTMLAnchorElement>('a[href^="https://example.com/"]');
		assert.exists(anchor, 'anchor to the remote exists');
		assert.strictEqual(anchor?.href, 'https://example.com/@user');
	});

	test('edits the memo in a dialog and only updates its tag after saving', async () => {
		const input = vi.spyOn(os, 'inputText').mockResolvedValue({ canceled: false, result: 'Edited memo' });
		let completeSave: (() => void) | undefined;
		const save = vi.spyOn(os, 'apiWithDialog').mockImplementationOnce(() => new Promise<never>(resolve => {
			completeSave = () => resolve(undefined as never);
		}));
		const home = renderMemo();

		await fireEvent.click(home.getAllByRole('button', { name: i18n.ts.editMemo })[0]);
		expect(input).toHaveBeenCalledExactlyOnceWith({ title: i18n.ts.editMemo, default: 'Saved memo' });
		expect(home.queryByRole('textbox', { name: i18n.ts.memo })).toBeNull();
		expect(home.container.querySelector('.banner-container .name')?.textContent).toContain('#Saved memo');
		expect(save).toHaveBeenCalledExactlyOnceWith('users/update-memo', { userId: 'memo-user', memo: 'Edited memo' });
		expect(home.getAllByRole('button', { name: i18n.ts.editMemo })[0]).toHaveProperty('disabled', true);
		await fireEvent.click(home.getAllByRole('button', { name: i18n.ts.editMemo })[0]);
		expect(input).toHaveBeenCalledTimes(1);
		completeSave?.();
		await flushPromises();
		expect(home.getAllByRole('button', { name: i18n.ts.editMemo }).map(button => button.textContent)).toEqual(['#Edited memo', '#Edited memo']);
		expect(home.getAllByRole('button', { name: i18n.ts.editMemo })[0]).toHaveProperty('disabled', false);
	});

	test('adds a memo beside the display name without showing an inline editor', async () => {
		const input = vi.spyOn(os, 'inputText').mockResolvedValue({ canceled: false, result: 'Friend' });
		const save = vi.spyOn(os, 'apiWithDialog').mockResolvedValue(undefined as never);
		const home = renderMemo('');
		await fireEvent.click(home.getAllByRole('button', { name: i18n.ts.addMemo })[0]);
		await flushPromises();
		expect(input).toHaveBeenCalledExactlyOnceWith({ title: i18n.ts.addMemo, default: '' });
		expect(save).toHaveBeenCalledExactlyOnceWith('users/update-memo', { userId: 'memo-user', memo: 'Friend' });
		expect(home.container.querySelector('.banner-container .name')?.textContent).toContain('Memo user#Friend');
		expect(home.queryByRole('textbox', { name: i18n.ts.memo })).toBeNull();
	});

	test.each([true, false])('does not save a canceled=%s or unchanged memo dialog', async canceled => {
		vi.spyOn(os, 'inputText').mockResolvedValue(canceled ? { canceled: true, result: undefined } : { canceled: false, result: 'Saved memo' });
		const save = vi.spyOn(os, 'apiWithDialog').mockResolvedValue(undefined as never);
		const home = renderMemo();
		await fireEvent.click(home.getAllByRole('button', { name: i18n.ts.editMemo })[0]);
		await flushPromises();
		expect(home.getAllByRole('button', { name: i18n.ts.editMemo })[0].textContent).toBe('#Saved memo');
		expect(save).not.toHaveBeenCalled();
	});

	test('clears the memo tag through the dialog', async () => {
		vi.spyOn(os, 'inputText').mockResolvedValue({ canceled: false, result: '' });
		const save = vi.spyOn(os, 'apiWithDialog').mockResolvedValue(undefined as never);
		const home = renderMemo();
		await fireEvent.click(home.getAllByRole('button', { name: i18n.ts.editMemo })[0]);
		await flushPromises();
		expect(home.queryByRole('button', { name: i18n.ts.editMemo })).toBeNull();
		expect(home.getAllByRole('button', { name: i18n.ts.addMemo })).toHaveLength(1);
		expect(save).toHaveBeenCalledExactlyOnceWith('users/update-memo', { userId: 'memo-user', memo: '' });
	});

	test('keeps the previous memo when saving fails', async () => {
		vi.spyOn(os, 'inputText').mockResolvedValue({ canceled: false, result: 'Edited memo' });
		vi.spyOn(os, 'apiWithDialog').mockRejectedValue(new Error('Save failed'));
		const home = renderMemo();
		await fireEvent.click(home.getAllByRole('button', { name: i18n.ts.editMemo })[0]);
		await flushPromises();
		expect(home.getAllByRole('button', { name: i18n.ts.editMemo })[0].textContent).toBe('#Saved memo');
	});

	test('opens and saves the moderation note from the profile', async () => {
		const form = vi.spyOn(os, 'form').mockResolvedValue({ canceled: false, result: { text: 'Moderator note' } });
		const save = vi.spyOn(os, 'apiWithDialog').mockResolvedValue(undefined as never);
		const home = renderMemo();
		await fireEvent.click(home.getByRole('button', { name: i18n.ts.addModerationNote }));
		await flushPromises();
		expect(form).toHaveBeenCalledExactlyOnceWith(i18n.ts.moderationNote, {
			text: {
				type: 'string',
				multiline: true,
				label: i18n.ts.moderationNote,
				description: i18n.ts.moderationNoteDescription,
				default: '',
			},
		});
		expect(home.queryByRole('textbox', { name: i18n.ts.moderationNote })).toBeNull();
		expect(save).toHaveBeenCalledExactlyOnceWith('admin/update-user-note', { userId: 'memo-user', text: 'Moderator note' });
		form.mockResolvedValueOnce({ canceled: true });
		await fireEvent.click(home.getByRole('button', { name: i18n.ts.moderationNote }));
		await flushPromises();
		expect(form.mock.lastCall?.[1].text).toMatchObject({ default: 'Moderator note' });
		expect(save).toHaveBeenCalledTimes(1);
	});
});
