<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<!-- 从左侧滑出的评论区：不离开当前列表即可查看和发表评论。 -->
<template>
<MkModal ref="modal" preferType="side" :returnFocusTo="returnFocusTo" @closed="emit('closed')">
	<section :class="$style.root" role="dialog" aria-modal="true" :aria-labelledby="titleId">
		<header :class="$style.header">
			<h2 :id="titleId" :class="$style.title">{{ i18n.ts._article.comment }}<span v-if="count > 0" :class="$style.count">{{ count }}</span></h2>
			<button type="button" class="_button" :class="$style.close" :title="i18n.ts.close" :aria-label="i18n.ts.close" @click="close"><i class="ti ti-x" aria-hidden="true"></i></button>
		</header>
		<div :class="$style.body">
			<MkComments :source="{ type: 'note', note, initialCount: openedCount }" :panel="false" :showHeading="false" autofocus @countChange="difference => count = Math.max(0, count + difference)" @sourceDeleted="close"/>
		</div>
	</section>
</MkModal>
</template>

<script lang="ts" setup>
import { ref, useId, useTemplateRef } from 'vue';
import type * as Misskey from 'misskey-js';
import MkModal from '@/components/MkModal.vue';
import MkComments from '@/components/MkComments.vue';
import { i18n } from '@/i18n.js';
import { useRouter } from '@/router.js';

const props = defineProps<{
	note: Misskey.entities.Note;
	/** 打开时的评论数；传入帖子的 repliesCount 可能是列表加载时的旧值。 */
	initialCount?: number;
	returnFocusTo?: HTMLElement | null;
}>();

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const modal = useTemplateRef('modal');
const titleId = useId();
const openedCount = props.initialCount ?? props.note.repliesCount;
const count = ref(openedCount);

function close() {
	modal.value?.close();
}

// 抽屉内点击用户或链接跳转后，评论区不应继续盖住新页面。
useRouter().useListener('change', close);

</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-direction: column;
	width: min(420px, 100vw);
	height: 100%;
	height: 100dvh;
	box-sizing: border-box;
	background: var(--MI_THEME-panel);
	box-shadow: 4px 0 24px var(--MI_THEME-shadow);
}

.header {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-shrink: 0;
	min-height: 56px;
	padding: 0 8px 0 var(--MI-cardPadding);
	padding-top: env(safe-area-inset-top);
	border-bottom: var(--MI-divider);
}

.title {
	display: flex;
	align-items: baseline;
	gap: 6px;
	flex: 1;
	min-width: 0;
	margin: 0;
	font-size: 1em;
	font-weight: 700;
}

.count {
	font-weight: normal;
	color: var(--MI_THEME-fgTransparentWeak);
}

.close {
	display: grid;
	place-items: center;
	flex-shrink: 0;
	width: 36px;
	height: 36px;
	border-radius: 50%;
	color: var(--MI_THEME-fgTransparent);

	&:hover {
		color: var(--MI_THEME-fg);
		background: var(--MI_THEME-panelHighlight);
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: 1px;
	}
}

.body {
	flex: 1;
	min-height: 0;
	overflow-y: auto;
	overscroll-behavior: contain;
	padding-bottom: env(safe-area-inset-bottom);
	container-type: inline-size;
}

</style>
