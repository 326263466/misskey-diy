/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import type * as Misskey from 'misskey-js';
import type { CustomStatus, CustomStatusIcon, StatusIconStatus } from '@/utility/status-icons.js';
import '@tabler/icons-webfont/dist/tabler-icons.css';
import '@/style.scss';
import MkAvatar from '@/components/global/MkAvatar.vue';
import MkStatusIcon from '@/components/MkStatusIcon.vue';
import { customStatusIconKeys } from '@/utility/status-icons.js';

vi.mock('@/i.js', () => ({ $i: null }));
vi.mock('@/preferences.js', () => ({ prefer: { s: {
	animation: false, squareAvatars: false, showAvatarDecorations: true,
	enableHighQualityImagePlaceholders: false, disableShowingAnimatedImages: false,
	dataSaver: { avatar: false },
} } }));
vi.mock('@/utility/media-proxy.js', () => ({ getStaticImageUrl: (url: string) => url }));
vi.mock('@/filters/user.js', () => ({ acct: () => '@example', userPage: () => '/@example' }));
vi.mock('@/components/global/MkA.vue', () => ({ default: { template: '<a><slot/></a>' } }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: {
	_onlineStatus: { _display: { online: '在线', active: '活跃', offline: '离线', unknown: '未知', away: '离开', busy: '忙碌', doNotDisturb: '请勿打扰', invisible: '隐身' } },
} } }));

let app: App;
let host: HTMLElement;

const avatarUrl = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#ec4168"/><path d="M30 30h20v20H30zm40 0h20v20H70zM45 80h30v12H45z" fill="white"/></svg>')}`;
const decorationUrl = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><circle cx="120" cy="120" r="58" fill="none" stroke="#e3ab4c" stroke-width="4"/></svg>')}`;

function createHost(dark: boolean, height: number, accent = '#a0d900') {
	host = document.createElement('div');
	host.style.cssText = 'padding:24px;box-sizing:border-box;background:var(--MI_THEME-panel);color:var(--MI_THEME-fg);--MI_THEME-success:#86b300;--MI_THEME-error:#ec4137;--MI_THEME-warn:#ecb637;';
	host.style.minHeight = `${height}px`;
	host.style.setProperty('--MI_THEME-panel', dark ? '#282f32' : '#fff');
	host.style.setProperty('--MI_THEME-fg', dark ? '#dadada' : '#5f5f5f');
	host.style.setProperty('--MI_THEME-accent', accent);
	host.style.setProperty('--MI_THEME-fgOnWhite', '#333');
	host.style.setProperty('--MI_THEME-fgOnAccent', '#fff');
	document.body.append(host);
}

function colorPixels(color: string) {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = 1;
	const context = canvas.getContext('2d')!;
	context.fillStyle = color;
	context.fillRect(0, 0, 1, 1);
	return Array.from(context.getImageData(0, 0, 1, 1).data);
}

