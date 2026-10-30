/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { entities } from 'misskey-js';

export type CommentSource = {
	type: 'article';
	articleId: string;
	authorId: string;
	count: number;
} | {
	type: 'note';
	note: entities.Note;
	threadAuthor?: entities.UserLite | null;
	initialCount?: number;
};
