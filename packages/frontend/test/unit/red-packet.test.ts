/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { nextTick } from 'vue';
import { createRedPacketDraft, redPacketValidation, redPacketRequestRejected } from '@/utility/red-packet.js';
import { validExchange } from '@/utility/wallet.js';
import MkRedPacket from '@/components/MkRedPacket.vue';
import MkRedPacketClaimDialog from '@/components/MkRedPacketClaimDialog.vue';
import MkRedPacketDialog from '@/components/MkRedPacketDialog.vue';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({ api: vi.fn(), confirm: vi.fn(), upload: vi.fn(), selectUser: vi.fn(), popup: vi.fn(), toast: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/utility/autocomplete.js', () => ({ Autocomplete: class { detach() {} } }));
vi.mock('@/i.js', () => ({ $i: { id: 'recipient' }, ensureSignin: () => ({ id: 'recipient' }) }));
vi.mock('@/os.js', () => ({ confirm: mocks.confirm, launchUploader: mocks.upload, selectUser: mocks.selectUser, popupAsyncWithDialog: mocks.popup, toast: mocks.toast }));
vi.mock('@/components/MkModalWindow.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({ setup(_props, { slots, expose, emit }) {
		expose({ close: () => emit('closed') });
		return () => h('div', [h('button', { onClick: () => emit('close') }, 'Close dialog'), slots.header?.(), slots.default?.(), slots.footer?.()]);
	} }) };
});
vi.mock('@/components/MkModal.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({ emits: ['closed', 'click', 'esc'], setup(_props, { slots, expose, emit }) {
		expose({ close: () => emit('closed') });
		return () => h('div', slots.default?.({ maxHeight: 600 }));
	} }) };
});
vi.mock('@/components/MkButton.vue', () => ({ default: { props: ['disabled'], template: '<button :disabled="disabled"><slot/></button>' } }));
vi.mock('@/components/MkSelect.vue', () => ({ default: {
	props: ['modelValue', 'items', 'disabled'],
	emits: ['update:modelValue'],
	template: '<label><slot name="label"/><select :value="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :value="item.value">{{ item.label }}</option></select></label>',
} }));

