/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h } from 'vue';
import type { App } from 'vue';
import '@/style.scss';
import MkButton from '@/components/MkButton.vue';
import miLight from '@@/themes/l-light.json5';

vi.mock('@/components/global/MkA.vue', () => ({ default: { render: () => null } }));
let app: App | undefined;
let host: HTMLElement | undefined;
let originalStyle = '';
afterEach(() => { app?.unmount(); host?.remove(); document.documentElement.style.cssText = originalStyle; });

test('Mi Light renders exact primary hover, text and border colors', async () => {
	originalStyle = document.documentElement.style.cssText;
	// Reference resolution is covered by ThemeManager's unit test; exercise browser CSS here.
	const colors = { ...miLight.props, fgOnAccent: '#fff', buttonGradateA: miLight.props.accent, buttonGradateB: miLight.props.accent };
	for (const [key, value] of Object.entries(colors)) document.documentElement.style.setProperty(`--MI_THEME-${key}`, value);
	host = document.createElement('div');
	host.style.cssText = 'padding:24px;background:var(--MI_THEME-panel);';
	document.body.append(host);
	app = createApp({ render: () => h('div', [h(MkButton, { primary: true }, () => 'Primary'), h(MkButton, { gradate: true }, () => 'Gradient'), h('p', { style: 'color:var(--MI_THEME-fgTransparentWeak);border:1px solid var(--MI_THEME-divider);' }, 'Secondary')]) });
	app.mount(host);
	const buttons = host.querySelectorAll('button');
	expect(getComputedStyle(buttons[0]).backgroundColor).toBe('rgb(30, 128, 255)');
	await page.getByRole('button', { name: 'Primary', exact: true }).hover();
	await expect.poll(() => getComputedStyle(buttons[0]).backgroundColor).toBe('rgb(17, 113, 238)');
	await page.getByRole('button', { name: 'Gradient', exact: true }).hover();
	await expect.poll(() => getComputedStyle(buttons[1]).backgroundColor).toBe('rgb(17, 113, 238)');
	expect(getComputedStyle(host.querySelector('p')!).color).toBe('rgb(138, 145, 159)');
	expect(getComputedStyle(host.querySelector('p')!).borderTopColor).toBe('rgb(228, 230, 235)');
});
