<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkContainer :showHeader="widgetProps.showHeader" :naked="widgetProps.transparent" data-testid="mkw-todo">
	<template #icon><i class="ti ti-list-check"></i></template>
	<template #header>{{ i18n.ts._widgets.todo }}</template>

	<div :class="$style.root">
		<div :class="$style.addRow">
			<label :class="$style.input">
				<MkInput v-model="draft" :placeholder="i18n.ts._widgetTodo.addTask" small @enter.prevent="addTask">
					<template #label>{{ i18n.ts._widgetTodo.addTask }}</template>
				</MkInput>
			</label>
			<MkButton v-tooltip="i18n.ts.add" :disabled="!draft.trim()" primary iconOnly :aria-label="i18n.ts.add" @click="addTask"><i class="ti ti-plus"></i></MkButton>
		</div>
		<p v-if="widgetProps.items.length === 0" :class="$style.empty">{{ i18n.ts._widgetTodo.empty }}</p>
		<ul v-else :class="$style.list">
			<li v-for="item in widgetProps.items" :key="item.id" :class="$style.item">
				<div :class="$style.task">
					<input type="checkbox" :checked="item.completed" :class="$style.checkbox" :aria-label="item.text" @change="toggleTask(item.id)">
					<span :class="{ [$style.completed]: item.completed }" class="_selectable">{{ item.text }}</span>
				</div>
				<button v-tooltip="i18n.ts._widgetTodo.deleteTask" type="button" class="_button" :class="$style.remove" :aria-label="i18n.ts._widgetTodo.deleteTask" @click="deleteTask(item.id)"><i class="ti ti-x"></i></button>
			</li>
		</ul>
		<div v-if="widgetProps.items.length > 0" :class="$style.footer">
			<span>{{ i18n.tsx._widgetTodo.remaining({ count: remaining }) }}</span>
			<button v-if="remaining < widgetProps.items.length" type="button" class="_button _textButton" @click="clearCompleted">{{ i18n.ts._widgetTodo.clearCompleted }}</button>
		</div>
	</div>
</MkContainer>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { useWidgetPropsManager } from './widget.js';
import type { WidgetComponentEmits, WidgetComponentExpose, WidgetComponentProps } from './widget.js';
import type { FormWithDefault, GetFormResultType } from '@/utility/form.js';
import MkContainer from '@/components/MkContainer.vue';
import MkInput from '@/components/MkInput.vue';
import MkButton from '@/components/MkButton.vue';
import { genId } from '@/utility/id.js';
import { i18n } from '@/i18n.js';

type TodoItem = { id: string; text: string; completed: boolean };

const name = 'todo';
const widgetPropsDef = {
	showHeader: { type: 'boolean', label: i18n.ts._widgetOptions.showHeader, default: true },
	transparent: { type: 'boolean', label: i18n.ts._widgetOptions.transparent, default: false },
	items: { type: 'array', hidden: true, default: [] as TodoItem[] },
} satisfies FormWithDefault;

type WidgetProps = GetFormResultType<typeof widgetPropsDef>;
const props = defineProps<WidgetComponentProps<WidgetProps>>();
const emit = defineEmits<WidgetComponentEmits<WidgetProps>>();
const { widgetProps, configure } = useWidgetPropsManager(name, widgetPropsDef, props, emit);
const draft = ref('');
const remaining = computed(() => widgetProps.items.filter(item => !item.completed).length);

function saveItems(items: TodoItem[]) {
	widgetProps.items = items;
	emit('updateProps', { ...widgetProps, items: items.map(item => ({ ...item })) });
}

function addTask() {
	const text = draft.value.trim();
	if (!text) return;
	saveItems([...widgetProps.items, { id: genId(), text, completed: false }]);
	draft.value = '';
}

function toggleTask(id: string) {
	saveItems(widgetProps.items.map(item => item.id === id ? { ...item, completed: !item.completed } : item));
}

function deleteTask(id: string) {
	saveItems(widgetProps.items.filter(item => item.id !== id));
}

function clearCompleted() {
	saveItems(widgetProps.items.filter(item => !item.completed));
}

defineExpose<WidgetComponentExpose>({ name, configure, id: props.widget?.id ?? null });
</script>

<style lang="scss" module>
.root {
	padding: var(--MI-cardPadding, 18px);
}

.addRow {
	display: flex;
	align-items: flex-end;
	gap: 8px;
}

.input {
	flex: 1;
	min-width: 0;
}

.empty {
	margin: 20px 0 0;
	font-size: 0.9em;
	text-align: center;
	color: var(--MI_THEME-fgTransparentWeak);
}

.list {
	padding: 0;
	margin: 12px 0 0;
	list-style: none;
}

.item {
	display: flex;
	align-items: flex-start;
	gap: 4px;
	padding: 6px 0;
}

.task {
	// 若允许 grow，正文右侧的空白也会成为点击区域，
	// 导致在复选框/正文之外也能切换。这里收拢到内容宽度。
	display: flex;
	flex: 0 1 auto;
	align-items: flex-start;
	gap: 8px;
	min-width: 0;
	padding: 4px 0;
	line-height: 1.5;
	overflow-wrap: anywhere;
}

.checkbox {
	flex-shrink: 0;
	width: 16px;
	height: 16px;
	margin: 3px 0 0;
	accent-color: var(--MI_THEME-accent);
	cursor: pointer;
}

.completed {
	text-decoration: line-through;
	color: var(--MI_THEME-fgTransparentWeak);
}

.remove {
	flex-shrink: 0;
	// task 改为内容宽度后，删除按钮重新靠到右端
	margin-left: auto;
	width: 28px;
	height: 28px;
	border-radius: var(--MI-radius);
	color: var(--MI_THEME-fgTransparentWeak);

	&:hover {
		color: var(--MI_THEME-fg);
		background: var(--MI_THEME-buttonHoverBg);
	}
}

.footer {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
	gap: 8px;
	margin-top: 12px;
	font-size: 0.8em;
	color: var(--MI_THEME-fgTransparentWeak);
}
</style>
