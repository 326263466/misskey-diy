/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { defineComponent, nextTick } from 'vue';
import { globalEvents } from '@/events.js';
import RoomInfo from '@/pages/chat/room.info.vue';
import RoomMembers from '@/pages/chat/room.members.vue';
import RoomSidebar from '@/pages/chat/room.sidebar.vue';
import RoomAnnouncement from '@/pages/chat/room.announcement.vue';
import MessageSettingsDialog from '@/pages/chat/message-settings-dialog.vue';
import { getChatNotificationMode, loadChatConversationSettings } from '@/utility/chat-conversation-settings.js';
import { getChatMemberMenu } from '@/pages/chat/member-menu.js';
import type { MenuButton, MenuParent } from '@/types/menu.js';
import GroupCreateDialog from '@/pages/chat/group-create-dialog.vue';
import GroupJoinDialog from '@/pages/chat/group-join-dialog.vue';
import MkChatHistories from '@/components/MkChatHistories.vue';
import MkUserSelectDialog from '@/components/MkUserSelectDialog.vue';
import { cacheChatConversationTitle, getChatConversationTitle, getRecentChatConversations, rememberChatConversation, setChatRoomMuted } from '@/utility/chat-conversations.js';

const mocks = vi.hoisted(() => ({ api: vi.fn(), invite: vi.fn(), selectUser: vi.fn(), setStore: vi.fn(), select: vi.fn(), success: vi.fn(), alert: vi.fn(), toast: vi.fn(), interval: vi.fn(), popupMenu: vi.fn(), contextMenu: vi.fn(), pageWindow: vi.fn(), inputText: vi.fn(), copy: vi.fn(), navigate: vi.fn(), confirm: vi.fn(), push: vi.fn() }));
const streamMocks = vi.hoisted(() => ({ on: vi.fn(), off: vi.fn(), dispose: vi.fn(), connected: vi.fn() }));
vi.mock('@/stream.js', () => ({ useStream: () => ({ on: streamMocks.connected, off: streamMocks.off, useChannel: () => ({ on: streamMocks.on, dispose: streamMocks.dispose }) }) }));
vi.mock('@/utility/misskey-api-with-toast.js', () => ({ misskeyApiWithErrorToast: mocks.api }));
vi.mock('@@/js/use-interval.js', () => ({ useInterval: mocks.interval }));
vi.mock('@/os.js', () => ({ apiWithDialog: mocks.api, selectUser: mocks.selectUser, select: mocks.select, success: mocks.success, alert: mocks.alert, toast: mocks.toast, popupMenu: mocks.popupMenu, contextMenu: mocks.contextMenu, pageWindow: mocks.pageWindow, inputText: mocks.inputText, confirm: mocks.confirm }));
vi.mock('@/utility/copy-to-clipboard.js', () => ({ copyToClipboard: mocks.copy }));
vi.mock('@/components/MkUserCardMini.vue', () => ({ default: { props: ['user'], template: '<span>{{ user.username }}</span>' } }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.invite }));
vi.mock('@/i.js', () => ({ $i: { id: 'owner', username: 'owner', name: 'Owner' }, ensureSignin: () => ({ id: 'owner', username: 'owner', name: 'Owner' }) }));
vi.mock('@/store.js', () => ({ store: { s: { recentlyUsedUsers: [] }, set: mocks.setStore } }));
vi.mock('@/instance.js', () => ({ instance: { federation: 'all' } }));
vi.mock('@/router.js', () => ({ useRouter: () => ({ push: mocks.push, pushByPath: mocks.navigate }) }));
vi.mock('@/utility/drive.js', () => ({ chooseDriveFile: vi.fn() }));
vi.mock('@/components/global/MkAvatar.vue', () => ({ default: { template: '<span/>' } }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { name: 'Name', remove: '移除', description: 'Description', save: 'Save', saved: 'Saved', create: 'Create', retry: 'Retry', draft: '草稿', pin: '置顶', unpin: '取消置顶', unread: '未读', apply: '应用', sendMessage: 'Send message', reportAbuse: 'Report', oneHour: 'One hour', _profile: { changeAvatar: 'Change avatar' }, _chat: {
	pinLimit: '最多置顶 5 个会话',
	selectAll: '全选',
	searchMembers: '搜索成员',
	copyRoomId: '复制群号', copyAccount: '复制账号', markRead: '标记已读', markUnread: '标记未读', openChatWindow: '打开独立聊天窗口', messageSettings: '群消息设置', allowNotifications: '允许消息提醒', silentNotifications: '接收消息但不提醒', moveToAssistant: '收进群助手且不提醒', blockMessages: '屏蔽群消息', batchMessageSettings: '批量管理群消息', groupAssistant: '群助手', enableDoNotDisturb: '设置免打扰', disableDoNotDisturb: '取消免打扰', removeFromList: '从消息列表移除',
	deleteRoom: 'Delete', joinPolicy: 'Joining', joinPolicyPublic: 'Public', joinPolicyInvitation: 'Invitation', joinPolicyClosed: 'Closed',
	joinPolicyApproval: '需要验证', requestJoin: '申请加入', joinRequestDescription: '请填写验证说明', joinRequestMessage: '验证说明', joinRequestPending: '等待审核', joinRequestSent: '申请已发送', joinRequests: '入群申请', noJoinRequests: '暂无申请', approveJoinRequest: '同意', rejectJoinRequest: '拒绝', join: '加入',
	silenceRoom: 'Silence', silenceUntil: 'Until', inviteUser: 'Invite', upgradeToGroup: 'Group',
	manageMember: 'Manage member', roomOwner: 'Owner', roomAdministrator: 'Administrator', setAdministrator: 'Promote', removeAdministrator: 'Demote', removeMember: 'Remove',
	announcement: 'Announcement', noAnnouncement: 'No announcement', viewProfile: 'Profile', mentionMember: 'Mention', poke: 'Poke', editGroupNickname: 'Nickname', silenceMember: 'Silence member', hideMemberMessages: 'Hide messages', showMemberMessages: 'Show messages',
} }, tsx: { deleteAreYouSure: ({ x }: { x: string }) => `Delete ${x}?`, _chat: { defaultRoomName: ({ name }: { name: string }) => `${name}的群组`, unreadMessages: ({ count }: { count: number }) => `${count} 条未读消息` } } } }));
vi.mock('@/components/MkModalWindow.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({ props: ['withOkButton', 'okButtonDisabled'], setup(props, { slots, expose, emit }) {
		expose({ close: () => emit('closed') });
		return () => h('div', [slots.header?.(), slots.default?.(), h('button', { onClick: () => emit('close') }, '取消'), props.withOkButton ? h('button', { disabled: props.okButtonDisabled, onClick: () => emit('ok') }, '完成') : null]);
	} }) };
});
vi.mock('@/components/MkButton.vue', () => ({ default: { template: '<button><slot/></button>' } }));
vi.mock('@/components/MkInput.vue', () => ({ default: { props: ['modelValue', 'placeholder'], emits: ['update:modelValue'], template: '<label><slot name="label"/><input :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)"/></label>' } }));
vi.mock('@/components/MkTextarea.vue', () => ({ default: { props: ['modelValue'], emits: ['update:modelValue'], template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"/>' } }));
vi.mock('@/components/MkSwitch.vue', () => ({ default: { props: ['modelValue'], emits: ['update:modelValue'], template: '<label data-testid="mute-switch"><slot/><input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)"/></label>' } }));
vi.mock('@/components/MkSelect.vue', () => ({ default: {
	props: ['modelValue', 'items', 'disabled'],
	emits: ['update:modelValue'],
	template: '<select aria-label="Joining" :value="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>',
} }));

afterEach(() => { cleanup(); vi.resetAllMocks(); localStorage.removeItem('chatRecentConversations'); localStorage.removeItem('chatMessageDrafts'); localStorage.removeItem('chat-pinned:owner'); localStorage.removeItem('chat-pinned:other'); });
const room = { id: 'room', ownerId: 'owner', name: 'Group', description: '', memberCount: 1, joinPolicy: 'invitation' };

test.each(['public', 'approval'])('搜索群按 %s 策略直接加入或发送申请', async policy => {
	const result = { ...room, owner: { id: 'creator', username: 'creator' }, ownerId: 'creator', joinPolicy: policy, isMember: false, invitationExists: false, joinRequestPending: false };
	mocks.invite.mockResolvedValue([result]);
	mocks.api.mockResolvedValue({ ...result, joinRequestPending: true });
	mocks.inputText.mockResolvedValue({ canceled: false, result: '  我想加入  ' });
	const view = render(GroupJoinDialog, { global: { stubs: {
		MkAvatar: true, MkLoading: true, MkResult: true,
		Mfm: { props: ['text'], template: '<span>{{ text }}</span>' },
	} } });
	await waitFor(() => expect(view.getByRole('button', { name: policy === 'approval' ? '申请加入' : '加入' })).toBeTruthy());
	await fireEvent.click(view.getByRole('button', { name: policy === 'approval' ? '申请加入' : '加入' }));
	if (policy === 'public') {
		await waitFor(() => expect(view.emitted('selected')).toBeTruthy());
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('chat/rooms/join', { roomId: 'room' });
		expect(view.emitted('selected')?.[0]).toEqual([expect.objectContaining({ id: 'room', isMember: true })]);
		expect(mocks.inputText).not.toHaveBeenCalled();
	} else {
		await waitFor(() => expect(view.getByRole('button', { name: '等待审核' })).toHaveProperty('disabled', true));
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('chat/rooms/requests/create', { roomId: 'room', requestMessage: '我想加入' });
		expect(view.emitted('selected')).toBeUndefined();
		expect(view.emitted('closed')).toBeUndefined();
	}
});

test.each([true, false])('成员页将申请交给审核接口，approve=%s 成功后移除申请', async approve => {
	const request = { id: 'request', user: { id: 'applicant', username: 'applicant' }, requestMessage: '验证说明', isRequest: true };
	mocks.invite.mockImplementation(async (_endpoint, params) => params.isRequest ? [request] : []);
	mocks.api.mockResolvedValue(undefined);
	const view = render(RoomMembers, { props: { room: { ...room, owner: { id: 'owner', username: 'owner' }, joinPolicy: 'approval' } as never, memberships: [] }, global: { stubs: { MkA: { template: '<a><slot/></a>' } } } });
	await waitFor(() => expect(view.getByText('验证说明')).toBeTruthy());
	await fireEvent.click(view.getByRole('button', { name: approve ? '同意' : '拒绝' }));
	await waitFor(() => expect(view.queryByText('验证说明')).toBeNull());
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('chat/rooms/requests/answer', { roomId: 'room', requestId: 'request', approve });
		expect(view.emitted('retry')).toEqual(approve ? [[]] : undefined);
});

test('退群清理本账号缓存，旧响应不能复活会话，重新入群的新快照可恢复', async () => {
	const left = { ...room, id: 'leave-room', name: '退出群', ownerId: 'creator', isMember: true };
	const kept = { ...left, id: 'keep-room', name: '保留群' };
	const messages = [left, kept].map((group, index) => ({ id: `message-${index}`, fromUserId: 'peer', fromUser: { id: 'peer', username: 'peer' }, toRoomId: group.id, toRoom: group, text: `消息${index}`, createdAt: '2026-10-05T00:00:00Z', isRead: true }));
	let polling = false;
	let finish!: (value: unknown[]) => void;
	mocks.invite.mockImplementation(async (endpoint, params) => {
		if (endpoint === 'chat/rooms/joining') return [left, kept].map(group => ({ id: group.id, room: group }));
		if (endpoint !== 'chat/history' || !params.room) return [];
		if (polling) return new Promise(resolve => { finish = resolve; });
		return messages;
	});
	const scrollKeys = ['chat-scroll:owner:room:leave-room', 'chat-scroll:owner:room:keep-room', 'chat-scroll:other-account:room:leave-room'];
	for (const key of scrollKeys) localStorage.setItem(key, 'saved-scroll');
	localStorage.setItem('chat-pinned:owner', JSON.stringify(['room:leave-room', 'room:keep-room']));
	localStorage.setItem('chat-pinned:other-account', JSON.stringify(['room:leave-room']));
	localStorage.setItem('chatMessageDrafts', JSON.stringify({
		'owner:room:leave-room': { data: { text: '退出群草稿' } },
		'owner:room:keep-room': { data: { text: '保留草稿' } },
		'other-account:room:leave-room': { data: { text: '其他账号草稿' } },
	}));
	cacheChatConversationTitle('other-account', { room: left });
	const view = render(MkChatHistories, { props: { all: true, compact: true }, global: { stubs: {
		MkA: { props: ['to'], template: '<a :href="to"><slot/></a>' }, MkAvatar: true, MkTime: true, MkResult: true,
		MkUserName: { props: ['user'], template: '<span>{{ user.name || user.username }}</span>' }, Mfm: { props: ['text'], template: '<span>{{ text }}</span>' },
	} } });
	try {
		await waitFor(() => expect(view.getAllByRole('link')).toHaveLength(2));
		expect(view.getByText('退出群草稿')).toBeTruthy();
		polling = true;
		const reconnect = streamMocks.connected.mock.calls.find(([event]) => event === '_connected_')![1];
		reconnect();
		await waitFor(() => expect(finish).toBeTypeOf('function'));
		const leave = streamMocks.on.mock.calls.find(([event]) => event === 'chatRoomLeft')![1];
		leave({ roomId: 'leave-room' });
		await waitFor(() => expect(view.queryByText('退出群')).toBeNull());
		expect(view.getByText('保留群')).toBeTruthy();
		finish(messages);
		await new Promise<void>(resolve => { window.setTimeout(resolve, 0); });
		await nextTick();
		expect(view.queryByText('退出群')).toBeNull();
		expect(view.getAllByRole('link')).toHaveLength(1);
		expect(JSON.parse(localStorage.getItem('chat-pinned:owner')!)).toEqual(['room:keep-room']);
		expect(JSON.parse(localStorage.getItem('chat-pinned:other-account')!)).toEqual(['room:leave-room']);
		expect(JSON.parse(localStorage.getItem('chatMessageDrafts')!)).toEqual({
			'owner:room:keep-room': { data: { text: '保留草稿' } },
			'other-account:room:leave-room': { data: { text: '其他账号草稿' } },
		});
		expect(localStorage.getItem(scrollKeys[0])).toBeNull();
		for (const key of scrollKeys.slice(1)) expect(localStorage.getItem(key)).toBe('saved-scroll');
		expect(getChatConversationTitle('owner', 'room:leave-room')).toBeUndefined();
		expect(getChatConversationTitle('owner', 'room:keep-room')?.name).toBe('保留群');
		expect(getChatConversationTitle('other-account', 'room:leave-room')?.name).toBe('退出群');
		polling = false;
		reconnect();
		await waitFor(() => expect(view.getByText('退出群')).toBeTruthy());
		expect(view.getAllByRole('link')).toHaveLength(2);
		expect(view.queryByText('退出群草稿')).toBeNull();
	} finally {
		for (const key of scrollKeys) localStorage.removeItem(key);
		localStorage.removeItem('chat-pinned:other-account');
	}
});

test('会话标题缓存保留用户和群名，且按当前账号隔离', () => {
	const user = { id: 'cached-peer', username: 'peer', name: '已缓存姓名' } as never;
	cacheChatConversationTitle('owner', { user });
	cacheChatConversationTitle('owner', { room: { id: 'cached-room', name: '原群名（3）' } });
	expect(getChatConversationTitle('owner', 'user:cached-peer')).toEqual({ name: '已缓存姓名', user });
	expect(getChatConversationTitle('owner', 'room:cached-room')).toEqual({ name: '原群名（3）', user: null });
	expect(getChatConversationTitle('another-account', 'user:cached-peer')).toBeUndefined();
	expect(getChatConversationTitle('another-account', 'room:cached-room')).toBeUndefined();
});

test('saving updates the parent title and closes only after the API succeeds without a toast', async () => {
	const updated = { ...room, name: 'Updated' };
	const pendingSave = Promise.withResolvers<typeof updated>();
	mocks.api.mockReturnValue(pendingSave.promise);
	const events: string[] = [];
	const view = render(RoomInfo, { props: { room: room as never, onUpdated: () => events.push('updated'), onClose: () => events.push('close') } });
	await fireEvent.click(view.getByText('Save'));
	await waitFor(() => expect(mocks.api).toHaveBeenCalled());
	expect(events).toEqual([]);
	pendingSave.resolve(updated);
	await waitFor(() => expect(events).toEqual(['updated', 'close']));
	expect(mocks.success).not.toHaveBeenCalled();
	expect(mocks.toast).not.toHaveBeenCalled();
	expect(view.emitted().updated).toEqual([[updated]]);
	expect(view.emitted().close).toEqual([[]]);
	expect(mocks.api).toHaveBeenCalledExactlyOnceWith('chat/rooms/update', {
		roomId: 'room', name: 'Group', description: '', joinPolicy: 'invitation', avatarId: null, isSilenced: false, silenceUntil: null,
	});
});

test('a failed save permits retry without a false success notification', async () => {
	mocks.api.mockRejectedValue(new Error('request failed'));
	const view = render(RoomInfo, { props: { room: room as never } });
	await fireEvent.click(view.getByText('Save'));
	await waitFor(() => expect((view.getByText('Save') as HTMLButtonElement).disabled).toBe(false));
	expect(mocks.success).not.toHaveBeenCalled();
	expect(view.emitted().updated).toBeUndefined();
	expect(view.emitted().close).toBeUndefined();
});

test('删除确认取消时保留群修改弹窗且不发送请求', async () => {
	mocks.confirm.mockResolvedValue({ canceled: true });
	const view = render(RoomInfo, { props: { room: room as never } });
	await fireEvent.click(view.getByRole('button', { name: 'Delete' }));
	await waitFor(() => expect(mocks.confirm).toHaveBeenCalledWith({ type: 'warning', text: 'Delete Group?' }));
	expect(mocks.api).not.toHaveBeenCalled();
	expect(view.emitted().close).toBeUndefined();
	expect(mocks.push).not.toHaveBeenCalled();
});

test('确认删除后等待请求成功再关闭弹窗并返回聊天', async () => {
	mocks.confirm.mockResolvedValue({ canceled: false });
	const pendingDelete = Promise.withResolvers<void>();
	mocks.api.mockReturnValue(pendingDelete.promise);
	const view = render(RoomInfo, { props: { room: room as never } });
	await fireEvent.click(view.getByRole('button', { name: 'Delete' }));
	await waitFor(() => expect(mocks.api).toHaveBeenCalledExactlyOnceWith('chat/rooms/delete', { roomId: 'room' }));
	expect(view.emitted().close).toBeUndefined();
	expect(mocks.push).not.toHaveBeenCalled();
	pendingDelete.resolve();
	await waitFor(() => expect(view.emitted().close).toEqual([[]]));
	expect(mocks.push).toHaveBeenCalledExactlyOnceWith('/chat');
	expect(mocks.success).not.toHaveBeenCalled();
	expect(mocks.toast).not.toHaveBeenCalled();
});

test('删除失败保留群修改弹窗以便重试', async () => {
	mocks.confirm.mockResolvedValue({ canceled: false });
	mocks.api.mockRejectedValue(new Error('request failed'));
	const view = render(RoomInfo, { props: { room: room as never } });
	await fireEvent.click(view.getByRole('button', { name: 'Delete' }));
	await waitFor(() => expect(mocks.api).toHaveBeenCalledExactlyOnceWith('chat/rooms/delete', { roomId: 'room' }));
	expect(view.emitted().close).toBeUndefined();
	expect(mocks.push).not.toHaveBeenCalled();
});

test('the owner can save a changed joining policy', async () => {
	mocks.api.mockResolvedValue({ ...room, joinPolicy: 'closed' });
	const view = render(RoomInfo, { props: { room: room as never } });
	await fireEvent.update(view.getByRole('combobox', { name: 'Joining' }), 'closed');
	await fireEvent.click(view.getByText('Save'));
	await waitFor(() => expect(mocks.api).toHaveBeenCalledExactlyOnceWith('chat/rooms/update', {
		roomId: 'room', name: 'Group', description: '', joinPolicy: 'closed', avatarId: null, isSilenced: false, silenceUntil: null,
	}));
});

test('a member cannot edit the joining policy', () => {
	const view = render(RoomInfo, { props: { room: { ...room, ownerId: 'someone-else' } as never } });
	expect((view.getByRole('combobox', { name: 'Joining' }) as HTMLSelectElement).disabled).toBe(true);
	expect(view.queryByText('Save')).toBeNull();
	expect(mocks.api).not.toHaveBeenCalled();
});

test('群管理员只能保存禁言设置，不能提交群资料或加入策略', async () => {
	const managedRoom = { ...room, ownerId: 'someone-else', myRole: 'administrator' };
	mocks.api.mockResolvedValue(managedRoom);
	const view = render(RoomInfo, { props: { room: managedRoom as never } });
	expect((view.getByRole('combobox', { name: 'Joining' }) as HTMLSelectElement).disabled).toBe(true);
	await fireEvent.click(view.getByText('Silence'));
	await fireEvent.click(view.getByText('Save'));
	await waitFor(() => expect(mocks.api).toHaveBeenCalledExactlyOnceWith('chat/rooms/update', { roomId: 'room', isSilenced: true, silenceUntil: null }));
});

test('其他管理员的禁言更新同步到未编辑表单，保存不会覆盖新状态', async () => {
	const managedRoom = { ...room, ownerId: 'someone-else', myRole: 'administrator', isSilenced: false };
	const view = render(RoomInfo, { props: { room: managedRoom as never } });
	const updated = { ...managedRoom, isSilenced: true, silenceUntil: '2099-10-05T08:00:00.000Z' };
	mocks.api.mockResolvedValue(updated);
	await view.rerender({ room: updated as never });
	expect(view.getByText('Silence').querySelector('input')!.checked).toBe(true);
	await fireEvent.click(view.getByText('Save'));
	await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('chat/rooms/update', { roomId: 'room', isSilenced: true, silenceUntil: updated.silenceUntil }));
});

test.each(['owner', 'administrator', 'member'])('成员按角色和用户名排序，%s 只显示允许的成员操作', async role => {
	const members = [
		{ id: 'm1', userId: 'z', role: 'member', user: { id: 'z', username: 'zebra' } },
		{ id: 'm2', userId: 'b', role: 'administrator', user: { id: 'b', username: 'Beta' } },
		{ id: 'm3', userId: 'a', role: 'administrator', user: { id: 'a', username: 'Alpha' } },
		{ id: 'm4', userId: 'c', role: 'member', user: { id: 'c', username: 'charlie' } },
	];
	mocks.invite.mockImplementation(async endpoint => endpoint === 'chat/rooms/members' ? members : []);
	const view = render(RoomMembers, { props: { room: { ...room, ownerId: role === 'owner' ? 'owner' : 'other', owner: { id: 'other', username: 'Owner' }, myRole: role } as never }, global: { stubs: { MkA: { template: '<a><slot/></a>' } } } });
	await waitFor(() => expect(view.getByText('zebra')).toBeTruthy());
	expect(view.getAllByRole('group').map(row => row.textContent)).toEqual(['OwnerOwner', 'AlphaAdministrator', 'BetaAdministrator', 'charlie', 'zebra']);
	expect(view.queryAllByRole('button', { name: 'Manage member' })).toHaveLength(5);
	await fireEvent.click(view.getAllByRole('button', { name: 'Manage member' })[1]);
	const selectedMember = (view.emitted('menu') as unknown[][])[0][1];
	expect(selectedMember).toMatchObject({ user: { id: 'a' }, role: 'administrator' });
	if (role === 'owner') {
		const actions = getChatMemberMenu(room as never, selectedMember as never, { mention: vi.fn(), poke: vi.fn(), updated: vi.fn(), isHidden: false, toggleHidden: vi.fn(), canCompose: true });
		await (actions.find(item => 'text' in item && item.text === 'Demote') as MenuButton).action({} as PointerEvent);
		expect(mocks.api).toHaveBeenCalledWith('chat/rooms/members/update', { roomId: 'room', userId: 'a', role: 'member' });
	}
});

test('a non-member can view room information without a mute control', () => {
	const view = render(RoomInfo, { props: { room: { ...room, ownerId: 'someone-else', isMember: false } as never } });
	expect(view.queryByTestId('mute-switch')).toBeNull();
	expect(view.queryByText('Save')).toBeNull();
	expect(mocks.api).not.toHaveBeenCalled();
});

test('全员禁言保存本地时间对应的结束时间，解除时清除到期时间', async () => {
	mocks.api.mockResolvedValue(room);
	const view = render(RoomInfo, { props: { room: room as never } });
	await fireEvent.click(view.getByRole('checkbox', { name: 'Silence' }));
	await fireEvent.update(view.getByLabelText('Until'), '2099-10-05T18:30');
	await fireEvent.click(view.getByText('Save'));
	await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('chat/rooms/update', expect.objectContaining({ isSilenced: true, silenceUntil: new Date('2099-10-05T18:30').toISOString() })));
	await fireEvent.click(view.getByRole('checkbox', { name: 'Silence' }));
	await fireEvent.click(view.getByText('Save'));
	await waitFor(() => expect(mocks.api).toHaveBeenLastCalledWith('chat/rooms/update', expect.objectContaining({ isSilenced: false, silenceUntil: null })));
});

test('创建群聊弹窗不显示顶部邀请入口，仍按表单创建空群', async () => {
	mocks.api.mockResolvedValue(room);
	const view = render(GroupCreateDialog);
	expect(view.queryByText('Invite')).toBeNull();
	expect(view.queryByRole('button', { name: /移除/ })).toBeNull();
	await fireEvent.update(view.getByLabelText('Name'), '自定义群名');
	await fireEvent.submit(view.container.querySelector('form')!);
	await waitFor(() => expect(mocks.api).toHaveBeenCalledExactlyOnceWith('chat/rooms/create', { name: '自定义群名', description: '', avatarId: null, joinPolicy: 'public' }));
});

test('邀请单选过滤和去重，点击用户后立即返回结果', async () => {
	const alpha = { id: 'alpha', username: 'alpha', name: 'Alpha', host: null };
	const beta = { id: 'beta', username: 'beta', name: 'Beta', host: null };
	const gamma = { id: 'gamma', username: 'gamma', name: 'Gamma', host: null };
	mocks.invite.mockImplementation(async endpoint => endpoint === 'users/show'
		? [alpha, alpha, beta, { id: 'owner', username: 'owner' }, { id: 'excluded', username: 'excluded' }, { id: 'remote', username: 'remote', host: 'remote.test' }]
		: [beta, gamma, gamma]);
	mocks.api.mockResolvedValue(beta);
	const view = render(MkUserSelectDialog, { props: { localOnly: true, excludeUserIds: ['excluded'] }, global: { stubs: {
		MkAvatar: true, MkAcct: true, MkUserName: { props: ['user'], template: '<span>{{ user.name }}</span>' },
	} } });
	await waitFor(() => expect(view.getByRole('button', { name: 'Alpha' })).toBeTruthy());
	const rows = () => view.getAllByRole('button').filter(button => button.hasAttribute('aria-pressed'));
	expect(rows().map(button => button.textContent)).toEqual(['Alpha', 'Beta']);
	await fireEvent.update(view.getByRole('textbox'), 'b');
	await waitFor(() => expect(view.getByRole('button', { name: 'Gamma' })).toBeTruthy());
	expect(rows().map(button => button.textContent)).toEqual(['Beta', 'Gamma']);
	await fireEvent.update(view.getByRole('textbox'), '');
	expect(rows().map(button => button.textContent)).toEqual(['Alpha', 'Beta']);
	await fireEvent.click(view.getByRole('button', { name: 'Alpha' }));
	await waitFor(() => expect(view.emitted('ok')).toEqual([[beta]]));
	expect(view.emitted('closed')).toEqual([[]]);
	expect(mocks.api).toHaveBeenCalledExactlyOnceWith('users/show', { userId: 'alpha' });
	expect(view.queryByRole('button', { name: '完成' })).toBeNull();
});

test('默认选择器单选，点击用户后立即返回结果', async () => {
	const alpha = { id: 'alpha', username: 'alpha', name: 'Alpha', host: null };
	const beta = { id: 'beta', username: 'beta', name: 'Beta', host: null };
	mocks.invite.mockResolvedValue([alpha, beta]);
	mocks.api.mockResolvedValue(beta);
	const view = render(MkUserSelectDialog, { props: { localOnly: true }, global: { stubs: {
		MkAvatar: true, MkAcct: true, MkUserName: { props: ['user'], template: '<span>{{ user.name }}</span>' },
	} } });
	await waitFor(() => expect(view.getByRole('button', { name: 'Alpha' })).toBeTruthy());
	await fireEvent.click(view.getByRole('button', { name: 'Alpha' }));
	await waitFor(() => expect(view.emitted('ok')).toEqual([[beta]]));
	expect(view.emitted('closed')).toEqual([[]]);
	expect(mocks.api).toHaveBeenCalledExactlyOnceWith('users/show', { userId: 'alpha' });
	expect(view.queryByRole('button', { name: '完成' })).toBeNull();
});

test('群主自己的菜单只有发送消息、戳一戳、资料和昵称，其他管理员不能管理同级', async () => {
	const actions = { mention: vi.fn(), poke: vi.fn(), updated: vi.fn(), isHidden: false, toggleHidden: vi.fn(), canCompose: true };
	const self = { user: { id: 'owner', username: 'owner' }, role: 'owner', nickname: '', isSilenced: false, silenceUntil: null };
	const menu = getChatMemberMenu(room as never, self as never, actions);
	expect(menu.map(item => 'text' in item ? item.text : '')).toEqual(['Send message', 'Poke', 'Profile', 'Nickname']);
	expect(menu[0]).toMatchObject({ to: '/chat/user/owner' });
	await (menu[1] as MenuButton).action({} as PointerEvent);
	expect(actions.poke).toHaveBeenCalledWith('owner');
	mocks.inputText.mockResolvedValue({ canceled: false, result: ' 群内昵称 ' });
	await (menu[3] as MenuButton).action({} as PointerEvent);
	expect(mocks.api).toHaveBeenCalledWith('chat/rooms/members/update', { roomId: 'room', userId: 'owner', nickname: '群内昵称' });
	const adminMenu = getChatMemberMenu({ ...room, ownerId: 'other', myRole: 'administrator' } as never, { ...self, user: { id: 'peer', username: 'peer' }, role: 'administrator' } as never, actions);
	expect(adminMenu.flatMap(item => 'text' in item ? [item.text] : [])).toEqual(['Send message', 'Mention', 'Poke', 'Profile', 'Report', 'Hide messages']);
});

test('成员禁言菜单提交期限，屏蔽仅使用当前聊天室显示回调', async () => {
	const actions = { mention: vi.fn(), poke: vi.fn(), updated: vi.fn(), isHidden: false, toggleHidden: vi.fn(), canCompose: true };
	const menu = getChatMemberMenu(room as never, { user: { id: 'peer', username: 'peer' }, role: 'member', nickname: '', isSilenced: false, silenceUntil: null } as never, actions);
	const silence = menu.find(item => 'type' in item && item.type === 'parent') as MenuParent;
	await ((silence.children as MenuButton[]).find(item => item.text === 'One hour')!).action({} as PointerEvent);
	expect(mocks.api).toHaveBeenCalledWith('chat/rooms/members/update', expect.objectContaining({ roomId: 'room', userId: 'peer', isSilenced: true }));
	expect(Date.parse(mocks.api.mock.lastCall![1].silenceUntil) - Date.now()).toBeGreaterThan(3590000);
	await (menu.find(item => 'text' in item && item.text === 'Hide messages') as MenuButton).action({} as PointerEvent);
	expect(actions.toggleHidden).toHaveBeenCalledOnce();
	expect(mocks.api).toHaveBeenCalledOnce();
});

test('群公告默认空，保存失败保留内容供重试', async () => {
	mocks.api.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ...room, announcement: '明天见' });
	const view = render(RoomAnnouncement, { props: { room: { ...room, announcement: '' } as never } });
	expect(view.getByRole('textbox')).toHaveProperty('value', '');
	await fireEvent.update(view.getByRole('textbox'), '明天见');
	await fireEvent.click(view.getByRole('button', { name: 'Save' }));
	await waitFor(() => expect(view.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(false));
	expect(view.getByRole('textbox')).toHaveProperty('value', '明天见');
	await fireEvent.click(view.getByRole('button', { name: 'Save' }));
	await waitFor(() => expect(view.emitted('updated')).toHaveLength(1));
	expect(mocks.api).toHaveBeenLastCalledWith('chat/rooms/update', { roomId: 'room', announcement: '明天见' });
});

test('未发送成功的私聊在列表重载后仍存在并显示草稿，不跨账号泄漏', async () => {
	rememberChatConversation('owner', { id: 'peer', username: 'peer', name: 'Peer' } as never);
	localStorage.setItem('chatMessageDrafts', JSON.stringify({ 'owner:user:peer': { data: { text: '未发送成功的消息' } } }));
	expect(getRecentChatConversations('other-account')).toEqual([]);
	mocks.invite.mockResolvedValue([]);
	const view = render(MkChatHistories, { props: { all: true }, global: { stubs: {
		MkA: { props: ['to'], template: '<a :href="to"><slot/></a>' },
		MkAvatar: true, MkAcct: true, MkTime: true, MkLoading: true, MkResult: true,
		MkUserName: { props: ['user'], template: '<span>{{ user.name }}</span>' },
		Mfm: { props: ['text'], template: '<span>{{ text }}</span>' },
	} } });
	await waitFor(() => expect(view.getByRole('link').getAttribute('href')).toBe('/chat/user/peer'));
	expect(view.getByRole('link').textContent).toContain('Peer');
	expect(view.getByRole('link').textContent).toMatch(/\[草稿\]\s*未发送成功的消息/);
});

test.each([false, true])('未打开的会话通过即时事件同步新增、编辑和连续撤回，群聊=%s', async group => {
	const peer = { id: 'peer', username: 'peer' };
	const base = { fromUserId: 'peer', fromUser: peer, toUserId: group ? null : 'owner', toRoomId: group ? 'room' : null, toRoom: group ? room : null, createdAt: '2026-10-05T00:00:00Z' };
	let latest: unknown[] = [{ ...base, id: '1', text: '原消息' }];
	mocks.invite.mockImplementation(async (endpoint, params) => endpoint === 'chat/history' && params.room === group ? latest : endpoint === 'chat/rooms/owned' && group ? [room] : []);
	const view = render(MkChatHistories, { props: { all: true }, slots: {
		default: ({ history }: { history: { message: { text: string } | null }[] }) => history.map(item => item.message?.text ?? '空会话').join('/'),
	} });
	await waitFor(() => expect(view.container.textContent).toBe('原消息'));
	const update = streamMocks.on.mock.calls.find(([event]) => event === 'chatHistoryUpdated')![1];
	const target = group ? { roomId: 'room' } : { userId: 'peer' };
	latest = [{ ...base, id: '2', text: '新消息' }];
	update({ ...target, messageId: '2' });
	await waitFor(() => expect(view.container.textContent).toBe('新消息'));
	latest = [{ ...base, id: '2', text: '编辑后' }];
	update({ ...target, messageId: '2' });
	await waitFor(() => expect(view.container.textContent).toBe('编辑后'));
	latest = [{ ...base, id: '1', text: '原消息' }];
	update({ ...target, messageId: '2', deleted: true });
	await waitFor(() => expect(view.container.textContent).toBe('原消息'));
	latest = [];
	update({ ...target, messageId: '1', deleted: true });
	await waitFor(() => expect(view.container.textContent).toBe('空会话'));
	expect(mocks.invite).toHaveBeenCalledWith('chat/history', { limit: 1, room: group, ...target });
	view.unmount();
	expect(streamMocks.dispose).toHaveBeenCalledOnce();
	expect(streamMocks.off).toHaveBeenCalledWith('_connected_', expect.any(Function));
});

test('持续消息到达时仍逐次更新，旧的全量请求不能复活撤回内容', async () => {
	const base = { fromUserId: 'peer', fromUser: { id: 'peer', username: 'peer' }, toUserId: 'owner', createdAt: '2026-10-05T00:00:00Z' };
	let polling = false;
	let resolvePoll!: (messages: unknown[]) => void;
	const pending: ((messages: unknown[]) => void)[] = [];
	mocks.invite.mockImplementation(async (endpoint, params) => {
		if (endpoint !== 'chat/history' || params.room) return [];
		if (params.userId) return new Promise(resolve => pending.push(resolve));
		if (polling) return new Promise(resolve => { resolvePoll = resolve; });
		return [{ ...base, id: '1', text: '原消息' }];
	});
	const view = render(MkChatHistories, { props: { all: true }, slots: {
		default: ({ history }: { history: { message: { text: string } | null }[] }) => history.map(item => item.message?.text ?? '空会话').join('/'),
	} });
	await waitFor(() => expect(view.container.textContent).toBe('原消息'));
	const update = streamMocks.on.mock.calls.find(([event]) => event === 'chatHistoryUpdated')![1];
	polling = true;
	mocks.interval.mock.calls[0][0]();
	update({ userId: 'peer', messageId: '2' });
	update({ userId: 'peer', messageId: '3' });
	pending[0]([{ ...base, id: '2', text: '第二条' }]);
	await waitFor(() => expect(view.container.textContent).toBe('第二条'));
	update({ userId: 'peer', messageId: '4' });
	pending[1]([{ ...base, id: '3', text: '第三条' }]);
	await waitFor(() => expect(view.container.textContent).toBe('第三条'));
	update({ userId: 'peer', messageId: '3', deleted: true });
	pending[2]([{ ...base, id: '3', text: '已删除的旧响应' }]);
	await waitFor(() => expect(pending).toHaveLength(4));
	pending[3]([{ ...base, id: '4', text: '最终消息' }]);
	await waitFor(() => expect(view.container.textContent).toBe('最终消息'));
	resolvePoll([{ ...base, id: '1', text: '旧轮询' }]);
	await waitFor(() => expect(view.container.textContent).toBe('最终消息'));
});

test('旧定向请求不能覆盖后发先至的完整快照，普通列表保持数量与时间顺序', async () => {
	const makeMessage = (id: string, userId: string, text: string) => ({ id, fromUserId: userId, fromUser: { id: userId, username: userId }, toUserId: 'owner', text, createdAt: `2026-10-05T00:00:0${id}Z` });
	let latest = makeMessage('1', 'peer', '原消息');
	let resolveTarget!: (messages: unknown[]) => void;
	let deferred = true;
	mocks.invite.mockImplementation(async (endpoint, params) => {
		if (endpoint !== 'chat/history' || params.room) return [];
		if (params.userId && deferred) return new Promise(resolve => { resolveTarget = resolve; });
		return [latest];
	});
	const view = render(MkChatHistories, { props: { limit: 1 }, slots: {
		default: ({ history }: { history: { message: { text: string } | null }[] }) => history.map(item => item.message?.text).join('/'),
	} });
	await waitFor(() => expect(view.container.textContent).toBe('原消息'));
	const update = streamMocks.on.mock.calls.find(([event]) => event === 'chatHistoryUpdated')![1];
	update({ userId: 'peer', messageId: '2' });
	latest = makeMessage('3', 'peer', '较新快照');
	mocks.interval.mock.calls[0][0]();
	await waitFor(() => expect(view.container.textContent).toBe('较新快照'));
	resolveTarget([makeMessage('2', 'peer', '旧定向响应')]);
	await new Promise(resolve => setTimeout(resolve, 0));
	expect(view.container.textContent).toBe('较新快照');
	deferred = false;
	latest = makeMessage('4', 'new-peer', '新会话');
	update({ userId: 'new-peer', messageId: '4' });
	await waitFor(() => expect(view.container.textContent).toBe('新会话'));
});

test('历史首次完整加载，轮询仅刷新最近会话并保留旧会话和空群', async () => {
	const messages = Array.from({ length: 101 }, (_, index) => ({
		id: `message${index}`, fromUserId: `peer${index}`, toUserId: 'owner', toRoomId: null,
		fromUser: { id: `peer${index}`, username: `peer${index}` }, text: `旧消息${index}`,
		createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 101 - index)).toISOString(),
	}));
	let refreshed = false;
	mocks.invite.mockImplementation(async (endpoint, params) => {
		if (endpoint === 'chat/rooms/owned') return [{ ...room, name: '无消息的群' }];
		if (endpoint !== 'chat/history' || params.room) return [];
		if (refreshed) return [{ ...messages[0], id: 'newMessage', text: '最新消息', createdAt: '2026-01-02T00:00:00Z' }, ...messages.slice(1, 100)];
		return messages.slice(params.offset ?? 0, (params.offset ?? 0) + params.limit);
	});
	const view = render(MkChatHistories, { props: { all: true }, slots: {
		default: ({ history }: { history: { id: string; message: { text: string } | null; room: { name: string } | null }[] }) => history.map(item => item.message?.text ?? item.room?.name).join(' / '),
	} });
	await waitFor(() => expect(view.container.textContent).toContain('旧消息100'));
	expect(view.container.textContent).toContain('无消息的群');
	expect(mocks.invite).toHaveBeenCalledWith('chat/history', { room: false, limit: 100, offset: 100 });
	refreshed = true;
	mocks.invite.mockClear();
	mocks.interval.mock.calls[0][0]();
	await waitFor(() => expect(view.container.textContent).toContain('最新消息'));
	expect(view.container.textContent).toContain('旧消息100');
	expect(view.container.textContent).toContain('无消息的群');
	expect(mocks.invite).toHaveBeenCalledTimes(3);
	expect(mocks.invite).toHaveBeenCalledWith('chat/history', { room: false, limit: 100 });
	expect(mocks.invite).toHaveBeenCalledWith('chat/history', { room: true, limit: 100 });
});

