/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import { formatUserAgent } from '@@/js/parse-user-agent.js';
import { i18n } from '@/i18n.js';
import { miLocalStorage } from '@/local-storage.js';
import * as os from '@/os.js';

type SigninAlert = Extract<Misskey.entities.Notification, { type: 'login' }> & { newNetwork: boolean };

/** 只有新版可疑登录通知带风险原因；旧通知和普通通知不弹窗。 */
export function isSigninAlert(notification: Misskey.entities.Notification): notification is SigninAlert {
	return notification.type === 'login' && notification.newNetwork != null;
}

export function formatSigninAlertSummary(notification: SigninAlert): string {
	const device = formatUserAgent(notification.userAgent) ?? i18n.ts._signinHistory.unknownDevice;
	return notification.ip != null ? `${device} · ${notification.ip}` : device;
}

let pending: SigninAlert | null = null;

/** 标签页隐藏时先暂存，回到前台再弹；多个标签页只由第一个回到前台的弹出。 */
export function showSigninAlert(notification: SigninAlert) {
	if (window.document.visibilityState !== 'visible') {
		pending = notification;
		return;
	}
	pending = null;
	if (miLocalStorage.getItem('lastSigninAlert') === notification.id) return;
	miLocalStorage.setItem('lastSigninAlert', notification.id);

	const reason = notification.newNetwork && notification.newDevice
		? i18n.ts._signinAlert.newDeviceAndNetwork
		: notification.newDevice ? i18n.ts._signinAlert.newDevice : i18n.ts._signinAlert.newNetwork;

	os.confirm({
		type: 'warning',
		title: i18n.ts._signinAlert.title,
		text: i18n.tsx._signinAlert.text({
			reason,
			device: formatUserAgent(notification.userAgent) ?? i18n.ts._signinHistory.unknownDevice,
			// 文本按 MFM 渲染，用行内代码避免 IPv6 的冒号被解析成表情。
			ip: notification.ip != null ? `\`${notification.ip}\`` : i18n.ts.unknown,
		}),
		okText: i18n.ts._signinAlert.notMe,
		cancelText: i18n.ts._signinAlert.itsMe,
	}).then(async ({ canceled }) => {
		if (canceled) return;
		const { mainRouter } = await import('@/router.js');
		mainRouter.push('/settings/security');
	});
}

window.document.addEventListener('visibilitychange', () => {
	if (pending != null) showSigninAlert(pending);
});
