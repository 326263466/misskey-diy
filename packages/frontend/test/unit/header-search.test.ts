/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import Header from '@/ui/_common_/juejin-header.vue';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({
	pushByPath: vi.fn(),
	input: vi.fn(),
	select: vi.fn(),
	confirm: vi.fn(),
	popupAsyncWithDialog: vi.fn(),
}));

vi.mock('@/router.js', () => ({ useRouter: () => ({ pushByPath: mocks.pushByPath }) }));
vi.mock('@/os.js', () => ({
	input: mocks.input,
	select: mocks.select,
	confirm: mocks.confirm,
	popupAsyncWithDialog: mocks.popupAsyncWithDialog,
	popupMenu: vi.fn(),
	post: vi.fn(),
}));
vi.mock('@/ui/_common_/common.js', () => ({ openInstanceMenu: vi.fn(), toggleRealtimeMode: vi.fn() }));
vi.mock('@/accounts.js', () => ({ getAccountMenu: vi.fn() }));
vi.mock('@/navbar.js', () => ({ navbarItemDef: {} }));
vi.mock('@/instance.js', () => ({ instance: { name: 'Test instance', iconUrl: null } }));
vi.mock('@/i.js', () => ({ $i: null }));
vi.mock('@/store.js', () => ({ store: { r: { realtimeMode: { value: false } } } }));

function renderHeader() {
	return render(Header, {
		global: {
			components: { MkA: { props: ['to'], template: '<a :href="to"><slot/></a>' } },
			stubs: { MkAvatar: true },
			directives: { tooltip: {} },
		},
	});
}

function expectNoDialog() {
	expect(mocks.input).not.toHaveBeenCalled();
	expect(mocks.select).not.toHaveBeenCalled();
	expect(mocks.confirm).not.toHaveBeenCalled();
	expect(mocks.popupAsyncWithDialog).not.toHaveBeenCalled();
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('header search submission', () => {
	test.each(['', '   ', '\t\n  '])('does not navigate when submitting an empty query: %j', async query => {
		const view = renderHeader();
		await fireEvent.update(view.getByRole('searchbox'), query);
		expect(view.getByRole('search').querySelector('button[type="submit"]')).toHaveProperty('disabled', true);
		await fireEvent.submit(view.getByRole('search'));
		expect(mocks.pushByPath).not.toHaveBeenCalled();
		expectNoDialog();
	});

	test.each(['搜索 & more', '@alice', '#topic', 'https://example.com/notes/1?q=hello'])('opens the result page directly with the trimmed query: %s', async query => {
		const view = renderHeader();
		const input = view.getByRole('searchbox');
		await fireEvent.update(input, `  ${query}  `);
		expect(view.getByRole('search').querySelector('button[type="submit"]')).toHaveProperty('disabled', false);
		await fireEvent.submit(view.getByRole('search'));
		expect(mocks.pushByPath).toHaveBeenCalledExactlyOnceWith(`/search?q=${encodeURIComponent(query)}`);
		expect(input).toHaveProperty('value', '');
		expectNoDialog();
	});

	test.each([{ isComposing: true }, { keyCode: 229 }])('cancels the native Enter submission while confirming IME text: %j', async options => {
		const view = renderHeader();
		const input = view.getByRole('searchbox');
		await fireEvent.update(input, '入力中');
		const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...options });
		input.dispatchEvent(event);
		await nextTick();
		expect(event.defaultPrevented).toBe(true);
		expect(mocks.pushByPath).not.toHaveBeenCalled();
		expect(input).toHaveProperty('value', '入力中');
	});

	test('allows the native Enter submission after composition has finished', async () => {
		const view = renderHeader();
		const input = view.getByRole('searchbox');
		await fireEvent.update(input, '確定した検索語');
		const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
		input.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(false);
		await fireEvent.submit(view.getByRole('search'));
		expect(mocks.pushByPath).toHaveBeenCalledExactlyOnceWith(`/search?q=${encodeURIComponent('確定した検索語')}`);
	});
});

