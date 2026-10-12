/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { createApp, h, nextTick, ref } from 'vue';
import type { App, VNode } from 'vue';
import '@/style.scss';
import MkModal from '@/components/MkModal.vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkWindow from '@/components/MkWindow.vue';
import MkDialog from '@/components/MkDialog.vue';
import MkSigninDialog from '@/components/MkSigninDialog.vue';
import MkWaitingDialog from '@/components/MkWaitingDialog.vue';
import MkPopupMenu from '@/components/MkPopupMenu.vue';
import MkContextMenu from '@/components/MkContextMenu.vue';
import MkLightbox from '@/components/MkLightbox.vue';
import { hotkeyDirective } from '@/directives/hotkey.js';
import { initializeInputCaret } from '@/utility/input-caret.js';
import { initializeInputWheel } from '@/utility/input-wheel.js';
import { pushPageHistory, replacePageHistory } from '@/utility/popup-history.js';

let zIndex = 0;
vi.mock('@/os.js', () => ({ claimZIndex: (priority: string) => ++zIndex + (priority === 'high' ? 3000000 : priority === 'middle' ? 2000000 : priority === 'veryLow' ? 500000 : 1000000) }));
vi.mock('misskey-js', () => ({}));
vi.mock('@/components/global/MkA.vue', () => ({ default: { render: () => null } }));
vi.mock('@/theme.js', () => ({ themeManager: { on: vi.fn(), off: vi.fn(), currentCompiledTheme: {} } }));
vi.mock('@/router.js', () => ({ useRouter: () => ({ useListener: vi.fn() }) }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false, menuStyle: 'popup' } } }));
vi.mock('@/utility/device-kind.js', () => ({ deviceKind: 'desktop' }));
vi.mock('@/utility/touch.js', () => ({ isTouchUsing: false }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { close: '关闭', done: '完成', cancel: '取消', ok: '确定', gotIt: '知道了', login: '登录' } } }));
vi.mock('@/components/MkSignin.vue', () => ({ default: { render: () => h('input', { 'aria-label': '用户名' }) } }));
vi.mock('@/components/MkInput.vue', () => ({ default: { render: () => h('input', { 'aria-label': '输入' }) } }));
vi.mock('@/components/MkDatePicker.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkSelect.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkMenu.vue', () => ({ default: { render: () => h('input', { 'aria-label': '菜单搜索' }) } }));
vi.mock('@/components/MkLightbox.item.vue', async () => {
	const { defineComponent, h: createNode } = await import('vue');
	return { default: defineComponent({
		emits: ['close'],
		setup: (_props, { emit, expose }) => {
			const closeThis = () => emit('close');
			expose({ closeThis, onActive: () => {}, onDeactive: () => {} });
			return () => createNode('button', { onClick: closeThis }, '关闭图库');
		},
	}) };
});
vi.mock('@/components/MkButton.vue', () => ({ default: { setup: (_props: unknown, { slots }: { slots: { default?: () => VNode[] } }) => () => h('button', slots.default?.()) } }));

let app: App | undefined;
let host: HTMLElement | undefined;
const initialUrl = window.location.href;
const initialState = window.history.state;
let onRoutePop: (() => void) | undefined;

async function settle() {
	await nextTick();
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
	await nextTick();
}

async function mount(render: () => VNode) {
	host = document.createElement('div');
	document.body.append(host);
	app = createApp({ render });
	for (const name of ['MkLoading', 'MkEllipsis', 'MkSystemIcon', 'Mfm']) app.component(name, { render: () => null });
	for (const name of ['tooltip', 'adaptive-border']) app.directive(name, () => {});
	app.directive('hotkey', hotkeyDirective);
	app.mount(host);
	await settle();
}

afterEach(async () => {
	app?.unmount();
	host?.remove();
	await settle();
	await expect.poll(() => window.history.state?.__misskeyPopup?.guard ?? false).toBe(false);
	if (onRoutePop) window.removeEventListener('popstate', onRoutePop);
	onRoutePop = undefined;
	window.history.replaceState(initialState, '', initialUrl);
});

function preparePageHistory() {
	window.history.replaceState({ page: 'previous' }, '', '#previous');
	pushPageHistory('#current');
	const navigated = vi.fn();
	onRoutePop = navigated;
	window.addEventListener('popstate', onRoutePop);
	return navigated;
}

