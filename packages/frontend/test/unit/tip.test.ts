/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { nextTick, ref } from 'vue';
import type { entities } from 'misskey-js';
import MkTipDialog from '@/components/MkTipDialog.vue';
import MkTipSection from '@/components/MkTipSection.vue';
import MkArticlePreview from '@/components/MkArticlePreview.vue';
import MkA from '@/components/global/MkA.vue';
import { getArticleMenu } from '@/utility/get-article-menu.js';
import type { MenuButton } from '@/types/menu.js';
import type { Router } from '@/router.js';
import { i18n } from '@/i18n.js';
import { miLocalStorage } from '@/local-storage.js';
import { DI } from '@/di.js';

const mocks = vi.hoisted(() => ({ api: vi.fn(), confirm: vi.fn(), toast: vi.fn(), popup: vi.fn(), popupAsyncWithDialog: vi.fn(), contextMenu: vi.fn(), router: { pushByPath: vi.fn() } }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/i.js', () => ({ $i: { id: 'self' }, ensureSignin: () => ({ id: 'self' }) }));
vi.mock('@/os.js', () => ({ confirm: mocks.confirm, toast: mocks.toast, popup: mocks.popup, popupAsyncWithDialog: mocks.popupAsyncWithDialog, contextMenu: mocks.contextMenu }));
vi.mock('@/router.js', () => ({ useRouter: () => mocks.router }));
vi.mock('@/components/MkMediaImage.vue', () => ({ default: { template: '<img alt="">' } }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: true } } }));
vi.mock('@/utility/please-login.js', () => ({ pleaseLogin: async () => true }));
vi.mock('@/components/MkModalWindow.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({ setup(_props, { slots, expose, emit }) {
		expose({ close: () => emit('closed') });
		return () => h('div', [h('button', { onClick: () => emit('close') }, 'Close dialog'), slots.header?.(), slots.default?.()]);
	} }) };
});
vi.mock('@/components/MkButton.vue', () => ({ default: { props: ['disabled', 'type'], template: '<button :type="type" :disabled="disabled"><slot/></button>' } }));
vi.mock('@/components/MkInfo.vue', () => ({ default: { template: '<p><slot/></p>' } }));

const recipient = { id: 'target', name: 'Alice', username: 'alice', host: null } as entities.UserLite;
const options = {
	props: { recipient },
	global: {
		stubs: {
			MkAvatar: true,
			MkUserName: { props: ['user'], template: '<span>{{ user.name }}</span>' },
			MkAcct: { props: ['user'], template: '<span>@{{ user.username }}</span>' },
		},
	},
};
const storageKey = 'wallet-tip:self:target';
let restoreAnimation: (() => void) | undefined;

function mockBarrageMotion() {
	const originalAnimate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
	const animations: { element: Element; state: AnimationPlayState; currentTime: number; pause: ReturnType<typeof vi.fn>; play: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> }[] = [];
	const animate = vi.fn(function (this: Element, _frames: Keyframe[] | PropertyIndexedKeyframes | null, _timing?: number | KeyframeAnimationOptions) {
		const animation = {
			element: this,
			state: 'running' as AnimationPlayState,
			currentTime: 0,
			pause: vi.fn(() => { animation.state = 'paused'; }),
			play: vi.fn(() => { animation.state = 'running'; }),
			cancel: vi.fn(() => { animation.state = 'idle'; }),
		};
		animations.push(animation);
		return animation as unknown as Animation;
	});
	Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
	restoreAnimation = () => {
		if (originalAnimate) Object.defineProperty(Element.prototype, 'animate', originalAnimate);
		else Reflect.deleteProperty(Element.prototype, 'animate');
	};
	vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width: 900 } as DOMRect);
	vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
	const media = Object.assign(new EventTarget(), { matches: false });
	vi.spyOn(window, 'matchMedia').mockReturnValue(media as MediaQueryList);
	let observerCallback: IntersectionObserverCallback | undefined;
	const disconnect = vi.fn();
	vi.spyOn(globalThis, 'IntersectionObserver').mockImplementation(function (callback: IntersectionObserverCallback) {
		observerCallback = callback;
		const observer = {
			observe(target: Element) { callback([{ target, isIntersecting: true } as IntersectionObserverEntry], observer as unknown as IntersectionObserver); },
			disconnect,
		};
		return observer as unknown as IntersectionObserver;
	} as unknown as typeof IntersectionObserver);
	return {
		animations, animate, disconnect, media,
		setIntersecting(visible: boolean) { observerCallback!([{ isIntersecting: visible } as IntersectionObserverEntry], {} as IntersectionObserver); },
	};
}

