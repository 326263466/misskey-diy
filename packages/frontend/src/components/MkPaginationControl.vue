<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl" :class="[$style.root, { [$style.compact]: compact, [$style.card]: card, [$style.scrolled]: card && scrolled, [$style.inHeader]: inHeader }]">
	<div :class="$style.toolbar">
		<div v-if="$slots.header" :class="$style.header"><slot name="header"></slot></div>
		<div :class="$style.control">
			<MkSelect v-model="order" :class="$style.order" :items="orderDef" :small="compact">
				<template v-if="!compact" #prefix><i class="ti ti-arrows-sort"></i></template>
			</MkSelect>
			<MkButton v-if="paginator.canSearch" :aria-label="searchLabel" iconOnly transparent rounded :active="!!paginator.searchQuery.value" @click="selectSearch"><i class="ti ti-search"></i></MkButton>
			<MkButton v-if="canFilter" :aria-label="i18n.ts.filter" iconOnly transparent rounded :active="filterOpened" @click="filterOpened = !filterOpened"><i class="ti ti-filter"></i></MkButton>
			<MkButton :aria-label="dateLabel" iconOnly transparent rounded :active="date != null" @click="selectDate"><i class="ti ti-calendar-clock"></i></MkButton>
			<MkButton v-if="date != null" :aria-label="i18n.ts.clear" iconOnly transparent rounded @click="setDate(null)"><i class="ti ti-x"></i></MkButton>
			<MkButton :aria-label="i18n.ts.reload" iconOnly transparent rounded @click="paginator.reload()"><i class="ti ti-refresh"></i></MkButton>
		</div>
	</div>

	<slot v-if="filterOpened"></slot>
</div>
</template>

<script lang="ts" setup generic="T extends IPaginator">
import { computed, ref, watch, useTemplateRef, onMounted, onUnmounted } from 'vue';
import type { IPaginator } from '@/utility/paginator.js';
import MkButton from '@/components/MkButton.vue';
import { getScrollContainer } from '@@/js/scroll.js';
import { i18n } from '@/i18n.js';
import MkSelect from '@/components/MkSelect.vue';
import MkDialog from '@/components/MkDialog.vue';
import * as os from '@/os.js';
import { formatDateTimeString } from '@/utility/format-time-string.js';

const props = withDefaults(defineProps<{
	paginator: T;
	canFilter?: boolean;
	filterOpened?: boolean;
	compact?: boolean;
	card?: boolean;
	inHeader?: boolean;
}>(), {
	canFilter: false,
	filterOpened: false,
	compact: true,
	card: false,
	inHeader: false,
});

const filterOpened = ref(props.filterOpened);

const rootEl = useTemplateRef('rootEl');
const scrolled = ref(false);
let scrollContainer: HTMLElement | null = null;

function onScroll() {
	scrolled.value = (scrollContainer?.scrollTop ?? window.scrollY) > 4;
}

onMounted(() => {
	if (!props.card || rootEl.value == null) return;
	scrollContainer = getScrollContainer(rootEl.value);
	const target: EventTarget = scrollContainer ?? window;
	target.addEventListener('scroll', onScroll, { passive: true });
	onScroll();
});

onUnmounted(() => {
	(scrollContainer ?? window).removeEventListener('scroll', onScroll);
});

const orderDef = [
	{ label: i18n.ts._order.newest, value: 'newest' as const },
	{ label: i18n.ts._order.oldest, value: 'oldest' as const },
];
const order = computed({
	get: () => props.paginator.order.value,
	set: (value: 'newest' | 'oldest') => {
		if (value === props.paginator.order.value) return;
		props.paginator.order.value = value;
		props.paginator.initialDirection = value === 'oldest' ? 'newer' : 'older';
		props.paginator.reload();
	},
});
const date = ref(props.paginator.initialDate);
watch(() => props.paginator, paginator => {
	date.value = paginator.initialDate;
});

const searchLabel = computed(() => props.paginator.searchQuery.value
	? `${i18n.ts.search}: ${props.paginator.searchQuery.value}`
	: i18n.ts.search);
const dateLabel = computed(() => date.value == null
	? i18n.ts.dateAndTime
	: `${i18n.ts.dateAndTime}: ${formatDateTimeString(new Date(date.value), 'yyyy-MM-dd')}`);

function setDate(value: number | null, paginator: T = props.paginator) {
	if (paginator.initialDate === value) return;
	paginator.initialDate = value;
	if (paginator === props.paginator) date.value = value;
	paginator.reload();
}

function selectDate() {
	const paginator = props.paginator;
	const { dispose } = os.popup(MkDialog, {
		title: i18n.ts.dateAndTime,
		input: {
			type: 'date',
			default: formatDateTimeString(new Date(paginator.initialDate ?? Date.now()), 'yyyy-MM-dd'),
		},
		okText: i18n.ts.apply,
	}, {
		done: ({ canceled, result }) => {
			if (canceled) return;
			if (result == null || result === '') {
				setDate(null, paginator);
				return;
			}
			if (typeof result !== 'string') return;
			const selectedDate = new Date(`${result}T00:00:00`).getTime();
			if (Number.isFinite(selectedDate)) setDate(selectedDate, paginator);
		},
		closed: () => dispose(),
	});
}

function selectSearch() {
	const paginator = props.paginator;
	const { dispose } = os.popup(MkDialog, {
		title: i18n.ts.search,
		input: { type: 'text', default: paginator.searchQuery.value ?? '' },
		okText: i18n.ts.apply,
	}, {
		done: ({ canceled, result }) => {
			if (canceled || (result != null && typeof result !== 'string')) return;
			const query = result?.trim() || null;
			if ((paginator.searchQuery.value || null) === query) return;
			paginator.searchQuery.value = query;
			paginator.reload();
		},
		closed: () => dispose(),
	});
}
</script>

<style lang="scss" module>
@use "../styles/page-header.scss";

.root {
	display: flex;
	flex-direction: column;
	gap: 8px;
	margin-bottom: 10px;
}

.card {
	@include page-header.surface;
	background: var(--MI_THEME-panel);
	-webkit-backdrop-filter: none;
	backdrop-filter: none;
	transition: background 0.2s;
	padding: 0 12px;

	.toolbar {
		min-height: var(--height);
	}

	&.scrolled {
		background: color(from var(--MI_THEME-panel) srgb r g b / 0.85);
		-webkit-backdrop-filter: var(--MI-blur, blur(15px));
		backdrop-filter: var(--MI-blur, blur(15px));
	}
}

.control {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: flex-end;
	gap: 4px;
	max-width: 100%;
	margin-left: auto;
}

.toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px 16px;
}

.header {
	flex: 1 1 240px;
	min-width: 0;
}

.order {
	flex: 1;
	margin-right: 6px;
}

.compact {
	margin-bottom: 0;

	.order {
		flex: none;
		width: 130px;
		margin-right: 0;
	}
}

.inHeader {
	margin-bottom: 0;

	.toolbar,
	.control {
		flex-wrap: nowrap;
	}

	.order {
		width: clamp(8.5em, 18vw, 130px);
	}

	.control > button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		padding: 0;
		line-height: 1;
	}

	.control i {
		display: block;
		line-height: 1;
	}
}
</style>
