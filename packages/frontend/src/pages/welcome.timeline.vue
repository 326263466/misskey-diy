<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl" :class="$style.root">
	<div v-for="copy in (notes.length ? 2 : 0)" :key="copy" :class="$style.scrollBox" :aria-hidden="copy === 2 ? true : undefined" :inert="copy === 2">
		<div ref="notesMainContainerEl" class="_gaps">
			<template v-for="repeat in repeats" :key="repeat">
				<XNote v-for="note in notes" :key="`${repeat}_${note.id}`" :class="$style.note" :note="note"/>
			</template>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import type * as Misskey from 'misskey-js';
import { nextTick, onMounted, onBeforeUnmount, ref, useTemplateRef } from 'vue';
import XNote from '@/pages/welcome.timeline.note.vue';
import { misskeyApi, misskeyApiGet } from '@/utility/misskey-api.js';

const notes = ref<Misskey.entities.Note[]>([]);
const repeats = ref(1);
const rootEl = useTemplateRef('rootEl');
const notesMainContainerEl = useTemplateRef('notesMainContainerEl');
const controller = new AbortController();
let timer: number | undefined;
let observer: ResizeObserver | undefined;

function fitNotes() {
	const group = notesMainContainerEl.value?.[0];
	if (!group || !rootEl.value || notes.value.length === 0) return;
	// 补回末尾间距，避免重复次数变化导致高度估算抖动。
	const gap = parseFloat(getComputedStyle(group).rowGap) || 0;
	const height = (group.offsetHeight + gap) / repeats.value;
	if (height > 0) repeats.value = Math.max(1, Math.ceil(rootEl.value.clientHeight / height) + 1);
}

async function refreshNotes() {
	const featured = await misskeyApiGet('notes/featured', { limit: 20 }, undefined, controller.signal).catch(() => null);
	if (controller.signal.aborted) return;
	const recent = (featured?.length ?? 0) < 20
		? await misskeyApi('notes', { local: true, limit: 20 }, undefined, controller.signal).catch(() => null)
		: [];
	if (controller.signal.aborted) return;
	if (featured != null || recent != null) {
		// 热门不足时补最近的公开帖子，重复铺满滚动区域。
		notes.value = [...new Map([...(featured ?? []), ...(recent ?? [])].map(note => [note.id, note])).values()].slice(0, 20);
		await nextTick();
		if (controller.signal.aborted) return;
		fitNotes();
		const group = notesMainContainerEl.value?.[0];
		if (group) observer?.observe(group);
	}
	timer = window.setTimeout(refreshNotes, 60000);
}

onMounted(() => {
	observer = new ResizeObserver(fitNotes);
	if (rootEl.value) observer.observe(rootEl.value);
	void refreshNotes();
});

onBeforeUnmount(() => {
	controller.abort();
	window.clearTimeout(timer);
	observer?.disconnect();
});
</script>

<style lang="scss" module>
@keyframes scroll {
	to {
		transform: translateY(-100%);
	}
}

.root {
	text-align: right;
	overflow: hidden;
}

.scrollBox {
	padding-bottom: var(--MI-margin);
	animation: scroll 60s linear infinite;
}

.root:has(.note:hover) .scrollBox,
.root:focus-within .scrollBox {
	animation-play-state: paused;
}

@media (prefers-reduced-motion: reduce) {
	.scrollBox {
		animation: none;
	}
}
</style>
