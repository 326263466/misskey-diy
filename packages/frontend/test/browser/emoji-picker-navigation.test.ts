/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { createApp, h, nextTick, reactive, shallowRef, toHandlers } from 'vue';
import { emojilist } from '@@/js/emojilist.js';
import type { App, VNode } from 'vue';
import '@/style.scss';
import 'virtual:tabler-icons.css';
import { tooltipDirective } from '@/directives/tooltip.js';

vi.mock('misskey-js', () => ({}));
vi.mock('@/preferences.js', async () => {
	const { reactive, ref } = await import('vue');
	return {
		prefer: {
			s: reactive({ emojiStyle: 'twemoji', animation: true, emojiPickerStyle: 'popup' }),
			r: { emojiPickerScale: ref(2), emojiPickerWidth: ref(2), emojiPickerHeight: ref(2) },
		},
	};
});
vi.mock('@/store.js', async () => {
	const { ref } = await import('vue');
	const recents = ref(['🍲', '🥗', '😬']);
	return { store: { r: { recentlyUsedEmojis: recents }, s: { get recentlyUsedEmojis() { return recents.value; }, additionalUnicodeEmojiIndexes: {} }, set: vi.fn() } };
});
vi.mock('@/custom-emojis.js', async () => {
	const { ref } = await import('vue');
	return { customEmojiCategories: ref([]), customEmojis: ref([]), customEmojisMap: new Map() };
});
vi.mock('@/i.js', () => ({ $i: { id: 'viewer' } }));
vi.mock('@/router.js', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/os.js', () => ({ claimZIndex: () => 1000, popup: vi.fn(() => ({ dispose: vi.fn() })), alert: vi.fn(), confirm: vi.fn(), popupMenu: vi.fn() }));
vi.mock('@/utility/haptic.js', () => ({ haptic: vi.fn() }));
vi.mock('@/utility/touch.js', () => ({ isTouchUsing: false }));
vi.mock('@/utility/device-kind.js', () => ({ deviceKind: 'desktop' }));
vi.mock('@/utility/check-reaction-permissions.js', () => ({ checkReactionPermissions: () => true }));
vi.mock('@/utility/emoji-mute.js', async () => {
	const { ref } = await import('vue');
	return { checkMuted: () => ref(false), mute: vi.fn(), unmute: vi.fn() };
});
vi.mock('@/utility/copy-to-clipboard.js', () => ({ copyToClipboard: vi.fn() }));
vi.mock('@/utility/emoji-palette.js', () => ({ addToEmojiPalette: vi.fn() }));
vi.mock('@/components/MkRippleEffect.vue', () => ({ default: { render: () => null } }));
vi.mock('@/i18n.js', () => ({
	i18n: {
		ts: {
			search: '搜索', category: '分类', recentUsed: '最近使用', customEmojis: '自定义 Emoji', emoji: 'Emoji',
			other: '其他', notFound: '未找到', nothing: '无', settings: '设置',
			_emojiCategories: { face: '表情与情感', people: '人物与身体', animals_and_nature: '动物与自然', food_and_drink: '食物与饮料', activity: '活动', travel_and_places: '旅行与地点', objects: '物品', symbols: '符号', flags: '旗帜' },
		},
		tsx: {},
	},
}));

const { default: MkEmojiPicker } = await import('@/components/MkEmojiPicker.vue');
const { default: MkEmojiPickerDialog } = await import('@/components/MkEmojiPickerDialog.vue');
const { reactionPicker } = await import('@/utility/reaction-picker.js');
const { popup } = await import('@/os.js');
const { store } = await import('@/store.js');
const fixtures: { app: App; host: HTMLElement }[] = [];

async function settle() {
	await nextTick();
	await new Promise(r => requestAnimationFrame(() => r(null)));
	await nextTick();
}

async function mountPicker(asDrawer = false, withTooltip = false) {
	const host = document.createElement('div');
	host.id = `emoji-picker-fixture-${fixtures.length}`;
	host.style.cssText = asDrawer ? 'width:360px;height:420px;display:flex;flex-direction:column;' : 'display:inline-block;';
	host.className = '_popup';
	document.body.append(host);
	const chosen = vi.fn();
	const app = createApp({ render: () => h(MkEmojiPicker, { asDrawer, showPinned: false, onChosen: chosen }) });
	app.component('MkEmoji', { props: { emoji: String }, setup: (props: { emoji?: string }) => () => h('span', props.emoji) });
	app.component('MkCustomEmoji', { render: () => null });
	app.directive('tooltip', withTooltip ? tooltipDirective : {});
	app.directive('panel', {});
	app.mount(host);
	fixtures.push({ app, host });
	await settle();
	const root = host.querySelector<HTMLElement>('.omfetrab')!;
	const toolbar = root.querySelector<HTMLElement>('.toolbar')!;
	const pane = root.querySelector<HTMLElement>('.emojis')!;
	return { host, root, toolbar, pane, chosen };
}

function scrollToGroup(pane: HTMLElement, group: string) {
	const section = pane.querySelector<HTMLElement>(`[data-emoji-category-group="${group}"]`)!;
	pane.scrollTop += section.getBoundingClientRect().top - pane.getBoundingClientRect().top + 40;
	pane.dispatchEvent(new Event('scroll'));
}

afterEach(() => {
	for (const { app, host } of fixtures.splice(0)) {
		app.unmount();
		host.remove();
	}
	store.r.recentlyUsedEmojis.value = ['🍲', '🥗', '😬'];
	vi.mocked(popup).mockReset();
});

describe('emoji picker category navigation', () => {
	test.each(['toggle', 'backdrop', 'escape'])('回应选择器关闭后保持阅读位置且可再次打开：%s', async action => {
		const host = document.createElement('div');
		const scroller = document.createElement('div');
		scroller.style.cssText = 'position:fixed;left:20px;top:20px;width:600px;max-width:calc(100vw - 40px);height:calc(100vh - 40px);overflow:auto;';
		const content = document.createElement('div');
		content.style.cssText = 'height:2200px;padding-top:1200px;box-sizing:border-box;';
		const anchor = document.createElement('button');
		anchor.textContent = '添加回应';
		anchor.style.cssText = 'width:100px;height:40px;';
		content.append(anchor);
		scroller.append(content);
		const mountPoint = document.createElement('div');
		host.append(scroller, mountPoint);
		document.body.append(host);
		const dialogs = shallowRef<(() => VNode)[]>([]);
		let nextId = 0;
		vi.mocked(popup).mockImplementation((component, props, events = {}) => {
			const key = ++nextId;
			const render = () => h(component, { ...reactive(props), ...toHandlers(events), key });
			dialogs.value = [...dialogs.value, render];
			return { dispose: () => { void nextTick(() => { dialogs.value = dialogs.value.filter(dialog => dialog !== render); }); } };
		});
		const app = createApp({ render: () => h('div', dialogs.value.map(render => render())) });
		app.component('MkEmoji', { props: { emoji: String }, setup: (props: { emoji?: string }) => () => h('span', props.emoji) });
		app.component('MkCustomEmoji', { render: () => null });
		app.directive('tooltip', {});
		app.mount(mountPoint);
		fixtures.push({ app, host });
		const closed = vi.fn(() => anchor.focus({ preventScroll: true }));
		anchor.addEventListener('click', () => reactionPicker.show(anchor, null, undefined, closed));
		scroller.scrollTop = 1200 - (scroller.clientHeight - 80);
		const scrollTop = scroller.scrollTop;
		const anchorTop = anchor.getBoundingClientRect().top;
		await page.elementLocator(anchor).click();
		await expect.poll(() => host.querySelectorAll('.omfetrab').length).toBe(1);
		await settle();
		expect(scroller.scrollTop).toBe(scrollTop);
		expect(anchor.getBoundingClientRect().top).toBeCloseTo(anchorTop, 1);

		if (action === 'toggle') {
			// 入口连续触发，包括关闭动画期间，不应新建选择器。
			anchor.click();
			anchor.click();
		} else if (action === 'backdrop') {
			const backdrop = host.querySelector<HTMLElement>('._modalBg')!;
			const bounds = backdrop.getBoundingClientRect();
			const anchorBounds = anchor.getBoundingClientRect();
			await page.elementLocator(backdrop).click({ position: { x: anchorBounds.left + anchorBounds.width / 2 - bounds.left, y: anchorBounds.top + anchorBounds.height / 2 - bounds.top } });
		} else {
			await userEvent.keyboard('{Escape}');
		}
		await expect.poll(() => host.querySelector('.omfetrab')).toBeNull();
		expect(popup).toHaveBeenCalledOnce();
		expect(closed).toHaveBeenCalledOnce();
		expect(document.activeElement).toBe(anchor);
		expect(scroller.scrollTop).toBe(scrollTop);
		expect(anchor.getBoundingClientRect().top).toBeCloseTo(anchorTop, 1);

		await page.elementLocator(anchor).click();
		await expect.poll(() => host.querySelectorAll('.omfetrab').length).toBe(1);
		await userEvent.keyboard('{Escape}');
		await expect.poll(() => host.querySelector('.omfetrab')).toBeNull();
		expect(popup).toHaveBeenCalledTimes(2);
		expect(closed).toHaveBeenCalledTimes(2);
		expect(scroller.scrollTop).toBe(scrollTop);
	});

	test.each(['window', 'room', 'narrowRoom'])('聚焦阴影、容器定位和源码动画保持稳定，边界=%s', async boundaryType => {
		const host = document.createElement('div');
		host.style.cssText = '--MI_THEME-panel:#fff;--MI_THEME-popup:#fff;--MI_THEME-fg:#222;--MI_THEME-shadow:rgba(0,0,0,.2);';
		if (boundaryType !== 'window') {
			host.dataset.emojiPickerBoundary = '';
			host.style.cssText += `position:fixed;left:80px;top:16px;bottom:8px;width:${boundaryType === 'room' ? 500 : 180}px;`;
		}
		const anchor = document.createElement('button');
		anchor.style.cssText = 'position:fixed;left:90px;bottom:16px;width:40px;height:40px;';
		host.append(anchor);
		const mountPoint = document.createElement('div');
		host.append(mountPoint);
		document.body.append(host);
		const done = vi.fn();
		const closed = vi.fn();
		const app = createApp({ render: () => h(MkEmojiPickerDialog, { anchorElement: anchor, showPinned: false, onDone: done, onClosed: closed }) });
		app.component('MkEmoji', { props: { emoji: String }, setup: (props: { emoji?: string }) => () => h('span', props.emoji) });
		app.component('MkCustomEmoji', { render: () => null });
		app.directive('tooltip', {});
		app.mount(mountPoint);
		fixtures.push({ app, host });
		let visibleFrames = 0;
		for (let index = 0; index < 10; index++) {
			await settle();
			const picker = host.querySelector<HTMLElement>('.omfetrab')!;
			const content = picker.parentElement!;
			expect(getComputedStyle(picker).backdropFilter).toBe('none');
			if (getComputedStyle(content).visibility !== 'visible' || Number(getComputedStyle(content).opacity) === 0) continue;
			visibleFrames++;
			const rect = picker.getBoundingClientRect();
			expect(rect.top).toBeGreaterThanOrEqual(0);
			expect(rect.left).toBeGreaterThanOrEqual(0);
			expect(rect.right).toBeLessThanOrEqual(window.innerWidth);
			expect(rect.bottom).toBeLessThanOrEqual(anchor.getBoundingClientRect().top);
			if (boundaryType === 'room') {
				const bounds = host.getBoundingClientRect();
				expect(rect.left).toBeGreaterThanOrEqual(bounds.left);
				expect(rect.right).toBeLessThanOrEqual(bounds.right);
				expect(rect.top).toBeGreaterThanOrEqual(bounds.top);
			}
		}
		expect(visibleFrames).toBeGreaterThan(0);
		const picker = host.querySelector<HTMLElement>('.omfetrab')!;
		await expect.poll(() => getComputedStyle(picker.parentElement!).transform).toBe('none');
		await expect.poll(() => getComputedStyle(picker.parentElement!).opacity).toBe('1');
		const openedRect = picker.getBoundingClientRect();
		await settle();
		expect(picker.getBoundingClientRect().top).toBeCloseTo(openedRect.top, 1);
		expect(picker.getBoundingClientRect().height).toBeCloseTo(openedRect.height, 1);
		const search = picker.querySelector<HTMLInputElement>('input')!;
		search.focus();
		const focusedShadow = getComputedStyle(picker).boxShadow;
		expect(focusedShadow).not.toBe('none');
		search.blur();
		expect(getComputedStyle(picker).boxShadow).toBe(focusedShadow);
		search.focus();
		expect(getComputedStyle(picker).boxShadow).toBe(focusedShadow);
		const emoji = host.querySelector<HTMLButtonElement>('.omfetrab .item')!;
		emoji.click();
		emoji.click();
		expect(done).toHaveBeenCalledOnce();
		expect(getComputedStyle(picker).boxShadow).toBe(focusedShadow);
		await expect.poll(() => closed.mock.calls.length).toBe(1);
	});

	test('最近为空时不占位，较多时最多显示两行', async () => {
		store.r.recentlyUsedEmojis.value = [];
		const { pane } = await mountPicker();
		expect(pane.querySelector('[data-emoji-category-group="recent"]')).toBeNull();
		await expect.poll(() => pane.querySelector('[data-emoji-category-group="unicode:face"] .item')).not.toBeNull();
		store.r.recentlyUsedEmojis.value = emojilist.slice(0, 32).map(emoji => emoji.char);
		await settle();
		const recent = pane.querySelector<HTMLElement>('[data-emoji-category-group="recent"] .body')!;
		const columns = getComputedStyle(recent).gridTemplateColumns.split(' ').length;
		const items = [...recent.querySelectorAll<HTMLButtonElement>('.item')];
		expect(items).toHaveLength(columns * 2);
		expect(items.at(-1)!.getBoundingClientRect().top - items[0].getBoundingClientRect().top).toBeCloseTo(items[0].getBoundingClientRect().height, 1);
	});

	test.each([false, true])('单面板连续滚动跨分类并按需加载，drawer=%s', async asDrawer => {
		const { toolbar, pane } = await mountPicker(asDrawer);
		const distant = pane.querySelector<HTMLElement>('[data-emoji-category-group="unicode:flags"]')!;
		expect(distant.querySelectorAll('.item')).toHaveLength(0);
		scrollToGroup(pane, 'unicode:people');
		await expect.poll(() => pane.dataset.emojiGroup).toBe('unicode:people');
		await expect.poll(() => pane.querySelector('[data-emoji-category-group="unicode:people"] .item')).not.toBeNull();
		const people = pane.querySelector<HTMLElement>('[data-emoji-category-group="unicode:people"]')!;
		const body = people.querySelector<HTMLElement>('.body')!;
		const first = body.querySelector<HTMLButtonElement>('.item')!;
		const rowHeight = first.getBoundingClientRect().height;
		const columns = getComputedStyle(body).gridTemplateColumns.split(' ').length;
		const maximumVisibleItems = (Math.ceil(pane.clientHeight / rowHeight) + 3) * columns;
		expect(body.querySelectorAll('.item').length).toBeLessThanOrEqual(maximumVisibleItems);
		const fullHeight = body.getBoundingClientRect().height;
		const scrollHeight = pane.scrollHeight;
		const firstEmoji = first.dataset.emoji;
		first.focus({ preventScroll: true });
		pane.scrollTop += rowHeight * 10;
		pane.dispatchEvent(new Event('scroll'));
		await settle();
		expect(document.activeElement).toBe(first);
		expect(first.isConnected).toBe(true);
		expect(body.querySelectorAll('.item').length).toBeLessThanOrEqual(maximumVisibleItems + 1);
		expect(body.getBoundingClientRect().height).toBeCloseTo(fullHeight, 1);
		expect(pane.scrollHeight).toBe(scrollHeight);
		first.blur();
		await expect.poll(() => [...body.querySelectorAll<HTMLElement>('.item')].some(item => item.dataset.emoji === firstEmoji)).toBe(false);
		expect(toolbar.querySelector('.toolbarButton.active')?.getAttribute('aria-pressed')).toBe('true');
		expect(toolbar.querySelector('.toolbarButton.active')?.getAttribute('aria-label')).toBe('Emoji');
		expect(distant.querySelectorAll('.item')).toHaveLength(0);
		scrollToGroup(pane, 'unicode:animals_and_nature');
		await expect.poll(() => pane.dataset.emojiGroup).toBe('unicode:animals_and_nature');
		await expect.poll(() => pane.querySelector('[data-emoji-category-group="unicode:animals_and_nature"] .item')).not.toBeNull();
		pane.scrollTop += rowHeight;
		pane.dispatchEvent(new Event('scroll'));
		await expect.poll(() => people.querySelectorAll('.item').length).toBe(0);
		pane.scrollTop = 0;
		pane.dispatchEvent(new Event('scroll'));
		await expect.poll(() => pane.dataset.emojiGroup).toBe('recent');
		expect(pane.querySelectorAll('[data-emoji-category-group="recent"] .item')).toHaveLength(3);
	});

	test('鼠标不动时滚动更新新表情的提示，移出后不再恢复', async () => {
		vi.mocked(popup).mockClear();
		vi.mocked(popup).mockReturnValue({ dispose: vi.fn() });
		const { root, pane } = await mountPicker(false, true);
		scrollToGroup(pane, 'unicode:people');
		await expect.poll(() => pane.querySelector('[data-emoji-category-group="unicode:people"] .item')).not.toBeNull();
		const bounds = pane.getBoundingClientRect();
		const emoji = [...pane.querySelectorAll<HTMLButtonElement>('.item')].find(item => {
			const rect = item.getBoundingClientRect();
			return rect.top > bounds.top + 70 && rect.bottom < bounds.bottom;
		})!;
		const rect = emoji.getBoundingClientRect();
		const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
		await page.elementLocator(emoji).hover();
		await expect.poll(() => vi.mocked(popup).mock.lastCall?.[1]?.reaction).toBe(emoji.dataset.emoji);
		const original = vi.mocked(popup).mock.lastCall![1]!;

		for (const rows of [12, -6]) {
			const previous = vi.mocked(popup).mock.lastCall![1]!;
			pane.scrollTop += rect.height * rows;
			pane.dispatchEvent(new Event('scroll'));
			await settle();
			await expect.poll(() => {
				const target = document.elementFromPoint(point.x, point.y)?.closest<HTMLButtonElement>('.item');
				const preview = vi.mocked(popup).mock.lastCall?.[1];
				return target != null && preview?.anchorElement === target && preview.reaction === target.dataset.emoji && preview.showing.value;
			}).toBe(true);
			expect(previous.showing.value).toBe(false);
		}
		expect(original.showing.value).toBe(false);
		expect(emoji.isConnected).toBe(false);

		await page.elementLocator(root.querySelector<HTMLInputElement>('.search')!).hover();
		const calls = vi.mocked(popup).mock.calls.length;
		pane.scrollTop += rect.height;
		pane.dispatchEvent(new Event('scroll'));
		await new Promise(resolve => setTimeout(resolve, 250));
		expect(vi.mocked(popup).mock.calls).toHaveLength(calls);
	});

	test('底栏可回到最近表情，粘贴关键词后按回车选择搜索结果', async () => {
		vi.mocked(popup).mockReturnValue({ dispose: vi.fn() });
		const { host, root, pane, chosen } = await mountPicker(false, true);
		const picker = page.elementLocator(host);
		await picker.getByRole('button', { name: 'Emoji', exact: true }).click();
		await expect.poll(() => pane.dataset.emojiGroup).toBe('unicode:face');
		await expect.poll(() => pane.querySelector('[data-emoji-category-group="unicode:face"] .item')).not.toBeNull();
		const emoji = pane.querySelector<HTMLButtonElement>('[data-emoji-category-group="unicode:face"] .item')!;
		emoji.dispatchEvent(new MouseEvent('mouseenter'));
		await expect.poll(() => vi.mocked(popup).mock.lastCall?.[1]?.reaction).toBe(emoji.dataset.emoji);
		const preview = vi.mocked(popup).mock.lastCall![1]!;
		expect(preview.anchorElement).toBe(emoji);
		emoji.click();
		expect(preview.showing.value).toBe(false);
		expect(chosen).toHaveBeenCalledExactlyOnceWith(emoji.dataset.emoji);
		const search = root.querySelector<HTMLInputElement>('.search')!;
		const searchTop = search.getBoundingClientRect().top;
		expect(searchTop).toBeGreaterThanOrEqual(pane.getBoundingClientRect().bottom);
		const keywordData = new DataTransfer();
		keywordData.setData('text/plain', 'green_sala');
		const pasteKeyword = new ClipboardEvent('paste', { clipboardData: keywordData, bubbles: true, cancelable: true });
		search.dispatchEvent(pasteKeyword);
		expect(pasteKeyword.defaultPrevented).toBe(false);
		expect(chosen).toHaveBeenCalledOnce();
		// 合成粘贴事件不执行浏览器默认插入，再发送 input 模拟文本进入搜索框。
		search.value = 'green_sala';
		search.dispatchEvent(new Event('input'));
		search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
		expect(chosen).toHaveBeenLastCalledWith('🥗');
		expect(chosen).toHaveBeenCalledTimes(2);
		await expect.poll(() => pane.dataset.emojiGroup).toBe('search');
		expect(search.getBoundingClientRect().top).toBeCloseTo(searchTop, 1);
		expect(pane.querySelectorAll('.result .item').length).toBeGreaterThan(0);
		expect(pane.querySelector('[data-emoji-category-group]')).toBeNull();
		await picker.getByRole('button', { name: '最近使用', exact: true }).click();
		await expect.poll(() => pane.dataset.emojiGroup).toBe('recent');
		expect(search.value).toBe('');
		expect(pane.querySelectorAll('[data-emoji-category-group="recent"] .item')).toHaveLength(3);
		const emojiData = new DataTransfer();
		emojiData.setData('text/plain', '🥗');
		const pasteEmoji = new ClipboardEvent('paste', { clipboardData: emojiData, bubbles: true, cancelable: true });
		search.dispatchEvent(pasteEmoji);
		expect(pasteEmoji.defaultPrevented).toBe(true);
		expect(chosen).toHaveBeenLastCalledWith('🥗');
		expect(chosen).toHaveBeenCalledTimes(3);
	});
});
