/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Misskey from 'misskey-js';
import { computed, reactive, ref } from 'vue';
import type { MenuItem, MenuParent } from '@/types/menu.js';
import { ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { userPage } from '@@/js/user.js';
import { misskeyApiWithErrorToast } from '@/utility/misskey-api-with-toast.js';
import { getAbuseReportMenu } from '@/utility/abuse-report.js';
import { dateString } from '@/filters/date.js';
import { deviceKind } from '@/utility/device-kind.js';

export type ChatMember = {
	user: Misskey.entities.UserLite;
	role: 'owner' | 'administrator' | 'member';
	nickname: string;
	isSilenced: boolean;
	silenceUntil: string | null;
};

type SilenceSelection = { seconds: number; silenceUntil: string };
type SilenceState = { isSilenced: boolean; silenceUntil: string | null };
const silenceSelections = reactive(new Map<string, SilenceSelection>());
const updatingTargets = new Set<string>();

function createSilenceMenu(options: {
	key: string;
	text: string;
	unsilenceText: string;
	getState: () => SilenceState | null | undefined;
	getNow?: () => number;
	save: (params: SilenceState) => Promise<SilenceState | null>;
}): MenuParent {
	const selectedSilence = computed(() => silenceSelections.get(options.key) ?? null);
	const rememberSelection = (selection: SilenceSelection | null) => {
		if (selection) silenceSelections.set(options.key, selection);
		else silenceSelections.delete(options.key);
		try {
			if (selection) window.sessionStorage.setItem(options.key, JSON.stringify(selection));
			else window.sessionStorage.removeItem(options.key);
		} catch { /* 存储不可用时仍保留本次会话的确认状态。 */ }
	};
	if (selectedSilence.value == null) {
		try {
			const stored = JSON.parse(window.sessionStorage.getItem(options.key) ?? 'null') as Partial<SilenceSelection> | null;
			if (stored && typeof stored.seconds === 'number' && [600, 3600, 86400, 604800].includes(stored.seconds) && typeof stored.silenceUntil === 'string') {
				silenceSelections.set(options.key, { seconds: stored.seconds, silenceUntil: stored.silenceUntil });
			}
		} catch { /* 缓存损坏不影响禁言操作。 */ }
	}
	const current = computed(options.getState);
	const silenced = computed(() => {
		const now = Math.max(options.getNow?.() ?? Date.now(), Date.now());
		return current.value?.isSilenced === true && (current.value.silenceUntil == null || Date.parse(current.value.silenceUntil) > now);
	});
	// 原时长只用于菜单选中，截止时间必须与服务端确认值一致。
	if (selectedSilence.value && (!silenced.value || selectedSilence.value.silenceUntil !== current.value?.silenceUntil)) rememberSelection(null);
	const selectedSeconds = computed(() => {
		if (!silenced.value) return null;
		if (current.value?.silenceUntil == null) return 0;
		const selected = selectedSilence.value;
		return selected && selected.silenceUntil === current.value.silenceUntil ? selected.seconds : null;
	});
	const caption = computed(() => {
		const until = current.value?.silenceUntil;
		return silenced.value && until ? `${i18n.ts._chat.silenceUntil}: ${dateString(until)}` : undefined;
	});
	const unknownSilence = computed(() => silenced.value && current.value?.silenceUntil != null && selectedSeconds.value == null);
	const save = async (seconds: number | null) => {
		const params = { isSilenced: seconds != null, silenceUntil: seconds ? new Date(Date.now() + seconds * 1000).toISOString() : null };
		const updated = await options.save(params);
		if (!updated) return;
		rememberSelection(seconds != null && seconds > 0 && updated.isSilenced && updated.silenceUntil != null && updated.silenceUntil === params.silenceUntil
			? { seconds, silenceUntil: updated.silenceUntil }
			: null);
	};
	const children: MenuItem[] = [{
		type: 'radioOption',
		text: options.unsilenceText,
		active: computed(() => !silenced.value),
		action: () => save(null),
	}];
	children.push({
		type: 'radioOption',
		text: i18n.ts._chat.silenceUntil,
		caption,
		active: unknownSilence,
		hidden: computed(() => !unknownSilence.value),
		action: () => {},
	});
	children.push(...[{ text: i18n.ts.tenMinutes, seconds: 600 }, { text: i18n.ts.oneHour, seconds: 3600 }, { text: i18n.ts.oneDay, seconds: 86400 }, { text: i18n.ts.oneWeek, seconds: 604800 }, { text: i18n.ts.indefinitely, seconds: 0 }].map(({ text, seconds }) => ({
		type: 'radioOption' as const,
		text,
		active: computed(() => silenced.value && selectedSeconds.value === seconds),
		action: () => save(seconds),
	})));
	return { type: 'parent', text: options.text, icon: 'ti ti-message-off', caption, children };
}

export function getChatRoomSilenceMenu(room: Misskey.entities.ChatRoom, actions: {
	getRoom?: () => Misskey.entities.ChatRoom | null | undefined;
	getNow?: () => number;
	updated: (room: Misskey.entities.ChatRoom) => void;
}): MenuParent | null {
	const me = ensureSignin();
	if (room.ownerId !== me.id && room.myRole !== 'administrator') return null;
	const key = `misskey:chatSilenceSelection:${me.id}:${room.id}:room`;
	const confirmedRoom = ref(room);
	const current = computed(() => actions.getRoom ? actions.getRoom() : confirmedRoom.value);
	return createSilenceMenu({
		key,
		text: i18n.ts._chat.silenceRoom,
		unsilenceText: i18n.ts._chat.unsilenceRoom,
		getState: () => current.value,
		getNow: actions.getNow,
		save: async params => {
			const target = current.value;
			if (updatingTargets.has(key) || target?.id !== room.id || (target.ownerId !== me.id && target.myRole !== 'administrator')) return null;
			updatingTargets.add(key);
			try {
				const updated = await misskeyApiWithErrorToast('chat/rooms/update', { roomId: room.id, ...params });
				confirmedRoom.value = updated;
				actions.updated(updated);
				return updated;
			} catch { /* 保留原确认状态，错误由 toast 显示。 */ return null; } finally {
				updatingTargets.delete(key);
			}
		},
	});
}

export function roomMembers(room: Misskey.entities.ChatRoom, memberships: Misskey.entities.ChatRoomMembership[]): ChatMember[] {
	const order = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
	return [
		{ user: room.owner, role: 'owner', nickname: room.ownerNickname ?? '', isSilenced: false, silenceUntil: null },
		...memberships.flatMap(item => item.user && item.userId !== room.ownerId ? [{ user: item.user, role: item.role, nickname: item.nickname ?? '', isSilenced: item.isSilenced ?? false, silenceUntil: item.silenceUntil ?? null }] : [])
			.toSorted((a, b) => Number(b.role === 'administrator') - Number(a.role === 'administrator') || order.compare(a.user.username, b.user.username)),
	];
}

export function getChatMemberMenu(room: Misskey.entities.ChatRoom, member: ChatMember, actions: {
	mention?: (user: Misskey.entities.UserLite) => void;
	poke?: (userId: string) => void;
	updated: (membership?: Misskey.entities.ChatRoomMembership) => void;
	getMember?: () => ChatMember | undefined;
	getNow?: () => number;
	isHidden: boolean;
	toggleHidden: () => void;
	canCompose: boolean;
}): MenuItem[] {
	const me = ensureSignin();
	const self = member.user.id === me.id;
	const owner = room.ownerId === me.id;
	const manages = !self && member.role !== 'owner' && (owner || (room.myRole === 'administrator' && member.role === 'member'));
	const selectionKey = `misskey:chatSilenceSelection:${me.id}:${room.id}:${member.user.id}`;
	const confirmedMember = ref<ChatMember>({ ...member });
	const currentMember = computed(() => actions.getMember ? actions.getMember() : confirmedMember.value);
	const update = async (params: Omit<Misskey.entities.ChatRoomsMembersUpdateRequest, 'roomId' | 'userId'>) => {
		if (updatingTargets.has(selectionKey) || (actions.getMember && currentMember.value == null)) return null;
		updatingTargets.add(selectionKey);
		try {
			const updated = await misskeyApiWithErrorToast('chat/rooms/members/update', { roomId: room.id, userId: member.user.id, ...params });
			confirmedMember.value = { ...confirmedMember.value, ...updated, user: updated.user ?? confirmedMember.value.user };
			actions.updated(updated);
			return updated;
		} catch { /* 保留原确认状态，错误由 toast 显示。 */ return null; } finally {
			updatingTargets.delete(selectionKey);
		}
	};
	const items: MenuItem[] = [{ type: 'link', text: i18n.ts.sendMessage, icon: 'ti ti-message-circle', to: `/chat/user/${member.user.id}` }];
	const mention = actions.mention;
	const poke = actions.poke;
	if (!self && actions.canCompose && mention) items.push({ text: i18n.ts._chat.mentionMember, icon: 'ti ti-at', action: () => mention(member.user) });
	if (actions.canCompose && poke) items.push({ text: i18n.ts._chat.poke, icon: 'ti ti-hand-finger', action: () => poke(member.user.id) });
	items.push(deviceKind === 'smartphone' || window.innerWidth <= 500
		? { type: 'link', text: i18n.ts._chat.viewProfile, icon: 'ti ti-id', to: userPage(member.user) }
		: { text: i18n.ts._chat.viewProfile, icon: 'ti ti-id', action: () => os.pageWindow(userPage(member.user)) });
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
	items.push(getAbuseReportMenu({ type: 'user', user: member.user }));
	items.push({ text: actions.isHidden ? i18n.ts._chat.showMemberMessages : i18n.ts._chat.hideMemberMessages, icon: actions.isHidden ? 'ti ti-eye' : 'ti ti-eye-off', action: actions.toggleHidden });
	if (manages) {
		items.push(createSilenceMenu({
			key: selectionKey,
			text: i18n.ts._chat.silenceMember,
			unsilenceText: i18n.ts._chat.unsilenceMember,
			getState: () => currentMember.value,
			getNow: actions.getNow,
			save: update,
		}));
	}
	return items;
}
