/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import type * as Misskey from 'misskey-js';
import '@tabler/icons-webfont/dist/tabler-icons.css';
import '@/style.scss';
import MkChannelPicker from '@/components/MkChannelPicker.vue';
import { hotkeyDirective } from '@/directives/hotkey.js';
import { updateDeviceKind } from '@/utility/device-kind.js';

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/i.js', () => ({ $i: { id: 'self' } }));
vi.mock('@/os.js', () => ({ claimZIndex: () => 1000 }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false, menuStyle: 'popup' } } }));
vi.mock('@/utility/focus-trap.js', () => ({ focusTrap: () => ({ release: () => {} }) }));
vi.mock('@/i18n.js', () => ({ i18n: {
	ts: {
		selectChannel: '选择频道', close: '关闭', recommended: '推荐', error: '出错了', retry: '重试', loadMore: '更多',
		_channelPicker: { mine: '我的', other: '其他', searchPlaceholder: '搜索频道名称', empty: '没有找到频道', description: '频道内的帖子公开可见，仅在本站发布。', noChannel: '不选择频道' },
	},
	tsx: { _channel: { usersCount: ({ n }: { n: number }) => `${n} 人参与`, notesCount: ({ n }: { n: number }) => `${n} 篇帖子` } },
} }));

let app: App | undefined;
let host: HTMLElement | undefined;

async function settle(): Promise<void> {
	await nextTick();
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

afterEach(async () => {
	app?.unmount();
	host?.remove();
	app = undefined;
	host = undefined;
	updateDeviceKind(null);
	vi.clearAllMocks();
	await settle();
});

test.each([
	{ width: 900, height: 700, dark: false },
	{ width: 390, height: 700, dark: true },
	{ width: 320, height: 400, dark: false },
])('channel picker keeps categories and footer usable at $width × $height (dark: $dark)', async ({ width, height, dark }) => {
	await page.viewport(width, height);
	updateDeviceKind(width > 500 ? 'desktop' : 'smartphone');
	host = document.createElement('div');
	host.style.cssText = '--MI_THEME-accent:#86b300;--MI_THEME-divider:#8884;--MI_THEME-focus:#86b300;--MI_THEME-modalBg:#0008;--MI_THEME-shadow:#0003;color:var(--MI_THEME-fg);font-size:14px;';
	host.style.setProperty('--MI_THEME-popup', dark ? '#282f32' : '#fff');
	host.style.setProperty('--MI_THEME-fg', dark ? '#e2e6e9' : '#444');
	document.body.append(host);
	const anchor = document.createElement('button');
	anchor.textContent = '选择频道';
	anchor.style.cssText = 'position:fixed;left:24px;top:24px;height:32px;';
	host.append(anchor);
	const mountPoint = document.createElement('div');
	host.append(mountPoint);
	const channels = Array.from({ length: 20 }, (_, index) => ({
		id: `channel-${index}`, name: index === 0 ? '分享日常与生活中值得记录的小事' : `摄影交流 ${index}`,
		usersCount: 12 + index, notesCount: 42 + index, isArchived: false, isSensitive: false, bannerUrl: null,
	})) as Misskey.entities.Channel[];
	mocks.api.mockImplementation((endpoint: string) => Promise.resolve(endpoint === 'channels/featured' ? channels : []));
	const choose = vi.fn();
	app = createApp({ render: () => h(MkChannelPicker, { anchorElement: anchor, selectedId: 'channel-0', onChoose: choose }) });
	app.directive('hotkey', hotkeyDirective);
	app.mount(mountPoint);
	await document.fonts.ready;
	await settle();
	const root = page.getByRole('dialog', { name: '选择频道' }).element() as HTMLElement;
	const footer = root.querySelector('footer')!;
	const footerBox = footer.getBoundingClientRect();
	const results = root.querySelector<HTMLElement>('[aria-busy]')!;
	const categories = root.querySelector<HTMLElement>('[role="group"]')!;
	const rootBox = root.getBoundingClientRect();
	expect(rootBox.left).toBeGreaterThanOrEqual(0);
	expect(rootBox.right).toBeLessThanOrEqual(width);
	expect(rootBox.bottom).toBeLessThanOrEqual(height);
	expect(root.scrollWidth).toBe(root.clientWidth);
	if (height >= 700) expect(rootBox.height).toBe(380);
	if (width > 500) expect(rootBox.width).toBe(328);
	expect(categories.getBoundingClientRect().right).toBeLessThanOrEqual(results.getBoundingClientRect().left);
	for (const category of categories.querySelectorAll('button')) {
		const text = document.createRange();
		text.selectNodeContents(category);
		const textBox = text.getBoundingClientRect();
		const buttonBox = category.getBoundingClientRect();
		expect(Math.abs(textBox.left + textBox.width / 2 - buttonBox.left - buttonBox.width / 2)).toBeLessThan(1);
		expect(Math.abs(textBox.top + textBox.height / 2 - buttonBox.top - buttonBox.height / 2)).toBeLessThan(2);
	}
	expect(results.scrollHeight).toBeGreaterThan(results.clientHeight);
	results.scrollTop = results.scrollHeight;
	await settle();
	expect(results.scrollTop).toBeGreaterThan(0);
	expect(footer.getBoundingClientRect().top).toBe(footerBox.top);
	await expect.element(page.getByRole('button', { name: '不选择频道', exact: true })).toBeVisible();
	results.scrollTop = 0;
	await page.screenshot({ element: root, path: `../e2e/artifacts/component-browser/channel-picker-${width}-${dark ? 'dark' : 'light'}.png` });
	await page.getByRole('button', { name: '其他', exact: true }).click();
	await expect.element(page.getByRole('button', { name: '其他', exact: true })).toHaveAttribute('aria-pressed', 'true');
	await expect.element(page.getByRole('status')).toHaveTextContent('没有找到频道');
	expect(root.getBoundingClientRect().height).toBe(rootBox.height);
	await page.getByRole('button', { name: '不选择频道', exact: true }).click();
	expect(choose).toHaveBeenCalledExactlyOnceWith(null);
});
