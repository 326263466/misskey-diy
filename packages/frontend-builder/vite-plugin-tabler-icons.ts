/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { generateIconCss } from '../icons-subsetter/src/generator.js';
import type { Plugin } from 'vite';

const virtualId = 'virtual:tabler-icons.css';
const resolvedId = `\0${virtualId}`;

export function pluginTablerIcons(): Plugin {
	let css: Promise<string> | undefined;

	return {
		name: 'tabler-svg-masks',
		resolveId(id) { return id === virtualId ? resolvedId : undefined; },
		load(id) {
			if (id !== resolvedId) return undefined;
			return css ??= generateIconCss();
		},
	};
}
