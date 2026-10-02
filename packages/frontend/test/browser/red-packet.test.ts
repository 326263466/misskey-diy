/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick, ref } from 'vue';
import type { App } from 'vue';
import type { MenuItem } from '@/types/menu.js';
import MkRedPacketEditor from '@/components/MkRedPacketEditor.vue';
import MkRedPacketDialog from '@/components/MkRedPacketDialog.vue';
import '@/style.scss';
import '@tabler/icons-webfont/dist/tabler-icons.scss';

vi.mock('@@/js/config.js', () => ({ host: 'localhost' }));
const mocks = vi.hoisted(() => ({ api: vi.fn(), confirm: vi.fn(), upload: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/i.js', () => ({ ensureSignin: () => ({ id: 'self' }) }));
vi.mock('@/os.js', () => ({
	claimZIndex: () => 1000,
	confirm: mocks.confirm,
	launchUploader: mocks.upload,
	async popupMenu(items: MenuItem[], anchorElement: HTMLElement, options: { onClosing: () => void; width: number; matchAnchorWidth: boolean }) {
		const { default: MkPopupMenu } = await import('@/components/MkPopupMenu.vue');
		const host = document.createElement('div');
		const styles = getComputedStyle(anchorElement);
		for (const key of [...Object.keys(theme), 'accent', 'buttonBg', 'fgOnAccent', 'modalBg']) host.style.setProperty(`--MI_THEME-${key}`, styles.getPropertyValue(`--MI_THEME-${key}`));
		host.style.setProperty('--MI_THEME-popup', styles.getPropertyValue('--MI_THEME-panel'));
		document.body.append(host);
		const app = createApp({ render: () => h(MkPopupMenu, { items, anchorElement, ...options, onClosed: () => { app.unmount(); host.remove(); } }) });
		for (const name of ['MkEllipsis', 'MkAvatar', 'MkA']) app.component(name, { render: () => null });
		app.directive('hotkey', () => {});
		app.directive('tooltip', () => {});
	app.mount(host);
	},
}));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false, menuStyle: 'popup' } } }));
vi.mock('@/utility/focus-trap.js', () => ({ focusTrap: () => ({ release: () => {} }) }));
vi.mock('@/components/global/MkA.vue', () => ({ default: { render: () => null } }));
vi.mock('@/i18n.js', () => ({ i18n: {
	ts: {
		close: 'Close', cancel: 'Cancel', remove: 'Remove', loading: 'Loading', retry: 'Retry', _wallet: { title: 'Wallet' },
		_redPacket: { direct: 'One-to-one', singleRecipientOnly: 'Only the selected recipient can claim.', amountPerPerson: 'Amount per person', uploadCover: 'Upload cover image', resetCover: 'Use default cover', moreOptions: 'Recipients and expiry', coverImageOnly: 'Choose an image', title: 'Red packet', audience: 'Who can claim', publicAudience: 'Users on this server', selectedAudience: 'Selected users', fixedAudience: 'Selected users and group members', independentAudience: 'Eligibility stays the same if the note or message is deleted.', create: 'Create packet', cover: 'Cover', coverClassic: 'Classic', coverLucky: 'Lucky', coverSunset: 'Sunset', createDescription: 'Creating this packet reserves coins.', mode: 'Distribution', random: 'Group · random', equal: 'Group · fixed', expiresIn: 'Expires in', totalCoins: 'Total amount (virtual currency)', count: 'Recipients', message: 'Message', defaultMessage: 'Good luck!', localOnlyDescription: 'Send coins to local users.', refundDescription: 'Unclaimed coins are automatically refunded.', draftDescription: 'Drafts stay on this device.', equalNotDivisible: 'The amount must divide evenly.', invalidCoins: 'Invalid coin amount', invalidCount: 'Invalid recipient count', invalidDraft: 'Invalid draft', insufficientCoins: 'Insufficient coins' },
	},
	tsx: { _redPacket: { shortRefund: ({ hours }: { hours: number }) => `Unclaimed virtual currency returns after ${hours} hours.`, confirmSend: ({ coins }: { coins: number }) => `Reserve ${coins} coins?`, balance: ({ coins }: { coins: number }) => `Balance: ${coins} virtual currency`, hours: ({ hours }: { hours: number }) => `${hours} hours`, eachCoins: ({ coins }: { coins: number }) => `${coins} coins each` } },
} }));

