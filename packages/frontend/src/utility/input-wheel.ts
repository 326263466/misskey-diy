/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** 数字框聚焦时滚轮以整数步长调节，手动输入仍允许原有的小数精度。 */
export function initializeInputWheel(document: Document = window.document): () => void {
	function onWheel(event: WheelEvent) {
		const input = event.target;
		if (!(input instanceof HTMLInputElement) || input.type !== 'number' || document.activeElement !== input || input.disabled || input.readOnly || event.ctrlKey || event.metaKey || event.deltaY === 0 || event.defaultPrevented) return;
		event.preventDefault();
		const current = input.valueAsNumber;
		if (!Number.isFinite(current)) return;
		const step = Math.max(1, Number(input.step) || 1);
		const min = input.min === '' ? -Infinity : Number(input.min);
		const max = input.max === '' ? Infinity : Number(input.max);
		const next = Math.min(Number.isFinite(max) ? max : Infinity, Math.max(Number.isFinite(min) ? min : -Infinity, Number((current - Math.sign(event.deltaY) * step).toPrecision(15))));
		if (next === current) return;
		input.valueAsNumber = next;
		input.dispatchEvent(new Event('input', { bubbles: true }));
	}

	document.addEventListener('wheel', onWheel, { passive: false });
	return () => document.removeEventListener('wheel', onWheel);
}
