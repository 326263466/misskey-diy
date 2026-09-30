/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import MkUpdated from '@/components/MkUpdated.vue';
import { i18n } from '@/i18n.js';

const notes = vi.hoisted(() => ({} as Record<string, string[]>));
vi.mock('../../../../release-notes.json', () => ({ default: notes }));
vi.mock('@@/js/config.js', async importOriginal => ({
	...await importOriginal<typeof import('@@/js/config.js')>(),
	version: 'test-release',
	instanceName: '自定义社区',
}));
vi.mock('@/utility/confetti.js', () => ({ confetti: vi.fn() }));
vi.mock('@/components/MkModal.vue', () => ({ default: { emits: ['click', 'closed'], template: '<div><slot /></div>' } }));
vi.mock('@/components/MkButton.vue', () => ({ default: { template: '<button><slot /></button>' } }));
vi.mock('@/components/MkSparkle.vue', () => ({ default: { template: '<span><slot /></span>' } }));

afterEach(() => {
	cleanup();
	delete notes['test-release'];
	delete notes['other-release'];
	vi.restoreAllMocks();
});

describe('local update information', () => {
	test('shows a generic system title and opens matching release notes locally as safe text', async () => {
		notes['test-release'] = ['<img src=x onerror=alert(1)>', '本地更新内容'];
		const open = vi.spyOn(window, 'open');
		const view = render(MkUpdated);
		expect(view.getByRole('dialog').getAttribute('aria-label')).toBe(`${i18n.ts.update}${i18n.ts.done}`);
		expect(view.getByRole('dialog').textContent).not.toContain('自定义社区');
		expect(view.getByRole('dialog').textContent).not.toMatch(/misskey/i);
		expect(view.queryByRole('region')).toBeNull();
		const button = view.getByRole('button', { name: i18n.ts.whatIsNew });
		await fireEvent.click(button);
		expect(button.getAttribute('aria-expanded')).toBe('true');
		const region = view.getByRole('region', { name: i18n.ts.whatIsNew });
		expect(region.textContent).toContain(notes['test-release'][0]);
		expect(region.querySelector('img')).toBeNull();
		expect(open).not.toHaveBeenCalled();
		await fireEvent.click(button);
		expect(view.queryByRole('region')).toBeNull();
		expect(button.getAttribute('aria-expanded')).toBe('false');
	});

	test('shows an empty state when the current version has no notes instead of another release', async () => {
		notes['other-release'] = ['Old release information'];
		const view = render(MkUpdated);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.whatIsNew }));
		expect(view.getByRole('region').textContent).toBe(i18n.ts.nothing);
		expect(view.queryByText('Old release information')).toBeNull();
	});
});
