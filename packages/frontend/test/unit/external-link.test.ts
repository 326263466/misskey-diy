/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { defineComponent, h } from 'vue';
import { url as local } from '@@/js/config.js';
import MkLink from '@/components/MkLink.vue';
import MkUrl from '@/components/global/MkUrl.vue';
import MkUrlPreview from '@/components/MkUrlPreview.vue';
import { confirmExternalLink } from '@/utility/external-link.js';

const mocks = vi.hoisted(() => ({ popup: vi.fn(), dispose: vi.fn(), navigate: vi.fn() }));
vi.mock('@/os.js', () => ({ popupAsyncWithDialog: mocks.popup }));
vi.mock('@/components/MkExternalLinkDialog.vue', () => ({ default: {} }));
vi.mock('@/composables/use-tooltip.js', () => ({ useTooltip: vi.fn() }));
vi.mock('@/utility/url-preview.js', () => ({ isEnabledUrlPreview: { value: false }, transformPlayerUrl: (url: string) => url }));

const internalLink = defineComponent({
	props: ['to'],
	setup: (props, { slots }) => () => h('a', { href: props.to, onClick: mocks.navigate }, slots.default?.()),
});

function click(anchor: HTMLAnchorElement, init: MouseEventInit = {}, type = 'click'): MouseEvent {
	const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
	anchor.dispatchEvent(event);
	return event;
}

async function closeDialog(): Promise<void> {
	await Promise.resolve();
	const handlers = mocks.popup.mock.lastCall?.[2];
	if (handlers) handlers.closed();
	mocks.popup.mockClear();
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.popup.mockResolvedValue({ dispose: mocks.dispose });
	vi.spyOn(window, 'fetch').mockResolvedValue(new Response(JSON.stringify({ url: 'https://example.com/', title: 'Preview' })));
});

afterEach(async () => {
	await closeDialog();
	cleanup();
	vi.restoreAllMocks();
});

describe.each([
	{ name: 'MkLink', component: MkLink },
	{ name: 'MkUrl', component: MkUrl },
	{ name: 'MkUrlPreview', component: MkUrlPreview },
])('$name external navigation', ({ component }) => {
	function renderLink(url: string): HTMLAnchorElement {
		const view = render(component, {
			props: { url },
			global: { components: { MkA: internalLink, MkEllipsis: { template: '<span />' } } },
		});
		return view.getByRole('link') as HTMLAnchorElement;
	}

	test.each([
		{ name: 'regular click', init: {} },
		{ name: 'keyboard activation', init: { detail: 0 } },
		{ name: 'Ctrl click', init: { ctrlKey: true } },
		{ name: 'Cmd click', init: { metaKey: true } },
		{ name: 'Shift click', init: { shiftKey: true } },
		{ name: 'middle click', init: { button: 1 }, type: 'auxclick' },
	])('confirms $name before leaving', ({ init, type }) => {
		const url = 'https://example.com/video?source=note#part';
		const anchor = renderLink(url);
		const parentClick = vi.fn();
		anchor.parentElement!.addEventListener(type ?? 'click', parentClick);
		const event = click(anchor, init, type);

		expect(event.defaultPrevented).toBe(true);
		expect(parentClick).not.toHaveBeenCalled();
		expect(mocks.popup).toHaveBeenCalledOnce();
		expect(mocks.popup.mock.calls[0][1]).toEqual({ url, returnFocusTo: anchor });
		expect(anchor.href).toBe(url);
	});

	test('preserves internal navigation without confirmation', () => {
		const anchor = renderLink(`${local}/notes/123?view=all#reply`);
		const event = click(anchor);
		expect(mocks.navigate).toHaveBeenCalledOnce();
		expect(event.defaultPrevented).toBe(false);
		expect(mocks.popup).not.toHaveBeenCalled();
		expect(anchor.getAttribute('href')).toBe('/notes/123?view=all#reply');
	});

	test('does not treat right click as navigation', () => {
		const event = click(renderLink('https://example.com/'), { button: 2 }, 'auxclick');
		expect(event.defaultPrevented).toBe(false);
		expect(mocks.popup).not.toHaveBeenCalled();
	});
});

describe('external link destination checks', () => {
	function anchorFor(url: string): HTMLAnchorElement {
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.addEventListener('click', confirmExternalLink);
		return anchor;
	}

	test.each([
		`${new URL(local).protocol}//${new URL(local).hostname}.evil.example/path`,
		`${local}@evil.example/path`,
		`${new URL(local).protocol}//${new URL(local).hostname}:49152/path`,
		`${new URL(local).protocol === 'http:' ? 'https:' : 'http:'}//${new URL(local).host}/path`,
	])('confirms different origins: %s', (url) => {
		expect(click(anchorFor(url)).defaultPrevented).toBe(true);
		expect(mocks.popup).toHaveBeenCalledOnce();
	});

	test.each(['/notes/123', '#reply', `${local}/notes/123`])('allows local URLs: %s', (url) => {
		expect(click(anchorFor(url)).defaultPrevented).toBe(false);
		expect(mocks.popup).not.toHaveBeenCalled();
	});

	test.each(['mailto:test@example.com', 'tel:+123456789', 'https://[invalid'])('does not offer web navigation for %s', (url) => {
		click(anchorFor(url));
		expect(mocks.popup).not.toHaveBeenCalled();
	});

	test('reads the current href and keeps that destination while confirmation is open', () => {
		const anchor = anchorFor('https://example.com/old');
		anchor.href = 'https://example.com/current';
		click(anchor);
		anchor.href = 'https://example.com/later';
		expect(mocks.popup.mock.calls[0][1]).toEqual({ url: 'https://example.com/current', returnFocusTo: anchor });
	});

	test('prevents duplicate dialogs and allows another after closing', async () => {
		const anchor = anchorFor('https://example.com/');
		expect(click(anchor).defaultPrevented).toBe(true);
		expect(click(anchor).defaultPrevented).toBe(true);
		expect(mocks.popup).toHaveBeenCalledOnce();
		await closeDialog();
		expect(mocks.dispose).toHaveBeenCalledOnce();
		click(anchor);
		expect(mocks.popup).toHaveBeenCalledOnce();
	});

	test('allows retry after the dialog fails to load', async () => {
		mocks.popup.mockRejectedValueOnce(new Error('Failed to load component'));
		const anchor = anchorFor('https://example.com/');
		expect(click(anchor).defaultPrevented).toBe(true);
		await Promise.resolve();
		expect(click(anchor).defaultPrevented).toBe(true);
		expect(mocks.popup).toHaveBeenCalledTimes(2);
	});

	test('respects an already canceled navigation event', () => {
		const anchor = anchorFor('https://example.com/');
		const event = new MouseEvent('click', { cancelable: true });
		event.preventDefault();
		anchor.dispatchEvent(event);
		expect(mocks.popup).not.toHaveBeenCalled();
	});
});