function tipRecords(count: number) {
	return Array.from({ length: count }, (_, index) => ({ id: `tip-${index}`, user: { ...recipient, id: `sender-${index}`, name: `Sender ${index}` }, amount: 5, createdAt: '2026-10-06T00:00:00.000Z' }));
}

beforeEach(() => {
	localStorage.clear();
	mocks.popup.mockReturnValue({ dispose: vi.fn() });
	mocks.api.mockImplementation(async (endpoint, request) => endpoint === 'i/wallet' ? { balance: 1000 } : { balance: 1000 - request.amount, amount: request.amount, sent: true });
});
afterEach(() => { cleanup(); restoreAnimation?.(); restoreAnimation = undefined; vi.clearAllMocks(); vi.restoreAllMocks(); });

test('文章卡片和作者链接不带打赏，详情菜单打赏关联当前文章', async () => {
	const article = { id: 'article', title: 'Article title', userId: recipient.id, user: recipient, createdAt: '2026-10-07T00:00:00.000Z', likedCount: 0 } as entities.Page;
	const view = render(MkArticlePreview, {
		props: { article },
		global: { components: { MkA }, stubs: { ...options.global.stubs, MkTime: true } },
	});
	await fireEvent.contextMenu(view.getByRole('heading', { name: article.title }));
	expect(mocks.contextMenu).toHaveBeenCalledOnce();
	expect(mocks.contextMenu.mock.calls[0][0]).not.toEqual(expect.arrayContaining([expect.objectContaining({ text: i18n.ts._tip.title })]));
	const menu = await Promise.all(getArticleMenu(article, mocks.router as unknown as Router, 'detail'));
	const tip = menu.find(item => typeof item === 'object' && item && 'text' in item && item.text === i18n.ts._tip.title) as MenuButton;
	const dispose = vi.fn();
	mocks.popupAsyncWithDialog.mockResolvedValue({ dispose });
	await tip.action(new PointerEvent('click'));
	expect(mocks.popupAsyncWithDialog).toHaveBeenCalledExactlyOnceWith(expect.any(Promise), {
		recipient, target: { type: 'page', id: article.id, title: article.title },
	}, expect.any(Object));
	mocks.popupAsyncWithDialog.mock.calls[0][2].closed();
	expect(dispose).toHaveBeenCalledOnce();
	mocks.contextMenu.mockClear();
	await fireEvent.contextMenu(view.getByRole('link', { name: recipient.name! }));
	expect(mocks.contextMenu).toHaveBeenCalledOnce();
	expect(mocks.contextMenu.mock.calls[0][0]).not.toEqual(expect.arrayContaining([expect.objectContaining({ text: i18n.ts._tip.title })]));
});

test.each([
	{ ...recipient, id: 'self' },
	{ ...recipient, host: 'remote.test' },
])('自己的文章和远程作者文章不显示菜单打赏：%j', user => {
	const article = { id: 'article', title: 'Article title', userId: user.id, user } as entities.Page;
	expect(getArticleMenu(article, mocks.router as unknown as Router, 'detail')).not.toEqual(expect.arrayContaining([expect.objectContaining({ text: i18n.ts._tip.title })]));
});

