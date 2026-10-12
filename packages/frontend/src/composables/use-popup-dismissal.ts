/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { onMounted, onBeforeUnmount, watch } from 'vue';
import { setPopupHistoryDismissal, syncPopupHistory } from '@/utility/popup-history.js';

type Popup = {
	element: () => HTMLElement | null;
	isShowing: () => boolean;
	onEscape: () => void | boolean;
	onBack?: () => void;
	useHistory?: () => boolean;
	onClickOutside?: (event: MouseEvent) => void;
	onContextMenuOutside?: (event: MouseEvent) => void;
};

const popups = new Set<Popup>();
let pointerDownPopup: Popup | undefined;
let justEndedComposition = false;

function getTopPopup(forHistory = false): Popup | undefined {
	let top: Popup | undefined;
	let highestZIndex = -Infinity;
	for (const popup of popups) {
		if (forHistory && popup.useHistory?.() === false) continue;
		const element = popup.element();
		if (!popup.isShowing() || !element?.isConnected) continue;
		const zIndex = Number.parseInt(window.getComputedStyle(element).zIndex) || 0;
		if (zIndex >= highestZIndex) {
			top = popup;
			highestZIndex = zIndex;
		}
	}
	return top;
}

setPopupHistoryDismissal(() => {
	const popup = getTopPopup(true);
	return popup ? () => { (popup.onBack ?? popup.onEscape)(); } : undefined;
});

function onKeydown(event: KeyboardEvent) {
	if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || justEndedComposition || event.keyCode === 229 || event.repeat) return;
	const popup = getTopPopup();
	if (!popup) return;
	// 先让输入框和子菜单处理按键；同一次 Esc 只交给最上层弹窗。
	if (popup.onEscape() === false) return;
	event.preventDefault();
	event.stopImmediatePropagation();
}

function isInsidePopup(popup: Popup, event: MouseEvent): boolean {
	const element = popup.element();
	return element != null && event.composedPath().includes(element);
}

function onPointerDown(event: PointerEvent) {
	justEndedComposition = false;
	const popup = getTopPopup();
	pointerDownPopup = popup && event.button === 0 && !isInsidePopup(popup, event) ? popup : undefined;
}

function onCompositionEnd() {
	// Safari 在取消输入法候选时先触发 compositionend，再触发 Escape。
	justEndedComposition = true;
}

function onKeyup() {
	justEndedComposition = false;
}

function onClick(event: MouseEvent) {
	const popup = pointerDownPopup;
	pointerDownPopup = undefined;
	// 从窗口内拖到外面，或按下后切换了最上层弹窗，都不算空白点击。
	if (popup && popup === getTopPopup() && !isInsidePopup(popup, event)) popup.onClickOutside?.(event);
}

function onContextMenu(event: MouseEvent) {
	pointerDownPopup = undefined;
	const popup = getTopPopup();
	if (popup && !isInsidePopup(popup, event)) popup.onContextMenuOutside?.(event);
}

export function usePopupDismissal(popup: Popup) {
	let element: HTMLElement | null;
	onMounted(() => {
		if (popups.size === 0) {
			window.document.addEventListener('keydown', onKeydown);
			window.document.addEventListener('compositionend', onCompositionEnd, true);
			window.document.addEventListener('keyup', onKeyup, true);
			window.document.addEventListener('pointerdown', onPointerDown, true);
			window.document.addEventListener('click', onClick);
			window.document.addEventListener('contextmenu', onContextMenu, true);
		}
		popups.add(popup);
		element = popup.element();
		element?.addEventListener('keydown', onKeydown);
		watch(() => [popup.isShowing(), popup.useHistory?.()], syncPopupHistory, { immediate: true, flush: 'post' });
	});
	onBeforeUnmount(() => {
		element?.removeEventListener('keydown', onKeydown);
		popups.delete(popup);
		syncPopupHistory();
		if (pointerDownPopup === popup) pointerDownPopup = undefined;
		if (popups.size === 0) {
			window.document.removeEventListener('keydown', onKeydown);
			window.document.removeEventListener('compositionend', onCompositionEnd, true);
			window.document.removeEventListener('keyup', onKeyup, true);
			justEndedComposition = false;
			window.document.removeEventListener('pointerdown', onPointerDown, true);
			window.document.removeEventListener('click', onClick);
			window.document.removeEventListener('contextmenu', onContextMenu, true);
		}
	});
	return { isTopmost: () => getTopPopup() === popup };
}
