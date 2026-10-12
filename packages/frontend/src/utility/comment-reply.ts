/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ref } from 'vue';

// 同一时间只在一条评论下展开回复框，打开另一条时自动收起前一条。
export const activeCommentReplyId = ref<string | null>(null);
