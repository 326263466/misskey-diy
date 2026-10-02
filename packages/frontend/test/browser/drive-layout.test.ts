/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import '@/style.scss';
import MkDrive from '@/components/MkDrive.vue';
import MkStickyContainer from '@/components/global/MkStickyContainer.vue';
import MkTip from '@/components/global/MkTip.vue';
import { store } from '@/store.js';
import { prefer } from '@/preferences.js';

const mocks = vi.hoisted(() => ({
	selection: vi.fn(),
	menu: vi.fn(),
	contextMenu: vi.fn(),
	upload: vi.fn(),
	events: new Map<string, (items: unknown) => void>(),
	files: [
		{ id: 'october', name: 'October file', createdAt: '2026-10-02T12:00:00Z', folderId: null },
		{ id: 'september', name: 'September file', createdAt: '2026-09-02T12:00:00Z', folderId: null },
	],
}));

vi.mock('misskey-js', () => ({}));
vi.mock('@/os.js', () => ({ popupMenu: mocks.menu, contextMenu: mocks.contextMenu, launchUploader: mocks.upload }));
vi.mock('@/components/global/MkA.vue', () => ({ default: { render: () => null } }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false } } }));
vi.mock('@/store.js', async () => {
	const { ref } = await import('vue');
	return { store: { s: { realtimeMode: false }, r: { tips: ref({}) } } };
});
vi.mock('@/tips.js', () => ({ TIPS: ['drive'], hideAllTips: vi.fn(), closeTip: vi.fn() }));
vi.mock('@/stream.js', () => ({ useStream: vi.fn() }));
vi.mock('@/utility/achievements.js', () => ({ claimAchievement: vi.fn() }));
vi.mock('@/utility/drive.js', () => ({ chooseFileFromPcAndUpload: vi.fn(), selectDriveFolder: vi.fn() }));
vi.mock('@/utility/get-drive-file-menu.js', () => ({ getDriveFileMenu: () => [] }));
vi.mock('@/drag-and-drop.js', () => ({ checkDragDataType: () => false, getDragData: () => null, setDragData: vi.fn() }));
vi.mock('@/events.js', () => ({
	globalEvents: { emit: vi.fn() },
	useGlobalEvent: (name: string, handler: (items: unknown) => void) => mocks.events.set(name, handler),
}));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: async () => ({ id: 'folder', name: 'Folder', parentId: null }) }));
vi.mock('@/utility/paginator.js', async () => {
	const { ref } = await import('vue');
	return { Paginator: class {
		items = ref<unknown[]>([]);
		order = ref('newest');
		canFetchOlder = ref(false);
		canFetchNewer = ref(false);
		fetchingOlder = ref(false);
		fetchingNewer = ref(false);
		constructor(private endpoint: string) {}
		async reload() { this.items.value = this.endpoint === 'drive/files' ? [...mocks.files] : [{ id: 'folder', name: 'Folder' }]; }
		prepend(file: unknown) { this.items.value.unshift(file); }
	} };
});
vi.mock('@/components/MkDrive.navFolder.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({ setup: () => () => h('button', 'Drive') }) };
});
vi.mock('@/components/MkDrive.folder.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({ setup: () => () => h('button', { 'data-folder': '' }, 'Folder') }) };
});
vi.mock('@/components/MkDrive.file.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({
		props: ['file', 'isSelected'], emits: ['click'],
		setup: (props, { emit }) => () => h('button', {
			'data-file': props.file.id, 'aria-pressed': props.isSelected,
			style: 'height:80px;background:var(--MI_THEME-bg);color:var(--MI_THEME-fg);border:0;',
			onClick: (event: PointerEvent) => emit('click', event),
		}, props.file.name),
	}) };
});
vi.mock('@/i18n.js', () => ({ i18n: { ts: { more: 'More', drive: 'Drive', tip: 'Tip', gotIt: 'OK', driveAboutTip: 'Manage files in Drive.', _share: {} } } }));

let app: App | undefined;
let host: HTMLElement | undefined;

async function settle() {
	await nextTick();
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

async function mount(width: number, dark = false, select = false) {
	await page.viewport(width, 700);
	host = document.createElement('div');
	host.style.cssText = `width:${width}px;height:320px;overflow:auto;container-type:size;--MI_THEME-panel:${dark ? '#292929' : '#fff'};--MI_THEME-bg:${dark ? '#181818' : '#f2f3f5'};--MI_THEME-fg:${dark ? '#ddd' : '#303540'};--MI_THEME-divider:#8884;--MI_THEME-infoBg:#1682ff20;--MI_THEME-infoFg:#1682ff;--MI_THEME-accent:#1682ff;--MI_THEME-fgOnAccent:#fff;`;
	document.body.append(host);
	app = createApp({ render: () => h(MkDrive, { select: select ? 'file' : null, multiple: true, onChangeSelectedFiles: mocks.selection }) });
	app.component('MkStickyContainer', MkStickyContainer);
	app.component('MkTip', MkTip);
	app.component('MkLoading', { render: () => null });
	for (const name of ['anim', 'appear']) app.directive(name, () => {});
	app.mount(host);
	await expect.poll(() => host!.querySelectorAll('[data-file]').length).toBe(2);
	await settle();
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.events.clear();
	prefer.s.animation = false;
	store.r.tips.value = {};
});

afterEach(() => { app?.unmount(); host?.remove(); });

