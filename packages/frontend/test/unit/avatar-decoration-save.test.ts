/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { defineComponent } from 'vue';
import AvatarDecorationSettings from '@/pages/settings/avatar-decoration.vue';
import AvatarDecorationDialog from '@/pages/settings/avatar-decoration.dialog.vue';
import { enqueueProfileSave } from '@/utility/profile-save.js';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({
	api: vi.fn(), alert: vi.fn(), popup: vi.fn(), update: vi.fn(), load: vi.fn(), close: vi.fn(),
	account: { avatarDecorations: [{ id: 'first', url: '/first' }, { id: 'second', url: '/second' }], policies: { avatarDecorationLimit: 4 }, roles: [] as { id: string }[] },
}));
vi.mock('@/i.js', () => ({ $i: mocks.account, iAmAdmin: false, iAmModerator: false, ensureSignin: () => mocks.account }));
vi.mock('@/os.js', () => ({ apiWithDialog: mocks.api, alert: mocks.alert, popup: mocks.popup }));
vi.mock('@/accounts.js', () => ({ updateCurrentAccountPartial: mocks.update }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.load }));
vi.mock('@/store.js', () => ({ store: {} }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));

beforeEach(() => {
	vi.clearAllMocks();
	mocks.account.avatarDecorations = [{ id: 'first', url: '/first' }, { id: 'second', url: '/second' }];
	mocks.account.policies.avatarDecorationLimit = 4;
	mocks.account.roles = [];
	mocks.load.mockResolvedValue([]);
	mocks.popup.mockReturnValue({ dispose: vi.fn() });
	mocks.api.mockImplementation(async (_endpoint, params) => params);
});
afterEach(cleanup);

async function openAttached(available = false) {
	const slot = { template: '<div><slot/></div>' };
	if (available) mocks.load.mockResolvedValue([{ id: 'new', url: '/new', name: '新装饰', roleIdsThatCanBeUsedThisDecoration: [] }]);
	const view = render(AvatarDecorationSettings, { global: {
		directives: { panel: {} },
		stubs: {
			SearchMarker: slot, MkInfo: slot, MkAvatar: true, MkButton: true, MkLoading: true,
			MkFoldableSection: available ? slot : true,
			XDecoration: { template: '<button @click="$emit(\'click\')">edit decoration</button>' },
		},
	} });
	await waitFor(() => expect(view.getAllByRole('button', { name: 'edit decoration' })).toHaveLength(available ? 3 : 2));
	await fireEvent.click(view.getAllByRole('button', { name: 'edit decoration' })[available ? 2 : 0]);
	return mocks.popup.mock.calls[0][2];
}

test.each(['update', 'detach'])('does not %s an index shifted by an earlier queued save', async event => {
	const handlers = await openAttached();
	let complete!: () => void;
	const previous = enqueueProfileSave(async () => {
		await new Promise<void>(resolve => { complete = resolve; });
		mocks.account.avatarDecorations.shift();
	});
	const edit = event === 'detach' ? handlers.detach() : handlers.update({ angle: 0, flipH: false, offsetX: 0, offsetY: 0 });
	await waitFor(() => expect(complete).toBeDefined());
	complete();
	await Promise.all([previous, edit]);
	expect(mocks.api).not.toHaveBeenCalled();
	expect(mocks.update).not.toHaveBeenCalled();
	expect(mocks.alert).toHaveBeenCalledOnce();
	expect(mocks.account.avatarDecorations[0].id).toBe('second');
});

test('saves an unchanged attached decoration list normally', async () => {
	const handlers = await openAttached();
	await handlers.detach();
	expect(mocks.api).toHaveBeenCalledWith('i/update', { avatarDecorations: [{ id: 'second', url: '/second' }] });
	expect(mocks.alert).not.toHaveBeenCalled();
});

