<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :key="note.id" :class="$style.note">
	<div class="_panel _gaps_s" :class="$style.content">
		<div v-if="note.cw != null" :class="$style.richcontent">
			<MkCwButton v-model="showContent" :text="note.text" :renote="note.renote" :files="note.files" :poll="note.poll">
				<Mfm v-if="note.cw != ''" :text="note.cw" :author="note.user"/>
			</MkCwButton>
			<div v-if="showContent">
				<MkA v-if="note.replyId" class="reply _iconButton" :to="`/notes/${note.replyId}`" :aria-label="i18n.ts.reply"><i class="ti ti-message-circle"></i></MkA>
				<Mfm v-if="note.text" :text="note.text" :author="note.user"/>
				<MkA v-if="note.renoteId" class="rp" :to="`/notes/${note.renoteId}`">{{ i18n.ts.renote }}: ...</MkA>
			</div>
		</div>
		<div v-else-if="note.text || note.replyId || note.renoteId" ref="noteTextEl" :class="[$style.text, { [$style.collapsed]: shouldCollapse }]">
			<MkA v-if="note.replyId" class="reply _iconButton" :to="`/notes/${note.replyId}`" :aria-label="i18n.ts.reply"><i class="ti ti-message-circle"></i></MkA>
			<Mfm v-if="note.text" :text="note.text" :author="note.user"/>
			<MkA v-if="note.renoteId" class="rp" :to="`/notes/${note.renoteId}`">{{ i18n.ts.renote }}: ...</MkA>
		</div>
		<div v-if="note.files && note.files.length > 0 && (note.cw == null || showContent)" :class="$style.media" data-note-interactive>
			<MkMediaList :mediaList="note.files.slice(0, 4)" :user="note.user"/>
		</div>
		<MkPoll v-if="note.poll && (note.cw == null || showContent)" :class="$style.poll" :noteId="note.id" v-bind="note.poll" :expiresAt="note.poll.expiresAt" :author="note.user" readOnly/>
		<div v-if="note.reactionCount > 0" :class="$style.reactions">
			<MkReactionsViewer :noteId="note.id" :reactions="note.reactions" :reactionEmojis="note.reactionEmojis" :myReactions="note.myReactions"/>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { ref, useTemplateRef, onUpdated, onMounted } from 'vue';
import * as Misskey from 'misskey-js';
import MkReactionsViewer from '@/components/MkReactionsViewer.vue';
import MkMediaList from '@/components/MkMediaList.vue';
import MkPoll from '@/components/MkPoll.vue';
import MkCwButton from '@/components/MkCwButton.vue';
import { i18n } from '@/i18n.js';

defineProps<{
	note: Misskey.entities.Note;
}>();

const noteTextEl = useTemplateRef('noteTextEl');
const shouldCollapse = ref(false);
const showContent = ref(false);

function calcCollapse() {
	if (noteTextEl.value) {
		const height = noteTextEl.value.scrollHeight;
		if (height > 200) {
			shouldCollapse.value = true;
		}
	}
}

onMounted(() => {
	calcCollapse();
});

onUpdated(() => {
	calcCollapse();
});
</script>

<style lang="scss" module>
.note {
	margin-left: auto;
	min-width: 0;
	max-width: 100%;
}

.text {
	position: relative;
	max-height: 200px;
	overflow: hidden;

	&.collapsed::after {
		content: '';
		position: absolute;
		bottom: 0;
		left: 0;
		width: 100%;
		height: 64px;
		background: linear-gradient(0deg, var(--MI_THEME-panel), color(from var(--MI_THEME-panel) srgb r g b / 0));
	}
}

.content {
	box-sizing: border-box;
	text-align: left;
	padding: var(--MI-cardPadding);
	margin: 0 0 0 auto;
	width: fit-content;
	max-width: 100%;
	border-radius: var(--MI-cardRadius);
}

.reactions {
	// 正文与回应共用卡片内边距，只由父容器安排它们之间的间隔。
	> * { margin-top: 0; }
}

.richcontent {
	min-width: min(250px, 100%);
}

.media {
	// 媒体容器隔离了固有尺寸，先给首选宽度，避免 fit-content 把纯媒体帖收缩到零。
	width: 250px;
	min-width: 100%;
	max-width: 100%;
}

.poll {
	width: 400px;
	max-width: 100%;
}
</style>
