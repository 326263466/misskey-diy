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

const session = vi.hoisted(() => ({ signedIn: true }));
vi.mock('@/i.js', () => ({ get $i() { return session.signedIn ? { id: 'self' } : null; } }));
vi.mock('@/os.js', () => ({}));
vi.mock('@/components/MkWidgets.vue', () => ({ default: {
	props: ['widgets', 'readOnly', 'edit'],
	setup() { return { i18n }; },
	template: '<div data-testid="widgets" :data-readonly="readOnly" :data-edit="edit"><template v-if="edit && !readOnly"><button @click="$emit(\'reset\')">{{ i18n.ts.resetToDefaultValue }}</button><button @click="$emit(\'exit\')">{{ i18n.ts.editWidgetsExit }}</button><button data-testid="choose-memo" @click="$emit(\'addWidget\', { name: \'memo\', id: \'added-memo\', data: {} })">Add memo</button></template><span v-for="widget in widgets">{{ widget.name }}</span></div>',
} }));
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
		session.signedIn = true;
		prefer.commit('widgets', structuredClone(savedWidgets));
		vi.clearAllMocks();
	});

	test('shows only readonly public defaults to guests, ignoring saved private widgets', () => {
		session.signedIn = false;
		const view = render(Widgets);
		expect(view.queryByTestId('widget-edit')).toBeNull();
		expect(view.getByTestId('widgets').getAttribute('data-readonly')).toBe('true');
		expect(view.getByTestId('widgets').getAttribute('data-edit')).toBe('false');
		expect(view.getByTestId('widgets').textContent).toBe('clockcalendartrends');
		expect(prefer.commit).not.toHaveBeenCalled();
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

	test.each(['left', 'right', null] as const)('adds a selected widget to the %s area without replacing existing widgets', async place => {
		const view = render(Widgets, { props: { place } });
		await fireEvent.click(view.getByTestId('widget-edit'));
		await fireEvent.click(view.getByTestId('choose-memo'));
		expect(prefer.s.widgets).toEqual([{ name: 'memo', id: 'added-memo', data: {}, place }, ...savedWidgets]);
	});
});
