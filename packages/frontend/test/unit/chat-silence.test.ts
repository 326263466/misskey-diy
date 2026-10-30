/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { defineComponent, h, nextTick, ref, unref } from 'vue';
import locales from 'i18n';
import type * as Misskey from 'misskey-js';
import type { MenuParent, MenuRadioOption } from '@/types/menu.js';
import type { ChatMember } from '@/pages/chat/member-menu.js';
import { getChatSilenceUntil } from '@/pages/chat/composer.js';
import { getChatMemberMenu, getChatRoomSilenceMenu } from '@/pages/chat/member-menu.js';
import XEditor from '@/pages/chat/XEditor.vue';
import { i18n, updateI18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({ api: vi.fn(), me: { id: 'me' } }));
vi.mock('@/i.js', () => ({ ensureSignin: () => mocks.me }));
vi.mock('@/utility/misskey-api-with-toast.js', () => ({ misskeyApiWithErrorToast: mocks.api }));
vi.mock('@/os.js', () => ({}));
vi.mock('@/utility/autocomplete.js', () => ({ Autocomplete: class { detach = vi.fn(); } }));
vi.mock('@/components/MkEmojiInputOverlay.vue', () => ({ default: { template: '<span/>' } }));

const start = Date.parse('2026-10-24T04:00:00.000Z');
const deadline = (seconds: number) => new Date(start + seconds * 1000).toISOString();
let roomSequence = 0;

function room(patch: Partial<Misskey.entities.ChatRoom> = {}): Misskey.entities.ChatRoom {
	return {
		id: `silence-room-${++roomSequence}`, createdAt: new Date(start).toISOString(),
		ownerId: mocks.me.id, owner: { id: mocks.me.id, username: 'owner', name: 'Owner', host: null } as Misskey.entities.UserLite,
		name: 'Room', description: '', memberCount: 3, joinPolicy: 'public', joinQuestion: '', isMember: true,
		myRole: 'owner', announcement: '', ownerNickname: '', myNickname: '',
		isSilenced: false, silenceUntil: null, myIsSilenced: false, mySilenceUntil: null,
		mutedUntil: null, joinRequestPending: false, ...patch,
	};
}

function options(menu: MenuParent): MenuRadioOption[] {
	if (!Array.isArray(menu.children)) throw new Error('Expected direct silence options.');
	return menu.children.filter((item): item is MenuRadioOption => item != null && 'type' in item && item.type === 'radioOption').filter(item => !unref(item.hidden));
}

function option(menu: MenuParent, text: string): MenuRadioOption {
	const item = options(menu).find(item => unref(item.text) === text);
	if (!item) throw new Error(`Missing silence option: ${text}`);
	return item;
}

function selected(menu: MenuParent) {
	return options(menu).filter(item => unref(item.active)).map(item => unref(item.text));
}

function silenceMenu(kind: 'room' | 'member') {
	const currentRoom = ref(room());
	const member = ref<ChatMember>({
		user: { id: 'member', username: 'member', host: null } as Misskey.entities.UserLite,
		role: 'member', nickname: '', isSilenced: false, silenceUntil: null,
	});
	const now = ref(start);
	const updated = vi.fn();
	const build = (): MenuParent => {
		if (kind === 'room') return getChatRoomSilenceMenu(currentRoom.value, {
			getRoom: () => currentRoom.value, getNow: () => now.value,
			updated: value => { currentRoom.value = value; updated(value); },
		})!;
		const menu = getChatMemberMenu(currentRoom.value, member.value, {
			getMember: () => member.value, getNow: () => now.value,
			updated: value => { if (value) member.value = { ...member.value, ...value, user: value.user ?? member.value.user }; updated(value); },
			mention: vi.fn(), poke: vi.fn(), isHidden: false, toggleHidden: vi.fn(), canCompose: true,
		}).find((item): item is MenuParent => item != null && 'type' in item && item.type === 'parent');
		if (!menu) throw new Error('Missing member silence menu.');
		return menu;
	};
	const response = (params: { isSilenced: boolean; silenceUntil: string | null }) => kind === 'room'
		? { ...currentRoom.value, ...params }
		: { ...member.value, ...params, id: 'membership', userId: member.value.user.id, roomId: currentRoom.value.id, createdAt: new Date(start).toISOString() };
	const state = () => kind === 'room' ? currentRoom.value : member.value;
	return { build, response, state, currentRoom, now, updated };
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(start);
	mocks.api.mockReset();
	window.sessionStorage.clear();
	updateI18n(locales['zh-CN']);
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	window.sessionStorage.clear();
	updateI18n(locales['en-US']);
});