test.each([['high', 'low'], ['low', 'veryLow']] as const)('Back closes only the %s popup above %s and preserves page navigation', async (upperPriority, lowerPriority) => {
	const navigated = preparePageHistory();
	const upper = vi.fn();
	const lower = vi.fn();
	await mount(() => h('div', [
		h(MkModal, { zPriority: upperPriority, onClosed: upper }, () => h('input', { 'aria-label': '上层' })),
		h(MkModal, { zPriority: lowerPriority, onClosed: lower }, () => h('input', { 'aria-label': '下层' })),
	]));
	await page.getByRole('textbox', { name: '上层' }).click();
	expect(document.activeElement).toBe(page.getByRole('textbox', { name: '上层' }).element());
	window.history.back();
	await expect.poll(() => upper.mock.calls.length).toBe(1);
	expect(lower).not.toHaveBeenCalled();
	expect(navigated).not.toHaveBeenCalled();
	expect(window.location.hash).toBe('#current');
	window.history.back();
	await expect.poll(() => lower.mock.calls.length).toBe(1);
	expect(navigated).not.toHaveBeenCalled();
	window.history.back();
	await expect.poll(() => window.location.hash).toBe('#previous');
	window.history.forward();
	await expect.poll(() => window.location.hash).toBe('#current');
	expect(navigated).toHaveBeenCalledTimes(2);
});

test('Back cannot pass through a popup whose owner refuses to close it', async () => {
	const navigated = preparePageHistory();
	const cancel = vi.fn();
	const closed = vi.fn();
	await mount(() => h(MkModalWindow, { onClose: cancel, onClosed: closed }, () => h('input', { 'aria-label': '未保存内容' })));
	for (let attempt = 1; attempt <= 2; attempt++) {
		window.history.back();
		await expect.poll(() => cancel.mock.calls.length).toBe(attempt);
		expect(window.location.hash).toBe('#current');
		expect(closed).not.toHaveBeenCalled();
		expect(navigated).not.toHaveBeenCalled();
	}
});

test.each([
	{ underlying: false, action: 'Back' },
	{ underlying: false, action: 'close' },
	{ underlying: true, action: 'Back' },
	{ underlying: true, action: 'close' },
])('图库 $action 关闭只消费自身返回状态，底层弹窗=$underlying', async ({ underlying, action }) => {
	const navigated = preparePageHistory();
	const galleryShowing = ref(false);
	const galleryClosed = vi.fn();
	const modalClosed = vi.fn();
	await mount(() => h('div', [
		underlying ? h(MkModal, { onClosed: modalClosed }, () => h('input', { 'aria-label': '底层内容' })) : null,
		galleryShowing.value ? h(MkLightbox, {
			contents: [{ id: 'image', type: 'image', url: 'data:image/png;base64,', width: 1, height: 1 }],
			onClosed: () => { galleryClosed(); galleryShowing.value = false; },
		}) : null,
	]));
	galleryShowing.value = true;
	await settle();
	if (action === 'Back') window.history.back();
	else await page.getByRole('button', { name: '关闭图库' }).click();
	await expect.poll(() => galleryClosed.mock.calls.length).toBe(1);
	await expect.poll(() => window.history.state?.__misskeyPopup?.guard ?? false).toBe(underlying);
	expect(modalClosed).not.toHaveBeenCalled();
	expect(navigated).not.toHaveBeenCalled();
	expect(window.location.hash).toBe('#current');
	if (underlying) {
		window.history.back();
		await expect.poll(() => modalClosed.mock.calls.length).toBe(1);
		expect(navigated).not.toHaveBeenCalled();
		expect(window.location.hash).toBe('#current');
	}
	await expect.poll(() => window.history.state?.__misskeyPopup?.guard ?? false).toBe(false);
	window.history.back();
	await expect.poll(() => window.location.hash).toBe('#previous');
	window.history.forward();
	await expect.poll(() => window.location.hash).toBe('#current');
	expect(galleryClosed).toHaveBeenCalledOnce();
});

test('图库上层菜单先处理 Escape，不同时关闭图库', async () => {
	preparePageHistory();
	const menuShowing = ref(false);
	const galleryClosed = vi.fn();
	await mount(() => h('div', [
		h(MkLightbox, {
			contents: [{ id: 'image', type: 'image', url: 'data:image/png;base64,', width: 1, height: 1 }],
			onClosed: galleryClosed,
		}),
		menuShowing.value ? h(MkContextMenu, {
			items: [], ev: { pageX: 400, pageY: 300 } as PointerEvent,
			onClosed: () => { menuShowing.value = false; },
		}) : null,
	]));
	menuShowing.value = true;
	await settle();
	await userEvent.keyboard('{Escape}');
	await expect.poll(() => menuShowing.value).toBe(false);
	expect(galleryClosed).not.toHaveBeenCalled();
	await userEvent.keyboard('{Escape}');
	await expect.poll(() => galleryClosed.mock.calls.length).toBe(1);
});

