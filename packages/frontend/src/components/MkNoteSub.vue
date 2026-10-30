<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkCommentThread v-if="note != null && !blocked" :nested="depth > 1" :replyCount="captured?.repliesCount ?? visibleReplies.length" :loadedCount="visibleReplies.length" :hasMore="detail && depth === 1 && hasMoreReplies && (!muted || deleted)" :loading="loadingReplies" :error="repliesError" :active="pageActive" :loadReplies="loadReplies">
	<MkComment ref="rootEl" :user="note.user" :createdAt="note.createdAt" :authorId="threadAuthor?.id" :child="depth > 1" :deletedText="deleted ? getDeletedText(deletedBy, true) : undefined" :replyTo="replyTo" :repliesCount="captured?.repliesCount ?? 0" :likedCount="captured?.likeCount ?? 0" :isLiked="captured?.isLiked" :replyOpen="replyOpen" :likeDisabled="liking" :menuDisabled="blocking" :menuOpen="menuOpen" menu @reply="toggleReply" @like="toggleLike" @menu="showMenu">
		<template v-if="muted && !deleted" #muted>
			<button type="button" class="_button" @click="muted = false"><I18n :src="i18n.ts.userSaysSomething" tag="small"><template #name><MkUserName :user="note.user"/></template></I18n></button>
		</template>
		<template #metadata>
			<span v-if="note.visibility !== 'public'" :title="i18n.ts._visibility[note.visibility]">
				<i :class="{ 'ti ti-home': note.visibility === 'home', 'ti ti-lock': note.visibility === 'followers', 'ti ti-mail': note.visibility === 'specified' }" role="img" :aria-label="i18n.ts._visibility[note.visibility]"></i>
			</span>
		</template>
		<MkCwButton v-if="note.cw != null" v-model="showContent">
			<Mfm v-if="note.cw != ''" :text="note.cw" :author="note.user" :nyaize="'respect'"/>
		</MkCwButton>
		<MkCwContent v-model="showContent" :enabled="note.cw != null"><MkSubNoteContent :note="note" :omitMentionOf="omitMentionOf" :relocateTags="true"/></MkCwContent>
		<template #contentAfter>
			<MkReactionsViewer v-if="captured && captured.reactionCount > 0" :noteId="note.id" :reactions="captured.reactions" :reactionEmojis="captured.reactionEmojis" :myReactions="captured.myReactions"/>
			<MkNoteTags v-if="note.cw == null || showContent" :class="$style.tags" :tags="topics.tags" :channel="channel"/>
		</template>
		<template v-if="replyOpen" #reply><MkPostForm :reply="note" :channel="note.channel" commentMode inlineReply fixed autofocus @posted="closeReply" @esc="closeReply"/></template>
	</MkComment>
	<template v-if="detail && depth === 1 && (!muted || deleted)" #replies="{ start, end }">
		<MkNoteSub v-for="(reply, index) in visibleReplies" v-show="index >= start && index < end" :key="reply.id" :note="reply" :depth="2" :threadAuthor="threadAuthor" :parentComment="note" :replyTarget="replyTargetOf(reply)"/>
	</template>
</MkCommentThread>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, inject, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue';
import * as Misskey from 'misskey-js';
import MkComment from '@/components/MkComment.vue';
import MkCommentThread from '@/components/MkCommentThread.vue';
import MkSubNoteContent from '@/components/MkSubNoteContent.vue';
import MkCwButton from '@/components/MkCwButton.vue';
import MkCwContent from '@/components/MkCwContent.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { createFlatNoteRepliesLoader } from '@/utility/flat-note-replies.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import { checkWordMute } from '@/utility/check-word-mute.js';
import { useNoteCapture, useNoteCaptureVisibility } from '@/composables/use-note-capture.js';
import { globalEvents, useGlobalEvent } from '@/events.js';
import { pleaseLogin } from '@/utility/please-login.js';
import { getAbuseReportMenu } from '@/utility/abuse-report.js';
import * as os from '@/os.js';
import type { MenuItem } from '@/types/menu.js';
import { editNote } from '@/utility/edit-note.js';
import { useNoteContent } from '@/composables/use-note-content.js';
import { getDeletedText, toDeletedNote } from '@/utility/deleted-note.js';
import { DI } from '@/di.js';
import { useLike } from '@/composables/use-like.js';
import MkReactionsViewer from '@/components/MkReactionsViewer.vue';
import MkNoteTags from '@/components/MkNoteTags.vue';
import { getNoteTopics } from '@/utility/note-topics.js';
import { activeCommentReplyId } from '@/utility/comment-reply.js';
import { isNoteBlocked, updateUserBlocking } from '@/utility/user-blocking.js';