describe('header search keyboard and compact entry', () => {
	test('exposes its placeholder, supported shortcuts and Mac-style keycap', () => {
		const view = renderHeader();
		const input = view.getByRole('searchbox', { name: i18n.ts.search });
		expect(input.getAttribute('placeholder')).toBe(i18n.ts._search.placeholder);
		expect(input.getAttribute('aria-keyshortcuts')).toBe('Control+k Meta+k');
		const keycap = view.container.querySelector('kbd');
		expect(keycap?.textContent?.replace(/\s/g, '')).toBe('⌘K');
		expect(keycap?.getAttribute('aria-hidden')).toBe('true');
	});

	test.each([{ ctrlKey: true }, { metaKey: true }])('focuses and selects the query from another input with %j + K without navigating', async modifier => {
		const view = renderHeader();
		const input = view.getByRole('searchbox') as HTMLInputElement;
		await fireEvent.update(input, 'existing query');
		const otherInput = document.createElement('textarea');
		view.container.append(otherInput);
		otherInput.focus();
		expect(document.activeElement).toBe(otherInput);
		const event = new KeyboardEvent('keydown', { key: 'k', bubbles: true, cancelable: true, ...modifier });
		otherInput.dispatchEvent(event);
		await nextTick();
		expect(event.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(input);
		expect(input.selectionStart).toBe(0);
		expect(input.selectionEnd).toBe(input.value.length);
		expect(view.container.querySelector('button[aria-controls]')?.getAttribute('aria-expanded')).toBe('true');
		expect(mocks.pushByPath).not.toHaveBeenCalled();
		expectNoDialog();
	});

	test.each([
		{ key: 'k' },
		{ key: 'f', ctrlKey: true },
		{ key: 'k', ctrlKey: true, shiftKey: true },
		{ key: 'k', ctrlKey: true, altKey: true },
		{ key: 'k', metaKey: true, shiftKey: true },
		{ key: 'k', metaKey: true, altKey: true },
		{ key: 'k', ctrlKey: true, isComposing: true },
	])('leaves unrelated or modified keyboard events alone: %j', async options => {
		const view = renderHeader();
		const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...options });
		document.dispatchEvent(event);
		await nextTick();
		expect(event.defaultPrevented).toBe(false);
		expect(document.activeElement).not.toBe(view.getByRole('searchbox'));
		expect(mocks.pushByPath).not.toHaveBeenCalled();
	});

	test('prevents the browser shortcut on key repeat without moving focus again', async () => {
		const view = renderHeader();
		const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, repeat: true, bubbles: true, cancelable: true });
		document.dispatchEvent(event);
		await nextTick();
		expect(event.defaultPrevented).toBe(true);
		expect(document.activeElement).not.toBe(view.getByRole('searchbox'));
		expect(mocks.pushByPath).not.toHaveBeenCalled();
	});

	test('respects a shortcut already handled by another control', async () => {
		const view = renderHeader();
		const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true });
		event.preventDefault();
		document.dispatchEvent(event);
		await nextTick();
		expect(document.activeElement).not.toBe(view.getByRole('searchbox'));
		expect(mocks.pushByPath).not.toHaveBeenCalled();
	});

	test('removes the global shortcut when the header is unmounted', async () => {
		const view = renderHeader();
		view.unmount();
		const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true });
		document.dispatchEvent(event);
		await nextTick();
		expect(event.defaultPrevented).toBe(false);
		expect(mocks.pushByPath).not.toHaveBeenCalled();
	});

	test('the compact search button expands and focuses its field without navigating', async () => {
		const view = renderHeader();
		const toggle = view.container.querySelector<HTMLButtonElement>('button[aria-controls]')!;
		expect(toggle.getAttribute('aria-expanded')).toBe('false');
		expect(toggle.getAttribute('aria-controls')).toBe(view.getByRole('search').id);
		await fireEvent.click(toggle);
		expect(toggle.getAttribute('aria-expanded')).toBe('true');
		expect(document.activeElement).toBe(view.getByRole('searchbox'));
		expect(mocks.pushByPath).not.toHaveBeenCalled();
		expectNoDialog();
	});

	test('pressing the submit icon preserves input focus until the compact form is submitted', async () => {
		const view = renderHeader();
		const toggle = view.container.querySelector<HTMLButtonElement>('button[aria-controls]')!;
		const input = view.getByRole('searchbox');
		const submit = view.getByRole('search').querySelector<HTMLButtonElement>('button[type="submit"]')!;
		await fireEvent.click(toggle);
		await fireEvent.update(input, 'compact search');
		const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
		submit.dispatchEvent(event);
		await nextTick();
		expect(event.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(input);
		expect(toggle.getAttribute('aria-expanded')).toBe('true');
		expect(mocks.pushByPath).not.toHaveBeenCalled();
		await fireEvent.click(submit);
		expect(mocks.pushByPath).toHaveBeenCalledExactlyOnceWith('/search?q=compact%20search');
		expect(toggle.getAttribute('aria-expanded')).toBe('false');
	});

	test('Escape closes the compact field and restores its trigger without discarding the query', async () => {
		const view = renderHeader();
		const toggle = view.container.querySelector<HTMLButtonElement>('button[aria-controls]')!;
		Object.defineProperty(toggle, 'offsetParent', { value: document.body });
		const input = view.getByRole('searchbox');
		await fireEvent.click(toggle);
		await fireEvent.update(input, 'keep this query');
		await fireEvent.keyDown(input, { key: 'Escape', isComposing: true });
		expect(toggle.getAttribute('aria-expanded')).toBe('true');
		await fireEvent.keyDown(input, { key: 'Escape' });
		expect(toggle.getAttribute('aria-expanded')).toBe('false');
		expect(document.activeElement).toBe(toggle);
		expect(input).toHaveProperty('value', 'keep this query');
		expect(mocks.pushByPath).not.toHaveBeenCalled();
	});

	test('stays open for internal focus changes and closes when focus or a pointer moves outside', async () => {
		const view = renderHeader();
		const toggle = view.container.querySelector<HTMLButtonElement>('button[aria-controls]')!;
		const input = view.getByRole('searchbox');
		const submit = view.getByRole('search').querySelector<HTMLButtonElement>('button[type="submit"]')!;
		await fireEvent.click(toggle);
		await fireEvent.focusOut(input, { relatedTarget: submit });
		expect(toggle.getAttribute('aria-expanded')).toBe('true');
		await fireEvent.pointerDown(submit);
		expect(toggle.getAttribute('aria-expanded')).toBe('true');
		await fireEvent.pointerDown(document.body);
		expect(toggle.getAttribute('aria-expanded')).toBe('false');
		await fireEvent.click(toggle);
		await fireEvent.focusOut(input, { relatedTarget: document.body });
		expect(toggle.getAttribute('aria-expanded')).toBe('false');
		expect(mocks.pushByPath).not.toHaveBeenCalled();
	});
});
