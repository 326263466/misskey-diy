/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { createApp, defineComponent, h, nextTick, shallowRef } from 'vue';
import type { App } from 'vue';
import '@/style.scss';
import '@tabler/icons-webfont/dist/tabler-icons.css';
import JuejinFloatingActions from '@/ui/_common_/juejin-floating-actions.vue';
import { openInstanceMenu } from '@/ui/_common_/common.js';

const { instance, preferences, routerState } = vi.hoisted(() => ({
	instance: {
		feedbackUrl: null as string | null,
		inquiryUrl: null as string | null,
	},
	preferences: { s: { animation: true } },
	routerState: { path: '/' },
}));

vi.mock('@/instance.js', () => ({ instance }));
vi.mock('@/router.js', () => ({ mainRouter: { getCurrentFullPath: () => routerState.path } }));
vi.mock('@/preferences.js', () => ({ prefer: preferences }));
vi.mock('@/ui/_common_/common.js', () => ({ openInstanceMenu: vi.fn() }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { backToTop: '返回顶部', feedback: '反馈', more: '更多' } } }));

const fixtures: { app: App; host: HTMLElement }[] = [];

async function nextFrame() {
	await nextTick();
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
	await nextTick();
}

function mockReducedMotion(reduced: boolean) {
	if (vi.isMockFunction(window.matchMedia)) vi.mocked(window.matchMedia).mockRestore();
	const matchMedia = window.matchMedia.bind(window);
	vi.spyOn(window, 'matchMedia').mockImplementation(query => {
		const media = matchMedia(query);
		if (query === '(prefers-reduced-motion: reduce)') Object.defineProperty(media, 'matches', { value: reduced, configurable: true });
		return media;
	});
}

function recordScrollFrames(container: HTMLElement) {
	const positions: number[] = [];
	let frame: number;
	const sample = () => {
		positions.push(container.scrollTop);
		frame = requestAnimationFrame(sample);
	};
	frame = requestAnimationFrame(sample);
	return { positions, stop: () => cancelAnimationFrame(frame) };
}

async function waitForAnimationWindow() {
	const startedAt = performance.now();
	do {
		await nextFrame();
	} while (performance.now() - startedAt < 650);
}

function element(className: string, style: string, parent: HTMLElement) {
	const result = document.createElement('div');
	result.className = className;
	result.style.cssText = style;
	parent.append(result);
	return result;
}

function addPage(parent: HTMLElement, path?: string, reversed = false) {
	const root = element('_pageContainer', 'height:100%;', parent);
	if (path) root.dataset.pagePath = path;
	const scroller = element(reversed ? '_pageScrollableReversed' : '_pageScrollable', 'height:100%;', root);
	const body = element('', 'height:1600px;flex-shrink:0;', scroller);
	body.dataset.pageBody = '';
	return { root, scroller, body };
}

async function mountActions(prepare: (content: HTMLElement) => void = () => {}) {
	const host = document.createElement('div');
	host.style.cssText = 'margin:16px;--MI_THEME-panel:#fff;--MI_THEME-fgTransparentWeak:#666;--MI_THEME-accent:#1677ff;';
	document.body.append(host);
	const content = element('', 'width:620px;height:320px;overflow:clip;position:relative;', host);
	prepare(content);
	const currentContent = shallowRef<HTMLElement | null>(content);
	const mount = element('', '', host);
	const app = createApp({ render: () => h(JuejinFloatingActions, { content: currentContent.value }) });
	app.directive('tooltip', () => {});
	app.component('MkA', defineComponent({
		props: { to: { type: String, required: true } },
		setup: (props, { slots }) => () => h('a', { href: props.to }, slots.default?.()),
	}));
	app.mount(mount);
	fixtures.push({ app, host });
	await nextFrame();
	await nextFrame();
	return {
		host, content, currentContent,
		backButton: () => host.querySelector<HTMLButtonElement>('button[aria-label="返回顶部"]'),
	};
}

beforeEach(async () => {
	vi.clearAllMocks();
	instance.feedbackUrl = null;
	instance.inquiryUrl = null;
	preferences.s.animation = true;
	routerState.path = '/';
	await page.viewport(900, 700);
	window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
});

