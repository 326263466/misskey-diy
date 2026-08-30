/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, onUnmounted, reactive, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { EventEmitter } from 'eventemitter3';
import { createVisibilityAwareInterval } from '@@/js/interval.js';
import type { Reactive, Ref } from 'vue';
import type { NoteUpdatedEvent } from 'misskey-js/streaming.types.js';
import { useStream } from '@/stream.js';
import { $i } from '@/i.js';
import { store } from '@/store.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { prefer } from '@/preferences.js';
import { globalEvents } from '@/events.js';

export const noteEvents = new EventEmitter<{
	[ev: `reacted:${string}`]: (ctx: { userId: Misskey.entities.User['id']; reaction: string; emoji?: { name: string; url: string; } | null; }) => void;
	[ev: `unreacted:${string}`]: (ctx: { userId: Misskey.entities.User['id']; reaction: string; emoji?: { name: string; url: string; } | null; }) => void;
	[ev: `pollVoted:${string}`]: (ctx: { userId: Misskey.entities.User['id']; choice: number; }) => void;
	[ev: `replied:${string}`]: (ctx: { noteId: Misskey.entities.Note['id']; }) => void;
	[ev: `unreplied:${string}`]: (ctx: { noteId: Misskey.entities.Note['id']; }) => void;
	[ev: `renoted:${string}`]: (ctx: { noteId: Misskey.entities.Note['id']; }) => void;
	[ev: `unrenoted:${string}`]: (ctx: { noteId: Misskey.entities.Note['id']; }) => void;
}>();

type PartialNoteData = Pick<Misskey.entities.Note, 'reactions' | 'reactionEmojis' | 'repliesCount' | 'renoteCount'>;
type PartialNoteFetchData = PartialNoteData & { requestId: number; };
type CaptureVisibilityListener = (isNearViewport: boolean) => void;

const CAPTURE_ROOT_MARGIN = '200% 0px';
const captureDocumentVisibility = ref(window.document.visibilityState);
const captureVisibilityListeners = new Map<HTMLElement, Set<CaptureVisibilityListener>>();
const captureVisibilityStates = new WeakMap<HTMLElement, boolean>();
let captureVisibilityObserver: IntersectionObserver | null = null;

window.document.addEventListener('visibilitychange', () => {
	captureDocumentVisibility.value = window.document.visibilityState;
});

function getCaptureVisibilityObserver(): IntersectionObserver | null {
	if (typeof window.IntersectionObserver !== 'function') return null;

	if (captureVisibilityObserver == null) {
		captureVisibilityObserver = new window.IntersectionObserver((entries) => {
			for (const entry of entries) {
				const element = entry.target as HTMLElement;
				captureVisibilityStates.set(element, entry.isIntersecting);
				for (const listener of captureVisibilityListeners.get(element) ?? []) {
					listener(entry.isIntersecting);
				}
			}
		}, {
			rootMargin: CAPTURE_ROOT_MARGIN,
		});
	}

	return captureVisibilityObserver;
}

function observeCaptureVisibility(element: HTMLElement, listener: CaptureVisibilityListener): () => void {
	const observer = getCaptureVisibilityObserver();
	if (observer == null) {
		listener(true);
		return () => {};
	}

	let listeners = captureVisibilityListeners.get(element);
	if (listeners == null) {
		listeners = new Set();
		captureVisibilityListeners.set(element, listeners);
		observer.observe(element);
	}
	listeners.add(listener);

	const currentState = captureVisibilityStates.get(element);
	if (currentState != null) listener(currentState);

	return () => {
		const currentListeners = captureVisibilityListeners.get(element);
		if (currentListeners == null) return;
		currentListeners.delete(listener);
		if (currentListeners.size > 0) return;

		captureVisibilityListeners.delete(element);
		captureVisibilityStates.delete(element);
		observer.unobserve(element);
	};
}

export function useNoteCaptureVisibility(rootEl?: Ref<HTMLElement | null>): Readonly<Ref<boolean>> {
	const isNearViewport = ref(rootEl == null);
	let stopObserving: (() => void) | null = null;

	if (rootEl != null) {
		watch(rootEl, (element) => {
			stopObserving?.();
			stopObserving = null;
			isNearViewport.value = false;

			if (element != null) {
				stopObserving = observeCaptureVisibility(element, (isVisible) => {
					isNearViewport.value = isVisible;
				});
			}
		}, { immediate: true });
	}

	onUnmounted(() => {
		stopObserving?.();
	});

	return computed(() => captureDocumentVisibility.value === 'visible' && isNearViewport.value);
}

