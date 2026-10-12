/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import * as mfm from 'mfm-js';
import { MFM_TAGS } from '@@/js/const.js';
import Mfm from '@/components/global/MkMfm.js';
import { prefer } from '@/preferences.js';

vi.mock('@/preferences.js', async () => {
	const { reactive } = await import('vue');
	return { prefer: { s: reactive({ advancedMfm: true, animatedMfm: true }) } };
});
vi.mock('@/router.js', () => ({ useRouter: vi.fn() }));
vi.mock('@/components/global/MkEmoji.vue', () => ({ default: { props: ['emoji'], template: '<img :alt="emoji"/>' } }));
vi.mock('@/components/global/MkCustomEmoji.vue', () => ({ default: { props: ['name', 'useOriginalSize'], template: '<img :alt="name" :data-original-size="useOriginalSize"/>' } }));
vi.mock('@/components/MkLink.vue', () => ({ default: { props: ['url'], template: '<a :href="url"><slot/></a>' } }));
vi.mock('@/components/global/MkUrl.vue', () => ({ default: { props: ['url'], template: '<a :href="url">{{ url }}</a>' } }));
vi.mock('@/components/global/MkTime.vue', () => ({ default: { props: ['time', 'mode'], template: '<time :data-time="time" :data-mode="mode">Timestamp</time>' } }));
vi.mock('@/components/MkCodeInline.vue', () => ({ default: { props: ['code'], template: '<code>{{ code }}</code>' } }));
vi.mock('@/components/MkCode.vue', () => ({ default: { props: ['code'], template: '<pre><code>{{ code }}</code></pre>' } }));
vi.mock('@/components/MkMention.vue', () => ({ default: { props: ['username'], template: '<span>@{{ username }}</span>' } }));
vi.mock('@/components/MkSparkle.vue', () => ({ default: { template: '<span data-sparkle><slot/></span>' } }));
vi.mock('@/components/MkGoogle.vue', () => ({ default: { props: ['q'], template: '<span>{{ q }}</span>' } }));

const sources: Record<string, string> = Object.fromEntries(MFM_TAGS.map(tag => [tag, `$[${tag} **Payload** :party:]`]));
sources.font = '$[font.monospace **Payload** :party:]';
sources.ruby = '$[ruby **Payload** reading]';
sources.unixtime = '$[unixtime 1700000000]';

function effect(text: string) {
	const view = render(Mfm, { props: { text } });
	return { ...view, element: view.container.querySelector<HTMLElement>('._mfm > span')! };
}

