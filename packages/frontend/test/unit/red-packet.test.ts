/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { createRedPacketDraft, redPacketValidation, redPacketRequestRejected } from '@/utility/red-packet.js';
import { validExchange } from '@/utility/wallet.js';
import MkRedPacket from '@/components/MkRedPacket.vue';
import MkRedPacketClaimDialog from '@/components/MkRedPacketClaimDialog.vue';
import MkRedPacketDialog from '@/components/MkRedPacketDialog.vue';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({ api: vi.fn(), confirm: vi.fn(), upload: vi.fn(), selectUser: vi.fn(), popup: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/i.js', () => ({ $i: { id: 'recipient' }, ensureSignin: () => ({ id: 'recipient' }) }));
vi.mock('@/os.js', () => ({ confirm: mocks.confirm, launchUploader: mocks.upload, selectUser: mocks.selectUser, popupAsyncWithDialog: mocks.popup }));
vi.mock('@/components/MkModalWindow.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({ setup(_props, { slots, expose, emit }) {
		expose({ close: () => emit('closed') });
		return () => h('div', [h('button', { onClick: () => emit('close') }, 'Close dialog'), slots.header?.(), slots.default?.(), slots.footer?.()]);
	} }) };
});
vi.mock('@/components/MkButton.vue', () => ({ default: { props: ['disabled'], template: '<button :disabled="disabled"><slot/></button>' } }));
vi.mock('@/components/MkSelect.vue', () => ({ default: {
	props: ['modelValue', 'items', 'disabled'],
	emits: ['update:modelValue'],
	template: '<label><slot name="label"/><select :value="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :value="item.value">{{ item.label }}</option></select></label>',
} }));

