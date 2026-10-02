/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import '@tabler/icons-webfont/dist/tabler-icons.css';
import '@/style.scss';
import MkNoteDraftsDialog from '@/components/MkNoteDraftsDialog.vue';
import MkResult from '@/components/global/MkResult.vue';
import { updateDeviceKind } from '@/utility/device-kind.js';
import { prefer } from '@/preferences.js';

const mocks = vi.hoisted(() => ({ api: vi.fn(), popup: vi.fn(), popupMenu: vi.fn() }));
vi.mock('misskey-js', () => ({}));
vi.mock('@/utility/misskey-api', () => ({ misskeyApi: mocks.api }));
vi.mock('@/os.js', () => ({ claimZIndex: () => 1000, popup: mocks.popup, popupMenu: mocks.popupMenu }));
vi.mock('@/preferences.js', async () => {
	const { reactive } = await import('vue');
	return { prefer: { s: reactive({ animation: false, menuStyle: 'popup' }) } };
});
vi.mock('@/utility/focus-trap.js', () => ({ focusTrap: () => ({ release: () => {} }) }));
vi.mock('@/components/global/MkA.vue', () => ({ default: { render: () => null } }));
vi.mock('@/i.js', () => ({ $i: { policies: { noteDraftLimit: 10 } } }));
vi.mock('@/instance.js', () => ({ instance: {} }));
vi.mock('@/components/MkDialog.vue', () => ({ default: { render: () => null } }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: {
	close: '关闭', drafts: '草稿', scheduled: '定时', nothing: '没有定时内容', reload: '刷新', dateAndTime: '时间', clear: '清除',
	_order: { newest: '从新到旧', oldest: '从旧到新' },
	_drafts: { noDrafts: '没有草稿', restore: '恢复', delete: '删除' },
	_visibility: { public: '公开' },
} } }));

let app: App | undefined;
let host: HTMLElement | undefined;