test('图库直接卸载后恢复页面交互', async () => {
	const showing = ref(true);
	const clicked = vi.fn();
	await mount(() => h('div', [
		h('button', { onClick: clicked }, '页面按钮'),
		showing.value ? h(MkLightbox, {
			contents: [{ id: 'image', type: 'image', url: 'data:image/png;base64,', width: 1, height: 1 }],
		}) : null,
	]));
	showing.value = false;
	await settle();
	await page.getByRole('button', { name: '页面按钮' }).click();
	expect(clicked).toHaveBeenCalledOnce();
});

test.each(['push', 'replace'])('closing a popup while its history is being removed does not undo a new %s navigation', async method => {
	preparePageHistory();
	const modal = ref<InstanceType<typeof MkModal>>();
	await mount(() => h(MkModal, { ref: modal }, () => h('input', { 'aria-label': '内容' })));
	modal.value!.close();
	// Vue 已开始移除保护项，原生 popstate 尚未交付。
	await nextTick();
	if (method === 'push') pushPageHistory('#next');
	else replacePageHistory('#next');
	await expect.poll(() => window.location.hash).toBe('#next');
	await settle();
	expect(window.location.hash).toBe('#next');
	window.history.back();
	await expect.poll(() => window.location.hash).toBe(method === 'push' ? '#current' : '#previous');
	window.history.forward();
	await expect.poll(() => window.location.hash).toBe('#next');
});

async function clickBackdrop() {
	await page.elementLocator(page.getByTestId('bg').element().nextElementSibling!).click({ position: { x: 4, y: 4 } });
	await settle();
}

test.each(['backdrop', 'Escape'])('bare modals close by default on %s', async action => {
	const closed = vi.fn();
	await mount(() => h(MkModal, { onClosed: closed }, () => h('input', { 'aria-label': '内容' })));
	if (action === 'Escape') {
		await page.getByRole('textbox').click();
		await userEvent.keyboard('{Escape}');
	} else {
		await clickBackdrop();
	}
	await expect.poll(() => closed.mock.calls.length).toBe(1);
});

test.each([{}, { closeOnBackdrop: false }, { cancelableByBgClick: false }])('input dialogs protect text and allow Escape with %j', async options => {
	const done = vi.fn();
	await mount(() => h(MkDialog, { ...options, input: { default: '' }, onDone: done }));
	await page.getByRole('textbox').fill('unfinished input');
	await clickBackdrop();
	expect(done).not.toHaveBeenCalled();
	expect(page.getByRole('textbox').element()).toHaveProperty('value', 'unfinished input');
	await page.getByRole('textbox').click();
	await userEvent.keyboard('{Escape}');
	expect(done).toHaveBeenCalledExactlyOnceWith({ canceled: true, result: undefined });
});

test.each([
	{},
	{ input: { default: '', type: 'date' as const } },
	{ input: { default: '' }, closeOnBackdrop: true },
])('viewing, date selection and explicit opt-in dialogs allow backdrop cancellation: %j', async props => {
	const done = vi.fn();
	await mount(() => h(MkDialog, { ...props, onDone: done }));
	await clickBackdrop();
	expect(done).toHaveBeenCalledExactlyOnceWith({ canceled: true, result: undefined });
});

test('backdrop cancellation runs once and waits for the owner to approve closing', async () => {
	const cancel = vi.fn();
	const closed = vi.fn();
	await mount(() => h(MkModal, { onClick: cancel, onEsc: cancel, onClosed: closed }, () => h('button', '内容')));
	await clickBackdrop();
	expect(cancel).toHaveBeenCalledOnce();
	expect(closed).not.toHaveBeenCalled();
	await userEvent.keyboard('{Escape}');
	expect(cancel).toHaveBeenCalledTimes(2);
	expect(closed).not.toHaveBeenCalled();
});

test('modal windows fall back to their close handler on Escape without bypassing it', async () => {
	const close = vi.fn();
	const closed = vi.fn();
	await mount(() => h(MkModalWindow, { onClose: close, onClosed: closed }, () => h('input', { 'aria-label': '内容' })));
	await page.getByRole('textbox').click();
	await userEvent.keyboard('{Escape}');
	expect(close).toHaveBeenCalledOnce();
	expect(closed).not.toHaveBeenCalled();
});

test.each(['backdrop', 'Escape'])('modal windows without handlers close on %s', async action => {
	const closed = vi.fn();
	await mount(() => h(MkModalWindow, { onClosed: closed }, () => h('input', { 'aria-label': '内容' })));
	if (action === 'Escape') await userEvent.keyboard('{Escape}');
	else await clickBackdrop();
	await expect.poll(() => closed.mock.calls.length).toBe(1);
});

