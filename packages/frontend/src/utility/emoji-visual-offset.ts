/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const offsets = new Map<string, number>();
const SAMPLE_SIZE = 36;
const CACHE_LIMIT = 256;
let canvas: HTMLCanvasElement | undefined;

/** 内置静态表情的透明画布可能上下不对称，只校准图形位置，不改变显示尺寸。 */
export function getEmojiVisualOffset(image: HTMLImageElement): number {
	const url = image.currentSrc || image.src;
	const cached = offsets.get(url);
	if (cached != null) return cached;
	if (!image.complete || image.naturalWidth === 0) return 0;
	let offset = 0;
	try {
		canvas ??= image.ownerDocument.createElement('canvas');
		canvas.width = canvas.height = SAMPLE_SIZE;
		const context = canvas.getContext('2d', { willReadFrequently: true });
		if (context) {
			context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
			const pixels = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
			let top = SAMPLE_SIZE;
			let bottom = -1;
			for (let y = 0; y < SAMPLE_SIZE; y++) {
				for (let x = 0; x < SAMPLE_SIZE; x++) {
					if (pixels[(y * SAMPLE_SIZE + x) * 4 + 3] < 32) continue;
					top = Math.min(top, y);
					bottom = y;
					break;
				}
			}
			if (bottom >= top) offset = Math.max(-0.25, Math.min(0.25, 0.5 - (top + bottom + 1) / (2 * SAMPLE_SIZE)));
		}
	} catch { /* 无法读取图片时保留原位置。 */ }
	offsets.set(url, offset);
	if (offsets.size > CACHE_LIMIT) offsets.delete(offsets.keys().next().value!);
	return offset;
}