const packet = { id: 'packet', senderId: 'sender', roomId: null, kind: 'group' as const, audience: 'public' as const, coverId: 'classic' as const, mode: 'random' as const, message: '', totalCoins: 20, count: 2, remainingCoins: 20, remainingCount: 2, expiresAt: '2099-01-01T00:00:00.000Z', status: 'active' as const, coverFileId: null, coverUrl: null, startsAt: null, serverTime: '2026-10-03T00:00:00.000Z', password: null, claimedCoins: null };
const global = { directives: { 'adaptive-border': () => {} }, stubs: { MkTime: true, MkLoading: true, MkAvatar: true, MkUserName: { props: ['user'], template: '<span>{{ user.name }}</span>' }, MkAcct: { props: ['user'], template: '<span>@{{ user.username }}</span>' }, MkA: true, Mfm: true } };
beforeEach(() => { localStorage.clear(); mocks.confirm.mockResolvedValue({ canceled: false }); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('independent packet creation', () => {
	test('聊天口令模式保存短语并使用随机金额，切回普通红包清除口令', async () => {
		mocks.api.mockImplementation(async (endpoint, data) => endpoint === 'i/wallet' ? { balance: 100 } : { ...packet, ...data });
		const view = render(MkRedPacketDialog, { props: { kind: 'group', roomId: 'room', chat: true }, global });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.passwordPacket }));
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.ordinaryPacket }));
		expect(view.queryByRole('textbox', { name: i18n.ts._redPacket.password })).toBeNull();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.passwordPacket }));
		await fireEvent.update(view.getByRole('textbox', { name: i18n.ts._redPacket.password }), '好运常在');
		const input = view.getByRole('textbox', { name: i18n.ts._redPacket.password }) as HTMLInputElement;
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.randomPassword }));
		const firstGreeting = input.value;
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.randomPassword }));
		const greeting = input.value;
		expect(greeting).not.toBe(firstGreeting);
		expect(Object.values(i18n.ts._redPacket._passwordGreetings)).toContain(greeting);
		expect(Array.from(greeting).length).toBeLessThanOrEqual(18);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.create }));
		await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('red-packets/create', expect.objectContaining({ password: greeting, mode: 'random', roomId: 'room' })));
	});
	test.each(['福'.repeat(19), '🎁'.repeat(19)])('limits a new password to 18 Unicode characters: %s', async password => {
		mocks.api.mockImplementation(async (endpoint, data) => endpoint === 'i/wallet' ? { balance: 100 } : { ...packet, ...data });
		const view = render(MkRedPacketDialog, { props: { kind: 'group', roomId: 'room', chat: true }, global });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.passwordPacket }));
		const input = view.getByRole('textbox', { name: i18n.ts._redPacket.password });
		await fireEvent.update(input, password);
		const expected = Array.from(password).slice(0, 18).join('');
		expect(input).toHaveProperty('value', expected);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.create }));
		await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('red-packets/create', expect.objectContaining({ password: expected })));
	});
	test.each(['福'.repeat(18), '福'.repeat(19), '🎁'.repeat(18), '🎁'.repeat(19)])('limits message input and submission to 18 Unicode characters: %s', async message => {
		mocks.api.mockImplementation(async (endpoint, data) => endpoint === 'i/wallet' ? { balance: 100 } : { ...packet, ...data });
		const view = render(MkRedPacketDialog, { global });
		const input = view.getByRole('textbox', { name: i18n.ts._redPacket.message });
		const expected = Array.from(message).slice(0, 18).join('');
		await fireEvent.update(input, message);
		expect(input).toHaveProperty('value', expected);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.create }));
		await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('red-packets/create', expect.objectContaining({ message: expected })));
	});

	test('waits for Chinese composition to finish before limiting the message', async () => {
		mocks.api.mockImplementation(async (endpoint, data) => endpoint === 'i/wallet' ? { balance: 100 } : { ...packet, ...data });
		const view = render(MkRedPacketDialog, { global });
		const input = view.getByRole('textbox', { name: i18n.ts._redPacket.message }) as HTMLInputElement;
		await fireEvent.compositionStart(input);
		input.value = '福'.repeat(19);
		await fireEvent(input, new InputEvent('input', { bubbles: true, isComposing: true }));
		expect(input.value).toBe('福'.repeat(19));
		await fireEvent.compositionEnd(input);
		expect(input.value).toBe('福'.repeat(18));
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.create }));
		await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('red-packets/create', expect.objectContaining({ message: '福'.repeat(18) })));
	});

	test('旧预约草稿恢复成即时红包，保留金额和祝福语', async () => {
		const draft = { ...createRedPacketDraft(), totalCoins: 25, message: '好运常在', startsAt: '2099-01-01T00:00:00Z', expiresInHours: 2 };
		localStorage.setItem('red-packet-create:recipient:group:public:', JSON.stringify({ draft }));
		mocks.api.mockImplementation(async (endpoint, data) => endpoint === 'i/wallet' ? { balance: 100 } : { ...packet, ...data });
		const view = render(MkRedPacketDialog, { global });
		expect(view.queryByRole('checkbox', { name: i18n.ts._redPacket.schedule })).toBeNull();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.create }));
		await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('red-packets/create', expect.objectContaining({ totalCoins: 25, message: '好运常在', expiresInHours: 24 })));
		expect(mocks.api.mock.calls.find(([endpoint]) => endpoint === 'red-packets/create')?.[1]).not.toHaveProperty('startsAt');
		expect(view.emitted('created')).toHaveLength(1);
	});

	test.each([19, 32])('旧%d字口令待确认请求保留原 requestId，重试不新建草稿', async length => {
		const draft = { ...createRedPacketDraft('group', [], 'room'), password: '福'.repeat(length) };
		localStorage.setItem('red-packet-create:recipient:group:room:room:', JSON.stringify({ draft, pending: true }));
		mocks.api.mockImplementation(async (endpoint, data) => endpoint === 'i/wallet' ? { balance: 100 } : { ...packet, ...data });
		const view = render(MkRedPacketDialog, { props: { kind: 'group', roomId: 'room', chat: true }, global });
		expect(view.getByRole('textbox', { name: i18n.ts._redPacket.password })).toHaveProperty('value', draft.password);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.retry }));
		await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('red-packets/create', expect.objectContaining({ requestId: draft.requestId, password: draft.password })));
		expect(mocks.api.mock.calls.filter(([endpoint]) => endpoint === 'red-packets/create')).toHaveLength(1);
	});

	test.each([true, false])('余额已扣除时，旧长口令已创建记录只查询原红包，待确认：%s', async pending => {
		const draft = { ...createRedPacketDraft('group', [], 'room'), password: '福'.repeat(32) };
		localStorage.setItem('red-packet-create:recipient:group:room:room:', JSON.stringify({ draft, pending, createdPacketId: 'old-packet' }));
		mocks.api.mockImplementation(async endpoint => endpoint === 'i/wallet' ? { balance: 0 } : { ...packet, id: 'old-packet', password: draft.password });
		const view = render(MkRedPacketDialog, { props: { kind: 'group', roomId: 'room', chat: true }, global });
		await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('i/wallet'));
		await nextTick();
		await fireEvent.click(view.getByRole('button', { name: pending ? i18n.ts.retry : i18n.ts._redPacket.create }));
		await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('red-packets/show', { redPacketId: 'old-packet' }));
		expect(mocks.api.mock.calls.some(([endpoint]) => endpoint === 'red-packets/create')).toBe(false);
	});

	test.each([true, false])('旧预约待确认请求只在确认未创建后才转为即时红包，已创建：%s', async exists => {
		const draft = { ...createRedPacketDraft(), startsAt: '2099-01-01T00:00:00Z', expiresInHours: 2 };
		localStorage.setItem('red-packet-create:recipient:group:public:', JSON.stringify({ draft, pending: true }));
		mocks.api.mockImplementation(async (endpoint, data) => {
			if (endpoint === 'i/wallet') return { balance: 100 };
			if (data.startsAt && !exists) throw Object.assign(new Error('Invalid red packet'), { code: 'INVALID_RED_PACKET' });
			return { ...packet, ...data, status: data.startsAt ? 'scheduled' : 'active' };
		});
		const view = render(MkRedPacketDialog, { global });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.retry }));
		await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('red-packets/create', expect.objectContaining({ requestId: draft.requestId, startsAt: draft.startsAt, expiresInHours: draft.expiresInHours })));
		if (!exists) {
			await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(i18n.ts._redPacket.invalidDraft, 'error'));
			expect(mocks.api.mock.calls.filter(([endpoint]) => endpoint === 'red-packets/create')).toHaveLength(1);
			await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.create }));
		}
		await waitFor(() => expect(view.emitted('created')).toHaveLength(1));
		const requests = mocks.api.mock.calls.filter(([endpoint]) => endpoint === 'red-packets/create').map(([, request]) => request);
		expect(requests).toHaveLength(exists ? 1 : 2);
		if (!exists) {
			expect(requests[1]).not.toHaveProperty('startsAt');
			expect(requests[1]).toMatchObject({ expiresInHours: 24 });
			expect(requests[1].requestId).not.toBe(draft.requestId);
		}
	});

	test('设备时钟不影响服务端待生效状态，不能提前领取', async () => {
		const state = { ...packet, status: 'scheduled' as const, startsAt: '2026-10-04T10:00:00Z', claims: [] };
		const now = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2099-01-01T00:00:00Z'));
		mocks.api.mockResolvedValue(state);
		try {
			const view = render(MkRedPacketClaimDialog, { props: { redPacketId: state.id, authorId: state.senderId, redPacket: state }, global });
			await waitFor(() => expect(view.getByRole('status').textContent).toBe(i18n.ts._redPacket.scheduled));
			expect(view.queryByRole('button', { name: i18n.ts._redPacket.claim })).toBeNull();
			expect(mocks.api.mock.calls.some(([endpoint]) => endpoint === 'red-packets/claim')).toBe(false);
		} finally { now.mockRestore(); }
	});
	test('a single-owner room creates a dynamic group audience without recipient snapshots', async () => {
		mocks.api.mockImplementation(async (endpoint, data) => endpoint === 'i/wallet' ? { balance: 100 } : { ...packet, ...data });
		const view = render(MkRedPacketDialog, { props: { kind: 'group', roomId: 'room' }, global });
		expect(view.queryByRole('button', { name: i18n.ts._redPacket.passwordPacket })).toBeNull();
		expect(view.queryByRole('button', { name: i18n.ts._redPacket.direct })).toBeNull();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.create }));
		await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('red-packets/create', expect.objectContaining({ audience: 'room', roomId: 'room', recipientIds: [] })));
		expect(mocks.api.mock.calls.some(([endpoint]) => endpoint === 'chat/rooms/members')).toBe(false);
	});
	test('私聊固定当前收件人，只提供普通和口令红包，不需要选择用户', async () => {
		mocks.api.mockImplementation(async (endpoint, data) => endpoint === 'i/wallet' ? { balance: 100 } : endpoint === 'users/show' ? [{ id: 'target', username: 'target' }] : { ...packet, ...data });
		const view = render(MkRedPacketDialog, { props: { kind: 'direct', recipientIds: ['target'], chat: true }, global });
		expect(view.getByRole('button', { name: i18n.ts._redPacket.ordinaryPacket })).toBeTruthy();
		expect(view.getByRole('button', { name: i18n.ts._redPacket.passwordPacket })).toBeTruthy();
		expect(view.queryByRole('button', { name: i18n.ts._redPacket.luckyPacket })).toBeNull();
		expect(view.queryByRole('button', { name: i18n.ts.selectUser })).toBeNull();
		expect(view.queryByLabelText(i18n.ts._redPacket.count)).toBeNull();
		await waitFor(() => expect(view.getByRole('button', { name: i18n.ts._redPacket.create })).toHaveProperty('disabled', false));
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.create }));
		await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('red-packets/create', expect.objectContaining({ kind: 'direct', audience: 'recipients', recipientIds: ['target'], count: 1, mode: 'equal' })));
	});

	test('fixed amounts are entered per person and total updates when count changes', async () => {
		mocks.api.mockImplementation(async (endpoint, data) => endpoint === 'i/wallet' ? { balance: 100 } : { ...packet, ...data });
		const view = render(MkRedPacketDialog, { global });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.ordinaryPacket }));
		await fireEvent.update(view.getByLabelText(i18n.ts._redPacket.eachAmount), '7');
		await fireEvent.update(view.getByLabelText(i18n.ts._redPacket.count), '3');
		expect(view.getByLabelText(i18n.ts._redPacket.eachAmount)).toHaveProperty('value', '7');
		await fireEvent.update(view.getByLabelText(i18n.ts._redPacket.count), '');
		await fireEvent.update(view.getByLabelText(i18n.ts._redPacket.count), '5');
		expect(view.getByLabelText(i18n.ts._redPacket.eachAmount)).toHaveProperty('value', '7');
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.create }));
		await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('red-packets/create', expect.objectContaining({ kind: 'group', mode: 'equal', totalCoins: 35, count: 5 })));
	});

	test.each(['equal', 'random'] as const)('limits the %s total to 1000 even when the wallet covers more', async mode => {
		mocks.api.mockImplementation(async (endpoint, data) => endpoint === 'i/wallet' ? { balance: 2000000000 } : { ...packet, ...data });
		const view = render(MkRedPacketDialog, { global });
		await fireEvent.click(view.getByRole('button', { name: mode === 'equal' ? i18n.ts._redPacket.ordinaryPacket : i18n.ts._redPacket.luckyPacket }));
		const amount = view.getByLabelText(mode === 'equal' ? i18n.ts._redPacket.eachAmount : i18n.ts._redPacket.totalAmount);
		expect(amount.getAttribute('step')).toBe('0.01');
		expect(amount.getAttribute('max')).toBe(mode === 'equal' ? '200' : '1000');
		await fireEvent.update(amount, mode === 'equal' ? '200.01' : '1000.01');
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.create }));
		expect(view.getByRole('button', { name: i18n.ts._redPacket.create })).toHaveProperty('disabled', true);
		expect(mocks.confirm).not.toHaveBeenCalled();
		await fireEvent.update(amount, mode === 'equal' ? '200' : '1000');
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.create }));
		await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('red-packets/create', expect.objectContaining({ mode, totalCoins: 1000 })));
	});

	test('restores decimal fixed amounts and computes the exact total after count changes', async () => {
		const draft = { ...createRedPacketDraft(), mode: 'equal', totalCoins: 1.2, count: 3 };
		localStorage.setItem('red-packet-create:recipient:group:public:', JSON.stringify({ draft }));
		mocks.api.mockImplementation(async (endpoint, data) => endpoint === 'i/wallet' ? { balance: 100 } : { ...packet, ...data });
		const view = render(MkRedPacketDialog, { global });
		expect(view.getByLabelText(i18n.ts._redPacket.eachAmount)).toHaveProperty('value', '0.4');
		await fireEvent.update(view.getByLabelText(i18n.ts._redPacket.count), '4');
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.create }));
		await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('red-packets/create', expect.objectContaining({ totalCoins: 1.6, count: 4 })));
	});

	test.each([{ total: 1, count: 3, expected: 1.02 }, { total: 1000, count: 6, expected: 999.96 }])('switches $total coins to fixed shares within the allowed total', async ({ total, count, expected }) => {
		mocks.api.mockImplementation(async (endpoint, data) => endpoint === 'i/wallet' ? { balance: 1000 } : { ...packet, ...data });
		const view = render(MkRedPacketDialog, { global });
		await fireEvent.update(view.getByLabelText(i18n.ts._redPacket.totalAmount), String(total));
		await fireEvent.update(view.getByLabelText(i18n.ts._redPacket.count), String(count));
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.ordinaryPacket }));
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.create }));
		await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('red-packets/create', expect.objectContaining({ totalCoins: expected })));
	});

	test('does not silently round per-person input with more than two decimals', async () => {
		mocks.api.mockResolvedValue({ balance: 1000 });
		const view = render(MkRedPacketDialog, { global });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.ordinaryPacket }));
		await fireEvent.update(view.getByLabelText(i18n.ts._redPacket.count), '10');
		await fireEvent.update(view.getByLabelText(i18n.ts._redPacket.eachAmount), '0.105');
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.create }));
		expect(view.getByRole('button', { name: i18n.ts._redPacket.create })).toHaveProperty('disabled', true);
		expect(mocks.confirm).not.toHaveBeenCalled();
		await fireEvent.update(view.getByLabelText(i18n.ts._redPacket.eachAmount), '0.29');
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.create }));
		await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('red-packets/create', expect.objectContaining({ totalCoins: 2.9 })));
	});

	test('retains the same request after a lost response', async () => {
		const requests: unknown[] = [];
		mocks.api.mockImplementation(async (endpoint: string, data: unknown) => {
			if (endpoint === 'i/wallet') return { balance: 100 };
			requests.push(data);
			if (requests.length === 1) throw new Error('response lost');
			return { ...packet };
		});
		const first = render(MkRedPacketDialog, { global });
		expect(first.queryByRole('button', { name: i18n.ts.remove })).toBeNull();
		expect(first.queryByRole('button', { name: i18n.ts.cancel })).toBeNull();
		await fireEvent.click(first.getByRole('button', { name: i18n.ts._redPacket.create }));
		await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(i18n.ts._redPacket.operationFailed, 'error'));
		expect(first.queryByRole('alert')).toBeNull();
		expect(requests[0]).toEqual(expect.objectContaining({ totalCoins: 10, requestId: expect.any(String) }));
		first.unmount();
		const second = render(MkRedPacketDialog, { global });
		await fireEvent.click(second.getByRole('button', { name: i18n.ts.retry }));
		await waitFor(() => expect(second.emitted('created')).toHaveLength(1));
		expect(requests[1]).toEqual(requests[0]);
		expect(mocks.confirm).not.toHaveBeenCalled();
		expect(mocks.api.mock.calls.every(([endpoint]) => ['i/wallet', 'red-packets/create'].includes(endpoint))).toBe(true);
		expect(localStorage.getItem('red-packet-create:recipient:group:public:')).toBeNull();
	});
	test('restores recipient identities and sends a direct packet without extra confirmation', async () => {
		mocks.api.mockImplementation(async (endpoint: string, data: object) => {
			if (endpoint === 'i/wallet') return { balance: 100 };
			if (endpoint === 'users/show') return [{ id: 'target', name: 'Alice', username: 'alice' }];
			return { ...packet, ...data };
		});
		const view = render(MkRedPacketDialog, { props: { kind: 'direct', recipientIds: ['target'] }, global });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.create }));
		await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('red-packets/create', expect.objectContaining({ recipientIds: ['target'] })));
		expect(mocks.confirm).not.toHaveBeenCalled();
	});
	test('recovers issued packets regardless of attachment history', async () => {
		localStorage.setItem('red-packet-create:recipient:group:public:', JSON.stringify({ draft: createRedPacketDraft(), pending: true, createdPacketId: 'packet' }));
		mocks.api.mockImplementation(async (endpoint: string) => endpoint === 'i/wallet' ? { balance: 100 } : packet);
		const view = render(MkRedPacketDialog, { global });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.retry }));
		await waitFor(() => expect(view.emitted('created')).toHaveLength(1));
		expect(mocks.api).toHaveBeenCalledWith('red-packets/show', { redPacketId: 'packet' });
	});
	test('batches restored recipient identity lookups into at most 100 users per request', async () => {
		mocks.api.mockImplementation(async (endpoint: string) => endpoint === 'i/wallet' ? { balance: 100 } : []);
		render(MkRedPacketDialog, { props: { kind: 'group', recipientIds: Array.from({ length: 101 }, (_, index) => `user${index}`) }, global });
		await waitFor(() => expect(mocks.api.mock.calls.filter(([endpoint]) => endpoint === 'users/show')).toHaveLength(2));
		expect(mocks.api.mock.calls.filter(([endpoint]) => endpoint === 'users/show').map(([, data]) => data.userIds.length)).toEqual([100, 1]);
	});
	test('an empty fixed group cannot become a public packet', async () => {
		mocks.api.mockResolvedValue({ balance: 100 });
		const view = render(MkRedPacketDialog, { props: { kind: 'group', recipientIds: [] }, global });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.create }));
		expect(view.getByRole('button', { name: i18n.ts._redPacket.create })).toHaveProperty('disabled', true);
		expect(mocks.confirm).not.toHaveBeenCalled();
		expect(view.queryByRole('option', { name: i18n.ts._redPacket.publicAudience })).toBeNull();
	});
	test('pending transfers to another recipient are not reused in a new conversation', async () => {
		localStorage.setItem('red-packet-create:recipient:direct:recipients:first', JSON.stringify({ draft: createRedPacketDraft('direct', ['first']), pending: true }));
		mocks.api.mockImplementation(async (endpoint: string, data: object) => endpoint === 'i/wallet' ? { balance: 100 } : { ...packet, ...data });
		const view = render(MkRedPacketDialog, { props: { kind: 'direct', recipientIds: ['second'] }, global });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.create }));
		await waitFor(() => expect(view.emitted('created')).toHaveLength(1));
		expect(mocks.api).toHaveBeenCalledWith('red-packets/create', expect.objectContaining({ recipientIds: ['second'] }));
		expect(localStorage.getItem('red-packet-create:recipient:direct:recipients:first')).not.toBeNull();
	});
});

