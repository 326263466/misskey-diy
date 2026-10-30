/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import MkUpdated from '@/components/MkUpdated.vue';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';

const mocks = vi.hoisted(() => ({ version: '2026.10.0', closeModal: vi.fn(), instanceName: 'local.example' }));
vi.mock('@@/js/config.js', async importOriginal => ({
	...await importOriginal<typeof import('@@/js/config.js')>(),
	get version() { return mocks.version; },
	instanceName: mocks.instanceName,
}));
vi.mock('@/instance.js', async () => {
	const { reactive } = await import('vue');
	return { instance: reactive({ name: '自定义社区' }) };
});
vi.mock('@/utility/confetti.js', () => ({ confetti: vi.fn() }));
vi.mock('@/components/MkModal.vue', async () => {
	const { defineComponent } = await import('vue');
	return {
		default: defineComponent({
			emits: ['click', 'closed'],
			setup(_props, { emit, expose }) {
				expose({ close: () => { mocks.closeModal(); emit('closed'); } });
			},
			template: '<div><slot /></div>',
		}),
	};
});
vi.mock('@/components/MkButton.vue', () => ({ default: { props: ['disabled'], template: '<button :disabled="disabled"><slot /></button>' } }));
vi.mock('@/components/MkSparkle.vue', () => ({ default: { template: '<span><slot /></span>' } }));

beforeEach(() => {
	mocks.version = '2026.10.0';
	instance.name = '自定义社区';
	vi.clearAllMocks();
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('update information', () => {
	test('shows the current instance name and closes without opening release notes when acknowledged', async () => {
		const openWindow = vi.spyOn(window, 'open').mockReturnValue(null);
		const view = render(MkUpdated);
		const instanceDisplayName = instance.name ?? '自定义社区';
		expect(view.getByText(i18n.tsx.instanceUpgraded({ name: instanceDisplayName }))).toBeTruthy();
		expect(view.queryByText(/misskey/i)).toBeNull();
		expect(view.getByText(`✨${mocks.version}🚀`)).toBeTruthy();
		expect(view.queryByText(i18n.ts.thankYouForTestingBeta)).toBeNull();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.gotIt }));
		expect(mocks.closeModal).toHaveBeenCalledOnce();
		expect(view.emitted().closed).toHaveLength(1);
		expect(openWindow).not.toHaveBeenCalled();
	});

	test.each([null, ''])('falls back to the page instance name when the configured name is %s', name => {
		instance.name = name;
		const view = render(MkUpdated);
		expect(view.getByText(i18n.tsx.instanceUpgraded({ name: mocks.instanceName }))).toBeTruthy();
		expect(view.queryByText(/misskey/i)).toBeNull();
	});

	test.each([
		['2026.10.0', false],
		['2026.10.0-alpha.1', true],
		['2026.10.0-beta.1', true],
		['2026.10.0-rc.1', true],
	])('leaves release notes disabled by default for %s', async (version, isBeta) => {
		mocks.version = version;
		const openWindow = vi.spyOn(window, 'open').mockReturnValue(null);
		const view = render(MkUpdated);
		expect(Boolean(view.queryByText(i18n.ts.thankYouForTestingBeta))).toBe(isBeta);
		const button = view.getByRole('button', { name: i18n.ts.whatIsNew }) as HTMLButtonElement;
		expect(button.disabled).toBe(true);
		await fireEvent.click(button);
		expect(mocks.closeModal).not.toHaveBeenCalled();
		expect(view.emitted().closed).toBeUndefined();
		expect(openWindow).not.toHaveBeenCalled();
	});

	test('treats a whitespace-only release notes URL as empty', async () => {
		const openWindow = vi.spyOn(window, 'open').mockReturnValue(null);
		const view = render(MkUpdated, { props: { releaseNotesUrl: '  ' } });
		const button = view.getByRole('button', { name: i18n.ts.whatIsNew }) as HTMLButtonElement;
		expect(button.disabled).toBe(true);
		await fireEvent.click(button);
		expect(mocks.closeModal).not.toHaveBeenCalled();
		expect(openWindow).not.toHaveBeenCalled();
	});

	test('closes before opening an explicitly provided release notes URL', async () => {
		const openWindow = vi.spyOn(window, 'open').mockReturnValue(null);
		const releaseNotesUrl = 'https://local.example/updates';
		const view = render(MkUpdated, { props: { releaseNotesUrl: ` ${releaseNotesUrl} ` } });
		expect((view.getByRole('button', { name: i18n.ts.whatIsNew }) as HTMLButtonElement).disabled).toBe(false);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.whatIsNew }));
		expect(mocks.closeModal).toHaveBeenCalledOnce();
		expect(view.emitted().closed).toHaveLength(1);
		expect(openWindow).toHaveBeenCalledExactlyOnceWith(releaseNotesUrl, '_blank', 'noopener,noreferrer');
		expect(mocks.closeModal.mock.invocationCallOrder[0]).toBeLessThan(openWindow.mock.invocationCallOrder[0]);
	});
});
