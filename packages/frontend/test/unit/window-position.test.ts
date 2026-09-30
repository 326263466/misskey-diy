/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import MkWindow from '@/components/MkWindow.vue';
import { i18n } from '@/i18n.js';

vi.mock('@/os.js', () => ({ claimZIndex: () => 100 }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false } } }));

beforeEach(() => {
	vi.stubGlobal('innerWidth', 1200);
	vi.stubGlobal('innerHeight', 900);
	vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
		return this.style.width === '100%' ? window.innerWidth : Number.parseFloat(this.style.width) || 0;
	});
	vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
		return this.style.height === '100%' ? window.innerHeight : Number.parseFloat(this.style.height) || 0;
	});
	vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
		return new DOMRect(Number.parseFloat(this.style.left) || 0, Number.parseFloat(this.style.top) || 0, this.offsetWidth, this.offsetHeight);
	});
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

function renderWindow() {
	const view = render(MkWindow, {
		props: { initialWidth: 800, initialHeight: 600, canResize: true },
		slots: { header: 'Window', default: 'Content' },
		global: { directives: { tooltip: {} } },
	});
	return { ...view, panel: view.container.querySelector('._shadow')!.parentElement! };
}

async function shrinkViewport() {
	vi.stubGlobal('innerWidth', 500);
	vi.stubGlobal('innerHeight', 400);
	await fireEvent.resize(window);
}

function expectInsideViewport(panel: HTMLElement) {
	const rect = panel.getBoundingClientRect();
	expect(rect.left).toBeGreaterThanOrEqual(0);
	expect(rect.top).toBeGreaterThanOrEqual(0);
	expect(rect.right).toBeLessThanOrEqual(window.innerWidth);
	expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight);
}

test('keeps the whole window and its title bar inside a smaller viewport', async () => {
	const { panel } = renderWindow();
	await shrinkViewport();
	expectInsideViewport(panel);
});

test.each(['minimized', 'maximized'])('restores a %s window within the current viewport', async state => {
	const view = renderWindow();
	await fireEvent.click(view.getByRole('button', { name: state === 'minimized' ? i18n.ts.windowMinimize : i18n.ts.windowMaximize }));
	await shrinkViewport();
	if (state === 'maximized') {
		expect([view.panel.style.width, view.panel.style.height]).toEqual(['100%', '100%']);
	}
	await fireEvent.click(view.getByRole('button', { name: i18n.ts.windowRestore }));
	expectInsideViewport(view.panel);
});
