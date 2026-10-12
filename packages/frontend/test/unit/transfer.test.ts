/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import Transfers from '@/pages/user/wallet.transfers.vue';
import TransferDialog from '@/pages/user/wallet.transfer-dialog.vue';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({ api: vi.fn(), confirm: vi.fn(), selectUser: vi.fn(), toast: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/os.js', () => ({ confirm: mocks.confirm, selectUser: mocks.selectUser, toast: mocks.toast }));
vi.mock('@/i.js', () => ({ ensureSignin: () => ({ id: 'self' }) }));
vi.mock('@/components/MkButton.vue', () => ({ default: { props: ['disabled', 'type'], template: '<button :type="type ?? \'button\'" :disabled="disabled"><slot/></button>' } }));
vi.mock('@/components/MkModalWindow.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({ setup(_props, { slots, expose, emit }) {
		expose({ close: () => emit('closed') });
		return () => h('div', [h('button', { onClick: () => emit('close') }, 'Close dialog'), slots.header?.(), slots.default?.()]);
	} }) };
});
vi.mock('@/components/MkSelect.vue', () => ({ default: {
	props: ['modelValue', 'items', 'disabled'], emits: ['update:modelValue'],
	template: '<label><slot name="label"/><select :value="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :value="item.value">{{ item.label }}</option></select></label>',
} }));
const global = { stubs: { MkA: { template: '<span><slot/></span>' }, MkTime: true, MkLoading: true } };
const transfer = { id: 'transfer', senderId: 'sender', recipientId: 'self', amount: 1.23, message: '测试', status: 'pending', createdAt: '2026-10-03T00:00:00Z', expiresAt: '2026-10-04T00:00:00Z', completedAt: null };
const amountLabel = `${i18n.ts._transfer.amount} (${i18n.ts._transfer.coinUnit})`;

beforeEach(() => {
	vi.clearAllMocks();
	localStorage.clear();
	// 退还操作仍保留确认弹窗，默认放行；转账发送不再调用 confirm，由用例断言守护。
	mocks.confirm.mockResolvedValue({ canceled: false });
	mocks.selectUser.mockResolvedValue({ id: 'recipient', username: 'recipient' });
});
afterEach(cleanup);

test('结果未知时保存原转账请求，关闭重开弹窗仍使用相同 UUID 重试', async () => {
	const requests: unknown[] = [];
	mocks.api.mockImplementation(async (endpoint: string, payload: unknown) => {
		if (endpoint === 'transfers/list' || endpoint === 'users/show') return [];
		requests.push(payload);
		if (requests.length === 1) throw new Error('response lost');
		return transfer;
	});
	const first = render(TransferDialog, { global });
	await fireEvent.click(first.getByRole('button', { name: i18n.ts._transfer.selectRecipient }));
	await waitFor(() => expect(first.getByRole('button', { name: '@recipient' })).toBeTruthy());
	await fireEvent.update(first.getByLabelText(amountLabel), '1.23');
	await fireEvent.submit(first.container.querySelector('form')!);
	await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(i18n.ts._wallet.operationFailed, 'error'));
	expect(first.queryByRole('alert')).toBeNull();
	expect(localStorage.getItem('wallet-transfer:self')).not.toBeNull();
	await fireEvent.click(first.getByRole('button', { name: 'Close dialog' }));
	expect(first.emitted('closed')).toHaveLength(1);
	first.unmount();
	const second = render(TransferDialog, { global });
	expect(second.getByLabelText(amountLabel)).toHaveProperty('disabled', true);
	await fireEvent.click(second.getByRole('button', { name: i18n.ts.retry }));
	await waitFor(() => expect(localStorage.getItem('wallet-transfer:self')).toBeNull());
	expect(requests[1]).toEqual(requests[0]);
	expect(second.emitted('sent')).toHaveLength(1);
	expect(second.emitted('closed')).toHaveLength(1);
	expect(mocks.confirm).not.toHaveBeenCalled();
});