const fixtures: { app: App; host: HTMLElement }[] = [];
const theme = { bg: '#f4f4f6', windowHeader: '#fff', warn: '#b66e18', panel: '#fff', fg: '#333', fgTransparentWeak: '#666', divider: '#ddd', inputBorder: '#ccc', love: '#e34873', error: '#d22', focus: '#86b300' };
afterEach(() => { for (const { app, host } of fixtures.splice(0)) { app.unmount(); host.remove(); } localStorage.clear(); vi.clearAllMocks(); });

test('the packet form fits a narrow composer and supports labelled numeric inputs', async () => {
	const host = document.createElement('div');
	host.style.cssText = 'width:320px;box-sizing:border-box;background:var(--MI_THEME-panel);color:var(--MI_THEME-fg);';
	for (const [key, value] of Object.entries(theme)) host.style.setProperty(`--MI_THEME-${key}`, value);
	document.body.append(host);
	const draft = ref({ kind: 'group' as const, audience: 'public' as const, recipientIds: [], coverId: 'classic' as const, mode: 'equal' as const, totalCoins: 10, count: 5, message: '', expiresInHours: 24, requestId: '019a029d-4800-7000-8000-000000000001' });
	const app = createApp({ render: () => h(MkRedPacketEditor, { modelValue: draft.value, balance: 100 }) });
	app.component('MkA', { render: () => h('a', { href: '/settings/wallet' }, 'Wallet') });
	app.directive('tooltip', () => {});
	app.mount(host);
	fixtures.push({ app, host });
	await nextTick();
	await document.fonts.ready;
	await page.getByRole('spinbutton', { name: 'Amount per person' }).fill('0');
	await expect.element(page.getByRole('alert')).toHaveTextContent('Invalid coin amount');
	await page.getByRole('spinbutton', { name: 'Amount per person' }).fill('4');
	await expect.element(page.getByText('Total amount (virtual currency): 20')).toBeVisible();
	expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth);
	for (const input of host.querySelectorAll('input, select')) expect(input.getBoundingClientRect().right).toBeLessThanOrEqual(host.getBoundingClientRect().right);
	await page.screenshot({ element: host, path: '../e2e/artifacts/component-browser/red-packet-editor-narrow.png' });
});

