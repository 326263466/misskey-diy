<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="root" :class="$style.root">
	<slot :isParentOfTarget="isParentOfTarget"></slot>
</div>
</template>

<script lang="ts" setup>
import {
	onActivated,
	onDeactivated,
	onMounted,
	onBeforeUnmount,
	watch,
	computed,
	ref,
	useTemplateRef,
	inject,
} from 'vue';
import { getScrollContainer, getStickyBottom, getStickyTop } from '@@/js/scroll.js';
import { DI } from '@/di.js';
import { highlightTarget } from '@/utility/highlight-target.js';

const props = defineProps<{
	markerId?: string;
	label?: string;
	icon?: string;
	keywords?: string[];
	children?: string[];
	inlining?: string[];
}>();

const rootEl = useTemplateRef('root');
const restoringPosition = inject(DI.routeScrollHasSnapshot, ref(false));
const pageActive = inject(DI.pageActive, ref(true));
const rootElMutationObserver = new MutationObserver(() => {
	checkChildren();
});
const injectedSearchMarkerId = inject(DI.inAppSearchMarkerId, null);
const searchMarkerId = computed(() => injectedSearchMarkerId?.value ?? window.location.hash.slice(1));
const highlighted = ref(props.markerId === searchMarkerId.value);
const isParentOfTarget = computed(() => props.children?.includes(searchMarkerId.value));
let cancelHighlight: (() => void) | null = null;
let observing = false;

function checkChildren() {
	const child = isParentOfTarget.value
		? rootEl.value?.querySelector(`[data-in-app-search-marker-id="${CSS.escape(searchMarkerId.value)}"]`)
		: null;
	highlighted.value = props.markerId === searchMarkerId.value || (isParentOfTarget.value === true && child == null);
}

watch([
	searchMarkerId,
	() => props.children,
], () => {
	checkChildren();
}, { flush: 'post' });

watch(highlighted, value => {
	if (value && observing) applyHighlight();
	else clearHighlight();
}, { flush: 'sync' });

function applyHighlight() {
	const root = rootEl.value;
	if (!root || !pageActive.value || restoringPosition.value) return;
	clearHighlight();
	// 命中分组时只提示标题，命中字段时提示该字段，不染整张设置卡片。
	const target = root.querySelector<HTMLElement>('[data-target-highlight-surface]') ?? root;
	const container = getScrollContainer(target);
	const topInset = getStickyTop(target, container) + 16;
	const bottomInset = getStickyBottom(target, container) + 16;
	const height = (container?.clientHeight ?? window.innerHeight) - topInset - bottomInset;
	const bounds = target.getBoundingClientRect();
	const top = (container?.scrollTop ?? window.scrollY) + bounds.top - (container?.getBoundingClientRect().top ?? 0)
		- topInset - Math.max(0, (height - bounds.height) / 2);
	cancelHighlight = highlightTarget(target, { scroll: { container: container ?? window, top } });
}

function init() {
	if (observing || !pageActive.value) return;
	checkChildren();

	if (highlighted.value) applyHighlight();

	if (rootEl.value != null) {
		observing = true;
		rootElMutationObserver.observe(rootEl.value, {
			childList: true,
			subtree: true,
		});
	}
}

function clearHighlight() {
	cancelHighlight?.();
	cancelHighlight = null;
}

function dispose() {
	rootElMutationObserver.disconnect();
	observing = false;
	clearHighlight();
}

watch(pageActive, active => { if (active) init(); else dispose(); }, { flush: 'post' });
onMounted(init);
onActivated(init);
onDeactivated(dispose);
onBeforeUnmount(dispose);
</script>

<style lang="scss" module>
.root {
	position: relative;
}
</style>
