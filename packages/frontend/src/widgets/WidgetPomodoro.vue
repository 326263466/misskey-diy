<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkContainer :showHeader="widgetProps.showHeader" data-testid="mkw-pomodoro">
	<template #icon><i class="ti ti-hourglass" aria-hidden="true"></i></template>
	<template #header>{{ i18n.ts._widgets.pomodoro }}</template>

	<div :class="$style.root">
		<div :class="$style.modes" role="group" :aria-label="i18n.ts._widgets.pomodoro">
			<button v-for="item in modes" :key="item.key" type="button" class="_button" :class="[$style.mode, { [$style.selected]: mode === item.key }]" :aria-pressed="mode === item.key" @click="selectMode(item.key)">
				<i :class="item.icon" aria-hidden="true"></i>
				{{ item.title }}
			</button>
		</div>
		<div :class="$style.timer">
			<div :class="$style.time" role="timer" aria-live="off" data-testid="pomodoro-time">{{ displayTime }}</div>
			<div :class="[$style.status, { [$style.active]: running || completed }]" role="status">
				<i :class="completed ? 'ti ti-circle-check' : paused ? 'ti ti-player-pause' : mode === 'focus' ? 'ti ti-target' : 'ti ti-coffee'" aria-hidden="true"></i>
				<span>{{ status }}</span>
			</div>
		</div>
		<progress :class="$style.progress" :value="progress" :max="1" :aria-label="mode === 'focus' ? i18n.ts._widgetPomodoro.focus : i18n.ts._widgetPomodoro.rest"></progress>
		<div :class="$style.actions">
			<button type="button" class="_button _buttonPrimary" :class="$style.start" :disabled="isPreview" @click="toggleTimer">
				<i :class="running ? 'ti ti-player-pause' : 'ti ti-player-play'" aria-hidden="true"></i>
				{{ running ? i18n.ts._widgetPomodoro.pause : paused ? i18n.ts._widgetPomodoro.resume : i18n.ts._widgetPomodoro.start }}
			</button>
			<button v-tooltip="i18n.ts._widgetPomodoro.reset" type="button" class="_button" :class="$style.reset" :aria-label="i18n.ts._widgetPomodoro.reset" :disabled="isPreview || !widgetProps.state.session" @click="reset">
				<i class="ti ti-refresh" aria-hidden="true"></i>
			</button>
		</div>
	</div>
</MkContainer>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useWidgetPropsManager } from './widget.js';
import type { WidgetComponentEmits, WidgetComponentExpose, WidgetComponentProps } from './widget.js';
import type { FormWithDefault, GetFormResultType } from '@/utility/form.js';
import MkContainer from '@/components/MkContainer.vue';
import { i18n } from '@/i18n.js';
import { notifyTimerCompletion } from '@/utility/notify-timer-completion.js';

type Mode = 'focus' | 'rest';
type TimerSession = { duration: number; remaining: number; deadline: number | null };

const name = 'pomodoro';
const widgetPropsDef = {
	showHeader: {
		type: 'boolean', label: i18n.ts._widgetOptions.showHeader, default: true,
	},
	focusDuration: {
		type: 'range', label: i18n.ts._widgetPomodoro.focusDuration, default: 25, min: 1, max: 180, step: 1,
	},
	restDuration: {
		type: 'range', label: i18n.ts._widgetPomodoro.restDuration, default: 5, min: 1, max: 60, step: 1,
	},
	state: { type: 'object', default: { mode: 'focus' as Mode, session: null as TimerSession | null }, hidden: true },
} satisfies FormWithDefault;

type WidgetProps = GetFormResultType<typeof widgetPropsDef>;
const props = defineProps<WidgetComponentProps<WidgetProps>>();
const emit = defineEmits<WidgetComponentEmits<WidgetProps>>();
const { widgetProps, configure } = useWidgetPropsManager(name, widgetPropsDef, props, emit);

const isPreview = computed(() => props.widget?.id === '__PREVIEW__');
const modes = [
	{ key: 'focus', title: i18n.ts._widgetPomodoro.focus, icon: 'ti ti-target' },
	{ key: 'rest', title: i18n.ts._widgetPomodoro.rest, icon: 'ti ti-coffee' },
] satisfies { key: Mode; title: string; icon: string }[];
const previewMode = ref<Mode>(widgetProps.state.mode === 'rest' ? 'rest' : 'focus');
const mode = computed(() => isPreview.value ? previewMode.value : widgetProps.state.mode === 'rest' ? 'rest' : 'focus');
const duration = computed(() => {
	const value = mode.value === 'focus' ? widgetProps.focusDuration : widgetProps.restDuration;
	const fallback = mode.value === 'focus' ? 25 : 5;
	const maximum = mode.value === 'focus' ? 180 : 60;
	return Math.min(maximum, Math.max(1, Math.round(Number.isFinite(value) ? value : fallback))) * 60_000;
});
const now = ref(Date.now());
const session = computed(() => isPreview.value ? null : widgetProps.state.session);
const remaining = computed(() => {
	const current = session.value;
	return current ? Math.max(0, current.deadline === null ? current.remaining : current.deadline - now.value) : duration.value;
});
const running = computed(() => session.value?.deadline != null && remaining.value > 0);
const paused = computed(() => session.value?.deadline === null && remaining.value > 0);
const completed = computed(() => remaining.value === 0);
const status = computed(() => {
	if (completed.value) return i18n.ts._widgetPomodoro.completed;
	if (paused.value) return i18n.ts._widgetPomodoro.paused;
	if (running.value) return mode.value === 'focus' ? i18n.ts._widgetPomodoro.focusing : i18n.ts._widgetPomodoro.resting;
	return mode.value === 'focus' ? i18n.ts._widgetPomodoro.readyFocus : i18n.ts._widgetPomodoro.readyRest;
});
const displayTime = computed(() => {
	const seconds = Math.ceil(remaining.value / 1000);
	return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
});
const progress = computed(() => Math.min(1, Math.max(0, 1 - remaining.value / (session.value?.duration ?? duration.value))));
let interval: number | undefined;