describe('public MFM effects from source to DOM', () => {
	beforeEach(() => {
		prefer.s.advancedMfm = true;
		prefer.s.animatedMfm = true;
	});
	afterEach(cleanup);

	test.each(MFM_TAGS)('recognizes %s and preserves its formatted content', tag => {
		const source = sources[tag];
		expect(mfm.parse(source)[0]).toMatchObject({ type: 'fn', props: { name: tag } });
		const view = effect(source);
		expect(view.container.textContent).not.toContain('$[');
		if (tag === 'unixtime') {
			expect(view.container.querySelector('time')?.dataset).toMatchObject({ time: '1700000000000', mode: 'detail' });
		} else {
			expect(view.container.querySelector('b')?.textContent).toBe('Payload');
			if (tag === 'ruby') expect(view.container.querySelector('rt')?.textContent).toBe('reading');
			else expect(view.getByRole('img', { name: 'party' })).toBeTruthy();
		}
	});

	test.each(['tada', 'jelly', 'twitch', 'shake', 'spin', 'jump', 'bounce', 'rainbow'])('uses speed and delay independently for %s', tag => {
		const { element } = effect(`$[${tag}.speed=2.5s,delay=-0.75s Payload]`);
		expect(element.style.animation).toContain(' 2.5s ');
		expect(element.style.animationDelay).toBe('-0.75s');
		expect(element.style.animation).toContain('infinite');
	});

	test.each([
		['left,x', 'mfm-spinX', 'reverse'],
		['alternate,y', 'mfm-spinY', 'alternate'],
		['left', 'mfm-spin', 'reverse'],
		['alternate', 'mfm-spin', 'alternate'],
	])('combines spin direction and axis (%s)', (params, animation, direction) => {
		const { element } = effect(`$[spin.${params} Payload]`);
		expect(element.style.animation).toContain(`${animation} `);
		expect(element.style.animationDirection).toBe(direction);
	});

	test.each([['h', 'scaleX(-1)'], ['v', 'scaleY(-1)'], ['h,v', 'scale(-1, -1)']])('flips the requested axes (%s)', (params, transform) => {
		expect(effect(`$[flip.${params} Payload]`).element.style.transform).toBe(transform);
	});

	test.each(['serif', 'monospace', 'cursive', 'fantasy', 'emoji', 'math'])('selects the %s generic font', font => {
		expect(effect(`$[font.${font} Payload]`).element.style.fontFamily).toBe(font);
	});

	test('positions and rotates formatted content without changing the source', () => {
		const source = '$[position.x=-1.5,y=2 $[rotate.deg=-45 **Payload**]]';
		const nodes = mfm.parse(source);
		const snapshot = structuredClone(nodes);
		const view = render(Mfm, { props: { text: source, parsedNodes: nodes } });
		const outer = view.container.querySelector<HTMLElement>('._mfm > span')!;
		expect(outer.style.transform).toBe('translateX(-1.5em) translateY(2em)');
		expect((outer.firstElementChild as HTMLElement).style.transform).toBe('rotate(-45deg)');
		expect(view.container.querySelector('b')?.textContent).toBe('Payload');
		expect(nodes).toEqual(snapshot);
	});

	test('caps scaling and keeps original emoji sizing inside the affected branch', () => {
		const view = effect('$[scale.x=8,y=3 :party:] :party: $[x4 :party:] :party:');
		expect(view.element.style.transform).toBe('scale(5, 3)');
		expect(Array.from(view.container.querySelectorAll('img'), image => image.dataset.originalSize)).toEqual(['true', 'false', 'true', 'false']);
	});

	test('applies independent foreground, background and border parameters', () => {
		const view = effect('$[border.width=3,style=dashed,color=369,radius=8,noclip $[bg.color=abcdef $[fg.color=123 Payload]]]');
		expect(view.element.style.borderWidth).toBe('3px');
		expect(view.element.style.borderStyle).toBe('dashed');
		expect(view.element.style.borderColor).toBe('#369');
		expect(view.element.style.borderRadius).toBe('8px');
		expect(view.element.style.overflow).toBe('');
		const background = view.element.firstElementChild as HTMLElement;
		expect(background.style.backgroundColor).toBe('#abcdef');
		expect((background.firstElementChild as HTMLElement).style.color).toBe('#123');
	});

	test('keeps border clipping enabled unless noclip is requested', () => {
		expect(effect('$[border Payload]').element.style.overflow).toBe('clip');
	});

	test('uses safe defaults for malformed parameters without adding CSS declarations', () => {
		const animation = effect('$[spin.speed=invalid,delay=invalid Payload]').element;
		expect(animation.style.animation).toContain(' 1.5s ');
		expect(animation.style.animationDelay).toBe('0s');
		const border = effect('$[border.width=bad,radius=bad,style=bad,color=bad-color Payload]').element;
		expect(border.style.border).toContain('1px solid');
		expect(border.style.borderRadius).toBe('0px');
		expect(effect('$[fg.color=red Payload]').element.style.color).toBe('#f00');
		expect(effect('$[bg.color=red Payload]').element.style.backgroundColor).toBe('#f00');
		expect(effect('$[scale.x=bad,y=bad Payload]').element.style.transform).toBe('scale(1, 1)');
		expect(effect('$[rotate.deg=bad Payload]').element.style.transform).toBe('rotate(90deg)');
		expect(effect('$[position.x=bad,y=bad Payload]').element.style.transform).toBe('translateX(0em) translateY(0em)');
		const injectedSource = '$[fg.color=f00;background=blue Payload]';
		const rejected = effect(injectedSource);
		expect(rejected.container.textContent).toBe(injectedSource);
		expect(rejected.container.querySelector('[style*="background"]')).toBeNull();
	});

	test('updates advanced and animated preferences without losing text or link targets', async () => {
		const text = '$[spin [Payload](https://example.test)] $[sparkle **Sparkle**] $[x2 Double] $[x3 Triple] $[x4 Quadruple] $[scale.x=2 Scaled] $[rainbow Rainbow]';
		const view = effect(text);
		expect(view.container.querySelector('[data-sparkle]')).not.toBeNull();
		expect(view.element.style.animation).toContain('mfm-spin ');
		prefer.s.animatedMfm = false;
		await nextTick();
		expect(view.container.querySelector('[data-sparkle]')).toBeNull();
		expect(view.container.querySelector<HTMLElement>('._mfm > span')!.style.animationName).toBe('');
		expect(view.container.querySelectorAll('.mfm-x2, .mfm-x3, .mfm-x4')).toHaveLength(3);
		expect(view.container.querySelector('._mfmRainbow')?.textContent).toBe('Rainbow');
		prefer.s.advancedMfm = false;
		prefer.s.animatedMfm = true;
		await nextTick();
		expect(view.container.querySelectorAll('.mfm-x2, .mfm-x3, .mfm-x4')).toHaveLength(0);
		expect(view.container.querySelector('[style*="animation"]')).toBeNull();
		expect(view.container.querySelector('[style*="scale("]')).toBeNull();
		expect(view.getByRole('link').getAttribute('href')).toBe('https://example.test');
		expect(view.container.textContent).toContain('Sparkle');
	});

	test('plain previews and code literals do not activate effects', () => {
		const source = '$[rainbow Payload] $[sparkle Sparkle] $[x4 Large]';
		const view = render(Mfm, { props: { text: source, plain: true } });
		expect(view.container.textContent).toBe(source);
		expect(view.container.querySelector('._mfmRainbow, [data-sparkle], .mfm-x4')).toBeNull();
		const code = effect('`$[spin Payload]`');
		expect(code.container.querySelector('code')?.textContent).toBe('$[spin Payload]');
		expect(code.container.querySelector('[style*="animation"]')).toBeNull();
	});

	test.each(['x2', 'x3', 'x4'])('keeps emoji sizing ordinary when advanced effects are disabled (%s)', tag => {
		prefer.s.advancedMfm = false;
		const view = effect(`$[${tag} :party:]`);
		expect(view.container.querySelector(`.mfm-${tag}`)).toBeNull();
		expect(view.getByRole('img').dataset.originalSize).toBe('false');
	});
});
