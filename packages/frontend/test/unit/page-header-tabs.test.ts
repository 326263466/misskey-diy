/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import PageHeaderTabs from '@/components/global/MkPageHeader.tabs.vue';
import MkTabs from '@/components/MkTabs.vue';
import type { Tab } from '@/components/global/MkPageHeader.tabs.vue';

vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: true } } }));

const tabs: Tab[] = [
	{ key: 'recommended', title: 'Recommended' },
	{ key: 'following', title: 'Following' },
];

const variants = [
	{
		name: 'page header tabs',
		render: (tab = 'recommended', items = tabs) => render(PageHeaderTabs, { props: { tab, tabs: items } }),
	},
	{
		name: 'shared tabs',
		render: (tab = 'recommended', items = tabs) => render(MkTabs, {
			props: { tab, tabs: items },
			global: { directives: { tooltip: {} } },
		}),
	},
];

afterEach(cleanup);

describe.each(variants)('$name activation', ({ render: renderTabs }) => {
	test('emits one selection for a primary mouse activation and keeps current-tab click actions', async () => {
		const view = renderTabs();
		const following = view.getByRole('button', { name: 'Following' });
		await fireEvent.mouseDown(following, { button: 0 });
		expect(view.emitted()['update:tab']).toEqual([['following']]);
		await view.rerender({ tab: 'following' });
		await fireEvent.click(following);
		await fireEvent.mouseDown(following, { button: 0 });
		await fireEvent.click(following);
		expect(view.emitted()['update:tab']).toEqual([['following']]);
		expect(view.emitted().tabClick).toEqual([['following'], ['following']]);
	});

	test.each([1, 2])('does not switch tabs on mouse button %i', async button => {
		const view = renderTabs();
		await fireEvent.mouseDown(view.getByRole('button', { name: 'Following' }), { button });
		expect(view.emitted()['update:tab']).toBeUndefined();
		expect(view.emitted().tabClick).toBeUndefined();
	});

	test('supports keyboard-style clicks without a preceding mousedown', async () => {
		const view = renderTabs();
		await fireEvent.click(view.getByRole('button', { name: 'Following' }), { detail: 0 });
		expect(view.emitted()['update:tab']).toEqual([['following']]);
		expect(view.emitted().tabClick).toEqual([['following']]);
	});

	test('runs a tab action only on click, preserving its event and preventing bubbling', async () => {
		const onClick = vi.fn();
		const view = renderTabs('recommended', [tabs[0], { ...tabs[1], onClick }]);
		const following = view.getByRole('button', { name: 'Following' });
		const parentClick = vi.fn();
		view.container.addEventListener('click', parentClick);
		await fireEvent.mouseDown(following, { button: 0 });
		expect(onClick).not.toHaveBeenCalled();
		await view.rerender({ tab: 'following' });
		const event = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 });
		following.dispatchEvent(event);
		expect(onClick).toHaveBeenCalledExactlyOnceWith(event);
		expect(event.defaultPrevented).toBe(true);
		expect(parentClick).not.toHaveBeenCalled();
		expect(view.emitted()['update:tab']).toEqual([['following']]);
		expect(view.emitted().tabClick).toEqual([['following']]);
	});

	test('accepts consecutive selections without adding updates for the current tab', async () => {
		const view = renderTabs();
		for (const [key, title] of [['following', 'Following'], ['recommended', 'Recommended'], ['following', 'Following']]) {
			await fireEvent.click(view.getByRole('button', { name: title }));
			await view.rerender({ tab: key });
		}
		await fireEvent.click(view.getByRole('button', { name: 'Following' }));
		expect(view.emitted()['update:tab']).toEqual([['following'], ['recommended'], ['following']]);
		expect(view.emitted().tabClick).toEqual([['following'], ['recommended'], ['following'], ['following']]);
	});
});
