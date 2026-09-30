/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const interactiveSelector = [
	'a', 'button', 'input', 'select', 'textarea', 'label', 'summary', 'details',
	'audio', 'video', 'iframe', 'canvas', 'img', 'span[alt]',
	'[role="button"]', '[role="link"]', '[role="checkbox"]', '[role="radio"]',
	'[role="switch"]', '[role="slider"]', '[role="tab"]', '[role="menuitem"]',
	'[role="option"]', '[role="textbox"]', '[role="combobox"]',
	'[tabindex]', '[contenteditable]:not([contenteditable="false"])',
	'[data-note-interactive]', '[data-note-card]', '._button',
].join(',');

/** Only the card's otherwise inert surface should act as a detail link. */
export function shouldOpenNote(event: MouseEvent, root: HTMLElement | null | undefined): boolean {
	if (!root || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.detail > 1) return false;
	const selection = root.ownerDocument.getSelection();
	if (selection && !selection.isCollapsed) return false;

	// Inspect the actual bubbling path, including SVG and shadow DOM children.
	// Do not cancel events: descendants keep their own handlers and defaults.
	for (const element of event.composedPath()) {
		if (element === root) return true;
		if (!(element instanceof Element)) continue;
		if (element.matches(interactiveSelector)) return false;
		if (element instanceof HTMLElement && element.onclick != null) return false;
	}
	return false;
}
