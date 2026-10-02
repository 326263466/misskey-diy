/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Directive } from 'vue';
import tinycolor from 'tinycolor2';
import { themeManager } from '@/theme.js';
import { getBgColor } from '@/utility/get-bg-color.js';

const handlers = new WeakMap<HTMLElement, () => void>();

export const panelDirective = {
	mounted(src) {
		function update() {
			const parentBg = getBgColor(src.parentElement) ?? 'transparent';

			const myBg = themeManager.currentCompiledTheme!.panel;

			if (tinycolor.equals(parentBg, myBg)) {
				src.style.backgroundColor = 'var(--MI_THEME-bg)';
			} else {
				src.style.backgroundColor = 'var(--MI_THEME-panel)';
			}
		}

		update();
		handlers.set(src, update);
		themeManager.on('themeChanging', update);
	},
	unmounted(src) {
		const update = handlers.get(src);
		if (update) themeManager.off('themeChanging', update);
		handlers.delete(src);
	},
} as Directive<HTMLElement>;