test('当前会话单击保持选中，双击触发同路由最新跳转，其他会话正常切换', async () => {
	const peers = [{ id: 'peer', username: 'peer', name: 'Peer' }, { id: 'other', username: 'other', name: 'Other' }];
	mocks.invite.mockImplementation(async (endpoint, params) => endpoint === 'chat/history' && !params.room ? peers.map((peer, index) => ({
		id: `message${index}`, fromUserId: peer.id, fromUser: peer, toUserId: 'owner', text: `内容${index}`, isRead: true, createdAt: '2026-10-05T00:00:00Z',
	})) : []);
	const view = render(MkChatHistories, { props: { all: true, compact: true, selectedTo: '/chat/user/peer' }, global: { stubs: {
		MkA: defineComponent({ props: { to: { type: String, required: true } }, setup: props => ({ navigate: () => mocks.navigate(props.to) }), template: '<a :href="to" @click.prevent="navigate"><slot/></a>' }),
		MkAvatar: true, MkTime: true, MkResult: true, MkUserName: { props: ['user'], template: '<span>{{ user.name }}</span>' }, Mfm: { props: ['text'], template: '<span>{{ text }}</span>' },
	} } });
	await waitFor(() => expect(view.getAllByRole('link')).toHaveLength(2));
	const current = view.getByRole('link', { name: /Peer/ });
	expect(current.getAttribute('href')).toBe('/chat/user/peer');
	await fireEvent.click(current);
	await fireEvent.click(current);
	expect(mocks.navigate).not.toHaveBeenCalled();
	expect(current.getAttribute('aria-current')).toBe('page');
	await fireEvent.dblClick(current);
	expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith('/chat/user/peer');
	await fireEvent.click(view.getByRole('link', { name: /Other/ }));
	expect(mocks.navigate).toHaveBeenLastCalledWith('/chat/user/other');
});