const MkPostForm = defineAsyncComponent(() => import('@/components/MkPostForm.vue'));

const props = withDefaults(defineProps<{
	note: Misskey.entities.Note | null;
	detail?: boolean;

	// Only top-level comments and one flat reply level are rendered.
	depth?: number;
	parentComment?: Misskey.entities.Note | null;

	// 扁平展示时，回复的是同一线程里的其他子评论
	replyTarget?: Misskey.entities.Note | null;

	// 原帖作者。用于显示作者标签，以及省略指向作者的 @提及
	threadAuthor?: Misskey.entities.UserLite | null;
}>(), {
	depth: 1,
	parentComment: null,
	replyTarget: null,
	threadAuthor: null,
});

const note = props.note == null ? null : useNoteContent(props.note);
const topics = computed(() => note == null ? { tags: [] } : getNoteTopics(note));
const inChannel = inject(DI.inChannel, null);
const channel = computed(() => {
	const value = note?.channel;
	if (value == null) return null;
	if (inChannel?.value === value.id || props.parentComment?.channel?.id === value.id) return null;
	return value;
});

const replyTo = computed(() => {
	const target = props.replyTarget;
	if (target == null || isNoteBlocked(target)) return null;
	return { id: target.id, text: target.isHidden ? i18n.ts.invisibleNote : target.cw ?? target.text, user: target.user, isDeleted: target.isDeleted === true };
});

// 引用行已写明回复对象，正文开头指向同一人的 @提及不再重复显示。
const omitMentionOf = computed(() => {
	if (replyTo.value != null) return replyTo.value.isDeleted ? null : replyTo.value.user;
	if (props.parentComment != null) {
		if (props.parentComment.isDeleted) return null;
		return props.note?.replyId === props.parentComment.id ? props.parentComment.user : null;
	}
	return props.threadAuthor;
});

function replyTargetOf(reply: Misskey.entities.Note): Misskey.entities.Note | null {
	if (reply.replyId == null || reply.replyId === props.note?.id) return null;
	return replies.value.find(item => item.id === reply.replyId) ?? reply.reply ?? null;
}

const muted = ref<boolean | ReturnType<typeof checkWordMute>>(props.note && $i ? checkWordMute(props.note, $i, $i.mutedWords) : false);
const blocked = computed(() => props.note != null && isNoteBlocked(props.note));
const blocking = ref(false);
const menuOpen = ref(false);
const deleted = ref(props.note?.isDeleted === true);
const deletedBy = ref<Misskey.entities.Note['deletedBy']>(props.note?.deletedBy ?? null);
watch(() => [props.note?.isDeleted, props.note?.deletedBy] as const, ([value, source]) => {
	if (value) markDeleted(source);
});
const rootEl = useTemplateRef('rootEl');
const pageActive = inject(DI.pageActive, ref(true));
const captureActive = useNoteCaptureVisibility(computed(() => rootEl.value?.rootEl ?? null));
const mock = inject(DI.mock, false);
const captured = props.note == null ? null : useNoteCapture({ note: props.note, parentNote: null, active: captureActive, mock: mock || deleted.value }).$note;
const likeActions = note == null || captured == null ? null : useLike(note.id, captured, { disabled: () => deleted.value || blocked.value || note.isDeleted === true });
const liking = likeActions?.liking ?? ref(false);

function toggleLike(): void { void likeActions?.toggleLike(); }

const replyOpen = computed(() => note != null && !deleted.value && !blocked.value && activeCommentReplyId.value === note.id);

watch(blocked, value => {
	if (value && activeCommentReplyId.value === note?.id) activeCommentReplyId.value = null;
});

async function toggleReply(): Promise<void> {
	if (note == null || deleted.value || blocked.value) return;
	if (replyOpen.value) return closeReply();
	if (!await pleaseLogin() || deleted.value || blocked.value) return;
	activeCommentReplyId.value = note.id;
}

function closeReply(): void {
	if (replyOpen.value) activeCommentReplyId.value = null;
}

onBeforeUnmount(closeReply);

