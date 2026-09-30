/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import Header from '@/ui/_common_/juejin-header.vue';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({
	pushByPath: vi.fn(),
	contextMenu: vi.fn(),
	popupMenu: vi.fn(),
}));

vi.mock('@/router.js', () => ({ useRouter: () => ({ pushByPath: mocks.pushByPath }) }));
vi.mock('@/os.js', () => ({
	contextMenu: mocks.contextMenu,
	popupMenu: mocks.popupMenu,
	popupAsyncWithDialog: vi.fn(),
	post: vi.fn(),
}));
vi.mock('@/accounts.js', () => ({ getAccountMenu: vi.fn() }));
vi.mock('@/navbar.js', () => ({ navbarItemDef: {} }));
vi.mock('@/instance.js', () => ({ instance: { name: 'Test instance', iconUrl: null, federation: 'all' } }));
vi.mock('@/i.js', () => ({ $i: null }));
vi.mock('@/store.js', () => ({ store: { r: { realtimeMode: { value: false } }, s: { realtimeMode: false } } }));

function renderHeader() {
	return render(Header, {
		global: {
			components: { MkA: { props: ['to'], template: '<a :href="to"><slot/></a>' } },
			stubs: { MkAvatar: true },
			directives: { tooltip: {} },
		},
	});
}

function logoOf(view: ReturnType<typeof renderHeader>) {
	return view.getByRole('button', { name: 'Test instance' });
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('header logo', () => {
	test('navigates home on left click without opening any menu', async () => {
		const view = renderHeader();
		await fireEvent.click(logoOf(view));
		expect(mocks.pushByPath).toHaveBeenCalledExactlyOnceWith('/');
		expect(mocks.contextMenu).not.toHaveBeenCalled();
		expect(mocks.popupMenu).not.toHaveBeenCalled();
	});

	test('opens the instance menu from the cursor on right click', async () => {
		const view = renderHeader();
		const logo = logoOf(view);
		await fireEvent.contextMenu(logo);

		expect(mocks.contextMenu).toHaveBeenCalledOnce();
		expect(mocks.popupMenu).not.toHaveBeenCalled();
		expect(mocks.pushByPath).not.toHaveBeenCalled();

		const [items, ev] = mocks.contextMenu.mock.calls[0];
		expect(ev.type).toBe('contextmenu');
		expect(ev.target).toBe(logo);
		expect(items[0]).toMatchObject({ type: 'label', text: 'Test instance' });
		expect(items).toEqual(expect.arrayContaining([
			expect.objectContaining({ type: 'link', to: '/about', text: i18n.ts.instanceInfo }),
		]));
	});

	test('leaves preventDefault to os.contextMenu', async () => {
		const view = renderHeader();
		const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
		logoOf(view).dispatchEvent(ev);
		expect(ev.defaultPrevented).toBe(false);
	});
});
