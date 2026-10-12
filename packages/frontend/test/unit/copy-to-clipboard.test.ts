/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({ writeText: vi.fn(), success: vi.fn(), toast: vi.fn() }));
vi.mock('@/os.js', () => ({ success: mocks.success, toast: mocks.toast }));
const originalNavigator = navigator;

describe('clipboard feedback', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal('navigator', { clipboard: { writeText: mocks.writeText } });
	});
	afterEach(() => vi.stubGlobal('navigator', originalNavigator));

	test('reports success only after the clipboard write completes', async () => {
		let finish!: () => void;
		mocks.writeText.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
		const copying = copyToClipboard('Copied text');
		expect(mocks.writeText).toHaveBeenCalledWith('Copied text');
		expect(mocks.success).not.toHaveBeenCalled();
		finish();
		await copying;
		expect(mocks.success).toHaveBeenCalledExactlyOnceWith(i18n.ts.copiedToClipboard);
		expect(mocks.toast).not.toHaveBeenCalled();
	});

	test('handles permission rejection without an unhandled promise or success message', async () => {
		mocks.writeText.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'));
		await expect(copyToClipboard('Copied text')).resolves.toBeUndefined();
		expect(mocks.toast).toHaveBeenCalledExactlyOnceWith(i18n.ts.somethingHappened, 'error');
		expect(mocks.success).not.toHaveBeenCalled();
	});

	test('reports unavailable clipboard support', async () => {
		vi.stubGlobal('navigator', {});
		await expect(copyToClipboard('Copied text')).resolves.toBeUndefined();
		expect(mocks.toast).toHaveBeenCalledExactlyOnceWith(i18n.ts.somethingHappened, 'error');
		expect(mocks.success).not.toHaveBeenCalled();
	});

	test.each([null, ''])('keeps absent input a no-op (%s)', async text => {
		await copyToClipboard(text);
		expect(mocks.writeText).not.toHaveBeenCalled();
		expect(mocks.toast).not.toHaveBeenCalled();
		expect(mocks.success).not.toHaveBeenCalled();
	});
});