test('Escape closes only the highest popup, respects IME and ignores held keys', async () => {
	const upper = vi.fn();
	const lower = vi.fn();
	await mount(() => h('div', [
		h(MkModal, { zPriority: 'high', onClosed: upper }, () => h('input', { 'aria-label': '上层' })),
		h(MkModal, { onClosed: lower }, () => h('input', { 'aria-label': '下层' })),
	]));
	const input = page.getByRole('textbox', { name: '上层' });
	await input.click();
	input.element().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true }));
	await settle();
	expect(upper).not.toHaveBeenCalled();
	input.element().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
	await userEvent.keyboard('{Escape}');
	await settle();
	expect(upper).not.toHaveBeenCalled();
	await userEvent.keyboard('{Escape}');
	await expect.poll(() => upper.mock.calls.length).toBe(1);
	expect(lower).not.toHaveBeenCalled();
	document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', repeat: true, bubbles: true }));
	await settle();
	expect(lower).not.toHaveBeenCalled();
	await userEvent.keyboard('{Escape}');
	await expect.poll(() => lower.mock.calls.length).toBe(1);
});

test('children can consume Escape without closing their popup', async () => {
	const closed = vi.fn();
	await mount(() => h(MkModal, { onClosed: closed }, () => h('input', {
		'aria-label': '内容',
		onKeydown: (event: KeyboardEvent) => event.preventDefault(),
	})));
	await page.getByRole('textbox').click();
	await userEvent.keyboard('{Escape}');
	expect(closed).not.toHaveBeenCalled();
});

test.each([false, true])('floating windows support outside clicks with closeOnBackdrop=%s and Escape without focus', async closeOnBackdrop => {
	const closed = vi.fn();
	await mount(() => h('div', [
		h('button', { style: 'position:fixed;left:4px;top:4px' }, '空白区域'),
		h(MkWindow, { closeOnBackdrop, onClosed: closed }, () => h('input', { 'aria-label': '内容' })),
	]));
	await page.getByRole('button', { name: '空白区域' }).click();
	await settle();
	if (!closeOnBackdrop) {
		expect(closed).not.toHaveBeenCalled();
		await userEvent.keyboard('{Escape}');
	}
	await expect.poll(() => closed.mock.calls.length).toBe(1);
});

test('dragging from a floating window to the outside does not dismiss it', async () => {
	const closed = vi.fn();
	await mount(() => h(MkWindow, { onClosed: closed }, () => h('input', { 'aria-label': '内容' })));
	page.getByRole('textbox').element().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
	document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
	await settle();
	expect(closed).not.toHaveBeenCalled();
});

test('sign-in keeps input after a backdrop click and emits cancellation on Escape', async () => {
	const cancelled = vi.fn();
	await mount(() => h(MkSigninDialog, { onCancelled: cancelled }));
	await page.getByRole('textbox').fill('unfinished-name');
	await clickBackdrop();
	expect(cancelled).not.toHaveBeenCalled();
	expect(page.getByRole('textbox').element()).toHaveProperty('value', 'unfinished-name');
	await page.getByRole('textbox').click();
	await userEvent.keyboard('{Escape}');
	expect(cancelled).toHaveBeenCalledOnce();
});

test('waiting dialogs ignore backdrop clicks and finish dismissal on Escape', async () => {
	const done = vi.fn();
	await mount(() => h(MkWaitingDialog, { success: false, showing: true, onDone: done }));
	await clickBackdrop();
	expect(done).not.toHaveBeenCalled();
	await userEvent.keyboard('{Escape}');
	expect(done).toHaveBeenCalledOnce();
});

test('Escape closes a menu controlled by manualShowing', async () => {
	const closed = vi.fn();
	await mount(() => h(MkPopupMenu, { items: [], onClosed: closed }));
	await page.getByRole('textbox').click();
	await userEvent.keyboard('{Escape}');
	await expect.poll(() => closed.mock.calls.length).toBe(1);
});

