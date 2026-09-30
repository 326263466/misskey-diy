/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import type { App } from 'vue';
import MkImgWithBlurhash from '@/components/MkImgWithBlurhash.vue';

vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false } } }));

let app: App | undefined;
let host: HTMLElement | undefined;

function imageUrl(name: string, color = '#ed2345') {
	return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><title>${name}</title><rect width="80" height="60" fill="${color}"/></svg>`)}`;
}

async function mountImage(initialSource: string | null, initiallyBlurred = false) {
	host = document.createElement('div');
	host.style.cssText = 'width:320px;height:240px;';
	document.body.append(host);
	const src = ref(initialSource);
	const forceBlurhash = ref(initiallyBlurred);
	const onError = vi.fn();
	app = createApp({
		setup: () => () => h(MkImgWithBlurhash, {
			src: src.value,
			forceBlurhash: forceBlurhash.value,
			hash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj',
			onlyAvgColor: true,
			width: 80,
			height: 60,
			onError,
		}),
	});
	app.mount(host);
	await nextTick();
	return {
		src, forceBlurhash, onError,
		image: host.querySelector('img')!,
		placeholder: host.querySelector('canvas')!,
	};
}

async function expectImageVisible(image: HTMLImageElement, placeholder: HTMLCanvasElement) {
	await expect.poll(() => image.complete && image.naturalWidth === 80).toBe(true);
	await expect.poll(() => getComputedStyle(image).display).not.toBe('none');
	await expect.poll(() => getComputedStyle(placeholder).display).toBe('none');
	const pixels = document.createElement('canvas');
	pixels.width = 1;
	pixels.height = 1;
	const context = pixels.getContext('2d')!;
	context.drawImage(image, 0, 0, 1, 1);
	expect(Array.from(context.getImageData(0, 0, 1, 1).data)).toEqual([237, 35, 69, 255]);
}

afterEach(() => {
	app?.unmount();
	host?.remove();
	vi.restoreAllMocks();
});

test('shows a normally loaded picture and removes the placeholder without opening the gallery', async () => {
	const { image, placeholder } = await mountImage(imageUrl('default'));
	await expectImageVisible(image, placeholder);
});

test('shows the loaded picture even when decode rejects', async () => {
	vi.spyOn(HTMLImageElement.prototype, 'decode').mockRejectedValue(new DOMException('The source changed during decoding', 'EncodingError'));
	const { image, placeholder, onError } = await mountImage(imageUrl('decode-rejects'));
	await expectImageVisible(image, placeholder);
	expect(onError).not.toHaveBeenCalled();
});

test('does not keep the placeholder while an optional decode request is still pending', async () => {
	vi.spyOn(HTMLImageElement.prototype, 'decode').mockImplementation(() => new Promise(() => {}));
	const { image, placeholder } = await mountImage(imageUrl('decode-pending'));
	await expectImageVisible(image, placeholder);
});

test('shows an image that is already in the browser cache', async () => {
	const url = imageUrl('cached');
	const cachedImage = new Image();
	cachedImage.src = url;
	await cachedImage.decode();
	vi.spyOn(HTMLImageElement.prototype, 'decode').mockRejectedValue(new DOMException('Decode unavailable', 'EncodingError'));
	const { image, placeholder } = await mountImage(url);
	await expectImageVisible(image, placeholder);
});

test('ignores an old decode completion after the source is cleared and reveals the replacement on load', async () => {
	let finishOldDecode!: () => void;
	vi.spyOn(HTMLImageElement.prototype, 'decode').mockImplementationOnce(() => new Promise<void>(resolve => {
		finishOldDecode = resolve;
	})).mockRejectedValue(new DOMException('Decode unavailable', 'EncodingError'));
	const { image, placeholder, src } = await mountImage(imageUrl('old'));
	await expect.poll(() => image.complete && image.naturalWidth > 0).toBe(true);
	src.value = null;
	await nextTick();
	finishOldDecode();
	await nextTick();
	expect(getComputedStyle(image).display).toBe('none');
	expect(getComputedStyle(placeholder).display).not.toBe('none');
	src.value = imageUrl('replacement');
	await expectImageVisible(image, placeholder);
});

test('keeps an explicitly hidden sensitive image blurred until it is revealed', async () => {
	const { image, placeholder, forceBlurhash } = await mountImage(imageUrl('sensitive'), true);
	await expect.poll(() => image.complete && image.naturalWidth > 0).toBe(true);
	expect(getComputedStyle(image).display).toBe('none');
	expect(getComputedStyle(placeholder).display).not.toBe('none');
	forceBlurhash.value = false;
	await expectImageVisible(image, placeholder);
});