test('独立打赏提交后直接到账，保留收款人、精确金额和留言', async () => {
	const view = render(MkTipDialog, options);
	expect(view.getByText('@alice')).toBeTruthy();
	expect(view.getByText(i18n.ts._tip.description)).toBeTruthy();
	expect(view.queryByRole('button', { name: i18n.ts._redPacket.uploadCover })).toBeNull();
	expect(view.queryByLabelText(i18n.ts._redPacket.message)).toBeNull();
	await fireEvent.update(view.getByLabelText(i18n.ts._tip.amount), '12.34');
	await fireEvent.update(view.getByLabelText(i18n.ts._tip.message), '  谢谢分享  ');
	await fireEvent.submit(view.getByRole('button', { name: i18n.ts._tip.send }).closest('form')!);
	await waitFor(() => expect(view.emitted('sent')).toHaveLength(1));
	expect(view.emitted('closed')).toHaveLength(1);
	expect(mocks.toast).not.toHaveBeenCalled();
	expect(mocks.confirm).not.toHaveBeenCalled();
	expect(mocks.api).toHaveBeenCalledWith('i/wallet/tip', { userId: 'target', amount: 12.34, message: '谢谢分享', requestId: expect.any(String) });
	expect(mocks.api.mock.calls.every(([endpoint]) => ['i/wallet', 'i/wallet/tip'].includes(endpoint))).toBe(true);
	expect(localStorage.getItem(storageKey)).toBeNull();
});

test.each([5, 10, 20, 50, 100])('点击金额 %i 只选择，提交表单后才发送', async amount => {
	const view = render(MkTipDialog, options);
	await fireEvent.update(view.getByLabelText(i18n.ts._tip.amount), '1.23');
	const preset = view.getByRole('button', { name: i18n.tsx._tip.presetAmount({ coins: amount }) });
	await fireEvent.click(preset);
	expect(view.getByLabelText(i18n.ts._tip.amount)).toHaveProperty('value', String(amount));
	expect(preset.getAttribute('aria-pressed')).toBe('true');
	expect(mocks.confirm).not.toHaveBeenCalled();
	expect(mocks.api.mock.calls.some(([endpoint]) => endpoint === 'i/wallet/tip')).toBe(false);
	expect(localStorage.getItem(storageKey)).toBeNull();
	await fireEvent.submit(view.container.querySelector('form')!);
	await waitFor(() => expect(view.emitted('sent')).toHaveLength(1));
	expect(mocks.confirm).not.toHaveBeenCalled();
	expect(mocks.api).toHaveBeenCalledWith('i/wallet/tip', expect.objectContaining({ userId: 'target', amount }));
});

test('快捷金额受余额限制，发送中和等待重试时不能切换金额', async () => {
	mocks.api.mockImplementation(async endpoint => {
		if (endpoint === 'i/wallet') return { balance: 20 };
		throw new Error('response lost');
	});
	const view = render(MkTipDialog, options);
	const buttons = [5, 10, 20, 50, 100].map(coins => view.getByRole('button', { name: i18n.tsx._tip.presetAmount({ coins }) }));
	await waitFor(() => expect(buttons[3]).toHaveProperty('disabled', true));
	expect(buttons[4]).toHaveProperty('disabled', true);
	expect(buttons[2]).toHaveProperty('disabled', false);
	await fireEvent.click(buttons[3]);
	expect(mocks.api.mock.calls.some(([endpoint]) => endpoint === 'i/wallet/tip')).toBe(false);
	await fireEvent.click(buttons[2]);
	await fireEvent.submit(view.container.querySelector('form')!);
	for (const button of buttons) expect(button).toHaveProperty('disabled', true);
	await fireEvent.click(buttons[0]);
	expect(view.getByLabelText(i18n.ts._tip.amount)).toHaveProperty('value', '20');
	await waitFor(() => expect(view.getByRole('alert').textContent).toBe(i18n.ts._tip.responseUnavailable));
	expect(view.getByText(i18n.ts._tip.pending)).toBeTruthy();
	for (const button of buttons) expect(button).toHaveProperty('disabled', true);
	await fireEvent.click(buttons[1]);
	expect(view.getByLabelText(i18n.ts._tip.amount)).toHaveProperty('value', '20');
	expect(mocks.api.mock.calls.filter(([endpoint]) => endpoint === 'i/wallet/tip')).toHaveLength(1);
});

