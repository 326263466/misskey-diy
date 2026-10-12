/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Misskey from 'misskey-js';
import type { MenuItem } from '@/types/menu.js';
import { ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { userPage } from '@@/js/user.js';
import { misskeyApiWithErrorToast } from '@/utility/misskey-api-with-toast.js';

export type ChatMember = {
	user: Misskey.entities.UserLite;
	role: 'owner' | 'administrator' | 'member';
	nickname: string;
	isSilenced: boolean;
	silenceUntil: string | null;
};

export function roomMembers(room: Misskey.entities.ChatRoom, memberships: Misskey.entities.ChatRoomMembership[]): ChatMember[] {
	const order = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
	return [
		{ user: room.owner, role: 'owner', nickname: room.ownerNickname ?? '', isSilenced: false, silenceUntil: null },
		...memberships.flatMap(item => item.user && item.userId !== room.ownerId ? [{ user: item.user, role: item.role, nickname: item.nickname ?? '', isSilenced: item.isSilenced ?? false, silenceUntil: item.silenceUntil ?? null }] : [])
			.toSorted((a, b) => Number(b.role === 'administrator') - Number(a.role === 'administrator') || order.compare(a.user.username, b.user.username)),
	];
}

export function getChatMemberMenu(room: Misskey.entities.ChatRoom, member: ChatMember, actions: {
	mention: (user: Misskey.entities.UserLite) => void;
	poke: (userId: string) => void;
	updated: () => void;
	isHidden: boolean;
	toggleHidden: () => void;
	canCompose: boolean;
}): MenuItem[] {
	const me = ensureSignin();
	const self = member.user.id === me.id;
	const owner = room.ownerId === me.id;
	const manages = !self && member.role !== 'owner' && (owner || (room.myRole === 'administrator' && member.role === 'member'));
	const update = async (params: Omit<Misskey.entities.ChatRoomsMembersUpdateRequest, 'roomId' | 'userId'>) => {
		try {
			await misskeyApiWithErrorToast('chat/rooms/members/update', { roomId: room.id, userId: member.user.id, ...params });
			actions.updated();
		} catch { /* 保留成员状态，错误由 toast 显示。 */ }
	};
	const items: MenuItem[] = [{ type: 'link', text: i18n.ts.sendMessage, icon: 'ti ti-message-circle', to: `/chat/user/${member.user.id}` }];
	if (!self && actions.canCompose) items.push({ text: i18n.ts._chat.mentionMember, icon: 'ti ti-at', action: () => actions.mention(member.user) });
	if (actions.canCompose) items.push({ text: i18n.ts._chat.poke, icon: 'ti ti-hand-finger', action: () => actions.poke(member.user.id) });
	items.push({ text: i18n.ts._chat.viewProfile, icon: 'ti ti-id', action: () => os.pageWindow(userPage(member.user)) });
	if (owner && !self && member.role !== 'owner') items.push({
		text: member.role === 'administrator' ? i18n.ts._chat.removeAdministrator : i18n.ts._chat.setAdministrator,
		icon: 'ti ti-user-cog',
		action: () => update({ role: member.role === 'administrator' ? 'member' : 'administrator' }),
	});
	if (self || manages) items.push({
		text: i18n.ts._chat.editGroupNickname, icon: 'ti ti-pencil', action: async () => {
			const { canceled, result } = await os.inputText({ title: i18n.ts._chat.editGroupNickname, default: member.nickname, maxLength: 32, placeholder: member.user.name || member.user.username });
			if (!canceled) await update({ nickname: result.trim() });
		},
	});
	if (self) return items;
	items.push({ type: 'divider' });
	if (manages) items.push({
		text: i18n.ts._chat.removeMember, icon: 'ti ti-user-minus', danger: true, action: async () => {
			const { canceled } = await os.confirm({ type: 'warning', text: i18n.tsx._chat.removeMemberConfirm({ name: member.nickname || member.user.name || member.user.username }) });
			if (canceled) return;
			try {
				await misskeyApiWithErrorToast('chat/rooms/members/delete', { roomId: room.id, userId: member.user.id });
				actions.updated();
			} catch { /* 错误由 toast 显示。 */ }
		},
	});
	items.push({ text: i18n.ts.reportAbuse, icon: 'ti ti-alert-triangle', action: async () => {
		const { dispose } = await os.popupAsyncWithDialog(import('@/components/MkAbuseReportWindow.vue').then(module => module.default), { user: member.user, reportTarget: { reportType: 'user' } }, { closed: () => dispose() });
	} });
	items.push({ text: actions.isHidden ? i18n.ts._chat.showMemberMessages : i18n.ts._chat.hideMemberMessages, icon: actions.isHidden ? 'ti ti-eye-off' : 'ti ti-eye', action: actions.toggleHidden });
	if (manages) {
		const silenced = member.isSilenced && (member.silenceUntil == null || Date.parse(member.silenceUntil) > Date.now());
		items.push({ type: 'parent', text: i18n.ts._chat.silenceMember, icon: 'ti ti-bell-off', children: [
			...(silenced ? [{ text: i18n.ts._chat.unsilenceMember, icon: 'ti ti-bell', action: () => update({ isSilenced: false, silenceUntil: null }) }] : []),
			...[{ text: i18n.ts.tenMinutes, seconds: 600 }, { text: i18n.ts.oneHour, seconds: 3600 }, { text: i18n.ts.oneDay, seconds: 86400 }, { text: i18n.ts.oneWeek, seconds: 604800 }, { text: i18n.ts.indefinitely, seconds: 0 }].map(({ text, seconds }) => ({ text, action: () => update({ isSilenced: true, silenceUntil: seconds ? new Date(Date.now() + seconds * 1000).toISOString() : null }) })),
		] });
	}
	return items;
}
