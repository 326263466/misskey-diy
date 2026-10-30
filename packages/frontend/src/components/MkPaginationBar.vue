<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="{ [$style.content]: $slots.default }">
	<slot :items="visibleItems" :page="current" :pageSize="pageSize"></slot>
	<nav v-if="items.length > 0 || total != null" class="_pagination" :class="[$style.root, { [$style.simple]: simple, [$style.start]: align === 'start', [$style.center]: align === 'center' }]" :aria-label="i18n.tsx._comment.page({ page: current })" :aria-busy="busy">
		<template v-if="!simple">
			<span :class="$style.total">{{ totalText }}</span>
			<MkSelect :modelValue="pageSize" :items="sizeItems" :class="$style.size" :disabled="busy" @update:modelValue="changeSize">
				<template #label><span :class="$style.srOnly">{{ i18n.ts._pagination.pageSize }}</span></template>
			</MkSelect>
		</template>
		<div :class="$style.pager">
			<button type="button" class="_button" :class="$style.item" :aria-disabled="busy || current <= 1" :aria-label="i18n.ts._comment.previousPage" @click="go(current - 1)"><i class="ti ti-chevron-left" aria-hidden="true"></i></button>
			<template v-for="item in pages" :key="item">
				<button v-if="typeof item === 'number'" type="button" class="_button" :class="[$style.item, { [$style.active]: item === current }]" :aria-current="item === current ? 'page' : undefined" :aria-disabled="busy" @click="go(item)">{{ item }}</button>
				<span v-else :class="$style.ellipsis" aria-hidden="true">…</span>
			</template>
			<button type="button" class="_button" :class="$style.item" :aria-disabled="busy || current >= maxPage" :aria-label="i18n.ts._comment.nextPage" @click="go(current + 1)"><i class="ti ti-chevron-right" aria-hidden="true"></i></button>
		</div>
	</nav>
</div>
</template>

<script lang="ts">
export const DEFAULT_PAGE_SIZE: number = 20;
</script>

<script lang="ts" setup generic="T = unknown">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { i18n } from '@/i18n.js';
import MkSelect from '@/components/MkSelect.vue';

const props = withDefaults(defineProps<{
	/** 完整列表；传 total 时为服务端返回的当前页。 */
	items: T[];
	total?: number;
	/** 游标列表：hasMore 时由 loadMore 补载，失败或没有新数据返回 false。 */
	hasMore?: boolean;
	loadMore?: () => Promise<boolean>;
	disabled?: boolean;
	/** 只显示翻页按钮和页码，不显示总数和条数选择。 */
	simple?: boolean;
	/** 分页在容器中的水平位置。 */
	align?: 'start' | 'center' | 'end';
}>(), {
	hasMore: false,
	disabled: false,
	simple: false,
	align: 'end',
});

const page = defineModel<number>('page', { default: 1 });
const pageSize = defineModel<number>('pageSize', { default: DEFAULT_PAGE_SIZE });
const sizeItems = [10, 20, 50, 100].map(n => ({ label: i18n.tsx._pagination.itemsPerPage({ n }), value: n }));
const filling = ref(false);
let alive = true;

const busy = computed(() => props.disabled || filling.value);
const count = computed(() => props.total ?? props.items.length);
const pageCount = computed(() => Math.max(1, Math.ceil(count.value / pageSize.value)));
// 已加载的末页不足一页时，后续数据先补这一页，不多显示一个空页码。
const maxPage = computed(() => props.hasMore ? Math.floor(count.value / pageSize.value) + 1 : pageCount.value);
const current = computed(() => Math.min(Math.max(1, page.value), pageCount.value));
const visibleItems = computed(() => props.total != null ? props.items : props.items.slice((current.value - 1) * pageSize.value, current.value * pageSize.value));
const totalText = computed(() => props.hasMore
	? i18n.tsx._pagination.loadedItems({ n: count.value.toLocaleString() })
	: i18n.tsx._pagination.totalItems({ n: count.value.toLocaleString() }));

type PageItem = number | 'start' | 'end';

