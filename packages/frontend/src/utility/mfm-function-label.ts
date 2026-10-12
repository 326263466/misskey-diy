/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { i18n } from '@/i18n.js';

export function mfmFunctionLabel(tag: string): string {
	return `${tag} (${i18n.ts._mfm._functions[tag as keyof typeof i18n.ts._mfm._functions]})`;
}

export function mfmParameterLabel(param: string): string {
	const name = param.replace(/=$/, '') as keyof typeof i18n.ts._mfm._parameters;
	return `${param} (${i18n.ts._mfm._parameters[name]})`;
}
