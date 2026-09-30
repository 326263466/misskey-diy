/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/vue';
import { defineComponent, h, nextTick, ref } from 'vue';
import WidgetTodo from '@/widgets/WidgetTodo.vue';
import { i18n } from '@/i18n.js';

vi.mock('@/os.js', () => ({}));
vi.mock('@/components/MkContainer.vue', () => ({ default: {
	template: '<section><slot name="header"/><slot/></section>',
} }));

type Item = { id: string; text: string; completed: boolean };
type SavedTodo = { items: Item[]; showHeader: boolean; transparent: boolean };

function renderTodo(items: Item[] = []) {
	const saved: SavedTodo[] = [];
	const data = ref({ items });
	const view = render(defineComponent({
		setup: () => () => h(WidgetTodo, {
			widget: { id: 'todo', data: data.value },
			onUpdateProps: settings => saved.push(settings),
		}),
	}), { global: { directives: { 'adaptive-border': {}, tooltip: {} } } });
	return { ...view, saved, data };
}

describe('todo widget', () => {
	afterEach(cleanup);

	test('ignores blank and composing submissions, then saves the trimmed task immediately', async () => {
		const view = renderTodo();
		const input = view.getByPlaceholderText(i18n.ts._widgetTodo.addTask);
		expect(view.getByText(i18n.ts._widgetTodo.empty)).toBeTruthy();
		await fireEvent.update(input, '   ');
		await fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
		expect(view.saved).toHaveLength(0);
		await fireEvent.update(input, '  发布计划  ');
		await fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', isComposing: true });
		expect(view.saved).toHaveLength(0);
		await fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
		expect(view.saved).toHaveLength(1);
		expect(view.saved[0].items).toEqual([{ id: expect.any(String), text: '发布计划', completed: false }]);
		expect((input as HTMLInputElement).value).toBe('');
		expect(view.getByRole('checkbox', { name: '发布计划' })).toBeTruthy();
	});

	test('persists completion and deletion without mutating the saved input or earlier updates', async () => {
		const initial = [{ id: 'one', text: 'Review', completed: false }, { id: 'two', text: 'Publish', completed: false }];
		const view = renderTodo(initial);
		await fireEvent.click(view.getByRole('checkbox', { name: 'Review' }));
		expect(view.saved[0].items[0].completed).toBe(true);
		expect(initial[0].completed).toBe(false);
		expect(view.getByText(i18n.tsx._widgetTodo.remaining({ count: 1 }))).toBeTruthy();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._widgetTodo.clearCompleted }));
		expect(view.saved[1].items).toEqual([initial[1]]);
		expect(view.saved[0].items).toHaveLength(2);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._widgetTodo.deleteTask }));
		expect(view.saved[2].items).toEqual([]);
		expect(view.getByText(i18n.ts._widgetTodo.empty)).toBeTruthy();
	});

	test('reloads saved tasks and reacts to account-synced widget updates', async () => {
		const first = renderTodo();
		await fireEvent.update(first.getByPlaceholderText(i18n.ts._widgetTodo.addTask), 'Saved task');
		await fireEvent.click(first.getByRole('button', { name: i18n.ts.add }));
		const savedItems = first.saved[0].items;
		first.unmount();
		const reloaded = renderTodo(savedItems);
		expect(reloaded.getByRole('checkbox', { name: 'Saved task' })).toBeTruthy();
		reloaded.data.value = { items: [{ id: 'remote', text: 'From another device', completed: true }] };
		await nextTick();
		expect(reloaded.queryByText('Saved task')).toBeNull();
		expect((reloaded.getByRole('checkbox', { name: 'From another device' }) as HTMLInputElement).checked).toBe(true);
		expect(reloaded.saved).toHaveLength(0);
	});

	test('keeps two new widgets independent', async () => {
		const savedA = vi.fn();
		const savedB = vi.fn();
		const view = render(defineComponent({
			setup: () => () => h('div', [
				h(WidgetTodo, { widget: { id: 'a', data: {} }, onUpdateProps: savedA }),
				h(WidgetTodo, { widget: { id: 'b', data: {} }, onUpdateProps: savedB }),
			]),
		}), { global: { directives: { 'adaptive-border': {}, tooltip: {} } } });
		const [a, b] = view.getAllByTestId('mkw-todo').map(widget => within(widget));
		await fireEvent.update(a.getByPlaceholderText(i18n.ts._widgetTodo.addTask), 'Only A');
		await fireEvent.click(a.getByRole('button', { name: i18n.ts.add }));
		expect(savedA).toHaveBeenCalledOnce();
		expect(savedB).not.toHaveBeenCalled();
		expect(b.queryByRole('checkbox')).toBeNull();
		await fireEvent.update(b.getByPlaceholderText(i18n.ts._widgetTodo.addTask), 'Only B');
		await fireEvent.click(b.getByRole('button', { name: i18n.ts.add }));
		expect(a.queryByText('Only B')).toBeNull();
		expect(b.queryByText('Only A')).toBeNull();
	});
});
