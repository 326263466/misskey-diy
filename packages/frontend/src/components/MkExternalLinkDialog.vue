<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal ref="modal" preferType="dialog" zPriority="high" :returnFocusTo="returnFocusTo" @click="cancel" @esc="cancel" @closed="emit('closed')">
	<div :class="$style.root" role="dialog" aria-modal="true" :aria-labelledby="titleId" :aria-describedby="descriptionId">
		<div :class="$style.heading">
			<span :class="$style.iconBadge">
				<i class="ti ti-alert-triangle" :class="$style.icon" aria-hidden="true"></i>
			</span>
			<h2 :id="titleId" :class="$style.title">{{ i18n.ts._externalLink.title }}</h2>
		</div>
		<section :class="$style.destination" class="_selectable" dir="ltr">
			<strong :class="$style.linkTitle" :title="displayTitle">{{ displayTitle }}</strong>
			<p :class="$style.url" :title="url">{{ url }}</p>
		</section>
		<p :id="descriptionId" :class="$style.description">{{ i18n.ts._externalLink.description }}</p>
		<div :class="$style.actions">
			<MkButton type="a" :href="url" target="_blank" rel="nofollow noopener noreferrer" rounded @click="cancel">{{ i18n.ts._externalLink.continue }}<i class="ti ti-external-link" :class="$style.newTab" aria-hidden="true"></i></MkButton>
			<MkButton primary rounded autofocus @click="cancel">{{ i18n.ts._externalLink.stay }}</MkButton>
		</div>
	</div>
</MkModal>
</template>

<script lang="ts" setup>
import { computed, useId, useTemplateRef } from 'vue';
import { i18n } from '@/i18n.js';
import MkModal from '@/components/MkModal.vue';
import MkButton from '@/components/MkButton.vue';

const props = defineProps<{
	url: string;
	linkTitle?: string;
	returnFocusTo?: HTMLElement;
}>();

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const modal = useTemplateRef('modal');
const titleId = useId();
const descriptionId = useId();
const host = computed(() => new URL(props.url).host);
const displayTitle = computed(() => props.linkTitle?.trim() || host.value);

function cancel(): void {
	modal.value?.close();
}
</script>

<style lang="scss" module>
.root {
	position: relative;
	margin: auto;
	width: 500px;
	max-width: calc(100vw - 32px);
	box-sizing: border-box;
	padding: 24px;
	background: var(--MI_THEME-panel);
	color: var(--MI_THEME-fg);
	border: var(--MI-divider);
	border-radius: calc(var(--MI-radius) * 1.15);
	overflow: hidden;

	&::before {
		content: '';
		position: absolute;
		inset: 0 0 auto;
		height: 4px;
		background: var(--MI_THEME-warn);
	}
}

.heading {
	display: flex;
	align-items: center;
	gap: 12px;
}

.iconBadge {
	display: grid;
	place-items: center;
	flex: none;
	width: 38px;
	height: 38px;
	border-radius: 12px;
	background: color-mix(in srgb, var(--MI_THEME-warn) 14%, var(--MI_THEME-panel));
	color: var(--MI_THEME-warn);
}

.icon {
	font-size: 20px;
	line-height: 1;
}

.title {
	flex: 1;
	min-width: 0;
	margin: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 1.15em;
	font-weight: bold;
	line-height: 1.4;
}

// 标题最多显示一行，地址最多显示两行；悬停仍可核对完整内容。
.destination {
	margin-top: 18px;
	padding: 14px 16px;
	overflow-wrap: anywhere;
	unicode-bidi: isolate;
	background: var(--MI_THEME-bg);
	border: var(--MI-divider);
	border-radius: calc(var(--MI-radius) * 0.85);
}

.linkTitle {
	display: block;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: var(--MI_THEME-fgHighlighted);
	font-size: 1em;
	line-height: 1.5;
}

.url {
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	margin: 4px 0 0;
	overflow: hidden;
	text-overflow: ellipsis;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.82em;
	line-height: 1.55;
}

.description {
	margin: 14px 2px 0;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.9em;
	line-height: 1.6;
}

// 主按钮放在最右侧，默认焦点仍在“留在本站”。
.actions {
	display: flex;
	justify-content: flex-end;
	flex-wrap: wrap;
	gap: 8px;
	margin-top: 22px;
}

.newTab {
	margin-left: 4px;
}

@media (max-width: 480px) {
	.root {
		padding: 20px;
	}

	.iconBadge {
		width: 34px;
		height: 34px;
		border-radius: 10px;
	}

	.actions {
		> * {
			flex: 1;
		}
	}
}
</style>
