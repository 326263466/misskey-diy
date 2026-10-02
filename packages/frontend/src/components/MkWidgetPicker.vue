<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal ref="modal" :preferType="mobile ? 'drawer' : 'dialog'" :returnFocusTo="returnFocusTo" @click="close" @esc="close" @opened="focus" @closed="emit('closed')">
	<section ref="dialogEl" :class="[$style.root, { [$style.drawer]: mobile }]" role="dialog" aria-modal="true" :aria-labelledby="titleId" tabindex="-1" @keydown="onKeydown">
		<header :class="$style.header">
			<h2 :id="titleId" :class="$style.title">{{ selectedWidgets ? i18n.ts.editWidgets : i18n.ts._widgetPicker.title }}</h2>
			<button type="button" class="_button" :class="$style.close" :aria-label="i18n.ts.close" @click="close"><i class="ti ti-x" aria-hidden="true"></i></button>
		</header>
		<div :class="$style.searchArea">
			<label :class="$style.searchBox">
				<i class="ti ti-search" aria-hidden="true"></i>
				<input ref="input" v-model="query" :class="$style.input" :placeholder="i18n.ts._widgetPicker.search" :aria-label="i18n.ts._widgetPicker.search" autocomplete="off" autocapitalize="off" spellcheck="false">
			</label>
		</div>
		<div ref="resultsEl" :class="$style.results">
			<template v-if="selectedWidgets && !query.trim()">
				<h3 :class="$style.sectionTitle">{{ i18n.ts._widgetPicker.current }}</h3>
				<MkDraggable :modelValue="selectedWidgets" direction="vertical" @update:modelValue="reorder">
					<template #default="{ item, index }">
						<div :class="$style.selectedRow" :data-selected-widget="item.id">
							<span :class="$style.selectedName">{{ widgetLabel(item.name) }}</span>
							<button type="button" class="_button" :class="$style.action" :disabled="closed || index === 0" :aria-label="i18n.ts._widgetPicker.moveUp" @click="move(index, -1)"><i class="ti ti-chevron-up" aria-hidden="true"></i></button>
							<button type="button" class="_button" :class="$style.action" :disabled="closed || index === selectedWidgets.length - 1" :aria-label="i18n.ts._widgetPicker.moveDown" @click="move(index, 1)"><i class="ti ti-chevron-down" aria-hidden="true"></i></button>
							<button type="button" class="_button" :class="$style.action" :disabled="closed" :aria-label="i18n.ts.settings" @click="emit('configure', item.id)"><i class="ti ti-settings" aria-hidden="true"></i></button>
							<button type="button" class="_button" :class="$style.action" :disabled="closed" :aria-label="i18n.ts.remove" @click="emit('remove', item)"><i class="ti ti-x" aria-hidden="true"></i></button>
						</div>
					</template>
				</MkDraggable>
				<h3 :class="$style.sectionTitle">{{ i18n.ts._widgetPicker.title }}</h3>
			</template>
			<button v-for="widget in results" :key="widget.name" type="button" class="_button" :class="$style.option" :disabled="closed" :data-widget="widget.name" @click="choose(widget.name)">
				<i :class="[widget.icon, $style.icon]" aria-hidden="true"></i>
				<span :class="$style.optionText">
					<span :class="$style.name">{{ widget.label }}</span>
					<span :class="$style.description">{{ widget.description }}</span>
				</span>
				<i class="ti ti-plus" :class="$style.addIcon" aria-hidden="true"></i>
			</button>
			<p v-if="results.length === 0" :class="$style.empty" role="status">{{ i18n.ts._widgetPicker.empty }}</p>
		</div>
		<footer v-if="selectedWidgets" :class="$style.footer">
			<button v-if="canReset" type="button" class="_button" :class="$style.reset" :disabled="closed" @click="emit('reset')"><i class="ti ti-restore" aria-hidden="true"></i> {{ i18n.ts.resetToDefaultValue }}</button>
			<button type="button" class="_button" :class="$style.done" @click="close">{{ i18n.ts.editWidgetsExit }}</button>
		</footer>
	</section>