// 主流分页：固定首页和末页，当前页始终可见，超过 7 页时用省略号收敛。
const pages = computed<PageItem[]>(() => {
	const max = maxPage.value;
	const now = current.value;
	if (max <= 7) return Array.from({ length: max }, (_, i) => i + 1);
	if (now <= 4) return [1, 2, 3, 4, 5, 'end', max];
	if (now >= max - 3) return [1, 'start', max - 4, max - 3, max - 2, max - 1, max];
	return [1, 'start', now - 1, now, now + 1, 'end', max];
});

// 游标列表补载到目标页有数据，或没有更多为止。
async function fill(target: number) {
	const needed = () => alive && props.hasMore && props.items.length < target * pageSize.value;
	if (!props.loadMore || !needed()) return;
	filling.value = true;
	try {
		while (needed() && await props.loadMore()) await nextTick();
	} finally {
		filling.value = false;
	}
}

async function go(target: number) {
	if (busy.value || target < 1 || target > maxPage.value || target === current.value) return;
	await fill(target);
	if (props.total != null || props.items.length > (target - 1) * pageSize.value) page.value = target;
}

function changeSize(value: number) {
	if (busy.value) return;
	page.value = 1;
	pageSize.value = value;
}

watch(pageCount, value => {
	if (page.value > value) page.value = value;
});
// 首批不足一页或切换条数后补齐当前页。
watch([() => props.items.length, () => props.disabled, pageSize], () => {
	if (!busy.value) void fill(current.value);
}, { immediate: true });
onBeforeUnmount(() => { alive = false; });

defineSlots<{
	default?: (props: { items: T[]; page: number; pageSize: number }) => void;
}>();
</script>

<style lang="scss" module>
.content {
	display: flex;
	flex-direction: column;
	gap: var(--MI-margin);
}

.root {
	--pageItemSize: 32px;
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: flex-end;
	gap: 8px 12px;
	padding-block: 12px;
	font-size: 1em;
}

.start {
	justify-content: flex-start;
}

.center {
	justify-content: center;
}

// 评论回复等场景：不显示总数和条数选择，按钮更小。
.simple {
	padding-block: 2px;
	font-size: .95em;
}

.total {
	color: var(--MI_THEME-fgTransparentWeak);
	white-space: nowrap;
	font-variant-numeric: tabular-nums;
}

.size {
	--MI-controlHeight: var(--pageItemSize);
	flex: none;
	width: 112px;

	> :first-child {
		padding: 0;
	}
}

.pager {
	display: inline-flex;
	align-items: center;
	gap: 8px;
}

.ellipsis {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: var(--pageItemSize);
	height: var(--pageItemSize);
	color: var(--MI_THEME-fgTransparentWeak);
	font-variant-numeric: tabular-nums;
	user-select: none;
}

// 和 Element Plus 相同：每个页码固定 height / line-height / min-width，
// 用 box-sizing: border-box 锁定外框，激活只换颜色和字重，不改变布局。
.item {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: var(--pageItemSize);
	height: var(--pageItemSize);
	line-height: var(--pageItemSize);
	box-sizing: border-box;
	font-variant-numeric: tabular-nums;
	padding: 0 4px;
	border: none;
	border-radius: 2px;
	background: var(--MI_THEME-panelHighlight);
	color: var(--MI_THEME-fgTransparent);
	font-weight: 500;
	transition: background-color .15s ease, color .15s ease;

	@media (prefers-reduced-motion: reduce) {
		transition: none;
	}

	&:not(.active, [aria-disabled="true"]):hover {
		background: var(--MI_THEME-accent);
		color: var(--MI_THEME-fgOnAccent);
	}

	&.active {
		background: var(--MI_THEME-accent);
		color: var(--MI_THEME-fgOnAccent);
		font-weight: 600;
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: 2px;
	}

	&[aria-disabled="true"]:not(.active) {
		cursor: default;
		background: var(--MI_THEME-panelHighlight);
		color: var(--MI_THEME-fgTransparentVeryWeak);
	}
}

.srOnly {
	position: absolute;
	width: 1px;
	height: 1px;
	overflow: hidden;
	clip-path: inset(50%);
	white-space: nowrap;
}

@container (max-width: 520px) {
	.root {
		--pageItemSize: 28px;
		gap: 8px;
	}

	.item {
		padding-inline: 4px;
	}
}
</style>
