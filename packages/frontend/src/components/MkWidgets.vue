<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root" class="_gaps_s">
	<Suspense v-for="widget in _widgets" :key="widget.id">
		<component :is="`widget-${widget.name}`" :ref="(el: any) => widgetRefs[widget.id] = el" :class="[$style.widget, '_juejinCard']" :widget="widget" @updateProps="updateWidget(widget.id, $event)" @contextmenu.stop="onContextmenu(widget, $event)"/>
		<template #fallback>
			<div :class="$style.loading" class="_panel _juejinCard" aria-busy="true"><MkLoading :colored="false"/></div>
		</template>
	</Suspense>
</div>
</template>

<script lang="ts">
export type Widget = {
	name: string;
	id: string;
	data: Record<string, any>;
};
export type DefaultStoredWidget = {
	place: string | null;
} & Widget;
</script>

<script lang="ts" setup>
import { computed, defineAsyncComponent, onBeforeUnmount, reactive, watch } from 'vue';
import { isLink } from '@@/js/is-link.js';
import type { Component } from 'vue';
import { genId } from '@/utility/id.js';
import MkLoading from '@/components/global/MkLoading.vue';
import { widgets as widgetDefs, federationWidgets } from '@/widgets/index.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';

const props = withDefaults(defineProps<{
	widgets: Widget[];
	edit: boolean;
	readOnly?: boolean;
	canReset?: boolean;
}>(), {
	readOnly: false,
});

const _widgetDefs = computed(() => {
	if (instance.federation === 'none') {
		return widgetDefs.filter(x => !federationWidgets.includes(x as any));
	} else {
		return widgetDefs;
	}
});

const _widgets = computed(() => props.widgets.filter(x => _widgetDefs.value.includes(x.name as any)));

const emit = defineEmits<{
	(ev: 'updateWidgets', widgets: Widget[]): void;
	(ev: 'addWidget', widget: Widget): void;
	(ev: 'removeWidget', widget: Widget): void;
	(ev: 'updateWidget', widget: { id: Widget['id']; data: Widget['data']; }): void;
	(ev: 'exit'): void;
	(ev: 'reset'): void;
}>();

const widgetRefs = {} as Record<string, Component & { configure: () => void }>;

function configWidget(id: string) {
	widgetRefs[id]?.configure();
}

let disposePicker: (() => void) | undefined;

function openWidgetPicker(): void {
	if (!props.edit || props.readOnly || disposePicker) return;
	let active = true;
	const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkWidgetPicker.vue')), reactive({
		widgets: _widgetDefs,
		selectedWidgets: computed(() => props.widgets),
		canReset: computed(() => props.canReset),
		returnFocusTo: document.activeElement instanceof HTMLElement ? document.activeElement : undefined,
	}), {
		choose: name => {
			if (!active || !props.edit || props.readOnly || !_widgetDefs.value.includes(name)) return;
			active = false;
			emit('addWidget', { name, id: genId(), data: {} });
		},
		configure: id => { if (active && props.edit && !props.readOnly) configWidget(id); },
		remove: widget => { if (active && props.edit && !props.readOnly) emit('removeWidget', widget); },
		reorder: widgets => { if (active && props.edit && !props.readOnly) emit('updateWidgets', widgets); },
		reset: () => { if (active && props.edit && !props.readOnly && props.canReset) emit('reset'); },
		closed: () => { dismiss(); emit('exit'); },
	});
	const dismiss = () => {
		active = false;
		dispose();
		if (disposePicker === dismiss) disposePicker = undefined;
	};
	disposePicker = dismiss;
}

watch(() => props.edit && !props.readOnly, editable => {
	if (editable) openWidgetPicker();
	else disposePicker?.();
}, { immediate: true, flush: 'post' });
onBeforeUnmount(() => disposePicker?.());

function updateWidget(id: Widget['id'], data: Widget['data']) {
	if (props.readOnly) return;
	emit('updateWidget', { id, data });
}

function onContextmenu(widget: Widget, ev: PointerEvent) {
	if (props.readOnly) return;
	const element = ev.target as HTMLElement | null;
	if (element && isLink(element)) return;
	if (element && (['INPUT', 'TEXTAREA', 'IMG', 'VIDEO', 'CANVAS'].includes(element.tagName) || element.attributes.getNamedItem('contenteditable') != null)) return;
	if (window.getSelection()?.toString() !== '') return;

	os.contextMenu([{
		type: 'label',
		text: widget.name === 'chat' ? i18n.ts.chat : i18n.ts._widgets[widget.name as typeof widgetDefs[number]],
	}, {
		icon: 'ti ti-settings',
		text: i18n.ts.settings,
		action: () => {
			configWidget(widget.id);
		},
	}], ev);
}
</script>

<style lang="scss" module>
.root {
	container-type: inline-size;
}

.widget {
	contain: content;
}

.loading { min-height: 120px; display: grid; place-items: center; color: var(--MI_THEME-fgTransparentWeak); }
</style>
