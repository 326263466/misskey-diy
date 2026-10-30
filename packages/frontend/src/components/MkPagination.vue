<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<component :is="prefer.s.enablePullToRefresh && pullToRefresh ? MkPullToRefresh : 'div'" :refresher="() => paginator.reload()" @contextmenu.prevent.stop="onContextmenu">
	<div ref="content" :class="$style.content" :style="loadingHeight != null ? { minHeight: `${loadingHeight}px` } : undefined" :aria-busy="fetching || undefined">
		<MkPaginationControl v-if="props.withControl" :paginator="paginator" :card="controlCard" style="margin-bottom: 10px">
			<template v-if="$slots.controlHeader" #header>
				<slot name="controlHeader"></slot>
			</template>
		</MkPaginationControl>

		<div>
			<template v-if="paginator.fetching.value || (paginator.items.value.length === 0 && fetching)">
				<slot name="loading">
					<MkLoading v-if="showLoading" :page="pageEmpty"/>
					<div v-else :class="{ [$style.pageState]: pageEmpty }" aria-busy="true"></div>
				</slot>
			</template>

			<slot v-else-if="paginator.error.value" name="error" :retry="paginator.init">
				<MkError :page="pageEmpty" :text="paginator.errorMessage?.value ?? undefined" @retry="paginator.init()"/>
			</slot>

			<div v-else-if="paginator.items.value.length === 0" key="_empty_">
				<slot name="empty" :fetching="fetching"><MkResult type="empty" :page="pageEmpty"/></slot>
			</div>

			<div v-else key="_root_" class="_gaps">
				<p v-if="(upError || downError) && paginator.errorMessage?.value" class="_caption" role="alert">{{ paginator.errorMessage.value }}</p>
				<div v-if="!pagedMode && (direction === 'up' || direction === 'both') && upButtonVisible">
					<MkLoading v-if="upButtonLoading && showLoading"/>
					<MkButton v-else-if="upError" small @click="upButtonClick">{{ i18n.ts.retry }}</MkButton>
					<div v-else-if="active && pageActive && !fetching" v-appear="upButtonClick" :class="$style.sentinel" aria-hidden="true"></div>
				</div>
				<MkPaginationBar v-if="pagedMode" v-slot="{ items }" v-model:page="page" v-model:pageSize="pageSize" :items="getValue(paginator.items)" :hasMore="downButtonVisible && !paginator.noPaging" :loadMore="loadDown" :disabled="fetching || !active || !pageActive">
					<slot :items="items as UnwrapRef<T['items']>" :fetching="paginator.fetching.value || paginator.fetchingOlder.value"></slot>
				</MkPaginationBar>
				<template v-else>
					<slot :items="getValue(paginator.items)" :fetching="paginator.fetching.value || paginator.fetchingOlder.value"></slot>
					<div v-if="(direction === 'down' || direction === 'both') && downButtonVisible">
						<MkLoading v-if="downButtonLoading && showLoading"/>
						<MkButton v-else-if="downError" small @click="downButtonClick">{{ i18n.ts.retry }}</MkButton>
						<div v-else-if="active && pageActive && !fetching" v-appear="downButtonClick" :class="$style.sentinel" aria-hidden="true"></div>
					</div>
				</template>
			</div>
		</div>
	</div>
</component>
</template>

<script lang="ts">
export type MkPaginationOptions = {
	autoLoad?: boolean;
	showLoading?: boolean;
	/**
	 * ページネーションを進める方向
	 * - up: 上方向
	 * - down: 下方向 (default)
	 * - both: 双方向
	 *
	 * NOTE: この方向はページネーションの方向であって、アイテムの並び順ではない
	 */
	direction?: 'up' | 'down' | 'both';
	pullToRefresh?: boolean;
	withControl?: boolean;
	controlCard?: boolean;
	/** 页面主列表的空状态；分组内列表保持紧凑。 */
	pageEmpty?: boolean;
	paged?: boolean;
};
</script>

<script lang="ts" setup generic="T extends IPaginator">
import { isLink } from '@@/js/is-link.js';
import { onActivated, onDeactivated, onMounted, computed, inject, watch, unref, ref, useTemplateRef } from 'vue';
import type { UnwrapRef } from 'vue';
import type { IPaginator } from '@/utility/paginator.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import MkPullToRefresh from '@/components/MkPullToRefresh.vue';
import MkPaginationControl from '@/components/MkPaginationControl.vue';
import MkButton from '@/components/MkButton.vue';
import MkPaginationBar, { DEFAULT_PAGE_SIZE } from '@/components/MkPaginationBar.vue';
import { DI } from '@/di.js';
import * as os from '@/os.js';