test('转账提交期间不能关闭或重复提交，成功后关闭弹窗', async () => {
	let complete!: (value: typeof transfer) => void;
	mocks.api.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
	const view = render(TransferDialog, { global });
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._transfer.selectRecipient }));
	await fireEvent.submit(view.container.querySelector('form')!);
	await fireEvent.submit(view.container.querySelector('form')!);
	await fireEvent.click(view.getByRole('button', { name: 'Close dialog' }));
	expect(view.emitted('closed')).toBeUndefined();
	expect(mocks.api).toHaveBeenCalledTimes(1);
	expect(localStorage.getItem('wallet-transfer:self')).not.toBeNull();
	complete(transfer);
	await waitFor(() => expect(view.emitted('closed')).toHaveLength(1));
	expect(view.emitted('sent')).toHaveLength(1);
	expect(localStorage.getItem('wallet-transfer:self')).toBeNull();
});

test('未知请求重试被拒绝仍保留凭证，首次明确拒绝才解锁填写', async () => {
	const request = { recipientId: 'recipient', amount: 1, message: '', requestId: crypto.randomUUID() };
	localStorage.setItem('wallet-transfer:self', JSON.stringify(request));
	mocks.api.mockRejectedValue({ code: 'INSUFFICIENT_WALLET_BALANCE' });
	const retry = render(TransferDialog, { global });
	await fireEvent.click(retry.getByRole('button', { name: i18n.ts.retry }));
	await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
	expect(JSON.parse(localStorage.getItem('wallet-transfer:self')!)).toEqual(request);
	expect(retry.getByLabelText(amountLabel)).toHaveProperty('disabled', true);
	retry.unmount();
	localStorage.clear();
	mocks.toast.mockClear();
	const first = render(TransferDialog, { global });
	await fireEvent.click(first.getByRole('button', { name: i18n.ts._transfer.selectRecipient }));
	await fireEvent.submit(first.container.querySelector('form')!);
	await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
	expect(localStorage.getItem('wallet-transfer:self')).toBeNull();
	expect(first.getByLabelText(amountLabel)).toHaveProperty('disabled', false);
});

test.each(['accept', 'refund'] as const)('收款人通过独立接口执行 %s 并显示服务端结果', async action => {
	let status = 'pending';
	mocks.api.mockImplementation(async (endpoint: string) => {
		if (endpoint === 'users/show') return [];
		if (endpoint === 'transfers/list') return [{ ...transfer, status }];
		status = action === 'accept' ? 'accepted' : 'refunded';
		return { ...transfer, status };
	});
	const view = render(Transfers, { global });
	await waitFor(() => expect(view.getByRole('button', { name: i18n.ts._transfer[action] })).toBeTruthy());
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._transfer[action] }));
	await waitFor(() => expect(mocks.api).toHaveBeenCalledWith(`transfers/${action}`, { transferId: transfer.id }));
	await waitFor(() => expect(view.queryByRole('button', { name: i18n.ts._transfer.accept })).toBeNull());
	expect(view.emitted('changed')).toHaveLength(1);
});

test('请求到达时已过期则显示已退回，不误报收款成功', async () => {
	let status = 'pending';
	mocks.api.mockImplementation(async (endpoint: string) => {
		if (endpoint === 'users/show') return [];
		if (endpoint === 'transfers/list') return [{ ...transfer, status }];
		status = 'expired';
		return { ...transfer, status };
	});
	const view = render(Transfers, { global });
	await waitFor(() => expect(view.getByRole('button', { name: i18n.ts._transfer.accept })).toBeTruthy());
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._transfer.accept }));
	await waitFor(() => expect(view.getByRole('status').textContent).toBe(i18n.ts._transfer._status.expired));
});

test('发送者不能收款或替接收者退还', async () => {
	mocks.api.mockImplementation(async (endpoint: string) => endpoint === 'transfers/list' ? [{ ...transfer, senderId: 'self', recipientId: 'other' }] : []);
	const view = render(Transfers, { global });
	await waitFor(() => expect(view.getByText(i18n.ts._transfer._status.pending)).toBeTruthy());
	expect(view.queryByRole('button', { name: i18n.ts._transfer.accept })).toBeNull();
	expect(view.queryByRole('button', { name: i18n.ts._transfer.refund })).toBeNull();
});