test.each(['0', '0.99', '1000.01', '1.005', ''])('拒绝不在 1 至 1000 或超过两位小数的金额 %s', async amount => {
	const view = render(MkTipDialog, options);
	await fireEvent.update(view.getByLabelText(i18n.ts._tip.amount), amount);
	expect(view.getByRole('button', { name: i18n.ts._tip.send })).toHaveProperty('disabled', true);
	await fireEvent.submit(view.container.querySelector('form')!);
	expect(mocks.confirm).not.toHaveBeenCalled();
	expect(mocks.api.mock.calls.some(([endpoint]) => endpoint === 'i/wallet/tip')).toBe(false);
});

test('留言按 Unicode 字符限制为 100 字，余额不足时不能发送', async () => {
	mocks.api.mockResolvedValue({ balance: 9 });
	const view = render(MkTipDialog, options);
	await waitFor(() => expect(view.getByRole('button', { name: i18n.ts._tip.send })).toHaveProperty('disabled', true));
	await fireEvent.update(view.getByLabelText(i18n.ts._tip.amount), '9');
	const message = view.getByLabelText(i18n.ts._tip.message) as HTMLInputElement;
	const allowed = '🎉'.repeat(100);
	const overlong = `${allowed}🎉`;
	expect(message.hasAttribute('maxlength')).toBe(false);
	await fireEvent.update(message, overlong);
	expect(message.value).toBe(overlong);
	expect(view.getByText('101/100')).toBeTruthy();
	expect(view.getByRole('button', { name: i18n.ts._tip.send })).toHaveProperty('disabled', true);
	await fireEvent.submit(view.container.querySelector('form')!);
	expect(mocks.api.mock.calls.some(([endpoint]) => endpoint === 'i/wallet/tip')).toBe(false);
	await fireEvent.click(view.getByRole('button', { name: i18n.tsx._tip.presetAmount({ coins: 5 }) }));
	expect(mocks.confirm).not.toHaveBeenCalled();
	await fireEvent.update(message, allowed);
	expect(message.value).toBe(allowed);
	expect(view.getByText('100/100')).toBeTruthy();
	expect(view.getByRole('button', { name: i18n.ts._tip.send })).toHaveProperty('disabled', false);
	await fireEvent.submit(view.container.querySelector('form')!);
	await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('i/wallet/tip', expect.objectContaining({ message: allowed })));
});

test('超时后重新打开和再次被拒绝都保留同一请求，避免重复扣款', async () => {
	const requests: unknown[] = [];
	mocks.api.mockImplementation(async (endpoint, request) => {
		if (endpoint === 'i/wallet') return { balance: requests.length ? 0 : 1000 };
		requests.push(request);
		if (requests.length === 1) throw new Error('response lost');
		if (requests.length === 2) throw Object.assign(new Error('Not allowed'), { code: 'WALLET_NOT_ALLOWED' });
		return { balance: 0, amount: 12.34, sent: false };
	});
	const first = render(MkTipDialog, options);
	await fireEvent.update(first.getByLabelText(i18n.ts._tip.amount), '12.34');
	await fireEvent.update(first.getByLabelText(i18n.ts._tip.message), '谢谢');
	await fireEvent.submit(first.getByRole('button', { name: i18n.ts._tip.send }).closest('form')!);
	await waitFor(() => expect(first.getByRole('alert').textContent).toBe(i18n.ts._tip.responseUnavailable));
	first.unmount();
	const second = render(MkTipDialog, options);
	expect(second.getByLabelText(i18n.ts._tip.amount)).toHaveProperty('disabled', true);
	expect(second.getByLabelText(i18n.ts._tip.message)).toHaveProperty('disabled', true);
	await fireEvent.submit(second.getByRole('button', { name: i18n.ts.retry }).closest('form')!);
	await waitFor(() => expect(second.getByRole('alert').textContent).toBe(i18n.ts._tip.notAllowed));
	expect(second.getByLabelText(i18n.ts._tip.amount)).toHaveProperty('disabled', true);
	expect(localStorage.getItem(storageKey)).not.toBeNull();
	await fireEvent.submit(second.getByRole('button', { name: i18n.ts.retry }).closest('form')!);
	await waitFor(() => expect(second.emitted('sent')).toHaveLength(1));
	expect(requests).toHaveLength(3);
	expect(requests[1]).toEqual(requests[0]);
	expect(requests[2]).toEqual(requests[0]);
	expect(mocks.confirm).not.toHaveBeenCalled();
	expect(localStorage.getItem(storageKey)).toBeNull();
});