function luminance(color: number[]) {
	const channels = color.slice(0, 3).map(channel => {
		const value = channel / 255;
		return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	});
	return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function expectNoFrame(element: HTMLElement) {
	const style = getComputedStyle(element);
	expect(style.boxShadow).toBe('none');
	expect(style.outlineStyle).toBe('none');
	for (const width of [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth]) {
		expect(width).toBe('0px');
	}
}

function expectCenteredSymbol(mark: HTMLElement, rect: DOMRect, checkContrast = true) {
	const markRect = mark.getBoundingClientRect();
	const markStyle = getComputedStyle(mark);
	const pseudoStyle = getComputedStyle(mark, '::before');
	expect(markRect.left).toBeGreaterThanOrEqual(rect.left);
	expect(markRect.right).toBeLessThanOrEqual(rect.right);
	expect(markRect.top).toBeGreaterThanOrEqual(rect.top);
	expect(markRect.bottom).toBeLessThanOrEqual(rect.bottom);
	expect(Math.abs(markRect.x + markRect.width / 2 - rect.x - rect.width / 2)).toBeLessThan(0.05);
	expect(Math.abs(markRect.y + markRect.height / 2 - rect.y - rect.height / 2)).toBeLessThan(0.05);
	expect(pseudoStyle.fontSize).toBe(markStyle.fontSize);
	expect(pseudoStyle.lineHeight).toBe(markStyle.lineHeight);
	expect(pseudoStyle.display).toBe('block');
	const foreground = colorPixels(markStyle.color);
	const background = colorPixels(getComputedStyle(mark.parentElement!).backgroundColor);
	expect(background[3]).toBe(255);
	if (!checkContrast) {
		if (pseudoStyle.maskImage !== 'none') {
			expect(pseudoStyle.backgroundImage).toContain('gradient(');
		} else {
			expect(foreground.slice(0, 3)).not.toEqual(background.slice(0, 3));
		}
		return;
	}
	const light = Math.max(luminance(foreground), luminance(background));
	const dark = Math.min(luminance(foreground), luminance(background));
	expect((light + 0.05) / (dark + 0.05)).toBeGreaterThanOrEqual(4.5);
}

function expectCssSymbol(icon: HTMLElement) {
	expect([...customStatusIconKeys, 'add']).toContain(icon.dataset.customStatusIcon);
	expect(icon.querySelector('i, svg, img')).toBeNull();
	const style = getComputedStyle(icon);
	expect(colorPixels(style.backgroundColor)[3]).toBe(255);
	expect(style.backgroundImage).toContain('gradient(');
	expect(style.backgroundImage).not.toContain('url(');
	const glyphStyle = getComputedStyle(icon.firstElementChild!, '::before');
	expect(glyphStyle.content).toBe('""');
	expect(colorPixels(glyphStyle.backgroundColor)[3] > 0 || glyphStyle.backgroundImage.includes('gradient(') || (parseFloat(glyphStyle.borderTopWidth) > 0 && colorPixels(glyphStyle.borderTopColor)[3] > 0)).toBe(true);
}

function user(status: StatusIconStatus, index: number): Misskey.entities.UserLite & { hideOnlineStatus: boolean; onlineStatusOverride: string; customStatus: CustomStatus | null } {
	return {
		id: `status-${index}`, username: 'example', host: null, name: 'Example',
		emojis: {},
		avatarUrl, avatarBlurhash: null, avatarDecorations: [{ id: 'frame', url: decorationUrl }],
		onlineStatus: status === 'invisible' ? 'unknown' : status === 'custom' ? 'online' : status,
		onlineStatusOverride: status === 'custom' ? 'online' : status,
		hideOnlineStatus: false,
		customStatus: status === 'custom' ? { icon: 'coffee', text: '喝杯咖啡' } : null,
	};
}

afterEach(() => {
	app?.unmount();
	host?.remove();
});

test('completely hidden users have no badge or empty badge footprint', async () => {
	await page.viewport(390, 300);
	createHost(false, 300);
	const hiddenUsers = [
		{ ...user('online', 0), onlineStatus: null },
		{ ...user('custom', 1), hideOnlineStatus: true },
		{ ...user('invisible', 2), hideOnlineStatus: true },
	];
	app = createApp({ render: () => h('div', { style: 'display:flex;gap:24px;' }, hiddenUsers.map(profile =>
		h(MkAvatar, { user: profile, indicator: true, style: { width: '64px', height: '64px' }, 'data-hidden-avatar': '' }),
	)) });
	for (const directive of ['user-preview', 'tooltip']) app.directive(directive, () => {});
	app.mount(host);
	await nextTick();
	for (const avatar of host.querySelectorAll<HTMLElement>('[data-hidden-avatar]')) {
		expect(avatar.querySelector('[role="img"]')).toBeNull();
		expect(avatar.querySelector('[class*="indicator"]')).toBeNull();
		expect(avatar.getBoundingClientRect().width).toBe(64);
	}
});

test.each([
	{ dark: false, width: 900 },
	{ dark: true, width: 900 },
	{ dark: false, width: 320 },
	{ dark: true, width: 320 },
])('avatar badges stay complete above decorations and below popups (dark: $dark, width: $width)', async ({ dark, width }) => {
	const height = width < 400 ? 1100 : 520;
	await page.viewport(width, height);
	createHost(dark, height);
	const statuses = ['online', 'active', 'away', 'busy', 'doNotDisturb', 'invisible', 'custom', 'offline'] as const;
	app = createApp({ render: () => h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:16px;' },
		[32, 120].flatMap(size => statuses.map((status, index) => h('div', { style: 'display:flex;justify-content:center;padding-bottom:32px;' }, [
			h(MkAvatar, { user: user(status, index), indicator: true, style: { width: `${size}px`, height: `${size}px` }, 'data-avatar-size': size }),
		]))),
	) });
	for (const directive of ['user-preview', 'tooltip']) app.directive(directive, () => {});
	app.mount(host);
	await nextTick();
	await document.fonts.ready;
	const avatars = Array.from(host.querySelectorAll<HTMLElement>('[data-avatar-size]'));
	expect(avatars).toHaveLength(16);
	for (const avatar of avatars) {
		const badge = avatar.querySelector<HTMLElement>('[role="img"]')!;
		expectNoFrame(badge);
		expectNoFrame(badge.firstElementChild as HTMLElement);
		const rect = badge.getBoundingClientRect();
		expect(rect.width).toBeGreaterThanOrEqual(12);
		expect(rect.height).toBeCloseTo(rect.width, 1);
		expect(rect.left).toBeGreaterThanOrEqual(0);
		expect(rect.right).toBeLessThanOrEqual(window.innerWidth);
		expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight);
		for (let angle = 0; angle < 360; angle += 45) {
			const radians = angle * Math.PI / 180;
			const point = document.elementFromPoint(rect.x + rect.width / 2 + Math.cos(radians) * rect.width * 0.4, rect.y + rect.height / 2 + Math.sin(radians) * rect.height * 0.4);
			expect(point !== null && badge.contains(point), `${badge.getAttribute('aria-label')} badge is clipped at ${angle} degrees`).toBe(true);
		}
		const customIcon = badge.querySelector<HTMLElement>('[data-custom-status-icon]');
		if (customIcon) {
			expectCssSymbol(customIcon);
		} else {
			const mark = badge.firstElementChild!.firstElementChild as HTMLElement;
			expect(mark).not.toBeNull();
			expectCenteredSymbol(mark, rect, false);
		}
	}
	await page.screenshot({ path: `../e2e/artifacts/component-browser/avatar-status-${dark ? 'dark' : 'light'}-${width}.png` });
	const coveredBadge = avatars[2].querySelector<HTMLElement>('[role="img"]')!;
	const rect = coveredBadge.getBoundingClientRect();
	const popup = document.createElement('div');
	popup.style.cssText = `position:fixed;left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px;z-index:2;background:var(--MI_THEME-panel);`;
	host.append(popup);
	expect(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)).toBe(popup);
});