afterEach(async () => {
	for (const { app, host } of fixtures.splice(0)) {
		app.unmount();
		host.remove();
	}
	await nextFrame();
	vi.restoreAllMocks();
});

describe('Juejin floating actions', () => {
	test('animates return-to-top with the default in-app motion setting', async () => {
		let main!: ReturnType<typeof addPage>;
		const fixture = await mountActions(content => { main = addPage(content); });
		expect(fixture.backButton()).toBeNull();
		main.scroller.scrollTo({ top: 650, behavior: 'instant' });
		await expect.poll(() => fixture.backButton()).not.toBeNull();
		expect(main.scroller.scrollTop).toBe(650);
		expect(main.root.scrollTop).toBe(0);
		expect(window.scrollY).toBe(0);
		const recording = recordScrollFrames(main.scroller);
		try {
			await page.elementLocator(fixture.backButton()!).click();
			await expect.poll(() => main.scroller.scrollTop).toBe(0);
		} finally {
			recording.stop();
		}
		expect(new Set(recording.positions.filter(top => top > 0 && top < 650)).size).toBeGreaterThanOrEqual(3);
		await expect.poll(() => fixture.backButton()).toBeNull();
	});

	test.each([1, 4])('keeps animating after a long delay before animation frame %i', async delayedFrame => {
		let main!: ReturnType<typeof addPage>;
		const fixture = await mountActions(content => { main = addPage(content); });
		main.scroller.scrollTop = 900;
		await expect.poll(() => fixture.backButton()).not.toBeNull();
		const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
		let animationCallback: FrameRequestCallback | null = null;
		let animationFrameCount = 0;
		let delayTimer: number | null = null;
		let resumedAtPosition: number | null = null;
		let resumedAtSample = 0;
		let recording: ReturnType<typeof recordScrollFrames> | null = null;
		vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
			// Capture the loop initiated by the synchronous click below; leave observer
			// and sampling frames untouched so real intermediate scroll positions remain visible.
			animationCallback ??= callback;
			if (callback === animationCallback && ++animationFrameCount === delayedFrame) {
				return nativeRequestAnimationFrame(() => {
					delayTimer = window.setTimeout(() => {
						delayTimer = null;
						resumedAtPosition = main.scroller.scrollTop;
						resumedAtSample = recording?.positions.length ?? 0;
						callback(performance.now());
					}, 600);
				});
			}
			return nativeRequestAnimationFrame(callback);
		});
		try {
			fixture.backButton()!.click();
			recording = recordScrollFrames(main.scroller);
			await expect.poll(() => main.scroller.scrollTop, { timeout: 3000 }).toBe(0);
			expect(resumedAtPosition).not.toBeNull();
			expect(resumedAtPosition).toBeGreaterThan(0);
			const resumedPositions = recording.positions.slice(resumedAtSample);
			expect(new Set(resumedPositions.filter(top => top > 0 && top < resumedAtPosition!)).size).toBeGreaterThanOrEqual(3);
		} finally {
			recording?.stop();
			if (delayTimer !== null) window.clearTimeout(delayTimer);
		}
	});

	test('applies manual motion-switch changes in both directions without remounting', async () => {
		let main!: ReturnType<typeof addPage>;
		const fixture = await mountActions(content => { main = addPage(content); });
		preferences.s.animation = false;
		main.scroller.scrollTop = 650;
		await expect.poll(() => fixture.backButton()).not.toBeNull();
		const reducedRecording = recordScrollFrames(main.scroller);
		try {
			await page.elementLocator(fixture.backButton()!).click();
			expect(main.scroller.scrollTop).toBe(0);
			await nextFrame();
		} finally {
			reducedRecording.stop();
		}
		expect(reducedRecording.positions.some(top => top > 0 && top < 650)).toBe(false);

		preferences.s.animation = true;
		main.scroller.scrollTop = 650;
		await expect.poll(() => fixture.backButton()).not.toBeNull();
		const animatedRecording = recordScrollFrames(main.scroller);
		try {
			await page.elementLocator(fixture.backButton()!).click();
			await expect.poll(() => main.scroller.scrollTop).toBe(0);
		} finally {
			animatedRecording.stop();
		}
		expect(new Set(animatedRecording.positions.filter(top => top > 0 && top < 650)).size).toBeGreaterThanOrEqual(3);
	});

	test('uses the in-app animation switch when the operating system requests reduced motion', async () => {
		mockReducedMotion(true);
		expect(window.matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(true);
		let main!: ReturnType<typeof addPage>;
		const fixture = await mountActions(content => { main = addPage(content); });
		main.scroller.scrollTop = 650;
		await expect.poll(() => fixture.backButton()).not.toBeNull();
		const recording = recordScrollFrames(main.scroller);
		try {
			await page.elementLocator(fixture.backButton()!).click();
			await expect.poll(() => main.scroller.scrollTop).toBe(0);
		} finally {
			recording.stop();
		}
		expect(new Set(recording.positions.filter(top => top > 0 && top < 650)).size).toBeGreaterThanOrEqual(3);
	});

	test('stops an in-progress return when the user wheels in the main content', async () => {
		let main!: ReturnType<typeof addPage>;
		const fixture = await mountActions(content => { main = addPage(content); });
		main.scroller.scrollTop = 900;
		await expect.poll(() => fixture.backButton()).not.toBeNull();
		let interruptedAt: number | null = null;
		main.scroller.addEventListener('scroll', () => {
			const top = main.scroller.scrollTop;
			if (interruptedAt != null || top <= 0 || top >= 900) return;
			interruptedAt = top;
			main.body.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true }));
		});
		await page.elementLocator(fixture.backButton()!).click();
		await expect.poll(() => interruptedAt).not.toBeNull();
		await waitForAnimationWindow();
		expect(main.scroller.scrollTop).toBe(interruptedAt);
		expect(main.scroller.scrollTop).toBeGreaterThan(0);
	});

	test('stops moving a retained page when the active route changes during its animation', async () => {
		let stack!: HTMLElement;
		let first!: ReturnType<typeof addPage>;
		let second!: ReturnType<typeof addPage>;
		const fixture = await mountActions(content => {
			stack = element('', 'position:relative;height:100%;', content);
			stack.dataset.currentPage = '/first';
			first = addPage(stack, '/first');
			second = addPage(stack, '/second');
			second.root.style.cssText += 'position:absolute;inset:0;';
			first.scroller.scrollTop = 900;
			second.scroller.scrollTop = 500;
		});
		await expect.poll(() => fixture.backButton()).not.toBeNull();
		let switchedAt: number | null = null;
		first.scroller.addEventListener('scroll', () => {
			const top = first.scroller.scrollTop;
			if (switchedAt != null || top <= 0 || top >= 900) return;
			switchedAt = top;
			stack.dataset.currentPage = '/second';
		});
		await page.elementLocator(fixture.backButton()!).click();
		await expect.poll(() => switchedAt).not.toBeNull();
		await waitForAnimationWindow();
		expect(first.root.isConnected).toBe(true);
		expect(first.scroller.scrollTop).toBe(switchedAt);
		expect(first.scroller.scrollTop).toBeGreaterThan(0);
		expect(second.scroller.scrollTop).toBe(500);
	});

	test('preserves restored scroll when a settings subroute changes inside the same wide container', async () => {
		routerState.path = '/settings/profile';
		let layout!: HTMLElement;
		const fixture = await mountActions(content => {
			const root = element('_pageContainer', 'height:100%;', content);
			layout = element('_pageLayout _pageLayoutWithSidebar', '--MI-pageNavigationWidth:160px;--MI-pageGap:16px;--MI-pageSideInset:0px;', root);
			element('_pageNavigation', 'height:200px;', layout);
			const body = element('_pageContent _pageScrollable', '', layout);
			const text = element('', 'height:1600px;', body);
			text.dataset.pageBody = '';
			layout.scrollTop = 900;
		});
		await expect.poll(() => fixture.backButton()).not.toBeNull();
		let routeChanged = false;
		layout.addEventListener('scroll', () => {
			if (routeChanged || layout.scrollTop <= 0 || layout.scrollTop >= 900) return;
			routeChanged = true;
			routerState.path = '/settings/privacy';
			// Nested navigation reuses this element and restores the destination's position.
			layout.scrollTop = 500;
		});
		await page.elementLocator(fixture.backButton()!).click();
		await expect.poll(() => routeChanged).toBe(true);
		await waitForAnimationWindow();
		expect(layout.isConnected).toBe(true);
		expect(layout.scrollTop).toBe(500);
	});

	test('scrolls the wide-page wrapper while leaving its independently scrolled navigation alone', async () => {
		let layout!: HTMLElement;
		let navigation!: HTMLElement;
		let body!: HTMLElement;
		const fixture = await mountActions(content => {
			const root = element('_pageContainer', 'height:100%;', content);
			layout = element('_pageLayout _pageLayoutWithSidebar', '--MI-pageNavigationWidth:160px;--MI-pageGap:16px;--MI-pageSideInset:0px;', root);
			navigation = element('_pageNavigation', 'height:300px;', layout);
			element('', 'height:1000px;', navigation);
			body = element('_pageContent _pageScrollable', '', layout);
			const text = element('', 'height:1600px;', body);
			text.dataset.pageBody = '';
		});
		expect(getComputedStyle(body).overflowY).toBe('visible');
		navigation.scrollTop = 400;
		await nextFrame();
		await nextFrame();
		expect(navigation.scrollTop).toBe(400);
		expect(fixture.backButton()).toBeNull();
		layout.scrollTo({ top: 600, behavior: 'instant' });
		await expect.poll(() => fixture.backButton()).not.toBeNull();
		await page.elementLocator(fixture.backButton()!).click();
		await expect.poll(() => layout.scrollTop).toBe(0);
		expect(navigation.scrollTop).toBe(400);
	});

	test('returns the navigation-only settings or admin index to the top on a narrow desktop layout', async () => {
		await page.viewport(550, 700);
		let navigation!: HTMLElement;
		const fixture = await mountActions(content => {
			content.style.width = 'calc(100vw - 32px)';
			const root = element('_pageContainer', 'height:100%;', content);
			const layout = element('_pageLayout', '--MI-pageGap:16px;--MI-pageSideInset:0px;', root);
			navigation = element('_pageNavigation', '', layout);
			element('', 'height:1600px;', navigation);
		});
		expect(fixture.content.clientWidth).toBe(518);
		expect(fixture.content.querySelector('._pageContent')).toBeNull();
		expect(fixture.backButton()).toBeNull();
		navigation.scrollTo({ top: 650, behavior: 'instant' });
		await expect.poll(() => fixture.backButton()).not.toBeNull();
		expect(navigation.scrollTop).toBe(650);
		await page.elementLocator(fixture.backButton()!).click();
		await expect.poll(() => navigation.scrollTop).toBe(0);
		await expect.poll(() => fixture.backButton()).toBeNull();
	});

	test('ignores nested editors and sidebars outside the supplied main content', async () => {
		let main!: ReturnType<typeof addPage>;
		let editor!: HTMLTextAreaElement;
		const fixture = await mountActions(content => {
			main = addPage(content);
			editor = document.createElement('textarea');
			editor.style.cssText = 'height:100px;width:200px;overflow-y:auto;';
			editor.value = 'Editor line\n'.repeat(100);
			main.body.prepend(editor);
		});
		const sidebar = element('', 'position:absolute;left:660px;top:16px;height:300px;width:100px;overflow-y:auto;', fixture.host);
		element('', 'height:1200px;', sidebar);
		editor.scrollTop = 500;
		sidebar.scrollTop = 500;
		await nextFrame();
		await nextFrame();
		expect(editor.scrollTop).toBe(500);
		expect(sidebar.scrollTop).toBe(500);
		expect(fixture.backButton()).toBeNull();
		main.scroller.scrollTop = 700;
		await expect.poll(() => fixture.backButton()).not.toBeNull();
		await page.elementLocator(fixture.backButton()!).click();
		await expect.poll(() => main.scroller.scrollTop).toBe(0);
		expect(editor.scrollTop).toBe(500);
		expect(sidebar.scrollTop).toBe(500);
	});

	test('follows the current stacked route while the outgoing page remains mounted', async () => {
		let stack!: HTMLElement;
		let first!: ReturnType<typeof addPage>;
		let second!: ReturnType<typeof addPage>;
		const fixture = await mountActions(content => {
			stack = element('', 'position:relative;height:100%;', content);
			stack.dataset.currentPage = '/first';
			first = addPage(stack, '/first');
			second = addPage(stack, '/second');
			second.root.style.cssText += 'position:absolute;inset:0;';
			first.scroller.scrollTop = 650;
		});
		await expect.poll(() => fixture.backButton()).not.toBeNull();
		stack.dataset.currentPage = '/second';
		await expect.poll(() => fixture.backButton()).toBeNull();
		second.scroller.scrollTop = 500;
		await expect.poll(() => fixture.backButton()).not.toBeNull();
		stack.dataset.currentPage = '/first';
		await nextFrame();
		await nextFrame();
		// A leaving TransitionGroup tab still exists and has nonzero scrollTop here.
		expect(second.root.isConnected).toBe(true);
		await page.elementLocator(fixture.backButton()!).click();
		await expect.poll(() => first.scroller.scrollTop).toBe(0);
		expect(second.scroller.scrollTop).toBe(500);
		await expect.poll(() => fixture.backButton()).toBeNull();
	});

	test('observes restored scroll positions and replaces the content scope when the layout remounts', async () => {
		let first!: ReturnType<typeof addPage>;
		const fixture = await mountActions(content => { first = addPage(content); });
		// KeepAlive restores scroll after activation, without a router event.
		first.scroller.scrollTop = 700;
		await expect.poll(() => fixture.backButton()).not.toBeNull();
		const replacement = element('', 'width:620px;height:320px;overflow:clip;', fixture.host);
		const second = addPage(replacement);
		fixture.currentContent.value = replacement;
		await expect.poll(() => fixture.backButton()).toBeNull();
		first.scroller.scrollTop = 800;
		await nextFrame();
		await nextFrame();
		expect(fixture.backButton()).toBeNull();
		second.scroller.scrollTop = 450;
		await expect.poll(() => fixture.backButton()).not.toBeNull();
		await page.elementLocator(fixture.backButton()!).click();
		await expect.poll(() => second.scroller.scrollTop).toBe(0);
		expect(first.scroller.scrollTop).toBe(800);
	});

	test('returns reversed chat content to its visual top', async () => {
		let main!: ReturnType<typeof addPage>;
		const fixture = await mountActions(content => { main = addPage(content, undefined, true); });
		expect(main.scroller.scrollTop).toBe(0);
		await expect.poll(() => fixture.backButton()).not.toBeNull();
		await page.elementLocator(fixture.backButton()!).click();
		await expect.poll(() => main.scroller.scrollTop).toBe(main.scroller.clientHeight - main.scroller.scrollHeight);
		await expect.poll(() => fixture.backButton()).toBeNull();
	});

	test.each([
		{ feedback: 'https://feedback.example.test/form', inquiry: 'https://contact.example.test/', expected: 'https://feedback.example.test/form', external: true },
		{ feedback: null, inquiry: 'https://contact.example.test/', expected: 'https://contact.example.test/', external: true },
		{ feedback: null, inquiry: null, expected: '/contact', external: false },
	])('provides the configured feedback destination $expected', async ({ feedback, inquiry, expected, external }) => {
		instance.feedbackUrl = feedback;
		instance.inquiryUrl = inquiry;
		const fixture = await mountActions();
		const anchor = fixture.host.querySelector<HTMLAnchorElement>('a[aria-label="反馈"]')!;
		expect(anchor.getAttribute('href')).toBe(expected);
		if (external) {
			expect(anchor.target).toBe('_blank');
			expect(anchor.relList.contains('noopener')).toBe(true);
			expect(anchor.relList.contains('noreferrer')).toBe(true);
		}
	});

	test('opens the existing instance menu from the more button with keyboard activation', async () => {
		const fixture = await mountActions();
		const more = fixture.host.querySelector<HTMLButtonElement>('button[aria-label="更多"]')!;
		expect(more.getAttribute('aria-haspopup')).toBe('menu');
		more.focus();
		await userEvent.keyboard('{Enter}');
		expect(openInstanceMenu).toHaveBeenCalledOnce();
		expect(vi.mocked(openInstanceMenu).mock.calls[0][0].target).toBe(more);
	});
});
