/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import MkShareDialog from '@/components/MkShareDialog.vue';
import { i18n } from '@/i18n.js';
import { getShareUrl } from '@/utility/share.js';

const mocks = vi.hoisted(() => ({
	canShare: vi.fn(),
	copy: vi.fn(),
	copyText: vi.fn(),
	share: vi.fn(),
	qr: vi.fn(),
	append: vi.fn(),
	getRawData: vi.fn(),
	download: vi.fn(),
	close: vi.fn(),
}));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false } } }));
vi.mock('@/utility/share.js', async importOriginal => ({
	...await importOriginal<typeof import('@/utility/share.js')>(),
	canShareWithSystem: mocks.canShare,
	copyShareLink: mocks.copy,
	copyShareText: mocks.copyText,
	shareWithSystem: mocks.share,
}));
vi.mock('qr-code-styling', () => ({ default: class {
	constructor(options: unknown) { mocks.qr(options); }
	append(element: HTMLElement): void { mocks.append(element); }
	getRawData(extension: 'svg' | 'png'): Promise<Blob | null> { return mocks.getRawData(extension); }
} }));
vi.mock('@/components/MkModalWindow.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({
		emits: ['close', 'closed', 'click', 'esc'],
		setup(_props, { slots, expose, emit }) {
			expose({ close: () => { mocks.close(); emit('closed'); } });
			return () => h('div', [slots.header?.(), slots.default?.(), h('button', { onClick: () => emit('close') }, 'Close dialog')]);
		},
	}) };
});
vi.mock('@/components/MkButton.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({
		props: { disabled: Boolean, wait: Boolean },
		emits: ['click'],
		setup(props, { slots, emit }) {
			return () => h('button', { disabled: props.disabled || props.wait, onClick: () => emit('click') }, slots.default?.());
		},
	}) };
});

const data = { title: 'A note', text: 'Note content', url: 'https://example.com/notes/note' };
const platformIds = ['qq', 'qzone', 'weibo', 'x', 'telegram', 'facebook', 'whatsapp'] as const;

function renderDialog(props: Partial<typeof data> & { restricted?: boolean } = {}) {
	return render(MkShareDialog, { props: {
		...data, ...props,
	} });
}

