<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-if="note" :class="$style.root">
	<MkNoteHeader :class="$style.header" :note="note" :mini="true">
		<template #avatar>
			<MkAvatar :class="$style.avatar" :user="note.user" link preview/>
		</template>
	</MkNoteHeader>
	<div>
		<MkCwButton v-if="note.cw != null" v-model="showContent" :text="note.text" :files="note.files" :poll="note.poll">
			<Mfm v-if="note.cw != ''" :text="note.cw" :author="note.user" :nyaize="'respect'" :emojiUrls="note.emojis"/>
		</MkCwButton>
		<div v-show="note.cw == null || showContent">
			<MkSubNoteContent :class="[$style.text, { [$style.clamp]: compact }]" :note="note" :relocateTags="true"/>
			<MkNoteTags :class="$style.tags" :tags="topics.tags" :channel="note.channel"/>
		</div>
	</div>
</div>
<div v-else :class="$style.deleted">
	{{ getDeletedText(deletedBy) }}
</div>
</template>

<script lang="ts" setup>
import { ref, computed, shallowRef } from 'vue';
import * as Misskey from 'misskey-js';
import type { NoteEditContent } from '@/events.js';
import MkNoteHeader from '@/components/MkNoteHeader.vue';
import MkSubNoteContent from '@/components/MkSubNoteContent.vue';
import MkCwButton from '@/components/MkCwButton.vue';
import { i18n } from '@/i18n.js';
import { useGlobalEvent } from '@/events.js';
import MkNoteTags from '@/components/MkNoteTags.vue';
import { getNoteTopics } from '@/utility/note-topics.js';
import { getDeletedText } from '@/utility/deleted-note.js';

const props = defineProps<{
	note: Misskey.entities.Note | null;
	compact?: boolean;
}>();

const showContent = ref(false);
const edited = shallowRef<(NoteEditContent & { id: string }) | null>(null);
const deleted = ref(false);
const deletedBy = ref<Misskey.entities.Note['deletedBy']>(props.note?.deletedBy ?? null);
const note = computed(() => props.note == null || props.note.isDeleted || deleted.value ? null : edited.value?.id === props.note.id ? { ...props.note, ...edited.value } : props.note);
const topics = computed(() => note.value == null ? { tags: [] } : getNoteTopics(note.value));
useGlobalEvent('noteDeleted', (id, _replyId, _renoteId, eventDeletedBy) => {
	if (id === props.note?.id) {
		deleted.value = true;
		deletedBy.value = eventDeletedBy ?? deletedBy.value;
	}
});
useGlobalEvent('noteEdited', (id, content) => {
	if (id === props.note?.id && !deleted.value) {
		const fields = Object.fromEntries(Object.entries(content).filter(([, value]) => value !== undefined)) as NoteEditContent;
		edited.value = { ...edited.value, id, ...fields };
	}
});
</script>

<style lang="scss" module>
.root {
	margin: 0;
	padding: 0;
	font-size: 0.95em;
}

// 头像内联在名字行前，时间与内容块都从卡片内边距处左对齐
.header {
	margin-bottom: 2px;
}

.avatar {
	flex-shrink: 0;
	display: block;
	width: 20px;
	height: 20px;
	border-radius: 4px;
}

.text {
	cursor: default;
	margin: 0;
	padding: 0;
}

.clamp {
	> div:first-child {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		overflow: hidden;
	}
}

.tags {
	margin-top: 10px;
}

.deleted {
	text-align: center;
	padding: 8px !important;
	--color: light-dark(rgba(0, 0, 0, 0.05), rgba(0, 0, 0, 0.15));
	background-size: auto auto;
	background-image: repeating-linear-gradient(135deg, transparent, transparent 10px, var(--color) 4px, var(--color) 14px);
	border-radius: 8px;
}
</style>