test('首次请求被明确拒绝后允许修改金额再发送', async () => {
	const requests: { amount: number; requestId: string }[] = [];
	mocks.api.mockImplementation(async (endpoint, request) => {
		if (endpoint === 'i/wallet') return { balance: 1000 };
		requests.push(request);
		if (requests.length === 1) throw Object.assign(new Error('Insufficient balance'), { code: 'INSUFFICIENT_BALANCE' });
		return { balance: 0, amount: request.amount, sent: true };
	});
	const view = render(MkTipDialog, options);
	await fireEvent.submit(view.getByRole('button', { name: i18n.ts._tip.send }).closest('form')!);
	await waitFor(() => expect(view.getByRole('alert').textContent).toBe(i18n.ts._wallet.insufficientBalance));
	expect(localStorage.getItem(storageKey)).toBeNull();
	await fireEvent.update(view.getByLabelText(i18n.ts._tip.amount), '1');
	await fireEvent.submit(view.getByRole('button', { name: i18n.ts._tip.send }).closest('form')!);
	await waitFor(() => expect(view.emitted('sent')).toHaveLength(1));
	expect(requests[1].amount).toBe(1);
	expect(requests[1].requestId).not.toBe(requests[0].requestId);
	expect(mocks.confirm).not.toHaveBeenCalled();
});

test('无法持久化请求时不发起打赏', async () => {
	vi.spyOn(miLocalStorage, 'setItem').mockImplementation(() => { throw new Error('storage full'); });
	const view = render(MkTipDialog, options);
	await fireEvent.submit(view.getByRole('button', { name: i18n.ts._tip.send }).closest('form')!);
	await waitFor(() => expect(view.getByRole('alert').textContent).toBe(i18n.ts._tip.saveFailed));
	expect(mocks.api.mock.calls.some(([endpoint]) => endpoint === 'i/wallet/tip')).toBe(false);
});

