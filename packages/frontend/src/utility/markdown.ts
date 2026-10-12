/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import sanitizeHtml from 'sanitize-html';

export function sanitizeMarkdown(html: string): string {
	return sanitizeHtml(html, {
		allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'input', 'details', 'summary'],
		allowedAttributes: {
			h1: ['id'], h2: ['id'], h3: ['id'], h4: ['id'], h5: ['id'], h6: ['id'],
			a: ['href', 'title'],
			img: ['data-image-src', 'data-image-lazy', 'alt', 'title', 'width', 'height'],
			code: ['class'],
			pre: ['class'],
			div: ['class'],
			details: ['class', 'open'],
			summary: ['class'],
			span: ['class'],
			input: ['type', 'checked', 'disabled'],
			th: ['align'],
			td: ['align'],
		},
		allowedClasses: { div: [/^md-editor-/], details: [/^md-editor-/], summary: [/^md-editor-/] },
		allowedSchemes: ['http', 'https', 'mailto'],
		allowedSchemesAppliedToAttributes: [...sanitizeHtml.defaults.allowedSchemesAppliedToAttributes, 'data-image-src'],
		allowProtocolRelative: false,
		transformTags: {
			// 在插入 HTML 前门控图片，同时对延后的图源保留协议检查。
			img: (_tag, attrs) => ({ tagName: 'img', attribs: { ...attrs, 'data-image-src': attrs.src ?? '', 'data-image-lazy': '' } }),
			input: (_tag, attrs) => ({ tagName: 'input', attribs: { type: 'checkbox', disabled: '', ...(attrs.checked != null ? { checked: '' } : {}) } }),
		},
	});
}
