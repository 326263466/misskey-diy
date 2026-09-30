<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkContainer :showHeader="widgetProps.showHeader" :naked="widgetProps.transparent" data-testid="mkw-countdown">
	<template #icon><i class="ti ti-calendar-time"></i></template>
	<template #header>{{ i18n.ts._widgets.countdown }}</template>

	<div :class="$style.root">
		<div v-if="editing" class="_gaps_s">
			<label>
				<MkInput v-model="draftTitle" small>
					<template #label>{{ i18n.ts._widgetCountdown.title }}</template>
				</MkInput>
			</label>
			<label>
				<MkInput v-model="draftDate" type="datetime-local" :min="minimumDate" required small @enter.prevent="saveCountdown">
					<template #label>{{ i18n.ts._widgetCountdown.targetDate }}</template>
				</MkInput>
			</label>
			<p v-if="dateError" role="alert" :class="$style.error">{{ dateError === 'invalid' ? i18n.ts._widgetCountdown.invalidDate : i18n.ts._widgetCountdown.futureDateRequired }}</p>
			<div :class="$style.actions">
				<MkButton small primary @click="saveCountdown">{{ i18n.ts.save }}</MkButton>
				<MkButton small @click="editing = false">{{ i18n.ts.cancel }}</MkButton>
			</div>
		</div>
		<template v-else-if="hasTarget">
			<div :class="$style.title" class="_selectable">{{ widgetProps.title || i18n.ts._widgets.countdown }}</div>
			<div v-if="remaining > 0" role="timer" :class="$style.timer">
				<div v-for="(part, index) in parts" :key="part.label" :class="$style.part">
					<span :class="$style.value">{{ part.value.toString().padStart(index === 0 ? 1 : 2, '0') }}</span>
					<span :class="$style.unit">{{ part.label }}</span>
				</div>
			</div>
			<p v-else role="status" :class="$style.finished"><i class="ti ti-circle-check" aria-hidden="true"></i> {{ i18n.ts._widgetCountdown.finished }}</p>
			<div :class="$style.footer">
				<div :class="$style.target">
					<i class="ti ti-calendar-event" aria-hidden="true"></i>
					<time :datetime="new Date(widgetProps.target).toISOString()" :class="$style.date">{{ dateTimeFormat.format(widgetProps.target) }}</time>
				</div>
				<button v-tooltip="i18n.ts._widgetCountdown.edit" type="button" class="_button" :class="$style.edit" :aria-label="i18n.ts._widgetCountdown.edit" @click="editCountdown"><i class="ti ti-pencil" aria-hidden="true"></i></button>
			</div>
		</template>
		<div v-else :class="$style.empty">
			<i class="ti ti-calendar-time" :class="$style.emptyIcon"></i>
			<p>{{ i18n.ts._widgetCountdown.empty }}</p>
			<MkButton small primary @click="editCountdown">{{ i18n.ts._widgetCountdown.set }}</MkButton>
		</div>
	</div>
</MkContainer>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { dateTimeFormat } from '@@/js/intl-const.js';
import { useWidgetPropsManager } from './widget.js';
import type { WidgetComponentEmits, WidgetComponentExpose, WidgetComponentProps } from './widget.js';
import type { FormWithDefault, GetFormResultType } from '@/utility/form.js';
import MkContainer from '@/components/MkContainer.vue';
import MkInput from '@/components/MkInput.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { notifyTimerCompletion } from '@/utility/notify-timer-completion.js';

const name = 'countdown';
const widgetPropsDef = {
	showHeader: { type: 'boolean', label: i18n.ts._widgetOptions.showHeader, default: true },
	transparent: { type: 'boolean', label: i18n.ts._widgetOptions.transparent, default: false },
	title: { type: 'string', hidden: true, default: '' },
	target: { type: 'number', hidden: true, default: 0 },
	notifiedTarget: { type: 'number', hidden: true, default: 0 },
} satisfies FormWithDefault;

type WidgetProps = GetFormResultType<typeof widgetPropsDef>;
const props = defineProps<WidgetComponentProps<WidgetProps>>();
const emit = defineEmits<WidgetComponentEmits<WidgetProps>>();
const { widgetProps, configure } = useWidgetPropsManager(name, widgetPropsDef, props, emit);
const now = ref(Date.now());
const editing = ref(false);
const draftTitle = ref('');
const draftDate = ref('');
const dateError = ref<'invalid' | 'past' | null>(null);
const minimumDate = computed(() => formatDateTimeLocal(Math.floor(now.value / 60_000) * 60_000 + 60_000));
const hasTarget = computed(() => widgetProps.target > 0 && Number.isFinite(new Date(widgetProps.target).getTime()));
const remaining = computed(() => Math.max(0, Math.ceil((widgetProps.target - now.value) / 1000)));
const parts = computed(() => [
	{ label: i18n.ts._time.day, value: Math.floor(remaining.value / 86400) },
	{ label: i18n.ts._time.hour, value: Math.floor(remaining.value / 3600) % 24 },
	{ label: i18n.ts._time.minute, value: Math.floor(remaining.value / 60) % 60 },
	{ label: i18n.ts._time.second, value: remaining.value % 60 },
]);
let timer: number | undefined;

