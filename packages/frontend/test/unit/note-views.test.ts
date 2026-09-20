/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { cleanup, render } from '@testing-library/vue';
import { defineComponent, nextTick, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useNoteViews } from '@/composables/use-note-views.js';

const mocks = vi.hoisted(() => ({
	api: vi.fn(),
	emit: vi.fn(),
	account: { current: { id: 'viewer' } as { id: string } | null },
}));

vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/i.js', () => ({ get $i() { return mocks.account.current; } }));
vi.mock('@/composables/use-note-capture.js', () => ({ noteEvents: { emit: mocks.emit } }));

let documentVisibility: DocumentVisibilityState = 'visible';
let noteSequence = 0;
const observers: IntersectionObserverMock[] = [];

class IntersectionObserverMock {
	readonly observed = new Set<Element>();
	readonly observe = vi.fn((element: Element) => this.observed.add(element));
	readonly unobserve = vi.fn((element: Element) => this.observed.delete(element));
	readonly disconnect = vi.fn(() => this.observed.clear());

	constructor(readonly callback: IntersectionObserverCallback, readonly options?: IntersectionObserverInit) {
		observers.push(this);
	}

	setVisible(element: Element, intersectionRatio: number): void {
		this.callback([{ target: element, isIntersecting: intersectionRatio > 0, intersectionRatio } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
	}
}

function setVisibility(state: DocumentVisibilityState): void {
	documentVisibility = state;
	document.dispatchEvent(new Event('visibilitychange'));
}

async function mountNote(id = `note-${++noteSequence}`) {
	const noteId = ref(id);
	const enabled = ref(true);
	const view = render(defineComponent({
		setup() {
			const target = ref<HTMLElement | null>(null);
			useNoteViews(target, noteId, enabled);
			return { target };
		},
		template: '<article ref="target"></article>',
	}));
	await nextTick();
	const element = view.container.firstElementChild!;
	return { ...view, element, id, noteId, enabled };
}

function setVisible(element: Element, intersectionRatio = 1): void {
	const observer = observers.find(item => item.observed.has(element));
	expect(observer).toBeDefined();
	observer!.setVisible(element, intersectionRatio);
}

describe('useNoteViews', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		mocks.api.mockReset().mockResolvedValue(undefined);
		mocks.emit.mockReset();
		mocks.account.current = { id: 'viewer' };
		observers.length = 0;
		documentVisibility = 'visible';
		Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => documentVisibility });
		vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
	});

	afterEach(async () => {
		setVisibility('hidden');
		cleanup();
		await vi.runOnlyPendingTimersAsync();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	test('requires a continuous second in the actual viewport and does not count a stationary post again', async () => {
		const note = await mountNote();
		expect(observers[0].options).toEqual({ rootMargin: '0px', threshold: 0.1 });
		await vi.advanceTimersByTimeAsync(2000);
		expect(mocks.api).not.toHaveBeenCalled();

		setVisible(note.element, 0.05);
		await vi.advanceTimersByTimeAsync(1500);
		expect(mocks.api).not.toHaveBeenCalled();
		setVisible(note.element);
		await vi.advanceTimersByTimeAsync(900);
		setVisible(note.element, 0);
		await vi.advanceTimersByTimeAsync(500);
		expect(mocks.api).not.toHaveBeenCalled();

		setVisible(note.element);
		await vi.advanceTimersByTimeAsync(999);
		expect(mocks.api).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(101);
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('notes/views', { noteIds: [note.id] });
		expect(mocks.emit).toHaveBeenCalledExactlyOnceWith(`statsUpdated:${note.id}`);
		await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
		expect(mocks.api).toHaveBeenCalledTimes(1);
		setVisible(note.element, 0);
		setVisible(note.element);
		await vi.advanceTimersByTimeAsync(1100);
		expect(mocks.api).toHaveBeenCalledTimes(2);
	});

	test('starts a fresh dwell after the document returns to the foreground', async () => {
		const note = await mountNote();
		setVisible(note.element);
		await vi.advanceTimersByTimeAsync(600);
		setVisibility('hidden');
		await vi.advanceTimersByTimeAsync(2000);
		expect(mocks.api).not.toHaveBeenCalled();
		setVisibility('visible');
		await vi.advanceTimersByTimeAsync(999);
		expect(mocks.api).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(101);
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('notes/views', { noteIds: [note.id] });
	});

	test('cancels an unsent batch in the background and can count a later foreground exposure', async () => {
		const note = await mountNote();
		setVisible(note.element);
		await vi.advanceTimersByTimeAsync(1000);
		setVisibility('hidden');
		await vi.advanceTimersByTimeAsync(200);
		expect(mocks.api).not.toHaveBeenCalled();
		setVisibility('visible');
		await vi.advanceTimersByTimeAsync(1100);
		expect(mocks.api).toHaveBeenCalledTimes(1);
	});

	test('shares deduplication across duplicate components and remounts for 24 hours', async () => {
		const first = await mountNote();
		const second = await mountNote(first.id);
		expect(observers).toHaveLength(1);
		setVisible(first.element);
		setVisible(second.element);
		await vi.advanceTimersByTimeAsync(1100);
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('notes/views', { noteIds: [first.id] });
		first.unmount();
		second.unmount();
		const remount = await mountNote(first.id);
		setVisible(remount.element);
		await vi.advanceTimersByTimeAsync(1100);
		expect(mocks.api).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(23 * 60 * 60 * 1000);
		setVisible(remount.element, 0);
		setVisible(remount.element);
		await vi.advanceTimersByTimeAsync(1100);
		expect(mocks.api).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
		setVisible(remount.element, 0);
		setVisible(remount.element);
		await vi.advanceTimersByTimeAsync(1100);
		expect(mocks.api).toHaveBeenCalledTimes(2);
	});

	test('batches distinct posts into requests containing at most 50 ids', async () => {
		const ids: string[] = [];
		for (let index = 0; index < 53; index++) {
			const note = await mountNote();
			ids.push(note.id);
			setVisible(note.element);
		}
		await vi.advanceTimersByTimeAsync(1200);
		expect(mocks.api.mock.calls).toEqual([
			['notes/views', { noteIds: ids.slice(0, 50) }],
			['notes/views', { noteIds: ids.slice(50) }],
		]);
	});

	test('cancels unfinished exposures on disable and unmount', async () => {
		const first = await mountNote();
		const second = await mountNote();
		setVisible(first.element);
		setVisible(second.element);
		await vi.advanceTimersByTimeAsync(500);
		first.enabled.value = false;
		second.unmount();
		await nextTick();
		await vi.advanceTimersByTimeAsync(1000);
		expect(mocks.api).not.toHaveBeenCalled();
		expect(observers[0].unobserve).toHaveBeenCalledWith(first.element);
		expect(observers[0].unobserve).toHaveBeenCalledWith(second.element);
		expect(observers[0].disconnect).toHaveBeenCalledTimes(1);

		first.enabled.value = true;
		await nextTick();
		setVisible(first.element);
		await vi.advanceTimersByTimeAsync(1100);
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('notes/views', { noteIds: [first.id] });
	});

	test('discards a previous post dwell when the same component switches notes', async () => {
		const note = await mountNote();
		setVisible(note.element);
		await vi.advanceTimersByTimeAsync(600);
		note.noteId.value = `note-${++noteSequence}`;
		await nextTick();
		setVisible(note.element);
		await vi.advanceTimersByTimeAsync(500);
		expect(mocks.api).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(600);
		expect(mocks.api).toHaveBeenCalledExactlyOnceWith('notes/views', { noteIds: [note.noteId.value] });
	});

	test('does not report anonymous exposures or assume visibility without an observer', async () => {
		mocks.account.current = null;
		await mountNote();
		mocks.account.current = { id: 'viewer' };
		vi.stubGlobal('IntersectionObserver', undefined);
		await mountNote();
		await vi.advanceTimersByTimeAsync(2000);
		expect(observers).toHaveLength(0);
		expect(mocks.api).not.toHaveBeenCalled();
	});

	test('allows a later exposure to retry a failed report without a stationary retry loop', async () => {
		mocks.api.mockRejectedValueOnce(new Error('offline'));
		const note = await mountNote();
		setVisible(note.element);
		await vi.advanceTimersByTimeAsync(1100);
		expect(mocks.api).toHaveBeenCalledTimes(1);
		expect(mocks.emit).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(5000);
		expect(mocks.api).toHaveBeenCalledTimes(1);
		setVisible(note.element, 0);
		setVisible(note.element);
		await vi.advanceTimersByTimeAsync(1100);
		expect(mocks.api).toHaveBeenCalledTimes(2);
		expect(mocks.emit).toHaveBeenCalledExactlyOnceWith(`statsUpdated:${note.id}`);
	});
});
