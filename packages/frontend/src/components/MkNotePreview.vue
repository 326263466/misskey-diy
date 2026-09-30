<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<MkAvatar :class="$style.avatar" :user="user"/>
	<div :class="$style.main">
		<div :class="$style.header">
			<MkUserName :user="user" :nowrap="true"/>
		</div>
		<MkUserWork :user="user"/>
		<div>
			<MkCwButton v-if="useCw" v-model="showContent" :text="text.trim()" :files="files" :poll="poll">
				<Mfm v-if="cw != null && cw != ''" :text="cw" :author="user" :nyaize="'respect'" :i="user"/>
			</MkCwButton>
			<div v-show="!useCw || showContent">
				<Mfm :text="text.trim()" :parsedNodes="topics.nodes" :author="user" :nyaize="'respect'" :i="user"/>
				<MkNoteTags v-if="topics.tags.length > 0" :tags="topics.tags" :class="$style.tags"/>
			</div>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import * as Misskey from 'misskey-js';
import type { PollEditorModelValue } from '@/components/MkPollEditor.vue';
import MkCwButton from '@/components/MkCwButton.vue';
import MkNoteTags from '@/components/MkNoteTags.vue';
import MkUserWork from '@/components/MkUserWork.vue';
import { getNoteTopics } from '@/utility/note-topics.js';

const showContent = ref(false);

const props = defineProps<{
	text: string;
	files: Misskey.entities.DriveFile[];
	poll?: PollEditorModelValue;
	useCw: boolean;
	cw: string | null;
	user: Misskey.entities.User;
}>();

const topics = computed(() => getNoteTopics({ text: props.text.trim() }));
</script>

<style lang="scss" module>
.root {
	display: flex;
	margin: 0;
	padding: 0;
	overflow: clip;
	font-size: 0.95em;
}

.avatar {
	flex-shrink: 0 !important;
	display: block !important;
	margin: 0 10px 0 0 !important;
	width: 40px !important;
	height: 40px !important;
	border-radius: 8px !important;
	pointer-events: none !important;
}

.main {
	flex: 1;
	min-width: 0;
}

.tags {
	margin-top: 8px;
}

.header {
	margin-bottom: 2px;
	font-weight: bold;
	width: 100%;
	overflow: clip;
    text-overflow: ellipsis;
}

@container (min-width: 350px) {
	.avatar {
		margin: 0 10px 0 0 !important;
		width: 44px !important;
		height: 44px !important;
	}
}

@container (min-width: 500px) {
	.avatar {
		margin: 0 12px 0 0 !important;
		width: 48px !important;
		height: 48px !important;
	}
}
</style>
