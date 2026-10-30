/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const ownedDrafts = new Set<string>();
const closedPrefix = 'misskey:closedDraftSession:';

export function createDraftSession(accountId: string, options: { transient?: boolean } = {}) {
	let id = `composer:${crypto.randomUUID()}`;
	let disposed = false;
	let generation = 0;
	let persisted = false;
	let releaseOwnership = () => {};
	const closedKey = (sessionId: string) => `${closedPrefix}${accountId}:${sessionId}`;

	function isClosed(sessionId: string): boolean {
		try {
			return Number(localStorage.getItem(closedKey(sessionId))) > Date.now();
		} catch { return false; }
	}

	function claim(sessionId: string): Promise<(() => void) | null> {
		const expectedGeneration = generation;
		const key = `misskey:draftSession:${accountId}:${sessionId}:owner`;
		if (!navigator.locks) {
			// 无跨窗口锁时使用独立 ID，不能覆盖其他窗口的草稿。
			if (sessionId !== id || ownedDrafts.has(key)) return Promise.resolve(null);
			ownedDrafts.add(key);
			return Promise.resolve(() => { ownedDrafts.delete(key); });
		}
		return new Promise(resolve => {
			void navigator.locks.request(key, { ifAvailable: true }, async lock => {
				if (!lock || disposed || expectedGeneration !== generation) { resolve(null); return; }
				let release!: () => void;
				const released = new Promise<void>(done => { release = done; });
				resolve(release);
				await released;
			}).catch(() => resolve(null));
		});
	}

	function acquireCurrent(): Promise<void> {
		const expectedGeneration = generation;
		return claim(id).then(release => {
			if (!release) return;
			if (disposed || expectedGeneration !== generation) release();
			else releaseOwnership = release;
		});
	}

	let ownershipReady = acquireCurrent();

	function restore(sessionId: unknown): Promise<void> {
		const previous = ownershipReady;
		const expectedGeneration = generation;
		const restored = (async () => {
			await previous;
			if (disposed || expectedGeneration !== generation || typeof sessionId !== 'string' || !/^composer:[a-zA-Z0-9_-]+$/.test(sessionId) || sessionId.length > 100 || sessionId === id || isClosed(sessionId)) return;
			const releasePrevious = releaseOwnership;
			const release = await claim(sessionId);
			if (!release) return;
			if (disposed || expectedGeneration !== generation) { release(); return; }
			releasePrevious();
			releaseOwnership = release;
			id = sessionId;
			persisted = true;
		})();
		ownershipReady = restored;
		return restored;
	}

	function release() {
		if (persisted) {
			try { localStorage.setItem(closedKey(id), String(Date.now() + 30 * 24 * 60 * 60 * 1000)); } catch { /* 存储失败不阻止清空表单，新草稿仍使用独立 ID。 */ }
		}
		generation++;
		releaseOwnership();
		id = `composer:${crypto.randomUUID()}`;
		persisted = false;
		ownershipReady = acquireCurrent();
	}

	const onPageHide = (event: PageTransitionEvent) => {
		if (!persisted && !event.persisted) release();
	};
	window.addEventListener('pagehide', onPageHide);

	return {
		get id() { return id; },
		markPersisted() { if (!options.transient) persisted = true; },
		restore,
		release,
		dispose: () => {
			disposed = true;
			releaseOwnership();
			window.removeEventListener('pagehide', onPageHide);
		},
	};
}