const props = withDefaults(defineProps<MkPaginationOptions & {
	paginator: T;
}>(), {
	autoLoad: true,
	showLoading: true,
	direction: 'down',
	pullToRefresh: true,
	withControl: false,
	controlCard: false,
	pageEmpty: false,
	paged: undefined,
});

const adminTableMode = inject<boolean>('adminTableMode', false);
const pagedMode = computed(() => props.paged ?? adminTableMode);
const page = ref(1);
const pageSize = ref(DEFAULT_PAGE_SIZE);

const fetching = computed(() => props.paginator.fetching.value || props.paginator.fetchingOlder.value || props.paginator.fetchingNewer.value);
const content = useTemplateRef('content');
const loadingHeight = ref<number | null>(null);
const active = ref(true);
const pageActive = inject(DI.pageActive, ref(true));
onActivated(() => { active.value = true; });
onDeactivated(() => { active.value = false; });
const upError = computed(() => props.paginator.order.value === 'oldest' ? props.paginator.olderError.value : props.paginator.newerError.value);
const downError = computed(() => props.paginator.order.value === 'oldest' ? props.paginator.newerError.value : props.paginator.olderError.value);

// 换列表或重新加载时回到第一页。
watch([() => props.paginator, () => props.paginator.fetching.value], () => { page.value = 1; });

watch(() => props.paginator.fetching.value, value => {
	// 清空列表或更换标签时保留加载前的高度，避免卡片先缩到空状态再展开。
	loadingHeight.value = value ? content.value?.getBoundingClientRect().height ?? null : null;
}, { flush: 'sync' });

function onContextmenu(ev: PointerEvent) {
	if (ev.target && isLink(ev.target as HTMLElement)) return;
	if (window.getSelection()?.toString() !== '') return;

	// TODO: 並び順設定
	os.contextMenu([{
		icon: 'ti ti-refresh',
		text: i18n.ts.reload,
		action: () => {
			props.paginator.reload();
		},
	}], ev);
}

function getValue(v: IPaginator['items']) {
	return unref(v) as UnwrapRef<T['items']>;
}

onMounted(() => {
	const initialized = new WeakSet<IPaginator>();
	watch(() => props.paginator, (paginator, _, onCleanup) => {
		// 静态参数的标签保留已加载内容；动态参数可能在离开标签后变化。
		if (props.autoLoad && (!initialized.has(paginator) || paginator.computedParams != null)) {
			initialized.add(paginator);
			paginator.init();
		}
		if (paginator.computedParams) {
			onCleanup(watch(paginator.computedParams, () => {
				paginator.reload();
			}, { deep: true }));
		}
	}, { immediate: true });
});

const upButtonVisible = computed(() => {
	return props.paginator.order.value === 'oldest' ? props.paginator.canFetchOlder.value : props.paginator.canFetchNewer.value;
});
const upButtonLoading = computed(() => {
	return props.paginator.order.value === 'oldest' ? props.paginator.fetchingOlder.value : props.paginator.fetchingNewer.value;
});

function upButtonClick() {
	if (!active.value || !pageActive.value || !upButtonVisible.value || fetching.value) return;
	if (props.paginator.order.value === 'oldest') {
		props.paginator.fetchOlder();
	} else {
		props.paginator.fetchNewer();
	}
}

const downButtonVisible = computed(() => {
	return props.paginator.order.value === 'oldest' ? props.paginator.canFetchNewer.value : props.paginator.canFetchOlder.value;
});
const downButtonLoading = computed(() => {
	return props.paginator.order.value === 'oldest' ? props.paginator.fetchingNewer.value : props.paginator.fetchingOlder.value;
});

function downButtonClick() {
	if (!active.value || !pageActive.value || !downButtonVisible.value || fetching.value) return;
	if (props.paginator.order.value === 'oldest') {
		props.paginator.fetchNewer();
	} else {
		props.paginator.fetchOlder();
	}
}

// 分页模式由分页组件按需补载；失败或没有新条目时返回 false。
async function loadDown() {
	const paginator = props.paginator;
	const previousLength = paginator.items.value.length;
	await (paginator.order.value === 'oldest' ? paginator.fetchNewer() : paginator.fetchOlder());
	if (downError.value) os.toast(i18n.ts.somethingHappened, 'error');
	return paginator === props.paginator && !downError.value && paginator.items.value.length > previousLength;
}

defineSlots<{
	controlHeader?: () => void;
	loading?: () => void;
	error?: (props: { retry: () => Promise<void> }) => void;
	empty?: (props: { fetching: boolean }) => void;
	default?: (props: { items: UnwrapRef<T['items']>, fetching: boolean }) => void;
}>();
</script>

<style lang="scss" module>
@use "../styles/page-state.scss";

.pageState {
	@include page-state.surface;
}

.content {
	position: relative;
}

.sentinel {
	height: 1px;
}

</style>