test('佩戴新装饰直接替换旧列表，失败时保留旧佩戴并允许重试', async () => {
	const handlers = await openAttached(true);
	const payload = { angle: 0.1, flipH: true, offsetX: 0.05, offsetY: 0 };
	const complete = vi.fn();
	mocks.api.mockRejectedValueOnce(new Error('save failed'));
	await handlers.attach(payload, complete);
	expect(complete).toHaveBeenLastCalledWith(false);
	expect(mocks.update).not.toHaveBeenCalled();
	expect(mocks.account.avatarDecorations.map(decoration => decoration.id)).toEqual(['first', 'second']);
	await handlers.attach(payload, complete);
	expect(mocks.api).toHaveBeenLastCalledWith('i/update', {
		avatarDecorations: [{ id: 'new', url: '/new', ...payload }],
	});
	expect(complete).toHaveBeenLastCalledWith(true);
	expect(mocks.update).toHaveBeenCalledOnce();
});

function mountDialog(overrides: { roleIdsThatCanBeUsedThisDecoration?: string[] } = {}) {
	const onAttach = vi.fn();
	const view = render(AvatarDecorationDialog, {
		props: { usingIndex: null, decoration: { id: 'new', url: '/new', name: '新装饰', roleIdsThatCanBeUsedThisDecoration: [], ...overrides }, onAttach },
		global: { stubs: {
			MkModalWindow: defineComponent({
				props: { closeOnBackdrop: { type: Boolean, default: true } },
				setup: (_props, { expose }) => { expose({ close: mocks.close }); },
				template: '<div><button data-testid="modal-backdrop" @click="closeOnBackdrop && $emit(\'close\')"/><slot/></div>',
			}),
			MkAvatar: { props: ['decorations'], template: '<span data-testid="preview">{{ decorations.map(item => item.id).join(",") }}</span>' },
			MkRange: true, MkSwitch: true,
			MkButton: { props: ['disabled'], template: '<button :disabled="disabled"><slot/></button>' },
		} },
	});
	return { ...view, onAttach };
}

test('已达佩戴上限仍可替换，预览仅显示新装饰；保存期间防重，失败保留弹窗', async () => {
	mocks.account.policies.avatarDecorationLimit = 2;
	const view = mountDialog();
	expect(view.getByTestId('preview').textContent).toBe('new');
	const attach = view.getByRole('button', { name: i18n.ts.attach });
	expect((attach as HTMLButtonElement).disabled).toBe(false);
	await fireEvent.click(attach);
	await fireEvent.click(attach);
	await fireEvent.click(view.getByTestId('modal-backdrop'));
	expect(view.onAttach).toHaveBeenCalledOnce();
	expect((attach as HTMLButtonElement).disabled).toBe(true);
	expect(mocks.close).not.toHaveBeenCalled();
	view.onAttach.mock.calls[0][1](false);
	await waitFor(() => expect((attach as HTMLButtonElement).disabled).toBe(false));
	expect(mocks.close).not.toHaveBeenCalled();
	await fireEvent.click(view.getByTestId('modal-backdrop'));
	expect(mocks.close).toHaveBeenCalledOnce();
	mocks.close.mockClear();
	await fireEvent.click(attach);
	view.onAttach.mock.calls[1][1](true);
	await waitFor(() => expect(mocks.close).toHaveBeenCalledOnce());
});

test.each(['无佩戴权限', '角色受限'])('%s时仍不可佩戴新装饰', async restriction => {
	if (restriction === '无佩戴权限') mocks.account.policies.avatarDecorationLimit = 0;
	const view = mountDialog({ roleIdsThatCanBeUsedThisDecoration: restriction === '角色受限' ? ['restricted'] : [] });
	const attach = view.getByRole('button', { name: i18n.ts.attach });
	expect((attach as HTMLButtonElement).disabled).toBe(true);
	await fireEvent.click(attach);
	expect(view.onAttach).not.toHaveBeenCalled();
});
