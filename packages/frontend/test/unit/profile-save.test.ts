/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { enqueueProfileSave } from '@/utility/profile-save.js';

describe('profile save queue', () => {
	test('evaluates read-modify-write tasks after previous confirmed state is applied', async () => {
		let complete!: () => void;
		const account = { decorations: ['first'] };
		const first = enqueueProfileSave(async () => {
			await new Promise<void>(resolve => { complete = resolve; });
			account.decorations = [...account.decorations, 'second'];
		});
		const next = vi.fn(async () => {
			account.decorations = [...account.decorations, 'third'];
		});
		const second = enqueueProfileSave(next);
		await vi.waitFor(() => expect(complete).toBeDefined());
		expect(next).not.toHaveBeenCalled();
		complete();
		await Promise.all([first, second]);
		expect(account.decorations).toEqual(['first', 'second', 'third']);
	});

	test('reports a failed save to its caller without blocking the next task', async () => {
		const failure = new Error('offline');
		const first = enqueueProfileSave(async () => { throw failure; });
		const second = enqueueProfileSave(async () => 'saved');
		await expect(first).rejects.toBe(failure);
		await expect(second).resolves.toBe('saved');
	});
});