describe('share dialog', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.canShare.mockReturnValue(true);
		mocks.copy.mockResolvedValue(true);
		mocks.copyText.mockResolvedValue(true);
		mocks.share.mockResolvedValue('shared');
		mocks.getRawData.mockImplementation(async (extension: string) => new Blob(['QR image'], { type: extension === 'svg' ? 'image/svg+xml' : 'image/png' }));
		vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:share-qr');
		vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
		vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {});
		vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
			mocks.download({ href: this.href, filename: this.download, connected: this.isConnected });
		});
	});
	afterEach(() => {
		cleanup();
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	test('offers copying and QR on browsers without system sharing', () => {
		mocks.canShare.mockReturnValue(false);
		const view = renderDialog();
		expect(view.queryByRole('button', { name: i18n.ts._share.system })).toBeNull();
		expect(view.getByRole('button', { name: i18n.ts.copyLink })).toBeTruthy();
		expect(view.getByRole('button', { name: i18n.ts.copyContent })).toBeTruthy();
		expect(view.getByRole('button', { name: i18n.ts._share.qrCode })).toBeTruthy();
		expect(view.getByRole('button', { name: i18n.ts._share.wechat })).toBeTruthy();
		expect(view.getAllByRole('link')).toHaveLength(7);
	});

	test('offers seven safe compose links and a WeChat QR action', () => {
		const props = { title: 'Title &injected=true', text: 'Content + 中文 😀', url: 'https://example.com/notes/note?x=a%26b&y=c+d#text' };
		const view = renderDialog(props);
		const links = view.getAllByRole('link');
		expect(links).toHaveLength(platformIds.length);
		for (const platform of platformIds) {
			const link = view.getByRole('link', { name: i18n.ts._share[platform] });
			expect(link.getAttribute('href')).toBe(getShareUrl(platform, props));
			expect(link.getAttribute('target')).toBe('_blank');
			expect(link.getAttribute('rel')?.split(' ')).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));
			const url = new URL((link as HTMLAnchorElement).href);
			expect(url.protocol).toBe('https:');
			expect(url.searchParams.has('injected')).toBe(false);
		}
		expect(view.queryByRole('link', { name: i18n.ts._share.wechat })).toBeNull();
		expect(view.getByRole('button', { name: i18n.ts._share.wechat })).toBeTruthy();
	});

	test('keeps a copyable link selected if clipboard copying fails', async () => {
		mocks.copy.mockResolvedValue(false);
		const view = renderDialog();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.copyLink }));
		await waitFor(() => expect(view.getByRole('status').textContent).toBe(i18n.ts._share.copyFailed));
		const link = view.getByRole('textbox') as HTMLInputElement;
		expect(document.activeElement).toBe(link);
		expect(link.selectionStart).toBe(0);
		expect(link.selectionEnd).toBe(link.value.length);
		expect(mocks.close).not.toHaveBeenCalled();
	});

	test('changes the copy button after clipboard confirmation without a separate success message', async () => {
		const copied = Promise.withResolvers<boolean>();
		mocks.copy.mockReturnValueOnce(copied.promise);
		const view = renderDialog();
		const button = view.getByRole('button', { name: i18n.ts.copyLink }) as HTMLButtonElement;
		await fireEvent.click(button);
		expect(button.disabled).toBe(true);
		await fireEvent.click(button);
		expect(mocks.copy).toHaveBeenCalledOnce();
		expect(view.queryByRole('button', { name: i18n.ts._share.copied })).toBeNull();
		copied.resolve(true);
		await waitFor(() => expect(view.getByRole('button', { name: i18n.ts._share.copied })).toBeTruthy());
		expect(button.disabled).toBe(true);
		expect(view.queryByRole('status')).toBeNull();
		expect(mocks.copy).toHaveBeenCalledWith(data.url);
	});

	test('clears a failed copy message when a retry succeeds', async () => {
		mocks.copy.mockResolvedValueOnce(false);
		const view = renderDialog();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.copyLink }));
		await waitFor(() => expect(view.getByRole('status').textContent).toBe(i18n.ts._share.copyFailed));
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.copyLink }));
		await waitFor(() => expect(view.getByRole('button', { name: i18n.ts._share.copied })).toBeTruthy());
		expect(view.queryByRole('status')).toBeNull();
	});

	test('copies the full multiline content and link even when the preview is long', async () => {
		const text = `  First line\n${'长内容👩‍💻'.repeat(600)}\nLast line  `;
		const view = renderDialog({ text });
		expect(view.getByTitle(text, { normalizer: value => value }).textContent).toBe(text);
		const button = view.getByRole('button', { name: i18n.ts.copyContent });
		await fireEvent.click(button);
		await waitFor(() => expect(button.textContent).toContain(i18n.ts._share.copied));
		expect((button as HTMLButtonElement).disabled).toBe(true);
		expect(mocks.copyText).toHaveBeenCalledWith(`${data.title}\n${text}\n${data.url}`);
		expect(mocks.copy).not.toHaveBeenCalled();
		expect(view.queryByRole('status')).toBeNull();
	});

	test('blocks repeated content copying and allows a failed copy to be retried', async () => {
		const copied = Promise.withResolvers<boolean>();
		mocks.copyText.mockReturnValueOnce(copied.promise);
		const view = renderDialog();
		const button = view.getByRole('button', { name: i18n.ts.copyContent }) as HTMLButtonElement;
		await fireEvent.click(button);
		expect(button.disabled).toBe(true);
		await fireEvent.click(button);
		expect(mocks.copyText).toHaveBeenCalledOnce();
		copied.resolve(false);
		await waitFor(() => expect(view.getByRole('status').textContent).toBe(i18n.ts._share.copyContentFailed));
		expect(button.disabled).toBe(false);
		await fireEvent.click(button);
		await waitFor(() => expect(button.textContent).toContain(i18n.ts._share.copied));
		expect(view.queryByRole('status')).toBeNull();
	});

	test('keeps cancellation quiet and displays a useful failure message', async () => {
		const view = renderDialog();
		mocks.share.mockResolvedValueOnce('canceled');
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._share.system }));
		expect(view.queryByRole('status')).toBeNull();
		mocks.share.mockResolvedValueOnce('failed');
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._share.system }));
		await waitFor(() => expect(view.getByRole('status').textContent).toBe(i18n.ts._share.shareFailed));
		mocks.share.mockResolvedValueOnce('canceled');
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._share.system }));
		expect(view.queryByRole('status')).toBeNull();
		expect(mocks.share).toHaveBeenCalledWith(data);
		expect(mocks.close).not.toHaveBeenCalled();
	});

	test('disables system sharing while the native dialog is open', async () => {
		const shared = Promise.withResolvers<'shared'>();
		mocks.share.mockReturnValueOnce(shared.promise);
		const view = renderDialog();
		const button = view.getByRole('button', { name: i18n.ts._share.system }) as HTMLButtonElement;
		await fireEvent.click(button);
		expect(button.disabled).toBe(true);
		await fireEvent.click(button);
		expect(mocks.share).toHaveBeenCalledOnce();
		shared.resolve('shared');
		await waitFor(() => expect(button.disabled).toBe(false));
		expect(view.queryByRole('status')).toBeNull();
	});

	test('hides supplied restricted content from the preview and every sharing path', async () => {
		const text = 'Private body & confidential';
		const view = renderDialog({ restricted: true, text });
		expect(view.getByText(i18n.ts._share.restrictedNote)).toBeTruthy();
		expect(view.queryByText(text)).toBeNull();
		expect(view.queryByTitle(text)).toBeNull();
		expect(mocks.canShare).toHaveBeenCalledWith({ ...data, text: undefined });
		for (const platform of platformIds) {
			const link = view.getByRole('link', { name: i18n.ts._share[platform] }) as HTMLAnchorElement;
			expect(link.href).toBe(getShareUrl(platform, { ...data, text: undefined }));
			expect([...new URL(link.href).searchParams.values()].join('\n')).not.toContain(text);
		}
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.copyContent }));
		expect(mocks.copyText).toHaveBeenCalledWith(`${data.title}\n${data.url}`);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._share.system }));
		expect(mocks.share).toHaveBeenCalledWith({ ...data, text: undefined });
		expect((view.getByRole('button', { name: i18n.ts.copyLink }) as HTMLButtonElement).disabled).toBe(false);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.copyLink }));
		expect(mocks.copy).toHaveBeenCalledWith(data.url);
	});

	describe('copy confirmation cooldown', () => {
		const actions = [
			{ name: 'link', label: 'copyLink', mock: 'copy', icon: 'ti-copy', error: 'copyFailed' },
			{ name: 'content', label: 'copyContent', mock: 'copyText', icon: 'ti-file-text', error: 'copyContentFailed' },
		] as const;

		beforeEach(() => {
			vi.useFakeTimers();
		});

		test.each(actions)('locks $name copying for three seconds without extending the timer on repeated clicks', async action => {
			const view = renderDialog();
			const button = view.getByRole('button', { name: i18n.ts[action.label] }) as HTMLButtonElement;
			await fireEvent.click(button);
			await vi.advanceTimersByTimeAsync(0);
			expect(button.disabled).toBe(true);
			expect(button.textContent).toContain(i18n.ts._share.copied);
			expect(button.querySelector('.ti-check')).not.toBeNull();
			await vi.advanceTimersByTimeAsync(1000);
			await fireEvent.click(button);
			await fireEvent.click(button);
			expect(mocks[action.mock]).toHaveBeenCalledOnce();
			expect(button.textContent).toContain(i18n.ts._share.copied);
			await vi.advanceTimersByTimeAsync(1999);
			expect(button.disabled).toBe(true);
			expect(button.querySelector('.ti-check')).not.toBeNull();
			await vi.advanceTimersByTimeAsync(1);
			expect(button.disabled).toBe(false);
			expect(button.textContent).toContain(i18n.ts[action.label]);
			expect(button.querySelector(`.${action.icon}`)).not.toBeNull();
			expect(button.querySelector('.ti-check')).toBeNull();
			await fireEvent.click(button);
			await vi.advanceTimersByTimeAsync(0);
			expect(mocks[action.mock]).toHaveBeenCalledTimes(2);
			expect(button.disabled).toBe(true);
		});

		test('keeps link and content cooldowns independent', async () => {
			const view = renderDialog();
			const linkButton = view.getByRole('button', { name: i18n.ts.copyLink }) as HTMLButtonElement;
			const contentButton = view.getByRole('button', { name: i18n.ts.copyContent }) as HTMLButtonElement;
			await fireEvent.click(linkButton);
			await vi.advanceTimersByTimeAsync(1000);
			expect(contentButton.disabled).toBe(false);
			await fireEvent.click(contentButton);
			await vi.advanceTimersByTimeAsync(0);
			expect(linkButton.disabled).toBe(true);
			expect(contentButton.disabled).toBe(true);
			await vi.advanceTimersByTimeAsync(2000);
			expect(linkButton.disabled).toBe(false);
			expect(linkButton.textContent).toContain(i18n.ts.copyLink);
			expect(contentButton.disabled).toBe(true);
			expect(contentButton.textContent).toContain(i18n.ts._share.copied);
			await vi.advanceTimersByTimeAsync(1000);
			expect(contentButton.disabled).toBe(false);
			expect(contentButton.textContent).toContain(i18n.ts.copyContent);
		});

		test.each(actions)('allows an immediate retry after $name copying fails', async action => {
			const view = renderDialog();
			const initialTimers = vi.getTimerCount();
			const button = view.getByRole('button', { name: i18n.ts[action.label] }) as HTMLButtonElement;
			mocks[action.mock].mockResolvedValueOnce(false);
			await fireEvent.click(button);
			await vi.advanceTimersByTimeAsync(0);
			expect(button.disabled).toBe(false);
			expect(button.textContent).toContain(i18n.ts[action.label]);
			expect(button.querySelector(`.${action.icon}`)).not.toBeNull();
			expect(view.getByRole('status').textContent).toBe(i18n.ts._share[action.error]);
			expect(vi.getTimerCount()).toBe(initialTimers);
			await fireEvent.click(button);
			await vi.advanceTimersByTimeAsync(0);
			expect(mocks[action.mock]).toHaveBeenCalledTimes(2);
			expect(button.disabled).toBe(true);
			expect(button.textContent).toContain(i18n.ts._share.copied);
			expect(view.queryByRole('status')).toBeNull();
		});

		test('resets both cooldowns when the shared URL changes', async () => {
			const view = renderDialog();
			const initialTimers = vi.getTimerCount();
			const linkButton = view.getByRole('button', { name: i18n.ts.copyLink }) as HTMLButtonElement;
			const contentButton = view.getByRole('button', { name: i18n.ts.copyContent }) as HTMLButtonElement;
			await fireEvent.click(linkButton);
			await fireEvent.click(contentButton);
			await vi.advanceTimersByTimeAsync(1000);
			const url = 'https://example.com/notes/another';
			await view.rerender({ url });
			expect(linkButton.disabled).toBe(false);
			expect(contentButton.disabled).toBe(false);
			expect(linkButton.textContent).toContain(i18n.ts.copyLink);
			expect(contentButton.textContent).toContain(i18n.ts.copyContent);
			expect(linkButton.querySelector('.ti-copy')).not.toBeNull();
			expect(contentButton.querySelector('.ti-file-text')).not.toBeNull();
			expect(vi.getTimerCount()).toBe(initialTimers);
			await fireEvent.click(linkButton);
			await vi.advanceTimersByTimeAsync(2999);
			expect(mocks.copy).toHaveBeenLastCalledWith(url);
			expect(linkButton.disabled).toBe(true);
			await vi.advanceTimersByTimeAsync(1);
			expect(linkButton.disabled).toBe(false);
		});

		test.each(actions)('ignores stale $name clipboard completion after the URL changes', async action => {
			const oldCopy = Promise.withResolvers<boolean>();
			const newCopy = Promise.withResolvers<boolean>();
			mocks[action.mock].mockReturnValueOnce(oldCopy.promise).mockReturnValueOnce(newCopy.promise);
			const view = renderDialog();
			const initialTimers = vi.getTimerCount();
			const button = view.getByRole('button', { name: i18n.ts[action.label] }) as HTMLButtonElement;
			await fireEvent.click(button);
			await view.rerender({ url: 'https://example.com/notes/another' });
			expect(button.disabled).toBe(false);
			await fireEvent.click(button);
			expect(button.disabled).toBe(true);
			oldCopy.resolve(true);
			await vi.advanceTimersByTimeAsync(0);
			expect(button.disabled).toBe(true);
			expect(button.textContent).toContain(i18n.ts[action.label]);
			expect(button.querySelector('.ti-check')).toBeNull();
			expect(vi.getTimerCount()).toBe(initialTimers);
			newCopy.resolve(true);
			await vi.advanceTimersByTimeAsync(0);
			expect(button.textContent).toContain(i18n.ts._share.copied);
			expect(button.disabled).toBe(true);
			expect(vi.getTimerCount()).toBe(initialTimers + 1);
			await vi.advanceTimersByTimeAsync(3000);
			expect(button.disabled).toBe(false);
		});

		test('clears active copy timers when the dialog is unmounted', async () => {
			const view = renderDialog();
			const initialTimers = vi.getTimerCount();
			await fireEvent.click(view.getByRole('button', { name: i18n.ts.copyLink }));
			await fireEvent.click(view.getByRole('button', { name: i18n.ts.copyContent }));
			await vi.advanceTimersByTimeAsync(0);
			expect(vi.getTimerCount()).toBe(initialTimers + 2);
			view.unmount();
			expect(vi.getTimerCount()).toBe(initialTimers);
		});

		test.each(actions)('does not start a timer for $name copying completed after unmount', async action => {
			const copied = Promise.withResolvers<boolean>();
			mocks[action.mock].mockReturnValueOnce(copied.promise);
			const view = renderDialog();
			const initialTimers = vi.getTimerCount();
			await fireEvent.click(view.getByRole('button', { name: i18n.ts[action.label] }));
			view.unmount();
			copied.resolve(true);
			await vi.advanceTimersByTimeAsync(0);
			expect(vi.getTimerCount()).toBe(initialTimers);
		});
	});

	test('waits for a lazily generated SVG before exposing the QR image and download', async () => {
		const generated = Promise.withResolvers<Blob>();
		mocks.getRawData.mockReturnValueOnce(generated.promise);
		const view = renderDialog();
		const button = view.getByRole('button', { name: i18n.ts._share.qrCode });
		expect(button.getAttribute('aria-expanded')).toBe('false');
		expect(mocks.qr).not.toHaveBeenCalled();
		expect(mocks.getRawData).not.toHaveBeenCalled();
		await fireEvent.click(button);
		expect(button.getAttribute('aria-expanded')).toBe('true');
		expect((await view.findByRole('status')).textContent).toBe(i18n.ts.loading);
		expect(view.queryByRole('img', { name: i18n.ts._share.qrCode })).toBeNull();
		expect(view.queryByRole('button', { name: i18n.ts._share.saveQrCode })).toBeNull();
		expect(mocks.getRawData).toHaveBeenCalledWith('svg');
		expect(mocks.append).not.toHaveBeenCalled();
		generated.resolve(new Blob(['<svg/>'], { type: 'image/svg+xml' }));
		await waitFor(() => expect(view.getByRole('img', { name: i18n.ts._share.qrCode })).toBeTruthy());
		expect(mocks.qr).toHaveBeenCalledWith(expect.objectContaining({ data: data.url, type: 'svg' }));
		expect(mocks.append).toHaveBeenCalledWith(view.getByRole('img', { name: i18n.ts._share.qrCode }));
		expect(view.getByRole('button', { name: i18n.ts._share.saveQrCode })).toBeTruthy();
		expect(view.queryByRole('status')).toBeNull();
	});

	test('opens WeChat guidance and reuses the code when changing QR modes', async () => {
		const view = renderDialog();
		const wechatButton = view.getByRole('button', { name: i18n.ts._share.wechat });
		const qrButton = view.getByRole('button', { name: i18n.ts._share.qrCode });
		await fireEvent.click(wechatButton);
		await waitFor(() => expect(view.getByRole('img', { name: i18n.ts._share.qrCode })).toBeTruthy());
		expect(wechatButton.getAttribute('aria-expanded')).toBe('true');
		expect(qrButton.getAttribute('aria-expanded')).toBe('false');
		expect(view.getByText(i18n.ts._share.wechatDescription)).toBeTruthy();
		expect(view.getByRole('region', { name: i18n.ts._share.qrCode }).id).toBe(wechatButton.getAttribute('aria-controls'));
		await fireEvent.click(qrButton);
		expect(qrButton.getAttribute('aria-expanded')).toBe('true');
		expect(wechatButton.getAttribute('aria-expanded')).toBe('false');
		expect(view.getByText(i18n.ts._share.qrCodeDescription)).toBeTruthy();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.close }));
		expect(view.queryByRole('region', { name: i18n.ts._share.qrCode })).toBeNull();
		await fireEvent.click(wechatButton);
		expect(view.getByRole('region', { name: i18n.ts._share.qrCode })).toBeTruthy();
		expect(mocks.qr).toHaveBeenCalledOnce();
		await fireEvent.click(wechatButton);
		expect(wechatButton.getAttribute('aria-expanded')).toBe('false');
		expect(view.queryByRole('region', { name: i18n.ts._share.qrCode })).toBeNull();
	});

	test.each(['qrCode', 'wechat'] as const)('returns focus to the %s trigger when closing the QR section', async mode => {
		const view = renderDialog();
		const trigger = view.getByRole('button', { name: i18n.ts._share[mode] });
		trigger.focus();
		await fireEvent.click(trigger);
		await view.findByRole('img', { name: i18n.ts._share.qrCode });
		const closeButton = view.getByRole('button', { name: i18n.ts.close });
		closeButton.focus();
		expect(document.activeElement).toBe(closeButton);
		await fireEvent.click(closeButton);
		await waitFor(() => expect(document.activeElement).toBe(trigger));
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(view.queryByRole('region', { name: i18n.ts._share.qrCode })).toBeNull();
	});

	test.each(['rejected', 'missing'] as const)('allows retry after a %s QR image', async failure => {
		if (failure === 'rejected') mocks.getRawData.mockRejectedValueOnce(new Error('QR generation failed'));
		else mocks.getRawData.mockResolvedValueOnce(null);
		const view = renderDialog();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._share.qrCode }));
		await waitFor(() => expect(view.getByText(i18n.ts._share.qrCodeFailed)).toBeTruthy());
		expect(view.queryByRole('status')).toBeNull();
		expect(mocks.append).not.toHaveBeenCalled();
		expect(view.queryByRole('button', { name: i18n.ts._share.saveQrCode })).toBeNull();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.retry }));
		await waitFor(() => expect(view.getByRole('img', { name: i18n.ts._share.qrCode })).toBeTruthy());
		expect(view.queryByText(i18n.ts._share.qrCodeFailed)).toBeNull();
		expect(mocks.qr).toHaveBeenCalledTimes(2);
	});

	test('downloads a PNG once while saving and releases object URLs after use', async () => {
		const view = renderDialog();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._share.qrCode }));
		const button = await view.findByRole('button', { name: i18n.ts._share.saveQrCode }) as HTMLButtonElement;
		const saved = Promise.withResolvers<Blob>();
		const blob = new Blob(['PNG image'], { type: 'image/png' });
		mocks.getRawData.mockReturnValueOnce(saved.promise);
		await fireEvent.click(button);
		expect(button.disabled).toBe(true);
		await fireEvent.click(button);
		expect(mocks.getRawData.mock.calls).toEqual([['svg'], ['png']]);
		expect(URL.createObjectURL).not.toHaveBeenCalled();
		expect(mocks.download).not.toHaveBeenCalled();
		saved.resolve(blob);
		await waitFor(() => expect(mocks.download).toHaveBeenCalledOnce());
		expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
		expect(mocks.download).toHaveBeenCalledWith({ href: 'blob:share-qr', filename: 'misskey-share.png', connected: true });
		expect(document.querySelector('a[download]')).toBeNull();
		expect(button.disabled).toBe(false);
		expect(view.queryByRole('status')).toBeNull();
		vi.mocked(URL.createObjectURL).mockReturnValueOnce('blob:share-qr-next');
		await fireEvent.click(button);
		await waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(2));
		expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:share-qr');
		view.unmount();
		expect(URL.revokeObjectURL).toHaveBeenLastCalledWith('blob:share-qr-next');
	});

	test.each(['rejected', 'missing'] as const)('reports a %s PNG download and allows retry', async failure => {
		const view = renderDialog();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._share.qrCode }));
		const button = await view.findByRole('button', { name: i18n.ts._share.saveQrCode }) as HTMLButtonElement;
		if (failure === 'rejected') mocks.getRawData.mockRejectedValueOnce(new Error('PNG conversion failed'));
		else mocks.getRawData.mockResolvedValueOnce(null);
		await fireEvent.click(button);
		await waitFor(() => expect(view.getByRole('status').textContent).toBe(i18n.ts._share.saveQrCodeFailed));
		expect(button.disabled).toBe(false);
		expect(URL.createObjectURL).not.toHaveBeenCalled();
		expect(mocks.download).not.toHaveBeenCalled();
		await fireEvent.click(button);
		await waitFor(() => expect(mocks.download).toHaveBeenCalledOnce());
		expect(view.queryByRole('status')).toBeNull();
	});

	test('discards a stale SVG and regenerates when the shared URL changes', async () => {
		const oldImage = Promise.withResolvers<Blob>();
		const newImage = Promise.withResolvers<Blob>();
		mocks.getRawData.mockReturnValueOnce(oldImage.promise).mockReturnValueOnce(newImage.promise);
		const view = renderDialog();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._share.qrCode }));
		const url = 'https://example.com/notes/another';
		await view.rerender({ url });
		expect(mocks.qr).toHaveBeenLastCalledWith(expect.objectContaining({ data: url }));
		oldImage.resolve(new Blob(['Old image']));
		await oldImage.promise;
		expect(mocks.append).not.toHaveBeenCalled();
		expect(view.getByRole('status').textContent).toBe(i18n.ts.loading);
		newImage.resolve(new Blob(['New image']));
		await waitFor(() => expect(view.getByRole('img', { name: i18n.ts._share.qrCode })).toBeTruthy());
		expect(mocks.append).toHaveBeenCalledOnce();
	});

	test('does not download a stale PNG after the shared URL changes', async () => {
		const view = renderDialog();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._share.qrCode }));
		const button = await view.findByRole('button', { name: i18n.ts._share.saveQrCode });
		const saved = Promise.withResolvers<Blob>();
		mocks.getRawData.mockReturnValueOnce(saved.promise);
		await fireEvent.click(button);
		await view.rerender({ url: 'https://example.com/notes/another' });
		saved.resolve(new Blob(['Old PNG'], { type: 'image/png' }));
		await waitFor(() => expect((view.getByRole('button', { name: i18n.ts._share.saveQrCode }) as HTMLButtonElement).disabled).toBe(false));
		expect(URL.createObjectURL).not.toHaveBeenCalled();
		expect(mocks.download).not.toHaveBeenCalled();
	});

	test('does not append a QR image after the dialog is unmounted', async () => {
		const generated = Promise.withResolvers<Blob>();
		mocks.getRawData.mockReturnValueOnce(generated.promise);
		const view = renderDialog();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._share.qrCode }));
		view.unmount();
		generated.resolve(new Blob(['SVG image']));
		await generated.promise;
		expect(mocks.append).not.toHaveBeenCalled();
	});

	test.each(['shareWithNote', 'embed'] as const)('preserves the optional %s action in the shared dialog', async action => {
		const view = render(MkShareDialog, { props: { ...data, canShareWithNote: true, canEmbed: true } });
		await fireEvent.click(view.getByRole('button', { name: action === 'embed' ? i18n.ts.embed : i18n.ts.shareWithNote }));
		expect(view.emitted(action)).toHaveLength(1);
		expect(mocks.close).toHaveBeenCalledOnce();
	});

	test('closes through the modal and emits cleanup', async () => {
		const view = renderDialog();
		await fireEvent.click(view.getByRole('button', { name: 'Close dialog' }));
		expect(mocks.close).toHaveBeenCalledOnce();
		expect(view.emitted('closed')).toHaveLength(1);
	});
});