function updateTime() {
	now.value = Date.now();
	if (props.widget?.id === '__PREVIEW__') return;
	if (editing.value || (hasTarget.value && remaining.value > 0)) {
		timer ??= window.setInterval(updateTime, 1000);
	} else {
		window.clearInterval(timer);
		timer = undefined;
	}
	if (hasTarget.value && remaining.value === 0 && widgetProps.notifiedTarget !== widgetProps.target) {
		widgetProps.notifiedTarget = widgetProps.target;
		emit('updateProps', { ...widgetProps });
		notifyTimerCompletion(i18n.ts._widgetCountdown.finished, widgetProps.title || i18n.ts._widgets.countdown);
	}
}

function formatDateTimeLocal(timestamp: number) {
	const date = new Date(timestamp);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function editCountdown() {
	now.value = Date.now();
	draftTitle.value = widgetProps.title;
	draftDate.value = minimumDate.value;
	dateError.value = null;
	editing.value = true;
}

function saveCountdown() {
	now.value = Date.now();
	const target = new Date(draftDate.value).getTime();
	if (!Number.isFinite(target)) {
		dateError.value = 'invalid';
		return;
	}
	if (target <= now.value) {
		dateError.value = 'past';
		return;
	}
	widgetProps.title = draftTitle.value.trim();
	widgetProps.target = target;
	emit('updateProps', { ...widgetProps });
	updateTime();
	editing.value = false;
}

onMounted(() => {
	if (props.widget?.id === '__PREVIEW__') return;
	watch([() => widgetProps.target, editing], updateTime, { immediate: true });
	window.addEventListener('focus', updateTime);
	window.document.addEventListener('visibilitychange', updateTime);
});

onUnmounted(() => {
	window.clearInterval(timer);
	window.removeEventListener('focus', updateTime);
	window.document.removeEventListener('visibilitychange', updateTime);
});

defineExpose<WidgetComponentExpose>({ name, configure, id: props.widget?.id ?? null });
</script>

<style lang="scss" module>
.root {
	container-type: inline-size;
	padding: var(--MI-cardPadding, 20px);
}

.title {
	font-size: 1.05em;
	font-weight: 600;
	line-height: 1.5;
	overflow-wrap: anywhere;
}

.timer {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 6px;
	margin: 16px 0;
}

.part {
	display: flex;
	flex-direction: column;
	justify-content: center;
	gap: 8px;
	min-width: 0;
	padding: 14px 3px 11px;
	border: 1px solid color-mix(in srgb, var(--MI_THEME-accent) 12%, var(--MI_THEME-divider));
	border-radius: var(--MI-radius);
	background: linear-gradient(160deg, color-mix(in srgb, var(--MI_THEME-accent) 5%, var(--MI_THEME-panel)), var(--MI_THEME-panel));
	text-align: center;

	&:last-child .value {
		color: var(--MI_THEME-accent);
	}
}

.value {
	font-family: 'SFMono-Regular', Consolas, monospace;
	font-size: clamp(1.3em, 10cqw, 1.95em);
	font-variant-numeric: tabular-nums;
	font-weight: 500;
	line-height: 1;
	overflow-wrap: anywhere;
}

.unit {
	font-size: 0.75em;
	color: color-mix(in srgb, var(--MI_THEME-fg) 70%, transparent);
}

.footer {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	padding-top: 10px;
	border-top: 1px solid var(--MI_THEME-divider);
}

.target {
	display: flex;
	align-items: center;
	gap: 6px;
	min-width: 0;
	line-height: 1.2;
	color: color-mix(in srgb, var(--MI_THEME-fg) 70%, transparent);

	> i {
		flex-shrink: 0;
		font-size: 0.9em;
	}
}

.date {
	font-size: 0.9em;
	font-variant-numeric: tabular-nums;
	overflow-wrap: anywhere;
}

.edit {
	display: grid;
	place-items: center;
	flex-shrink: 0;
	width: 28px;
	height: 28px;
	border-radius: var(--MI-radius);
	color: color-mix(in srgb, var(--MI_THEME-fg) 70%, transparent);

	&:hover {
		color: var(--MI_THEME-accent);
		background: var(--MI_THEME-buttonHoverBg);
	}
}

.empty {
	display: flex;
	flex-direction: column;
	align-items: center;
	text-align: center;
	font-size: 0.9em;

	> p {
		margin: 14px 0 18px;
		color: color-mix(in srgb, var(--MI_THEME-fg) 70%, transparent);
	}
}

.emptyIcon {
	display: grid;
	place-items: center;
	width: 48px;
	height: 48px;
	border: 1px solid color-mix(in srgb, var(--MI_THEME-accent) 20%, var(--MI_THEME-divider));
	border-radius: var(--MI-radius);
	font-size: 1.7em;
	color: var(--MI_THEME-accent);
	background: color-mix(in srgb, var(--MI_THEME-accent) 8%, var(--MI_THEME-panel));
}

.finished {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	min-height: 76px;
	margin: 16px 0;
	border: 1px solid color-mix(in srgb, var(--MI_THEME-accent) 16%, var(--MI_THEME-divider));
	border-radius: var(--MI-radius);
	color: var(--MI_THEME-accent);
	background: color-mix(in srgb, var(--MI_THEME-accent) 5%, var(--MI_THEME-panel));

	> i {
		font-size: 1.4em;
	}
}

.actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.error {
	margin: 0;
	font-size: 0.85em;
	color: var(--MI_THEME-error);
}
</style>
