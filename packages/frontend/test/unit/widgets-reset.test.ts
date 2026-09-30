/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/vue';
import type { DefaultStoredWidget } from '@/components/MkWidgets.vue';
import Widgets from '@/ui/_common_/widgets.vue';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';

vi.mock('@/os.js', () => ({}));
vi.mock('@/components/MkWidgets.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/preferences.js', async () => {
	const { ref } = await import('vue');
	const widgets = ref<DefaultStoredWidget[]>([]);
	return {
		prefer: {
			r: { widgets },
			s: { get widgets() { return widgets.value; } },
			commit: vi.fn((_key: string, value: DefaultStoredWidget[]) => { widgets.value = value; }),
		},
	};
});

const savedWidgets: DefaultStoredWidget[] = [
	{ name: 'memo', id: 'left-memo', place: 'left', data: { text: 'Keep my memo' } },
	{ name: 'onlineUsers', id: 'right-online', place: 'right', data: { transparent: true } },
	{ name: 'notifications', id: 'legacy-notifications', place: null, data: { height: 200 } },
];

describe('reset widgets', () => {
	beforeEach(() => {
		prefer.commit('widgets', structuredClone(savedWidgets));
		vi.clearAllMocks();
	});

	afterEach(async () => {
		const exit = screen.queryByRole('button', { name: i18n.ts.editWidgetsExit });
		if (exit) await fireEvent.click(exit);
		cleanup();
	});

	test.each(['left', 'right', null] as const)('restores the complete initial layout from the %s widget area', async place => {
		const view = render(Widgets, { props: { place } });
		expect(view.queryByRole('button', { name: i18n.ts.resetToDefaultValue })).toBeNull();
		await fireEvent.click(view.getByTestId('widget-edit'));
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.resetToDefaultValue }));
		expect(prefer.commit).toHaveBeenCalledTimes(1);

		const restoredWidgets = prefer.s.widgets;
		expect(restoredWidgets.map(widget => widget.name)).toEqual(['clock', 'calendar', 'trends']);
		expect(restoredWidgets.every(widget => widget.place === 'right' && Object.keys(widget.data).length === 0)).toBe(true);
		expect(new Set(restoredWidgets.map(widget => widget.id)).size).toBe(3);
		expect(restoredWidgets.every(widget => !savedWidgets.some(saved => saved.id === widget.id))).toBe(true);
	});
});
