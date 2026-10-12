/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import type { App } from 'vue';
import type * as Misskey from 'misskey-js';
import XMessage from '@/pages/chat/XMessage.vue';

const mocks = vi.hoisted(() => ({
	api: vi.fn(),
	alert: vi.fn(),
	toast: vi.fn(),
	popup: vi.fn(() => ({ dispose: vi.fn() })),
	popupMenu: vi.fn(),
	contextMenu: vi.fn(),
	me: { id: 'me', username: 'me', host: null, policies: { chatAvailability: 'available' } },
}));

vi.mock('misskey-js', () => ({}));
vi.mock('@/i.js', () => ({ ensureSignin: () => mocks.me }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/utility/reaction-picker.js', () => ({ reactionPicker: { show: vi.fn() } }));
vi.mock('@/utility/sound.js', () => ({ playMisskeySfx: vi.fn() }));
vi.mock('@/os.js', () => ({ alert: mocks.alert, toast: mocks.toast, popup: mocks.popup, popupMenu: mocks.popupMenu, contextMenu: mocks.contextMenu }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: true } } }));
vi.mock('@/composables/use-tooltip.js', () => ({ useTooltip: vi.fn() }));
vi.mock('@/components/MkUrlPreview.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkMediaList.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkRedPacket.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkReactionIcon.vue', async () => {
	const { defineComponent, h: createNode } = await import('vue');
	return { default: defineComponent({ props: ['reaction'], setup: props => () => createNode('span', props.reaction) }) };
});
vi.mock('@/components/MkFukidashi.vue', async () => {
	const { defineComponent, h: createNode } = await import('vue');
	return { default: defineComponent({ setup: (_, { slots }) => () => createNode('div', slots.default?.()) }) };
});
vi.mock('@/i18n.js', () => ({ i18n: {
	ts: { reaction: '回应', somethingHappened: '操作失败', _chat: { addReaction: '添加回应', reactionLimit: '回应已满' } },
	tsx: { _chat: { reactionLabel: ({ reaction, count }: { reaction: string; count: number }) => `${reaction}，${count} 人` } },
} }));

const fixtures: { app: App; host: HTMLElement }[] = [];

async function mountMessage() {
	const peer = { id: 'peer', username: 'peer', host: null } as Misskey.entities.UserLite;
	const message = reactive({
		id: 'message', fromUserId: peer.id, fromUser: peer, text: '消息', createdAt: '2026-10-04T00:00:00Z',
		reactions: [
			{ reaction: ':first:', user: peer },
			{ reaction: ':second:', user: mocks.me },
			{ reaction: ':third:', user: mocks.me },
		],
	} as Misskey.entities.ChatMessage);
	const host = document.createElement('div');
	host.style.cssText = 'width:600px;margin:20px;';
	document.body.append(host);
	const app = createApp({ render: () => h(XMessage, { message, liveSync: true }) });
	for (const name of ['MkAvatar', 'MkUserName', 'MkTime', 'MkA', 'Mfm']) app.component(name, { render: () => null });
	app.directive('tooltip', () => {});
	app.mount(host);
	fixtures.push({ app, host });
	await nextTick();
	const buttons = host.querySelectorAll<HTMLButtonElement>('button[aria-pressed]');
	return { host, message, first: buttons[0], second: buttons[1], third: buttons[2] };
}

beforeEach(() => { vi.clearAllMocks(); mocks.api.mockResolvedValue(undefined); });
afterEach(() => {
	for (const { app, host } of fixtures.splice(0)) {
		app.unmount();
		host.remove();
	}
});

