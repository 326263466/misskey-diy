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
		<header :class="$style.hero">
			<span :class="$style.badge"><i class="ti ti-check" aria-hidden="true"></i></span>
			<h2 :id="titleId" :class="$style.title">{{ i18n.ts._checkin.successTitle }}</h2>
		</header>
		<div :class="$style.body" class="_selectable">
			<div :class="$style.stats">
				<div :class="$style.stat">
					<span :class="$style.statLabel"><i class="ti ti-diamond-filled" aria-hidden="true"></i> {{ i18n.ts._checkin.points }}</span>
					<I18n :src="i18n.ts._checkin.successReward" tag="p" :class="$style.statValue">
						<template #n><strong :class="$style.points">+{{ points }}</strong></template>
					</I18n>
				</div>
				<div :class="$style.stat">
					<span :class="$style.statLabel"><i class="ti ti-calendar-check" aria-hidden="true"></i> {{ i18n.ts._checkin.consecutiveDays }}</span>
					<I18n :src="i18n.ts._checkin.successStreak" tag="p" :class="$style.statValue">
						<template #n><strong :class="$style.points">{{ consecutiveDays }}</strong></template>
					</I18n>
				</div>
			</div>
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
	width: 400px;
	max-width: calc(100vw - 32px);
	overflow: clip;
	text-align: center;
	// 与 MkDialog 等标准弹窗的圆角一致 (_panel 的 --MI-radius 8px 偏方)
	border-radius: 16px;
	padding: 0;
}

.close {
	position: absolute;
	top: 10px;
	right: 10px;
	z-index: 1;
	display: grid;
	place-items: center;
	width: 32px;
	height: 32px;
	border-radius: 50%;
	color: var(--MI_THEME-fgOnAccent);

	&:hover {
		background: color-mix(in srgb, var(--MI_THEME-fgOnAccent) 15%, transparent);
	}
}

.hero {
	// 与签到页日期卡片同源的强调色渐变，让"成功"有庆典感
	background: linear-gradient(145deg, color-mix(in srgb, var(--MI_THEME-accent) 65%, var(--MI_THEME-fg)) 0%, var(--MI_THEME-accent) 58%, color-mix(in srgb, var(--MI_THEME-accent) 75%, var(--MI_THEME-panel)) 100%);
	padding: 24px 44px 20px;
	color: var(--MI_THEME-fgOnAccent);
}

.badge {
	display: grid;
	place-items: center;
	width: 56px;
	height: 56px;
	margin: 0 auto 10px;
	border-radius: 50%;
	font-size: 1.8em;
	color: var(--MI_THEME-accent);
	background: var(--MI_THEME-fgOnAccent);
	box-shadow: 0 4px 16px color-mix(in srgb, var(--MI_THEME-fg) 18%, transparent);
}

.title {
	margin: 0;
	font-size: 1.2em;
	font-weight: 700;
}

.body {
	padding: 20px 24px 4px;
	line-height: 1.7;
	overflow-wrap: anywhere;
}

.stats {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 12px;
}

.stat {
	display: flex;
	flex-direction: column;
	gap: 8px;
	align-items: center;
	padding: 14px 10px;
	border-radius: calc(var(--MI-radius) / 2);
	background: color-mix(in srgb, var(--MI_THEME-fg) 4%, var(--MI_THEME-panel));
}

.statLabel {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	font-size: .9em;
	color: var(--MI_THEME-fgTransparentWeak);

	> i {
		color: var(--MI_THEME-accent);
	}
}

.statValue {
	margin: 0;
	font-size: .9em;
	color: var(--MI_THEME-fgTransparentWeak);

	.points {
		padding: 0 3px;
		font-size: 1.9em;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--MI_THEME-accent);
	}
}

.cardReward {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	margin: 14px 0 0;
	padding: 10px 12px;
	border-radius: calc(var(--MI-radius) / 2);
	font-size: .9em;
	font-weight: 600;
	color: var(--MI_THEME-warn);
	background: color-mix(in srgb, var(--MI_THEME-warn) 12%, var(--MI_THEME-panel));

	> i {
		font-size: 1.3em;
		transform: rotate(-12deg);
	}
}

.confirm {
	--MI_THEME-accent: var(--MI_THEME-link);
	// MkButton 自身は block + text-align: center で中央寄せするため、
	// 横幅いっぱいに広げた際も display の上書きは不要 (基准字号 100% 保证可读性)
	width: calc(100% - 48px);
	min-height: 44px;
	font-size: 100%;
	margin: 16px auto 20px;
}
</style>
