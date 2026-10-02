/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h } from 'vue';
import type { App } from 'vue';
import MkDialog from '@/components/MkDialog.vue';
import '@/style.scss';
import '@tabler/icons-webfont/dist/tabler-icons.scss';

vi.hoisted(() => {
	vi.stubGlobal('_LANGS_', [['en-US', 'English']]);
	vi.stubGlobal('_VERSION_', 'test');
	vi.stubGlobal('_DEV_', false);
});

vi.mock('@@/js/config.js', () => ({ lang: 'en-US', host: 'localhost' }));
vi.mock('@@/js/intl-const.js', () => ({ versatileLang: 'en-US' }));
vi.mock('@/os.js', () => ({ claimZIndex: () => 1000 }));
vi.mock('@/utility/autocomplete.js', () => ({ Autocomplete: class { detach() {} } }));
vi.mock('@/components/MkEmojiInputOverlay.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/global/MkA.vue', () => ({ default: { render: () => null } }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false } } }));
vi.mock('@/utility/focus-trap.js', () => ({ focusTrap: () => ({ release: () => {} }) }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: {
	ok: 'Apply', cancel: 'Cancel', clear: 'Clear', today: 'Today',
	_datePicker: { previous: 'Previous', next: 'Next', chooseMonthYear: 'Choose month and year', title: 'Choose date and time', date: 'Date', hour: 'Hour', minute: 'Minute', second: 'Second', invalid: 'Invalid date or time' },
	_checkin: { previousMonth: 'Previous month', nextMonth: 'Next month' },
} } }));
const fixtures: { app: App; host: HTMLElement }[] = [];
afterEach(() => { for (const { app, host } of fixtures.splice(0)) { app.unmount(); host.remove(); } });

test.each(['date', 'datetime-local'] as const)('compact %s dialog uses one confirmation and fits a small screen', async type => {
	const host = document.createElement('div');
	host.style.cssText = '--MI_THEME-panel:#fff;--MI_THEME-fg:#222;--MI_THEME-accent:#1682ff;--MI_THEME-accentedBg:#e8f3ff;--MI_THEME-fgOnAccent:#fff;--MI_THEME-inputBorder:#ddd;--MI_THEME-divider:#ddd;--MI_THEME-focus:#1682ff;--MI_THEME-buttonBg:#eee;--MI_THEME-modalBg:#0006;';
	document.body.append(host);
	const done = vi.fn();
	const app = createApp({ render: () => h(MkDialog, { title: 'Date and time', input: { type, default: type === 'date' ? '2026-10-01' : '2026-10-01T12:30' }, onDone: done }) });
	// Match the application's global component name.
	// eslint-disable-next-line vue/multi-word-component-names
	app.component('Mfm', { props: ['text'], setup: (props: { text?: string }) => () => h('span', props.text) });
	app.component('MkLoading', { render: () => null });
	app.directive('hotkey', () => {});
	app.directive('adaptive-border', () => {});
	app.mount(host);
	fixtures.push({ app, host });
	await expect.element(page.getByRole('button', { name: 'Apply', exact: true })).toBeVisible();
	expect(host.querySelectorAll('input[type="date"], input[type="time"], input[type="datetime-local"]')).toHaveLength(0);
	const region = host.querySelector('section')!;
	const dialog = region.parentElement!;
	expect(dialog.getBoundingClientRect().height).toBeLessThan(470);
	expect(dialog.getBoundingClientRect().width).toBeLessThanOrEqual(336);
	expect(region.scrollWidth).toBeLessThanOrEqual(region.clientWidth);
	await page.screenshot({ element: dialog, path: `../e2e/artifacts/component-browser/compact-${type}.png` });
	await page.getByRole('button', { name: 'Friday, October 2, 2026' }).click();
	await page.getByRole('button', { name: 'Apply', exact: true }).click();
	expect(done).toHaveBeenCalledWith({ canceled: false, result: type === 'date' ? '2026-10-02' : '2026-10-02T12:30' });
});
