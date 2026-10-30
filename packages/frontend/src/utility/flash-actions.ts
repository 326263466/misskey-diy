/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Misskey from 'misskey-js';
import { url } from '@@/js/config.js';
import type { MenuItem } from '@/types/menu.js';
import type { Router } from '@/router.js';
import * as os from '@/os.js';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import { openShareDialog } from '@/utility/share-dialog.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { pleaseLogin } from '@/utility/please-login.js';
import { getAbuseReportMenu } from '@/utility/abuse-report.js';
import { globalEvents } from '@/events.js';

// 列表弹窗和详情页共用同一套操作；传入响应式对象，点赞状态直接写回，两处显示一致。

export function getFlashUrl(flash: Misskey.entities.Flash): string {
	return `${url}/play/${flash.id}`;
}

export async function toggleFlashLike(flash: Misskey.entities.Flash): Promise<void> {
	const isLoggedIn = await pleaseLogin();
	if (!isLoggedIn) return;

	if (flash.isLiked) {
		const { canceled } = await os.confirm({
			type: 'warning',
			text: i18n.ts.unlikeConfirm,
		});
		if (canceled) return;
	}

	// 失败时 apiWithDialog 已提示错误，这里保持原状态。
	const liked = !flash.isLiked;
	try {
		await os.apiWithDialog(liked ? 'flash/like' : 'flash/unlike', { flashId: flash.id });
	} catch {
		return;
	}
	flash.isLiked = liked;
	flash.likedCount += liked ? 1 : -1;
}

export function shareFlash(flash: Misskey.entities.Flash): void {
	openShareDialog({
		title: flash.title,
		text: flash.summary,
		url: getFlashUrl(flash),
	}, {
		shareWithNote: () => {
			os.post({
				initialText: `${flash.title}\n${getFlashUrl(flash)}`,
				instant: true,
			});
		},
	});
}

export function getFlashMenu(flash: Misskey.entities.Flash, router: Router, options: {
	/** 弹窗中提供“在主页面打开”，详情页本身不需要 */
	showInPage?: boolean;
	/** 跳转或删除前先关闭弹窗 */
	beforeLeave?: () => void;
	onDeleted?: () => void;
} = {}): MenuItem[] {
	const menu: MenuItem[] = [];

	if (options.showInPage) {
		menu.push({
			icon: 'ti ti-player-eject',
			text: i18n.ts.showInPage,
			action: () => {
				options.beforeLeave?.();
				router.push('/play/:id', { params: { id: flash.id } });
			},
		});
	}

	menu.push({
		icon: 'ti ti-link',
		text: i18n.ts.copyUrl,
		action: () => copyToClipboard(getFlashUrl(flash)),
	});

	if ($i != null && $i.id === flash.userId) {
		menu.push({
			icon: 'ti ti-pencil',
			text: i18n.ts._play.editThisPage,
			action: () => {
				options.beforeLeave?.();
				router.push('/play/:id/edit', { params: { id: flash.id } });
			},
		});
	} else if ($i != null) {
		menu.push(getAbuseReportMenu({ type: 'play', flash }));
		if ($i.isModerator || $i.isAdmin) {
			menu.push({ type: 'divider' }, {
				icon: 'ti ti-trash',
				text: i18n.ts.delete,
				danger: true,
				action: async () => {
					const { canceled } = await os.confirm({
						type: 'warning',
						text: i18n.ts.deleteConfirm,
					});
					if (canceled) return;

					try {
						await os.apiWithDialog('flash/delete', { flashId: flash.id });
					} catch {
						return;
					}
					os.toast(i18n.ts._play.deleted, 'success');
					globalEvents.emit('flashDeleted', flash.id);
					options.onDeleted?.();
				},
			});
		}
	}

	return menu;
}
