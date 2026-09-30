/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { cleanup, fireEvent, render } from '@testing-library/vue';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import MkTopicPicker from '@/components/MkTopicPicker.vue';
import MkPostFormTopics from '@/components/MkPostFormTopics.vue';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({ search: vi.fn(), popup: vi.fn(), dispose: vi.fn(), close: vi.fn() }));
vi.mock('@/utility/topic-picker.js', async importOriginal => ({ ...await importOriginal<typeof import('@/utility/topic-picker.js')>(), searchTopics: mocks.search }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: vi.fn() }));
vi.mock('@/os.js', () => ({ popup: mocks.popup }));
vi.mock('@/components/MkModal.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({
		emits: ['closed', 'opened', 'click', 'esc'],
		setup(_props, { slots, expose, emit }) {
			expose({ close: () => { mocks.close(); emit('closed'); } });
			return () => h('div', slots.default?.({ type: 'popup', maxHeight: 400 }));
		},
	}) };
});

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>(done => { resolve = done; });
	return { promise, resolve };
}

async function settle(): Promise<void> { await Promise.resolve(); await nextTick(); }

describe('topic picker interactions', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.resetAllMocks();
		mocks.search.mockResolvedValue([]);
		mocks.popup.mockReturnValue({ dispose: mocks.dispose });
		vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {});
	});
	afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

	test('debounces valid input, suppresses IME queries and rejects invalid topic syntax', async () => {
		const view = render(MkTopicPicker);
		const input = view.getByRole('combobox');
		await settle();
		expect(mocks.search).toHaveBeenCalledWith('');
		await fireEvent.update(input, 'v');
		await vi.advanceTimersByTimeAsync(150);
		await fireEvent.update(input, 'vue');
		await vi.advanceTimersByTimeAsync(249);
		expect(mocks.search).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(mocks.search).toHaveBeenLastCalledWith('vue');
		await fireEvent.compositionStart(input);
		await fireEvent.update(input, 'に');
		await vi.advanceTimersByTimeAsync(500);
		expect(mocks.search).toHaveBeenCalledTimes(2);
		await fireEvent.update(input, '日本');
		await fireEvent.compositionEnd(input);
		await vi.advanceTimersByTimeAsync(250);
		expect(mocks.search).toHaveBeenLastCalledWith('日本');
		await fireEvent.update(input, 'two words');
		await vi.advanceTimersByTimeAsync(500);
		expect(mocks.search).toHaveBeenCalledTimes(3);
		expect(view.getByText(i18n.ts._topics.invalid)).toBeTruthy();
	});

	test('ignores stale search responses and old completions after unmount', async () => {
		const old = deferred<string[]>();
		mocks.search.mockImplementation(query => query === 'a' ? old.promise : Promise.resolve(query === 'ab' ? ['about'] : []));
		const view = render(MkTopicPicker);
		const input = view.getByRole('combobox');
		await fireEvent.update(input, 'a');
		await vi.advanceTimersByTimeAsync(250);
		await fireEvent.update(input, 'ab');
		await vi.advanceTimersByTimeAsync(250);
		old.resolve(['ancient']);
		await settle();
		expect(view.queryByRole('option', { name: 'ancient' })).toBeNull();
		expect(view.getByRole('option', { name: 'about' })).toBeTruthy();
		const pending = deferred<string[]>();
		mocks.search.mockReturnValue(pending.promise);
		await fireEvent.update(input, 'unmount');
		await vi.advanceTimersByTimeAsync(250);
		view.unmount();
		pending.resolve(['unmounted']);
		await settle();
		expect(view.emitted().choose).toBeUndefined();
	});

	test('selects one existing result by keyboard and closes before a second selection', async () => {
		mocks.search.mockResolvedValue(['Vue', 'Vue3']);
		const view = render(MkTopicPicker);
		const input = view.getByRole('combobox');
		await fireEvent.update(input, 'vue');
		await vi.advanceTimersByTimeAsync(250);
		await fireEvent.keyDown(input, { key: 'ArrowDown' });
		await fireEvent.keyDown(input, { key: 'ArrowDown' });
		await fireEvent.keyDown(input, { key: 'Enter' });
		expect(view.emitted().choose).toEqual([['Vue3']]);
		expect(mocks.close).toHaveBeenCalledOnce();
		await fireEvent.update(input, '自定义话题');
		await fireEvent.keyDown(input, { key: 'Enter' });
		expect(view.emitted().choose).toEqual([['Vue3']]);
	});

	test('supports a custom topic without waiting for a server', async () => {
		mocks.search.mockReturnValue(new Promise(() => {}));
		const view = render(MkTopicPicker);
		const input = view.getByRole('combobox');
		await fireEvent.update(input, '自定义话题');
		await fireEvent.keyDown(input, { key: 'Enter' });
		expect(view.emitted().choose).toEqual([['自定义话题']]);
		expect(mocks.close).toHaveBeenCalledOnce();
	});

	test('shows the first ten unique trending topics in recommendation order without recent topics', async () => {
		mocks.search.mockResolvedValue(['Vue', 'ＶＵＥ', 'Hot2', 'Hot3', 'Hot4', 'Hot5', 'Hot6', 'Hot7', 'Hot8', 'Hot9', 'Hot10', 'Hot11']);
		const view = render(MkTopicPicker);
		await settle();
		expect(view.getAllByRole('option').map(option => option.textContent?.trim())).toEqual(['Vue', 'Hot2', 'Hot3', 'Hot4', 'Hot5', 'Hot6', 'Hot7', 'Hot8', 'Hot9', 'Hot10']);
		expect(view.queryByText(i18n.ts._topics.recent)).toBeNull();
	});

	test('allows custom addition and retry after network errors', async () => {
		mocks.search.mockRejectedValue(new Error('offline'));
		const view = render(MkTopicPicker);
		const input = view.getByRole('combobox');
		await fireEvent.update(input, 'custom');
		await vi.advanceTimersByTimeAsync(250);
		expect(view.getByText(i18n.ts._topics.searchFailed, { exact: false })).toBeTruthy();
		mocks.search.mockResolvedValue(['customTopic']);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._topics.retry }));
		await vi.advanceTimersByTimeAsync(0);
		await settle();
		expect(view.getByRole('option', { name: 'customTopic' })).toBeTruthy();
		await fireEvent.keyDown(input, { key: 'Enter' });
		expect(view.emitted().choose).toEqual([['custom']]);
	});

	test('blocks a second topic and selection after becoming disabled', async () => {
		const view = render(MkTopicPicker, { props: { selected: ['Vue'] } });
		const input = view.getByRole('combobox');
		await fireEvent.update(input, 'custom');
		await fireEvent.keyDown(input, { key: 'Enter' });
		expect(view.emitted().choose).toBeUndefined();
		expect(view.getByText(i18n.ts._topics.singleLimit)).toBeTruthy();
		await view.rerender({ selected: [], disabled: true });
		await fireEvent.keyDown(input, { key: 'Enter' });
		expect(view.emitted().choose).toBeUndefined();
		expect(mocks.close).toHaveBeenCalledOnce();
	});

	test('wrapper preserves legacy draft tokens, blocks adding, and allows removing excess topics', async () => {
		const model = ref('  #Vue   plain  ');
		const enabled = ref(true);
		const view = render(defineComponent({ setup: () => () => h(MkPostFormTopics, {
			modelValue: model.value, enabled: enabled.value,
			'onUpdate:modelValue': value => { model.value = value; },
			'onUpdate:enabled': value => { enabled.value = value; },
		}) }));
		expect((view.getByRole('button', { name: i18n.ts._topics.add }) as HTMLButtonElement).disabled).toBe(true);
		expect(model.value).toBe('  #Vue   plain  ');
		await fireEvent.click(view.getByRole('button', { name: i18n.tsx._topics.remove({ tag: 'Vue' }) }));
		await fireEvent.click(view.getByRole('button', { name: i18n.tsx._topics.remove({ tag: 'plain' }) }));
		expect(model.value).toBe('');
		expect(enabled.value).toBe(false);
	});

	test('keeps invalid legacy draft tokens visible and removable, and preserves keyboard focus', async () => {
		const model = ref('#Vue foo,bar');
		const enabled = ref(true);
		const empty = vi.fn();
		const view = render(defineComponent({ setup: () => () => h(MkPostFormTopics, {
			modelValue: model.value, enabled: enabled.value, onEmpty: empty,
			'onUpdate:modelValue': value => { model.value = value; },
			'onUpdate:enabled': value => { enabled.value = value; },
		}) }));
		expect(view.getByText('foo,bar')).toBeTruthy();
		const first = view.getByRole('button', { name: i18n.tsx._topics.remove({ tag: 'Vue' }) });
		first.focus();
		await fireEvent.click(first);
		expect(model.value).toBe('foo,bar');
		expect(enabled.value).toBe(true);
		const last = view.getByRole('button', { name: i18n.tsx._topics.remove({ tag: 'foo,bar' }) });
		expect(document.activeElement).toBe(last);
		await fireEvent.click(last);
		expect(model.value).toBe('');
		expect(enabled.value).toBe(false);
		expect(empty).toHaveBeenCalledOnce();
	});

	test('wrapper starts fresh for disabled saved tags and ignores late callbacks or disabled opening', async () => {
		const model = ref('#old');
		const enabled = ref(false);
		const disabled = ref(false);
		const component = ref<InstanceType<typeof MkPostFormTopics>>();
		const view = render(defineComponent({ setup: () => () => h(MkPostFormTopics, {
			ref: component, modelValue: model.value, enabled: enabled.value, disabled: disabled.value,
			'onUpdate:modelValue': value => { model.value = value; },
			'onUpdate:enabled': value => { enabled.value = value; },
		}) }));
		const target = document.createElement('button');
		component.value!.open(target);
		const props = mocks.popup.mock.calls[0][1];
		const events = mocks.popup.mock.calls[0][2];
		expect(props.selected.value).toEqual([]);
		events.choose('new');
		await settle();
		expect(model.value).toBe('#new');
		expect(enabled.value).toBe(true);
		events.closed();
		events.choose('late');
		expect(model.value).toBe('#new');
		disabled.value = true;
		await settle();
		component.value!.open(target);
		expect(mocks.popup).toHaveBeenCalledOnce();
		view.unmount();
	});
});