</MkModal>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, ref, useId, useTemplateRef, watch } from 'vue';
import type { WidgetName } from '@/widgets/index.js';
import type { Widget } from '@/components/MkWidgets.vue';
import MkModal from '@/components/MkModal.vue';
import MkDraggable from '@/components/MkDraggable.vue';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	widgets: readonly WidgetName[];
	selectedWidgets?: Widget[];
	canReset?: boolean;
	returnFocusTo?: HTMLElement;
}>();
const emit = defineEmits<{
	(ev: 'choose', name: WidgetName): void;
	(ev: 'closed'): void;
	(ev: 'configure', id: string): void;
	(ev: 'remove', widget: Widget): void;
	(ev: 'reorder', widgets: Widget[]): void;
	(ev: 'reset'): void;
}>();

const icons = {
	profile: 'ti ti-user',
	instanceInfo: 'ti ti-info-circle',
	memo: 'ti ti-note',
	todo: 'ti ti-list-check',
	pomodoro: 'ti ti-hourglass',
	countdown: 'ti ti-alarm',
	notifications: 'ti ti-bell',
	timeline: 'ti ti-home',
	calendar: 'ti ti-calendar',
	rss: 'ti ti-rss',
	rssTicker: 'ti ti-rss',
	trends: 'ti ti-hash',
	clock: 'ti ti-clock',
	activity: 'ti ti-chart-line',
	photos: 'ti ti-camera',
	digitalClock: 'ti ti-clock-hour-4',
	unixClock: 'ti ti-clock-code',
	postForm: 'ti ti-pencil',
	slideshow: 'ti ti-slideshow',
	serverMetric: 'ti ti-server',
	onlineUsers: 'ti ti-users',
	jobQueue: 'ti ti-list-details',
	button: 'ti ti-square-rounded',
	aiscript: 'ti ti-terminal-2',
	aiscriptApp: 'ti ti-app-window',
	aichan: 'ti ti-mood-smile',
	userList: 'ti ti-users-group',
	clicker: 'ti ti-hand-click',
	birthdayFollowings: 'ti ti-cake',
	chat: 'ti ti-messages',
	federation: 'ti ti-world',
	instanceCloud: 'ti ti-cloud',
} satisfies Record<WidgetName, string>;

const modal = useTemplateRef('modal');
const dialogEl = useTemplateRef('dialogEl');
const input = useTemplateRef('input');
const resultsEl = useTemplateRef('resultsEl');
const titleId = useId();
const query = ref('');
const closed = ref(false);
const media = window.matchMedia('(max-width: 600px)');
const mobile = ref(media.matches);
const results = computed(() => {
	const search = query.value.trim().toLocaleLowerCase();
	return props.widgets.map(name => ({
		name,
		label: name === 'chat' ? i18n.ts.chat : i18n.ts._widgets[name],
		description: i18n.ts._widgetPicker._descriptions[name],
		icon: icons[name],
	})).filter(widget => `${widget.label} ${widget.description} ${widget.name}`.toLocaleLowerCase().includes(search));
});

function onMediaChange(event: MediaQueryListEvent): void {
	mobile.value = event.matches;
}

function focus(): void {
	if (closed.value) return;
	// Keep the mobile keyboard closed until the user chooses to search.
	if (mobile.value) dialogEl.value?.focus();
	else input.value?.focus();
}

function widgetLabel(name: string): string {
	return name === 'chat' ? i18n.ts.chat : i18n.ts._widgets[name as WidgetName] ?? name;
}

function reorder(widgets: Widget[]): void {
	if (!closed.value) emit('reorder', widgets);
}

function move(index: number, offset: number): void {
	if (!props.selectedWidgets || closed.value) return;
	const next = [...props.selectedWidgets];
	const target = index + offset;
	if (target < 0 || target >= next.length) return;
	const [widget] = next.splice(index, 1);
	next.splice(target, 0, widget);
	reorder(next);
}

function close(): void {
	if (closed.value) return;
	closed.value = true;
	modal.value?.close();
}

function onKeydown(event: KeyboardEvent): void {
	if (event.isComposing || event.keyCode === 229) return;
	if (event.key === 'Escape') {
		event.preventDefault();
		event.stopPropagation();
		close();
	}
}