const myRenoteIds = reactive(new Map<Misskey.entities.Note['id'], Misskey.entities.Note['id'][]>());

export function registerMyRenote(targetNoteId: Misskey.entities.Note['id'], renoteNoteId: Misskey.entities.Note['id']): void {
	const current = myRenoteIds.get(targetNoteId) ?? [];
	if (current.includes(renoteNoteId)) return;
	myRenoteIds.set(targetNoteId, [...current, renoteNoteId]);
}

export function unregisterMyRenote(targetNoteId: Misskey.entities.Note['id'], renoteNoteId: Misskey.entities.Note['id']): void {
	const current = myRenoteIds.get(targetNoteId);
	if (current == null) return;

	const next = current.filter(id => id !== renoteNoteId);
	if (next.length === 0) {
		myRenoteIds.delete(targetNoteId);
	} else {
		myRenoteIds.set(targetNoteId, next);
	}
}

export function getMyRenoteId(targetNoteId: Misskey.entities.Note['id']): Misskey.entities.Note['id'] | null {
	return myRenoteIds.get(targetNoteId)?.at(-1) ?? null;
}

// 返信の投稿はストリームやポーリングで配信されないので、自分の投稿だけはグローバルイベントから返信数に反映する
globalEvents.on('notePosted', (note) => {
	if (note.replyId != null) {
		noteEvents.emit(`replied:${note.replyId}`, { noteId: note.id });
	}

	if ($i != null && Misskey.note.isPureRenote(note) && note.userId === $i.id) {
		registerMyRenote(note.renoteId, note.id);
	}

	if (note.renoteId != null && note.renote?.userId !== note.userId && !note.user.isBot) {
		noteEvents.emit(`renoted:${note.renoteId}`, { noteId: note.id });
	}
});

// 返信が削除された場合も同様に返信数へ反映する
globalEvents.on('noteDeleted', (noteId, replyId, renoteId) => {
	if (replyId != null) {
		noteEvents.emit(`unreplied:${replyId}`, { noteId });
	}
	if (renoteId != null) {
		unregisterMyRenote(renoteId, noteId);
		noteEvents.emit(`unrenoted:${renoteId}`, { noteId });
	}
});

const fetchEvent = new EventEmitter<{
	[id: string]: PartialNoteFetchData;
}>();
const fetchStartedEvent = new EventEmitter<{
	[id: string]: (requestId: number) => void;
}>();

const pollingQueue = new Map<string, {
	referenceCount: number;
	lastActivatedAt: number;
}>();

function pollingEnqueue(note: Pick<Misskey.entities.Note, 'id' | 'createdAt'>) {
	if (pollingQueue.has(note.id)) {
		const data = pollingQueue.get(note.id)!;
		pollingQueue.set(note.id, {
			...data,
			referenceCount: data.referenceCount + 1,
			lastActivatedAt: Date.now(),
		});
	} else {
		pollingQueue.set(note.id, {
			referenceCount: 1,
			lastActivatedAt: Date.now(),
		});
	}
}

function pollingDequeue(note: Pick<Misskey.entities.Note, 'id' | 'createdAt'>) {
	const data = pollingQueue.get(note.id);
	if (data == null) return;

	if (data.referenceCount === 1) {
		pollingQueue.delete(note.id);
	} else {
		pollingQueue.set(note.id, {
			...data,
			referenceCount: data.referenceCount - 1,
		});
	}
}

const CAPTURE_MAX = 30;
const REFRESH_BATCH_DELAY = 50;
const MIN_POLLING_INTERVAL = 1000 * 10;
const POLLING_INTERVAL =
	prefer.s.pollingInterval === 1 ? MIN_POLLING_INTERVAL * 1.5 * 1.5 :
	prefer.s.pollingInterval === 2 ? MIN_POLLING_INTERVAL * 1.5 :
	prefer.s.pollingInterval === 3 ? MIN_POLLING_INTERVAL :
	MIN_POLLING_INTERVAL;
const pendingRefreshNoteIds = new Set<Misskey.entities.Note['id']>();
let pendingRefreshTimer: number | null = null;
let nextFetchRequestId = 0;