test.each([false, true])('锚点浮层优先留在触发容器内，menu=%s', async menu => {
	await page.viewport(1000, 800);
	const anchor = ref<HTMLElement | null>(null);
	await mount(() => h('section', { 'data-popup-boundary': '', style: 'position:fixed;left:200px;top:100px;width:500px;height:500px;' }, [
		h('button', { ref: anchor, style: 'position:absolute;right:0;top:20px;' }, '打开'),
		anchor.value ? h(MkModal, { anchorElement: anchor.value, menu }, () => h('div', { 'data-popup-content': '', style: 'width:220px;height:200px;' }, '内容')) : null,
	]));
	await settle();
	const popup = host!.querySelector<HTMLElement>('[data-popup-content]')!;
	await expect.poll(() => getComputedStyle(popup.parentElement!).visibility).toBe('visible');
	const bounds = host!.querySelector('section')!.getBoundingClientRect();
	const rect = popup.getBoundingClientRect();
	expect(rect.left).toBeGreaterThanOrEqual(bounds.left);
	expect(rect.right).toBeLessThanOrEqual(bounds.right);
	expect(rect.top).toBeGreaterThanOrEqual(bounds.top);
	expect(rect.bottom).toBeLessThanOrEqual(bounds.bottom);
});

test('a context menu over a modal consumes one outside click without dismissing the modal', async () => {
	const menuShowing = ref(true);
	const closed = vi.fn();
	await mount(() => h('div', [
		h(MkModal, { onClosed: closed }, () => h('input', { 'aria-label': '内容' })),
		menuShowing.value ? h(MkContextMenu, {
			items: [], ev: { pageX: 400, pageY: 300 } as PointerEvent,
			onClosed: () => { menuShowing.value = false; },
		}) : null,
	]));
	await clickBackdrop();
	expect(menuShowing.value).toBe(false);
	expect(closed).not.toHaveBeenCalled();
	await clickBackdrop();
	await expect.poll(() => closed.mock.calls.length).toBe(1);
});

test('clicking and dismissing a context menu preserves the floating window underneath', async () => {
	const closed = vi.fn();
	const menuClosed = vi.fn();
	await mount(() => h('div', [
		h(MkWindow, { onClosed: closed }, () => h('input', { 'aria-label': '内容' })),
		h(MkContextMenu, { items: [], ev: { pageX: 10, pageY: 10 } as PointerEvent, onClosed: menuClosed }),
	]));
	await page.getByRole('textbox', { name: '菜单搜索' }).click();
	expect(closed).not.toHaveBeenCalled();
	await userEvent.keyboard('{Escape}');
	expect(menuClosed).toHaveBeenCalledOnce();
	expect(closed).not.toHaveBeenCalled();
});

test.each(['text', 'number', 'email', 'textarea'])('默认聚焦在 %s 内容末尾，追加输入不覆盖原值', async type => {
	const dispose = initializeInputCaret();
	const edited = vi.fn();
	const value = type === 'number' ? '12' : type === 'email' ? 'a@example.com' : '已有内容';
	try {
		await mount(() => h(type === 'textarea' ? 'textarea' : 'input', { type: type === 'textarea' ? undefined : type, value, onInput: edited }));
		const input = host!.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')!;
		input.focus();
		await userEvent.keyboard('9');
		expect(input.value).toBe(`${value}9`);
		expect(edited).toHaveBeenCalledOnce();
	} finally { dispose(); }
});

test('直接点击输入框保留指针位置，默认聚焦才移动到末尾', async () => {
	const dispose = initializeInputCaret();
	try {
		await mount(() => h('div', [h('input', { value: 'abcdef', style: 'font:16px monospace;padding:0;width:200px;' }), h('button', '离开输入框')]));
		const input = host!.querySelector('input')!;
		await page.elementLocator(input).click({ position: { x: 3, y: 8 } });
		expect(input.selectionStart).toBeLessThan(2);
		await userEvent.keyboard('9');
		expect(input.value).not.toBe('abcdef9');
		await page.getByRole('button', { name: '离开输入框' }).click();
		input.focus();
		expect(input.selectionStart).toBe(input.value.length);
	} finally { dispose(); }
});

test('数字框滚轮按一递增且遵守上下限，失焦和只读时不改值', async () => {
	const dispose = initializeInputWheel();
	const edited = vi.fn();
	try {
		await mount(() => h('input', { type: 'number', step: '0.01', min: '0.25', max: '2.25', value: '1.25', onInput: edited }));
		const input = host!.querySelector('input')!;
		const wheel = (deltaY: number) => input.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }));
		wheel(-100);
		expect(input.value).toBe('1.25');
		input.focus();
		wheel(-100);
		expect(input.value).toBe('2.25');
		wheel(-100);
		expect(input.value).toBe('2.25');
		wheel(100);
		wheel(100);
		wheel(100);
		expect(input.value).toBe('0.25');
		expect(edited).toHaveBeenCalledTimes(3);
		input.readOnly = true;
		wheel(-100);
		expect(input.value).toBe('0.25');
	} finally { dispose(); }
});