function choose(name: WidgetName): void {
	if (closed.value || !props.widgets.includes(name)) return;
	close();
	emit('choose', name);
}

watch(query, () => { if (resultsEl.value) resultsEl.value.scrollTop = 0; });
media.addEventListener('change', onMediaChange);
onBeforeUnmount(() => { media.removeEventListener('change', onMediaChange); });
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-direction: column;
	box-sizing: border-box;
	width: min(520px, 100%);
	height: 560px;
	max-height: calc(100dvh - 64px);
	margin: auto;
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-panel);
	color: var(--MI_THEME-fg);
	overflow: hidden;
}

.drawer {
	width: 100%;
	height: 75dvh;
	max-height: calc(100dvh - 16px);
	padding-bottom: env(safe-area-inset-bottom, 0px);
	border-radius: var(--MI-radius) var(--MI-radius) 0 0;
}

.header { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-shrink: 0; padding: 12px 16px 4px 20px; }
.title { margin: 0; font-size: 1.1em; font-weight: 700; }
.close { display: grid; place-items: center; width: 40px; height: 40px; flex-shrink: 0; border-radius: var(--MI-radius); color: var(--MI_THEME-fgTransparentWeak); }
.searchArea { padding: 8px 20px 16px; flex-shrink: 0; }
.searchBox { display: flex; align-items: center; gap: 10px; padding: 0 12px; border: 1px solid var(--MI_THEME-divider); border-radius: var(--MI-radius); color: var(--MI_THEME-fgTransparentWeak); }
.searchBox:focus-within { border-color: var(--MI_THEME-focus); }
.input { flex: 1; min-width: 0; height: 40px; padding: 0; border: 0; outline: 0; background: transparent; color: var(--MI_THEME-fg); font: inherit; }
.input::placeholder { color: var(--MI_THEME-fgTransparentWeak); }
.results { min-height: 0; flex: 1; overflow-y: auto; overscroll-behavior: contain; padding: 4px 12px 12px; border-top: 1px solid var(--MI_THEME-divider); }
.option { display: flex; align-items: center; gap: 14px; width: 100%; min-height: 72px; padding: 12px; border-radius: var(--MI-radius); text-align: start; }
.icon { width: 28px; flex-shrink: 0; text-align: center; font-size: 1.5em; color: var(--MI_THEME-fgTransparentWeak); }
.optionText { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.name { display: block; font-size: 1em; line-height: 1.5; }
.description { display: block; margin-top: 3px; font-size: .85em; line-height: 1.5; color: var(--MI_THEME-fgTransparentWeak); }
.addIcon { flex-shrink: 0; color: var(--MI_THEME-fgTransparentWeak); }
.close:enabled:hover, .option:enabled:hover { background: var(--MI_THEME-buttonBg); }
.close:focus-visible, .option:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -2px; }
.empty { margin: 32px 12px; text-align: center; line-height: 1.6; color: var(--MI_THEME-fgTransparentWeak); }
.sectionTitle { margin: 16px 12px 8px; font-size: .85em; font-weight: 400; color: var(--MI_THEME-fgTransparentWeak); }
.selectedRow { display: flex; align-items: center; gap: 2px; min-height: 48px; padding: 0 8px 0 12px; }
.selectedName { flex: 1; min-width: 0; overflow-wrap: anywhere; margin-right: 8px; font-size: .9em; }
.action { flex-shrink: 0; width: 32px; height: 40px; border-radius: var(--MI-radius); color: var(--MI_THEME-fgTransparentWeak); }
.action:disabled { opacity: .3; }
.action:enabled:hover, .reset:hover, .done:hover { background: var(--MI_THEME-buttonBg); }
.action:focus-visible, .reset:focus-visible, .done:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -2px; }
.footer { display: flex; align-items: center; gap: 12px; padding: 12px 20px; border-top: 1px solid var(--MI_THEME-divider); }
.reset { color: var(--MI_THEME-fgTransparentWeak); text-align: start; padding: 8px 0; font-size: .85em; }
.done { margin-left: auto; padding: 10px 12px; border-radius: var(--MI-radius); color: var(--MI_THEME-accent); white-space: nowrap; }
</style>
