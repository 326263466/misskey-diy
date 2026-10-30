/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { url } from '@@/js/config.js';
import type * as Misskey from 'misskey-js';
import type { ComponentProps } from 'vue-component-type-helpers';
import type MkAbuseReportWindow from '@/components/MkAbuseReportWindow.vue';
import type { MenuButton } from '@/types/menu.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';

type ReportedMessage = { id: string; text?: string | null; user: Misskey.entities.UserLite };

// 举报统一从这里发起，调用方只提供被举报的内容，类型、链接和说明在此生成。
export type AbuseReportTarget =
	| { type: 'user'; user: Misskey.entities.UserLite }
	| { type: 'note'; note: Misskey.entities.Note }
	| { type: 'chat'; message: ReportedMessage }
	| { type: 'page'; page: Misskey.entities.Page }
	| { type: 'article'; article: Misskey.entities.Page }
	| { type: 'article_comment'; articleId: string; comment: ReportedMessage }
	| { type: 'gallery'; post: Misskey.entities.GalleryPost }
	| { type: 'play'; flash: Misskey.entities.Flash };

/** 被举报内容的作者；不能举报自己的内容。 */
export function getReportedUser(target: AbuseReportTarget): Misskey.entities.UserLite {
	switch (target.type) {
		case 'user': return target.user;
		case 'note': return target.note.user;
		case 'chat': return target.message.user;
		case 'page': return target.page.user;
		case 'article': return target.article.user;
		case 'article_comment': return target.comment.user;
		case 'gallery': return target.post.user;
		case 'play': return target.flash.user;
	}
}

function describe(target: AbuseReportTarget): ComponentProps<typeof MkAbuseReportWindow> {
	switch (target.type) {
		case 'user': return { user: target.user, reportTarget: { reportType: 'user' } };
		case 'note': return {
			user: target.note.user,
			reportTarget: { reportType: 'note', targetId: target.note.id },
			context: { label: i18n.ts._abuseReport._linkLabels.localNote, text: target.note.text, url: `${url}/notes/${target.note.id}`, sourceUrl: target.note.url ?? target.note.uri ?? undefined },
		};
		case 'chat': return {
			user: target.message.user,
			reportTarget: { reportType: 'chat', targetId: target.message.id },
			context: { label: i18n.ts._chat.messages, text: target.message.text, url: `${url}/chat/messages/${target.message.id}` },
		};
		case 'page': return {
			user: target.page.user,
			reportTarget: { reportType: 'page', targetId: target.page.id },
			context: { label: i18n.ts.pages, text: target.page.title, url: `${url}/@${target.page.user.username}/pages/${target.page.name}` },
		};
		case 'article': return {
			user: target.article.user,
			reportTarget: { reportType: 'article', targetId: target.article.id },
			context: { label: i18n.ts._article.article, text: target.article.title, url: `${url}/articles/${target.article.id}` },
		};
		case 'article_comment': return {
			user: target.comment.user,
			reportTarget: { reportType: 'article_comment', targetId: target.comment.id },
			context: { label: i18n.ts._article.comment, text: target.comment.text, url: `${url}/articles/${target.articleId}#comment-${target.comment.id}` },
		};
		case 'gallery': return {
			user: target.post.user,
			reportTarget: { reportType: 'gallery', targetId: target.post.id },
			context: { label: i18n.ts.gallery, text: target.post.title, url: `${url}/gallery/${target.post.id}` },
		};
		case 'play': return {
			user: target.flash.user,
			reportTarget: { reportType: 'play', targetId: target.flash.id },
			context: { label: target.flash.title, url: `${url}/play/${target.flash.id}` },
		};
	}
}

export async function openAbuseReport(target: AbuseReportTarget): Promise<void> {
	const { dispose } = await os.popupAsyncWithDialog(import('@/components/MkAbuseReportWindow.vue').then(x => x.default), describe(target), {
		closed: () => dispose(),
	});
}

// 菜单项和页面按钮共用同一个图标；不用感叹号圆圈，避免和右下角“关于”的 info-circle 相像。
export const ABUSE_REPORT_ICON = 'ti ti-flag';

/** 菜单里的举报项。`canReport` 在点击时再确认一次，内容已失效时不打开举报窗口。 */
export function getAbuseReportMenu(target: AbuseReportTarget, canReport?: () => boolean): MenuButton {
	return {
		icon: ABUSE_REPORT_ICON,
		text: i18n.ts.reportAbuse,
		action: async () => {
			if (canReport && !canReport()) return;
			await openAbuseReport(target);
		},
	};
}
