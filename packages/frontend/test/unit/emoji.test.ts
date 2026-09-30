/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import { char2fluentEmojiFilePath, char2twemojiFilePath } from '@@/js/emoji-base.js';
import { emojilist, getEmojiName } from '@@/js/emojilist.js';
import MkEmoji from '@/components/global/MkEmoji.vue';
import { prefer } from '@/preferences.js';

vi.mock('@/preferences.js', async () => {
	const { reactive } = await import('vue');
	return { prefer: { s: reactive({ emojiStyle: 'fluentEmoji' }) } };
});
vi.mock('@/utility/emoji-mute.js', () => ({ checkMuted: () => ({ value: false }) }));
vi.mock('@/os.js', () => ({}));

const preferences = prefer.s as { emojiStyle: 'twemoji' | 'fluentEmoji' | 'native' };

describe('shared emoji asset fallback', () => {
	beforeEach(() => { preferences.emojiStyle = 'fluentEmoji'; });
	afterEach(cleanup);

	test('renders a selector-less heart in color in native mode', () => {
		preferences.emojiStyle = 'native';
		const view = render(MkEmoji, { props: { emoji: '\u2764' } });
		expect(view.queryByText('\u2764\uFE0F')).not.toBeNull();
		expect(view.queryByText('\u2764')).toBeNull();
	});

	test('gets the name of a selector-less heart', () => {
		expect(getEmojiName('\u2764')).toBe('heart');
	});

	test('tries Twemoji after a missing Fluent asset, then renders a native emoji', async () => {
		const view = render(MkEmoji, { props: { emoji: '🫩' } });
		expect(view.getByRole('img').getAttribute('src')).toBe('/fluent-emoji/1fae9.png');
		expect(hasAsset('/fluent-emoji/1fae9.png')).toBe(false);
		await fireEvent.error(view.getByRole('img'));
		expect(view.getByRole('img').getAttribute('src')).toBe('/twemoji/1fae9.svg');
		expect(hasAsset('/twemoji/1fae9.svg')).toBe(true);
		await fireEvent.error(view.getByRole('img'));
		expect(view.queryByRole('img')).toBeNull();
		expect(view.container.textContent).toContain('🫩');
	});

	test('falls back directly to native when the requested Twemoji asset fails', async () => {
		preferences.emojiStyle = 'twemoji';
		const view = render(MkEmoji, { props: { emoji: '🎉' } });
		await fireEvent.error(view.getByRole('img'));
		expect(view.queryByRole('img')).toBeNull();
		expect(view.container.textContent).toContain('🎉');
	});

	test('does not retry the same failed Twemoji flag when using Fluent', async () => {
		const view = render(MkEmoji, { props: { emoji: '🇨🇳' } });
		expect(view.getByRole('img').getAttribute('src')).toBe('/twemoji/1f1e8-1f1f3.svg');
		await fireEvent.error(view.getByRole('img'));
		expect(view.queryByRole('img')).toBeNull();
		expect(view.container.textContent).toBe('🇨🇳');
	});

	test('retries the selected artwork when the emoji or preference changes', async () => {
		const view = render(MkEmoji, { props: { emoji: '🎉' } });
		await fireEvent.error(view.getByRole('img'));
		await fireEvent.error(view.getByRole('img'));
		await view.rerender({ emoji: '❤️' });
		expect(view.getByRole('img').getAttribute('src')).toBe('/fluent-emoji/2764.png');
		await view.rerender({ emoji: '🎉' });
		expect(view.getByRole('img').getAttribute('src')).toBe('/fluent-emoji/1f389.png');
		await fireEvent.error(view.getByRole('img'));
		await fireEvent.error(view.getByRole('img'));
		preferences.emojiStyle = 'twemoji';
		await nextTick();
		expect(view.getByRole('img').getAttribute('src')).toBe('/twemoji/1f389.svg');
		preferences.emojiStyle = 'native';
		await nextTick();
		expect(view.queryByRole('img')).toBeNull();
		preferences.emojiStyle = 'fluentEmoji';
		await nextTick();
		expect(view.getByRole('img').getAttribute('src')).toBe('/fluent-emoji/1f389.png');
	});

	test('ignores a stale error after replacing the image source', async () => {
		const view = render(MkEmoji, { props: { emoji: '🎉' } });
		const oldImage = view.getByRole('img');
		await fireEvent.error(oldImage);
		expect(view.getByRole('img')).not.toBe(oldImage);
		await fireEvent.error(oldImage);
		expect(view.getByRole('img').getAttribute('src')).toBe('/twemoji/1f389.svg');
		await view.rerender({ emoji: '❤️' });
		await fireEvent.error(oldImage);
		expect(view.getByRole('img').getAttribute('src')).toBe('/fluent-emoji/2764.png');
		await view.rerender({ emoji: '🎉' });
		await fireEvent.error(oldImage);
		expect(view.getByRole('img').getAttribute('src')).toBe('/fluent-emoji/1f389.png');
	});

	test('keeps native tooltip suppression through each fallback', async () => {
		const view = render(MkEmoji, { props: { emoji: '🎉', noTooltip: true } });
		for (let attempt = 0; attempt < 2; attempt++) {
			const image = view.getByRole('img');
			await fireEvent.pointerEnter(image);
			expect(image.getAttribute('title')).toBe('');
			await fireEvent.error(image);
		}
		const native = view.container.firstElementChild!;
		await fireEvent.pointerEnter(native);
		expect(native.getAttribute('title')).toBe('');
		await view.rerender({ noTooltip: false });
		await fireEvent.pointerEnter(native);
		expect(native.getAttribute('title')).toBe('tada');
	});
});

function hasAsset(path: string) {
	return existsSync(resolve(import.meta.dirname, '../../node_modules/@misskey-dev/emoji-assets/built', path.replace(/^\//, '')));
}

describe('emoji asset paths', () => {
	test('uses each set’s actual eye-in-speech-bubble asset name', () => {
		expect(char2twemojiFilePath('👁️‍🗨️')).toBe('/twemoji/1f441-200d-1f5e8.svg');
		expect(char2fluentEmojiFilePath('👁️‍🗨️')).toBe('/fluent-emoji/1f441-fe0f-200d-1f5e8-fe0f.png');
		expect(hasAsset(char2twemojiFilePath('👁️‍🗨️'))).toBe(true);
		expect(hasAsset(char2fluentEmojiFilePath('👁️‍🗨️'))).toBe(true);
	});

	test('resolves bundled Twemoji artwork for every emoji in the picker', () => {
		const missing = emojilist.filter(emoji => !hasAsset(char2twemojiFilePath(emoji.char))).map(emoji => emoji.name);
		expect(missing).toEqual([]);
	});

	test.each(['👨‍👩‍👧‍👦', '👩‍⚕️', '👩🏽‍💻', '🏳️‍🌈', '🏳️‍⚧️', '❤️‍🔥', '👍🏽', '1️⃣', '🇨🇳'])('preserves supported ZWJ, modifier and selector assets for %s', emoji => {
		expect(hasAsset(char2twemojiFilePath(emoji))).toBe(true);
	});

	test.each(['👩‍⚕️', '👩🏽‍💻', '🏳️‍🌈', '🏳️‍⚧️', '❤️‍🔥', '👍🏽', '1️⃣', '🇨🇳'])('keeps existing Fluent selector and modifier asset paths for %s', emoji => {
		expect(hasAsset(char2fluentEmojiFilePath(emoji))).toBe(true);
	});
});