const packet = { id: 'packet', senderId: 'sender', roomId: null, kind: 'group' as const, audience: 'public' as const, coverId: 'classic' as const, mode: 'random' as const, message: '', totalCoins: 20, count: 2, remainingCoins: 20, remainingCount: 2, expiresAt: '2099-01-01T00:00:00.000Z', status: 'active' as const, coverFileId: null, coverUrl: null, claimedCoins: null };
const global = { stubs: { MkTime: true, MkLoading: true, MkAvatar: true, MkUserName: true, MkA: true } };
beforeEach(() => { localStorage.clear(); mocks.confirm.mockResolvedValue({ canceled: false }); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('independent packet creation', () => {
	test('a single-owner room creates a dynamic group audience without recipient snapshots', async () => {
		mocks.api.mockImplementation(async (endpoint, data) => endpoint === 'i/wallet' ? { balance: 100 } : { ...packet, ...data });
		const view = render(MkRedPacketDialog, { props: { kind: 'group', roomId: 'room' }, global });
		expect(view.getByText(i18n.ts._chatRedPacket.eligibility)).toBeTruthy();
		expect(view.queryByRole('button', { name: i18n.ts._redPacket.direct })).toBeNull();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.create }));
		await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('red-packets/create', expect.objectContaining({ audience: 'room', roomId: 'room', recipientIds: [] })));
		expect(mocks.api.mock.calls.some(([endpoint]) => endpoint === 'chat/rooms/members')).toBe(false);
	});
	test('one-to-one requires one selected recipient and submits a restricted audience', async () => {
		mocks.selectUser.mockResolvedValue({ id: 'target', username: 'target' });
		mocks.api.mockImplementation(async (endpoint, data) => endpoint === 'i/wallet' ? { balance: 100 } : endpoint === 'users/show' ? [{ id: 'target', username: 'target' }] : { ...packet, ...data });
		const view = render(MkRedPacketDialog, { global });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.direct }));
		expect(view.getByRole('button', { name: i18n.ts._redPacket.create })).toHaveProperty('disabled', true);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.selectUser }));
		await waitFor(() => expect(view.getByRole('button', { name: i18n.ts._redPacket.create })).toHaveProperty('disabled', false));
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.create }));
		await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('red-packets/create', expect.objectContaining({ kind: 'direct', audience: 'recipients', recipientIds: ['target'], count: 1, mode: 'equal' })));
	});

	test('fixed amounts are entered per person and total updates when count changes', async () => {
		mocks.api.mockImplementation(async (endpoint, data) => endpoint === 'i/wallet' ? { balance: 100 } : { ...packet, ...data });
		const view = render(MkRedPacketDialog, { global });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.equal }));
		await fireEvent.update(view.getByLabelText(i18n.ts._redPacket.amountPerPerson), '7');
		await fireEvent.update(view.getByLabelText(i18n.ts._redPacket.count), '3');
		expect(view.getByLabelText(i18n.ts._redPacket.amountPerPerson)).toHaveProperty('value', '7');
		await fireEvent.update(view.getByLabelText(i18n.ts._redPacket.count), '');
		await fireEvent.update(view.getByLabelText(i18n.ts._redPacket.count), '5');
		expect(view.getByLabelText(i18n.ts._redPacket.amountPerPerson)).toHaveProperty('value', '7');
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.create }));
		await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('red-packets/create', expect.objectContaining({ kind: 'group', mode: 'equal', totalCoins: 35, count: 5 })));
	});

	test('retains the same request after a lost response and does not confirm twice', async () => {
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
		await waitFor(() => expect(first.getByRole('alert').textContent).toBe(i18n.ts._redPacket.operationFailed));
		expect(requests[0]).toEqual(expect.objectContaining({ totalCoins: 10, requestId: expect.any(String) }));
		first.unmount();
		const second = render(MkRedPacketDialog, { global });
		await fireEvent.click(second.getByRole('button', { name: i18n.ts.retry }));
		await waitFor(() => expect(second.emitted('created')).toHaveLength(1));
		expect(requests[1]).toEqual(requests[0]);
		expect(mocks.confirm).toHaveBeenCalledOnce();
		expect(mocks.api.mock.calls.every(([endpoint]) => ['i/wallet', 'red-packets/create'].includes(endpoint))).toBe(true);
		expect(localStorage.getItem('red-packet-create:recipient:group:public:')).toBeNull();
	});
	test('does not reserve coins when creation confirmation is cancelled', async () => {
		mocks.api.mockResolvedValue({ balance: 100 });
		mocks.confirm.mockResolvedValue({ canceled: true });
		const view = render(MkRedPacketDialog, { global });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.create }));
		await waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce());
		expect(mocks.api.mock.calls.some(([endpoint]) => endpoint === 'red-packets/create')).toBe(false);
	});
	test('recovers issued packets regardless of attachment history', async () => {
		localStorage.setItem('red-packet-create:recipient:group:public:', JSON.stringify({ draft: createRedPacketDraft(), pending: true, createdPacketId: 'packet' }));
		mocks.api.mockImplementation(async (endpoint: string) => endpoint === 'i/wallet' ? { balance: 100 } : packet);
		const view = render(MkRedPacketDialog, { global });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.retry }));
		await waitFor(() => expect(view.emitted('created')).toHaveLength(1));
		expect(mocks.api).toHaveBeenCalledWith('red-packets/show', { redPacketId: 'packet' });
	});
	test('tips are confirmed as direct transfers and accept an exhausted success response', async () => {
		mocks.api.mockImplementation(async (endpoint: string, data: object) => endpoint === 'i/wallet' ? { balance: 100 } : { ...packet, ...data, status: 'exhausted' });
		const view = render(MkRedPacketDialog, { props: { kind: 'tip', recipientIds: ['target'] }, global });
		expect(view.queryByLabelText(i18n.ts._redPacket.count)).toBeNull();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.create }));
		await waitFor(() => expect(view.emitted('created')).toHaveLength(1));
		expect(mocks.api).toHaveBeenCalledWith('red-packets/create', expect.objectContaining({ kind: 'tip', audience: 'recipients', recipientIds: ['target'], count: 1, mode: 'equal' }));
		expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ text: i18n.tsx._redPacket.confirmTip({ coins: 10, target: i18n.tsx._redPacket.recipientId({ id: 'target' }) }) }));
	});
	test('restores recipient identities and names the direct recipient in the payment confirmation', async () => {
		mocks.api.mockImplementation(async (endpoint: string, data: object) => {
			if (endpoint === 'i/wallet') return { balance: 100 };
			if (endpoint === 'users/show') return [{ id: 'target', name: 'Alice', username: 'alice' }];
			return { ...packet, ...data };
		});
		const view = render(MkRedPacketDialog, { props: { kind: 'direct', recipientIds: ['target'] }, global });
		await waitFor(() => expect(view.getByText('Alice (@alice)')).toBeTruthy());
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.create }));
		await waitFor(() => expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ text: i18n.tsx._redPacket.confirmDirect({ coins: 10, target: 'Alice (@alice)' }) })));
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
		expect((view.getByRole('button', { name: i18n.ts._redPacket.create }) as HTMLButtonElement).disabled).toBe(true);
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
	test('requires integral amounts, a minimum coin per recipient, and equal divisibility', () => {
		const draft = createRedPacketDraft();
		expect(redPacketValidation(draft, 10)).toBeNull();
		for (const totalCoins of [0, 4, 10.5, 1000001, Number.NaN]) expect(redPacketValidation({ ...draft, totalCoins })).not.toBeNull();
		expect(redPacketValidation({ ...draft, mode: 'equal', totalCoins: 11 })).toBe(i18n.ts._redPacket.equalNotDivisible);
		expect(redPacketValidation(draft, 9)).toBe(i18n.ts._redPacket.insufficientCoins);
	});
	test('accepts Unicode messages by code point and rejects malformed restored drafts', () => {
		const draft = createRedPacketDraft();
		expect(redPacketValidation({ ...draft, message: '🎁'.repeat(100) })).toBeNull();
		expect(redPacketValidation({ ...draft, message: '🎁'.repeat(101) })).not.toBeNull();
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
	test('opens one claim dialog without expanding the message card', async () => {
		mocks.popup.mockResolvedValue({ dispose: vi.fn() });
		const view = render(MkRedPacket, { props: { redPacketId: 'packet', authorId: 'sender', redPacket: packet }, global });
		const button = view.getByRole('button');
		await fireEvent.click(button);
		await fireEvent.click(button);
		expect(mocks.popup).toHaveBeenCalledOnce();
		expect(mocks.popup.mock.calls[0][1]).toMatchObject({ redPacketId: 'packet', authorId: 'sender' });
		expect(view.queryByRole('button', { name: i18n.ts._redPacket.claim })).toBeNull();
		expect(mocks.api).not.toHaveBeenCalled();
	});
	test('reconciles a successful claim after a lost response without another debit', async () => {
		const claimed = { ...packet, claimedCoins: 12, remainingCoins: 8, remainingCount: 1, claims: [{ id: 'claim', user: null, coins: 12, createdAt: '2026-10-01T00:00:00.000Z' }] };
		let shows = 0;
		mocks.api.mockImplementation(async (endpoint: string) => {
			if (endpoint === 'red-packets/claim') throw new Error('response lost');
			return ++shows === 1 ? { ...packet, claims: [] } : claimed;
		});
		const view = render(MkRedPacketClaimDialog, { props: { redPacketId: 'packet', authorId: 'sender', redPacket: packet }, global });
		await waitFor(() => expect((view.getByRole('button', { name: i18n.ts._redPacket.claim }) as HTMLButtonElement).disabled).toBe(false));
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.claim }));
		await waitFor(() => expect(view.getByRole('status').textContent).toContain('12'));
		expect(view.queryByRole('alert')).toBeNull();
		expect(view.queryByRole('button', { name: i18n.ts._redPacket.claim })).toBeNull();
		expect(view.getByText(i18n.ts._redPacket.deletedUser)).toBeTruthy();
		expect(mocks.api.mock.calls.filter(([endpoint]) => endpoint === 'red-packets/claim')).toHaveLength(1);
		expect(view.emitted('claimed')).toHaveLength(1);
	});
	test.each(['own', 'expired', 'exhausted'])('does not offer claiming for %s packets', async condition => {
		const state = condition === 'exhausted' ? { ...packet, status: 'exhausted' as const, remainingCount: 0 } : condition === 'expired' ? { ...packet, expiresAt: '2020-01-01T00:00:00.000Z' } : { ...packet, senderId: 'recipient' };
		mocks.api.mockResolvedValue({ ...state, claims: [] });
		const view = render(MkRedPacketClaimDialog, { props: { redPacketId: 'packet', authorId: condition === 'own' ? 'recipient' : 'sender', redPacket: state }, global });
		await waitFor(() => expect(mocks.api).toHaveBeenCalledOnce());
		expect(view.queryByRole('button', { name: i18n.ts._redPacket.claim })).toBeNull();
	});
});
