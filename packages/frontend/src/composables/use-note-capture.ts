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
import { globalEvents, useGlobalEvent } from '@/events.js';

export const noteEvents = new EventEmitter<{
	[ev: `statsUpdated:${string}`]: () => void;
	[ev: `reacted:${string}`]: (ctx: { userId: Misskey.entities.User['id']; reaction: string; emoji?: { name: string; url: string; } | null; }) => void;
	[ev: `unreacted:${string}`]: (ctx: { userId: Misskey.entities.User['id']; reaction: string; emoji?: { name: string; url: string; } | null; }) => void;
	[ev: `pollVoted:${string}`]: (ctx: { userId: Misskey.entities.User['id']; choice: number; }) => void;
	[ev: `replied:${string}`]: (ctx: { noteId: Misskey.entities.Note['id']; }) => void;
	[ev: `unreplied:${string}`]: (ctx: { noteId: Misskey.entities.Note['id']; }) => void;
	[ev: `renoted:${string}`]: (ctx: { noteId: Misskey.entities.Note['id']; }) => void;
	[ev: `unrenoted:${string}`]: (ctx: { noteId: Misskey.entities.Note['id']; }) => void;
}>();

type PartialNoteData = Pick<Misskey.entities.Note, 'reactions' | 'reactionEmojis' | 'repliesCount' | 'renoteCount' | 'viewsCount' | 'favoritesCount' | 'isFavorited'> & Misskey.entities.LikeState;
type PartialNoteFetchData = { requestId: number; } & (
	(PartialNoteData & { deleted: false; }) | { deleted: true; deletedBy?: Misskey.entities.Note['deletedBy']; }
);
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

const capturedReplyParents = new Map<string, { replyId: string | null; references: number }>();
const deletedNoteIds = new Set<string>();

function getReplyAncestorIds(note: Pick<Misskey.entities.Note, 'id' | 'replyId' | 'reply'>): Set<string> {
	const ancestors = new Set<string>();
	let replyId = note.replyId ?? capturedReplyParents.get(note.id)?.replyId;
	let embeddedReply = note.reply;
	while (replyId != null && replyId !== note.id && !ancestors.has(replyId)) {
		ancestors.add(replyId);
		const parent = embeddedReply?.id === replyId ? embeddedReply : null;
		replyId = parent?.replyId ?? capturedReplyParents.get(replyId)?.replyId;
		embeddedReply = parent?.reply;
	}
	return ancestors;
}

// 本地回复先更新已加载父级，随后以服务端计数校准。
globalEvents.on('notePosted', (note) => {
	const ancestorIds = getReplyAncestorIds(note);
	if (deletedNoteIds.has(note.id)) {
		globalEvents.emit('noteDeleted', note.id, note.replyId, undefined, note.deletedBy);
		return;
	}
	for (const ancestorId of ancestorIds) {
		noteEvents.emit(`replied:${ancestorId}`, { noteId: note.id });
	}

	if ($i != null && Misskey.note.isPureRenote(note) && note.userId === $i.id) {
		registerMyRenote(note.renoteId, note.id);
	}

	if (note.renoteId != null && note.renote?.userId !== note.userId && !note.user.isBot) {
		noteEvents.emit(`renoted:${note.renoteId}`, { noteId: note.id });
	}
});

