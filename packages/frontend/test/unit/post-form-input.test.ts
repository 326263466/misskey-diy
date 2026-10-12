/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { defineComponent, h, nextTick, ref } from 'vue';
import type { entities } from 'misskey-js';
import MkPostFormInput from '@/components/MkPostFormInput.vue';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({ upload: vi.fn(), choose: vi.fn(), toast: vi.fn(), menu: vi.fn(), release: vi.fn() }));
vi.mock('@/i.js', () => ({ $i: { id: 'composer' }, ensureSignin: () => ({ id: 'composer', policies: {} }) }));
vi.mock('@/os.js', () => ({ chooseFileFromPc: mocks.choose, toast: mocks.toast, popupMenu: mocks.menu }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { keepOriginalFilename: true, defaultImageCompressionLevel: 0 } } }));
vi.mock('@/utility/drive.js', () => ({ uploadFile: mocks.upload, UploadAbortedError: class extends Error {} }));
vi.mock('@/utility/lightbox.js', () => ({ isPreviewable: () => true, getType: () => 'image' }));
vi.mock('@/utility/autocomplete.js', () => ({ Autocomplete: class { detach() {} } }));
vi.mock('@/utility/emoji-picker.js', () => ({ emojiPicker: { show: vi.fn() } }));
vi.mock('@/utility/draft-file-protection.js', async () => {
	const { ref } = await import('vue');
	return { createDraftFileProtection: () => ({ id: 'composer:test', status: ref('saved'), update: vi.fn(), release: mocks.release, dispose: vi.fn() }) };
});
vi.mock('@/components/MkEmojiInputOverlay.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkPostFormAttaches.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkUploaderItems.vue', () => ({ default: {
	props: ['items'], emits: ['showMenu'],
	template: '<div><button v-for="item in items" :key="item.id" @click="$emit(\'showMenu\', item, $event)">{{ item.name }}</button></div>',
} }));

const image = (id: string) => ({ id, name: `${id}.svg`, type: 'image/svg+xml', url: `https://example.com/${id}.svg`, properties: {}, isSensitive: false }) as entities.DriveFile;
const localImage = (name: string) => new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], name, { type: 'image/svg+xml' });

function mount() {
	const text = ref('');
	const files = ref<entities.DriveFile[]>([]);
	const maxLength = ref(3);
	const form = ref<InstanceType<typeof MkPostFormInput>>();
	const submit = vi.fn();
	const view = render(defineComponent({
		setup: () => () => h(MkPostFormInput, {
			ref: form, modelValue: text.value, files: files.value, maxLength: maxLength.value, onSubmit: submit,
			'onUpdate:modelValue': value => { text.value = value; }, 'onUpdate:files': value => { files.value = value; },
		}),
	}), { global: { directives: { tooltip: () => {} } } });
	return { ...view, text, files, maxLength, form, submit };
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:composer');
	vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

test('uses the current Unicode limit when deciding whether the composer can submit', async () => {
	const view = mount();
	await fireEvent.update(view.getByRole('textbox'), '😀😀😀😀');
	expect(view.getByText('4/3')).toBeTruthy();
	expect(view.form.value?.valid).toBe(false);
	await fireEvent.keyDown(view.getByRole('textbox'), { key: 'Enter', ctrlKey: true });
	expect(view.submit).not.toHaveBeenCalled();
	view.maxLength.value = 4;
	await nextTick();
	expect(view.getByText('4/4')).toBeTruthy();
	expect(view.form.value?.valid).toBe(true);
	await fireEvent.keyDown(view.getByRole('textbox'), { key: 'Enter', ctrlKey: true });
	expect(view.submit).toHaveBeenCalledOnce();
});

test('uploads each selected image once and waits for the whole batch before enabling submit', async () => {
	const pending = [Promise.withResolvers<entities.DriveFile>(), Promise.withResolvers<entities.DriveFile>()];
	mocks.choose.mockResolvedValue([localImage('one.svg'), localImage('two.svg'), new File(['text'], 'text.txt', { type: 'text/plain' })]);
	mocks.upload.mockImplementation(() => ({ filePromise: pending[mocks.upload.mock.calls.length - 1].promise, abort: vi.fn() }));
	const view = mount();
	await fireEvent.click(view.getByRole('button', { name: i18n.ts.attachFile }));
	await waitFor(() => expect(mocks.upload).toHaveBeenCalledOnce());
	pending[0].resolve(image('one'));
	await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(2));
	expect(view.form.value?.valid).toBe(false);
	pending[1].resolve(image('two'));
	await waitFor(() => expect(view.form.value?.valid).toBe(true));
	expect(view.files.value.map(file => file.id)).toEqual(['one', 'two']);
	expect(mocks.upload).toHaveBeenCalledTimes(2);
	view.form.value?.submitted();
	await nextTick();
	expect(view.files.value).toEqual([]);
	expect(mocks.release).toHaveBeenCalledOnce();
});

