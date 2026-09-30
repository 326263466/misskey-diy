/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import type { App, VNode } from 'vue';
import '@/style.scss';
import '@tabler/icons-webfont/dist/tabler-icons.css';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkShareDialog from '@/components/MkShareDialog.vue';
import { updateDeviceKind } from '@/utility/device-kind.js';
import { copyShareLink, copyShareText } from '@/utility/share.js';

vi.mock('@/os.js', () => ({ claimZIndex: () => 1000 }));
const preferences = vi.hoisted(() => ({ s: { animation: false, menuStyle: 'popup' } }));
vi.mock('@/preferences.js', () => ({ prefer: preferences }));
vi.mock('@/utility/focus-trap.js', () => ({ focusTrap: () => ({ release: () => {} }) }));
vi.mock('@/components/global/MkA.vue', () => ({ default: { render: () => null } }));
vi.mock('@/utility/share.js', async importOriginal => ({
	...await importOriginal<typeof import('@/utility/share.js')>(),
	canShareWithSystem: () => true,
	copyShareLink: vi.fn(async () => true),
	copyShareText: vi.fn(async () => true),
	shareWithSystem: async () => 'shared',
}));
vi.mock('@/i18n.js', () => ({ i18n: { ts: {
	close: '关闭', done: '完成', share: '分享', copyLink: '复制链接', copiedToClipboard: '已复制到剪贴板',
	copyContent: '复制内容', loading: '加载中', retry: '重试',
	_share: {
		copied: '已复制',
		system: '分享到其他应用', qrCode: '二维码', qrCodeDescription: '扫描二维码打开链接',
		shareTo: '分享到', wechat: '微信', qq: 'QQ', qzone: 'QQ空间', weibo: '微博', x: 'X',
		telegram: 'Telegram', facebook: 'Facebook', whatsapp: 'WhatsApp',
		wechatDescription: '使用微信扫一扫，打开链接后可分享给好友或朋友圈。', saveQrCode: '保存二维码',
		qrCodeFailed: '二维码生成失败', saveQrCodeFailed: '二维码保存失败',
		restrictedNote: '仅分享链接，有权查看的人才能打开内容。',
	},
} } }));

let app: App | undefined;
let host: HTMLElement | undefined;

