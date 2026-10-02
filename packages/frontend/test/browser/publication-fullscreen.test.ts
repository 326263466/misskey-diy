/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import '@/style.scss';
import MkPostFormDialog from '@/components/MkPostFormDialog.vue';
import { i18n } from '@/i18n.js';
import { updateDeviceKind } from '@/utility/device-kind.js';

vi.hoisted(() => {
	vi.stubGlobal('_LANGS_', []);
	vi.stubGlobal('_VERSION_', 'test');
	vi.stubGlobal('_DEV_', false);
});
vi.mock('misskey-js', () => ({ acct: { toString: (user: { username: string }) => user.username } }));
vi.mock('insert-text-at-cursor', () => ({ default: vi.fn() }));
vi.mock('@/events.js', () => ({ globalEvents: { on: vi.fn(), off: vi.fn(), emit: vi.fn() } }));
vi.mock('@/os.js', () => ({ claimZIndex: () => 1000, confirm: vi.fn(), popup: vi.fn(), popupMenu: vi.fn(), popupAsyncWithDialog: vi.fn() }));
vi.mock('@@/js/config.js', () => ({
	host: 'example.com', hostname: 'example.com', url: 'https://example.com',
	apiUrl: 'https://example.com/api', lang: 'ja-JP', version: 'test', prefersReducedMotion: false,
}));
vi.mock('@/i18n.js', async () => {
	const { I18n } = await import('@@/js/i18n.js');
	const { version } = await import('../../../../package.json');
	const locales = import.meta.glob('../../../../built/_frontend_dist_/locales/ja-JP.*.json', { eager: true, import: 'default' });
	const locale = locales[`../../../../built/_frontend_dist_/locales/ja-JP.${version}.json`];
	if (!locale) throw new Error('Build i18n before running the composer browser tests.');
	return { i18n: new I18n(locale as never) };
});
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: vi.fn(async () => []) }));
vi.mock('@/i.js', () => {
	const user = { id: 'fullscreen-test', username: 'self', host: null, isSilenced: false, policies: { scheduledNoteLimit: 10 } };
	return { ensureSignin: () => user, $i: user, notesCount: 0, incNotesCount: vi.fn() };
});
vi.mock('@/store.js', async () => {
	const { ref } = await import('vue');
	return { store: {
		s: { showPreview: false, reactionAcceptance: null }, r: { tips: ref({ postForm: true }) },
		model: (key: string) => ref(key === 'postFormHashtags' ? '' : false), set: vi.fn(),
	} };
});
vi.mock('@/preferences.js', () => ({ prefer: {
	s: { keepCw: true, defaultNoteVisibility: 'public', defaultNoteLocalOnly: false, animation: false, menuStyle: 'popup' },
	commit: vi.fn(),
} }));
vi.mock('@/instance.js', () => ({ instance: { maxNoteTextLength: 3000 } }));
vi.mock('@/accounts.js', () => ({ getAccounts: vi.fn(), getAccountMenu: vi.fn() }));
vi.mock('@/plugin.js', () => ({ getPluginHandlers: () => [] }));
vi.mock('@/utility/autocomplete.js', () => ({ Autocomplete: class { detach() {} } }));
vi.mock('@/utility/achievements.js', () => ({ claimAchievement: vi.fn() }));
vi.mock('@/utility/drive.js', () => ({ chooseDriveFile: vi.fn() }));
vi.mock('@/utility/emoji-picker.js', () => ({ emojiPicker: { show: vi.fn() } }));
vi.mock('@/utility/mfm-function-picker.js', () => ({ mfmFunctionPicker: vi.fn() }));
vi.mock('@/utility/tour.js', () => ({ startTour: vi.fn() }));
vi.mock('@/tips.js', () => ({ closeTip: vi.fn() }));
vi.mock('@/utility/focus-trap.js', () => ({ focusTrap: () => ({ release: () => {} }) }));
vi.mock('@/components/MkNoteSimple.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkNotePreview.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkPostFormAttaches.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkUploaderItems.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkPollEditor.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkRedPacket.vue', () => ({ default: { render: () => null } }));
vi.mock('@/composables/use-uploader.js', async () => {
	const { ref } = await import('vue');
	return { useUploader: () => ({
		items: ref([]), uploading: ref(false), readyForUpload: ref(true), allItemsUploaded: ref(true),
		events: { on: vi.fn() }, dispose: vi.fn(), abortAll: vi.fn(), reset: vi.fn(),
	}) };
});

