<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl" class="_gaps" :class="$style.root">
	<div
		v-for="copy in (items.length ? (isScrolling ? 2 : 1) : 0)"
		:key="copy"
		ref="notesMainContainerEl"
		class="_gaps"
		:class="[$style.scrollBox, { [$style.scrollIntro]: scrollState === 'intro', [$style.scrollLoop]: scrollState === 'loop' }]"
		:aria-hidden="copy === 2 ? true : undefined"
		:inert="copy === 2"
		@animationend.self="changeScrollState"
	>
		<template v-for="repeat in repeats" :key="repeat">
			<template v-for="item in items" :key="`${repeat}_${item.type}_${item.content.id}`">
				<MkArticlePreview v-if="item.type === 'article'" :article="item.content" previewOnly inert/>
				<XNote v-else :note="item.content" inert/>
			</template>
		</template>
	</div>
</div>
</template>

<script lang="ts" setup>
import type * as Misskey from 'misskey-js';
import { nextTick, onMounted, onBeforeUnmount, onUpdated, ref, useTemplateRef } from 'vue';
import { getScrollContainer } from '@@/js/scroll.js';
import XNote from '@/pages/welcome.timeline.note.vue';
import MkArticlePreview from '@/components/MkArticlePreview.vue';
import { misskeyApi, misskeyApiGet } from '@/utility/misskey-api.js';
import { instance } from '@/instance.js';

type WelcomeItem = { type: 'article'; content: Misskey.entities.Page } | { type: 'note'; content: Misskey.entities.Note };
const items = ref<WelcomeItem[]>([]);
const repeats = ref(1);
const isScrolling = ref(false);
const scrollState = ref<null | 'intro' | 'loop'>(null);
const rootEl = useTemplateRef('rootEl');
const notesMainContainerEl = useTemplateRef('notesMainContainerEl');
const controller = new AbortController();
let observer: ResizeObserver | undefined;

function fitItems() {
	const group = notesMainContainerEl.value?.[0];
	if (!group || !rootEl.value || items.value.length === 0) return;
	const container = getScrollContainer(group);
	const containerHeight = container ? container.clientHeight : window.innerHeight;
	const gap = parseFloat(getComputedStyle(group).rowGap) || 0;
	const height = (group.offsetHeight + gap) / repeats.value;
	if (group.offsetHeight === 0 || containerHeight === 0) return;
	// 原滚动要求一组内容高于视口；短列表重复补足后沿用同一套衔接动画。
	const requiredRepeats = Math.max(1, Math.floor((containerHeight + gap) / height) + 1);
	if (requiredRepeats !== repeats.value) {
		repeats.value = requiredRepeats;
		return;
	}
	if (scrollState.value === null) scrollState.value = 'intro';
	isScrolling.value = true;
}

function changeScrollState() {
	if (scrollState.value !== 'loop') scrollState.value = 'loop';
}

function canShowContent(): boolean {
	return instance.ugcVisibilityForVisitor !== 'none';
}

async function loadItems() {
	try {
		// 保留原欢迎页的默认热门算法；有结果时不混入其他来源。
		const featured = await misskeyApiGet('notes/featured', {}, controller.signal);
		if (controller.signal.aborted || instance.ugcVisibilityForVisitor === 'none') return;
		if (featured.length > 0) {
			items.value = featured.map(note => ({ type: 'note', content: note }));
		} else {
			const [recent, articles] = await Promise.all([
				misskeyApi('notes/local-timeline', { limit: 10, withRenotes: false }, null, controller.signal).catch(() => []),
				misskeyApi('articles/list', { limit: 10 }, null, controller.signal).catch(() => []),
			]);
			if (controller.signal.aborted || !canShowContent()) return;
			const notes = [...new Map(recent.filter(note => note.visibility === 'public' && !note.isHidden).map(note => [note.id, note])).values()];
			const publicArticles = instance.ugcVisibilityForVisitor === 'local' ? articles.filter(article => article.user.host == null) : articles;
			items.value = Array.from({ length: Math.max(publicArticles.length, notes.length) }, (_, i) => [
				...(publicArticles[i] ? [{ type: 'article' as const, content: publicArticles[i] }] : []),
				...(notes[i] ? [{ type: 'note' as const, content: notes[i] }] : []),
			]).flat();
		}
		await nextTick();
		if (!controller.signal.aborted) {
			fitItems();
			const group = notesMainContainerEl.value?.[0];
			if (group) observer?.observe(group);
		}
	} catch {
		// 默认接口失败不等于没有公开内容，不用其他来源绕过它的限制。
	}
}

onMounted(() => {
	observer = new ResizeObserver(fitItems);
	if (rootEl.value) observer.observe(rootEl.value);
	void loadItems();
});
onUpdated(fitItems);
onBeforeUnmount(() => {
	controller.abort();
	observer?.disconnect();
});
</script>

<style lang="scss" module>
@keyframes scrollIntro {
	from { transform: translate3d(0, 0, 0); }
	to { transform: translate3d(0, calc(-100% - 128px - var(--MI-margin)), 0); }
}

@keyframes scrollConstant {
	from { transform: translate3d(0, -128px, 0); }
	to { transform: translate3d(0, calc(-100% - 128px - var(--MI-margin)), 0); }
}

.root { text-align: right; }
.scrollBox {
	flex-shrink: 0;
	&.scrollIntro { animation: scrollIntro 30s linear forwards; }
	&.scrollLoop { animation: scrollConstant 30s linear infinite; }
}
.root:hover .scrollBox { animation-play-state: paused; }
@media (prefers-reduced-motion: reduce) { .scrollBox.scrollIntro, .scrollBox.scrollLoop { animation: none; } }
</style>
