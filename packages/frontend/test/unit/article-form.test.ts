/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { defineComponent, h, nextTick, ref } from 'vue';
import MkArticleForm from '@/components/MkArticleForm.vue';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({ actions: vi.fn(), alert: vi.fn(), apiWithDialog: vi.fn(), pageWindow: vi.fn() }));
vi.mock('@/os.js', () => mocks);
vi.mock('@/i.js', () => ({ ensureSignin: () => ({ id: 'article-test', username: 'author' }) }));

let storage: Record<string, string>;
beforeEach(() => {
	vi.clearAllMocks();
	storage = {};
	vi.stubGlobal('localStorage', new Proxy({
		getItem: (key: string) => storage[key] ?? null,
		setItem: (key: string, value: string) => { storage[key] = value; },
		removeItem: (key: string) => { delete storage[key]; },
	}, {
		ownKeys: () => Object.keys(storage),
		getOwnPropertyDescriptor: () => ({ configurable: true, enumerable: true }),
	}));
	mocks.actions.mockResolvedValue({ canceled: false, result: 'save' });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function editor() {
	const form = ref<InstanceType<typeof MkArticleForm>>();
	const view = render(defineComponent({ setup: () => () => h(MkArticleForm, { ref: form, freezeAfterPosted: true }) }), {
		global: { stubs: { MkInfo: { template: '<div><slot/></div>' }, Mfm: true, MkEllipsis: true } },
	});
	await nextTick();
	const title = view.container.querySelector('[data-testid="article-form-title"]') as HTMLInputElement;
	const text = view.container.querySelector('[data-testid="article-form-text"]') as HTMLTextAreaElement;
	return { ...view, title, text, form: form.value! };
}

test('preserves saved title and body across close cleanup and reopening', async () => {
	const first = await editor();
	await fireEvent.update(first.title, 'My article');
	await fireEvent.update(first.text, 'Long article body');
	expect(await first.form.canClose()).toBe(true);
	first.form.clear();
	first.unmount();
	const second = await editor();
	expect(second.title.value).toBe('My article');
	expect(second.text.value).toBe('Long article body');
});

test('isolates two open articles and discards only the selected draft', async () => {
	const first = await editor();
	await fireEvent.update(first.title, 'First article');
	const second = await editor();
	expect(second.title.value).toBe('');
	await fireEvent.update(second.title, 'Second article');
	expect(Object.keys(storage)).toHaveLength(2);
	mocks.actions.mockResolvedValueOnce({ canceled: false, result: 'discard' });
	expect(await second.form.canClose()).toBe(true);
	second.unmount();
	expect(Object.values(storage).join()).toContain('First article');
	expect(Object.values(storage).join()).not.toContain('Second article');
});

test('retains the article on canceled close and failed publication, then publishes a Page', async () => {
	const view = await editor();
	await fireEvent.update(view.title, 'Publish me');
	await fireEvent.update(view.text, 'Body with **MFM**');
	mocks.actions.mockResolvedValueOnce({ canceled: true });
	expect(await view.form.canClose()).toBe(false);
	mocks.apiWithDialog.mockRejectedValueOnce(new Error('offline'));
	await fireEvent.click(view.getByTestId('article-form-submit'));
	await waitFor(() => expect(view.getByTestId('article-form-submit').hasAttribute('disabled')).toBe(false));
	expect(view.text.value).toBe('Body with **MFM**');
	mocks.apiWithDialog.mockResolvedValueOnce({ name: 'published-page' });
	await fireEvent.click(view.getByTestId('article-form-submit'));
	await waitFor(() => expect(mocks.pageWindow).toHaveBeenCalledWith('/@author/pages/published-page'));
	expect(mocks.apiWithDialog).toHaveBeenLastCalledWith('pages/create', expect.objectContaining({
		title: 'Publish me', content: [expect.objectContaining({ type: 'text', text: 'Body with **MFM**' })],
	}));
	expect(Object.keys(storage)).toHaveLength(0);
	expect(await view.form.canClose()).toBe(true);
});

test('blocks save-and-close if local storage rejects a write', async () => {
	const view = await editor();
	await fireEvent.update(view.title, 'Keep me');
	const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('full'); });
	try {
		expect(await view.form.canClose()).toBe(false);
		expect(view.title.value).toBe('Keep me');
		expect(mocks.alert).toHaveBeenCalledWith({ type: 'error', text: i18n.ts._articleForm.draftSaveFailed });
	} finally { spy.mockRestore(); }
});
