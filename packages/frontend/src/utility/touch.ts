/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ref } from 'vue';
import { deviceKind } from '@/utility/device-kind.js';

const isTouchSupported = 'maxTouchPoints' in navigator && navigator.maxTouchPoints > 0;

export let isTouchUsing = deviceKind === 'tablet' || deviceKind === 'smartphone';

// 与 isTouchUsing 不同，这个会在触摸/鼠标混合设备上跟随当前的输入方式
export let lastPointerType: string | null = null;
const recordPointer = (ev: PointerEvent) => {
	lastPointerType = ev.pointerType;
};
window.addEventListener('pointerdown', recordPointer, { capture: true, passive: true });
window.addEventListener('pointermove', recordPointer, { capture: true, passive: true });

if (isTouchSupported && !isTouchUsing) {
	window.addEventListener('touchstart', () => {
		// maxTouchPointsなどでの判定だけだと、「タッチ機能付きディスプレイを使っているがマウスでしか操作しない」場合にも
		// タッチで使っていると判定されてしまうため、実際に一度でもタッチされたらtrueにする
		isTouchUsing = true;
	}, { passive: true });
}

/** (MkSwiper) 横スワイプ中か？ */
export const isHorizontalSwipeSwiping = ref(false);