describe('聊天禁言截止与权限', () => {
	test('无群或群主可发言，即使同时存在个人和全员永久禁言', () => {
		expect(getChatSilenceUntil(null, mocks.me.id)).toBeUndefined();
		expect(getChatSilenceUntil(undefined, mocks.me.id)).toBeUndefined();
		for (const until of [null, deadline(3600)]) {
			expect(getChatSilenceUntil(room({ isSilenced: true, silenceUntil: until, myIsSilenced: true, mySilenceUntil: until }), mocks.me.id)).toBeUndefined();
		}
	});

	test.each(['administrator', 'member'] as const)('全员禁言限制 %s，身份不提供群主豁免', myRole => {
		const currentRoom = room({ ownerId: 'owner', myRole, isSilenced: true, silenceUntil: deadline(3600) });
		expect(getChatSilenceUntil(currentRoom, mocks.me.id)).toBe(deadline(3600));
		currentRoom.silenceUntil = null;
		expect(getChatSilenceUntil(currentRoom, mocks.me.id)).toBeNull();
	});

	test('个人禁言只限制对应成员，未被禁言者及未启用的期限不受影响', () => {
		const currentRoom = room({ ownerId: 'owner', myRole: 'member', myIsSilenced: true, mySilenceUntil: deadline(600) });
		expect(getChatSilenceUntil(currentRoom, 'target')).toBe(deadline(600));
		expect(getChatSilenceUntil({ ...currentRoom, myIsSilenced: false, silenceUntil: deadline(3600) }, 'other')).toBeUndefined();
	});

	test('叠加禁言取较晚截止，任一有效永久禁言优先', () => {
		const currentRoom = room({ ownerId: 'owner', isSilenced: true, silenceUntil: deadline(600), myIsSilenced: true, mySilenceUntil: deadline(3600) });
		expect(getChatSilenceUntil(currentRoom, mocks.me.id)).toBe(deadline(3600));
		currentRoom.silenceUntil = deadline(86400);
		expect(getChatSilenceUntil(currentRoom, mocks.me.id)).toBe(deadline(86400));
		for (const patch of [{ silenceUntil: null }, { mySilenceUntil: null }]) {
			expect(getChatSilenceUntil({ ...currentRoom, ...patch }, mocks.me.id)).toBeNull();
		}
	});

	test.each(['room', 'member'] as const)('%s 禁言在截止时刻自动失效', kind => {
		const until = deadline(600);
		const currentRoom = room({ ownerId: 'owner', ...(kind === 'room' ? { isSilenced: true, silenceUntil: until } : { myIsSilenced: true, mySilenceUntil: until }) });
		expect(getChatSilenceUntil(currentRoom, mocks.me.id, Date.parse(until) - 1)).toBe(until);
		expect(getChatSilenceUntil(currentRoom, mocks.me.id, Date.parse(until))).toBeUndefined();
		expect(getChatSilenceUntil(currentRoom, mocks.me.id, Date.parse(until) + 1)).toBeUndefined();
	});
});

describe('真实禁言菜单的确认状态', () => {
	test.each(['room', 'member'] as const)('%s 保存成功才选中，失败保留，重开及到期不丢确认状态', async kind => {
		const fixture = silenceMenu(kind);
		const menu = fixture.build();
		const unsilence = kind === 'room' ? i18n.ts._chat.unsilenceRoom : i18n.ts._chat.unsilenceMember;
		const pending = Promise.withResolvers<ReturnType<typeof fixture.response>>();
		mocks.api.mockReturnValueOnce(pending.promise);
		const save = option(menu, i18n.ts.oneHour).action(new PointerEvent('click'));
		const params = { isSilenced: true, silenceUntil: deadline(3600) };
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith(kind === 'room' ? 'chat/rooms/update' : 'chat/rooms/members/update', {
			roomId: fixture.currentRoom.value.id, ...(kind === 'member' ? { userId: 'member' } : {}), ...params,
		});
		expect(selected(menu)).toEqual([unsilence]);
		expect(fixture.updated).not.toHaveBeenCalled();
		await option(menu, i18n.ts.tenMinutes).action(new PointerEvent('click'));
		expect(mocks.api).toHaveBeenCalledTimes(1);
		pending.resolve(fixture.response(params));
		await save;
		expect(selected(menu)).toEqual([i18n.ts.oneHour]);
		expect(fixture.updated).toHaveBeenCalledOnce();
		mocks.api.mockRejectedValueOnce(new Error('offline'));
		await option(menu, i18n.ts.oneDay).action(new PointerEvent('click'));
		expect(selected(menu)).toEqual([i18n.ts.oneHour]);
		expect(fixture.state().silenceUntil).toBe(deadline(3600));
		expect(fixture.updated).toHaveBeenCalledOnce();
		vi.setSystemTime(start + 55 * 60_000);
		fixture.now.value = Date.now();
		const reopened = fixture.build();
		expect(selected(reopened)).toEqual([i18n.ts.oneHour]);
		vi.setSystemTime(Date.parse(deadline(3600)));
		fixture.now.value = Date.now();
		expect(selected(reopened)).toEqual([unsilence]);
		expect(selected(fixture.build())).toEqual([unsilence]);
		expect(mocks.api).toHaveBeenCalledTimes(2);
	});

	test.each(['room', 'member'] as const)('%s 实时外部期限不猜测原时长，永久及解除操作使用服务端确认值', async kind => {
		const fixture = silenceMenu(kind);
		const menu = fixture.build();
		mocks.api.mockImplementation((_endpoint, params) => Promise.resolve(fixture.response(params)));
		await option(menu, i18n.ts.oneHour).action(new PointerEvent('click'));
		expect(selected(menu)).toEqual([i18n.ts.oneHour]);
		expect(options(menu).some(item => unref(item.text) === i18n.ts._chat.silenceUntil)).toBe(false);
		Object.assign(fixture.state(), { isSilenced: true, silenceUntil: deadline(300) });
		expect(selected(menu)).toEqual([i18n.ts._chat.silenceUntil]);
		expect(options(menu).some(item => unref(item.text) === i18n.ts._chat.silenceUntil)).toBe(true);
		await option(menu, i18n.ts.indefinitely).action(new PointerEvent('click'));
		expect(fixture.state()).toMatchObject({ isSilenced: true, silenceUntil: null });
		expect(selected(fixture.build())).toEqual([i18n.ts.indefinitely]);
		const unsilence = kind === 'room' ? i18n.ts._chat.unsilenceRoom : i18n.ts._chat.unsilenceMember;
		await option(menu, unsilence).action(new PointerEvent('click'));
		expect(fixture.state()).toMatchObject({ isSilenced: false, silenceUntil: null });
		expect(selected(fixture.build())).toEqual([unsilence]);
	});
});