test('同一作者不同内容的待确认打赏分别保存并携带准确目标', async () => {
	mocks.api.mockImplementation(async endpoint => {
		if (endpoint === 'i/wallet') return { balance: 1000 };
		throw new Error('response lost');
	});
	const first = render(MkTipDialog, { ...options, props: { recipient, target: { type: 'note', id: 'first' } } });
	expect(first.getByText(i18n.ts._tip.publicRecord)).toBeTruthy();
	await fireEvent.click(first.getByRole('button', { name: i18n.tsx._tip.presetAmount({ coins: 20 }) }));
	await fireEvent.submit(first.container.querySelector('form')!);
	await waitFor(() => expect(first.getByRole('button', { name: i18n.ts.retry })).toBeTruthy());
	first.unmount();
	const second = render(MkTipDialog, { ...options, props: { recipient, target: { type: 'page', id: 'second' } } });
	expect(second.queryByRole('button', { name: i18n.ts.retry })).toBeNull();
	await fireEvent.click(second.getByRole('button', { name: i18n.tsx._tip.presetAmount({ coins: 5 }) }));
	await fireEvent.submit(second.container.querySelector('form')!);
	await waitFor(() => expect(second.getByRole('button', { name: i18n.ts.retry })).toBeTruthy());
	const requests = mocks.api.mock.calls.filter(([endpoint]) => endpoint === 'i/wallet/tip').map(([, request]) => request);
	expect(requests[0]).toMatchObject({ userId: recipient.id, targetType: 'note', targetId: 'first', amount: 20 });
	expect(requests[1]).toMatchObject({ userId: recipient.id, targetType: 'page', targetId: 'second', amount: 5 });
	expect(requests[0].requestId).not.toBe(requests[1].requestId);
	second.unmount();
	const restored = render(MkTipDialog, { ...options, props: { recipient, target: { type: 'note', id: 'first' } } });
	expect(restored.getByLabelText(i18n.ts._tip.amount)).toHaveProperty('value', '20');
	expect(restored.getByRole('button', { name: i18n.ts.retry })).toBeTruthy();
	expect(localStorage.getItem(`${storageKey}:page:second`)).not.toBeNull();
});

test.each([
	['INVALID_PARAM', () => i18n.ts._tip.invalidInput],
	['NO_SUCH_USER', () => i18n.ts._tip.userUnavailable],
	['BALANCE_LIMIT_EXCEEDED', () => i18n.ts._tip.recipientBalanceLimit],
	['RATE_LIMIT_EXCEEDED', () => i18n.ts._tip.tooFrequent],
	['AUTHENTICATION_FAILED', () => i18n.ts._tip.signinRequired],
	['YOUR_ACCOUNT_SUSPENDED', () => i18n.ts._tip.accountRestricted],
] as const)('首次打赏被 %s 明确拒绝时说明原因，并允许重新填写', async (code, errorText) => {
	mocks.api.mockImplementation(async endpoint => {
		if (endpoint === 'i/wallet') return { balance: 1000 };
		throw Object.assign(new Error(code), { code });
	});
	const view = render(MkTipDialog, options);
	await fireEvent.submit(view.container.querySelector('form')!);
	await waitFor(() => expect(view.getByRole('alert').textContent).toBe(errorText()));
	expect(view.getByLabelText(i18n.ts._tip.amount)).toHaveProperty('disabled', false);
	expect(localStorage.getItem(storageKey)).toBeNull();
	expect(view.queryByText(i18n.ts._tip.pending)).toBeNull();
	await fireEvent.update(view.getByLabelText(i18n.ts._tip.amount), '5');
	expect(view.queryByRole('alert')).toBeNull();
});

test.each([
	[{ code: 'INTERNAL_ERROR' }, () => i18n.ts._tip.serverError],
	[new TypeError('Failed to fetch'), () => i18n.ts._tip.networkError],
	[{ code: 'UNKNOWN_TIP_ERROR' }, () => i18n.tsx._tip.unknownError({ code: 'UNKNOWN_TIP_ERROR' })],
] as const)('无法确认打赏结果时显示具体原因，保留原请求重试', async (cause, errorText) => {
	const requests: unknown[] = [];
	mocks.api.mockImplementation(async (endpoint, request) => {
		if (endpoint === 'i/wallet') return { balance: 1000 };
		requests.push({ ...request });
		if (requests.length === 1) throw cause;
		return { balance: 990, amount: 10, sent: false };
	});
	const view = render(MkTipDialog, options);
	await fireEvent.submit(view.container.querySelector('form')!);
	await waitFor(() => expect(view.getByRole('alert').textContent).toBe(errorText()));
	expect(view.getByText(i18n.ts._tip.pending)).toBeTruthy();
	expect(view.getByLabelText(i18n.ts._tip.amount)).toHaveProperty('disabled', true);
	expect(localStorage.getItem(storageKey)).not.toBeNull();
	await fireEvent.submit(view.container.querySelector('form')!);
	await waitFor(() => expect(view.emitted('sent')).toHaveLength(1));
	expect(requests[1]).toEqual(requests[0]);
	expect(mocks.confirm).not.toHaveBeenCalled();
});

