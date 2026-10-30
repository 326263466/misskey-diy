/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { reactive } from 'vue';
import { CONTENT_LIMITS } from 'misskey-js';
import { enqueueProfileSave } from '@/utility/profile-save.js';
import { useProfileFields } from '@/pages/settings/profile.fields.js';

describe('profile save queue', () => {
	test('evaluates read-modify-write tasks after previous confirmed state is applied', async () => {
		let complete!: () => void;
		const account = { decorations: ['first'] };
		const first = enqueueProfileSave(async () => {
			await new Promise<void>(resolve => { complete = resolve; });
			account.decorations = [...account.decorations, 'second'];
		});
		const next = vi.fn(async () => {
			account.decorations = [...account.decorations, 'third'];
		});
		const second = enqueueProfileSave(next);
		await vi.waitFor(() => expect(complete).toBeDefined());
		expect(next).not.toHaveBeenCalled();
		complete();
		await Promise.all([first, second]);
		expect(account.decorations).toEqual(['first', 'second', 'third']);
	});

	test('reports a failed save to its caller without blocking the next task', async () => {
		const failure = new Error('offline');
		const first = enqueueProfileSave(async () => { throw failure; });
		const second = enqueueProfileSave(async () => 'saved');
		await expect(first).rejects.toBe(failure);
		await expect(second).resolves.toBe('saved');
	});
});

function profileFields(initial: { name: string; value: string }[] = []) {
	const account = reactive({ fields: initial.map(field => ({ ...field })) });
	const save = vi.fn(async (fields: { name: string; value: string }[]) => {
		account.fields = fields.map(field => ({ ...field }));
	});
	const editor = useProfileFields({ websiteLabel: '个人网站', getFields: () => account.fields, save });
	return { account, editor, save };
}

describe('separate website and additional fields', () => {
	test('extracts only the first website and preserves duplicate names and unrelated links', async () => {
		const initial = [
			{ name: '作品', value: 'https://portfolio.example' },
			{ name: 'Website', value: 'https://old.example' },
			{ name: 'Website', value: 'https://other.example' },
		];
		const { account, editor } = profileFields(initial);
		expect(editor.website.value).toBe('https://old.example');
		expect(editor.fields.value.map(({ name, value }) => ({ name, value }))).toEqual([initial[0], initial[2]]);
		editor.fields.value[0].value = 'Unsaved';
		editor.website.value = ' https://new.example ';
		expect(await editor.saveWebsite()).toBe(true);
		expect(account.fields).toEqual([initial[0], { name: 'Website', value: 'https://new.example' }, initial[2]]);
		expect(editor.fields.value[0].value).toBe('Unsaved');
		editor.website.value = '';
		expect(await editor.saveWebsite()).toBe(true);
		expect(account.fields).toEqual([initial[0], initial[2]]);
	});

	test('saving other fields excludes empty rows and does not publish the website draft', async () => {
		const { account, editor } = profileFields([
			{ name: '技能', value: 'Photography' },
			{ name: '个人网站', value: 'https://saved.example' },
			{ name: '兴趣', value: 'Reading' },
		]);
		editor.website.value = 'https://draft.example';
		editor.fields.value[0].value = 'Editing';
		const firstFieldId = editor.fields.value[0].id;
		editor.moveField(firstFieldId, -1);
		expect(editor.fields.value[0].id).toBe(firstFieldId);
		editor.moveField(firstFieldId, 1);
		expect(editor.fields.value.map(field => field.name)).toEqual(['兴趣', '技能']);
		editor.addField();
		expect(await editor.saveFields()).toBe(true);
		expect(account.fields).toEqual([
			{ name: '兴趣', value: 'Reading' },
			{ name: '个人网站', value: 'https://saved.example' },
			{ name: '技能', value: 'Editing' },
		]);
		expect(editor.website.value).toBe('https://draft.example');
	});

	test.each(['website-first', 'fields-first'])('preserves both saves when queued: %s', async order => {
		const { account, editor } = profileFields([
			{ name: '个人网站', value: 'https://old.example' },
			{ name: '技能', value: 'Photography' },
		]);
		const release = Promise.withResolvers<void>();
		const blocker = enqueueProfileSave(() => release.promise);
		editor.website.value = 'https://new.example';
		editor.fields.value[0].value = 'Editing';
		const pending = order === 'website-first'
			? [editor.saveWebsite(), editor.saveFields()]
			: [editor.saveFields(), editor.saveWebsite()];
		release.resolve();
		await blocker;
		expect(await Promise.all(pending)).toEqual([true, true]);
		expect(account.fields).toEqual([
			{ name: '个人网站', value: 'https://new.example' },
			{ name: '技能', value: 'Editing' },
		]);
	});

	test('blocks invalid URLs and field overflow without dropping saved data', async () => {
		const initial = Array.from({ length: 16 }, (_, index) => ({ name: `Field ${index}`, value: 'Saved' }));
		const { account, editor, save } = profileFields(initial);
		editor.website.value = 'not-a-url';
		expect(editor.websiteError.value).toBe('url');
		expect(await editor.saveWebsite()).toBe(false);
		editor.website.value = `https://example.com/${'x'.repeat(CONTENT_LIMITS.profileFieldValue)}`;
		expect(editor.websiteError.value).toBe('length');
		editor.website.value = 'https://new.example';
		expect(editor.websiteError.value).toBe('limit');
		expect(await editor.saveWebsite()).toBe(false);
		expect(save).not.toHaveBeenCalled();
		expect(account.fields).toEqual(initial);
		editor.deleteField(editor.fields.value[0].id);
		expect(editor.websiteError.value).toBe('limit');
		expect(await editor.saveFields()).toBe(true);
		expect(await editor.saveWebsite()).toBe(true);
		expect(account.fields).toHaveLength(16);
		expect(editor.canAddField.value).toBe(false);
		editor.addField();
		expect(editor.fields.value).toHaveLength(15);
	});

	test('retains drafts after failures and preserves unchanged legacy field values', async () => {
		const initial = [{ name: 'Legacy', value: 'x'.repeat(CONTENT_LIMITS.profileFieldValue + 1) }];
		const { account, editor, save } = profileFields(initial);
		editor.website.value = 'http://example.com';
		save.mockRejectedValueOnce(new Error('offline'));
		expect(await editor.saveWebsite()).toBe(false);
		expect(editor.websiteSaving.value).toBe(false);
		expect(editor.websiteChanged.value).toBe(true);
		expect(account.fields).toEqual(initial);
		expect(await editor.saveWebsite()).toBe(true);
		expect(account.fields[1]).toEqual(initial[0]);
		editor.fields.value[0].value = 'Edited';
		save.mockRejectedValueOnce(new Error('offline'));
		expect(await editor.saveFields()).toBe(false);
		expect(editor.fieldsSaving.value).toBe(false);
		expect(editor.fields.value[0].value).toBe('Edited');
		expect(await editor.saveFields()).toBe(true);
		expect(account.fields[0]).toEqual({ name: '个人网站', value: 'http://example.com' });
	});
});
