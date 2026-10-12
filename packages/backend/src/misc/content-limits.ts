/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { IdentifiableError } from '@/misc/identifiable-error.js';

export const contentTooLongError = {
	message: 'The input exceeds the character limit.',
	code: 'CONTENT_TOO_LONG',
	id: '8c286d89-1942-42f1-b0bc-0d760c5eb103',
} as const;

export function isContentTooLong(value: string | null | undefined, limit: number, previous?: string | null): boolean {
	// 收紧限制后，修改其他字段仍可保留原有长文本。
	return value != null && value !== previous && Array.from(value).length > limit;
}

export function assertContentLength(value: string | null | undefined, limit: number, previous?: string | null): void {
	if (isContentTooLong(value, limit, previous)) throw new IdentifiableError(contentTooLongError.id, contentTooLongError.message);
}

export function collectPageText(content: readonly Record<string, unknown>[]): string {
	// 合并嵌套区块，避免把正文拆成多个区块绕过总字数限制。
	const blocks: unknown[] = [...content].reverse();
	const texts: string[] = [];
	while (blocks.length > 0) {
		const block = blocks.pop();
		if (block == null || typeof block !== 'object') continue;
		if ('text' in block && typeof block.text === 'string') texts.push(block.text);
		if ('children' in block && Array.isArray(block.children)) blocks.push(...[...block.children].reverse());
	}
	return texts.join('');
}
