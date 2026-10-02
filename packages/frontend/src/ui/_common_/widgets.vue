<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div>
	<XWidgets
		:edit="$i != null && editMode"
		:readOnly="$i == null"
		:canReset="true"
		:widgets="widgets"
		@addWidget="addWidget"
		@removeWidget="removeWidget"
		@updateWidget="updateWidget"
		@updateWidgets="updateWidgets"
		@exit="editMode = false"
		@reset="resetWidgets"
	/>
	<button v-if="$i" :aria-expanded="editMode" class="_textButton" data-testid="widget-edit" :class="$style.edit" style="font-size: 0.9em;" @click="editMode = true"><i class="ti ti-pencil"></i> {{ i18n.ts.editWidgets }}</button>
</div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import type { DefaultStoredWidget, Widget } from '@/components/MkWidgets.vue';
import XWidgets from '@/components/MkWidgets.vue';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import { getInitialPrefValue } from '@/preferences/manager.js';
import { $i } from '@/i.js';

const props = withDefaults(defineProps<{
	// null = 全てのウィジェットを表示
	// left = place: leftだけを表示
	// right = rightとnullを表示
	place?: 'left' | null | 'right';
}>(), {
	place: null,
});

const editMode = ref(false);
const guestWidgets = $i ? [] : getInitialPrefValue('widgets');
const widgets = computed(() => {
	const available = $i ? prefer.r.widgets.value : guestWidgets;
	if (props.place === null) return available;
	if (props.place === 'left') return available.filter(w => w.place === 'left');
	return available.filter(w => w.place !== 'left');
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
	color: var(--MI_THEME-fgTransparentWeak);

	// 去掉 _textButton 悬停时的下划线，保持与周边弱化文案一致
	&:not(:disabled):hover {
		text-decoration: none;
	}
}
</style>