async function deleteComment(): Promise<void> {
	const note = props.note;
	if (note == null || deleted.value || note.userId !== $i?.id) return;
	try {
		await os.apiWithDialog('notes/delete', { noteId: note.id });
	} catch {
		return;
	}
	globalEvents.emit('noteDeleted', note.id, note.replyId, note.renoteId != null && note.renote?.userId !== note.userId ? note.renoteId : null, 'author');
}

async function editComment(): Promise<void> {
	if (note != null && !deleted.value) await editNote(note);
}

async function showMenu(ev: PointerEvent): Promise<void> {
	const note = props.note;
	const anchor = ev.currentTarget ?? ev.target;
	if (note == null || deleted.value || blocked.value || blocking.value || !await pleaseLogin() || deleted.value || blocked.value) return;
	const menu: MenuItem[] = note.userId === $i?.id ? [{
		icon: 'ti ti-edit', text: i18n.ts.edit, action: editComment,
	}, {
		icon: 'ti ti-trash', text: i18n.ts.delete, danger: true, action: deleteComment,
	}] : [getAbuseReportMenu({ type: 'note', note }), {
		icon: 'ti ti-ban', text: i18n.ts.block, danger: true,
		action: async () => {
			if (blocking.value || blocked.value) return;
			blocking.value = true;
			try {
				const { canceled } = await os.confirm({ type: 'warning', text: i18n.ts.blockConfirm });
				if (canceled || blocked.value) return;
				await os.apiWithDialog('blocking/create', { userId: note.userId });
				updateUserBlocking(note.userId, true);
				os.toast(i18n.ts.youBlockedThisUser, 'success');
			} catch {
				// 接口已提示错误，失败时不隐藏评论。
			} finally {
				blocking.value = false;
			}
		},
	}];
	menuOpen.value = true;
	try {
		await os.popupMenu(menu, anchor);
	} finally {
		menuOpen.value = false;
	}
}

const showContent = ref(false);
const replies = ref<Misskey.entities.Note[]>([]);
const visibleReplies = computed(() => replies.value.filter(reply => !isNoteBlocked(reply)));
const loadingReplies = ref(false);
const repliesError = ref(false);
const replyAbortController = new AbortController();
const replyLoader = props.detail && props.depth === 1 && props.note != null
	? createFlatNoteRepliesLoader<Misskey.entities.Note>(props.note, params => misskeyApi('notes/replies', params, undefined, replyAbortController.signal), { ascending: true })
	: null;
const hasMoreReplies = ref(replyLoader?.hasMore ?? false);
let disposed = false;
const deletedReplySources = new Map<string, Misskey.entities.Note['deletedBy']>();

useGlobalEvent('notePosted', note => {
	if (!props.detail || props.depth !== 1 || note.replyId == null || deletedReplySources.has(note.id)) return;
	if (note.replyId !== props.note?.id && !replies.value.some(reply => reply.id === note.replyId)) return;
	if (!replies.value.some(reply => reply.id === note.id)) replies.value.push(note);
});

useGlobalEvent('noteDeleted', (noteId, _replyId, _renoteId, eventDeletedBy) => {
	deletedReplySources.set(noteId, eventDeletedBy ?? deletedReplySources.get(noteId));
	if (noteId === props.note?.id) markDeleted(eventDeletedBy);
	replies.value = replies.value.map(reply => reply.id === noteId ? toDeletedNote(reply, eventDeletedBy) : reply);
});

function markDeleted(eventDeletedBy?: Misskey.entities.Note['deletedBy']): void {
	deleted.value = true;
	deletedBy.value = eventDeletedBy ?? deletedBy.value ?? props.note?.deletedBy ?? null;
	if (note != null) Object.assign(note, toDeletedNote(note, deletedBy.value));
}

onBeforeUnmount(() => {
	disposed = true;
	replyAbortController.abort();
});

async function loadReplies(limit = 10): Promise<void> {
	if (disposed || replyLoader == null || loadingReplies.value) return;
	loadingReplies.value = true;
	repliesError.value = false;
	try {
		const result = await replyLoader.loadMore(limit);
		if (disposed) return;
		replies.value.push(...result.notes.filter(note => !replies.value.some(reply => reply.id === note.id)).map(note => deletedReplySources.has(note.id) ? toDeletedNote(note, deletedReplySources.get(note.id)) : note));
		hasMoreReplies.value = result.hasMore;
	} catch {
		if (!disposed) repliesError.value = true;
	} finally {
		if (!disposed) loadingReplies.value = false;
	}
}
</script>

<style lang="scss" module>
.tags { margin-top: 10px; }
</style>