function fetchPartialNotes(noteIds: Misskey.entities.Note['id'][]): void {
	if (noteIds.length === 0) return;
	const requestId = ++nextFetchRequestId;
	for (const noteId of noteIds) fetchStartedEvent.emit(noteId, requestId);

	void misskeyApi('notes/show-partial-bulk', {
		noteIds,
	}).then((items) => {
		for (const item of items) {
			fetchEvent.emit(item.id, {
				requestId,
				reactions: item.reactions,
				reactionEmojis: item.reactionEmojis,
				repliesCount: item.repliesCount,
				renoteCount: item.renoteCount,
			});
		}
	}).catch(() => undefined);
}

function flushPendingRefreshes(): void {
	pendingRefreshTimer = null;
	const noteIds = [...pendingRefreshNoteIds].slice(0, CAPTURE_MAX);
	for (const noteId of noteIds) pendingRefreshNoteIds.delete(noteId);

	fetchPartialNotes(noteIds);
	if (pendingRefreshNoteIds.size > 0) {
		pendingRefreshTimer = window.setTimeout(flushPendingRefreshes, REFRESH_BATCH_DELAY);
	}
}

function requestNoteRefresh(noteId: Misskey.entities.Note['id']): void {
	pendingRefreshNoteIds.add(noteId);
	if (pendingRefreshTimer != null) return;
	pendingRefreshTimer = window.setTimeout(flushPendingRefreshes, REFRESH_BATCH_DELAY);
}

// documentが非表示の間はポーリングを停止する
createVisibilityAwareInterval(() => {
	const ids = [...pollingQueue.entries()]
		.sort(([, a], [, b]) => b.lastActivatedAt - a.lastActivatedAt)
		.map(([id]) => id)
		.slice(0, CAPTURE_MAX);

	fetchPartialNotes(ids);
}, POLLING_INTERVAL);

function pollingSubscribe(props: {
	note: Pick<Misskey.entities.Note, 'id' | 'createdAt'>;
}): () => void {
	const { note } = props;
	pollingEnqueue(note);
	return () => {
		pollingDequeue(note);
	};
}

function realtimeSubscribe(props: {
	note: Pick<Misskey.entities.Note, 'id' | 'createdAt'>;
}): () => void {
	const note = props.note;
	const connection = useStream();

	function onStreamNoteUpdated(noteData: NoteUpdatedEvent): void {
		const { type, id, body } = noteData;

		if (id !== note.id) return;

		switch (type) {
			case 'replied': {
				noteEvents.emit(`replied:${id}`, { noteId: body.noteId });
				break;
			}

			case 'unreplied': {
				noteEvents.emit(`unreplied:${id}`, { noteId: body.noteId });
				break;
			}

			case 'renoted': {
				noteEvents.emit(`renoted:${id}`, { noteId: body.noteId });
				break;
			}

			case 'unrenoted': {
				noteEvents.emit(`unrenoted:${id}`, { noteId: body.noteId });
				break;
			}

			case 'reacted': {
				noteEvents.emit(`reacted:${id}`, {
					userId: body.userId,
					reaction: body.reaction,
					emoji: body.emoji,
				});
				break;
			}

			case 'unreacted': {
				noteEvents.emit(`unreacted:${id}`, {
					userId: body.userId,
					reaction: body.reaction,
				});
				break;
			}

			case 'pollVoted': {
				noteEvents.emit(`pollVoted:${id}`, {
					userId: body.userId,
					choice: body.choice,
				});
				break;
			}

			case 'deleted': {
				globalEvents.emit('noteDeleted', id);
				break;
			}
		}
	}

	function capture(): void {
		connection.send('sr', { id: note.id });
	}

	function decapture(): void {
		connection.send('un', { id: note.id });
	}

	function onStreamConnected() {
		capture();
	}

	capture();
	connection.on('noteUpdated', onStreamNoteUpdated);
	connection.on('_connected_', onStreamConnected);

	return () => {
		decapture();
		connection.off('noteUpdated', onStreamNoteUpdated);
		connection.off('_connected_', onStreamConnected);
	};
}

export type ReactiveNoteData = {
	reactions: Misskey.entities.Note['reactions'];
	reactionCount: Misskey.entities.Note['reactionCount'];
	reactionEmojis: Misskey.entities.Note['reactionEmojis'];
	myReaction: Misskey.entities.Note['myReaction'];
	repliesCount: Misskey.entities.Note['repliesCount'];
	renoteCount: Misskey.entities.Note['renoteCount'];
	pollChoices: NonNullable<Misskey.entities.Note['poll']>['choices'];
};

const noReaction = Symbol();

