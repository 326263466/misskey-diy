/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export function searchExpression(query: string): RegExp | null {
	const text = query.trim();
	return text ? new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu') : null;
}

export function searchSnippet(text: string, query: string, length = 256): string {
	const match = searchExpression(query)?.exec(text);
	if (!match) return text.slice(0, length);
	const start = Math.max(0, match.index - Math.min(16, Math.floor(length / 3)));
	const end = Math.max(start + length, match.index + match[0].length);
	return `${start ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

export function searchRanges(root: HTMLElement, query: string): Range[] {
	const expression = searchExpression(query);
	if (!expression) return [];
	const ranges: Range[] = [];
	const excluded = 'script, style, button, input, textarea, select, img, svg, canvas, video, audio, [hidden], [aria-hidden="true"]';
	for (const target of root.querySelectorAll<HTMLElement>('[data-search-highlight]')) {
		if (target.closest(excluded)) continue;
		let nodes: { node: Text; start: number; end: number }[] = [];
		let text = '';
		const flush = () => {
			expression.lastIndex = 0;
			let firstIndex = 0;
			for (const match of text.matchAll(expression)) {
				const end = match.index + match[0].length;
				while (nodes[firstIndex].end <= match.index) firstIndex++;
				let lastIndex = firstIndex;
				while (nodes[lastIndex].end < end) lastIndex++;
				const first = nodes[firstIndex];
				const last = nodes[lastIndex];
				const range = root.ownerDocument.createRange();
				range.setStart(first.node, match.index - first.start);
				range.setEnd(last.node, end - last.start);
				ranges.push(range);
			}
			nodes = [];
			text = '';
		};
		const visit = (node: Node) => {
			if (node.nodeType === Node.TEXT_NODE) {
				const start = text.length;
				text += node.textContent ?? '';
				nodes.push({ node: node as Text, start, end: text.length });
			} else if (node.nodeType === Node.ELEMENT_NODE) {
				const element = node as Element;
				if (element.matches(excluded)) {
					flush();
					return;
				}
				// 只跨连续行内文本，避免 Range 越过控件或把换行两端拼成假命中。
				const boundary = /^(BR|HR|DIV|P|H[1-6]|PRE|BLOCKQUOTE|UL|OL|LI|TABLE|TR|TD|TH|SECTION|ARTICLE)$/.test(element.tagName);
				if (boundary) flush();
				for (const child of element.childNodes) visit(child);
				if (boundary) flush();
			}
		};
		visit(target);
		flush();
	}
	return ranges;
}
