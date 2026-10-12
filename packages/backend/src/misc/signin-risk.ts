/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ipaddr from 'ipaddr.js';
import { parseUserAgent } from '@/misc/parse-user-agent.js';

export type SigninFingerprint = {
	ip: string;
	userAgent: string | null;
};

export type SigninRisk = {
	newNetwork: boolean;
	newDevice: boolean;
};

export const SIGNIN_USER_AGENT_MAX_LENGTH = 512;

/** 返回规范化后的 IP；无法解析时返回 null，避免把伪造的转发头原样展示。 */
export function normalizeIp(ip: string): string | null {
	if (!ipaddr.isValid(ip)) return null;
	return ipaddr.process(ip).toString();
}

/** 同一运营商动态分配的地址视为同一网络：IPv4 取 /16，IPv6 取 /64。 */
export function getNetworkKey(ip: string): string {
	if (!ipaddr.isValid(ip)) return `raw:${ip}`;
	const addr = ipaddr.process(ip);
	if (addr.kind() === 'ipv4') {
		return `v4:${addr.toByteArray().slice(0, 2).join('.')}`;
	}
	return `v6:${(addr as ipaddr.IPv6).parts.slice(0, 4).map(part => part.toString(16)).join(':')}`;
}

/**
 * 能识别的浏览器只取“浏览器名 + 系统 + 设备类型”，浏览器、系统或 App 升级不算新设备。
 * 内嵌浏览器的 UA 带有随版本变化的十六进制和构建号，不能直接比较原文。
 */
export function getDeviceKey(userAgent: string | null): string {
	if (userAgent == null || userAgent.trim() === '') return '';
	const { browser, os, device } = parseUserAgent(userAgent);
	if (browser != null || os != null) {
		return [browser?.replace(/ \d+$/, ''), os, device].join('|');
	}
	return userAgent
		.replace(/\(?0x[0-9a-f]+\)?|[0-9a-f]{7,}|\d+(?:[._]\d+)*/gi, '')
		.replace(/\s+/g, ' ')
		.trim();
}

/** 没有成功登录记录时视为首次登录，不提醒；否则网络或设备任一陌生就提醒。 */
export function assessSigninRisk(current: SigninFingerprint, history: SigninFingerprint[]): SigninRisk | null {
	if (history.length === 0) return null;

	const networkKey = getNetworkKey(current.ip);
	const deviceKey = getDeviceKey(current.userAgent);
	const newNetwork = !history.some(signin => getNetworkKey(signin.ip) === networkKey);
	const newDevice = !history.some(signin => getDeviceKey(signin.userAgent) === deviceKey);

	return newNetwork || newDevice ? { newNetwork, newDevice } : null;
}