async function settle() {
	await nextTick();
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

async function mount(render: () => VNode, cardPadding = 20, theme: 'dark' | 'light' = 'dark') {
	host = document.createElement('div');
	host.style.cssText = `--MI-cardPadding:${cardPadding}px;--MI_THEME-accent:#86b300;--MI_THEME-fgOnAccent:#152000;--MI_THEME-accentedBg:#86b30020;--MI_THEME-modalBg:#0008;--MI_THEME-focus:#86b300;color:var(--MI_THEME-fg);`;
	host.style.cssText += theme === 'dark'
		? '--MI_THEME-bg:#0c1411;--MI_THEME-panel:#19231f;--MI_THEME-fg:#dce4e0;--MI_THEME-fgTransparentWeak:#a0afa8;--MI_THEME-windowHeader:#17201c;--MI_THEME-divider:#344039;--MI_THEME-buttonBg:#25302a;--MI_THEME-buttonHoverBg:#2d3932;'
		: '--MI_THEME-bg:#f4f5f6;--MI_THEME-panel:#fff;--MI_THEME-fg:#35434a;--MI_THEME-fgTransparentWeak:#6b7780;--MI_THEME-windowHeader:#fff;--MI_THEME-divider:#e0e4e6;--MI_THEME-buttonBg:#edf0f2;--MI_THEME-buttonHoverBg:#e8ecef;';
	document.body.append(host);
	app = createApp({ render });
	app.directive('hotkey', () => {});
	app.mount(host);
	await document.fonts.ready;
	await settle();
}

function modalParts() {
	const header = host!.querySelector<HTMLElement>('[data-testid="modal-window-close"]')!.parentElement!;
	const root = header.parentElement!;
	const body = root.children[1] as HTMLElement;
	return { root, header, body };
}

afterEach(async () => {
	app?.unmount();
	host?.remove();
	app = undefined;
	host = undefined;
	updateDeviceKind(null);
	preferences.s.animation = false;
	vi.clearAllMocks();
	await settle();
});

test.each([
	{ width: 900, padding: 20, device: 'desktop' as const },
	{ width: 390, padding: 20, device: 'smartphone' as const },
	{ width: 390, padding: 28, device: 'smartphone' as const },
	{ width: 320, padding: 20, device: 'smartphone' as const },
])('share dialog keeps compact symmetric insets at $width px with a $padding px host token', async ({ width, padding, device }) => {
	await page.viewport(width, 700);
	updateDeviceKind(device);
	await mount(() => h(MkShareDialog, {
		title: 'admin 的帖子', text: '测试隐藏内容', url: 'http://127.0.0.1:3000/notes/example',
	}), padding);
	if (padding === 20) {
		await page.screenshot({ element: modalParts().root, path: `../e2e/artifacts/component-browser/share-dialog-compact-${width}.png` });
	}
	await page.getByRole('button', { name: '复制链接' }).click();
	await settle();
	const copiedLabel = page.getByRole('button', { name: '已复制', exact: true }).element().querySelector('span')!;
	expect(copiedLabel.textContent).toBe('已复制');
	expect(copiedLabel.scrollWidth).toBeLessThanOrEqual(copiedLabel.clientWidth);

	const { root, header, body } = modalParts();
	const bodyBox = body.getBoundingClientRect();
	const preview = body.firstElementChild!.firstElementChild!;
	const title = preview.firstElementChild!.getBoundingClientRect();
	const text = preview.lastElementChild!.getBoundingClientRect();
	const link = body.querySelector('input')!.parentElement!.getBoundingClientRect();
	const lastContent = Array.from(body.firstElementChild!.children).filter(child => child.getClientRects().length > 0).at(-1)!.getBoundingClientRect();
	expect(title.top - header.getBoundingClientRect().bottom).toBeCloseTo(16, 1);
	expect(title.left - bodyBox.left).toBeCloseTo(16, 1);
	expect(bodyBox.right - title.right).toBeCloseTo(16, 1);
	expect(text.left).toBeCloseTo(link.left, 1);
	expect(bodyBox.bottom - lastContent.bottom).toBeCloseTo(16, 1);
	expect(header.getBoundingClientRect().height).toBe(40);
	expect(body.scrollWidth).toBe(body.clientWidth);
	expect(root.getBoundingClientRect().right).toBeLessThanOrEqual(width);
	const platforms = body.querySelector('[role="group"]')!;
	expect(platforms.querySelectorAll('a[target="_blank"][rel="noopener noreferrer"]')).toHaveLength(7);
	const entries = Array.from(platforms.children);
	const rows = new Set(entries.map(entry => Math.round(entry.getBoundingClientRect().top)));
	expect(rows.size).toBe(device === 'desktop' ? 1 : 2);
	const iconBackgrounds = entries.map(entry => getComputedStyle(entry.firstElementChild!).backgroundColor);
	expect(iconBackgrounds).toEqual([
		'rgb(7, 193, 96)', 'rgb(18, 183, 245)', 'rgb(246, 185, 0)', 'rgb(230, 22, 45)',
		'rgb(0, 0, 0)', 'rgb(38, 165, 228)', 'rgb(24, 119, 242)', 'rgb(37, 211, 102)',
	]);
	if (padding === 20) await page.screenshot({ element: root, path: `../e2e/artifacts/component-browser/share-dialog-card-spacing-${width}.png` });
});

test('copy feedback blocks rapid clicks and restores the button after three seconds', async () => {
	await page.viewport(390, 700);
	updateDeviceKind('smartphone');
	await mount(() => h(MkShareDialog, { title: '分享', url: 'https://example.com/notes/example' }));
	const button = page.getByRole('button', { name: '复制链接', exact: true }).element() as HTMLButtonElement;
	await page.getByRole('button', { name: '复制链接', exact: true }).click();
	expect(button.disabled).toBe(true);
	expect(button.textContent).toContain('已复制');
	expect(button.querySelector('i')!.classList.contains('ti-check')).toBe(true);
	for (let count = 0; count < 10; count++) button.click();
	await settle();
	expect(copyShareLink).toHaveBeenCalledOnce();
	expect(button.textContent).toContain('已复制');
	expect(button.querySelector('i')!.classList.contains('ti-check')).toBe(true);
	await expect.poll(() => button.disabled, { timeout: 4000 }).toBe(false);
	expect(button.textContent).toContain('复制链接');
	expect(button.querySelector('i')!.classList.contains('ti-copy')).toBe(true);
	await page.getByRole('button', { name: '复制链接', exact: true }).click();
	expect(copyShareLink).toHaveBeenCalledTimes(2);
	expect(button.disabled).toBe(true);
});

test.each([900, 390, 320])('share preview truncates long content without changing copied data at %i px', async width => {
	await page.viewport(width, 700);
	updateDeviceKind(width === 900 ? 'desktop' : 'smartphone');
	const title = '很长的用户名称分享的帖子标题'.repeat(12);
	const text = '需要完整保留的正文 👨‍👩‍👧‍👦\n'.repeat(30);
	const url = `https://example.com/notes/example?ref=${'long-link-'.repeat(60)}`;
	await mount(() => h(MkShareDialog, { title, text, url }));
	const { root, body } = modalParts();
	const preview = body.firstElementChild!.firstElementChild!;
	const titleEl = preview.firstElementChild as HTMLElement;
	const textEl = preview.lastElementChild as HTMLElement;
	const input = body.querySelector('input')!;
	expect(titleEl.getBoundingClientRect().height).toBeCloseTo(parseFloat(getComputedStyle(titleEl).lineHeight), 1);
	expect(titleEl.scrollWidth).toBeGreaterThan(titleEl.clientWidth);
	expect(textEl.scrollHeight).toBeGreaterThan(textEl.clientHeight);
	expect(textEl.getBoundingClientRect().height).toBeLessThanOrEqual(parseFloat(getComputedStyle(textEl).lineHeight) * 2);
	expect(input.value).toBe(url);
	expect(input.scrollWidth).toBeGreaterThan(input.clientWidth);
	await page.getByRole('button', { name: '复制内容', exact: true }).click();
	expect(copyShareText).toHaveBeenCalledWith(`${title}\n${text}\n${url}`);
	await page.getByRole('button', { name: '复制链接', exact: true }).click();
	expect(copyShareLink).toHaveBeenCalledWith(url);
	await settle();
	expect(body.scrollWidth).toBe(body.clientWidth);
	expect(root.getBoundingClientRect().right).toBeLessThanOrEqual(width);
	await page.screenshot({ element: root, path: `../e2e/artifacts/component-browser/share-dialog-long-${width}.png` });
});

test.each([900, 390, 320])('expanded WeChat QR scrolls inside the dialog at %i px', async width => {
	await page.viewport(width, 400);
	updateDeviceKind(width === 900 ? 'desktop' : 'smartphone');
	await mount(() => h(MkShareDialog, {
		title: 'admin 的帖子', text: '分享此刻的发现', url: 'https://example.com/notes/qr-share',
	}));
	expect(host!.querySelector('[role="img"]')!.getClientRects()).toHaveLength(0);
	await page.getByRole('button', { name: '微信', exact: true }).click();
	await expect.poll(() => host!.querySelector('[role="img"] svg')).toBeTruthy();
	await settle();
	const { root, header, body } = modalParts();
	const headerBox = header.getBoundingClientRect();
	expect(body.scrollHeight).toBeGreaterThan(body.clientHeight);
	expect(body.scrollTop).toBeGreaterThan(0);
	expect(body.scrollWidth).toBe(body.clientWidth);
	expect(headerBox.top).toBeGreaterThanOrEqual(0);
	expect(root.getBoundingClientRect().bottom).toBeLessThanOrEqual(400);
	const qr = host!.querySelector('[role="img"] svg')!.getBoundingClientRect();
	expect(qr.width).toBeLessThanOrEqual(body.clientWidth - 64);
	expect(qr.width).toBeCloseTo(qr.height, 1);
	body.scrollTop = 0;
	await settle();
	expect(header.getBoundingClientRect().top).toBe(headerBox.top);
	body.scrollTop = body.scrollHeight;
	await settle();
	await page.screenshot({ element: root, path: `../e2e/artifacts/component-browser/share-dialog-qr-${width}.png` });
	await page.getByRole('button', { name: '关闭', exact: true }).last().click();
	await settle();
	expect(host!.querySelector('section')!.getClientRects()).toHaveLength(0);
});

test.each([
	{ theme: 'dark' as const, width: 900 },
	{ theme: 'light' as const, width: 900 },
	{ theme: 'light' as const, width: 390 },
	{ theme: 'light' as const, width: 320 },
])('QR card keeps a compact padded body in the $theme theme at $width px', async ({ theme, width }) => {
	await page.viewport(width, 800);
	updateDeviceKind(width === 900 ? 'desktop' : 'smartphone');
	await mount(() => h(MkShareDialog, {
		title: 'admin 的帖子', text: '分享此刻的发现', url: 'https://example.com/notes/qr-share',
	}), 20, theme);
	await page.getByRole('button', { name: '二维码', exact: true }).click();
	await expect.poll(() => host!.querySelector('[role="img"] svg')).toBeTruthy();
	await settle();
	const section = host!.querySelector('section')!;
	const header = section.firstElementChild!;
	const content = section.lastElementChild!;
	const frame = content.firstElementChild!;
	const style = getComputedStyle(content);
	expect([style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft]).toEqual(['16px', '16px', '16px', '16px']);
	expect(frame.getBoundingClientRect().top - header.getBoundingClientRect().bottom).toBe(16);
	const lastRow = width > 360 ? frame : content.lastElementChild!;
	expect(content.getBoundingClientRect().bottom - lastRow.getBoundingClientRect().bottom).toBe(16);
	expect(section.getBoundingClientRect().height).toBeLessThanOrEqual(width > 360 ? 240 : 360);
	expect(frame.getBoundingClientRect().width).toBe(160);
	if (width > 360) expect(content.lastElementChild!.getBoundingClientRect().left).toBeGreaterThan(frame.getBoundingClientRect().right);
	const saveLabel = content.querySelector('button span')!;
	expect(saveLabel.scrollWidth).toBeLessThanOrEqual(saveLabel.clientWidth);
	const { root, body } = modalParts();
	expect(body.scrollHeight).toBe(body.clientHeight);
	await page.screenshot({ element: root, path: `../e2e/artifacts/component-browser/share-dialog-refined-${theme}-${width}.png` });
});

test.each([false, true])('QR reveal and icon interactions respect animation=%s', async animation => {
	preferences.s.animation = animation;
	await page.viewport(900, 800);
	updateDeviceKind('desktop');
	await mount(() => h(MkShareDialog, { title: '分享', url: 'https://example.com/notes/qr-share' }));
	const icon = host!.querySelector('[role="group"] a span')!;
	expect(getComputedStyle(icon).transitionProperty.includes('transform')).toBe(animation);
	const reveal = host!.querySelector<HTMLElement>('div[aria-hidden]')!;
	const startedTransitions: string[] = [];
	reveal.addEventListener('transitionrun', event => {
		if (event.target === reveal) startedTransitions.push(event.propertyName);
	});
	await page.getByRole('button', { name: '二维码', exact: true }).click();
	if (animation) await expect.poll(() => startedTransitions).toContain('opacity');
	else expect(startedTransitions).toEqual([]);
	await Promise.all(reveal.getAnimations().map(transition => transition.finished));
	await expect.poll(() => host!.querySelector('[role="img"] svg')).toBeTruthy();
	expect(reveal.getBoundingClientRect().height).toBeGreaterThan(0);
	await page.getByRole('button', { name: '关闭', exact: true }).last().click();
	await expect.poll(() => reveal.getClientRects().length).toBe(0);
	expect(document.activeElement?.textContent).toContain('二维码');
});

test.each([900, 390].flatMap(width => [
	{ width, withCloseButton: true, withOkButton: false, closeButtonRight: false },
	{ width, withCloseButton: false, withOkButton: false, closeButtonRight: false },
	{ width, withCloseButton: true, withOkButton: true, closeButtonRight: true },
	{ width, withCloseButton: false, withOkButton: true, closeButtonRight: false },
]))('modal centers its title and meets the padded body without a gap at $width px (close=$withCloseButton, OK=$withOkButton)', async ({ width, ...options }) => {
	await page.viewport(width, 700);
	updateDeviceKind(width === 900 ? 'desktop' : 'smartphone');
	await mount(() => h(MkModalWindow, { ...options, width: 560, autoHeight: true }, {
		header: () => h('span', { 'data-heading': '' }, '标题'),
		default: () => h('div', { class: '_spacer _spacerCard' }, [
			h('div', { 'data-content': '', style: 'height:60px;' }, '内容'),
		]),
	}));
	const heading = host!.querySelector<HTMLElement>('[data-heading]')!;
	const title = heading.parentElement!;
	const header = title.parentElement!;
	const body = header.nextElementSibling!;
	const content = body.querySelector('[data-content]')!;
	const headerBox = header.getBoundingClientRect();
	const bodyBox = body.getBoundingClientRect();
	const contentBox = content.getBoundingClientRect();
	expect(headerBox.bottom).toBe(bodyBox.top);
	const titleBox = title.getBoundingClientRect();
	expect(titleBox.top - headerBox.top).toBeCloseTo(headerBox.bottom - titleBox.bottom, 1);
	expect(titleBox.height).toBeLessThan(24);
	expect(contentBox.top - bodyBox.top).toBe(20);
	expect(bodyBox.bottom - contentBox.bottom).toBe(20);
	expect(headerBox.height).toBe(40);
	const close = header.querySelector('[data-testid="modal-window-close"]');
	if (close) {
		expect(close.getBoundingClientRect().height).toBe(headerBox.height);
		const iconBox = close.querySelector('i')!.getBoundingClientRect();
		expect(iconBox.top - headerBox.top).toBeCloseTo(headerBox.bottom - iconBox.bottom, 1);
	}
	expect(body.scrollWidth).toBe(body.clientWidth);
	if (options.withOkButton && options.withCloseButton) {
		await page.screenshot({ element: header.parentElement!, path: `../e2e/artifacts/component-browser/modal-header-actions-${width}.png` });
	}
});

test.each([900, 390])('card spacer stays consistent at %i px while ordinary spacers keep their responsive spacing', async width => {
	await page.viewport(width, 700);
	await mount(() => h('div', { 'data-container': '', style: 'width:600px;max-width:100%;container-type:inline-size;' }, [
		h('div', { class: '_spacer', 'data-ordinary': '' }, [h('div', { style: 'height:20px;' })]),
		h('div', { class: '_spacer _spacerCard', 'data-card': '' }, [h('div', { style: 'height:20px;' })]),
	]));
	const container = host!.querySelector<HTMLElement>('[data-container]')!;
	const ordinary = host!.querySelector<HTMLElement>('[data-ordinary]')!;
	const card = host!.querySelector<HTMLElement>('[data-card]')!;
	const inset = (element: HTMLElement) => element.getBoundingClientRect().left - container.getBoundingClientRect().left;
	const topPadding = (element: HTMLElement) => element.firstElementChild!.getBoundingClientRect().top - element.getBoundingClientRect().top;
	expect(inset(ordinary)).toBe(width === 900 ? 24 : 12);
	expect(topPadding(ordinary)).toBe(width === 900 ? 24 : 12);
	expect(inset(card)).toBe(20);
	expect(topPadding(card)).toBe(20);

	container.classList.add('_forceShrinkSpacer');
	host!.style.setProperty('--MI-cardPadding', '28px');
	await settle();
	expect(inset(ordinary)).toBe(12);
	expect(topPadding(ordinary)).toBe(12);
	expect(inset(card)).toBe(28);
	expect(topPadding(card)).toBe(28);

	card.style.setProperty('--MI_SPACER-w', '240px');
	await settle();
	expect(card.getBoundingClientRect().width).toBe(240);
	expect(topPadding(card)).toBe(28);
});

test.each([
	{ width: 900, padding: 20, device: 'desktop' as const },
	{ width: 390, padding: 28, device: 'smartphone' as const },
])('modal keeps full-width children flush, one card inset, and a stationary footer at $width px', async ({ width, padding, device }) => {
	await page.viewport(width, 700);
	updateDeviceKind(device);
	await mount(() => h(MkModalWindow, { width: 600, height: 500 }, {
		header: () => '带操作栏的弹窗',
		default: () => [
			h('div', { 'data-full-width': '', style: 'height:40px;background:var(--MI_THEME-panel);' }, '全幅内容'),
			h('div', { class: '_spacer _spacerCard' }, [
				h('div', { 'data-card-content': '', style: 'height:900px;background:var(--MI_THEME-panel);' }, '可滚动的卡片内容'),
			]),
		],
		footer: () => h('div', { 'data-footer-content': '', style: 'height:30px;background:var(--MI_THEME-panel);' }, '完成'),
	}), padding);
	const { root, header, body } = modalParts();
	const bodyBox = body.getBoundingClientRect();
	const fullWidth = body.querySelector<HTMLElement>('[data-full-width]')!.getBoundingClientRect();
	const content = body.querySelector<HTMLElement>('[data-card-content]')!.getBoundingClientRect();
	const footer = root.lastElementChild as HTMLElement;
	const footerBox = footer.getBoundingClientRect();
	const footerContent = footer.firstElementChild!.getBoundingClientRect();
	expect(fullWidth.top).toBe(header.getBoundingClientRect().bottom);
	expect(fullWidth.left).toBe(bodyBox.left);
	expect(fullWidth.right).toBe(bodyBox.right);
	expect(content.top - fullWidth.bottom).toBe(padding);
	expect(content.left - bodyBox.left).toBe(padding);
	expect(bodyBox.right - content.right).toBe(padding);
	expect(footerContent.left - footerBox.left).toBe(padding);
	expect(footerBox.right - footerContent.right).toBe(padding);
	expect(footerContent.top - footerBox.top - footer.clientTop).toBe(padding);
	// Desktop Chromium reports a zero safe-area inset; the footer must still keep the card minimum.
	expect(footerBox.bottom - footerContent.bottom).toBeGreaterThanOrEqual(padding);
	expect(footerBox.bottom).toBeLessThanOrEqual(700);
	expect(body.scrollHeight).toBeGreaterThan(body.clientHeight);
	body.scrollTop = 120;
	await settle();
	expect(body.scrollTop).toBe(120);
	expect(footer.getBoundingClientRect().top).toBe(footerBox.top);
	expect(header.getBoundingClientRect().bottom).toBe(bodyBox.top);
});
