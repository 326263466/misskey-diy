<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="cpjygsrt">
	<header>
		<div class="title"><slot name="header"></slot></div>
		<div class="buttons">
			<slot name="func"></slot>
			<button v-if="removable" class="_button" @click="remove()">
				<i class="ti ti-trash"></i>
			</button>
			<button v-if="draggable" class="drag-handle _button" tabindex="-1" :draggable="true" @dragstart.stop="dragStartCallback">
				<i class="ti ti-menu-2"></i>
			</button>
			<button type="button" class="_button" :aria-label="i18n.ts.details" :aria-expanded="showBody" :aria-controls="bodyId" @click="toggleContent(!showBody)">
				<template v-if="showBody"><i class="ti ti-chevron-up"></i></template>
				<template v-else><i class="ti ti-chevron-down"></i></template>
			</button>
		</div>
	</header>
	<Transition :css="prefer.s.animation" name="vertical">
		<div v-show="showBody" :id="bodyId" class="body" :inert="!showBody">
			<div class="bodyInner"><slot></slot></div>
		</div>
	</Transition>
</div>
</template>

<script lang="ts" setup>
import { ref, useId } from 'vue';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';

const props = withDefaults(defineProps<{
	expanded?: boolean;
	removable?: boolean;
	draggable?: boolean;
	dragStartCallback?: (ev: DragEvent) => void;
}>(), {
	expanded: true,
	removable: true,
});

const emit = defineEmits<{
	(ev: 'toggle', show: boolean): void;
	(ev: 'remove'): void;
}>();

const showBody = ref(props.expanded);
const bodyId = useId();

function toggleContent(show: boolean) {
	showBody.value = show;
	emit('toggle', show);
}

function remove() {
	emit('remove');
}
</script>

<style lang="scss" scoped>
.vertical-enter-active,
.vertical-leave-active {
	overflow: clip;
	transition: grid-template-rows 250ms ease;
}

.vertical-enter-from,
.vertical-leave-to {
	grid-template-rows: 0fr !important;
}

.cpjygsrt {
	position: relative;
	overflow: hidden;
	background: var(--MI_THEME-panel);
	border: solid 2px var(--MI_THEME-divider);
	border-radius: 8px;

	&:hover {
		border-color: var(--MI_THEME-inputBorderHover);
	}

	&.warn {
		border-color: var(--MI_THEME-warn);
	}

	&.error {
		border-color: var(--MI_THEME-error);
	}

	> header {
		background: var(--MI_THEME-panelHighlight);
		color: var(--MI_THEME-fg);

		> .title {
			z-index: 1;
			margin: 0;
			padding: 0 var(--MI-cardPadding);
			line-height: 42px;
			font-size: 0.9em;
			font-weight: bold;
			box-shadow: 0 1px rgba(#000, 0.07);

			> i {
				margin-right: 6px;
			}

			&:empty {
				display: none;
			}
		}

		> .buttons {
			position: absolute;
			z-index: 2;
			top: 0;
			right: 0;

			> button {
				padding: 0;
				width: 42px;
				font-size: 0.9em;
				line-height: 42px;
			}

			.drag-handle {
				cursor: move;
			}
		}
	}

	> .body {
		display: grid;
		grid-template-rows: 1fr;

		> .bodyInner {
			min-height: 0;
			display: flow-root;
		}
	}
}
</style>
