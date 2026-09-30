/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import type * as Misskey from 'misskey-js';
import QrShow from '@/pages/qr.show.vue';
import MkUserQrDialog from '@/components/MkUserQrDialog.vue';
import { getUserMenu } from '@/utility/get-user-menu.js';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({
	qr: vi.fn(), append: vi.fn(), update: vi.fn(),
	signin: vi.fn(), share: vi.fn(), canShare: vi.fn(),
	popup: vi.fn(), dispose: vi.fn(), close: vi.fn(),
}));

vi.mock('@@/js/config.js', () => ({ url: 'https://local.example', host: 'local.example' }));
vi.mock('@/i.js', () => ({ $i: null, iAmModerator: false, ensureSignin: mocks.signin }));
vi.mock('@/instance.js', () => ({ instance: { themeColor: '#86b300', iconUrl: null } }));
vi.mock('@/os.js', () => ({ popup: mocks.popup }));
vi.mock('@/utility/share-dialog.js', () => ({ openShareDialog: mocks.share }));
vi.mock('@/utility/media-proxy.js', () => ({ getStaticImageUrl: (url: string) => url }));
vi.mock('@/utility/copy-to-clipboard.js', () => ({ copyToClipboard: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: vi.fn() }));
vi.mock('@/utility/check-permissions.js', () => ({ notesSearchAvailable: false, canSearchNonLocalNotes: false }));
vi.mock('@/cache.js', () => ({ antennasCache: {}, rolesCache: {}, userListsCache: {} }));
vi.mock('@/router.js', () => ({ mainRouter: { push: vi.fn() } }));
vi.mock('@/utility/get-embed-code.js', () => ({ genEmbedCode: vi.fn() }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { devMode: false } } }));
vi.mock('@/plugin.js', () => ({ getPluginHandlers: () => [] }));
vi.mock('@/components/MkModalWindow.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({
		emits: ['click', 'close', 'closed', 'esc'],
		setup(_props, { slots, expose, emit }) {
			expose({ close: () => { mocks.close(); emit('closed'); } });
			return () => h('div', [
				slots.header?.(), slots.default?.(),
				...(['click', 'close', 'esc'] as const).map(event => h('button', { onClick: () => emit(event) }, event)),
			]);
		},
	}) };
});
vi.mock('qr-code-styling', () => ({ default: class {
	constructor(options: unknown) { mocks.qr(options); }
	append(element: HTMLElement): void { mocks.append(element); }
	update(options: unknown): void { mocks.update(options); }
} }));

const localUser = { id: 'alice', username: 'alice', name: 'Alice', host: null } as Misskey.entities.UserDetailed;
const remoteUser = { id: 'bob', username: 'bob', name: 'Bob', host: 'social.example' } as Misskey.entities.UserDetailed;

function renderQr(user?: Misskey.entities.UserDetailed) {
	return render(QrShow, {
		props: { user },
		global: { stubs: {
			MkAvatar: true,
			MkCondensedLine: { template: '<span><slot/></span>' },
			MkUserName: { props: ['user'], template: '<span>{{ user.name }}</span>' },
		} },
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.signin.mockReturnValue(localUser);
	mocks.canShare.mockReturnValue(true);
	mocks.share.mockResolvedValue('shared');
	mocks.popup.mockReturnValue({ dispose: mocks.dispose });
});

afterEach(() => cleanup());

describe('user QR display', () => {
	test.each([
		{ user: localUser, acct: '@alice@local.example', url: 'https://local.example/@alice' },
		{ user: remoteUser, acct: '@bob@social.example', url: 'https://local.example/@bob@social.example' },
	])('encodes and shares the selected $acct profile without requiring sign-in', async ({ user, acct, url }) => {
		const view = renderQr(user);
		expect(view.getByText(acct)).toBeTruthy();
		expect(mocks.qr).toHaveBeenCalledWith(expect.objectContaining({ data: url }));
		expect(mocks.signin).not.toHaveBeenCalled();
		expect(mocks.append).toHaveBeenCalledOnce();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.share }));
		expect(mocks.share).toHaveBeenCalledWith(expect.objectContaining({ url, text: i18n.ts._qr.userShareText }));
	});

	test('keeps the existing current-account page working without a user prop', async () => {
		const view = renderQr();
		expect(view.getByText('@alice@local.example')).toBeTruthy();
		expect(mocks.signin).toHaveBeenCalledOnce();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.share }));
		expect(mocks.share).toHaveBeenCalledWith(expect.objectContaining({ text: i18n.ts._qr.shareText }));
	});

	test('updates the encoded profile when the displayed user changes', async () => {
		const view = renderQr(localUser);
		await view.rerender({ user: remoteUser });
		expect(view.getByText('@bob@social.example')).toBeTruthy();
		expect(mocks.update).toHaveBeenCalledWith({ data: 'https://local.example/@bob@social.example' });
	});

	test('opens the shared dialog without native sharing support', async () => {
		mocks.canShare.mockReturnValue(false);
		const view = renderQr(remoteUser);
		const button = view.getByRole('button', { name: i18n.ts.share }) as HTMLButtonElement;
		expect(button.disabled).toBe(false);
		expect(mocks.append).toHaveBeenCalledWith(button);
		await fireEvent.click(button);
		expect(mocks.share).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://local.example/@bob@social.example' }));
	});
});

describe('shared user menu QR entry', () => {
	test.each([localUser, remoteUser])('opens a dismissible QR dialog for $username while signed out', (user) => {
		const { menu, cleanup: cleanupMenu } = getUserMenu(user);
		const item = menu.find(entry => typeof entry === 'object' && entry != null && 'text' in entry && entry.text === i18n.ts._qr.showUser);
		expect(item).toBeDefined();
		if (typeof item !== 'object' || item == null || !('action' in item)) throw new Error('QR menu action missing');
		item.action(new PointerEvent('click'));
		expect(mocks.popup).toHaveBeenCalledWith(expect.any(Object), { user }, expect.any(Object));
		mocks.popup.mock.calls[0][2].closed();
		expect(mocks.dispose).toHaveBeenCalledOnce();
		cleanupMenu();
	});
});

describe('user QR dialog', () => {
	test.each(['click', 'close', 'esc'])('closes and emits disposal after modal %s', async (event) => {
		const view = render(MkUserQrDialog, {
			props: { user: remoteUser },
			global: { stubs: { MkQrShow: { props: ['user'], template: '<span>{{ user.username }}</span>' } } },
		});
		expect(view.getByText(i18n.ts._qr.showUser)).toBeTruthy();
		expect(view.getByText('bob')).toBeTruthy();
		await fireEvent.click(view.getByRole('button', { name: event, exact: true }));
		expect(mocks.close).toHaveBeenCalledOnce();
		expect(view.emitted().closed).toHaveLength(1);
	});
});
