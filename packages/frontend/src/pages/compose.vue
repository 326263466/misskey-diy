<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<MkPostForm
		:key="formSession"
		ref="form"
		:class="$style.editor"
		:maximized="true"
		freezeAfterPosted
		@posted="onPosted"
		@cancel="leave"
		@esc="leave"
	>
		<template #headerLeading>
			<button type="button" class="_button" :class="$style.back" :aria-label="i18n.ts.goBack" :disabled="leaving" @click="leave"><i class="ti ti-arrow-left" aria-hidden="true"></i></button>
			<h1 :class="$style.title">{{ i18n.ts.newNote }}</h1>
		</template>
	</MkPostForm>
</div>
</template>

<script lang="ts" setup>
import { inject, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue';
import MkPostForm from '@/components/MkPostForm.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { useRouter } from '@/router.js';
import { DI } from '@/di.js';

const router = useRouter();
const form = useTemplateRef('form');
const leaving = ref(false);
const formSession = ref(0);
let posted = false;
const active = inject(DI.pageActive, ref(true));

async function canLeave() {
	if (leaving.value || !form.value) return false;
	leaving.value = true;
	try {
		if (!await form.value.canClose(false)) return false;
		form.value.abortUploader();
		return true;
	} finally {
		leaving.value = false;
	}
}

function removeGuard() {
	if (router.beforeLeave === canLeave) router.beforeLeave = null;
}

watch(active, enabled => {
	if (!enabled) {
		removeGuard();
		// 发布后的冻结表单不能随历史前进恢复为可编辑草稿。
		if (posted) { formSession.value++; posted = false; }
		return;
	}
	router.beforeLeave = canLeave;
}, { immediate: true, flush: 'sync' });
onBeforeUnmount(removeGuard);

function onPosted() {
	posted = true;
	goBack();
}

function goBack() {
	if (router.canGoBack.value) router.back();
	else router.push('/timeline');
}

function leave() {
	if (!leaving.value) goBack();
}

definePage({
	title: i18n.ts.newNote,
	icon: 'ti ti-pencil',
	needWideArea: true,
});
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-direction: column;
	height: 100%;
	min-height: 0;
	background: var(--MI_THEME-panel);
}

.editor {
	flex: 1;
	min-height: 0;
	border-radius: 0;
	padding-bottom: env(safe-area-inset-bottom);
}

.back {
	display: grid;
	place-items: center;
	flex-shrink: 0;
	width: var(--MI-mobileTouchTarget);
	height: var(--MI-mobileTouchTarget);
	border-radius: var(--MI-radius);

	&:hover:not(:disabled) {
		color: var(--MI_THEME-accent);
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: -2px;
	}
}

.title {
	min-width: 0;
	margin: 0;
	font-size: 1em;
	font-weight: 600;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
</style>