describe('red packet amounts', () => {
	test('deduplicates fixed recipients and never offers more shares than recipients', () => {
		const draft = createRedPacketDraft('group', ['first', 'first', 'second']);
		expect(draft.count).toBe(2);
		expect(draft.recipientIds).toEqual(['first', 'second']);
		expect(redPacketValidation(draft)).toBeNull();
		expect(redPacketValidation({ ...draft, count: 3 })).toBe(i18n.ts._redPacket.tooManyRecipients);
	});
	test('requires 1 to 1000 coins, cent precision and equal divisibility in cents', () => {
		const draft = createRedPacketDraft();
		expect(redPacketValidation(draft, 10)).toBeNull();
		for (const totalCoins of [0, 0.99, 1000.01, 1.001, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY]) expect(redPacketValidation({ ...draft, totalCoins })).not.toBeNull();
		for (const totalCoins of [1, 1.01, 10.5, 999.99, 1000]) expect(redPacketValidation({ ...draft, totalCoins }, totalCoins)).toBeNull();
		expect(redPacketValidation({ ...draft, mode: 'equal', totalCoins: 1.01 })).toBe(i18n.ts._redPacket.equalNotDivisible);
		expect(redPacketValidation({ ...draft, mode: 'equal', totalCoins: 1, count: 100 })).toBeNull();
		expect(redPacketValidation(draft, 9)).toBe(i18n.ts._redPacket.insufficientCoins);
	});
	test('accepts Unicode messages by code point and rejects malformed restored drafts', () => {
		const draft = createRedPacketDraft();
		expect(redPacketValidation({ ...draft, message: '🎁'.repeat(18) })).toBeNull();
		expect(redPacketValidation({ ...draft, message: '🎁'.repeat(19) })).not.toBeNull();
		expect(redPacketValidation({ ...draft, requestId: 'broken' })).not.toBeNull();
	});
	test('keeps outstanding refunds within the wallet capacity during exchange', () => {
		expect(validExchange(10, 10, 2, 10, 20)).toBe(true);
		expect(validExchange(10, 9, 2, 0, 0)).toBe(false);
		expect(validExchange(1, 10, 1, 1999999999, 1)).toBe(false);
		expect(validExchange(0.5, 10, 1, 0, 0)).toBe(false);
	});
	test('unlocks drafts after definite rejection while retaining unknown or duplicate requests', () => {
		for (const code of ['INSUFFICIENT_COINS', 'INVALID_RED_PACKET', 'RED_PACKET_NOT_ALLOWED', 'NO_SUCH_FILE']) expect(redPacketRequestRejected({ code })).toBe(true);
		for (const error of [new Error('response lost'), { code: 'REQUEST_ID_CONFLICT' }, { code: 'INTERNAL_ERROR' }]) expect(redPacketRequestRejected(error)).toBe(false);
	});
});

