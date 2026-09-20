/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Languages Loader
 */

import * as fs from 'node:fs';
import { load as loadYaml } from 'js-yaml';
import { languages, primaries } from './const.js';
import type { Locale } from './autogen/locale.js';
import type { ILocale, ParameterizedString } from './types.js';

type Language = typeof languages[number];

type PrimaryLang = keyof typeof primaries;

type Locales = Record<Language, ILocale>;

// Fill fork-specific translation gaps without editing Crowdin-managed YAML files.
const supplementalTranslations: Partial<Record<Language, ILocale>> = {
	'en-US': {
		_boost: { title: 'Boost', placeholder: 'Boost @{name}...' },
		viewsCount: 'Views',
		_likes: { title: 'Liked By', titleWithCount: 'Likes ({n})', liked: 'Liked', likedByOthers: 'and others liked', countOnly: '{n} likes' },
		deletedComment: 'This comment has been deleted',
		deletedNoteByAuthor: 'This post was deleted by its author',
		deletedNoteByCommunity: 'This post was deleted by community management',
		deletedCommentByAuthor: 'This comment was deleted by its author',
		deletedCommentByCommunity: 'This comment was deleted by community management',
		_permissions: { 'write:note-likes': 'Manage post likes' },
		_abuseReport: {
			selectReason: 'Select a reason for reporting',
			_reasons: {
				sexualContent: 'Sexual or obscene content',
				spam: 'Spam or advertising',
				scam: 'Scam or phishing',
				sensitivePolitics: 'Politically inflammatory content',
				harassment: 'Harassment or personal attacks',
				hateSpeech: 'Discrimination or hate speech',
				inciting: 'Inciting conflict or trolling',
				privacyViolation: 'Privacy violation',
				impersonation: 'Impersonation',
				copyrightViolation: 'Copyright or likeness infringement',
				other: 'Other reason',
			},
		},
	},
	'zh-CN': {
		_boost: { title: 'Boost', placeholder: 'Boost @{name}...' },
		viewsCount: '浏览量',
		deletedComment: '评论已被删除',
		deletedNoteByAuthor: '帖子被作者删除',
		deletedNoteByCommunity: '帖子被社区管理删除',
		deletedCommentByAuthor: '评论被作者删除',
		deletedCommentByCommunity: '评论被社区管理删除',
		_likes: { title: '点赞用户', titleWithCount: '点赞详情（{n}）', liked: '赞过', likedByOthers: '等人赞过', countOnly: '{n}人点赞' },
		_permissions: { 'write:note-likes': '操作帖子点赞' },
		_abuseReport: {
			selectReason: '请选择举报原因',
			_reasons: {
				sexualContent: '低俗色情',
				spam: '营销广告',
				scam: '信息诈骗',
				sensitivePolitics: '政治敏感',
				harassment: '人身攻击',
				hateSpeech: '歧视、仇恨言论',
				inciting: '引战、制造冲突',
				privacyViolation: '侵犯隐私',
				impersonation: '冒充他人',
				copyrightViolation: '侵犯名誉/著作/肖像权等',
				other: '其他原因',
			},
		},
	},
	'zh-TW': {
		_boost: { title: 'Boost', placeholder: 'Boost @{name}...' },
		viewsCount: '瀏覽次數',
		deletedComment: '留言已被刪除',
		deletedNoteByAuthor: '貼文被作者刪除',
		deletedNoteByCommunity: '貼文被社群管理刪除',
		deletedCommentByAuthor: '留言被作者刪除',
		deletedCommentByCommunity: '留言被社群管理刪除',
		_likes: { title: '按讚使用者', titleWithCount: '按讚詳情（{n}）', liked: '按過讚', likedByOthers: '等人按過讚', countOnly: '{n}人按讚' },
		_permissions: { 'write:note-likes': '操作貼文按讚' },
		_abuseReport: {
			selectReason: '請選擇檢舉原因',
			_reasons: {
				sexualContent: '低俗色情',
				spam: '行銷廣告',
				scam: '資訊詐騙',
				sensitivePolitics: '政治敏感',
				harassment: '人身攻擊',
				hateSpeech: '歧視、仇恨言論',
				inciting: '引戰、製造衝突',
				privacyViolation: '侵犯隱私',
				impersonation: '冒充他人',
				copyrightViolation: '侵犯名譽/著作/肖像權等',
				other: '其他原因',
			},
		},
	},
};

