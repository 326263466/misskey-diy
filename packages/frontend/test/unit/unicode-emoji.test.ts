/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import * as mfm from 'mfm-js';
import Mfm from '@/components/global/MkMfm.js';
import { normalizeMfmUnicodeEmoji, splitUnicodeEmoji } from '@/utility/unicode-emoji.js';
import { formatCjkText } from '@/utility/cjk-text-spacing.js';

vi.mock('@/components/global/MkEmoji.vue', () => ({ default: { props: ['emoji'], template: '<img :alt="emoji"/>' } }));
vi.mock('@/components/MkLink.vue', () => ({ default: { props: ['url'], template: '<a :href="url"><slot/></a>' } }));
vi.mock('@/components/MkCodeInline.vue', () => ({ default: { props: ['code'], template: '<code>{{ code }}</code>' } }));
vi.mock('@/components/MkCode.vue', () => ({ default: { props: ['code'], template: '<pre><code>{{ code }}</code></pre>' } }));

describe('shared Unicode emoji parsing', () => {
	afterEach(cleanup);

	test.each(['🎉', '👍🏽', '👩🏽‍💻', '👩🏽‍🤝‍👨🏻', '🧑🏽‍🤝‍🧑🏽', '🇨🇳', '🏽', '1️⃣', '1⃣', '❤️', '👁️‍🗨️'])('recognizes the complete sequence %s', emoji => {
		expect(splitUnicodeEmoji(emoji)).toEqual([{ text: emoji, emoji: true }]);
	});

	test('preserves text presentation symbols, source syntax and every original character', () => {
		const text = '© ® ™ ❤︎ ☑︎ ↔︎ :custom: <plain> **中文**\r\n\t';
		expect(splitUnicodeEmoji(text)).toEqual([{ text, emoji: false }]);
		const withEmoji = `${text}©️ ❤ 🎉\ufe0f 👩🏽‍🤝‍👨🏻 👁️‍🗨️`;
		expect(splitUnicodeEmoji(withEmoji).map(part => part.text).join('')).toBe(withEmoji);
	});

	test('retains MFM handling for incomplete or unsupported joined sequences', () => {
		const text = '🧑🏾‍❤‍💋‍🧑🏻';
		const normalized = normalizeMfmUnicodeEmoji(mfm.parseSimple(text));
		expect(normalized).toEqual(mfm.parseSimple(text));
		expect(splitUnicodeEmoji(text).map(part => part.text).join('')).toBe(text);
	});

	test.each(['👍🏽', '👩🏽‍🤝‍👨🏻', '👁️‍🗨️'])('uses the same recognition for Chinese spacing around %s', emoji => {
		expect(formatCjkText(`中${emoji}文`).text).toBe(`中\u2009${emoji}\u2009文`);
		expect(formatCjkText('中©文❤︎中').text).toBe('中©文❤︎中');
	});

	test.each([false, true])('renders joined sequences consistently with the editor (plain=%s)', plain => {
		const text = '🎉 👩🏽‍🤝‍👨🏻 👁️‍🗨️ © ❤︎';
		const view = render(Mfm, { props: { text, plain } });
		const displayedEmoji = Array.from(view.container.querySelectorAll('img'), image => image.alt);
		expect(displayedEmoji).toEqual(splitUnicodeEmoji(text).filter(part => part.emoji).map(part => part.text));
		expect(view.container.textContent).toContain('© ❤︎');
	});

	test('does not cross formatting, literal text, code, or URL boundaries or mutate the caller AST', () => {
		const eye = '👁️‍🗨️';
		const nodes: mfm.MfmNode[] = [
			mfm.TEXT('literal 🎉'),
			mfm.PLAIN(eye),
			mfm.INLINE_CODE(eye),
			mfm.CODE_BLOCK(eye, 'text'),
			mfm.N_URL('https://example.test/👁️‍🗨️'),
			mfm.LINK(false, 'https://example.test/👁️‍🗨️', mfm.parseSimple(eye)),
			mfm.BOLD(mfm.parseSimple(eye)),
			mfm.UNI_EMOJI('👁️'),
			mfm.BOLD([mfm.TEXT('\u200d')]),
			mfm.UNI_EMOJI('🗨️'),
		];
		const snapshot = structuredClone(nodes);
		const normalized = normalizeMfmUnicodeEmoji(nodes);
		expect(nodes).toEqual(snapshot);
		expect(normalized.slice(0, 5)).toEqual(snapshot.slice(0, 5));
		expect(normalized[5]).toEqual({ ...snapshot[5], children: [mfm.UNI_EMOJI(eye)] });
		expect(normalized[6]).toEqual(mfm.BOLD([mfm.UNI_EMOJI(eye)]));
		expect(normalized.slice(7)).toEqual(snapshot.slice(7));
	});

	test('keeps actual MFM code and plain blocks literal while repairing ordinary content', () => {
		const eye = '👁️‍🗨️';
		const text = `${eye}\n\`${eye}\`\n\`\`\`\n${eye}\n\`\`\`\n<plain>${eye}</plain>`;
		const view = render(Mfm, { props: { text } });
		expect(Array.from(view.container.querySelectorAll('img'), image => image.alt)).toEqual([eye]);
		expect(Array.from(view.container.querySelectorAll('code'), code => code.textContent)).toEqual([eye, eye]);
		expect(view.container.textContent).toContain(eye);
	});
});
