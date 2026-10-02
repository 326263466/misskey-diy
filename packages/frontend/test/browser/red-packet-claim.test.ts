/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import MkRedPacketClaimDialog from '@/components/MkRedPacketClaimDialog.vue';
import '@/style.scss';
import '@tabler/icons-webfont/dist/tabler-icons.css';

vi.hoisted(() => { vi.stubGlobal('_LANGS_', []); vi.stubGlobal('_VERSION_', 'test'); vi.stubGlobal('_DEV_', false); });
const api = vi.hoisted(() => vi.fn());
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: api }));
vi.mock('@/i.js', () => ({ $i: { id: 'member' } }));
vi.mock('@/os.js', () => ({ claimZIndex: () => 1000 }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false } } }));
vi.mock('@/utility/focus-trap.js', () => ({ focusTrap: () => ({ release() {} }) }));
vi.mock('@/utility/device-kind.js', () => ({ deviceKind: 'desktop' }));
vi.mock('@@/js/config.js', () => ({ host: 'localhost' }));
vi.mock('@/components/global/MkA.vue', () => ({ default: { render: () => null } }));
vi.mock('@/i18n.js', () => ({ i18n: {
	ts: { close: 'Close', open: 'Open', details: 'Details', retry: 'Retry', reload: 'Reload', _chatRedPacket: { audience: 'Current members' }, _redPacket: { title: 'Red packet', claim: 'Claim packet', defaultMessage: 'Good luck', active: 'Available', exhausted: 'All claimed', expired: 'Expired', audience: 'Audience', publicAudience: 'Public', selectedAudience: 'Selected', expiresAt: 'Expires', claims: 'Claims', noClaims: 'No claims yet', deletedUser: 'Deleted user', history: 'Wallet', operationFailed: 'Try again' } },
	tsx: { _redPacket: { receivedCoins: ({ coins }: { coins: number }) => `Received ${coins}`, coins: ({ coins }: { coins: number }) => `${coins} coins`, progress: ({ claimed, count }: { claimed: number; count: number }) => `${claimed}/${count} claimed` } },
} }));

const packet = { id: 'packet', senderId: 'owner', roomId: 'room', kind: 'group' as const, audience: 'room' as const, coverId: 'classic' as const, mode: 'equal' as const, message: '祝你好运，天天开心！', totalCoins: 100, count: 50, remainingCoins: 100, remainingCount: 50, expiresAt: '2099-01-01T00:00:00Z', status: 'active' as const, coverFileId: null, coverUrl: null, claimedCoins: null };
let app: App;
let host: HTMLElement;
afterEach(() => { app?.unmount(); host?.remove(); vi.clearAllMocks(); });

test.each([320, 900].flatMap(width => [false, true].map(dark => ({ width, dark }))))('claim and details stay in one modal at $width px (dark=$dark)', async ({ width, dark }) => {
	await page.viewport(width, 720);
	host = document.createElement('div');
	host.style.cssText = `--MI_THEME-panel:${dark ? '#303030' : '#fff'};--MI_THEME-fg:${dark ? '#ddd' : '#333'};--MI_THEME-fgTransparentWeak:${dark ? '#aaa' : '#666'};--MI_THEME-windowHeader:var(--MI_THEME-panel);--MI_THEME-divider:#8884;--MI_THEME-modalBg:#0008;--MI_THEME-accent:#86b300;--MI_THEME-buttonBg:#8883;--MI_THEME-focus:#86b300;`;
	document.body.append(host);
	api.mockImplementation(async endpoint => endpoint === 'red-packets/show' ? { ...packet, claims: [] } : { ...packet, claimedCoins: 2, remainingCount: 0, status: 'exhausted', claims: Array.from({ length: 50 }, (_, i) => ({ id: String(i), coins: 2, user: null, createdAt: '2026-10-02T00:00:00Z' })) });
	const claimed = vi.fn();
	app = createApp({ render: () => h(MkRedPacketClaimDialog, { redPacketId: packet.id, authorId: 'owner', redPacket: packet, onClaimed: claimed }) });
	for (const name of ['MkTime', 'MkAvatar', 'MkUserName', 'MkA', 'MkLoading']) app.component(name, { render: () => null });
	app.directive('hotkey', () => {});
	app.mount(host);
	await nextTick();
	await expect.element(page.getByRole('button', { name: 'Claim packet' })).toBeEnabled();
	const openButton = host.querySelector<HTMLButtonElement>('button[aria-label="Claim packet"]')!;
	expect(getComputedStyle(openButton).backgroundColor).toBe('rgb(255, 226, 173)');
	expect(openButton.getBoundingClientRect().width).toBe(88);
	const modal = host.querySelector('[data-testid="modal-window-close"]')!.parentElement!.parentElement!;
	expect(modal.getBoundingClientRect().width).toBeLessThanOrEqual(width);
	await page.screenshot({ element: modal, path: `../e2e/artifacts/component-browser/claim-${width}-${dark ? 'dark' : 'light'}.png` });
	await page.getByRole('button', { name: 'Claim packet' }).click();
	await expect.poll(() => claimed.mock.calls.length).toBe(1);
	await expect.element(page.getByRole('status')).toHaveTextContent('Received 2');
	expect(api.mock.calls.filter(([endpoint]) => endpoint === 'red-packets/claim')).toHaveLength(1);
	expect(modal.getBoundingClientRect().height).toBeLessThanOrEqual(620);
	expect(modal.scrollWidth).toBeLessThanOrEqual(modal.clientWidth);
	const content = host.querySelector('ul')!.closest('[class*="body_"]') as HTMLElement;
	expect(content.scrollHeight).toBeGreaterThan(content.clientHeight);
	await page.screenshot({ element: modal, path: `../e2e/artifacts/component-browser/claim-details-${width}-${dark ? 'dark' : 'light'}.png` });
});
