/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

let valid = true;

interface LocaleRecord {
	[key: string]: string | LocaleRecord;
}

interface ErrorData {
	expected?: string;
	actual?: string;
	parameter?: string;
}

function writeError(type: string, lang: string, tree: string, data: ErrorData): void {
	process.stderr.write(JSON.stringify({ type, lang, tree, data }));
	process.stderr.write('\n');
	valid = false;
}

function verify(expected: LocaleRecord, actual: LocaleRecord, lang: string, trace?: string): void {
	for (const key in expected) {
		if (!Object.prototype.hasOwnProperty.call(actual, key)) {
			continue;
		}
		if (typeof expected[key] === 'object') {
			if (typeof actual[key] !== 'object') {
				writeError('mismatched_type', lang, trace ? `${trace}.${key}` : key, { expected: 'object', actual: typeof actual[key] });
				continue;
			}
			verify(expected[key] as LocaleRecord, actual[key] as LocaleRecord, lang, trace ? `${trace}.${key}` : key);
		} else if (typeof expected[key] === 'string') {
			switch (typeof actual[key]) {
				case 'object':
					writeError('mismatched_type', lang, trace ? `${trace}.${key}` : key, { expected: 'string', actual: 'object' });
					break;
				case 'undefined':
					continue;
				case 'string': {
					const expectedParameters = new Set((expected[key] as string).match(/\{[^}]+\}/g)?.map((s) => s.slice(1, -1)));
					const actualParameters = new Set((actual[key] as string).match(/\{[^}]+\}/g)?.map((s) => s.slice(1, -1)));
					for (const parameter of expectedParameters) {
						if (!actualParameters.has(parameter)) {
							writeError('missing_parameter', lang, trace ? `${trace}.${key}` : key, { parameter });
						}
					}
					for (const parameter of actualParameters) {
						if (!expectedParameters.has(parameter)) {
							writeError('unexpected_parameter', lang, trace ? `${trace}.${key}` : key, { parameter });
						}
					}
				}
			}
		}
	}
}

// 检查回退后的文案是否完整，不再要求某一译文独自覆盖日文源的全部键。
function requireComplete(expected: LocaleRecord, actual: LocaleRecord, lang: string, trace?: string): void {
	for (const key in expected) {
		const path = trace ? `${trace}.${key}` : key;
		if (!Object.prototype.hasOwnProperty.call(actual, key)) {
			writeError('missing_key', lang, path, {});
			continue;
		}
		if (typeof expected[key] === 'object' && typeof actual[key] === 'object') {
			requireComplete(expected[key] as LocaleRecord, actual[key] as LocaleRecord, lang, path);
		}
	}
}

// index.tsはtsのまま動かすことを想定していない（ビルド成果物を外部に公開する）.
// よってビルド後のものを検証する
const { locales } = await import('../built/index.js');
const { 'ja-JP': original } = locales;

if (!Object.prototype.hasOwnProperty.call(locales, 'ja-JP')) {
	throw new Error('Source locale ja-JP is missing');
}

const requestedLanguages = process.argv.slice(2);
const languages = requestedLanguages.length > 0 ? requestedLanguages : Object.keys(locales).filter(lang => lang !== 'ja-JP');

for (const lang of languages) {
	if (!Object.prototype.hasOwnProperty.call(locales, lang)) {
		writeError('unknown_language', lang, '', {});
		continue;
	}
	verify(original, locales[lang], lang);
	requireComplete(original, locales[lang], lang);
}

if (!valid) {
	process.exit(1);
}
