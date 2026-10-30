<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkArticleComments v-if="source.type === 'article'" :key="source.articleId" ref="articleComments" :articleId="source.articleId" :authorId="source.authorId" :count="source.count" :showHeading="showHeading" :panel="panel" :showThreads="showThreads" :autofocus="autofocus" :composerDocked="composerDocked" @countChange="difference => emit('countChange', difference)">
	<template v-if="$slots.composerActions" #composerActions><slot name="composerActions"></slot></template>
</MkArticleComments>
<MkNoteComments v-else :key="source.note.id" ref="noteComments" :note="source.note" :threadAuthor="source.threadAuthor" :initialCount="source.initialCount" :showHeading="showHeading" :panel="panel" :showThreads="showThreads" :autofocus="autofocus" @countChange="difference => emit('countChange', difference)" @sourceDeleted="emit('sourceDeleted')"/>
</template>

<script lang="ts" setup>
import { defineAsyncComponent, useTemplateRef } from 'vue';
import type { CommentSource } from '@/types/comments.js';

const MkArticleComments = defineAsyncComponent(() => import('@/components/MkArticleComments.vue'));
const MkNoteComments = defineAsyncComponent(() => import('@/components/MkNoteComments.vue'));

// 入口只选择数据适配器，评论结构和样式统一由公共组件维护。
withDefaults(defineProps<{
	source: CommentSource;
	showHeading?: boolean;
	panel?: boolean;
	showThreads?: boolean;
	autofocus?: boolean;
	composerDocked?: boolean;
}>(), { showHeading: true, panel: true, showThreads: true });

const emit = defineEmits<{
	(event: 'countChange', difference: number): void;
	(event: 'sourceDeleted'): void;
}>();
const articleComments = useTemplateRef('articleComments');
const noteComments = useTemplateRef('noteComments');

function focus() {
	(articleComments.value ?? noteComments.value)?.focus();
}

async function reload() {
	await articleComments.value?.reload();
}

defineExpose({ focus, reload });
</script>