test.each([false, true])('置顶会话实时同步预览和未读，阅读进度优先于迟到快照，当前选中=%s', async selected => {
	localStorage.setItem('chat-pinned:owner', '["room:room"]');
	let message = { id: '001', fromUserId: 'peer', fromUser: { id: 'peer', username: 'peer' }, toRoomId: room.id, toRoom: room, text: '第一条', isRead: false, createdAt: '2026-10-05T00:00:00Z' };
	let unread = { count: 3, firstMessageId: '001', firstMentionId: null, lastMessageId: '003' };
	let deferUnread = false;
	const pending: ((value: typeof unread) => void)[] = [];
	mocks.invite.mockImplementation(async (endpoint, params) => {
		if (endpoint === 'chat/rooms/owned') return [room];
		if (endpoint === 'chat/history' && params.room) return [message];
		if (endpoint === 'chat/unread') return deferUnread ? new Promise(resolve => pending.push(resolve)) : unread;
		return [];
	});
	const view = render(MkChatHistories, { props: { all: true, compact: true, selectedTo: selected ? '/chat/room/room' : undefined }, global: { stubs: {
		MkA: { props: ['to'], template: '<a :href="to"><slot/></a>' }, MkAvatar: true, MkResult: true,
		MkTime: { props: ['time'], template: '<time>{{ time }}</time>' }, MkUserName: { props: ['user'], template: '<span>{{ user.username }}</span>' }, Mfm: { props: ['text'], template: '<span>{{ text }}</span>' },
	} } });
	await waitFor(() => expect(view.getByLabelText('3 条未读消息').textContent).toBe('3'));
	expect(view.queryByRole('img', { name: '置顶' })).toBeNull();
	const update = streamMocks.on.mock.calls.find(([event]) => event === 'chatHistoryUpdated')![1];
	message = { ...message, id: '002', text: '第二条', createdAt: '2026-10-05T00:01:00Z' };
	unread = { ...unread, count: 4, lastMessageId: '004' };
	update({ roomId: room.id, messageId: '002' });
	await waitFor(() => expect(view.getByLabelText('4 条未读消息').textContent).toBe('4'));
	expect(view.getByText('第二条')).toBeTruthy();
	expect(view.getByText('2026-10-05T00:01:00Z')).toBeTruthy();
	deferUnread = true;
	message = { ...message, id: '003', text: '第三条' };
	update({ roomId: room.id, messageId: '003' });
	await waitFor(() => expect(pending).toHaveLength(1));
	message = { ...message, id: '004', text: '第四条' };
	update({ roomId: room.id, messageId: '004' });
	await waitFor(() => expect(view.getByText('第四条')).toBeTruthy());
	expect(pending).toHaveLength(1);
	globalEvents.emit('chatUnreadChanged', { id: 'room:room', count: 1, throughId: '003' });
	await waitFor(() => expect(view.getByLabelText('1 条未读消息').textContent).toBe('1'));
	deferUnread = false;
	unread = { ...unread, count: 1, firstMessageId: '004', lastMessageId: '004' };
	pending[0]({ ...unread, count: 5, firstMessageId: '001' });
	await new Promise<void>(resolve => { window.setTimeout(resolve, 0); });
	await nextTick();
	expect(view.getByLabelText('1 条未读消息')).toBeTruthy();
	expect(view.queryByLabelText('5 条未读消息')).toBeNull();
	globalEvents.emit('chatUnreadChanged', { id: 'room:room', count: 0, throughId: '004' });
	await waitFor(() => expect(view.getByRole('img', { name: '置顶' })).toBeTruthy());
	expect(view.queryByLabelText('1 条未读消息')).toBeNull();
});

