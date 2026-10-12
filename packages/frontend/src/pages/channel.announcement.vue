<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<div :id="contentId" :class="{ [$style.collapsed]: !expanded }">
		<div ref="content" class="_selectable" :class="$style.content"><Mfm :text="text" :isNote="false"/></div>
	</div>
	<button v-if="overflows" type="button" class="_textButton" :class="$style.toggle" :aria-expanded="expanded" :aria-controls="contentId" @click="expanded = !expanded">
		{{ expanded ? i18n.ts.showLess : i18n.ts._channel.expandAnnouncement }}
	</button>
</div>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, ref, useId, useTemplateRef, watch } from 'vue';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	text: string;
}>();

const contentId = useId();
const content = useTemplateRef('content');
const expanded = ref(false);
const overflows = ref(false);

// 观察未裁剪的正文，换行、表情加载和栏宽变化后仍能判断是否超过五行。
const observer = new ResizeObserver(() => {
	if (!content.value) return;
	const lineHeight = parseFloat(getComputedStyle(content.value).lineHeight);
	overflows.value = content.value.getBoundingClientRect().height > lineHeight * 5 + 1;
});

watch(() => props.text, () => { expanded.value = false; });
onMounted(() => { if (content.value) observer.observe(content.value); });
onUnmounted(() => { observer.disconnect(); });
</script>

<style lang="scss" module>
.root {
	min-width: 0;
	line-height: 1.7;
	overflow-wrap: anywhere;
}

.collapsed {
	max-height: 8.5em;
	overflow: hidden;
}

.content {
	display: flow-root;
}

.toggle {
	margin-top: 6px;
}
</style>
