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
import MkCustomStatusDialog from '@/components/MkCustomStatusDialog.vue';
import { updateDeviceKind } from '@/utility/device-kind.js';

vi.mock('@/os.js', () => ({ claimZIndex: () => 1000 }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false, menuStyle: 'popup' } } }));
vi.mock('@/utility/focus-trap.js', () => ({ focusTrap: () => ({ release: () => {} }) }));
vi.mock('@/components/global/MkA.vue', () => ({ default: { render: () => null } }));
vi.mock('@/i18n.js', () => ({ i18n: {
	ts: {
		close: '关闭', preview: '预览', icon: '图标', text: '文字', remove: '移除', cancel: '取消', save: '保存',
		_onlineStatus: {
			customStatus: '自定义状态', customStatusPlaceholder: '写下此刻的状态', useStatus: '使用此状态',
			customStatusInvalidCharacters: '不能包含换行和控制字符。',
			_groups: { daily: '日常', focus: '专注', relax: '放松', travel: '出行', mood: '心情', social: '社交' },
			_icons: {
				coffee: '休息中', music: '听歌中', gamepad: '打游戏中', briefcase: '工作中', book: '学习中', moon: '睡觉中', heart: '心情很好', plane: '旅行中',
				food: '吃饭中', home: '宅在家', pet: '陪陪毛孩子', code: '写代码中', focus: '专注中', film: '看电影', car: '在路上', vacation: '度假中',
				exercise: '运动中', sun: '今天很灿烂', cloud: '放空一会儿', battery: '电量不足', chat: '聊聊天', celebrate: '值得庆祝', gift: '准备惊喜', handshake: '一起加油',
			},
		},
	},
	tsx: { _onlineStatus: { customStatusLimit: ({ max }: { max: number }) => `最多 ${max} 个字符` } },
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
	await settle();
});

test.each([
	{ width: 900, height: 700, dark: false },
	{ width: 390, height: 700, dark: true },
	{ width: 320, height: 480, dark: false },
])('custom status stays usable at $width × $height (dark: $dark)', async ({ width, height, dark }) => {
	await page.viewport(width, height);
	updateDeviceKind(width > 500 ? 'desktop' : 'smartphone');
	host = document.createElement('div');
	host.style.cssText = '--MI-cardPadding:20px;--MI_THEME-accent:#86b300;--MI_THEME-accentedBg:#86b30022;--MI_THEME-fgOnAccent:#132000;--MI_THEME-divider:#8884;--MI_THEME-inputBorder:#8888;--MI_THEME-focus:#86b300;--MI_THEME-buttonBg:#8882;--MI_THEME-buttonHoverBg:#8883;--MI_THEME-modalBg:#0008;--MI_THEME-error:#ec4137;color:var(--MI_THEME-fg);font-size:14px;';
	host.style.setProperty('--MI_THEME-bg', dark ? '#17191f' : '#f2f3f5');
	host.style.setProperty('--MI_THEME-panel', dark ? '#282f32' : '#fff');
	host.style.setProperty('--MI_THEME-windowHeader', dark ? '#282f32' : '#fff');
	host.style.setProperty('--MI_THEME-fg', dark ? '#e2e6e9' : '#444');
	if (dark) {
		host.style.setProperty('--MI_THEME-accent', '#a98cff');
		host.style.setProperty('--MI_THEME-accentedBg', '#a98cff22');
		host.style.setProperty('--MI_THEME-focus', '#a98cff');
		host.style.setProperty('--MI_THEME-fgOnAccent', '#241b3c');
	}
	document.body.append(host);
	const save = vi.fn().mockResolvedValue(undefined);
	app = createApp({ render: () => h(MkCustomStatusDialog, { initialStatus: { icon: 'music', text: '听音乐' }, save }) });
	app.directive('hotkey', () => {});
	app.mount(host);
	await document.fonts.ready;
	await settle();
	expect(host.querySelector('input[type="text"]')).toBeNull();
	expect(host.querySelector('[aria-live="polite"]')).toBeNull();
	const preview = host.querySelector<HTMLElement>('[aria-label="预览"]')!;
	const previewIcon = preview.querySelector<HTMLElement>('[data-custom-status-icon="music"]')!;
	expect(previewIcon.getBoundingClientRect().width).toBe(40);
	expect(previewIcon.querySelector('i, svg, img')).toBeNull();
	expect(preview.getBoundingClientRect().height).toBeLessThanOrEqual(112);
	expect(getComputedStyle(preview).backgroundImage).toBe('none');
	const textBox = page.getByRole('button', { name: '文字' }).element().getBoundingClientRect();
	expect(textBox.top).toBeGreaterThan(previewIcon.getBoundingClientRect().bottom);
	expect(Math.abs(previewIcon.getBoundingClientRect().left + 20 - textBox.left - textBox.width / 2)).toBeLessThan(1);
	const radios = Array.from(host.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
	expect(radios).toHaveLength(12);
	expect(host.querySelectorAll('h3, legend')).toHaveLength(0);
	expect(new Set(radios.map(radio => radio.getBoundingClientRect().top)).size).toBe(width > 500 ? 3 : 4);
	for (const radio of radios) {
		const option = radio.parentElement!;
		expect(getComputedStyle(option).boxShadow).toBe('none');
		const badge = option.querySelector<HTMLElement>(`[data-custom-status-icon="${radio.value}"]`)!;
		const glyph = badge.firstElementChild as HTMLElement;
		expect(badge.querySelector('i, svg, img')).toBeNull();
		const badgeBox = badge.getBoundingClientRect();
		expect(badgeBox.width).toBe(28);
		expect(glyph.offsetLeft).toBeGreaterThanOrEqual(0);
		expect(glyph.offsetTop).toBeGreaterThanOrEqual(0);
		expect(glyph.offsetLeft + glyph.offsetWidth).toBeLessThanOrEqual(badge.clientWidth);
		expect(glyph.offsetTop + glyph.offsetHeight).toBeLessThanOrEqual(badge.clientHeight);
		expect(getComputedStyle(glyph).color).not.toBe(getComputedStyle(badge).backgroundColor);
	}
	const close = host.querySelector<HTMLElement>('[data-testid="modal-window-close"]')!;
	const root = close.parentElement!.parentElement!;
	const body = root.children[1] as HTMLElement;
	expect(body.scrollWidth).toBe(body.clientWidth);
	expect(root.getBoundingClientRect().left).toBeGreaterThanOrEqual(0);
	expect(root.getBoundingClientRect().right).toBeLessThanOrEqual(width);
	expect(root.getBoundingClientRect().bottom).toBeLessThanOrEqual(height);
	if (width > 500) {
		expect(root.getBoundingClientRect().height).toBeLessThanOrEqual(440);
		expect(body.scrollHeight).toBe(body.clientHeight);
	}
	const footer = root.lastElementChild as HTMLElement;
	expect(Array.from(footer.querySelectorAll('button'), button => button.textContent)).toEqual(['移除', '使用此状态']);
	const footerBox = footer.getBoundingClientRect();
	expect(footerBox.bottom).toBeLessThanOrEqual(height);
	expect(footerBox.top).toBeGreaterThanOrEqual(0);
	expect(footer.contains(page.getByRole('button', { name: '使用此状态', exact: true }).element())).toBe(true);
	const formBox = body.querySelector('form')!.getBoundingClientRect();
	for (const button of body.querySelectorAll('button')) {
		expect(button.getBoundingClientRect().left).toBeGreaterThanOrEqual(formBox.left);
		expect(button.getBoundingClientRect().right).toBeLessThanOrEqual(formBox.right);
	}
	await page.getByRole('radio', { name: '在路上' }).click();
	await expect.element(page.getByRole('button', { name: '文字' })).toHaveTextContent('在路上');
	expect(preview.querySelector('[data-custom-status-icon="car"]')).not.toBeNull();
	body.scrollTop = 0;
	await settle();
	await page.screenshot({ element: root, path: `../e2e/artifacts/component-browser/custom-status-${width}-${dark ? 'dark' : 'light'}.png` });
	await page.getByRole('button', { name: '文字' }).click();
	await page.getByRole('textbox', { name: '文字' }).fill('休息中');
	const coffee = page.getByRole('radio', { name: '休息中' });
	const coffeeBox = coffee.element().getBoundingClientRect();
	await coffee.click({ position: { x: coffeeBox.width / 2, y: coffeeBox.height - 4 } });
	await expect.element(coffee).toBeChecked();
	expect(host.querySelector('input[type="text"]')).toBeNull();
	expect(coffee.element().getBoundingClientRect().top).toBe(coffeeBox.top);
	await expect.element(page.getByRole('button', { name: '文字' })).toHaveTextContent('休息中');
	await page.getByRole('radio', { name: '打游戏中' }).click();
	await expect.element(page.getByRole('button', { name: '文字' })).toHaveTextContent('打游戏中');
	expect(preview.querySelector('[data-custom-status-icon="gamepad"]')).not.toBeNull();
	await userEvent.keyboard('{ArrowRight}');
	await expect.element(page.getByRole('radio', { name: '运动中', exact: true })).toBeChecked();
	await expect.element(page.getByRole('button', { name: '文字' })).toHaveTextContent('运动中');
	await page.getByRole('button', { name: '文字' }).click();
	const input = page.getByRole('textbox', { name: '文字' });
	await expect.element(input).toHaveFocus();
	const inputStyle = getComputedStyle(input.element());
	expect(inputStyle.borderWidth).toBe('0px');
	expect(inputStyle.outlineStyle).toBe('none');
	expect(inputStyle.boxShadow).toContain('inset');
	if (width === 900) await page.screenshot({ element: root, path: '../e2e/artifacts/component-browser/custom-status-900-editing.png' });
	await input.fill('🚀'.repeat(9));
	await expect.element(input).toHaveValue('🚀'.repeat(8));
	await userEvent.keyboard('{Enter}');
	await expect.element(input).not.toBeInTheDocument();
	expect(save).not.toHaveBeenCalled();
	await page.getByRole('button', { name: '文字' }).click();
	await input.fill('撤销这次');
	await userEvent.keyboard('{Escape}');
	await expect.element(input).not.toBeInTheDocument();
	await expect.element(page.getByRole('button', { name: '文字' })).toHaveTextContent('🚀'.repeat(8));
	await page.getByRole('radio', { name: '度假中' }).click();
	await expect.element(page.getByRole('button', { name: '文字' })).toHaveTextContent('度假中');
	if (width === 900) await page.screenshot({ element: root, path: '../e2e/artifacts/component-browser/custom-status-900-vacation.png' });
	expect(footer.getBoundingClientRect().top).toBe(footerBox.top);
	await expect.element(page.getByRole('button', { name: '使用此状态', exact: true })).toBeVisible();
	if (width === 320) await page.screenshot({ element: root, path: '../e2e/artifacts/component-browser/custom-status-320-scrolled.png' });
	await expect.element(page.getByRole('button', { name: '使用此状态', exact: true })).toBeEnabled();
	await page.getByRole('button', { name: '使用此状态', exact: true }).click();
	expect(save).toHaveBeenCalledExactlyOnceWith({ icon: 'vacation', text: '度假中' });
});