test.each([
	{ dark: false, accent: '#bfff00', palette: 'light-green' },
	{ dark: true, accent: '#bfff00', palette: 'dark-green' },
	{ dark: false, accent: '#f000ff', palette: 'light-purple' },
	{ dark: true, accent: '#f000ff', palette: 'dark-purple' },
])('all status glyphs stay centered and clear in saturated themes ($palette)', async ({ dark, accent, palette }) => {
	await page.viewport(900, 1500);
	createHost(dark, 1500, accent);
	const states: { status: StatusIconStatus; icon?: CustomStatusIcon }[] = [
		...(['online', 'active', 'away', 'busy', 'invisible', 'offline', 'unknown'] as const).map(status => ({ status })),
		...customStatusIconKeys.map(icon => ({ status: 'custom' as const, icon })),
		{ status: 'custom' },
	];
	app = createApp({ render: () => h('div', { style: 'display:grid;grid-template-columns:repeat(8,1fr);gap:24px;' },
		[12, 28, 64].flatMap(size => states.map(state => h('div', { style: 'height:96px;display:grid;place-items:center;align-content:center;gap:12px;' }, [
			h(MkStatusIcon, { ...state, style: { width: `${size}px`, height: `${size}px` }, 'data-status-icon': state.icon ?? state.status }),
			h('span', { style: 'font-size:12px;' }, state.icon ?? state.status),
		]))),
	) });
	app.mount(host);
	await nextTick();
	await document.fonts.ready;
	const renderedIcons = host.querySelectorAll<HTMLElement>('[data-status-icon]');
	expect(renderedIcons).toHaveLength(96);
	for (const icon of renderedIcons) {
		expectNoFrame(icon);
		expect(colorPixels(getComputedStyle(icon).backgroundColor)[3]).toBe(255);
		if (icon.dataset.customStatusIcon) {
			expectCssSymbol(icon);
		} else {
			const symbol = icon.firstElementChild as HTMLElement;
			expect(symbol).not.toBeNull();
			expectCenteredSymbol(symbol, icon.getBoundingClientRect());
		}
	}
	await page.screenshot({ path: `../e2e/artifacts/component-browser/status-palette-${palette}.png` });
});
