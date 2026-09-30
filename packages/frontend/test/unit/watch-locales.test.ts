/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { EventEmitter } from 'node:events';
import path from 'node:path';
import { expect, test, vi } from 'vitest';
import type { ViteDevServer } from 'vite';
import pluginWatchLocales from '../../lib/vite-plugin-watch-locales.js';

test('notifies the client after generated locales are published and removes listeners on close', async () => {
	const watcher = Object.assign(new EventEmitter(), { add: vi.fn() });
	const httpServer = new EventEmitter();
	const send = vi.fn();
	const server = { watcher, httpServer, ws: { send } } as unknown as ViteDevServer;
	const hook = pluginWatchLocales().configureServer!;
	await (typeof hook === 'function' ? hook : hook.handler).call({} as never, server);
	const watchedPaths = watcher.add.mock.calls[0][0] as string[];
	const chineseLocale = watchedPaths.find(file => path.basename(file).startsWith('zh-CN.'))!;
	expect(chineseLocale).toBeDefined();

	watcher.emit('change', path.resolve('../../locales/ja-JP.yml'));
	watcher.emit('change', `${chineseLocale}.tmp`);
	expect(send).not.toHaveBeenCalled();

	for (const event of ['add', 'change']) {
		watcher.emit(event, chineseLocale);
		expect(send).toHaveBeenLastCalledWith({ type: 'custom', event: 'locale-update', data: 'zh-CN' });
	}
	expect(send).toHaveBeenCalledTimes(2);
	httpServer.emit('close');
	watcher.emit('change', chineseLocale);
	expect(send).toHaveBeenCalledTimes(2);
});
