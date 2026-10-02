<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<section :class="[$style.root, { [$style.embedded]: embedded }]" :aria-label="i18n.ts._datePicker.title" @keydown.esc.stop.prevent="emit('close')">
	<template v-if="type !== 'time'">
		<div :class="$style.navigation">
			<button type="button" class="_button" :aria-label="i18n.ts._datePicker.previous" @click="movePanel(-1)"><i class="ti ti-chevron-left" aria-hidden="true"></i></button>
			<button type="button" class="_button" :class="$style.month" :aria-label="i18n.ts._datePicker.chooseMonthYear" @click="panel = panel === 'days' ? 'months' : panel === 'months' ? 'years' : 'days'">{{ panel === 'days' ? monthLabel : panel === 'months' ? visibleMonth.getFullYear() : `${years[0]} – ${years[11]}` }} <i class="ti ti-chevron-down" aria-hidden="true"></i></button>
			<button type="button" class="_button" :aria-label="i18n.ts._datePicker.next" @click="movePanel(1)"><i class="ti ti-chevron-right" aria-hidden="true"></i></button>
		</div>
		<div v-if="panel === 'months'" :class="$style.choices"><button v-for="(month, index) in months" :key="index" type="button" class="_button" @click="selectMonth(index)">{{ month }}</button></div>
		<div v-else-if="panel === 'years'" :class="$style.choices"><button v-for="year in years" :key="year" type="button" class="_button" :disabled="year < 1 || year > 9999" @click="selectYear(year)">{{ year }}</button></div>
		<div v-else :class="$style.calendar">
			<span v-for="(day, index) in weekdays" :key="`weekday-${index}`" :class="$style.weekday">{{ day }}</span>
			<button v-for="day in days" :key="day.value" type="button" class="_button" :class="{ [$style.outside]: day.outside, [$style.selected]: date === day.value }" :disabled="day.disabled" :aria-label="day.label" :aria-pressed="date === day.value" :aria-current="day.value === today ? 'date' : undefined" @click="pick(day.value)">{{ day.number }}</button>
		</div>
	</template>
	<div v-if="type !== 'date'" :class="$style.clock">
		<label>{{ i18n.ts._datePicker.hour }}<input v-model="hour" type="number" min="0" max="23" inputmode="numeric"></label>
		<span aria-hidden="true">:</span>
		<label>{{ i18n.ts._datePicker.minute }}<input v-model="minute" type="number" min="0" max="59" inputmode="numeric"></label>
		<label v-if="withSeconds">{{ i18n.ts._datePicker.second }}<input v-model="second" type="number" min="0" max="59" inputmode="numeric"></label>
	</div>
	<p v-if="!valid" role="status" :class="$style.error">{{ i18n.ts._datePicker.invalid }}</p>
	<div :class="$style.actions">
		<button v-if="!embedded" type="button" class="_textButton" @click="emit('update:modelValue', ''); emit('close')">{{ i18n.ts.clear }}</button>
		<button v-if="type !== 'time'" type="button" class="_textButton" @click="pick(today); syncMonth()">{{ i18n.ts.today }}</button>
		<button v-if="!embedded && type !== 'date'" type="button" class="_button" :class="$style.confirm" :disabled="!valid" @click="confirm">{{ i18n.ts.ok }}</button>
	</div>