/**
 * オブジェクトを再帰的にマージする
 */
function merge<T extends ILocale>(...args: (T | ILocale | undefined)[]): T {
	return args.reduce<ILocale>((a, c) => ({
		...a,
		...c,
		...Object.entries(a)
			.filter(([k]) => c && typeof c[k] === 'object')
			.reduce<Record<string, ILocale[string]>>((acc, [k, v]) => {
				acc[k] = merge(v as ILocale, (c as ILocale)[k] as ILocale);
				return acc;
			}, {}),
	}), {} as ILocale) as T;
}

/**
 * 何故か文字列にバックスペース文字が混入することがあり、YAMLが壊れるので取り除く
 */
function clean (text: string) {
	return text.replace(new RegExp(String.fromCodePoint(0x08), 'g'), '');
}

/**
 * 空文字列が入ることがあり、フォールバックが動作しなくなるのでプロパティごと消す
 */
function removeEmpty<T extends ILocale>(obj: T): T {
	for (const [k, v] of Object.entries(obj)) {
		if (v === '') {
			delete obj[k];
		} else if (typeof v === 'object') {
			removeEmpty(v as ILocale);
		}
	}
	return obj;
}

function build(): Record<Language, Locale> {
	// vitestの挙動を調整するため、一度ローカル変数化する必要がある
	// https://github.com/vitest-dev/vitest/issues/3988#issuecomment-1686599577
	// https://github.com/misskey-dev/misskey/pull/14057#issuecomment-2192833785
	const metaUrl = import.meta.url;
	const locales = languages.reduce<Locales>((a, lang) => {
		a[lang] = merge(supplementalTranslations[lang] ?? {}, (loadYaml(clean(fs.readFileSync(new URL(`./locales/${lang}.yml`, metaUrl), 'utf-8'))) ?? {}) as ILocale);
		return a;
	}, {} as Locales);

	removeEmpty(locales);

	return Object.entries(locales).reduce<Record<Language, Locale>>((a, [k, v]) => {
		const lang = k.split('-')[0];
		const key = k as Language;

		switch (key) {
			case 'ja-JP':
				a[key] = v as Locale;
				break;
			case 'ja-KS':
			case 'en-US':
				a[key] = merge<Locale>(locales['ja-JP'] as Locale, v);
				break;
			default: {
				const primaryLang = lang as PrimaryLang;
				const primaryKey = (lang in primaries ? `${lang}-${primaries[primaryLang]}` : undefined) as Language | undefined;
				a[key] = merge<Locale>(
					locales['ja-JP'] as Locale,
					locales['en-US'],
					primaryKey ? locales[primaryKey] : {},
					v,
				);
				break;
			}
		}

		return a;
	}, {} as Record<Language, Locale>);
}

const locales = build() as {
	[lang: string]: Locale;
};

/**
 * フロントエンド用の locale JSON を書き出す
 * Service Worker が HTTP 経由で取得するために必要
 * @param destDir 出力先ディレクトリ（例: built/_frontend_dist_/locales）
 * @param version バージョン文字列（ファイル名とJSON内に埋め込まれる）
 */
async function writeFrontendLocalesJson(destDir: string, version: string): Promise<void> {
	const { mkdir, writeFile } = await import('node:fs/promises');
	const { resolve } = await import('node:path');

	await mkdir(destDir, { recursive: true });

	const builtLocales = build();
	const v = { '_version_': version };

	for (const [lang, locale] of Object.entries(builtLocales)) {
		await writeFile(
			resolve(destDir, `${lang}.${version}.json`),
			JSON.stringify({ ...locale, ...v }),
			'utf-8',
		);
	}
}

export { locales, languages, build, writeFrontendLocalesJson };
export type { Language, Locale, ILocale, ParameterizedString };
export default locales;
