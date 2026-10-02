/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import MkDataCell from '@/components/grid/MkDataCell.vue';
import { createCell } from '@/components/grid/cell.js';
import { createColumn } from '@/components/grid/column.js';
import { createRow } from '@/components/grid/row.js';
import { GridEventEmitter } from '@/components/grid/grid.js';

const mocks = vi.hoisted(() => ({ popup: vi.fn().mockReturnValue({ dispose: vi.fn() }) }));
vi.mock('@/os.js', () => ({ popup: mocks.popup }));
vi.mock('@/components/MkDialog.vue', () => ({ default: {} }));
vi.mock('@/composables/use-tooltip.js', () => ({ useTooltip: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

test.each([false, true])('grid uses the project date dialog and handles canceled=%s', async canceled => {
	const column = createColumn({ bindTo: 'date', title: 'Date', type: 'date', width: 180, editable: true }, 0);
	const cell = createCell(column, createRow(0, true, {}), '2026-10-01', {});
	cell.selected = true;
	const view = render(MkDataCell, { props: { cell, rowSetting: {}, bus: new GridEventEmitter() } });
	const root = view.container.querySelector('[data-grid-cell]')!;
	await fireEvent.dblClick(root);
	expect(view.container.querySelector('input[type="date"]')).toBeNull();
	expect(mocks.popup.mock.calls[0][1]).toMatchObject({ input: { type: 'date', default: '2026-10-01' } });
	mocks.popup.mock.calls[0][2].done({ canceled, result: canceled ? undefined : '2026-10-02' });
	await nextTick();
	expect(view.emitted('operation:endEdit')).toHaveLength(1);
	if (canceled) expect(view.emitted('change:value')).toBeUndefined();
	else expect(view.emitted('change:value')?.[0][1]).toBe('2026-10-02');
	expect(document.activeElement).toBe(root);
});
