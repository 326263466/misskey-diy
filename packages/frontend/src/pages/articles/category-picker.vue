<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<button :id="id" ref="trigger" type="button" class="_button" :class="$style.trigger" :disabled="disabled" aria-haspopup="dialog" :aria-expanded="opened" @click="open">
	<span>{{ selectedName }}</span>
	<i class="ti ti-chevron-down" aria-hidden="true"></i>
</button>
<Teleport to="body">
	<MkModalWindow v-if="opened" ref="modal" :width="420" :height="480" autoHeight closeButtonRight :returnFocusTo="trigger" :hasInteractionWithOtherFocusTrappedEls="true" zPriority="middle" role="dialog" :aria-label="title ?? i18n.ts._article.category" @opened="focus" @close="close" @closed="opened = false">
		<template #header>{{ title ?? i18n.ts._article.category }}</template>
		<div ref="optionsEl" :class="$style.options" role="group" :aria-label="title ?? i18n.ts._article.category">
			<button v-for="category in categories" :key="category.id ?? ''" type="button" class="_button" :class="[$style.option, { [$style.selected]: model === category.id }]" :aria-pressed="model === category.id" :disabled="disabled || category.unavailable" @click="choose(category.id)">
				<span>{{ category.name }}</span>
				<i v-if="model === category.id" class="ti ti-check" aria-hidden="true"></i>
			</button>
		</div>
	</MkModalWindow>
</Teleport>
</template>

<script lang="ts" setup>
import { computed, ref, useTemplateRef, watch } from 'vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';

const props = defineProps<{ id: string; disabled?: boolean; nullLabel?: string; title?: string }>();
const model = defineModel<string | null>({ required: true });
const trigger = useTemplateRef('trigger');
const modal = useTemplateRef('modal');
const optionsEl = useTemplateRef('optionsEl');
const opened = ref(false);
const categories = computed(() => {
	const configured = instance.articleCategories ?? [];
	return [
		{ id: null, name: props.nullLabel ?? i18n.ts._article.uncategorized, unavailable: false },
		...configured.map(category => ({ ...category, unavailable: false })),
		...(model.value && !configured.some(category => category.id === model.value)
			? [{ id: model.value, name: i18n.ts._article.categoryUnavailable, unavailable: true }] : []),
	];
});
const selectedName = computed(() => categories.value.find(category => category.id === model.value)?.name ?? props.nullLabel ?? i18n.ts._article.uncategorized);

function open() {
	if (!props.disabled) opened.value = true;
}

function close() { modal.value?.close(); }

function focus() {
	(optionsEl.value?.querySelector<HTMLButtonElement>('[aria-pressed="true"]:enabled') ?? optionsEl.value?.querySelector<HTMLButtonElement>('button:enabled'))?.focus();
}

function choose(id: string | null) {
	if (props.disabled) return;
	model.value = id;
	close();
}

watch(() => props.disabled, disabled => { if (disabled) close(); });
</script>

<style lang="scss" module>
.trigger {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	min-width: 0;
	width: 100%;
	min-height: 40px;
	padding: 9px 12px;
	border: 1px solid var(--MI_THEME-inputBorder);
	border-radius: 6px;
	background: var(--MI_THEME-bg);
	text-align: start;
	font-size: 13px;

	span { min-width: 0; overflow-wrap: anywhere; }
	i { flex-shrink: 0; color: var(--MI_THEME-fgTransparentWeak); }
	&:disabled { opacity: .5; }
}

.options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; padding: 16px; }
.option { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; min-height: 42px; padding: 10px 12px; border-radius: 6px; text-align: start; background: var(--MI_THEME-buttonBg); }
.option span { min-width: 0; overflow-wrap: anywhere; }
.option i { flex-shrink: 0; }
.option:disabled { opacity: .5; }
.selected { background: var(--MI_THEME-accentedBg); color: var(--MI_THEME-accent); }
.trigger:focus-visible, .option:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -2px; }
</style>
