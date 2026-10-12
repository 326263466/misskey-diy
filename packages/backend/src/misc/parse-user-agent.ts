/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// 与 packages/frontend-shared/js/parse-user-agent.ts 保持一致；后端无法引用前端共享包。

export type ParsedUserAgent = {
	browser: string | null;
	os: string | null;
	device: 'smartphone' | 'tablet' | 'desktop' | null;
};

// 套壳浏览器的 UA 同时含有 Chrome / Safari，必须排在通用规则之前。
const BROWSERS: [name: string, pattern: RegExp][] = [
	['WeChat', /MicroMessenger\/(\d+)/],
	['QQ Browser', /M?QQBrowser\/(\d+)/],
	['UC Browser', /UCBrowser\/(\d+)/],
	['Quark', /Quark\/(\d+)/],
	['Huawei Browser', /HuaweiBrowser\/(\d+)/],
	['Mi Browser', /MiuiBrowser\/(\d+)/],
	['Samsung Internet', /SamsungBrowser\/(\d+)/],
	['Edge', /(?:Edg|EdgA|EdgiOS|Edge)\/(\d+)/],
	['Opera', /(?:OPR|OPT|Opera)\/(\d+)/],
	['Vivaldi', /Vivaldi\/(\d+)/],
	['Firefox', /(?:Firefox|FxiOS)\/(\d+)/],
	['Chrome', /(?:Chrome|CriOS)\/(\d+)/],
	['Safari', /Version\/(\d+)[^ ]* (?:Mobile\/\S+ )?Safari\//],
];

// iOS / Android 的 UA 也含有 Mac OS X / Linux，顺序不能调换。
// 浏览器已冻结 UA 中的系统版本号，这里只识别系统名称。
const OSES: [name: string, pattern: RegExp][] = [
	['HarmonyOS', /HarmonyOS|OpenHarmony/],
	['iPadOS', /iPad/],
	['iOS', /iPhone|iPod/],
	['Android', /Android/],
	['Windows', /Windows/],
	['ChromeOS', /CrOS/],
	['macOS', /Macintosh|Mac OS X/],
	['Linux', /Linux|X11/],
];

function parseDevice(ua: string): ParsedUserAgent['device'] {
	if (/iPad|Tablet/.test(ua)) return 'tablet';
	if (/Mobile|iPhone|iPod/.test(ua)) return 'smartphone';
	// Android 平板的 UA 不含 Mobile。
	if (/Android/.test(ua)) return 'tablet';
	if (/Windows|Macintosh|CrOS|X11|Linux/.test(ua)) return 'desktop';
	return null;
}

export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
	if (ua == null || ua.trim() === '') return { browser: null, os: null, device: null };

	let browser: string | null = null;
	for (const [name, pattern] of BROWSERS) {
		const match = pattern.exec(ua);
		if (match) {
			browser = `${name} ${match[1]}`;
			break;
		}
	}

	return {
		browser,
		os: OSES.find(([, pattern]) => pattern.test(ua))?.[0] ?? null,
		device: parseDevice(ua),
	};
}

/** 返回“浏览器 · 系统”，都识别不出时返回 null。 */
export function formatUserAgent(ua: string | null | undefined): string | null {
	const { browser, os } = parseUserAgent(ua);
	const parts = [browser, os].filter(part => part != null);
	return parts.length > 0 ? parts.join(' · ') : null;
}