</section>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { versatileLang } from '@@/js/intl-const.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{ modelValue: string; type: 'date' | 'datetime-local' | 'time'; min?: string | number; max?: string | number; step?: string | number; embedded?: boolean }>();
const emit = defineEmits<{ (event: 'update:modelValue', value: string): void; (event: 'close'): void; (event: 'validity', value: boolean): void }>();
const panel = ref<'days' | 'months' | 'years'>('days');
const pad = (value: number | string) => String(value).padStart(2, '0');
const localDate = (value: Date) => `${String(value.getFullYear()).padStart(4, '0')}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
const now = new Date();
const today = localDate(now);
const date = ref(props.type === 'time' ? today : props.modelValue.split('T')[0] || today);
const time = (props.type === 'time' ? props.modelValue : props.modelValue.split('T')[1])?.split(':') ?? [];
const hour = ref<string | number>(time[0] ?? pad(now.getHours()));
const minute = ref<string | number>(time[1] ?? pad(now.getMinutes()));
const second = ref<string | number>(time[2] ?? '00');
const withSeconds = time.length > 2 || (props.step != null && Number(props.step) < 60);

function parseDate(value: string): Date | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
	const [year, month, day] = value.split('-').map(Number);
	const result = new Date(0);
	result.setFullYear(year, month - 1, day);
	result.setHours(12, 0, 0, 0);
	return year > 0 && localDate(result) === value ? result : null;
}

const visibleMonth = ref(parseDate(date.value) ?? now);
const monthLabel = computed(() => new Intl.DateTimeFormat(versatileLang, { year: 'numeric', month: 'long' }).format(visibleMonth.value));
const months = Array.from({ length: 12 }, (_, month) => new Intl.DateTimeFormat(versatileLang, { month: 'short' }).format(new Date(2024, month, 1)));
const years = computed(() => Array.from({ length: 12 }, (_, index) => Math.floor(visibleMonth.value.getFullYear() / 12) * 12 + index));
const weekdays = Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(versatileLang, { weekday: 'short' }).format(new Date(2024, 0, index + 1)));
const days = computed(() => {
	const first = new Date(visibleMonth.value);
	first.setDate(1);
	first.setDate(1 - (first.getDay() + 6) % 7);
	return Array.from({ length: 42 }, (_, index) => {
		const current = new Date(first);
		current.setDate(first.getDate() + index);
		const value = localDate(current);
		return { value, number: current.getDate(), label: new Intl.DateTimeFormat(versatileLang, { dateStyle: 'full' }).format(current), outside: current.getMonth() !== visibleMonth.value.getMonth(), disabled: current.getFullYear() < 1 || current.getFullYear() > 9999 || (props.min != null && value < String(props.min).slice(0, 10)) || (props.max != null && value > String(props.max).slice(0, 10)) };
	});
});
const value = computed(() => {
	const clock = `${pad(hour.value)}:${pad(minute.value)}${withSeconds ? `:${pad(second.value)}` : ''}`;
	return props.type === 'date' ? date.value : props.type === 'time' ? clock : `${date.value}T${clock}`;
});

function scalar(text: string): number {
	const [day, clock] = props.type === 'time' ? ['', text] : text.split('T');
	const parsed = props.type === 'time' ? null : parseDate(day);
	if (props.type !== 'time' && !parsed) return NaN;
	const utc = new Date(0);
	if (parsed) utc.setUTCFullYear(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
	const parts = (clock ?? '00:00').split(':').map(Number);
	return utc.getTime() / 1000 + parts[0] * 3600 + parts[1] * 60 + (parts[2] ?? 0);
}

const valid = computed(() => {
	if (props.type !== 'time' && !parseDate(date.value)) return false;
	if (props.type !== 'date' && ![[hour.value, 23], [minute.value, 59], [second.value, 59]].every(([part, max]) => String(part).trim() !== '' && Number.isInteger(Number(part)) && Number(part) >= 0 && Number(part) <= Number(max))) return false;
	const current = scalar(value.value);
	const minimum = props.min == null ? NaN : scalar(String(props.min));
	const maximum = props.max == null ? NaN : scalar(String(props.max));
	if ((Number.isFinite(minimum) && current < minimum) || (Number.isFinite(maximum) && current > maximum)) return false;
	if (props.step === 'any') return true;
	const step = (Number(props.step) > 0 ? Number(props.step) : props.type === 'date' ? 1 : 60) * (props.type === 'date' ? 86400 : 1);
	const initial = scalar(props.modelValue);
	const base = Number.isFinite(minimum) ? minimum : Number.isFinite(initial) ? initial : 0;
	return Math.abs((current - base) / step - Math.round((current - base) / step)) < 0.000001;
});

watch([value, valid], () => {
	emit('validity', valid.value);
	if (props.embedded && valid.value) emit('update:modelValue', value.value);
}, { immediate: true });

function syncMonth() {
	const parsed = parseDate(date.value);
	if (parsed) visibleMonth.value = parsed;
}

function movePanel(offset: number) {
	const next = new Date(visibleMonth.value);
	next.setDate(1);
	if (panel.value === 'days') next.setMonth(next.getMonth() + offset);
	else next.setFullYear(next.getFullYear() + offset * (panel.value === 'years' ? 12 : 1));
	if (next.getFullYear() > 0 && next.getFullYear() <= 9999) visibleMonth.value = next;
}

function selectMonth(month: number) {
	const next = new Date(visibleMonth.value);
	next.setDate(1);
	next.setMonth(month);
	visibleMonth.value = next;
	panel.value = 'days';
}

function selectYear(year: number) {
	const next = new Date(visibleMonth.value);
	next.setDate(1);
	next.setFullYear(year);
	visibleMonth.value = next;
	panel.value = 'months';
}

function pick(selected: string) {
	date.value = selected;
	if (props.type === 'date' && !props.embedded) confirm();
}

function confirm() {
	if (!valid.value) return;
	emit('update:modelValue', value.value);
	emit('close');
}
</script>

<style lang="scss" module>
.root { box-sizing: border-box; width: 100%; max-width: 296px; margin: var(--MI-marginHalf) auto 0; padding: 12px; border: 1px solid var(--MI_THEME-divider); border-radius: var(--MI-radius); background: var(--MI_THEME-panel); color: var(--MI_THEME-fg); font-size: 14px; line-height: 1.4; }
.embedded { border: 0; padding: 0; margin-top: 0; }
.navigation, .actions, .clock { display: flex; align-items: center; gap: var(--MI-marginHalf); }
.navigation { justify-content: space-between; }
.navigation button, .confirm { min-height: 28px; padding: 4px 8px; border-radius: var(--MI-radius); }
.month { font-weight: 600; }
.choices { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; padding: 10px 0; }
.choices button { height: 42px; border-radius: var(--MI-radius); }
.choices button:hover { background: var(--MI_THEME-accentedBg); }
.direct, .clock label { display: flex; flex-direction: column; gap: 6px; min-width: 0; font-size: .85em; }
.direct, .clock, .actions { margin-top: 8px; }
.root input { width: 100%; min-width: 0; box-sizing: border-box; padding: 8px; border: 1px solid var(--MI_THEME-inputBorder); border-radius: var(--MI-radius); background: var(--MI_THEME-panel); color: var(--MI_THEME-fg); font: inherit; }
.calendar { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 3px; margin-top: var(--MI-marginHalf); }
.calendar button, .weekday { display: grid; place-items: center; height: 28px; padding: 0; border-radius: var(--MI-radius); font-size: 12px; }
.weekday, .outside { color: var(--MI_THEME-fgTransparentWeak); }
.calendar button:hover:not(:disabled) { background: var(--MI_THEME-accentedBg); }
.calendar .selected, .confirm { background: var(--MI_THEME-accent); color: var(--MI_THEME-fgOnAccent); }
.root button:disabled { opacity: .3; cursor: not-allowed; }
.root button:focus-visible, .root input:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: 2px; }
.actions { justify-content: space-between; border-top: 1px solid var(--MI_THEME-divider); padding-top: 8px; }
.error { color: var(--MI_THEME-error); font-size: .85em; }
</style>
