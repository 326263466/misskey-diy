/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import MkReactionIcon from '@/components/MkReactionIcon.vue';
import MkEmoji from '@/components/global/MkEmoji.vue';
import MkCustomEmoji from '@/components/global/MkCustomEmoji.vue';
import { prefer } from '@/preferences.js';

vi.mock('@/preferences.js', async () => {
	const { reactive } = await import('vue');
	return { prefer: { s: reactive({ emojiStyle: 'twemoji' }) } };
});
vi.mock('@/components/global/MkCustomEmoji.vue', () => ({ default: { props: ['name'], template: '<img :alt="name"/>' } }));
vi.mock('@/composables/use-tooltip.js', () => ({ useTooltip: vi.fn() }));
vi.mock('@/utility/emoji-mute.js', () => ({ checkMuted: () => ({ value: false }) }));
vi.mock('@/os.js', () => ({ popup: vi.fn() }));

afterEach(cleanup);

test('updates emoji style without remounting', async () => {
	const view = render(MkReactionIcon, { props: { reaction: '😀' }, global: { components: { MkEmoji, MkCustomEmoji } } });
	for (const [style, src] of [['twemoji', '/twemoji/1f600.svg'], ['fluentEmoji', '/fluent-emoji/1f600.png']] as const) {
		prefer.s.emojiStyle = style;
		await nextTick();
		expect(view.container.querySelector('img')?.getAttribute('src')).toBe(src);
	}
	prefer.s.emojiStyle = 'native';
	await nextTick();
	expect(view.container.querySelector('img')).toBeNull();
	expect(view.container.textContent).toContain('😀');
});

test('uses the custom emoji renderer for custom reactions', () => {
	const view = render(MkReactionIcon, { props: { reaction: ':cat:' }, global: { components: { MkEmoji, MkCustomEmoji } } });
	expect(view.getByAltText(':cat:')).toBeTruthy();
});

test('does not render arbitrary text as an emoji', () => {
	const view = render(MkReactionIcon, { props: { reaction: 'old text 😀' }, global: { components: { MkEmoji, MkCustomEmoji } } });
	expect(view.container.textContent).toBe('');
	expect(view.container.querySelector('img')).toBeNull();
});