describe('聊天回应撤回动画', () => {
	test('右键和触屏长按打开气泡菜单，滑动不误触发', async () => {
		const { host } = await mountMessage();
		const bubble = host.querySelector<HTMLElement>('[data-chat-bubble]')!;
		expect(host.querySelector('button[aria-label="添加回应"]')).not.toBeNull();
		bubble.dispatchEvent(new PointerEvent('contextmenu', { bubbles: true, cancelable: true }));
		expect(mocks.contextMenu).toHaveBeenCalledOnce();
		vi.useFakeTimers();
		try {
			bubble.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', clientX: 50, clientY: 50 }));
			bubble.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'touch', clientX: 50, clientY: 100 }));
			await vi.advanceTimersByTimeAsync(450);
			expect(mocks.popupMenu).not.toHaveBeenCalled();
			bubble.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', clientX: 50, clientY: 50 }));
			await vi.advanceTimersByTimeAsync(450);
			expect(mocks.popupMenu).toHaveBeenCalledOnce();
		} finally {
			vi.useRealTimers();
		}
	});

	test('点击别人的已有回应合并计数，并使用共享添加特效', async () => {
		const { message, first } = await mountMessage();
		first.click();
		await expect.poll(() => first.getAttribute('aria-pressed')).toBe('true');
		expect(first.textContent).toContain('2');
		expect(message.reactions.filter(record => record.reaction === ':first:')).toHaveLength(2);
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('chat/messages/react', { messageId: 'message', reaction: ':first:' });
		await expect.poll(() => mocks.popup.mock.calls.length).toBe(1);
	});

	test('流事件在同一轮更新中删除回应时，只有点击的 chip 淡出并在动画结束后移除', async () => {
		const { host, message, first, second, third } = await mountMessage();
		mocks.api.mockImplementation(() => {
			message.reactions.splice(1, 1);
			return Promise.resolve();
		});
		second.click();
		await nextTick();
		const animation = second.getAnimations().find(item => item.effect instanceof KeyframeEffect && item.effect.target === second);
		expect(animation).toBeDefined();
		expect(mocks.api).not.toHaveBeenCalled();
		expect(second.isConnected).toBe(true);
		animation!.pause();
		animation!.currentTime = 210;
		expect(Number(getComputedStyle(second).opacity)).toBeLessThan(1);
		expect(getComputedStyle(second).transform).not.toBe('none');
		expect(getComputedStyle(first).opacity).toBe('1');
		expect(getComputedStyle(third).opacity).toBe('1');
		animation!.finish();
		await expect.poll(() => second.isConnected).toBe(false);
		expect(host.contains(first)).toBe(true);
		expect(host.contains(third)).toBe(true);
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('chat/messages/unreact', { messageId: 'message', reaction: ':second:' });
	});

	test('其他用户撤回回应时不误触发前一个 chip 的动画', async () => {
		const { message, first, second, third } = await mountMessage();
		message.reactions.splice(1, 1);
		await nextTick();
		expect(second.isConnected).toBe(false);
		expect(getComputedStyle(first).opacity).toBe('1');
		expect(getComputedStyle(third).opacity).toBe('1');
		expect(mocks.api).not.toHaveBeenCalled();
	});

	test('连续撤回不同回应时，每次都先播放点击表情的动画', async () => {
		const { message, first, second, third } = await mountMessage();
		second.click();
		await nextTick();
		second.getAnimations()[0].finish();
		await expect.poll(() => third.disabled).toBe(false);
		expect(second.isConnected).toBe(false);
		third.click();
		await nextTick();
		expect(mocks.api).toHaveBeenCalledTimes(1);
		const animation = third.getAnimations().find(item => item.effect instanceof KeyframeEffect && item.effect.target === third);
		expect(animation).toBeDefined();
		expect(third.isConnected).toBe(true);
		animation!.finish();
		await expect.poll(() => third.isConnected).toBe(false);
		expect(mocks.api).toHaveBeenCalledTimes(2);
		expect(message.reactions).toHaveLength(1);
		expect(getComputedStyle(first).opacity).toBe('1');
	});

	test('合并项撤回只改变计数和选中状态，保留 chip 且不播放离场动画', async () => {
		const { message, first, second, third } = await mountMessage();
		message.reactions.push({ reaction: ':second:', user: message.fromUser! });
		await nextTick();
		mocks.api.mockImplementation(() => {
			message.reactions.splice(1, 1);
			return Promise.resolve();
		});
		second.click();
		await nextTick();
		expect(second.getAnimations().filter(item => !(item instanceof CSSTransition))).toHaveLength(0);
		expect(getComputedStyle(second).opacity).toBe('1');
		expect(getComputedStyle(first).opacity).toBe('1');
		expect(getComputedStyle(third).opacity).toBe('1');
		await expect.poll(() => second.getAttribute('aria-pressed')).toBe('false');
		expect(second.textContent).toContain('1');
		expect(second.isConnected).toBe(true);
		message.reactions = message.reactions.filter(record => record.reaction !== ':second:');
		await nextTick();
		expect(second.isConnected).toBe(false);
	});

	test('撤回请求失败时恢复点击表情的外观和计数', async () => {
		const { second } = await mountMessage();
		mocks.api.mockRejectedValue(new Error('请求失败'));
		second.click();
		await nextTick();
		second.getAnimations()[0].finish();
		await expect.poll(() => mocks.toast.mock.calls.length).toBe(1);
		expect(second.isConnected).toBe(true);
		expect(second.getAttribute('aria-pressed')).toBe('true');
		expect(getComputedStyle(second).opacity).toBe('1');
		expect(second.textContent).toContain('1');
	});
});
