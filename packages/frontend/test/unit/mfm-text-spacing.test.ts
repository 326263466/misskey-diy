/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import * as mfm from 'mfm-js';
import Mfm from '@/components/global/MkMfm.js';
import { spaceMfmText } from '@/utility/mfm-text-spacing.js';

vi.mock('@/components/global/MkEmoji.vue', () => ({ default: { props: ['emoji'], template: '<img :alt="emoji"/>' } }));
vi.mock('@/components/global/MkCustomEmoji.vue', () => ({ default: { props: ['name'], template: '<img :alt="name"/>' } }));
vi.mock('@/components/MkLink.vue', () => ({ default: { props: ['url'], template: '<a :href="url"><slot/></a>' } }));
vi.mock('@/components/global/MkUrl.vue', () => ({ default: { props: ['url'], template: '<a :href="url">{{ url }}</a>' } }));
vi.mock('@/components/MkCodeInline.vue', () => ({ default: { props: ['code'], template: '<code>{{ code }}</code>' } }));
vi.mock('@/components/MkCode.vue', () => ({ default: { props: ['code'], template: '<pre><code>{{ code }}</code></pre>' } }));
vi.mock('@/components/MkMention.vue', () => ({ default: { props: ['username'], template: '<span>@{{ username }}</span>' } }));
vi.mock('@/components/MkSparkle.vue', () => ({ default: { template: '<span><slot/></span>' } }));
vi.mock('@/components/MkGoogle.vue', () => ({ default: { props: ['q'], template: '<span>{{ q }}</span>' } }));

function displayedText(node: Node): string {
	if (node instanceof HTMLImageElement) return node.alt;
	if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
	return Array.from(node.childNodes, displayedText).join('');
}

describe('MFM Chinese mixed text spacing', () => {
	afterEach(cleanup);

	test.each([false, true])('applies to ordinary MFM and plain previews (plain=%s)', plain => {
		const view = render(Mfm, { props: { text: '中文ABC123中文', plain } });
		expect(view.container.textContent).toBe('中文\u2009ABC123\u2009中文');
		expect((view.container.firstElementChild as HTMLElement).style.getPropertyValue('text-autospace')).toBe('no-autospace');
	});

	test.each(['😀', '👨‍👩‍👧‍👦', '🇨🇳'])('spaces both sides of a Chinese/emoji boundary: %s', emoji => {
		const view = render(Mfm, { props: { text: `中${emoji}文` } });
		expect(view.getByRole('img', { name: emoji })).toBeTruthy();
		expect(displayedText(view.container)).toBe(`中\u2009${emoji}\u2009文`);
	});

	test('spaces custom emoji and preserves its lookup name', () => {
		const view = render(Mfm, { props: { text: '中:cat:文' } });
		expect(view.getByRole('img', { name: 'cat' })).toBeTruthy();
		expect(displayedText(view.container)).toBe('中\u2009cat\u2009文');
	});

	test('handles formatting boundaries without adding spaces inside Latin or emoji runs', () => {
		const view = render(Mfm, { props: { text: '中**A1😀**文' } });
		const bold = view.container.querySelector('b')!;
		expect(displayedText(view.container)).toBe('中\u2009A1😀\u2009文');
		expect(bold.textContent).toBe('A1');
		expect(bold.querySelector('img')?.previousSibling?.textContent).toBe('A1');
	});

	test('formats link labels while preserving target URLs', () => {
		const url = 'https://example.test/%E4%B8%AD%E6%96%87ABC';
		const view = render(Mfm, { props: { text: `[中文ABC](${url})中文` } });
		const link = view.getByRole('link');
		expect(link.getAttribute('href')).toBe(url);
		expect(link.textContent).toBe('中文\u2009ABC');
		expect(view.container.textContent).toBe('中文\u2009ABC\u2009中文');
	});

	test('keeps bare URLs and code exactly as written', () => {
		const url = 'https://example.test/%E4%B8%AD%E6%96%87ABC';
		const view = render(Mfm, { props: { text: `${url}\n\`中文ABC😀\`\n\`\`\`\n中文ABC😀\n\`\`\`` } });
		expect(view.getByRole('link').getAttribute('href')).toBe(url);
		expect(view.getByRole('link').textContent).toBe(url);
		for (const code of view.container.querySelectorAll('code')) expect(code.textContent).toBe('中文ABC😀');
	});

	test('respects whitespace, punctuation and paragraph boundaries', () => {
		const source = '中文 ABC\n\n> ABC\n\n中文，ABC　中文\u2009😀';
		const parsed = mfm.parse(source);
		expect(spaceMfmText(parsed)).toEqual(parsed);
	});

	test('does not mutate the supplied source or parsed tree', () => {
		const source = '中**ABC😀**文';
		const parsedNodes = mfm.parse(source);
		const snapshot = structuredClone(parsedNodes);
		render(Mfm, { props: { text: source, parsedNodes } });
		expect(parsedNodes).toEqual(snapshot);
		expect(mfm.toString(parsedNodes)).toBe(source);
	});
});
