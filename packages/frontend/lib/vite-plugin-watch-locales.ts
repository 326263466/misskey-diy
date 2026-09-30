/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import path from 'node:path';
import { languages } from 'i18n/const';
import type { Plugin } from 'vite';
import meta from '../../../package.json' with { type: 'json' };

const localesDir = path.resolve(import.meta.dirname, '../../../built/_frontend_dist_/locales');

/**
 * 外部ファイルを監視し、必要に応じてwebSocketでメッセージを送るViteプラグイン
 */
export default function pluginWatchLocales(): Plugin {
	return {
		name: 'watch-locales',

		configureServer(server) {
			const localeJsonPaths = new Map(languages.map(lang => [path.join(localesDir, `${lang}.${meta.version}.json`), lang]));

			// 等生成的 JSON（含补充翻译）就绪后再重新加载
			server.watcher.add([...localeJsonPaths.keys()]);

			const onLocaleUpdated = (filePath: string) => {
				const lang = localeJsonPaths.get(path.resolve(filePath));
				if (lang != null) {
					server.ws.send({
						type: 'custom',
						event: 'locale-update',
						data: lang,
					});
				}
			};
			server.watcher.on('add', onLocaleUpdated);
			server.watcher.on('change', onLocaleUpdated);
			server.httpServer?.once('close', () => {
				server.watcher.off('add', onLocaleUpdated);
				server.watcher.off('change', onLocaleUpdated);
			});
		},
	};
}