function stopTimer() {
	if (interval !== undefined) window.clearInterval(interval);
	interval = undefined;
}

function updateTime() {
	if (isPreview.value) return;
	now.value = Date.now();
	if (!running.value) stopTimer();
	if (session.value?.deadline != null && completed.value) {
		widgetProps.state = { mode: mode.value, session: { ...session.value, remaining: 0, deadline: null } };
		saveState();
		notifyTimerCompletion(i18n.ts._widgetPomodoro.completed, mode.value === 'focus' ? i18n.ts._widgetPomodoro.focus : i18n.ts._widgetPomodoro.rest);
	}
}

function saveState() {
	if (isPreview.value) return;
	emit('updateProps', { ...widgetProps, state: { mode: mode.value, session: widgetProps.state.session ? { ...widgetProps.state.session } : null } });
}

function toggleTimer() {
	if (isPreview.value) return;
	updateTime();
	if (running.value && widgetProps.state.session) {
		widgetProps.state = { mode: mode.value, session: { ...widgetProps.state.session, remaining: remaining.value, deadline: null } };
	} else {
		const time = completed.value ? duration.value : remaining.value;
		widgetProps.state = {
			mode: mode.value,
			session: {
				duration: paused.value ? widgetProps.state.session!.duration : duration.value,
				remaining: time,
				deadline: now.value + time,
			},
		};
	}
	saveState();
}

function reset() {
	if (isPreview.value) return;
	widgetProps.state = { mode: mode.value, session: null };
	saveState();
}

function selectMode(value: Mode | undefined) {
	if (value === undefined || mode.value === value) return;
	if (isPreview.value) {
		previewMode.value = value;
		return;
	}
	widgetProps.state = { mode: value, session: null };
	saveState();
}

onMounted(() => {
	watch([() => widgetProps.state.session?.deadline, isPreview], () => {
		stopTimer();
		updateTime();
		if (!running.value) return;
		interval = window.setInterval(updateTime, 250);
	}, { immediate: true });
	window.addEventListener('focus', updateTime);
	window.document.addEventListener('visibilitychange', updateTime);
});
onBeforeUnmount(() => {
	stopTimer();
	window.removeEventListener('focus', updateTime);
	window.document.removeEventListener('visibilitychange', updateTime);
});

defineExpose<WidgetComponentExpose>({ name, configure, id: props.widget?.id ?? null });
</script>

<style lang="scss" module>
.root {
	padding: var(--MI-cardPadding, 20px);
	text-align: center;
}

.modes {
	display: flex;
	gap: 4px;
	padding: 4px;
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-buttonBg);
}

.mode {
	display: flex;
	flex: 1;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-width: 0;
	min-height: 28px;
	padding: 4px 8px;
	border-radius: calc(var(--MI-radius) - 4px);
	font-size: 0.85em;
	line-height: 1.4;

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
	}

	&.selected {
		background: var(--MI_THEME-panel);
		color: var(--MI_THEME-fgHighlighted);
		font-weight: 600;
		box-shadow: 0 1px 3px var(--MI_THEME-divider);

		> i {
			color: var(--MI_THEME-accent);
		}
	}
}

.timer {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 10px;
	margin: 22px 0 18px;
}

.time {
	font-family: Consolas, 'Courier New', monospace;
	font-size: 2.6em;
	font-weight: 500;
	font-variant-numeric: tabular-nums;
	line-height: 1;
	letter-spacing: -0.03em;
	color: var(--MI_THEME-fgHighlighted);
}

.progress {
	display: block;
	width: 100%;
	height: 4px;
	border-radius: 2px;
}

.status {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 5px;
	font-size: 0.8em;
	line-height: 1.5;
	color: var(--MI_THEME-fg);

	&.active > i {
		color: var(--MI_THEME-accent);
	}
}

.actions {
	display: flex;
	gap: 8px;
	margin-top: 16px;
}

.start,
.reset {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-height: 36px;
	border-radius: var(--MI-radius);
	font-size: 0.9em;
}

.start {
	flex: 1;
	min-width: 0;
	padding: 8px 12px;
	font-weight: 600;
}

.reset {
	flex: none;
	width: 36px;
	background: var(--MI_THEME-buttonBg);

	&:hover:not(:disabled) {
		background: var(--MI_THEME-buttonHoverBg);
	}
}
</style>
