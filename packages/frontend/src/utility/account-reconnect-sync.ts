/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

type ReconnectStream = {
	on(event: '_connected_' | '_disconnected_', listener: () => void): unknown;
	off(event: '_connected_' | '_disconnected_', listener: () => void): unknown;
};

// One listener pair per application, never one fetch per profile component.
export function initializeAccountReconnectSync(stream: ReconnectStream, refresh: () => Promise<unknown>): () => void {
	let needsRefresh = false;
	let connected = false;
	let refreshing = false;
	let disposed = false;
	let retryCount = 0;
	let retryTimer: number | undefined;
	const retryDelays = [1000, 3000, 10000];

	function clearRetry() {
		if (retryTimer === undefined) return;
		window.clearTimeout(retryTimer);
		retryTimer = undefined;
	}

	async function sync() {
		if (refreshing) return;
		refreshing = true;
		try {
			while (needsRefresh && connected && !disposed) {
				needsRefresh = false;
				try {
					await refresh();
					retryCount = 0;
					clearRetry();
				} catch {
					// A newer reconnect still requires its own refresh after this request.
					if (needsRefresh && connected && !disposed) continue;
					needsRefresh = true;
					if (connected && !disposed && retryCount < retryDelays.length) {
						retryTimer = window.setTimeout(() => {
							retryTimer = undefined;
							void sync();
						}, retryDelays[retryCount++]);
					}
					// Stop after three retries; a new reconnect starts a fresh budget.
					break;
				}
			}
		} finally {
			refreshing = false;
		}
	}

	function onDisconnected() {
		connected = false;
		needsRefresh = true;
		retryCount = 0;
		clearRetry();
	}

	function onConnected() {
		if (connected || disposed) return;
		connected = true;
		void sync();
	}

	stream.on('_disconnected_', onDisconnected);
	stream.on('_connected_', onConnected);
	return () => {
		disposed = true;
		clearRetry();
		stream.off('_disconnected_', onDisconnected);
		stream.off('_connected_', onConnected);
	};
}
