/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import MkReactionIcon from '@/components/MkReactionIcon.vue';
import Mfm from '@/components/global/MkMfm.js';
import MkEmoji from '@/components/global/MkEmoji.vue';
import MkCustomEmoji from '@/components/global/MkCustomEmoji.vue';
import { prefer } from '@/preferences.js';

vi.mock('@/preferences.js', async () => {
	const { reactive } = await import('vue');
	return { prefer: { s: reactive({ emojiStyle: 'twemoji' }) } };
});
vi.mock('@/components/global/MkCustomEmoji.vue', () => ({
	default: {
		props: ['name'],
		template: '<img data-custom-emoji-renderer :alt="name" :data-emoji="name" src="custom-emoji-renderer://selected-style"/>',
	},
}));
vi.mock('@/composables/use-tooltip.js', () => ({ useTooltip: vi.fn() }));
vi.mock('@/utility/emoji-mute.js', () => ({ checkMuted: () => ({ value: false }) }));
vi.mock('@/os.js', () => ({ popup: vi.fn() }));

describe('MkReactionIcon text Boost rendering', () => {
	const preferences = prefer.s as { emojiStyle: 'twemoji' | 'fluentEmoji' | 'native' };
	beforeEach(() => { preferences.emojiStyle = 'twemoji'; });
	afterEach(cleanup);

	test.each(['😀', 'text:中文😀'])('suppresses the native emoji hover title when %s has a reaction tooltip', async (reaction) => {
		const global = { components: { Mfm, MkEmoji, MkCustomEmoji } };
		const withTooltip = render(MkReactionIcon, {
			props: { reaction, allowTextBoost: true, withTooltip: true },
			global,
		});
		const withoutTooltip = render(MkReactionIcon, {
			props: { reaction, allowTextBoost: true },
			global,
		});

		for (const style of ['twemoji', 'native'] as const) {
			preferences.emojiStyle = style;
			await nextTick();
			const coveredEmoji = withTooltip.container.querySelector<HTMLElement>('[alt="😀"]')!;
			const standaloneEmoji = withoutTooltip.container.querySelector<HTMLElement>('[alt="😀"]')!;
			await fireEvent.pointerEnter(coveredEmoji);
			await fireEvent.pointerEnter(standaloneEmoji);
			expect(coveredEmoji.title).toBe('');
			expect(standaloneEmoji.title).toBe('grinning');
		}
	});

	test('uses the current emoji style for both embedded and standalone emoji without remounting', async () => {
		const global = { components: { Mfm, MkEmoji, MkCustomEmoji } };
		const mixed = render(MkReactionIcon, {
			props: { reaction: 'text:中文😀', allowTextBoost: true },
			global,
		});
		const standalone = render(MkReactionIcon, {
			props: { reaction: '😀' },
			global,
		});

		for (const [style, src] of [
			['twemoji', '/twemoji/1f600.svg'],
			['fluentEmoji', '/fluent-emoji/1f600.png'],
			['twemoji', '/twemoji/1f600.svg'],
		] as const) {
			preferences.emojiStyle = style;
			await nextTick();
			for (const view of [mixed, standalone]) {
				expect(view.container.querySelector('img')?.getAttribute('alt')).toBe('😀');
				expect(view.container.querySelector('img')?.getAttribute('src')).toBe(src);
			}
		}

		preferences.emojiStyle = 'native';
		await nextTick();
		for (const view of [mixed, standalone]) {
			expect(view.container.querySelector('img')).toBeNull();
			expect(view.container.textContent).toContain('😀');
		}
	});

	test('keeps text reactions on the original emoji path when text Boosts are disabled', () => {
		const view = render(MkReactionIcon, {
			props: { reaction: 'text:中文😀' },
			global: { components: { Mfm, MkEmoji, MkCustomEmoji } },
		});

		expect(view.container.querySelector('img')?.getAttribute('alt')).toBe('text:中文😀');
	});
});
