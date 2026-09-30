/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import type * as Misskey from 'misskey-js';
import { preferState } from '../setup.unit.js';
import MkMediaImage from '@/components/MkMediaImage.vue';

vi.mock('@/os.js', () => ({ confirm: vi.fn().mockResolvedValue({ canceled: false }) }));
vi.mock('@/utility/get-file-menu.js', () => ({ getFileMenu: () => [] }));
vi.mock('@/components/MkBlurhash.vue', () => ({ default: { template: '<div/>' } }));

const originalUrl = 'https://example.test/original.png';
const thumbnailUrl = 'https://example.test/thumbnail.webp';
function file(overrides: Partial<Misskey.entities.DriveFile> = {}) {
	return { id: 'image', name: 'photo.png', type: 'image/png', url: originalUrl, thumbnailUrl,
		isSensitive: false, properties: { width: 640, height: 480 }, ...overrides } as Misskey.entities.DriveFile;
}

beforeEach(() => {
	preferState.nsfw = 'respect';
	preferState.dataSaver = { media: false };
	preferState.enableHighQualityImagePlaceholders = false;
	vi.spyOn(HTMLImageElement.prototype, 'decode').mockResolvedValue(undefined);
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	delete preferState.nsfw;
	delete preferState.enableHighQualityImagePlaceholders;
	preferState.dataSaver = { media: false, avatar: false, urlPreview: false, code: false };
});

describe('posted image previews', () => {
	test.each([false, true])('uses the original when a thumbnail is missing (blurhash: %s)', async highQuality => {
		preferState.enableHighQualityImagePlaceholders = highQuality;
		const view = render(MkMediaImage, { props: { image: file({ thumbnailUrl: null }) } });
		await waitFor(() => expect(view.container.querySelector('img')?.src).toBe(originalUrl));
	});

	test.each([false, true])('falls back when a thumbnail fails (blurhash: %s)', async highQuality => {
		preferState.enableHighQualityImagePlaceholders = highQuality;
		const view = render(MkMediaImage, { props: { image: file() } });
		const image = view.container.querySelector('img')!;
		expect(image.src).toBe(thumbnailUrl);
		await fireEvent.error(image);
		expect(image.src).toBe(originalUrl);
		await fireEvent.error(image);
		expect(image.src).toBe(originalUrl);
		await view.rerender({ image: file({ thumbnailUrl: 'https://example.test/new.webp' }) });
		expect(image.src).toBe('https://example.test/new.webp');
	});

	test('loads the image after explicitly revealing it in data saver mode', async () => {
		preferState.dataSaver = { media: true };
		const view = render(MkMediaImage, { props: { image: file(), disableImageLink: true } });
		expect(view.container.querySelector('img')).toBeNull();
		await fireEvent.click(view.container.firstElementChild!);
		await waitFor(() => expect(view.container.querySelector('img')?.src).toBe(thumbnailUrl));
	});

	test('does not reveal sensitive content before confirmation', async () => {
		preferState.confirmWhenRevealingSensitiveMedia = true;
		const { confirm } = await import('@/os.js');
		vi.mocked(confirm).mockResolvedValueOnce({ canceled: true });
		const view = render(MkMediaImage, { props: { image: file({ isSensitive: true }), disableImageLink: true } });
		await fireEvent.click(view.container.firstElementChild!);
		expect(view.container.querySelector('img')).toBeNull();
		delete preferState.confirmWhenRevealingSensitiveMedia;
	});
});