test('会话按名称排序，置顶最多五个并保留其余会话，刷新恢复且账号隔离', async () => {
	const rooms = ['Foxtrot', 'echo', 'Delta', 'charlie', 'Beta', 'alpha'].map(name => ({ ...room, id: name, name }));
	localStorage.setItem('chat-pinned:owner', '["room:deleted"]');
	localStorage.setItem('chat-pinned:other', '["room:alpha"]');
	mocks.invite.mockImplementation(async endpoint => endpoint === 'chat/rooms/owned' ? rooms : []);
	const mount = () => render(MkChatHistories, { props: { all: true, compact: true, hideLoading: true }, global: { stubs: {
		MkA: { props: ['to'], template: '<a :href="to"><slot/></a>' },
		MkAvatar: true, MkAcct: true, MkTime: true, MkLoading: true, MkResult: true,
		Mfm: { props: ['text'], template: '<span>{{ text }}</span>' },
	} } });
	let view = mount();
	await waitFor(() => expect(view.getAllByRole('link')).toHaveLength(6));
	expect(view.getAllByRole('link').map(link => link.textContent)).toEqual(['alpha', 'Beta', 'charlie', 'Delta', 'echo', 'Foxtrot']);
	expect(view.queryByRole('button', { name: '置顶' })).toBeNull();
	for (const name of ['Foxtrot', 'echo', 'Delta', 'charlie', 'Beta']) {
		await fireEvent.contextMenu(view.getByRole('link', { name }));
		await mocks.contextMenu.mock.calls.at(-1)![0][0].action();
	}
	expect(view.getAllByRole('link').map(link => link.textContent)).toEqual(['Beta', 'charlie', 'Delta', 'echo', 'Foxtrot', 'alpha']);
	await fireEvent.contextMenu(view.getByRole('link', { name: 'alpha' }));
	await mocks.contextMenu.mock.calls.at(-1)![0][0].action();
	expect(mocks.toast).toHaveBeenCalledWith('最多置顶 5 个会话', 'error');
	expect(view.getAllByRole('img', { name: '置顶' })).toHaveLength(5);
	view.unmount();
	view = mount();
	await waitFor(() => expect(view.getAllByRole('img', { name: '置顶' })).toHaveLength(5));
	await fireEvent.contextMenu(view.getByRole('link', { name: /Foxtrot/ }));
	await mocks.contextMenu.mock.calls.at(-1)![0][0].action();
	await fireEvent.contextMenu(view.getByRole('link', { name: 'alpha' }));
	await mocks.contextMenu.mock.calls.at(-1)![0][0].action();
	expect(view.getAllByRole('link').map(link => link.textContent)).toEqual(['alpha', 'Beta', 'charlie', 'Delta', 'echo', 'Foxtrot']);
	expect(JSON.parse(localStorage.getItem('chat-pinned:owner')!)).toHaveLength(5);
	expect(localStorage.getItem('chat-pinned:other')).toBe('["room:alpha"]');
});

