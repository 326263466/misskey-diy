/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref, Suspense } from 'vue';
import { initializeImageFade } from '@@/js/image-fade.js';
import '@@/styles/image-fade.scss';
import type { App } from 'vue';
import type * as Misskey from 'misskey-js';
import MkImgWithBlurhash from '@/components/MkImgWithBlurhash.vue';
import MkAvatar from '@/components/global/MkAvatar.vue';
import MkA from '@/components/global/MkA.vue';
import MkAchievementBadge from '@/components/MkAchievementBadge.vue';
import MkRolePreview from '@/components/MkRolePreview.vue';
import WidgetSlideshow from '@/widgets/WidgetSlideshow.vue';

vi.mock('misskey-js', () => ({ acct: { toString: (user: { username: string }) => user.username } }));
vi.mock('@/components/global/MkA.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({ props: ['to'], setup: (props, { slots }) => () => h('a', { href: props.to }, slots.default?.()) }) };
});
vi.mock('@/utility/achievements.js', () => ({ ACHIEVEMENT_BADGES: {
	notes1: {
		img: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="#ed2345"/></svg>')}`,
		bg: null,
		frame: 'bronze',
	},
} }));
vi.mock('@/i.js', () => ({ $i: null }));
const preferences = vi.hoisted(() => ({
	animation: false, mediaListWithOneImageAppearance: 'expand', showMediaListByGridInWideArea: false,
	enableHighQualityImagePlaceholders: true, nsfw: 'respect', dataSaver: { media: false },
	showAvatarDecorations: true,
}));
vi.mock('@/preferences.js', () => ({ prefer: { s: preferences } }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { _mediaControls: { play: 'Play' }, _widgetOptions: { height: 'Height' }, folder: 'Folder', nothing: 'Empty' } } }));
vi.mock('@/os.js', () => ({ popupAsyncWithDialog: vi.fn(), popupMenu: vi.fn(), contextMenu: vi.fn() }));
vi.mock('@/utility/get-file-menu.js', () => ({ getFileMenu: () => [] }));
vi.mock('@/components/MkMediaAudio.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkMediaBanner.vue', () => ({ default: { render: () => null } }));
const slideshow = vi.hoisted(() => ({ api: vi.fn(), selectFolder: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: slideshow.api }));
vi.mock('@/utility/drive.js', () => ({ selectDriveFolder: slideshow.selectFolder }));
vi.mock('@/widgets/widget.js', () => ({ useWidgetPropsManager: () => ({ widgetProps: { height: 300, folderId: 'photos' }, configure: vi.fn(), save: vi.fn() }) }));

let app: App | undefined;
let host: HTMLElement | undefined;
let scrollContainer: HTMLElement | undefined;
let imageFade: ReturnType<typeof initializeImageFade> | undefined;
let splash: HTMLElement | undefined;

function imageUrl(name: string, color = '#ed2345') {
	return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><title>${name}</title><rect width="80" height="60" fill="${color}"/></svg>`)}`;
}

async function mountImage(initialSource: string | null, initiallyBlurred = false, offset = 0, parent: HTMLElement = document.body) {
	host = document.createElement('div');
	host.style.cssText = 'width:320px;height:240px;';
	host.style.marginTop = `${offset}px`;
	parent.append(host);
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
	imageFade?.disconnect();
	imageFade = undefined;
	app?.unmount();
	host?.remove();
	scrollContainer?.remove();
	scrollContainer = undefined;
	splash?.remove();
	splash = undefined;
	window.scrollTo(0, 0);
	vi.restoreAllMocks();
	preferences.animation = false;
});

test('shows a normally loaded picture and removes the placeholder without opening the gallery', async () => {
	const { image, placeholder } = await mountImage(imageUrl('default'));
	await expectImageVisible(image, placeholder);
});