describe('red packet claims', () => {
	test('uses a toast and retry after details fail, without adding error text to the page', async () => {
		let shows = 0;
		mocks.api.mockImplementation(async endpoint => {
			if (endpoint === 'users/show') return { id: 'sender', username: 'sender' };
			if (++shows === 1) throw new Error('offline');
			return { ...packet, claims: [] };
		});
		const view = render(MkRedPacketClaimDialog, { props: { redPacketId: packet.id, authorId: 'sender', redPacket: packet }, global });
		await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(i18n.ts._redPacket.operationFailed, 'error'));
		expect(view.queryByRole('alert')).toBeNull();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.viewClaimDetails }));
		expect(view.queryByText(i18n.ts._redPacket.unavailable)).toBeNull();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.retry }));
		await waitFor(() => expect(view.getByText(i18n.ts._redPacket.noClaims)).toBeTruthy());
		expect(view.queryByRole('button', { name: i18n.ts.retry })).toBeNull();
	});

	test('uses a toast after a failed claim and allows another claim', async () => {
		let claims = 0;
		mocks.api.mockImplementation(async endpoint => {
			if (endpoint === 'users/show') return { id: 'sender', username: 'sender' };
			if (endpoint === 'red-packets/claim') {
				if (++claims === 1) throw new Error('offline');
				return { ...packet, claimedCoins: 5, claims: [] };
			}
			return { ...packet, claims: [] };
		});
		const view = render(MkRedPacketClaimDialog, { props: { redPacketId: packet.id, authorId: 'sender', redPacket: packet }, global });
		await waitFor(() => expect(view.getByRole('button', { name: i18n.ts._redPacket.claim })).toHaveProperty('disabled', false));
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.claim }));
		await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(i18n.ts._redPacket.operationFailed, 'error'));
		expect(view.queryByRole('alert')).toBeNull();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.claim }));
		await waitFor(() => expect(view.emitted('claimed')).toHaveLength(1));
		expect(claims).toBe(2);
	});

	test('notifies the wallet when retry recovers a claim after both responses were lost', async () => {
		let shows = 0;
		mocks.api.mockImplementation(async endpoint => {
			if (endpoint === 'users/show') return { id: 'sender', username: 'sender' };
			if (endpoint === 'red-packets/claim') throw new Error('claim response lost');
			if (++shows === 2) throw new Error('details response lost');
			return { ...packet, claimedCoins: shows > 2 ? 5 : null, claims: [] };
		});
		const view = render(MkRedPacketClaimDialog, { props: { redPacketId: packet.id, authorId: 'sender', redPacket: packet }, global });
		await waitFor(() => expect(view.getByRole('button', { name: i18n.ts._redPacket.claim })).toHaveProperty('disabled', false));
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.claim }));
		await waitFor(() => expect(mocks.toast).toHaveBeenCalledOnce());
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.retry }));
		await waitFor(() => expect(view.emitted('claimed')).toHaveLength(1));
		expect(view.getByRole('status').textContent).toContain('5.00');
		expect(mocks.api.mock.calls.filter(([endpoint]) => endpoint === 'red-packets/claim')).toHaveLength(1);
	});

	test('does not notify the wallet again when opening an already claimed packet', async () => {
		const state = { ...packet, claimedCoins: 5, claims: [] };
		mocks.api.mockResolvedValue(state);
		const view = render(MkRedPacketClaimDialog, { props: { redPacketId: packet.id, authorId: 'sender', redPacket: state }, global });
		await waitFor(() => expect(view.emitted('updated')).toHaveLength(1));
		expect(view.emitted('claimed')).toBeUndefined();
	});

	test('ignores a claim response after the dialog is unmounted', async () => {
		let resolveClaim!: (result: unknown) => void;
		const response = new Promise(resolve => { resolveClaim = resolve; });
		const updated = vi.fn();
		const claimed = vi.fn();
		mocks.api.mockImplementation(async endpoint => endpoint === 'red-packets/claim' ? response : { ...packet, claims: [] });
		const view = render(MkRedPacketClaimDialog, { props: { redPacketId: packet.id, authorId: 'sender', redPacket: packet, onUpdated: updated, onClaimed: claimed }, global });
		await waitFor(() => expect(view.getByRole('button', { name: i18n.ts._redPacket.claim })).toHaveProperty('disabled', false));
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.claim }));
		expect(view.getByRole('button', { name: i18n.ts.close })).toHaveProperty('disabled', true);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.close }));
		expect(view.emitted('closed')).toBeUndefined();
		view.unmount();
		resolveClaim({ ...packet, claimedCoins: 5, claims: [] });
		await response;
		await Promise.resolve();
		expect(claimed).not.toHaveBeenCalled();
		expect(updated).toHaveBeenCalledOnce();
		expect(mocks.toast).not.toHaveBeenCalled();
	});

	const rankedClaims = [
		{ id: 'late-best', user: null, coins: 8, createdAt: '2026-10-01T00:00:02.000Z' },
		{ id: 'late-worst', user: null, coins: 2, createdAt: '2026-10-01T00:00:02.000Z' },
		{ id: 'early-best', user: null, coins: 8, createdAt: '2026-10-01T00:00:01.000Z' },
		{ id: 'early-worst', user: null, coins: 2, createdAt: '2026-10-01T00:00:01.000Z' },
	];
	const exhausted = { ...packet, count: 4, remainingCount: 0, remainingCoins: 0, status: 'exhausted' as const, claims: rankedClaims };

	test('shows the custom cover and falls back when it cannot load, then retries a new cover', async () => {
		const state = { ...exhausted, coverUrl: 'https://example.com/cover.png' };
		mocks.api.mockResolvedValue(state);
		const view = render(MkRedPacketClaimDialog, { props: { redPacketId: 'packet', authorId: 'sender', redPacket: state }, global });
		await waitFor(() => expect(view.emitted('updated')).toHaveLength(1));
		expect(view.getByRole('img', { name: i18n.ts._redPacket.cover }).getAttribute('src')).toBe(state.coverUrl);
		await fireEvent.error(view.getByRole('img', { name: i18n.ts._redPacket.cover }));
		expect(view.queryByRole('img', { name: i18n.ts._redPacket.cover })).toBeNull();
		expect(view.getByRole('status').textContent).toBe(i18n.ts._redPacket.allGone);
		await view.rerender({ redPacket: { ...state, coverUrl: 'https://example.com/replacement.png' } });
		expect(view.getByRole('img', { name: i18n.ts._redPacket.cover }).getAttribute('src')).toBe('https://example.com/replacement.png');
	});

	test('keeps claim records in server order and formats every amount', async () => {
		mocks.api.mockResolvedValue(exhausted);
		const view = render(MkRedPacketClaimDialog, { props: { redPacketId: 'packet', authorId: 'sender', redPacket: exhausted }, global });
		await waitFor(() => expect(view.getAllByRole('listitem')).toHaveLength(4));
		const rows = view.getAllByRole('listitem');
		for (const [index, claim] of rankedClaims.entries()) {
			expect(rows[index].textContent).toContain(claim.coins.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
		}
	});

	test.each([4, 5])('updates claim records after a claim in a %i-person packet', async count => {
		const remainingCoins = (count - 4) * 10;
		const active = { ...packet, totalCoins: 20 + remainingCoins, count, remainingCount: count - 3, remainingCoins: remainingCoins + 2 };
		const updated = { ...exhausted, totalCoins: active.totalCoins, count, status: count === 4 ? 'exhausted' : 'active', remainingCount: count - 4, remainingCoins, claimedCoins: 2 };
		mocks.api.mockImplementation(async endpoint => endpoint === 'red-packets/claim' ? updated : { ...active, claims: rankedClaims.slice(0, 3) });
		const view = render(MkRedPacketClaimDialog, { props: { redPacketId: 'packet', authorId: 'sender', redPacket: active }, global });
		await waitFor(() => expect(view.getByRole('button', { name: i18n.ts._redPacket.claim })).toHaveProperty('disabled', false));
		await fireEvent.click(view.getByRole('button', { name: new RegExp(i18n.ts._redPacket.viewClaimDetails) }));
		expect(view.getAllByRole('listitem')).toHaveLength(3);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.claim }));
		await waitFor(() => expect(view.getAllByRole('listitem')).toHaveLength(4));
		expect(view.getAllByRole('listitem')[3].textContent).toContain((2).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
		expect(view.emitted('claimed')).toHaveLength(1);
	});

	test('opens one claim dialog without expanding the message card', async () => {
		mocks.popup.mockResolvedValue({ dispose: vi.fn() });
		const view = render(MkRedPacket, { props: { redPacketId: 'packet', authorId: 'sender', redPacket: packet }, global });
		const button = view.getByRole('button');
		await fireEvent.click(button);
		await fireEvent.click(button);
		expect(mocks.popup).toHaveBeenCalledOnce();
		expect(mocks.popup.mock.calls[0][1]).toMatchObject({ redPacketId: 'packet', authorId: 'sender' });
		expect(view.queryByRole('button', { name: i18n.ts._redPacket.claim })).toBeNull();
		expect(mocks.api.mock.calls.every(([endpoint]) => endpoint === 'red-packets/show')).toBe(true);
	});
	test('reconciles a successful claim after a lost response without another debit', async () => {
		const claimed = { ...packet, claimedCoins: 12.34, remainingCoins: 7.66, remainingCount: 1, claims: [{ id: 'claim', user: null, coins: 12.34, createdAt: '2026-10-01T00:00:00.000Z' }] };
		let shows = 0;
		mocks.api.mockImplementation(async (endpoint: string) => {
			if (endpoint === 'users/show') return { id: 'sender', username: 'sender' };
			if (endpoint === 'red-packets/claim') throw new Error('response lost');
			return ++shows === 1 ? { ...packet, claims: [] } : claimed;
		});
		const view = render(MkRedPacketClaimDialog, { props: { redPacketId: 'packet', authorId: 'sender', redPacket: packet }, global });
		await waitFor(() => expect((view.getByRole('button', { name: i18n.ts._redPacket.claim }) as HTMLButtonElement).disabled).toBe(false));
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.claim }));
		await waitFor(() => expect(view.getByRole('status').textContent).toContain('12.34'));
		expect(view.queryByRole('alert')).toBeNull();
		expect(view.queryByRole('button', { name: i18n.ts._redPacket.claim })).toBeNull();
		expect(view.getByText(i18n.ts._redPacket.deletedUser)).toBeTruthy();
		expect(mocks.api.mock.calls.filter(([endpoint]) => endpoint === 'red-packets/claim')).toHaveLength(1);
		expect(view.emitted('claimed')).toHaveLength(1);
		expect(mocks.toast).not.toHaveBeenCalled();
	});
	test.each(['cancelled', 'expired', 'exhausted'])('does not offer claiming for %s packets', async condition => {
		const state = condition === 'exhausted' ? { ...packet, status: 'exhausted' as const, remainingCount: 0 } : condition === 'expired' ? { ...packet, status: 'expired' as const, expiresAt: '2020-01-01T00:00:00.000Z' } : { ...packet, status: 'cancelled' as const };
		mocks.api.mockResolvedValue({ ...state, claims: [] });
		const view = render(MkRedPacketClaimDialog, { props: { redPacketId: 'packet', authorId: 'sender', redPacket: state }, global });
		await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('red-packets/show', { redPacketId: 'packet' }));
		expect(view.queryByRole('button', { name: i18n.ts._redPacket.claim })).toBeNull();
	});
	test('sender can claim their own packet', async () => {
		const state = { ...packet, senderId: 'recipient', claims: [] };
		mocks.api.mockImplementation(async endpoint => endpoint === 'red-packets/claim' ? { ...state, claimedCoins: 5 } : state);
		const view = render(MkRedPacketClaimDialog, { props: { redPacketId: 'packet', authorId: 'recipient', redPacket: state }, global });
		await waitFor(() => expect((view.getByRole('button', { name: i18n.ts._redPacket.claim }) as HTMLButtonElement).disabled).toBe(false));
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.claim }));
		await waitFor(() => expect(view.emitted('claimed')).toHaveLength(1));
	});
	test('does not offer packet deletion in the claim details', async () => {
		const state = { ...packet, senderId: 'recipient', claims: [] };
		mocks.api.mockResolvedValue(state);
		const view = render(MkRedPacketClaimDialog, { props: { redPacketId: 'packet', authorId: 'recipient', redPacket: state }, global });
		await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('red-packets/show', { redPacketId: 'packet' }));
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.viewClaimDetails }));
		expect(view.queryByRole('button', { name: '删除红包' })).toBeNull();
		expect(mocks.api).not.toHaveBeenCalledWith('red-packets/cancel', { redPacketId: 'packet' });
	});
});