function renderEditor(source: string) {
	const draft = ref(source);
	const disabled = ref(false);
	const placeholder = ref<string>();
	const editor = ref<InstanceType<typeof XEditor> | null>(null);
	const submit = vi.fn();
	const view = render(defineComponent({
		setup: () => () => h(XEditor, {
			ref: editor, modelValue: draft.value, disabled: disabled.value, placeholder: placeholder.value,
			'onUpdate:modelValue': (value: string) => { draft.value = value; }, onSubmit: submit,
		}),
	}));
	return { ...view, draft, disabled, placeholder, editor, submit };
}

describe('真实聊天编辑器的禁言状态', () => {
	test('禁言截止占位同时覆盖文字和代码，解除后保留已输入草稿', async () => {
		const view = renderEditor('Original draft\n```js\nconst saved = 1;\n```\nAfter code');
		const inputs = view.getAllByRole('textbox') as HTMLTextAreaElement[];
		await fireEvent.update(inputs[0], 'Typed draft');
		const typedDraft = 'Typed draft\n```js\nconst saved = 1;\n```\nAfter code';
		expect(view.draft.value).toBe(typedDraft);
		const placeholder = i18n.tsx._chat.silencedUntil({ time: '2026-10-24 13:00:00' });
		view.disabled.value = true;
		view.placeholder.value = placeholder;
		await nextTick();
		for (const input of inputs) {
			expect(input.disabled).toBe(true);
			expect(input.placeholder).toBe(placeholder);
		}
		expect(inputs.map(input => input.value)).toEqual(['Typed draft', 'const saved = 1;', 'After code']);
		view.disabled.value = false;
		view.placeholder.value = undefined;
		await nextTick();
		expect(inputs.every(input => !input.disabled)).toBe(true);
		expect(inputs.map(input => input.placeholder)).toEqual([i18n.ts.inputMessageHere, i18n.ts._chat.inputCode, i18n.ts.inputMessageHere]);
		expect(view.draft.value).toBe(typedDraft);
		expect(inputs.map(input => input.value)).toEqual(['Typed draft', 'const saved = 1;', 'After code']);
	});

	test('禁言拒绝插入和快捷发送，解除后恢复编辑', async () => {
		const source = 'Keep my text\n```js\nkeepCode();\n```';
		const view = renderEditor(source);
		view.disabled.value = true;
		await nextTick();
		const inputs = view.getAllByRole('textbox') as HTMLTextAreaElement[];
		for (const input of inputs) {
			await fireEvent.focus(input);
			view.editor.value!.insertText('blocked', { plainText: true, focus: false });
			await fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
		}
		await nextTick();
		expect(view.draft.value).toBe(source);
		expect(inputs.map(input => input.value)).toEqual(['Keep my text', 'keepCode();']);
		expect(view.submit).not.toHaveBeenCalled();
		view.disabled.value = false;
		await nextTick();
		await fireEvent.focus(inputs[0]);
		inputs[0].setSelectionRange(inputs[0].value.length, inputs[0].value.length);
		view.editor.value!.insertText(' + allowed', { focus: false });
		await nextTick();
		expect(view.draft.value).toBe('Keep my text + allowed\n```js\nkeepCode();\n```');
		await fireEvent.keyDown(inputs[0], { key: 'Enter', ctrlKey: true });
		expect(view.submit).toHaveBeenCalledOnce();
	});
});