test.each([320, 900].flatMap(width => [{ width, dark: false }, { width, dark: true }]))('Drive uses a single card and four 18px insets at $width px (dark=$dark)', async ({ width, dark }) => {
	await mount(width, dark);
	const card = host!.firstElementChild as HTMLElement;
	const content = card.children[1].firstElementChild as HTMLElement;
	const style = getComputedStyle(content);
	expect([style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft]).toEqual(['18px', '18px', '18px', '18px']);
	expect(getComputedStyle(card).backgroundColor).toBe(dark ? 'rgb(41, 41, 41)' : 'rgb(255, 255, 255)');
	const tip = host!.querySelector<HTMLElement>('._juejinTip')!;
	expect(getComputedStyle(tip).padding).toBe('18px');
	const bounds = content.getBoundingClientRect();
	expect(tip.getBoundingClientRect().top - bounds.top).toBe(18);
	expect(tip.getBoundingClientRect().left - bounds.left).toBe(18);
	expect(bounds.right - tip.getBoundingClientRect().right).toBe(18);
	expect(bounds.bottom - host!.querySelector('[data-file="september"]')!.getBoundingClientRect().bottom).toBeCloseTo(18, 1);
	expect(host!.scrollWidth).toBe(host!.clientWidth);
	for (const button of host!.querySelectorAll('button[aria-expanded]')) expect(getComputedStyle(button).backgroundColor).toBe(getComputedStyle(card).backgroundColor);
	await page.screenshot({ element: card, path: `../e2e/artifacts/component-browser/drive-card-${dark ? 'dark' : 'light'}-${width}.png` });
});

test('month buttons collapse independently, retain selections and stay closed when files arrive', async () => {
	await mount(390, false, true);
	await page.getByRole('button', { name: 'October file' }).click();
	expect(mocks.selection).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'october' })]);
	const october = page.getByRole('button', { name: '2026/10', exact: true });
	await october.click();
	expect(october.element().getAttribute('aria-expanded')).toBe('false');
	const group = document.getElementById(october.element().getAttribute('aria-controls')!)!;
	await expect.poll(() => getComputedStyle(group).display).toBe('none');
	expect(host!.querySelector('[data-file="september"]')!.getClientRects().length).toBeGreaterThan(0);
	mocks.events.get('driveFileCreated')!({ id: 'new', name: 'New October file', createdAt: '2026-10-03T12:00:00Z', folderId: null });
	await settle();
	expect(getComputedStyle(group).display).toBe('none');
	(october.element() as HTMLElement).focus();
	await userEvent.keyboard('{Enter}');
	expect(october.element().getAttribute('aria-expanded')).toBe('true');
	expect(page.getByRole('button', { name: 'October file', exact: true }).element().getAttribute('aria-pressed')).toBe('true');
	expect(page.getByRole('button', { name: 'New October file', exact: true }).element()).toBeTruthy();
	await userEvent.keyboard(' ');
	expect(october.element().getAttribute('aria-expanded')).toBe('false');
	await page.getByRole('button', { name: 'Folder', exact: true }).click();
	await expect.poll(() => october.element().getAttribute('aria-expanded')).toBe('true');
});

test('blank space below collapsed months still accepts the Drive menu and uploads', async () => {
	await mount(390);
	store.r.tips.value = { drive: true };
	await settle();
	for (const month of ['2026/10', '2026/9']) await page.getByRole('button', { name: month, exact: true }).click();
	host!.scrollTop = 0;
	await settle();
	const bounds = host!.getBoundingClientRect();
	const target = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.bottom - 10)!;
	expect(host!.contains(target)).toBe(true);
	target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
	expect(mocks.contextMenu).toHaveBeenCalledOnce();
	const file = new File(['example'], 'example.txt', { type: 'text/plain' });
	const dataTransfer = new DataTransfer();
	dataTransfer.items.add(file);
	target.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
	expect(mocks.upload).toHaveBeenCalledWith([file], { folderId: null });
});

test('month expansion only changes height, without moving or shrinking files horizontally', async () => {
	prefer.s.animation = true;
	await mount(900);
	host!.style.height = '680px';
	await settle();
	await Promise.all(host!.getAnimations({ subtree: true }).map(animation => animation.finished));
	const button = page.getByRole('button', { name: '2026/10', exact: true }).element() as HTMLButtonElement;
	const group = document.getElementById(button.getAttribute('aria-controls')!)!;
	const file = host!.querySelector<HTMLElement>('[data-file="october"]')!;
	const full = group.getBoundingClientRect();
	const fileBounds = file.getBoundingClientRect();
	for (const expanding of [false, true, false, true]) {
		const started = new Promise<Animation>(resolve => {
			group.addEventListener('transitionrun', () => {
				const animation = group.getAnimations()[0];
				animation.pause();
				resolve(animation);
			}, { once: true });
		});
		button.click();
		const animation = await started;
		animation.currentTime = 100;
		await settle();
		const current = group.getBoundingClientRect();
		expect(current.height).toBeGreaterThan(0);
		expect(current.height).toBeLessThan(full.height);
		expect(current.left).toBe(full.left);
		expect(current.right).toBe(full.right);
		expect(current.top).toBe(full.top);
		const currentFile = file.getBoundingClientRect();
		expect(currentFile.left).toBe(fileBounds.left);
		expect(currentFile.right).toBe(fileBounds.right);
		expect(currentFile.top).toBe(fileBounds.top);
		expect(getComputedStyle(file).transform).toBe('none');
		animation.play();
		await animation.finished;
		await expect.poll(() => group.getBoundingClientRect().height).toBe(expanding ? full.height : 0);
		await settle();
	}
});