async function settle() {
	await nextTick();
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

afterEach(async () => {
	app?.unmount();
	host?.remove();
	app = undefined;
	host = undefined;
	prefer.s.animation = false;
	updateDeviceKind(null);
	await settle();
});

test.each([
	{ count: 0, width: 900, height: 1100, scheduled: false },
	{ count: 0, width: 900, height: 1100, scheduled: true },
	{ count: 2, width: 900, height: 1100, scheduled: false },
	{ count: 7, width: 900, height: 1100, scheduled: false },
	{ count: 7, width: 390, height: 700, scheduled: false },
	{ count: 0, width: 320, height: 700, scheduled: false },
	{ count: 0, width: 320, height: 700, scheduled: true },
])('opens at its final height without a loading frame: $count rows, $width px, scheduled $scheduled', async ({ count, width, height, scheduled }) => {
	await page.viewport(width, height);
	mocks.popup.mockReturnValue({ dispose: vi.fn() });
	updateDeviceKind(width < 500 ? 'smartphone' : 'desktop');
	let finish!: (value: unknown[]) => void;
	let listRequests = 0;
	mocks.api.mockImplementation((endpoint: string) => {
		if (endpoint === 'notes/drafts/count') return Promise.resolve(count);
		listRequests++;
		return listRequests === 1 ? new Promise(resolve => { finish = resolve; }) : Promise.resolve([]);
	});
	host = document.createElement('div');
	host.style.cssText = '--MI-radius:12px;--MI-margin:16px;--MI-marginHalf:8px;--MI_THEME-bg:#f2f3f5;--MI_THEME-panel:#fff;--MI_THEME-windowHeader:#fff;--MI_THEME-fg:#333;--MI_THEME-accent:#2686ff;--MI_THEME-divider:#ddd;--MI_THEME-inputBorder:#ddd;--MI_THEME-inputBorderHover:#2686ff;--MI_THEME-buttonBg:#eee;--MI_THEME-modalBg:#0006;font-size:14px;';
	document.body.append(host);
	app = createApp({ render: () => h(MkNoteDraftsDialog, { scheduled }) });
	app.component('MkResult', MkResult);
	app.component('MkSystemIcon', { render: () => h('span', 'ⓘ') });
	app.component('MkLoading', { render: () => h('div', { 'data-testid': 'loading-spinner' }) });
	app.component('MkTime', { render: () => h('time', '2026/10/01') });
	// Match the application's global component name.
	// eslint-disable-next-line vue/multi-word-component-names
	app.component('Mfm', { props: ['text'], render() { return h('span', this.text); } });
	for (const name of ['I18n', 'MkAcct', 'MkError']) app.component(name, { render: () => null });
	for (const directive of ['hotkey', 'tooltip', 'appear', 'panel']) app.directive(directive, () => {});
	app.mount(host);
	await settle();
	expect(host.querySelector('[data-testid="modal-window-close"]')).toBeNull();
	expect(host.querySelector('[data-testid="loading-spinner"]')).toBeNull();
	const drafts = Array.from({ length: count }, (_, index) => ({
		id: String(100 - index), text: `草稿 ${index + 1}`, createdAt: '2026-10-01T00:00:00Z',
		visibility: 'public', localOnly: false, files: [], user: { id: 'self' },
	}));
	finish(drafts);
	await expect.element(page.getByTestId('modal-window-close')).toBeVisible();
	await document.fonts.ready;
	await settle();
	const root = host.querySelector('[data-testid="modal-window-close"]')!.parentElement!.parentElement!;
	const body = root.children[1] as HTMLElement;
	const header = root.firstElementChild as HTMLElement;
	const headerBox = header.getBoundingClientRect();
	const headerCenter = headerBox.top + headerBox.height / 2;
	expect(headerBox.height).toBe(40);
	const title = header.children[1] as HTMLElement;
	const sort = header.querySelector<HTMLElement>('[tabindex="0"]')!;
	expect(sort).not.toBeNull();
	expect(header.contains(page.getByRole('button', { name: '刷新' }).element())).toBe(true);
	expect(header.contains(page.getByRole('button', { name: '时间' }).element())).toBe(true);
	for (const element of [title, sort, ...header.querySelectorAll('button, i')]) {
		const box = element.getBoundingClientRect();
		expect(Math.abs(box.top + box.height / 2 - headerCenter)).toBeLessThan(1);
		expect(box.top).toBeGreaterThanOrEqual(headerBox.top);
		expect(box.bottom).toBeLessThanOrEqual(headerBox.bottom);
		expect(box.right).toBeLessThanOrEqual(headerBox.right);
	}
	expect(header.scrollWidth).toBe(header.clientWidth);
	expect(title.scrollWidth).toBe(title.clientWidth);
	const sortTextRange = document.createRange();
	sortTextRange.selectNodeContents(page.getByText('从新到旧', { exact: true }).element());
	expect(sortTextRange.getClientRects()).toHaveLength(1);
	await userEvent.click(sort);
	expect(mocks.popupMenu).toHaveBeenCalled();
	const firstHeight = root.getBoundingClientRect().height;
	expect(firstHeight).toBeGreaterThan(100);
	expect(firstHeight).toBeLessThanOrEqual(Math.min(900, height));
	if (count <= 2) {
		expect(firstHeight).toBeLessThan(600);
		expect(body.scrollHeight).toBe(body.clientHeight);
	} else {
		expect(body.scrollHeight).toBeGreaterThan(body.clientHeight);
		body.scrollTop = body.scrollHeight;
		expect(body.scrollTop).toBeGreaterThan(0);
	}
	await settle();
	expect(root.getBoundingClientRect().height).toBe(firstHeight);
	expect(root.getBoundingClientRect().bottom).toBeLessThanOrEqual(height);
	expect(host.querySelector('[data-testid="loading-spinner"]')).toBeNull();
	await page.screenshot({ element: root, path: `../e2e/artifacts/component-browser/drafts-${count}-${width}-${scheduled}.png` });
	let finishRefresh!: (value: unknown[]) => void;
	prefer.s.animation = true;
	mocks.api.mockImplementationOnce(() => new Promise(resolve => { finishRefresh = resolve; }));
	await page.getByRole('button', { name: '刷新' }).click();
	await settle();
	expect(root.getBoundingClientRect().height).toBe(firstHeight);
	expect(host.querySelector('[data-testid="loading-spinner"]')).toBeNull();
	finishRefresh(drafts.map(draft => ({ ...draft, text: '已刷新' })));
	// Observe every frame across the normal 125ms out-in transition interval.
	const until = performance.now() + 250;
	while (performance.now() < until) {
		await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
		expect(root.getBoundingClientRect().height).toBe(firstHeight);
	}
	if (count > 0) await expect.element(page.getByText('已刷新').first()).toBeVisible();
	await settle();
	expect(root.getBoundingClientRect().height).toBe(firstHeight);
	await page.getByRole('button', { name: '时间' }).click();
	const dateEvents = mocks.popup.mock.calls.at(-1)![2];
	dateEvents.done({ canceled: false, result: '2026-10-01' });
	await expect.element(page.getByRole('button', { name: '清除' })).toBeVisible();
	await settle();
	expect(header.getBoundingClientRect().height).toBe(40);
	expect(header.scrollWidth).toBe(header.clientWidth);
	expect(sortTextRange.getClientRects()).toHaveLength(1);
});
