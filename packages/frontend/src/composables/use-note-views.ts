/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { watch } from 'vue';
import type { Ref } from 'vue';
import { $i } from '@/i.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { noteEvents } from '@/composables/use-note-capture.js';

type VisibilityListener = (visible: boolean) => void;
type ViewReservation = { noteId: string; userId: string; viewedAt: number; };

const VIEW_DWELL = 1000;
const VIEW_THRESHOLD = 0.1;
const VIEW_DEDUP_INTERVAL = 24 * 60 * 60 * 1000;
const VIEW_BATCH_DELAY = 100;
const VIEW_BATCH_SIZE = 50;
const visibilityListeners = new Map<HTMLElement, Set<VisibilityListener>>();
const visibilityStates = new WeakMap<HTMLElement, boolean>();
const documentVisibilityListeners = new Set<() => void>();
const recentViews = new Map<string, ViewReservation>();
const pendingViews = new Map<string, ViewReservation>();
let visibilityObserver: IntersectionObserver | null = null;
let pendingViewsTimer: number | null = null;

function releaseReservations(reservations: [string, ViewReservation][]): void {
	for (const [key, reservation] of reservations) {
		if (recentViews.get(key) === reservation) recentViews.delete(key);
	}
}

function flushViews(): void {
	pendingViewsTimer = null;
	const reservations = [...pendingViews].slice(0, VIEW_BATCH_SIZE);
	for (const [key] of reservations) pendingViews.delete(key);

	const views = reservations.filter(([, reservation]) => $i?.id === reservation.userId && window.document.visibilityState === 'visible');
	releaseReservations(reservations.filter(entry => !views.includes(entry)));
	if (views.length > 0) {
		for (const [, reservation] of views) reservation.viewedAt = Date.now();
		void misskeyApi('notes/views', { noteIds: views.map(([, reservation]) => reservation.noteId) })
			.then(() => {
				for (const [, reservation] of views) noteEvents.emit(`statsUpdated:${reservation.noteId}`);
			})
			.catch(() => releaseReservations(views));
	}

	if (pendingViews.size > 0) pendingViewsTimer = window.setTimeout(flushViews, VIEW_BATCH_DELAY);
}

function enqueueView(noteId: string): void {
	if ($i == null || window.document.visibilityState !== 'visible') return;
	const now = Date.now();
	for (const [key, reservation] of recentViews) {
		if (now - reservation.viewedAt >= VIEW_DEDUP_INTERVAL) recentViews.delete(key);
	}
	const key = `${$i.id}:${noteId}`;
	if (recentViews.has(key)) return;

	const reservation = { noteId, userId: $i.id, viewedAt: now };
	recentViews.set(key, reservation);
	pendingViews.set(key, reservation);
	if (pendingViewsTimer == null) pendingViewsTimer = window.setTimeout(flushViews, VIEW_BATCH_DELAY);
}

function onDocumentVisibilityChanged(): void {
	if (window.document.visibilityState !== 'visible') {
		if (pendingViewsTimer != null) window.clearTimeout(pendingViewsTimer);
		pendingViewsTimer = null;
		releaseReservations([...pendingViews]);
		pendingViews.clear();
	}
	for (const listener of documentVisibilityListeners) listener();
}

function observeVisibility(element: HTMLElement, listener: VisibilityListener): () => void {
	if (typeof window.IntersectionObserver !== 'function') return () => {};

	visibilityObserver ??= new window.IntersectionObserver((entries) => {
		for (const entry of entries) {
			const target = entry.target as HTMLElement;
			const visible = entry.isIntersecting && entry.intersectionRatio >= VIEW_THRESHOLD;
			visibilityStates.set(target, visible);
			for (const callback of visibilityListeners.get(target) ?? []) callback(visible);
		}
	}, { rootMargin: '0px', threshold: VIEW_THRESHOLD });

	let listeners = visibilityListeners.get(element);
	if (listeners == null) {
		listeners = new Set();
		visibilityListeners.set(element, listeners);
		visibilityObserver.observe(element);
	}
	listeners.add(listener);
	listener(visibilityStates.get(element) ?? false);

	return () => {
		listeners.delete(listener);
		if (listeners.size > 0) return;
		visibilityListeners.delete(element);
		visibilityStates.delete(element);
		visibilityObserver?.unobserve(element);
		if (visibilityListeners.size === 0) {
			visibilityObserver?.disconnect();
			visibilityObserver = null;
		}
	};
}

export function useNoteViews(
	target: Readonly<Ref<HTMLElement | null | undefined>>,
	noteId: Readonly<Ref<string>>,
	enabled: Readonly<Ref<boolean>>,
): void {
	watch([target, noteId, enabled], ([element, id, isEnabled], _previous, onCleanup) => {
		if (element == null || !isEnabled || $i == null) return;
		let visible = false;
		let reported = false;
		let dwellTimer: number | null = null;

		function clearDwell(): void {
			if (dwellTimer != null) window.clearTimeout(dwellTimer);
			dwellTimer = null;
		}

		function updateExposure(): void {
			clearDwell();
			if (!visible || window.document.visibilityState !== 'visible') {
				reported = false;
				return;
			}
			if (reported) return;
			dwellTimer = window.setTimeout(() => {
				dwellTimer = null;
				if (!enabled.value || noteId.value !== id || target.value !== element || window.document.visibilityState !== 'visible') return;
				reported = true;
				enqueueView(id);
			}, VIEW_DWELL);
		}

		const stopObserving = observeVisibility(element, (inViewport) => {
			if (visible === inViewport) return;
			visible = inViewport;
			updateExposure();
		});
		documentVisibilityListeners.add(updateExposure);
		if (documentVisibilityListeners.size === 1) window.document.addEventListener('visibilitychange', onDocumentVisibilityChanged);

		onCleanup(() => {
			clearDwell();
			stopObserving();
			documentVisibilityListeners.delete(updateExposure);
			if (documentVisibilityListeners.size === 0) window.document.removeEventListener('visibilitychange', onDocumentVisibilityChanged);
		});
	}, { immediate: true, flush: 'post' });
}
