/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { ref } from 'vue';
import locales from 'i18n';
import type { entities } from 'misskey-js';
import MkRedPacket from '@/components/MkRedPacket.vue';
import MkRedPacketEditor from '@/components/MkRedPacketEditor.vue';
import MkRedPacketClaimDialog from '@/components/MkRedPacketClaimDialog.vue';
import I18n from '@/components/global/I18n.vue';
import { i18n, updateI18n } from '@/i18n.js';
import { createRedPacketDraft, redPacketValidation } from '@/utility/red-packet.js';

const mocks = vi.hoisted(() => ({
	api: vi.fn(),
	popup: vi.fn(),
	me: {
		id: 'recipient', username: 'recipient', name: '小明', isSuspended: false, host: null,
		avatarUrl: 'https://example.test/recipient.png', avatarBlurhash: null, avatarDecorations: [],
		emojis: {}, onlineStatus: 'unknown',
	} satisfies entities.UserLite & { isSuspended: boolean },
}));
vi.mock('@/i.js', () => ({ $i: mocks.me, ensureSignin: () => mocks.me }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/os.js', () => ({ toast: vi.fn(), popupAsyncWithDialog: mocks.popup }));
vi.mock('@/events.js', () => ({ useGlobalEvent: vi.fn() }));
vi.mock('@/components/MkModal.vue', () => ({ default: { emits: ['click', 'esc', 'closed'], template: '<div><slot/></div>' } }));
vi.mock('@/components/MkButton.vue', () => ({ default: { template: '<button><slot/></button>' } }));
vi.mock('@/components/MkRedPacketCover.vue', () => ({ default: { template: '<span><slot/></span>' } }));

const stubs = {
	MkAvatar: true,
	MkUserName: { props: ['user'], template: '<span>{{ user.name || user.username }}</span>' },
	Mfm: { props: ['text'], template: '<span>{{ text }}</span>' },
	MkButton: { template: '<button><slot/></button>' },
};

const author: entities.UserLite = { ...mocks.me, id: 'sender', username: 'sender', name: '发送者' };
const packet: entities.RedPacketsCreateResponse = {
	id: 'packet', senderId: 'sender', roomId: 'room', kind: 'direct', audience: 'room',
	mode: 'equal', password: null, message: '喝杯奶茶', totalCoins: 10, count: 1,
	remainingCoins: 10, remainingCount: 1, coverId: 'classic', coverFileId: null, coverUrl: null,
	expiresAt: '2099-01-01T00:00:00.000Z', startsAt: null, serverTime: '2026-10-23T00:00:00.000Z',
	status: 'active', claimedCoins: null, recipient: mocks.me,
};

function renderPacket(overrides: Partial<entities.RedPacketsCreateResponse> = {}, detailOverrides: Partial<entities.RedPacketsShowResponse> = {}) {
	const value = { ...packet, ...overrides };
	const details: entities.RedPacketsShowResponse = {
		...value, claims: [],
		...(value.kind === 'direct' && value.audience === 'room' ? { canClaim: value.roomId != null && value.recipient?.id === mocks.me.id } : {}),
		...detailOverrides,
	};
	mocks.api.mockResolvedValue(details);
	return render(MkRedPacketClaimDialog, {
		props: { redPacketId: value.id, authorId: author.id, author, redPacket: value },
		global: { components: { I18n }, stubs },
	});
}

describe('群专属红包展示与类型切换', () => {
	beforeEach(() => { mocks.api.mockReset(); updateI18n(locales['zh-CN']); });
	afterEach(() => { cleanup(); updateI18n(locales['en-US']); });

	test('只有群聊提供专属类型，切回普通或口令红包清空指定领取人', async () => {
		const draft = ref(createRedPacketDraft('group', [], 'room'));
		const view = render({
			components: { MkRedPacketEditor },
			setup: () => ({ draft }),
			template: '<MkRedPacketEditor v-model="draft" simple fixedAudience allowPassword allowExclusive roomId="room"/>',
		}, { global: { stubs } });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.exclusivePacket }));
		expect(draft.value).toMatchObject({ kind: 'direct', audience: 'room', recipientIds: [], count: 1, mode: 'equal' });
		expect(redPacketValidation(draft.value)).not.toBeNull();
		draft.value.recipientIds = ['recipient'];
		expect(redPacketValidation(draft.value)).toBeNull();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.ordinaryPacket }));
		expect(draft.value).toMatchObject({ kind: 'group', audience: 'room', recipientIds: [], count: 5, mode: 'equal' });
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.exclusivePacket }));
		draft.value.recipientIds = ['recipient'];
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.passwordPacket }));
		expect(draft.value).toMatchObject({ kind: 'group', audience: 'room', recipientIds: [], count: 5, mode: 'random' });
		expect(draft.value.password).toBeTruthy();
	});

	test('私聊普通红包不出现专属文案，待确认草稿查不到资料时保留准确领取人', () => {
		const direct = render(MkRedPacketEditor, {
			props: { modelValue: createRedPacketDraft('direct', ['recipient']), simple: true, fixedAudience: true },
			global: { stubs },
		});
		expect(direct.getByRole('button', { name: i18n.ts._redPacket.ordinaryPacket })).toBeTruthy();
		expect(direct.queryByText(i18n.ts._redPacket.exclusivePacket)).toBeNull();
		direct.unmount();
		const pending = render(MkRedPacketEditor, {
			props: { modelValue: createRedPacketDraft('direct', ['recipient'], 'room'), simple: true, disabled: true, allowExclusive: true, roomId: 'room' },
			global: { stubs },
		});
		expect(pending.getByRole('button', { name: new RegExp(i18n.tsx._redPacket.recipientId({ id: 'recipient' })) }).hasAttribute('disabled')).toBe(true);
	});

	test('专属弹窗显示指定领取人，其他成员不能查看或领取', async () => {
		const recipient = renderPacket();
		expect(recipient.getByText((_content, element) => element?.tagName === 'P' && element.textContent === '仅小明可以领')).toBeTruthy();
		expect(recipient.getByText(i18n.ts._redPacket.exclusiveSenderSuffix)).toBeTruthy();
		expect(recipient.queryByRole('button', { name: i18n.ts._redPacket.claim })).toBeNull();
		await waitFor(() => expect(recipient.getByRole('button', { name: i18n.ts._redPacket.claim })).toHaveProperty('disabled', false));
		recipient.unmount();
		mocks.api.mockClear();
		const other = renderPacket({ recipient: { ...mocks.me, id: 'someone-else', name: '小红' } });
		expect(other.queryByRole('dialog')).toBeNull();
		expect(other.queryByRole('button', { name: i18n.ts._redPacket.claim })).toBeNull();
		expect(other.queryByRole('button', { name: i18n.ts._redPacket.viewClaimDetails })).toBeNull();
		expect(mocks.api).not.toHaveBeenCalled();
	});

	test('群消息的专属红包卡片对其他成员不可打开，也不查询详情', async () => {
		const value = { ...packet, recipient: { ...mocks.me, id: 'someone-else' } };
		const view = render(MkRedPacket, {
			props: { redPacketId: value.id, authorId: author.id, author, redPacket: value },
			global: { stubs },
		});
		const card = view.getByRole('button');
		expect(card).toHaveProperty('disabled', true);
		await fireEvent.click(card);
		expect(mocks.popup).not.toHaveBeenCalled();
		expect(mocks.api).not.toHaveBeenCalled();
	});

	test('发送者仍可查看专属红包记录，但不能自领', async () => {
		const sender = renderPacket({ senderId: mocks.me.id });
		await waitFor(() => expect(sender.emitted('updated')).toHaveLength(1));
		expect(sender.queryByRole('button', { name: i18n.ts._redPacket.claim })).toBeNull();
		await fireEvent.click(sender.getByRole('button', { name: i18n.ts._redPacket.viewClaimDetails }));
		expect(sender.getByText(i18n.ts._redPacket.noClaims)).toBeTruthy();
	});

	test('普通私聊红包没有群专属提示，删群后的专属红包不能领取', async () => {
		const direct = renderPacket({ audience: 'recipients', roomId: null, recipient: undefined });
		expect(direct.queryByText(i18n.ts._redPacket.exclusiveSenderSuffix)).toBeNull();
		await waitFor(() => expect(direct.getByRole('button', { name: i18n.ts._redPacket.claim })).toHaveProperty('disabled', false));
		direct.unmount();
		const deletedRoom = renderPacket({ roomId: null });
		expect(deletedRoom.getByText((_content, element) => element?.tagName === 'P' && element.textContent === '仅小明可以领')).toBeTruthy();
		await waitFor(() => expect(deletedRoom.emitted('updated')).toHaveLength(1));
		expect(deletedRoom.queryByRole('button', { name: i18n.ts._redPacket.claim })).toBeNull();
	});

	test.each([false, undefined])('退群、归档或资格未知时，群 ID 仍在的专属红包只允许查看（%s）', async canClaim => {
		const view = renderPacket({}, { canClaim });
		await waitFor(() => expect(view.emitted('updated')).toHaveLength(1));
		expect(view.emitted('updated')).toEqual([[expect.objectContaining({ roomId: 'room', status: 'active', canClaim })]]);
		expect(view.queryByRole('button', { name: i18n.ts._redPacket.claim })).toBeNull();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.viewClaimDetails }));
		expect(view.queryByRole('button', { name: i18n.ts._redPacket.claim })).toBeNull();
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('red-packets/show', { redPacketId: packet.id });
	});

	test('领取失败后补查资格失效，不再显示领取入口', async () => {
		const view = renderPacket();
		await waitFor(() => expect(view.getByRole('button', { name: i18n.ts._redPacket.claim })).toHaveProperty('disabled', false));
		const denied: entities.RedPacketsShowResponse = { ...packet, claims: [], canClaim: false };
		mocks.api.mockRejectedValueOnce({ code: 'RED_PACKET_ACCESS_DENIED' }).mockResolvedValue(denied);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.claim }));
		await waitFor(() => expect(view.emitted('updated')).toHaveLength(2));
		expect(view.emitted('updated')).toEqual([
			[expect.objectContaining({ canClaim: true })],
			[expect.objectContaining({ roomId: 'room', status: 'active', canClaim: false })],
		]);
		expect(view.queryByRole('button', { name: i18n.ts._redPacket.claim })).toBeNull();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._redPacket.viewClaimDetails }));
		expect(view.queryByRole('button', { name: i18n.ts._redPacket.claim })).toBeNull();
		expect(mocks.api.mock.calls.map(([endpoint]) => endpoint)).toEqual(['red-packets/show', 'red-packets/claim', 'red-packets/show']);
	});
});
