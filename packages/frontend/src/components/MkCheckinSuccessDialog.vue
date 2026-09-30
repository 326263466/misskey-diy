<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal ref="modal" preferType="dialog" zPriority="high" :returnFocusTo="returnFocusTo" @click="close" @esc="close" @closed="emit('closed')">
	<section :class="$style.root" class="_panel" role="dialog" aria-modal="true" :aria-labelledby="titleId">
		<button type="button" class="_button" :class="$style.close" :aria-label="i18n.ts.close" @click="close">
			<i class="ti ti-x" aria-hidden="true"></i>
		</button>
		<h2 :id="titleId" :class="$style.title">{{ i18n.ts._checkin.successTitle }}</h2>
		<div :class="$style.body" class="_selectable">
			<I18n :src="i18n.ts._checkin.successReward" tag="p" :class="$style.reward">
				<template #n><strong :class="$style.points">+{{ points }}</strong></template>
			</I18n>
			<I18n :src="i18n.ts._checkin.successStreak" tag="p" :class="$style.streak">
				<template #n><strong :class="$style.points">{{ consecutiveDays }}</strong></template>
			</I18n>
			<p v-if="earnedMakeupCards > 0" :class="$style.cardReward">
				<i class="ti ti-ticket" aria-hidden="true"></i>
				{{ i18n.tsx._checkin.cardRewardReceived({ n: earnedMakeupCards }) }}
			</p>
		</div>
		<MkButton :class="$style.confirm" primary rounded autofocus @click="close">{{ i18n.ts.ok }}</MkButton>
	</section>
</MkModal>
</template>

<script lang="ts" setup>
import { useId, useTemplateRef } from 'vue';
import MkModal from '@/components/MkModal.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';

withDefaults(defineProps<{
	points: number;
	consecutiveDays: number;
	earnedMakeupCards?: number;
	returnFocusTo?: HTMLElement;
}>(), {
	earnedMakeupCards: 0,
});

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const modal = useTemplateRef('modal');
const titleId = useId();

function close(): void {
	modal.value?.close();
}
</script>

<style lang="scss" module>
.root {
	position: relative;
	box-sizing: border-box;
	margin: auto;
	width: 460px;
	max-width: calc(100vw - 32px);
	padding: 24px 28px 28px;
	text-align: center;
	// 与 MkDialog 等标准弹窗的圆角一致 (_panel 的 --MI-radius 8px 偏方)
	border-radius: 16px;
}

.close {
	position: absolute;
	top: 10px;
	right: 10px;
	display: grid;
	place-items: center;
	width: 36px;
	height: 36px;
	border-radius: 50%;
	color: var(--MI_THEME-fg);

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
	}
}

.title {
	margin: 0;
	padding: 0 16px 14px;
	border-bottom: 1px solid var(--MI_THEME-divider);
	font-size: 1.25em;
	font-weight: 600;
}

.body {
	padding: 18px 0 20px;
	line-height: 1.7;
	overflow-wrap: anywhere;
}

.reward {
	margin: 0;
	font-size: 1.1em;
}

.points {
	color: var(--MI_THEME-infoWarnFg);
}

.streak {
	margin: 8px 0 0;
	font-size: 1.15em;

	.points {
		padding: 0 4px;
		font-size: 1.6em;
	}
}

.cardReward {
	margin: 8px 0 0;
	color: var(--MI_THEME-accent);
}

.confirm {
	--MI_THEME-accent: var(--MI_THEME-link);
	width: 240px;
	max-width: 100%;
	min-height: 44px;
	margin: 0 auto;
}
</style>
