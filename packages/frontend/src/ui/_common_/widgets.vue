<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div>
	<XWidgets
		:edit="editMode"
		:widgets="widgets"
		@addWidget="addWidget"
		@removeWidget="removeWidget"
		@updateWidget="updateWidget"
		@updateWidgets="updateWidgets"
		@exit="editMode = false"
	/>

	<div v-if="editMode" class="_buttonsCenter" style="font-size: 0.9em;">
		<button class="_textButton" @click="editMode = false"><i class="ti ti-check"></i> {{ i18n.ts.editWidgetsExit }}</button>
		<button class="_textButton" data-testid="widget-reset" @click="resetWidgets"><i class="ti ti-restore"></i> {{ i18n.ts.resetToDefaultValue }}</button>
	</div>
	<button v-else class="_textButton" data-testid="widget-edit" :class="$style.edit" style="font-size: 0.9em;" @click="editMode = true"><i class="ti ti-pencil"></i> {{ i18n.ts.editWidgets }}</button>
</div>
</template>

<script lang="ts">
import { computed, ref } from 'vue';
const editMode = ref(false);
</script>

<script lang="ts" setup>
import type { DefaultStoredWidget, Widget } from '@/components/MkWidgets.vue';
import XWidgets from '@/components/MkWidgets.vue';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import { getInitialPrefValue } from '@/preferences/manager.js';

const props = withDefaults(defineProps<{
	// null = 全てのウィジェットを表示
	// left = place: leftだけを表示
	// right = rightとnullを表示
	place?: 'left' | null | 'right';
}>(), {
	place: null,
});

const widgets = computed(() => {
	if (props.place === null) return prefer.r.widgets.value;
	if (props.place === 'left') return prefer.r.widgets.value.filter(w => w.place === 'left');
	return prefer.r.widgets.value.filter(w => w.place !== 'left');
});

function addWidget(widget: Widget) {
	prefer.commit('widgets', [{
		...widget,
		place: props.place,
	}, ...prefer.s.widgets]);
}

function removeWidget(widget: Widget) {
	prefer.commit('widgets', prefer.s.widgets.filter(w => w.id !== widget.id));
}

function updateWidget(widget: { id: Widget['id']; data: Widget['data']; }) {
	prefer.commit('widgets', prefer.s.widgets.map(w => w.id === widget.id ? {
		...w,
		data: widget.data,
		place: props.place,
	} : w));
}

function updateWidgets(thisWidgets: Widget[]) {
	if (props.place === null) {
		prefer.commit('widgets', thisWidgets as DefaultStoredWidget[]);
		return;
	}

	if (props.place === 'left') {
		prefer.commit('widgets', [
			...thisWidgets.map(w => ({ ...w, place: 'left' })),
			...prefer.s.widgets.filter(w => w.place !== 'left' && !thisWidgets.some(t => w.id === t.id)),
		]);
		return;
	}

	prefer.commit('widgets', [
		...prefer.s.widgets.filter(w => w.place === 'left' && !thisWidgets.some(t => w.id === t.id)),
		...thisWidgets.map(w => ({ ...w, place: 'right' })),
	]);
}

function resetWidgets() {
	prefer.commit('widgets', getInitialPrefValue('widgets'));
}
</script>

<style lang="scss" module>
button.edit {
	display: block;
	width: fit-content;
	margin: 16px auto 0;
}
</style>