test('editing a cover and amount keeps the real dialog open and creates exactly once', async () => {
	const host = document.createElement('div');
	host.style.cssText = '--MI_THEME-accent:#86b300;--MI_THEME-buttonBg:#eee;--MI_THEME-fgOnAccent:white;--MI_THEME-modalBg:#0008;';
	for (const [key, value] of Object.entries(theme)) host.style.setProperty(`--MI_THEME-${key}`, value);
	document.body.append(host);
	mocks.confirm.mockResolvedValue({ canceled: false });
	mocks.api.mockImplementation(async (endpoint: string, data: unknown) => endpoint === 'i/wallet' ? { balance: 100 } : { ...(data as object), id: 'packet', noteId: null, chatMessageId: null, status: 'active' });
	const created = vi.fn();
	const closed = vi.fn();
	const app = createApp({ render: () => h(MkRedPacketDialog, { onCreated: created, onClosed: closed }) });
	app.component('MkA', { render: () => h('a', { href: '/settings/wallet' }, 'Wallet') });
	app.directive('hotkey', () => {});
	app.directive('tooltip', () => {});
	app.mount(host);
	fixtures.push({ app, host });
	await nextTick();
	const preview = host.querySelector('[data-red-packet-cover]')!;
	expect(getComputedStyle(preview).backgroundImage).toContain('rgb(201, 54, 50)');
	expect(getComputedStyle(preview).color).toBe('rgb(255, 226, 173)');
	host.style.setProperty('--MI_THEME-panel', '#222');
	host.style.setProperty('--MI_THEME-fg', '#eee');
	expect(getComputedStyle(preview).backgroundImage).toContain('rgb(201, 54, 50)');
	await page.screenshot({ element: preview, path: '../e2e/artifacts/component-browser/red-packet-classic.png' });
	host.style.setProperty('--MI_THEME-panel', theme.panel);
	host.style.setProperty('--MI_THEME-fg', theme.fg);
	expect(host.querySelector('select')).toBeNull();
	await expect.element(page.getByRole('button', { name: 'Remove', exact: true })).not.toBeInTheDocument();
	await expect.element(page.getByRole('button', { name: 'Cancel', exact: true })).not.toBeInTheDocument();
	await expect.element(page.getByRole('button', { name: 'Who can claim' })).not.toBeInTheDocument();
	const uploadButton = host.querySelector<HTMLButtonElement>('button[aria-label="Upload cover image"]')!;
	const coverBounds = preview.getBoundingClientRect();
	const uploadBounds = uploadButton.getBoundingClientRect();
	expect(uploadBounds.top).toBeGreaterThanOrEqual(coverBounds.top);
	expect(uploadBounds.right).toBeLessThanOrEqual(coverBounds.right);
	expect(uploadBounds.left).toBeGreaterThan(coverBounds.left + coverBounds.width / 2);
	await page.getByRole('button', { name: 'Group · fixed', exact: true }).click();
	await expect.element(page.getByRole('spinbutton', { name: 'Amount per person' })).toBeVisible();
	await page.getByRole('button', { name: 'Group · random', exact: true }).click();
	await expect.element(page.getByRole('spinbutton', { name: 'Total amount (virtual currency)' })).toBeVisible();
	const modalBeforeUpload = host.querySelector('[data-testid="modal-window-close"]')!.parentElement!.parentElement!;
	await page.screenshot({ element: modalBeforeUpload, path: '../e2e/artifacts/component-browser/red-packet-compact.png' });
	const imageUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0IoAAAAASUVORK5CYII=';
	mocks.upload.mockResolvedValue([{ id: 'image-cover', url: imageUrl, type: 'image/png', isSensitive: false }]);
	const fileInput = host.querySelector('input[type="file"]')!;
	Object.defineProperty(fileInput, 'files', { value: [new File(['png'], 'cover.png', { type: 'image/png' })] });
	fileInput.dispatchEvent(new Event('change', { bubbles: true }));
	await expect.poll(() => host.querySelector('[data-red-packet-cover] img')?.getAttribute('src')).toBe(imageUrl);
	await page.getByRole('spinbutton', { name: 'Total amount (virtual currency)' }).fill('25');
	await page.getByRole('spinbutton', { name: 'Recipients' }).fill('5');
	await expect.element(page.getByRole('button', { name: 'Create packet', exact: true })).toBeVisible();
	expect(closed).not.toHaveBeenCalled();
	expect(host.querySelector('[data-red-packet-cover] img')).not.toBeNull();
	const modal = host.querySelector('[data-testid="modal-window-close"]')!.parentElement!.parentElement!;
	await page.screenshot({ element: modal, path: '../e2e/artifacts/component-browser/red-packet-dialog-sunset.png' });
	await page.getByRole('button', { name: 'Create packet', exact: true }).click();
	await expect.poll(() => created.mock.calls.length).toBe(1);
	expect(mocks.api.mock.calls.filter(([endpoint]) => endpoint === 'red-packets/create')).toHaveLength(1);
	expect(created.mock.calls[0][0]).toEqual(expect.objectContaining({ totalCoins: 25, count: 5, coverFileId: 'image-cover' }));
});
