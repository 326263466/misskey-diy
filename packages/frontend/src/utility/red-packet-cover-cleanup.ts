/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { miLocalStorage } from '@/local-storage.js';
import { misskeyApi } from '@/utility/misskey-api.js';

const deleting = new Map<string, Promise<boolean>>();

export async function cleanupRedPacketCovers(account: { id: string; token?: string }, fileIds: string[] = []): Promise<boolean> {
	const key = `red-packet-cover-cleanup:${account.id}` as const;
	const read = (): string[] => {
		try {
			const saved: unknown = JSON.parse(miLocalStorage.getItem(key) ?? '[]');
			return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string' && id.length > 0) : [];
		} catch { return []; }
	};
	const ids = [...new Set([...read(), ...fileIds])];
	if (!ids.length) return true;
	try { miLocalStorage.setItem(key, JSON.stringify(ids)); } catch { return false; }
	const results = await Promise.all(ids.map(id => {
		const requestKey = `${account.id}:${id}`;
		const active = deleting.get(requestKey);
		if (active) return active;
		const request = (async () => {
			try {
				await misskeyApi('drive/files/delete', { fileId: id, ifUnusedForRedPacket: true }, account.token);
			} catch (error) {
				if ((error as { code?: string } | null)?.code !== 'NO_SUCH_FILE') return false;
			}
			try {
				const remaining = read().filter(value => value !== id);
				if (remaining.length) miLocalStorage.setItem(key, JSON.stringify(remaining));
				else miLocalStorage.removeItem(key);
			} catch { return false; }
			return true;
		})().finally(() => deleting.delete(requestKey));
		deleting.set(requestKey, request);
		return request;
	}));
	return results.every(Boolean);
}