test('loads an image while a fixed timeline keeps animating without hover or focus', async () => {
	scrollContainer = document.createElement('div');
	scrollContainer.style.cssText = 'height:300px;overflow:auto;';
	document.body.append(scrollContainer);
	const timeline = document.createElement('div');
	timeline.style.cssText = 'position:fixed;top:0;left:0;width:320px;height:300px;overflow:hidden;';
	scrollContainer.append(timeline);
	const { image, placeholder } = await mountImage(imageUrl('fixed-timeline'), false, 900, timeline);
	expect(image.getAttribute('src')).toBeNull();
	const animation = host!.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-1800px)' }], { duration: 100000, iterations: Infinity });
	animation.currentTime = 50000;
	try {
		await expectImageVisible(image, placeholder);
		expect(animation.playState).toBe('running');
	} finally {
		animation.cancel();
	}
});

test('shows an image that is already in the browser cache', async () => {
	const url = imageUrl('cached');
	const cachedImage = new Image();
	cachedImage.src = url;
	await cachedImage.decode();
	const { image, placeholder } = await mountImage(url);
	await expectImageVisible(image, placeholder);
});

test('reveals an image after load when its earlier decode was rejected', async () => {
	vi.spyOn(HTMLImageElement.prototype, 'decode').mockRejectedValue(new DOMException('Decoding unavailable', 'EncodingError'));
	const { image, placeholder } = await mountImage(imageUrl('decode-rejected-before-load'));
	await expectImageVisible(image, placeholder);
});

test.each([false, true])('fades a cached first-screen image with placeholders=%s', async useBlurhash => {
	preferences.animation = true;
	const url = imageUrl(`cached-fade-${useBlurhash}`);
	const cachedImage = new Image();
	cachedImage.src = url;
	await cachedImage.decode();
	host = document.createElement('div');
	host.style.cssText = 'width:120px;height:120px;';
	document.body.append(host);
	app = createApp({ render: () => h(MkImgWithBlurhash, { src: url, useBlurhash, onlyAvgColor: true }) });
	app.mount(host);
	const image = host.querySelector('img')!;
	const opacities: number[] = [];
	for (let frame = 0; frame < 40; frame++) {
		await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
		if (getComputedStyle(image).display !== 'none') opacities.push(Number(getComputedStyle(image).opacity));
	}
	expect(opacities.some(opacity => opacity > 0 && opacity < 1)).toBe(true);
	expect(opacities.at(-1)).toBe(1);
});

