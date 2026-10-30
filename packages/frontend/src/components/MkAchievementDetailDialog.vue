<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal
	ref="modal"
	preferType="dialog"
	zPriority="high"
	:returnFocusTo="returnFocusTo"
	@click="close"
	@esc="close"
	@closed="emit('closed')"
>
	<section :class="$style.root" class="_panel" role="dialog" aria-modal="true" :aria-labelledby="titleId">
		<div :class="$style.hero" :style="background">
			<MkAchievementBadge :class="[$style.badge, { [$style.spinning]: prefer.s.animation }]" :name="name"/>
			<button type="button" class="_button" :class="$style.close" :aria-label="i18n.ts.close" @click="close">
				<i class="ti ti-x" aria-hidden="true"></i>
			</button>
		</div>
		<div :class="$style.body" class="_selectable">
			<h2 :id="titleId" :class="$style.title">{{ title }}</h2>
			<p :class="$style.description">{{ withDescription ? description : '???' }}</p>
			<p v-if="withDescription && flavor != null" :class="$style.flavor">{{ flavor }}</p>
			<div :class="$style.meta">
				<i class="ti ti-calendar-check" aria-hidden="true"></i>
				<span :class="$style.metaLabel">{{ i18n.ts._achievements.earnedAt }}</span>
				<MkTime :time="unlockedAt"/>
			</div>
		</div>
	</section>
</MkModal>
</template>

<script lang="ts" setup>
import { computed, useId, useTemplateRef } from 'vue';
import MkAchievementBadge from '@/components/MkAchievementBadge.vue';
import MkModal from '@/components/MkModal.vue';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import { ACHIEVEMENT_BADGES, ACHIEVEMENT_TYPES } from '@/utility/achievements.js';

const props = withDefaults(defineProps<{
	name: typeof ACHIEVEMENT_TYPES[number];
	unlockedAt: number;
	withDescription?: boolean;
	returnFocusTo?: HTMLElement;
}>(), {
	withDescription: true,
	returnFocusTo: undefined,
});

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const modal = useTemplateRef('modal');
const titleId = useId();
const definition = computed(() => i18n.ts._achievements._types[`_${props.name}`]);
const title = computed(() => definition.value.title);
const description = computed(() => definition.value.description);
const flavor = computed<string | null>(() => 'flavor' in definition.value ? definition.value.flavor : null);
const background = computed(() => {
	const value = ACHIEVEMENT_BADGES[props.name].bg;
	return value == null ? undefined : { background: value };
});

function close(): void {
	modal.value?.close();
}
</script>

<style lang="scss" module>
.root {
	flex: none;
	box-sizing: border-box;
	width: 400px;
	max-width: calc(100vw - 32px);
	margin: auto;
	overflow: clip;
	border-radius: 16px;
	background: var(--MI_THEME-panel);
	box-shadow: 0 12px 40px color-mix(in srgb, var(--MI_THEME-fg) 20%, transparent);
}

.hero {
	position: relative;
	display: grid;
	min-height: 184px;
	place-items: center;
	perspective: 600px;
	background: linear-gradient(135deg, var(--MI_THEME-accentedBg), color-mix(in srgb, var(--MI_THEME-accent) 45%, var(--MI_THEME-panel)));
}

.badge {
	transform: scale(1.85);
	transform-style: preserve-3d;
}

.spinning {
	animation: badge-spin 1.1s cubic-bezier(0.22, 0.61, 0.36, 1) both;
}

.close {
	position: absolute;
	top: 10px;
	right: 10px;
	display: grid;
	width: 32px;
	height: 32px;
	place-items: center;
	border-radius: 50%;
	color: var(--MI_THEME-fg);
	background: color-mix(in srgb, var(--MI_THEME-bg) 60%, transparent);
	-webkit-backdrop-filter: var(--MI-blur, blur(8px));
	backdrop-filter: var(--MI-blur, blur(8px));

	&:hover {
		background: color-mix(in srgb, var(--MI_THEME-bg) 80%, transparent);
	}
}

.body {
	padding: 20px var(--MI-cardPadding, 18px) 22px;
}

.title {
	margin: 0 0 8px;
	font-size: 1.25em;
}

.description {
	margin: 0;
	line-height: 1.65;
	color: var(--MI_THEME-fgTransparentWeak);
}

.flavor {
	margin: 10px 0 0;
	padding-left: 12px;
	border-left: 3px solid var(--MI_THEME-accent);
	color: var(--MI_THEME-fgTransparentWeak);
	font-style: italic;
}

.meta {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 6px;
	margin-top: 16px;
	padding-top: 14px;
	border-top: var(--MI-divider);
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.9em;

	> i {
		color: var(--MI_THEME-accent);
	}
}

.metaLabel {
	font-weight: 600;
}

@keyframes badge-spin {
	from {
		transform: scale(1.85) rotateY(0deg);
	}

	to {
		transform: scale(1.85) rotateY(360deg);
	}
}

@media (prefers-reduced-motion: reduce) {
	.spinning {
		animation: none;
	}
}
</style>
