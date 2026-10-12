<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<time :title="expandOnHover ? undefined : absolute" :tabindex="expandOnHover ? 0 : undefined" :class="{ [$style.expandable]: expandOnHover, [$style.old1]: colored && (ago > 60 * 60 * 24 * 90), [$style.old2]: colored && (ago > 60 * 60 * 24 * 180) }">
	<template v-if="expandOnHover"><span :class="$style.relative">{{ relative }}</span><span :class="$style.absolute">{{ absolute }}</span></template>
	<template v-else-if="invalid">{{ i18n.ts._ago.invalid }}</template>
	<template v-else-if="mode === 'relative'">{{ relative }}</template>
	<template v-else-if="mode === 'absolute'">{{ absolute }}</template>
	<template v-else-if="mode === 'date'">{{ date }}</template>
	<template v-else-if="mode === 'detail'">{{ absolute }} ({{ relative }})</template>
</time>
</template>

<script lang="ts" setup>
import isChromatic from 'chromatic/isChromatic';
import { computed } from 'vue';
import { i18n } from '@/i18n.js';
import { dateOnlyFormat, dateTimeFormat } from '@@/js/intl-const.js';
import { parseTime, formatRelativeTime } from '@@/js/relative-time.js';
import { useLowresTime } from '@@/js/use-lowres-time.js';

const props = withDefaults(defineProps<{
	time: Date | string | number | null;
	origin?: Date | null;
	mode?: 'relative' | 'absolute' | 'detail' | 'date';
	colored?: boolean;
	expandOnHover?: boolean;
}>(), {
	origin: isChromatic() ? () => new Date('2023-04-01T00:00:00Z') : null,
	mode: 'relative',
});

// eslint-disable-next-line vue/no-setup-props-reactivity-loss
const _time = parseTime(props.time);
const invalid = Number.isNaN(_time);
const absolute = !invalid ? dateTimeFormat.format(_time) : i18n.ts._ago.invalid;
const date = !invalid ? dateOnlyFormat.format(_time) : i18n.ts._ago.invalid;

// 10秒ごとの再計算のたびに作り直さないよう、インスタンスごとに一度だけ作る
const relativeTimeLocale = {
	ago: i18n.tsx._ago,
	timeIn: i18n.tsx._timeIn,
	justNow: i18n.ts._ago.justNow,
};

const actualNow = useLowresTime();
const now = computed(() => (props.origin ? props.origin.getTime() : actualNow.value));

// eslint-disable-next-line vue/no-setup-props-reactivity-loss
const ago = computed(() => (now.value - _time) / 1000/*ms*/);

const relative = computed<string>(() => {
	if (props.mode === 'absolute' || props.mode === 'date') return ''; // 绝对时间和日期不需要计算相对时间。
	if (invalid) return i18n.ts._ago.invalid;

	return formatRelativeTime(ago.value, relativeTimeLocale);
});
</script>

<style lang="scss" module>
.expandable {
	display: inline-grid;
	white-space: nowrap;
	> span { grid-area: 1 / 1; transition: opacity 120ms ease, visibility 120ms; }
	.absolute { visibility: hidden; opacity: 0; }
	&:hover, &:focus-visible {
		// 鼠标短暂划过时不切换，停留后再显示完整时间。
		> span { transition-delay: 600ms; }
		.relative { visibility: hidden; opacity: 0; }
		.absolute { visibility: visible; opacity: 1; }
	}
}
@media (prefers-reduced-motion: reduce) { .expandable > span { transition: none; transform: none; } }
.old1 {
	color: var(--MI_THEME-warn);
}

.old1.old2 {
	color: var(--MI_THEME-error);
}
</style>
