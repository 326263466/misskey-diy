/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** 默认聚焦到内容末尾；指针随后仍可把光标放到用户点击的位置。 */
export function initializeInputCaret(document: Document = window.document): () => void {
	let pointerTarget: EventTarget | null = null;
	let pointerTimer: number | undefined;

	function onPointerDown(event: PointerEvent) {
		pointerTarget = event.target;
		window.clearTimeout(pointerTimer);
		pointerTimer = window.setTimeout(() => { pointerTarget = null; }, 0);
	}

	function onFocus(event: FocusEvent) {
		const input = event.target;
		if (input === pointerTarget || !(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) || !input.value) return;
		if (input instanceof HTMLTextAreaElement || ['text', 'search', 'url', 'tel', 'password'].includes(input.type)) {
			input.setSelectionRange(input.value.length, input.value.length);
		} else if (['number', 'email'].includes(input.type)) {
			// 数值和邮箱输入不支持 selectionRange，重设同一值把默认插入点放到末尾。
			const value = input.value;
			input.value = '';
			input.value = value;
		}
	}

	document.addEventListener('pointerdown', onPointerDown, true);
	document.addEventListener('focusin', onFocus);
	return () => {
		window.clearTimeout(pointerTimer);
		document.removeEventListener('pointerdown', onPointerDown, true);
		document.removeEventListener('focusin', onFocus);
	};
}