test('选择静音时长后提交秒数并同步群状态，取消选择不发送请求', async () => {
	mocks.select.mockResolvedValueOnce({ canceled: true });
	expect(await setChatRoomMuted(room as never, true)).toBeNull();
	expect(mocks.invite).not.toHaveBeenCalled();
	mocks.select.mockResolvedValue({ canceled: false, result: 3600 });
	const muted = { ...room, isMuted: true, mutedUntil: '2099-10-05T18:30:00Z' };
	mocks.invite.mockImplementation(async endpoint => endpoint === 'chat/rooms/show' ? muted : endpoint === 'chat/conversations' ? [] : undefined);
	expect(await setChatRoomMuted(room as never, true)).toEqual(muted);
	expect(mocks.invite).toHaveBeenCalledWith('chat/rooms/mute', { roomId: room.id, mute: true, duration: 3600 });
});

test.each([true, false])('群聊和私信右键连接各自的复制、未读、免打扰和移除操作，群聊=%s', async group => {
	const peer = { id: 'peer', username: 'peer', name: 'Peer', host: null };
	const target = group ? { roomId: room.id } : { userId: peer.id };
	const setting = { userId: group ? null : peer.id, roomId: group ? room.id : null, notificationMode: 'all', mutedUntil: null, hidden: false, hiddenThroughId: null, markedUnread: false };
	const message = { id: '001', fromUserId: peer.id, fromUser: peer, toUserId: 'owner', text: 'Hello', isRead: true, createdAt: '2026-10-05T00:00:00Z' };
	mocks.invite.mockImplementation(async (endpoint, params) => {
		if (endpoint === 'chat/conversations') return [setting];
		if (endpoint === 'chat/rooms/owned') return group ? [room] : [];
		if (endpoint === 'chat/history' && !params.room && !group) return [message];
		return [];
	});
	mocks.api.mockImplementation(async (_endpoint, params) => ({ ...setting, notificationMode: params.notificationMode ?? setting.notificationMode, hidden: params.hidden ?? false, hiddenThroughId: params.hidden ? '001' : null, markedUnread: params.unread ?? false }));
	const view = render(MkChatHistories, { props: { all: true, compact: true, hideLoading: true }, global: { stubs: {
		MkA: { props: ['to'], template: '<a :href="to"><slot/></a>' }, MkAvatar: true, MkTime: true, MkResult: true,
		MkUserName: { props: ['user'], template: '<span>{{ user.name }}</span>' },
		Mfm: { props: ['text'], template: '<span>{{ text }}</span>' },
	} } });
	await waitFor(() => expect(view.getAllByRole('link')).toHaveLength(1));
	await fireEvent.contextMenu(view.getByRole('link'));
	const menu = mocks.contextMenu.mock.calls.at(-1)![0];
	const action = (label: string) => menu.find((item: { text?: string }) => item.text === label) as MenuButton;
	await action(group ? '复制群号' : '复制账号').action({} as PointerEvent);
	expect(mocks.copy).toHaveBeenCalledWith(group ? room.id : 'peer');
	await action('打开独立聊天窗口').action({} as PointerEvent);
	expect(mocks.pageWindow).toHaveBeenCalledWith(group ? `/chat/room/${room.id}` : '/chat/user/peer');
	// 菜单打开后状态变化，点击仍须执行菜单上写出的“标记未读”。
	setting.markedUnread = true;
	await loadChatConversationSettings();
	await action('标记未读').action({} as PointerEvent);
	await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('chat/conversations/update', { ...target, unread: true }));
	if (group) {
		setting.notificationMode = 'blocked';
		await loadChatConversationSettings();
		await fireEvent.contextMenu(view.getByRole('link'));
		expect(mocks.contextMenu.mock.calls.at(-1)![0].some((item: { text?: string }) => item.text === '标记已读')).toBe(true);
		setting.notificationMode = 'all';
		await loadChatConversationSettings();
		const parent = menu.find((item: { type?: string }) => item.type === 'parent') as MenuParent;
		const options = parent.children as MenuButton[];
		await options.find(item => item.text === '收进群助手且不提醒')!.action({} as PointerEvent);
		await waitFor(() => expect(view.queryByRole('link')).toBeNull());
		await fireEvent.click(view.getByRole('button', { name: /群助手/ }));
		await waitFor(() => expect(view.getByRole('link')).toBeTruthy());
	} else {
		expect(menu.some((item: { type?: string }) => item.type === 'parent')).toBe(false);
		await action('设置免打扰').action({} as PointerEvent);
		await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('chat/conversations/update', { ...target, notificationMode: 'silent' }));
	}
	mocks.api.mockRejectedValueOnce(new Error('offline'));
	await action('从消息列表移除').action({} as PointerEvent);
	await waitFor(() => expect(view.getByRole('link')).toBeTruthy());
	await action('从消息列表移除').action({} as PointerEvent);
	await waitFor(() => expect(view.queryByRole('link')).toBeNull());
	expect(mocks.api).toHaveBeenLastCalledWith('chat/conversations/update', { ...target, hidden: true });
});