export function useNoteCapture(props: {
	note: Misskey.entities.Note;
	parentNote: Misskey.entities.Note | null;
	mock?: boolean;
	active?: Readonly<Ref<boolean>>;
}): {
	$note: Reactive<ReactiveNoteData>;
	subscribe: () => void;
} {
	const { note, parentNote, mock, active = ref(true) } = props;
	if ($i != null && parentNote?.renote != null && Misskey.note.isPureRenote(parentNote) && parentNote.userId === $i.id) {
		registerMyRenote(note.id, parentNote.id);
	}

	const $note = reactive<ReactiveNoteData>({
		reactions: Object.entries(note.reactions).reduce((acc, [name, count]) => {
			// Normalize reactions
			const normalizedName = name.replace(/^:(\w+):$/, ':$1@.:');
			if (acc[normalizedName] == null) {
				acc[normalizedName] = count;
			} else {
				acc[normalizedName] += count;
			}
			return acc;
		}, {} as Misskey.entities.Note['reactions']),
		reactionCount: note.reactionCount,
		reactionEmojis: note.reactionEmojis,
		myReaction: note.myReaction,
		repliesCount: note.repliesCount,
		renoteCount: note.renoteCount,
		pollChoices: note.poll?.choices ?? [],
	});
	let mutationVersion = 0;
	let latestFetchRequestId = 0;
	let mutationVersionAtLatestFetch = 0;

	function onFetchStarted(requestId: number): void {
		if (requestId < latestFetchRequestId) return;
		latestFetchRequestId = requestId;
		mutationVersionAtLatestFetch = mutationVersion;
	}

	function onFetched(data: PartialNoteFetchData): void {
		if (data.requestId !== latestFetchRequestId) return;
		if (mutationVersion !== mutationVersionAtLatestFetch) {
			if (active.value) requestNoteRefresh(note.id);
			return;
		}
		$note.reactions = data.reactions;
		$note.reactionCount = Object.values(data.reactions).reduce((a, b) => a + b, 0);
		$note.reactionEmojis = data.reactionEmojis;
		$note.repliesCount = data.repliesCount;
		$note.renoteCount = data.renoteCount;
	}

	noteEvents.on(`reacted:${note.id}`, onReacted);
	noteEvents.on(`unreacted:${note.id}`, onUnreacted);
	noteEvents.on(`pollVoted:${note.id}`, onPollVoted);
	noteEvents.on(`replied:${note.id}`, onReplied);
	noteEvents.on(`unreplied:${note.id}`, onUnreplied);
	noteEvents.on(`renoted:${note.id}`, onRenoted);
	noteEvents.on(`unrenoted:${note.id}`, onUnrenoted);
	fetchStartedEvent.on(note.id, onFetchStarted);
	fetchEvent.on(note.id, onFetched);

	// 操作がダブっていないかどうかを簡易的に記録するためのMap
	const reactionUserMap = new Map<Misskey.entities.User['id'], string | typeof noReaction>();
	let latestPollVotedKey: string | null = null;

	// 同じ返信について重複した投稿/削除イベントを一度だけ反映する
	const replyEventState = new Map<Misskey.entities.Note['id'], 'replied' | 'unreplied'>();

	// 同じ転送について重複した投稿/削除イベントを一度だけ反映する
	const renoteEventState = new Map<Misskey.entities.Note['id'], 'renoted' | 'unrenoted'>();

	function onReacted(ctx: { userId: Misskey.entities.User['id']; reaction: string; emoji?: { name: string; url: string; } | null; }): void {
		let normalizedName = ctx.reaction.replace(/^:(\w+):$/, ':$1@.:');
		normalizedName = normalizedName.match('\u200d') ? normalizedName : normalizedName.replace(/\ufe0f/g, '');
		if (reactionUserMap.has(ctx.userId) && reactionUserMap.get(ctx.userId) === normalizedName) return;
		reactionUserMap.set(ctx.userId, normalizedName);
		mutationVersion++;

		if (ctx.emoji && !(ctx.emoji.name in $note.reactionEmojis)) {
			$note.reactionEmojis[ctx.emoji.name] = ctx.emoji.url;
		}

		const currentCount = $note.reactions[normalizedName] || 0;

		$note.reactions[normalizedName] = currentCount + 1;
		$note.reactionCount += 1;

		if ($i && (ctx.userId === $i.id)) {
			$note.myReaction = normalizedName;
		}
	}

	function onUnreacted(ctx: { userId: Misskey.entities.User['id']; reaction: string; emoji?: { name: string; url: string; } | null; }): void {
		let normalizedName = ctx.reaction.replace(/^:(\w+):$/, ':$1@.:');
		normalizedName = normalizedName.match('\u200d') ? normalizedName : normalizedName.replace(/\ufe0f/g, '');

		// 確実に一度リアクションされて取り消されている場合のみ処理をとめる（APIで初回読み込み→Streamでアップデート等の場合、reactionUserMapに情報がないため）
		if (reactionUserMap.has(ctx.userId) && reactionUserMap.get(ctx.userId) === noReaction) return;
		reactionUserMap.set(ctx.userId, noReaction);
		mutationVersion++;

		const currentCount = $note.reactions[normalizedName] || 0;

		$note.reactions[normalizedName] = Math.max(0, currentCount - 1);
		$note.reactionCount = Math.max(0, $note.reactionCount - 1);
		if ($note.reactions[normalizedName] === 0) delete $note.reactions[normalizedName];

		if ($i && (ctx.userId === $i.id)) {
			$note.myReaction = null;
		}
	}

	function onPollVoted(ctx: { userId: Misskey.entities.User['id']; choice: number; }): void {
		const newPollVotedKey = `${ctx.userId}:${ctx.choice}`;
		if (newPollVotedKey === latestPollVotedKey) return;
		latestPollVotedKey = newPollVotedKey;
		mutationVersion++;

		const choices = [...$note.pollChoices];
		choices[ctx.choice] = {
			...choices[ctx.choice],
			votes: choices[ctx.choice].votes + 1,
			...($i && (ctx.userId === $i.id) ? {
				isVoted: true,
			} : {}),
		};

		$note.pollChoices = choices;
	}

	function onReplied(ctx: { noteId: Misskey.entities.Note['id']; }): void {
		if (replyEventState.get(ctx.noteId) === 'replied') return;
		replyEventState.set(ctx.noteId, 'replied');
		mutationVersion++;

		$note.repliesCount += 1;
	}

	function onUnreplied(ctx: { noteId: Misskey.entities.Note['id']; }): void {
		if (replyEventState.get(ctx.noteId) === 'unreplied') return;
		replyEventState.set(ctx.noteId, 'unreplied');
		mutationVersion++;

		$note.repliesCount = Math.max(0, $note.repliesCount - 1);
	}

	function onRenoted(ctx: { noteId: Misskey.entities.Note['id']; }): void {
		if (renoteEventState.get(ctx.noteId) === 'renoted') return;
		renoteEventState.set(ctx.noteId, 'renoted');
		mutationVersion++;

		$note.renoteCount += 1;
	}

	function onUnrenoted(ctx: { noteId: Misskey.entities.Note['id']; }): void {
		if (renoteEventState.get(ctx.noteId) === 'unrenoted') return;
		renoteEventState.set(ctx.noteId, 'unrenoted');
		mutationVersion++;

		$note.renoteCount = Math.max(0, $note.renoteCount - 1);
	}

	let stopCapture: (() => void) | null = null;

	function startCapture(): void {
		if (mock || stopCapture != null) return;
		if ($i && store.s.realtimeMode) {
			stopCapture = realtimeSubscribe({
				note,
			});
		} else {
			stopCapture = pollingSubscribe({
				note,
			});
		}

		requestNoteRefresh(note.id);
	}

	function stopCurrentCapture(): void {
		stopCapture?.();
		stopCapture = null;
	}

	function subscribe(): void {
		if (!active.value) return;
		startCapture();
		requestNoteRefresh(note.id);
	}

	watch(active, (isActive) => {
		if (isActive) {
			startCapture();
		} else {
			stopCurrentCapture();
		}
	}, { immediate: true });

	onUnmounted(() => {
		stopCurrentCapture();
		noteEvents.off(`reacted:${note.id}`, onReacted);
		noteEvents.off(`unreacted:${note.id}`, onUnreacted);
		noteEvents.off(`pollVoted:${note.id}`, onPollVoted);
		noteEvents.off(`replied:${note.id}`, onReplied);
		noteEvents.off(`unreplied:${note.id}`, onUnreplied);
		noteEvents.off(`renoted:${note.id}`, onRenoted);
		noteEvents.off(`unrenoted:${note.id}`, onUnrenoted);
		fetchStartedEvent.off(note.id, onFetchStarted);
		fetchEvent.off(note.id, onFetched);
	});

	return {
		$note,
		subscribe,
	};
}