test('paints the placeholder before revealing a cached image on an async first-screen page', async () => {
	preferences.animation = true;
	const url = imageUrl('async-first-screen');
	const cached = new Image();
	cached.src = url;
	await cached.decode();
	let finishPage!: () => void;
	const pageReady = new Promise<void>(resolve => { finishPage = resolve; });
	const AsyncContent = defineComponent({
		async setup() {
			await pageReady;
			return () => null;
		},
	});
	host = document.createElement('div');
	host.style.cssText = 'width:120px;height:120px;';
	document.body.append(host);
	app = createApp({
		render: () => h(Suspense, null, {
			default: () => h('div', [
				h(MkImgWithBlurhash, { src: url, hash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj', onlyAvgColor: true }),
				h(AsyncContent),
			]),
			fallback: () => null,
		}),
	});
	app.mount(host);
	await nextTick();
	finishPage();
	const opacities: number[] = [];
	const placeholderAlphas: number[] = [];
	for (let frame = 0; frame < 40; frame++) {
		await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
		const image = host.querySelector('img');
		const placeholder = host.querySelector('canvas');
		if (image != null && getComputedStyle(image).display !== 'none') opacities.push(Number(getComputedStyle(image).opacity));
		if (placeholder != null && getComputedStyle(placeholder).display !== 'none') {
			placeholderAlphas.push(placeholder.getContext('2d')!.getImageData(0, 0, 1, 1).data[3]);
		}
	}
	expect(placeholderAlphas.length).toBeGreaterThan(0);
	expect(placeholderAlphas.every(alpha => alpha === 255)).toBe(true);
	expect(opacities.some(opacity => opacity > 0 && opacity < 1)).toBe(true);
	expect(opacities.at(-1)).toBe(1);
});

test('starts the first-screen fade after the boot splash has disappeared', async () => {
	preferences.animation = true;
	splash = document.createElement('div');
	splash.id = 'splash';
	splash.style.cssText = 'position:fixed;inset:0;z-index:10000;background:white;opacity:1;transition:opacity 500ms ease;';
	document.body.append(splash);
	expect(getComputedStyle(splash).opacity).toBe('1');
	const { image } = await mountImage(imageUrl('boot-splash'));
	splash.style.opacity = '0';
	await Promise.all(splash.getAnimations().map(animation => animation.finished));
	const opacities: number[] = [];
	for (let frame = 0; frame < 35; frame++) {
		await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
		if (getComputedStyle(image).display !== 'none') opacities.push(Number(getComputedStyle(image).opacity));
	}
	expect(opacities.some(opacity => opacity > 0 && opacity < 1)).toBe(true);
	expect(opacities.at(-1)).toBe(1);
});

test('fades cached plain images consistently and keeps already shown images visible', async () => {
	const url = imageUrl('plain-cached');
	const cached = new Image();
	cached.src = url;
	await cached.decode();
	host = document.createElement('div');
	document.body.append(host);
	imageFade = initializeImageFade({ animationsEnabled: () => true, root: host });
	const image = new Image();
	image.src = url;
	host.append(image);
	await expect.poll(() => image.getAnimations().length).toBe(1);
	expect(Number(getComputedStyle(image).opacity)).toBeLessThan(1);
	await image.getAnimations()[0].finished;
	expect(getComputedStyle(image).opacity).toBe('1');
	const repeated = new Image();
	repeated.src = url;
	host.append(repeated);
	await repeated.decode();
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
	await expect.poll(() => repeated.getAnimations().length).toBe(1);
	expect(Number(getComputedStyle(repeated).opacity)).toBeLessThan(1);
	await repeated.getAnimations()[0].finished;
	expect(getComputedStyle(repeated).opacity).toBe('1');
	expect(image.getAnimations()).toHaveLength(0);
});

test('waits for the boot splash on a plain image and handles splash removal', async () => {
	splash = document.createElement('div');
	splash.id = 'splash';
	document.body.append(splash);
	host = document.createElement('div');
	document.body.append(host);
	imageFade = initializeImageFade({ animationsEnabled: () => true, root: host });
	const image = new Image();
	image.src = imageUrl('plain-splash');
	host.append(image);
	await image.decode();
	expect(getComputedStyle(image).opacity).toBe('0');
	expect(image.getAnimations()).toHaveLength(0);
	splash.remove();
	await expect.poll(() => image.getAnimations().length).toBe(1);
	await image.getAnimations()[0].finished;
	expect(getComputedStyle(image).opacity).toBe('1');
});

test('keeps the splash logo visible and cancels a pending fade when animations are disabled', async () => {
	host = document.createElement('div');
	document.body.append(host);
	splash = document.createElement('div');
	splash.id = 'splash';
	const logo = new Image();
	logo.src = imageUrl('splash-logo');
	splash.append(logo);
	host.append(splash);
	let animationsEnabled = true;
	imageFade = initializeImageFade({ animationsEnabled: () => animationsEnabled, root: host });
	await logo.decode();
	expect(getComputedStyle(logo).opacity).toBe('1');
	expect(logo.getAnimations()).toHaveLength(0);
	const image = new Image();
	image.src = imageUrl('disabled-during-splash');
	host.append(image);
	await image.decode();
	expect(getComputedStyle(image).opacity).toBe('0');
	animationsEnabled = false;
	imageFade.refresh();
	expect(getComputedStyle(image).opacity).toBe('1');
	splash.remove();
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
	expect(image.getAnimations()).toHaveLength(0);
});

test('fades a repeated background layer without fading its content', async () => {
	host = document.createElement('div');
	document.body.append(host);
	imageFade = initializeImageFade({ animationsEnabled: () => true, root: host });
	const background = document.createElement('div');
	background.style.cssText = 'width:120px;height:80px;';
	const image = new Image();
	image.setAttribute('data-image-fade-background', '');
	image.style.display = 'none';
	image.src = imageUrl('background');
	background.style.backgroundImage = `url(${JSON.stringify(image.src)})`;
	background.append(image);
	const content = document.createElement('span');
	content.textContent = 'content';
	host.append(background, content);
	await expect.poll(() => background.getAnimations().length).toBe(1);
	expect(content.getAnimations()).toHaveLength(0);
	expect(getComputedStyle(content).opacity).toBe('1');
	await background.getAnimations()[0].finished;
	expect(getComputedStyle(background).opacity).toBe('1');
	let finishDecode!: () => void;
	vi.spyOn(image, 'decode').mockImplementation(() => new Promise<void>(resolve => { finishDecode = resolve; }));
	image.src = imageUrl('background-replacement');
	await expect.poll(() => getComputedStyle(background).opacity).toBe('0');
	await expect.poll(() => finishDecode).toBeDefined();
	image.remove();
	await expect.poll(() => getComputedStyle(background).opacity).toBe('1');
	finishDecode();
	await nextTick();
});

test('keeps a managed image out of the global fade and releases errors', async () => {
	host = document.createElement('div');
	document.body.append(host);
	imageFade = initializeImageFade({ animationsEnabled: () => true, root: host });
	const managed = new Image();
	managed.setAttribute('data-image-fade', 'managed');
	managed.src = imageUrl('managed');
	const broken = new Image();
	broken.src = 'data:image/png;base64,broken';
	host.append(managed, broken);
	await managed.decode();
	await expect.poll(() => broken.complete).toBe(true);
	expect(managed.getAnimations()).toHaveLength(0);
	expect(getComputedStyle(managed).opacity).toBe('1');
	expect(getComputedStyle(broken).opacity).toBe('1');
	imageFade.disconnect();
});

test('does not reveal a plain replacement image when an older decode finishes', async () => {
	host = document.createElement('div');
	document.body.append(host);
	imageFade = initializeImageFade({ animationsEnabled: () => true, root: host });
	const image = new Image();
	const pending = new Map<string, () => void>();
	vi.spyOn(image, 'decode').mockImplementation(() => new Promise<void>(resolve => { pending.set(image.src, resolve); }));
	const first = imageUrl('plain-first');
	const replacement = imageUrl('plain-replacement');
	image.setAttribute('data-image-lazy', '');
	image.setAttribute('data-image-src', first);
	host.append(image);
	await expect.poll(() => pending.has(first)).toBe(true);
	image.setAttribute('data-image-src', replacement);
	await expect.poll(() => pending.has(replacement)).toBe(true);
	pending.get(first)!();
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
	expect(getComputedStyle(image).opacity).toBe('0');
	expect(image.getAnimations()).toHaveLength(0);
	pending.get(replacement)!();
	await expect.poll(() => image.getAnimations().length).toBe(1);
	await image.getAnimations()[0].finished;
	expect(getComputedStyle(image).opacity).toBe('1');
	image.removeAttribute('data-image-src');
	await expect.poll(() => image.getAttribute('src')).toBeNull();
});

test('waits for slideshow decoding and ignores an older slide request', async () => {
	const first = imageUrl('slideshow-first');
	const second = imageUrl('slideshow-second', '#123456');
	for (const src of [first, second]) {
		const image = new Image();
		image.src = src;
		await image.decode();
	}
	const pending: (() => void)[] = [];
	vi.spyOn(HTMLImageElement.prototype, 'decode').mockImplementation(() => new Promise<void>(resolve => { pending.push(resolve); }));
	slideshow.api.mockResolvedValue([{ url: first }, { url: second }]);
	slideshow.selectFolder.mockResolvedValue({ canceled: false, folders: [{ id: 'replacement' }] });
	vi.spyOn(Math, 'random').mockReturnValue(0);
	host = document.createElement('div');
	document.body.append(host);
	app = createApp({ render: () => h(WidgetSlideshow) });
	app.mount(host);
	await expect.poll(() => pending.length).toBe(1);
	const front = host.querySelector<HTMLElement>('.slide.a')!;
	const back = host.querySelector<HTMLElement>('.slide.b')!;
	expect(front.style.backgroundImage).toBe('');
	vi.mocked(Math.random).mockReturnValue(0.99);
	slideshow.api.mockResolvedValue([{ url: second }]);
	host.querySelector<HTMLElement>('.kvausudm > div')!.click();
	await expect.poll(() => pending.length).toBe(2);
	pending[0]();
	await nextTick();
	expect(front.style.backgroundImage).toBe('');
	pending[1]();
	await expect.poll(() => front.style.backgroundImage).toContain('slideshow-second');
	expect(back.getAnimations()).toHaveLength(0);
	host.querySelector<HTMLElement>('.kvausudm > div')!.click();
	await expect.poll(() => pending.length).toBe(3);
	app.unmount();
	app = undefined;
	pending[2]();
	await nextTick();
	expect(front.style.backgroundImage).toBe('');
});

test('does not reveal a replacement image when an older decode finishes', async () => {
	const { image, placeholder, src } = await mountImage(imageUrl('initial'));
	await expectImageVisible(image, placeholder);
	const pending = new Map<string, () => void>();
	vi.spyOn(HTMLImageElement.prototype, 'decode').mockImplementation(function (this: HTMLImageElement) {
		return new Promise<void>(resolve => { pending.set(this.src, resolve); });
	});
	const first = imageUrl('first');
	const replacement = imageUrl('replacement');
	src.value = first;
	await expect.poll(() => pending.has(first)).toBe(true);
	expect(getComputedStyle(image).display).toBe('none');
	src.value = replacement;
	await expect.poll(() => pending.has(replacement)).toBe(true);
	pending.get(first)!();
	await nextTick();
	expect(getComputedStyle(image).display).toBe('none');
	expect(getComputedStyle(placeholder).display).not.toBe('none');
	await expect.poll(() => image.complete && image.naturalWidth > 0).toBe(true);
	pending.get(replacement)!();
	await expectImageVisible(image, placeholder);
});

test.each([
	{ kind: 'media', nested: false }, { kind: 'media', nested: true },
	{ kind: 'plain', nested: false }, { kind: 'plain', nested: true },
])('loads and fades cached images only after scrolling into view ($kind, nested scroll: $nested)', async ({ kind, nested }) => {
	preferences.animation = true;
	const url = imageUrl(`scroll-fade-${kind}-${nested}`);
	const cached = new Image();
	cached.src = url;
	await cached.decode();
	if (nested) {
		scrollContainer = document.createElement('div');
		scrollContainer.style.cssText = 'height:400px;overflow:auto;';
		if (kind === 'plain') scrollContainer.style.marginTop = `${window.innerHeight + 100}px`;
		document.body.append(scrollContainer);
	}
	const viewportHeight = scrollContainer?.clientHeight ?? window.innerHeight;
	let image: HTMLImageElement;
	let placeholder: HTMLCanvasElement | undefined;
	if (kind === 'plain') {
		host = document.createElement('div');
		host.style.cssText = `width:320px;height:240px;margin-top:${viewportHeight + 600}px;`;
		image = new Image(80, 60);
		image.style.cssText = 'width:100%;height:100%;';
		image.setAttribute('data-image-lazy', '');
		image.setAttribute('data-image-src', url);
		host.append(image);
		imageFade = initializeImageFade({ animationsEnabled: () => preferences.animation });
		(scrollContainer ?? document.body).append(host);
	} else {
		({ image, placeholder } = await mountImage(url, false, viewportHeight + 600, scrollContainer));
	}
	await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
	expect(image.getAttribute('src')).toBeNull();
	(scrollContainer ?? window).scrollTo(0, 450);
	await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
	const viewportBottom = scrollContainer?.getBoundingClientRect().bottom ?? window.innerHeight;
	expect(host!.getBoundingClientRect().top).toBeGreaterThan(viewportBottom);
	expect(image.getAttribute('src')).toBeNull();
	(scrollContainer ?? window).scrollTo(0, 750);
	if (kind === 'plain' && nested) {
		await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
		expect(image.getAttribute('src')).toBeNull();
		window.scrollTo(0, window.innerHeight + 100);
	}
	const opacities: number[] = [];
	for (let frame = 0; frame < 45; frame++) {
		await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
		if (getComputedStyle(image).display !== 'none') opacities.push(Number(getComputedStyle(image).opacity));
	}
	expect(opacities.some(opacity => opacity > 0 && opacity < 1)).toBe(true);
	expect(opacities.at(-1)).toBe(1);
	if (placeholder != null) await expectImageVisible(image, placeholder);
	else expect(image.complete && image.naturalWidth === 80).toBe(true);
	(scrollContainer ?? window).scrollTo(0, 450);
	await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
	(scrollContainer ?? window).scrollTo(0, 750);
	await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
	expect(getComputedStyle(image).opacity).toBe('1');
	expect(image.getAnimations()).toHaveLength(0);
});

test.each([false, true])('loads only nearby decorations and badges in a 400-item list (avatar link: %s)', async link => {
	scrollContainer = document.createElement('div');
	scrollContainer.style.cssText = 'width:420px;height:360px;overflow:auto;';
	document.body.append(scrollContainer);
	host = document.createElement('div');
	scrollContainer.append(host);
	const rows = Array.from({ length: 400 }, (_, index) => ({
		user: {
			id: `user-${index}`, username: `user-${index}`, host: null,
			avatarUrl: imageUrl(`avatar-${index}`), avatarBlurhash: null,
			avatarDecorations: [{ id: `decoration-${index}`, url: imageUrl(`decoration-${index}`) }],
		} as Misskey.entities.UserLite,
		role: {
			id: `role-${index}`, name: `Role ${index}`, description: '',
			iconUrl: imageUrl(`role-${index}`), color: '',
		} as Misskey.entities.Role,
	}));
	app = createApp({
		setup: () => () => h('div', rows.map(({ user, role }, index) => h('div', {
			'data-row': index, style: 'height:96px;display:flex;align-items:center;gap:24px;',
		}, [
			h(MkAvatar, { user, link, style: 'width:60px;height:60px;' }),
			h(MkAchievementBadge, { name: 'notes1' }),
			h(MkRolePreview, { role, forModeration: false, style: 'width:220px;' }),
		]))),
	});
	app.component('MkA', MkA);
	// 使用应用现有的全局组件名。
	// eslint-disable-next-line vue/multi-word-component-names
	app.component('Mfm', defineComponent({ props: ['text'], setup: props => () => h('span', props.text) }));
	app.directive('user-preview', {});
	app.mount(host);
	const firstImages = Array.from(host.querySelectorAll<HTMLImageElement>('[data-row="0"] img'));
	const lastImages = Array.from(host.querySelectorAll<HTMLImageElement>('[data-row="399"] img'));
	expect(firstImages).toHaveLength(4);
	expect(lastImages).toHaveLength(4);
	await expect.poll(() => firstImages.every(image => image.hasAttribute('src'))).toBe(true);
	expect(lastImages.every(image => !image.hasAttribute('src'))).toBe(true);
	expect(host.querySelectorAll('img[src]').length).toBeLessThan(rows.length);
	scrollContainer.scrollTop = scrollContainer.scrollHeight;
	await expect.poll(() => lastImages.every(image => image.hasAttribute('src'))).toBe(true);
	expect(host.querySelectorAll('img[src]').length).toBeLessThan(rows.length);
	scrollContainer.scrollTop = 0;
	await expect.poll(() => firstImages.every(image => image.hasAttribute('src'))).toBe(true);
});

test('keeps an explicitly hidden sensitive image blurred until it is revealed', async () => {
	preferences.animation = true;
	const { image, placeholder, forceBlurhash } = await mountImage(imageUrl('sensitive'), true);
	await expect.poll(() => image.complete && image.naturalWidth > 0).toBe(true);
	expect(getComputedStyle(image).display).toBe('none');
	expect(getComputedStyle(placeholder).display).not.toBe('none');
	forceBlurhash.value = false;
	await expectImageVisible(image, placeholder);
	forceBlurhash.value = true;
	await nextTick();
	expect(getComputedStyle(image).visibility).toBe('hidden');
});
