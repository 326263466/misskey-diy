/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import '@/style.scss';
import MkDrive from '@/components/MkDrive.vue';
import MkStickyContainer from '@/components/global/MkStickyContainer.vue';
import MkLoading from '@/components/global/MkLoading.vue';

const mocks = vi.hoisted(() => ({
	selection: vi.fn(),
	menu: vi.fn(),
	contextMenu: vi.fn(),
	upload: vi.fn(),
	fetchOlder: vi.fn(),
	events: new Map<string, (items: unknown) => void>(),
	appear: new Map<HTMLElement, (() => void) | null>(),
	hasMore: false,
	pageGate: null as Promise<void> | null,
	files: [
		{ id: 'october', name: 'October file', createdAt: '2026-10-02T12:00:00Z', folderId: null },
		{ id: 'september', name: 'September file', createdAt: '2026-09-02T12:00:00Z', folderId: null },
	],
}));

vi.mock('misskey-js', () => ({}));
vi.mock('@/os.js', () => ({ popupMenu: mocks.menu, contextMenu: mocks.contextMenu, launchUploader: mocks.upload }));
vi.mock('@/components/global/MkA.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkButton.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({ setup: (_props, { slots }) => () => h('button', slots.default?.()) }) };
});
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false } } }));
vi.mock('@/store.js', () => ({ store: { s: { realtimeMode: false } } }));
vi.mock('@/stream.js', () => ({ useStream: vi.fn() }));
vi.mock('@/instance.js', () => ({ instance: {} }));
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
		async reload() {
			this.items.value = this.endpoint === 'drive/files' ? [...mocks.files] : [{ id: 'folder', name: 'Folder' }];
			this.canFetchOlder.value = this.endpoint === 'drive/files' && mocks.hasMore;
		}
		async fetchOlder() {
			mocks.fetchOlder(this.endpoint);
			this.fetchingOlder.value = true;
			await mocks.pageGate;
			this.items.value.push({ id: 'older', name: 'Older file', createdAt: '2026-08-02T12:00:00Z', folderId: null });
			this.canFetchOlder.value = false;
			this.fetchingOlder.value = false;
		}
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
			onClick: (event: PointerEvent) => emit('click', event),
		}, props.file.name),
	}) };
});
vi.mock('@/i18n.js', () => ({ i18n: { ts: { more: 'More', drive: 'Drive', loadMore: 'Load more', emptyDrive: '网盘为空', emptyFolder: '文件夹为空', _share: {} } } }));

let app: App | undefined;
let host: HTMLElement | undefined;

async function mount(options: { select?: boolean; forceDisableInfiniteScroll?: boolean } = {}) {
	await page.viewport(900, 700);
	host = document.createElement('div');
	host.style.cssText = 'width:100%;height:600px;overflow:auto;container-type:size;';
	document.body.append(host);
	app = createApp({ render: () => h(MkDrive, { select: options.select ? 'file' : null, multiple: true, forceDisableInfiniteScroll: options.forceDisableInfiniteScroll, onChangeSelectedFiles: mocks.selection }) });
	app.component('MkStickyContainer', MkStickyContainer);
	app.component('MkLoading', MkLoading);
	app.component('MkTip', { render: () => null });
	app.directive('anim', () => {});
	app.directive('appear', {
		mounted: (element, binding) => { mocks.appear.set(element, binding.value); },
		updated: (element, binding) => { mocks.appear.set(element, binding.value); },
		unmounted: element => { mocks.appear.delete(element); },
	});
	app.mount(host);
	await expect.poll(() => host!.querySelectorAll('[data-file]').length).toBe(2);
	await nextTick();
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.events.clear();
	mocks.appear.clear();
	mocks.hasMore = false;
	mocks.pageGate = null;
});

afterEach(() => { app?.unmount(); host?.remove(); });

test('selects files from different months and preserves the selection when a file arrives', async () => {
	await mount({ select: true });
	await page.getByRole('button', { name: 'October file', exact: true }).click();
	await page.getByRole('button', { name: 'September file', exact: true }).click();
	expect(mocks.selection).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'october' }), expect.objectContaining({ id: 'september' })]);
	mocks.events.get('driveFileCreated')!({ id: 'new', name: 'New October file', createdAt: '2026-10-03T12:00:00Z', folderId: null });
	await nextTick();
	expect(page.getByRole('button', { name: 'October file', exact: true }).element().getAttribute('aria-pressed')).toBe('true');
	expect(page.getByRole('button', { name: 'New October file', exact: true }).element()).toBeTruthy();
});

test('opens the Drive menu and uploads files dropped into the file area', async () => {
	await mount();
	const files = host!.querySelector('[data-file]')!.parentElement!;
	files.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
	expect(mocks.contextMenu).toHaveBeenCalledOnce();
	const file = new File(['example'], 'example.txt', { type: 'text/plain' });
	const dataTransfer = new DataTransfer();
	dataTransfer.items.add(file);
	files.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
	expect(mocks.upload).toHaveBeenCalledWith([file], { folderId: null });
});

test.each([undefined, true])('automatically loads more unless explicitly disabled (forceDisableInfiniteScroll=%s)', async forceDisabled => {
	mocks.hasMore = true;
	await mount({ forceDisableInfiniteScroll: forceDisabled });
	const autoLoad = [...mocks.appear.values()].find(callback => callback != null);
	if (!forceDisabled) {
		expect(autoLoad).toBeTypeOf('function');
		autoLoad!();
	} else {
		expect(autoLoad).toBeUndefined();
		await page.getByRole('button', { name: 'Load more', exact: true }).click();
	}
	await expect.poll(() => host!.querySelector('[data-file="older"]')).not.toBeNull();
	expect(mocks.fetchOlder).toHaveBeenCalledExactlyOnceWith('drive/files');
});

test('does not request the same page twice while it is loading', async () => {
	mocks.hasMore = true;
	const pending = Promise.withResolvers<void>();
	mocks.pageGate = pending.promise;
	await mount();
	const loadMore = page.getByRole('button', { name: 'Load more', exact: true }).element() as HTMLButtonElement;
	loadMore.click();
	loadMore.click();
	expect(mocks.fetchOlder).toHaveBeenCalledExactlyOnceWith('drive/files');
	pending.resolve();
	await expect.poll(() => host!.querySelector('[data-file="older"]')).not.toBeNull();
});