test('批量消息设置失败后保留未完成项，重试不重复写入已成功项', async () => {
	mocks.invite.mockResolvedValue([]);
	await loadChatConversationSettings();
	const settings = (roomId: string) => ({ roomId, userId: null, notificationMode: 'silent', mutedUntil: null, hidden: false, hiddenThroughId: null, markedUnread: false });
	mocks.api.mockResolvedValueOnce(settings('a')).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(settings('b'));
	const view = render(MessageSettingsDialog, { props: { rooms: [{ ...room, id: 'a', name: 'Alpha' }, { ...room, id: 'b', name: 'Beta' }] as never }, global: { stubs: {
		MkAvatar: true, Mfm: { props: ['text'], template: '<span>{{ text }}</span>' },
	} } });
	await fireEvent.click(view.getByRole('checkbox', { name: '全选' }));
	await fireEvent.click(view.getByRole('button', { name: '应用 (2)' }));
	await waitFor(() => expect(view.getByRole('button', { name: '应用 (1)' })).toHaveProperty('disabled', false));
	await fireEvent.click(view.getByRole('button', { name: '应用 (1)' }));
	await waitFor(() => expect(view.queryByRole('button', { name: /应用/ })).toBeNull());
	expect(mocks.api.mock.calls).toEqual([
		['chat/conversations/update', { roomId: 'a', notificationMode: 'silent' }],
		['chat/conversations/update', { roomId: 'b', notificationMode: 'silent' }],
		['chat/conversations/update', { roomId: 'b', notificationMode: 'silent' }],
	]);
});

