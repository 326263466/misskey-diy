<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-if="note" :class="$style.root">
	<MkAvatar :class="[$style.avatar, prefer.s.useStickyIcons ? $style.useSticky : null]" :user="note.user" link preview/>
	<div :class="$style.main">
		<MkNoteHeader :class="$style.header" :note="note" :mini="true"/>
		<div>
			<p v-if="note.cw != null" :class="$style.cw">
				<Mfm v-if="note.cw != ''" style="margin-right: 8px;" :text="note.cw" :author="note.user" :nyaize="'respect'" :emojiUrls="note.emojis"/>
				<MkCwButton v-model="showContent" :text="note.text" :files="note.files" :poll="note.poll"/>
			</p>
			<div v-show="note.cw == null || showContent">
				<MkSubNoteContent :class="$style.text" :note="note" :relocateTags="true"/>
				<MkNoteTags :class="$style.tags" :tags="topics.tags"/>
			</div>
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
import { prefer } from '@/preferences.js';
import { useGlobalEvent } from '@/events.js';
import MkNoteTags from '@/components/MkNoteTags.vue';
import { getNoteTopics } from '@/utility/note-topics.js';
import { getDeletedText } from '@/utility/deleted-note.js';

const props = defineProps<{
	note: Misskey.entities.Note | null;
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
	display: flex;
	margin: 0;
	padding: 0;
	font-size: 0.95em;
}

.avatar {
	flex-shrink: 0;
	display: block;
	margin: 0 10px 0 0;
	width: 34px;
	height: 34px;
	border-radius: 8px;

	&.useSticky {
		position: sticky !important;
		top: calc(16px + var(--MI-stickyTop, 0px));
		left: 0;
	}
}

.main {
	flex: 1;
	min-width: 0;
}

.header {
	margin-bottom: 2px;
}

.cw {
	cursor: default;
	display: block;
	margin: 0;
	padding: 0;
	overflow-wrap: break-word;
}

.text {
	cursor: default;
	margin: 0;
	padding: 0;
}

.tags {
	margin-top: 10px;
}

@container (min-width: 250px) {
	.avatar {
		margin: 0 10px 0 0;
		width: 40px;
		height: 40px;
	}
}

@container (min-width: 350px) {
	.avatar {
		margin: 0 10px 0 0;
		width: 44px;
		height: 44px;
	}
}

@container (min-width: 500px) {
	.avatar {
		margin: 0 12px 0 0;
		width: 48px;
		height: 48px;
	}
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
