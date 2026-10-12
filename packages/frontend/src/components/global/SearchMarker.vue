<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="root" :class="[$style.root, { [$style.highlighted]: highlighted }]">
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
import { DI } from '@/di.js';

const props = defineProps<{
	markerId?: string;
	label?: string;
	icon?: string;
	keywords?: string[];
	children?: string[];
	inlining?: string[];
}>();

const rootEl = useTemplateRef('root');
const rootElMutationObserver = new MutationObserver(() => {
	checkChildren();
});
const injectedSearchMarkerId = inject(DI.inAppSearchMarkerId, null);
const searchMarkerId = computed(() => injectedSearchMarkerId?.value ?? window.location.hash.slice(1));
const highlighted = ref(props.markerId === searchMarkerId.value);
const isParentOfTarget = computed(() => props.children?.includes(searchMarkerId.value));

function checkChildren() {
	if (isParentOfTarget.value) {
		const el = window.document.querySelector(`[data-in-app-search-marker-id="${searchMarkerId.value}"]`);
		highlighted.value = el == null;
	}
}

watch([
	searchMarkerId,
	() => props.children,
], () => {
	if (props.children != null && props.children.length > 0) {
		checkChildren();
	}
}, { flush: 'post' });

function init() {
	checkChildren();

	if (highlighted.value) {
		rootEl.value?.scrollIntoView({
			behavior: 'smooth',
			block: 'center',
		});
	}

	if (rootEl.value != null) {
		rootElMutationObserver.observe(rootEl.value, {
			childList: true,
			subtree: true,
		});
	}
}

function dispose() {
	rootElMutationObserver.disconnect();
}

onMounted(init);
onActivated(init);
onDeactivated(dispose);
onBeforeUnmount(dispose);
</script>

<style lang="scss" module>
.root {
	position: relative;
}

.highlighted {
	&::after {
		content: '';
		position: absolute;
		inset: -2px;
		border: 2px solid transparent;
		animation: inAppSearchHighlight 2s ease-in-out;
		pointer-events: none;
	}
}

@keyframes inAppSearchHighlight {
	0%, 100% {
		opacity: 0;
		border-color: transparent;
	}
	50% {
		opacity: 1;
		border-color: var(--MI_THEME-accent);
	}
}
</style>