test('并发刷新会话设置时先返回的新请求不会被旧响应覆盖', async () => {
	let resolveOld!: (items: unknown[]) => void;
	let resolveNew!: (items: unknown[]) => void;
	mocks.invite.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
		.mockImplementationOnce(() => new Promise(resolve => { resolveNew = resolve; }));
	const oldRequest = loadChatConversationSettings();
	const newRequest = loadChatConversationSettings();
	const setting = { userId: null, roomId: 'race', notificationMode: 'silent', mutedUntil: null, hidden: false, hiddenThroughId: null, markedUnread: false };
	resolveNew([setting]);
	await newRequest;
	resolveOld([{ ...setting, notificationMode: 'all' }]);
	await oldRequest;
	expect(getChatNotificationMode('room:race')).toBe('silent');
});

test.each(['取消', '卸载'])('用户资料获取失败可重试，%s 后返回的结果不提交', async dismissal => {
	const alpha = { id: 'alpha', username: 'alpha', name: 'Alpha', host: null };
	let resolveUser!: (user: typeof alpha) => void;
	const pending = new Promise(resolve => { resolveUser = resolve; });
	mocks.invite.mockResolvedValue([alpha]);
	mocks.api.mockRejectedValueOnce(new Error('request failed')).mockReturnValueOnce(pending);
	const view = render(MkUserSelectDialog, { props: { localOnly: true }, global: { stubs: {
		MkAvatar: true, MkAcct: true, MkUserName: { props: ['user'], template: '<span>{{ user.name }}</span>' },
	} } });
	await waitFor(() => expect(view.getByRole('button', { name: 'Alpha' })).toBeTruthy());
	await fireEvent.click(view.getByRole('button', { name: 'Alpha' }));
	await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(1));
	await waitFor(() => expect(view.getByRole('button', { name: 'Alpha' })).toHaveProperty('disabled', false));
	expect(view.getByRole('button', { name: 'Alpha' }).getAttribute('aria-pressed')).toBe('true');
	expect(view.emitted('ok')).toBeUndefined();
	expect(mocks.setStore).not.toHaveBeenCalled();
	await fireEvent.click(view.getByRole('button', { name: 'Alpha' }));
	expect(mocks.api).toHaveBeenCalledTimes(2);
	if (dismissal === '取消') await fireEvent.click(view.getByRole('button', { name: '取消' }));
	else view.unmount();
	resolveUser(alpha);
	await pending;
	await waitFor(() => expect(view.emitted('ok')).toBeUndefined());
	expect(mocks.setStore).not.toHaveBeenCalled();
});