// 评论删除保留占位，帖子删除则清理已加载的后代。
globalEvents.on('noteDeleted', (noteId, replyId, renoteId) => {
	const alreadyDeleted = deletedNoteIds.has(noteId);
	deletedNoteIds.add(noteId);
	for (const ancestorId of getReplyAncestorIds({ id: noteId, replyId })) {
		noteEvents.emit(`unreplied:${ancestorId}`, { noteId });
	}
	if (alreadyDeleted) return;
	if ((replyId ?? capturedReplyParents.get(noteId)?.replyId) == null) {
		for (const [id, parent] of capturedReplyParents) {
			if (!deletedNoteIds.has(id) && getReplyAncestorIds({ id, replyId: parent.replyId }).has(noteId)) {
				globalEvents.emit('noteDeleted', id, parent.replyId);
			}
		}
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
	lastFetchRequestId: number;
}>();

function pollingEnqueue(note: Pick<Misskey.entities.Note, 'id' | 'createdAt'>) {
	if (pollingQueue.has(note.id)) {
		const data = pollingQueue.get(note.id)!;
		pollingQueue.set(note.id, {
			...data,
			referenceCount: data.referenceCount + 1,
		});
	} else {
		pollingQueue.set(note.id, {
			referenceCount: 1,
			lastFetchRequestId: 0,
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
		for (const noteId of noteIds) {
			const subscription = pollingQueue.get(noteId);
			if (subscription) subscription.lastFetchRequestId = Math.max(subscription.lastFetchRequestId, requestId);
		}
		const remainingNoteIds = new Set(noteIds);
		for (const item of items) {
			remainingNoteIds.delete(item.id);
			if (item.isDeleted) {
				fetchEvent.emit(item.id, { requestId, deleted: true, deletedBy: item.deletedBy });
				continue;
			}
			fetchEvent.emit(item.id, {
				requestId,
				deleted: false,
				likeCount: item.likeCount,
				isLiked: item.isLiked,
				likeUsers: item.likeUsers,
				reactions: item.reactions,
				reactionEmojis: item.reactionEmojis,
				repliesCount: item.repliesCount,
				renoteCount: item.renoteCount,
				viewsCount: item.viewsCount,
				favoritesCount: item.favoritesCount,
				isFavorited: item.isFavorited,
			});
		}
		for (const noteId of remainingNoteIds) {
			fetchEvent.emit(noteId, { requestId, deleted: true });
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

// 所有统计共用批量校准，补齐丢失的推送；不可见时由订阅和计时器共同暂停。
createVisibilityAwareInterval(() => {
	const ids = [...pollingQueue.entries()]
		.sort(([, a], [, b]) => a.lastFetchRequestId - b.lastFetchRequestId)
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
			case 'statsUpdated': {
				noteEvents.emit(`statsUpdated:${id}`);
				break;
			}
			case 'updated': {
				globalEvents.emit('noteEdited', id, body);
				break;
			}

			case 'replied': {
				noteEvents.emit(`replied:${id}`, { noteId: body.noteId });
				break;
			}

			case 'unreplied': {
				globalEvents.emit('noteDeleted', body.noteId, id, undefined, body.deletedBy);
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
				globalEvents.emit('noteDeleted', id, undefined, undefined, body.deletedBy);
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
		noteEvents.emit(`statsUpdated:${note.id}`);
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
	viewsCount: number;
	favoritesCount: number;
	isFavorited: boolean;
	likeCount: number;
	isLiked: boolean;
	likeUsers: Misskey.entities.UserLite[];
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
	const replyParent = capturedReplyParents.get(note.id);
	if (replyParent != null) {
		replyParent.references++;
	} else {
		capturedReplyParents.set(note.id, { replyId: note.replyId ?? null, references: 1 });
	}
	if ($i != null && parentNote?.renote != null && Misskey.note.isPureRenote(parentNote) && parentNote.userId === $i.id) {
		registerMyRenote(note.id, parentNote.id);
	}

	const $note = reactive<ReactiveNoteData>({
		viewsCount: note.viewsCount ?? 0,
		favoritesCount: note.favoritesCount ?? 0,
		isFavorited: note.isFavorited ?? false,
		likeCount: note.likeCount ?? 0,
		isLiked: note.isLiked ?? false,
		likeUsers: note.likeUsers ?? [],
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
	let isDeleted = note.isDeleted === true;

	function onFetchStarted(requestId: number): void {
		if (requestId < latestFetchRequestId) return;
		latestFetchRequestId = requestId;
		mutationVersionAtLatestFetch = mutationVersion;
	}

	function onFetched(data: PartialNoteFetchData): void {
		if (isDeleted || data.requestId !== latestFetchRequestId) return;
		if (data.deleted) {
			globalEvents.emit('noteDeleted', note.id, note.replyId, undefined, data.deletedBy ?? note.deletedBy);
			return;
		}
		if (mutationVersion !== mutationVersionAtLatestFetch) {
			if (active.value) requestNoteRefresh(note.id);
			return;
		}
		$note.reactions = data.reactions;
		$note.reactionCount = Object.values(data.reactions).reduce((a, b) => a + b, 0);
		$note.reactionEmojis = data.reactionEmojis;
		$note.repliesCount = data.repliesCount;
		$note.renoteCount = data.renoteCount;
		$note.viewsCount = data.viewsCount;
		$note.favoritesCount = data.favoritesCount;
		$note.isFavorited = data.isFavorited ?? false;
		$note.likeCount = data.likeCount ?? 0;
		$note.isLiked = data.isLiked ?? false;
		$note.likeUsers = data.likeUsers ?? [];
	}

	function onStatsUpdated(): void {
		if (isDeleted) return;
		mutationVersion++;
		if (active.value && !mock) requestNoteRefresh(note.id);
	}

	useGlobalEvent('likesUpdated', (noteId, state) => {
		if (noteId !== note.id || isDeleted) return;
		mutationVersion++;
		Object.assign($note, state);
		if (active.value && !mock) requestNoteRefresh(note.id);
	});

	noteEvents.on(`statsUpdated:${note.id}`, onStatsUpdated);
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
		if (!normalizedName.startsWith('text:') && !normalizedName.includes('\u200d')) normalizedName = normalizedName.replace(/\ufe0f/g, '');
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
		if (active.value && !mock) requestNoteRefresh(note.id);
	}

	function onUnreacted(ctx: { userId: Misskey.entities.User['id']; reaction: string; emoji?: { name: string; url: string; } | null; }): void {
		let normalizedName = ctx.reaction.replace(/^:(\w+):$/, ':$1@.:');
		if (!normalizedName.startsWith('text:') && !normalizedName.includes('\u200d')) normalizedName = normalizedName.replace(/\ufe0f/g, '');

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
		if (active.value && !mock) requestNoteRefresh(note.id);
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
		if (isDeleted) return;
		if (deletedNoteIds.has(ctx.noteId)) {
			replyEventState.set(ctx.noteId, 'unreplied');
			if (active.value && !mock) requestNoteRefresh(note.id);
			return;
		}
		if (replyEventState.has(ctx.noteId)) {
			if (replyEventState.get(ctx.noteId) === 'unreplied' && active.value && !mock) requestNoteRefresh(note.id);
			return;
		}
		replyEventState.set(ctx.noteId, 'replied');
		mutationVersion++;

		$note.repliesCount += 1;
		if (active.value && !mock) requestNoteRefresh(note.id);
	}

	function onUnreplied(ctx: { noteId: Misskey.entities.Note['id']; }): void {
		if (isDeleted) return;
		if (replyEventState.get(ctx.noteId) === 'unreplied') {
			if (active.value && !mock) requestNoteRefresh(note.id);
			return;
		}
		replyEventState.set(ctx.noteId, 'unreplied');
		mutationVersion++;

		if (active.value && !mock) requestNoteRefresh(note.id);
	}

	function onRenoted(ctx: { noteId: Misskey.entities.Note['id']; }): void {
		if (renoteEventState.get(ctx.noteId) === 'renoted') return;
		renoteEventState.set(ctx.noteId, 'renoted');
		mutationVersion++;

		$note.renoteCount += 1;
		if (active.value && !mock) requestNoteRefresh(note.id);
	}

	function onUnrenoted(ctx: { noteId: Misskey.entities.Note['id']; }): void {
		if (renoteEventState.get(ctx.noteId) === 'unrenoted') return;
		renoteEventState.set(ctx.noteId, 'unrenoted');
		mutationVersion++;

		unregisterMyRenote(note.id, ctx.noteId);
		$note.renoteCount = Math.max(0, $note.renoteCount - 1);
		if (active.value && !mock) requestNoteRefresh(note.id);
	}

	let stopCapture: (() => void) | null = null;

	function startCapture(): void {
		if (mock || isDeleted || stopCapture != null) return;
		const stopPolling = pollingSubscribe({ note });
		const stopRealtime = $i && store.s.realtimeMode ? realtimeSubscribe({ note }) : null;
		stopCapture = () => {
			stopRealtime?.();
			stopPolling();
		};

		requestNoteRefresh(note.id);
	}

	function stopCurrentCapture(): void {
		stopCapture?.();
		stopCapture = null;
	}

	function subscribe(): void {
		if (!active.value || isDeleted) return;
		startCapture();
		requestNoteRefresh(note.id);
	}

	useGlobalEvent('noteDeleted', noteId => {
		if (!replyEventState.has(noteId)) replyEventState.set(noteId, 'unreplied');
		if (noteId !== note.id || isDeleted) return;
		isDeleted = true;
		stopCurrentCapture();
		pendingRefreshNoteIds.delete(note.id);
		if (note.replyId != null) requestNoteRefresh(note.replyId);
		if (note.renoteId != null) requestNoteRefresh(note.renoteId);
	});

	watch(active, (isActive) => {
		if (isActive) {
			startCapture();
		} else {
			stopCurrentCapture();
		}
	}, { immediate: true });

	onUnmounted(() => {
		stopCurrentCapture();
		const replyParent = capturedReplyParents.get(note.id);
		if (replyParent != null && --replyParent.references === 0) capturedReplyParents.delete(note.id);
		if (capturedReplyParents.size === 0) deletedNoteIds.clear();
		noteEvents.off(`statsUpdated:${note.id}`, onStatsUpdated);
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