test('keeps a failed batch for manual retry without repeatedly starting the queue', async () => {
	const pending = Array.from({ length: 4 }, () => Promise.withResolvers<entities.DriveFile>());
	mocks.choose.mockResolvedValue([localImage('one.svg'), localImage('two.svg')]);
	mocks.upload.mockImplementation(() => ({ filePromise: pending[mocks.upload.mock.calls.length - 1].promise, abort: vi.fn() }));
	const view = mount();
	await fireEvent.update(view.getByRole('textbox'), '草稿');
	await fireEvent.click(view.getByRole('button', { name: i18n.ts.attachFile }));
	await waitFor(() => expect(mocks.upload).toHaveBeenCalledOnce());
	pending[0].reject(new Error('offline'));
	await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(i18n.ts.somethingHappened, 'error'));
	await nextTick();
	expect(mocks.upload).toHaveBeenCalledOnce();
	expect(view.text.value).toBe('草稿');
	expect(view.form.value?.valid).toBe(false);
	await fireEvent.click(view.getByRole('button', { name: 'one.svg' }));
	const retry = mocks.menu.mock.lastCall![0].find((item: { text?: string }) => item.text === i18n.ts.upload).action;
	const failedRetry = retry();
	await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(2));
	pending[1].reject(new Error('still offline'));
	await failedRetry;
	expect(mocks.toast).toHaveBeenCalledTimes(2);
	await nextTick();
	expect(mocks.upload).toHaveBeenCalledTimes(2);
	void retry();
	await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(3));
	pending[2].resolve(image('one'));
	await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(4));
	pending[3].resolve(image('two'));
	await waitFor(() => expect(view.form.value?.valid).toBe(true));
	expect(view.files.value.map(file => file.id)).toEqual(['one', 'two']);
});

test.each(['upload', 'remove'])('does not re-upload a queued image after manually choosing %s', async action => {
	const pending = [Promise.withResolvers<entities.DriveFile>(), Promise.withResolvers<entities.DriveFile>()];
	mocks.choose.mockResolvedValue([localImage('one.svg'), localImage('two.svg')]);
	mocks.upload.mockImplementation(() => ({ filePromise: pending[mocks.upload.mock.calls.length - 1].promise, abort: vi.fn() }));
	const view = mount();
	await fireEvent.click(view.getByRole('button', { name: i18n.ts.attachFile }));
	await waitFor(() => expect(mocks.upload).toHaveBeenCalledOnce());
	await fireEvent.click(view.getByRole('button', { name: 'two.svg' }));
	const menu = mocks.menu.mock.lastCall![0];
	const chosen = menu.find((item: { text?: string }) => item.text === (action === 'upload' ? i18n.ts.upload : i18n.ts.remove));
	const completed = chosen.action();
	if (action === 'upload') {
		await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(2));
		pending[1].resolve(image('two'));
		await completed;
	}
	pending[0].resolve(image('one'));
	await waitFor(() => expect(view.form.value?.valid).toBe(true));
	expect(mocks.upload).toHaveBeenCalledTimes(action === 'upload' ? 2 : 1);
	expect(view.files.value.map(file => file.id)).toEqual(action === 'upload' ? ['two', 'one'] : ['one']);
});