test('成员标题原地进入搜索，点击外部后清筛选并恢复成员列表', async () => {
	const view = render(RoomSidebar, { props: { room: { ...room, owner: { id: 'owner', username: 'Owner', name: 'Owner' } } as never, memberships: [
		{ userId: 'beta', role: 'member', nickname: '昵称', user: { id: 'beta', username: 'beta', name: 'Beta' } },
	] as never }, global: { stubs: {
		MkA: { template: '<a><slot/></a>' }, MkAvatar: true, XMemberActivity: true,
		MkUserName: { props: ['user'], template: '<span>{{ user.name }}</span>' }, Mfm: { props: ['text'], template: '<span>{{ text }}</span>' },
	} } });
	expect(view.getAllByRole('group')).toHaveLength(2);
	await fireEvent.click(view.getByRole('button', { name: '搜索成员' }));
	expect(view.queryByRole('button', { name: '搜索成员' })).toBeNull();
	await fireEvent.update(view.getByRole('textbox'), 'beta');
	expect(view.getAllByRole('group')).toHaveLength(1);
	expect(view.getByRole('group').textContent).toBe('昵称');
	await fireEvent.click(document.body);
	expect(view.queryByRole('textbox')).toBeNull();
	expect(view.getByRole('button', { name: '搜索成员' })).toBeTruthy();
	expect(view.getAllByRole('group')).toHaveLength(2);
	expect(view.emitted('members')).toBeUndefined();
});
