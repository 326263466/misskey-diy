<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkCommentSection ref="section" :count="count" :showHeading="showHeading" :panel="panel" :showThreads="showThreads" :loading="loading" :error="error" :hasMore="hasMore" :items="visibleReplies" :loadMore="loadMore" :active="pageActive">
	<template #composer>
		<MkPostForm v-if="$i && !note.isHidden && !note.isDeleted" :key="note.id" ref="commentForm" :reply="note" commentMode fixed :autofocus="autofocus"/>
		<MkCommentGuest v-else-if="!$i && !note.isHidden && !note.isDeleted" :key="note.id"/>
	</template>
	<template #default="{ items: pageReplies }">
		<MkNoteSub v-for="reply in pageReplies" :key="reply.id" :note="reply" detail :threadAuthor="threadAuthor ?? getNoteThreadAuthor(note)" :parentComment="note"/>
	</template>
</MkCommentSection>
</template>

<script lang="ts" setup>
import { computed, inject, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue';
import type { entities } from 'misskey-js';
import MkCommentSection, { COMMENT_PAGE_SIZE } from '@/components/MkCommentSection.vue';
import MkPostForm from '@/components/MkPostForm.vue';
import MkNoteSub from '@/components/MkNoteSub.vue';
import MkCommentGuest from '@/components/MkCommentGuest.vue';
import { $i } from '@/i.js';
import { DI } from '@/di.js';
import { useGlobalEvent } from '@/events.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { getNoteThreadAuthor } from '@/utility/note-display.js';
import { toDeletedNote } from '@/utility/deleted-note.js';
import { isNoteBlocked } from '@/utility/user-blocking.js';
import { useNoteCapture } from '@/composables/use-note-capture.js';

const props = withDefaults(defineProps<{
	note: entities.Note;
	threadAuthor?: entities.UserLite | null;
	initialCount?: number;
	showHeading?: boolean;
	panel?: boolean;
	showThreads?: boolean;
	autofocus?: boolean;
}>(), { showHeading: true, panel: true, showThreads: true });

const emit = defineEmits<{
	(event: 'countChange', difference: number): void;
	(event: 'sourceDeleted'): void;
}>();
const LIMIT = COMMENT_PAGE_SIZE + 1;
const commentForm = useTemplateRef('commentForm');
const section = useTemplateRef('section');
const pageActive = inject(DI.pageActive, ref(true));
const replies = ref<entities.Note[]>([]);
const visibleReplies = computed(() => replies.value.filter(reply => !isNoteBlocked(reply)));
const { $note } = useNoteCapture({
	note: { ...props.note, repliesCount: props.initialCount ?? props.note.repliesCount },
	parentNote: null,
	active: computed(() => pageActive.value && !props.note.isHidden && !props.note.isDeleted),
	mock: inject(DI.mock, false),
});
const count = computed(() => $note.repliesCount);
watch(count, (value, previous) => emit('countChange', value - previous));
const loading = ref(false);
const error = ref(false);
const hasMore = ref(true);
const deletedSources = new Map<string, entities.Note['deletedBy']>();
let cursor: string | undefined;
let controller = new AbortController();

function focus() {
	commentForm.value?.focus();
}

async function loadMore() {
	if (!pageActive.value || loading.value || !hasMore.value || controller.signal.aborted) return;
	const current = controller;
	const noteId = props.note.id;
	loading.value = true;
	error.value = false;
	try {
		const result = await misskeyApi('notes/children', { noteId, limit: LIMIT, untilId: cursor }, undefined, current.signal);
		if (current !== controller || current.signal.aborted) return;
		const known = new Set(replies.value.map(reply => reply.id));
		const chunk = result.slice(0, COMMENT_PAGE_SIZE);
		replies.value.push(...chunk.filter(reply => !known.has(reply.id)).map(reply => deletedSources.has(reply.id) ? toDeletedNote(reply, deletedSources.get(reply.id)) : reply));
		const nextCursor = chunk.at(-1)?.id;
		hasMore.value = result.length > COMMENT_PAGE_SIZE && nextCursor !== cursor;
		cursor = nextCursor;
	} catch {
		if (current === controller && !current.signal.aborted) error.value = true;
	} finally {
		if (current === controller && !current.signal.aborted) loading.value = false;
	}
}

useGlobalEvent('notePosted', posted => {
	if (controller.signal.aborted || props.note.isDeleted || posted.replyId !== props.note.id || deletedSources.has(posted.id) || replies.value.some(reply => reply.id === posted.id)) return;
	replies.value.unshift(posted);
	// 新评论在第一页顶部，切回第一页才能看到。
	section.value?.revealItem(0);
});

useGlobalEvent('noteDeleted', (noteId, _replyId, _renoteId, deletedBy) => {
	if (noteId === props.note.id) {
		controller.abort();
		replies.value = [];
		emit('sourceDeleted');
		return;
	}
	deletedSources.set(noteId, deletedBy ?? deletedSources.get(noteId));
	const target = replies.value.find(reply => reply.id === noteId);
	if (!target || target.isDeleted) return;
	// 帖子评论删除后保留占位和后代，与文章评论的提升规则不同。
	replies.value = replies.value.map(reply => reply.id === noteId ? toDeletedNote(reply, deletedBy) : reply);
});

watch(() => props.note.id, () => {
	controller.abort();
	controller = new AbortController();
	replies.value = [];
	deletedSources.clear();
	cursor = undefined;
	loading.value = false;
	error.value = false;
	hasMore.value = true;
	void loadMore();
}, { immediate: true });

onBeforeUnmount(() => { controller.abort(); });
defineExpose({ focus });
</script>
