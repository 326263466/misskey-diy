<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal ref="modal" preferType="dialog" zPriority="high" :returnFocusTo="returnFocusTo" @click="cancel" @esc="cancel" @closed="emit('closed')">
	<div :class="$style.root" role="dialog" aria-modal="true" :aria-labelledby="titleId" :aria-describedby="descriptionId">
		<i class="ti ti-alert-triangle" :class="$style.icon" aria-hidden="true"></i>
		<h2 :id="titleId" :class="$style.title">{{ i18n.ts._externalLink.title }}</h2>
		<p :id="descriptionId" :class="$style.description">{{ i18n.ts._externalLink.description }}</p>
		<div :class="$style.destination" class="_selectable" dir="ltr">
			<strong :class="$style.host">{{ host }}</strong>
			<p :class="$style.url">{{ url }}</p>
		</div>
		<div :class="$style.actions">
			<MkButton rounded autofocus @click="cancel">{{ i18n.ts.cancel }}</MkButton>
			<a :href="url" target="_blank" rel="nofollow noopener noreferrer" class="_button _buttonPrimary" :class="$style.continue" @click="cancel">
				{{ i18n.ts._externalLink.continue }} <i class="ti ti-external-link" aria-hidden="true"></i>
			</a>
		</div>
	</div>
</MkModal>
</template>

<script lang="ts" setup>
import { computed, useId, useTemplateRef } from 'vue';
import MkModal from '@/components/MkModal.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	url: string;
	returnFocusTo?: HTMLElement;
}>();

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const modal = useTemplateRef('modal');
const titleId = useId();
const descriptionId = useId();
const host = computed(() => new URL(props.url).host);

function cancel(): void {
	modal.value?.close();
}
</script>

<style lang="scss" module>
.root {
	margin: auto;
	padding: var(--MI-cardPadding);
	width: 480px;
	max-width: 100%;
	box-sizing: border-box;
	text-align: center;
	background: var(--MI_THEME-panel);
	color: var(--MI_THEME-fg);
	border-radius: var(--MI-radius);
}

.icon {
	font-size: 32px;
	color: var(--MI_THEME-warn);
}

.title {
	margin: 12px 0 8px;
	font-size: 1.15em;
}

.description {
	color: var(--MI_THEME-fgTransparentWeak);
	margin: 0;
	line-height: 1.6;
}

.destination {
	margin-top: 20px;
	padding: 14px;
	text-align: left;
	background: var(--MI_THEME-bg);
	border-radius: var(--MI-radius);
	overflow-wrap: anywhere;
	unicode-bidi: isolate;
}

.host {
	display: block;
	color: var(--MI_THEME-fgHighlighted);
}

.url {
	margin: 8px 0 0;
	max-height: 160px;
	overflow: auto;
	font-size: 0.85em;
	line-height: 1.5;
}

.actions {
	display: flex;
	justify-content: center;
	flex-wrap: wrap;
	gap: 12px;
	margin-top: 24px;
}

.continue {
	padding: 7px 14px;
	border-radius: 999px;
	font-size: 95%;
	font-weight: bold;
	text-decoration: none;

	&:hover {
		text-decoration: none;
	}

	&:focus-visible {
		outline-offset: 2px;
	}
}
</style>
