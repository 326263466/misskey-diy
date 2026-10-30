/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export function onSearchKeydown(event: KeyboardEvent, search?: () => void): void {
	if (event.key !== 'Enter' && event.code !== 'Enter') return;
	event.stopPropagation();
	if (event.isComposing || event.keyCode === 229) {
		// 表单搜索阻止隐式提交；即时筛选保留输入法确认动作。
		if (search) event.preventDefault();
		return;
	}
	event.preventDefault();
	search?.();
}