let app: App | undefined;
let host: HTMLElement | undefined;
let originalStyle = '';

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
	document.documentElement.style.cssText = originalStyle;
	localStorage.clear();
	updateDeviceKind(null);
	await settle();
});

test.each([900, 390, 320])('maximized composer covers every viewport edge and restores its original size at %i px', async width => {
	await page.viewport(width, 700);
	updateDeviceKind(width < 500 ? 'smartphone' : 'desktop');
	localStorage.clear();
	originalStyle = document.documentElement.style.cssText;
	document.documentElement.style.cssText += ';--MI-radius:12px;--MI-cardRadius:12px;--MI_THEME-popup:var(--MI_THEME-panel);';
	host = document.createElement('div');
	document.body.append(host);
	app = createApp({ render: () => h(MkPostFormDialog, { initialText: 'A long draft.\n'.repeat(80) }) });
	for (const directive of ['hotkey', 'tooltip', 'click-anime', 'adaptive-border']) app.directive(directive, () => {});
	for (const name of ['MkTip', 'MkEllipsis', 'MkAcct', 'MkTime', 'I18n', 'Mfm']) app.component(name, { render: () => null });
	app.mount(host);
	await settle();
	const modalContent = host.querySelector('[data-testid="bg"]')!.nextElementSibling as HTMLElement;
	const composer = modalContent.firstElementChild as HTMLElement;
	const originalBox = composer.getBoundingClientRect();
	expect(originalBox.top).toBe(width < 500 ? 16 : 32);
	expect(originalBox.width).toBeLessThanOrEqual(520);
	expect(getComputedStyle(composer).borderTopLeftRadius).toBe('12px');
	await page.getByRole('button', { name: i18n.ts.windowMaximize, exact: true }).click();
	await settle();

	for (const height of [700, 320]) {
		await page.viewport(width, height);
		await settle();
		const box = composer.getBoundingClientRect();
		expect([box.left, box.top, box.width, box.height]).toEqual([0, 0, width, height]);
		expect(getComputedStyle(composer).borderTopLeftRadius).toBe('0px');
		expect(modalContent.scrollHeight).toBe(modalContent.clientHeight);
		const submit = page.getByTestId('post-form-submit').element().getBoundingClientRect();
		const footer = composer.querySelector('footer')!.getBoundingClientRect();
		expect(submit.top).toBeGreaterThanOrEqual(0);
		expect(submit.bottom).toBeLessThanOrEqual(height);
		expect(footer.top).toBeGreaterThanOrEqual(submit.bottom);
		expect(footer.bottom).toBeLessThanOrEqual(height);
		expect(composer.scrollWidth).toBe(composer.clientWidth);
		const textarea = page.getByTestId('post-form-text').element() as HTMLTextAreaElement;
		expect(textarea.scrollHeight).toBeGreaterThan(textarea.clientHeight);
		textarea.scrollTop = textarea.scrollHeight;
		expect(textarea.scrollTop).toBeGreaterThan(0);
	}

	await page.viewport(width, 700);
	await page.getByRole('button', { name: i18n.ts.windowRestore, exact: true }).click();
	await settle();
	const restoredBox = composer.getBoundingClientRect();
	expect([restoredBox.left, restoredBox.top, restoredBox.width]).toEqual([originalBox.left, originalBox.top, originalBox.width]);
	expect(getComputedStyle(composer).borderTopLeftRadius).toBe('12px');
	expect((page.getByTestId('post-form-text').element() as HTMLTextAreaElement).value).toBe('A long draft.\n'.repeat(80));
	await page.getByRole('button', { name: i18n.ts._postForm.articleMode, exact: true }).click();
	await page.getByTestId('article-form-title').fill('Article title');
	await page.getByTestId('article-form-text').fill('Article body');
	await page.getByRole('button', { name: i18n.ts.windowMaximize, exact: true }).click();
	await settle();
	const articleBox = composer.getBoundingClientRect();
	expect([articleBox.left, articleBox.top, articleBox.width, articleBox.height]).toEqual([0, 0, width, 700]);
	const articleSubmit = page.getByTestId('article-form-submit').element().getBoundingClientRect();
	expect(articleSubmit.bottom).toBeLessThanOrEqual(700);
	await page.getByRole('button', { name: i18n.ts._postForm.noteMode, exact: true }).click();
	expect((page.getByTestId('post-form-text').element() as HTMLTextAreaElement).value).toBe('A long draft.\n'.repeat(80));
});
