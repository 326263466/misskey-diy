/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { entities } from 'misskey-js';
import type { Router } from '@/router.js';
import { getLinkMenu } from '@/components/global/MkA.vue';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';

export function getArticleMenu(article: entities.Page, router: Router, context: 'list' | 'detail' = 'list') {
	const menu = getLinkMenu(`/articles/${article.id}`, router);
	if (context === 'detail' && $i && article.user.host == null && article.userId !== $i.id) {
		menu.push({ type: 'divider' }, {
			icon: 'ti ti-heart-handshake',
			text: i18n.ts._tip.title,
			action: async () => {
				const { dispose } = await os.popupAsyncWithDialog(import('@/components/MkTipDialog.vue').then(module => module.default), {
					recipient: article.user,
					target: { type: 'page', id: article.id, title: article.title },
				}, { closed: () => dispose() });
			},
		});
	}
	return menu;
}