test('内容切换后忽略旧记录和旧打赏回调，弹幕开关保存在本地', async () => {
	let resolveFirst!: (result: unknown) => void;
	const firstResponse = new Promise(resolve => { resolveFirst = resolve; });
	const result = (name: string) => ({ items: [{ id: name, user: { ...recipient, id: name, name }, amount: 5, createdAt: '2026-10-06T00:00:00.000Z' }], totalCount: 1, totalAmount: 5 });
	mocks.api.mockImplementation(async (_endpoint, request) => request.targetId === 'first' ? firstResponse : result(request.targetId));
	const view = render(MkTipSection, { ...options, props: { recipient, targetType: 'note', targetId: 'first' } });
	await view.rerender({ recipient, targetType: 'page', targetId: 'second', targetTitle: 'Second article' });
	await waitFor(() => expect(view.getByLabelText(i18n.ts._tip.barrage).textContent).toContain('second'));
	resolveFirst(result('first'));
	await firstResponse;
	await Promise.resolve();
	expect(view.queryByText('first')).toBeNull();
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._tip.title }));
	await waitFor(() => expect(mocks.popup).toHaveBeenCalledOnce());
	expect(mocks.popup.mock.lastCall![1]).toMatchObject({ recipient, target: { type: 'page', id: 'second', title: 'Second article' } });
	const sent = mocks.popup.mock.lastCall![2].sent;
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._tip.hideBarrage }));
	expect(view.queryByLabelText(i18n.ts._tip.barrage)).toBeNull();
	expect(localStorage.getItem('tip-barrage-hidden')).toBe('true');
	await view.rerender({ recipient, targetType: 'page', targetId: 'third', targetTitle: 'Third article' });
	await waitFor(() => expect(view.getByRole('button', { name: i18n.ts._tip.showBarrage })).toBeTruthy());
	expect(mocks.api).toHaveBeenCalledWith('tips/list', expect.objectContaining({ targetType: 'page', targetId: 'third' }));
	sent();
	expect(mocks.api.mock.calls.filter(([endpoint]) => endpoint === 'tips/list')).toHaveLength(3);
});

test('只暂停悬停的打赏，移开后保持原播放进度，屏外暂停全部动画', async () => {
	const motion = mockBarrageMotion();
	const pageActive = ref(true);
	mocks.api.mockResolvedValue({ items: tipRecords(2), totalCount: 2, totalAmount: 10 });
	const view = render(MkTipSection, { ...options, props: { recipient, targetType: 'page', targetId: 'motion' }, global: { ...options.global, provide: { [DI.pageActive as symbol]: pageActive } } });
	await waitFor(() => expect(motion.animations.length).toBeGreaterThan(1));
	const active = motion.animations.filter(animation => animation.state !== 'idle');
	const first = active[0];
	first.currentTime = 1234;
	const animationCount = motion.animate.mock.calls.length;
	expect(active.every(animation => animation.state === 'running')).toBe(true);
	await fireEvent.mouseEnter(first.element);
	expect(first.state).toBe('paused');
	expect(active.slice(1).every(animation => animation.state === 'running')).toBe(true);
	await fireEvent.mouseLeave(first.element);
	expect(first.state).toBe('running');
	expect(first.currentTime).toBe(1234);
	expect(first.cancel).not.toHaveBeenCalled();
	expect(motion.animate).toHaveBeenCalledTimes(animationCount);
	await fireEvent.mouseEnter(first.element);
	motion.setIntersecting(false);
	await nextTick();
	expect(active.every(animation => animation.state === 'paused')).toBe(true);
	motion.setIntersecting(true);
	await nextTick();
	expect(first.state).toBe('paused');
	expect(active.slice(1).every(animation => animation.state === 'running')).toBe(true);
	pageActive.value = false;
	await nextTick();
	expect(active.every(animation => animation.state === 'paused')).toBe(true);
	pageActive.value = true;
	await nextTick();
	expect(first.state).toBe('paused');
	expect(active.slice(1).every(animation => animation.state === 'running')).toBe(true);
});

