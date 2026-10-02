<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.root, { _panel: !widgetProps.transparent }]" data-testid="mkw-calendar">
	<div :class="[$style.calendar, { [$style.isHoliday]: isHoliday }]">
		<p :class="$style.monthAndYear">
			<span :class="$style.year">{{ i18n.tsx.yearX({ year }) }}</span>
			<span :class="$style.month">{{ i18n.tsx.monthX({ month }) }}</span>
		</p>
		<p v-if="month === 1 && day === 1" :class="$style.day">🎉{{ i18n.tsx.dayX({ day }) }}<span style="display: inline-block; transform: scaleX(-1);">🎉</span></p>
		<p v-else :class="$style.day">{{ i18n.tsx.dayX({ day }) }}</p>
		<p :class="$style.weekDay">{{ weekDay }}</p>
	</div>
	<div :class="$style.info">
		<div :class="$style.infoSection">
			<p :class="$style.infoText">{{ i18n.ts.today }}<b :class="$style.percentage">{{ dayP.toFixed(1) }}%</b></p>
			<div :class="$style.meter">
				<div :class="$style.meterVal" :style="{ width: `${dayP}%` }"></div>
			</div>
		</div>
		<div :class="$style.infoSection">
			<p :class="$style.infoText">{{ i18n.ts.thisMonth }}<b :class="$style.percentage">{{ monthP.toFixed(1) }}%</b></p>
			<div :class="$style.meter">
				<div :class="$style.meterVal" :style="{ width: `${monthP}%` }"></div>
			</div>
		</div>
		<div :class="$style.infoSection">
			<p :class="$style.infoText">{{ i18n.ts.thisYear }}<b :class="$style.percentage">{{ yearP.toFixed(1) }}%</b></p>
			<div :class="$style.meter">
				<div :class="$style.meterVal" :style="{ width: `${yearP}%` }"></div>
			</div>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { onBeforeUnmount, ref, watch } from 'vue';
import { useWidgetPropsManager } from './widget.js';
import type { WidgetComponentEmits, WidgetComponentExpose, WidgetComponentProps } from './widget.js';
import type { FormWithDefault, GetFormResultType } from '@/utility/form.js';
import { i18n } from '@/i18n.js';
import { useLowresTime, TIME_UPDATE_INTERVAL } from '@/composables/use-lowres-time.js';

const name = 'calendar';

const widgetPropsDef = {
	transparent: {
		type: 'boolean',
		label: i18n.ts._widgetOptions.transparent,
		default: false,
	},
} satisfies FormWithDefault;

type WidgetProps = GetFormResultType<typeof widgetPropsDef>;

const props = defineProps<WidgetComponentProps<WidgetProps>>();
const emit = defineEmits<WidgetComponentEmits<WidgetProps>>();

const { widgetProps, configure } = useWidgetPropsManager(name,
	widgetPropsDef,
	props,
	emit,
);

const fNow = useLowresTime();
const year = ref(0);
const month = ref(0);
const day = ref(0);
const weekDay = ref('');
const yearP = ref(0);
const monthP = ref(0);
const dayP = ref(0);
const isHoliday = ref(false);

let nextDayTimer: number | null = null;

function update(time: number) {
	if (nextDayTimer != null) {
		window.clearTimeout(nextDayTimer);
		nextDayTimer = null;
	}
	const now = new Date(time);
	const nd = now.getDate();
	const nm = now.getMonth();
	const ny = now.getFullYear();
	const nextDayMidnightTime = new Date(ny, nm, nd + 1).getTime();

	year.value = ny;
	month.value = nm + 1;
	day.value = nd;
	weekDay.value = [
		i18n.ts._weekday.sunday,
		i18n.ts._weekday.monday,
		i18n.ts._weekday.tuesday,
		i18n.ts._weekday.wednesday,
		i18n.ts._weekday.thursday,
		i18n.ts._weekday.friday,
		i18n.ts._weekday.saturday,
	][now.getDay()];

	const dayNumer = now.getTime() - new Date(ny, nm, nd).getTime();
	const dayDenom = nextDayMidnightTime - new Date(ny, nm, nd).getTime();
	const monthNumer = now.getTime() - new Date(ny, nm, 1).getTime();
	const monthDenom = new Date(ny, nm + 1, 1).getTime() - new Date(ny, nm, 1).getTime();
	const yearNumer = now.getTime() - new Date(ny, 0, 1).getTime();
	const yearDenom = new Date(ny + 1, 0, 1).getTime() - new Date(ny, 0, 1).getTime();

	dayP.value = dayNumer / dayDenom * 100;
	monthP.value = monthNumer / monthDenom * 100;
	yearP.value = yearNumer / yearDenom * 100;

	isHoliday.value = now.getDay() === 0 || now.getDay() === 6;

	// 次回更新までに日付が変わる場合、日付が変わった直後に強制的に更新するタイマーをセットする
	if (nextDayMidnightTime - time <= TIME_UPDATE_INTERVAL) {
		nextDayTimer = window.setTimeout(() => {
			update(Date.now());
		}, nextDayMidnightTime - time);
	}
}

watch(fNow, update, { immediate: true });

onBeforeUnmount(() => {
	if (nextDayTimer != null) window.clearTimeout(nextDayTimer);
});

defineExpose<WidgetComponentExpose>({
	name,
	configure,
	id: props.widget ? props.widget.id : null,
});
</script>

<style lang="scss" module>
.root {
	display: grid;
	grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
	align-items: center;
	column-gap: 12px;
	padding: var(--MI-cardPadding, 18px);
}

.calendar {
	min-width: 0;
	text-align: start;

	&.isHoliday {
		> .day {
			color: var(--MI_THEME-love);
		}
	}
}

.monthAndYear,
.weekDay {
	margin: 0;
	line-height: 18px;
	font-size: 0.9em;
}

.monthAndYear {
	display: flex;
	flex-wrap: wrap;
	column-gap: 4px;
}

.year,
.month {
	margin: 0;
}

.day {
	margin: 10px 0;
	line-height: 32px;
	font-size: 1.75em;
}

.info {
	min-width: 0;
	box-sizing: border-box;
}

.infoSection {
	margin-bottom: 8px;

	&:last-child {
		margin-bottom: 0;
	}
}

.infoText {
	display: flex;
	flex-wrap: wrap;
	column-gap: 4px;
	margin: 0 0 2px 0;
	font-size: 0.75em;
	line-height: 18px;
	color: var(--MI_THEME-fgTransparent);
}

.percentage {
	margin-left: auto;
}

.meter {
	width: 100%;
	overflow: hidden;
	background: var(--MI_THEME-accentedBg);
	border-radius: var(--MI-radius);
}

.meterVal {
	height: 4px;
	background: var(--MI_THEME-accent);
	transition: width .3s cubic-bezier(0.23, 1, 0.32, 1);
}
</style>