test('弹幕最多渲染两行二十条，隐藏及卸载后取消全部动画', async () => {
	const motion = mockBarrageMotion();
	mocks.api.mockResolvedValue({ items: tipRecords(25), totalCount: 25, totalAmount: 125 });
	const view = render(MkTipSection, { ...options, props: { recipient, targetType: 'page', targetId: 'bounded' } });
	await waitFor(() => expect(motion.animations.filter(animation => animation.state !== 'idle')).toHaveLength(20));
	const barrage = view.getByLabelText(i18n.ts._tip.barrage);
	expect(barrage.querySelectorAll('ul')).toHaveLength(2);
	expect(barrage.querySelectorAll('li')).toHaveLength(20);
	const firstGeneration = motion.animations.filter(animation => animation.state !== 'idle');
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._tip.hideBarrage }));
	expect(firstGeneration.every(animation => animation.state === 'idle')).toBe(true);
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._tip.showBarrage }));
	await waitFor(() => expect(motion.animations.filter(animation => animation.state !== 'idle')).toHaveLength(20));
	const active = motion.animations.filter(animation => animation.state !== 'idle');
	view.unmount();
	expect(active.every(animation => animation.state === 'idle')).toBe(true);
	expect(motion.disconnect).toHaveBeenCalled();
});

test('系统切换为减少动态效果时取消弹幕动画并移除循环副本', async () => {
	const motion = mockBarrageMotion();
	mocks.api.mockResolvedValue({ items: tipRecords(2), totalCount: 2, totalAmount: 10 });
	const view = render(MkTipSection, { ...options, props: { recipient, targetType: 'page', targetId: 'reduced' } });
	await waitFor(() => expect(motion.animations.length).toBeGreaterThan(2));
	expect(view.getAllByRole('listitem')).toHaveLength(2);
	motion.media.matches = true;
	motion.media.dispatchEvent(new Event('change'));
	await nextTick();
	expect(motion.animations.every(animation => animation.state === 'idle')).toBe(true);
	expect(view.getByLabelText(i18n.ts._tip.barrage).querySelectorAll('li')).toHaveLength(2);
	motion.media.matches = false;
	motion.media.dispatchEvent(new Event('change'));
	await nextTick();
	expect(motion.animations.some(animation => animation.state === 'running')).toBe(true);
});

test.each(['note', 'page'] as const)('%s 的打赏弹幕不显示寄语，底部仅保留完整统计', async targetType => {
	const message = '<b>谢谢分享</b>\n期待后续！';
	const items = [
		{ id: 'with-message', user: recipient, amount: 5, message, createdAt: '2026-10-06T00:00:00.000Z' },
		{ id: 'without-message', user: null, amount: 10, message: null, createdAt: '2026-10-06T00:00:00.000Z' },
	];
	mocks.api.mockResolvedValue({ items, totalCount: 24, totalAmount: 515 });
	const view = render(MkTipSection, { ...options, props: { recipient, targetType, targetId: 'content' } });
	await waitFor(() => expect(view.getByLabelText(i18n.ts._tip.barrage).textContent).toContain('Alice'));
	expect(view.getByLabelText(i18n.ts._tip.barrage).textContent).not.toContain('谢谢分享');
	const summary = view.getByText(i18n.tsx._tip.summary({ count: 24, coins: (515).toLocaleString() }));
	expect(summary.closest('button, a')).toBeNull();
	await fireEvent.click(summary);
	expect(mocks.popup).not.toHaveBeenCalled();
});
