<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<EmLoading v-if="fetching"/>

<EmError v-else-if="error" @retry="init()"/>

<div v-else-if="empty" key="_empty_" class="empty">
	<slot name="empty">
		<div class="_fullinfo">
			<div>{{ i18n.ts.nothing }}</div>
		</div>
	</slot>
</div>

<div v-else ref="rootEl">
	<div v-if="pagination.reversed && more" class="_margin">
		<EmLoading v-if="moreFetching"/>
		<EmError v-else-if="moreError" @retry="fetchMore"/>
		<div v-else ref="moreEl" :class="$style.sentinel" aria-hidden="true"></div>
	</div>
	<slot :items="Array.from(items.values())" :fetching="fetching || moreFetching"></slot>
	<div v-if="!pagination.reversed && more" class="_margin">
		<EmLoading v-if="moreFetching"/>
		<EmError v-else-if="moreError" @retry="fetchMore"/>
		<div v-else ref="moreEl" :class="$style.sentinel" aria-hidden="true"></div>
	</div>
</div>
</template>

<script lang="ts">
import { computed, nextTick, onActivated, onBeforeMount, onBeforeUnmount, onDeactivated, ref, shallowRef, unref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { useDocumentVisibility } from '@@/js/use-document-visibility.js';
import { onScrollTop, getScrollContainer, onScrollBottom, scrollToBottom, isTailVisible, isHeadVisible } from '@@/js/scroll.js';
import type { ComputedRef } from 'vue';
import { misskeyApi } from '../misskey-api.js';
import { i18n } from '../i18n.js';

const SECOND_FETCH_LIMIT = 30;
const TOLERANCE = 16;

export type Paging<E extends keyof Misskey.Endpoints = keyof Misskey.Endpoints> = {
	endpoint: E;
	limit: number;
	params?: Misskey.Endpoints[E]['req'] | ComputedRef<Misskey.Endpoints[E]['req']>;

	/**
	 * 検索APIのような、ページング不可なエンドポイントを利用する場合
	 * (そのようなAPIをこの関数で使うのは若干矛盾してるけど)
	 */
	noPaging?: boolean;

	/**
	 * items 配列の中身を逆順にする(新しい方が最後)
	 */
	reversed?: boolean;

	offsetMode?: boolean;
};

type MisskeyEntity = {
	id: string;
	createdAt: string;
	_shouldInsertAd_?: boolean;
	[x: string]: any;
};

type MisskeyEntityMap = Map<string, MisskeyEntity>;

function arrayToEntries(entities: MisskeyEntity[]): [string, MisskeyEntity][] {
	return entities.map(en => [en.id, en]);
}

function concatMapWithArray(map: MisskeyEntityMap, entities: MisskeyEntity[]): MisskeyEntityMap {
	return new Map([...map, ...arrayToEntries(entities)]);
}

</script>
<script lang="ts" setup>
import EmError from './EmError.vue';
import EmLoading from './EmLoading.vue';

const props = withDefaults(defineProps<{
	pagination: Paging;
	displayLimit?: number;
}>(), {
	displayLimit: 20,
});

const emit = defineEmits<{
	(ev: 'queue', count: number): void;
	(ev: 'status', error: boolean): void;
}>();

const rootEl = shallowRef<HTMLElement>();
const moreEl = shallowRef<HTMLElement>();
const active = ref(true);
let requestId = 0;
let disposed = false;

// 遡り中かどうか
const backed = ref(false);

const scrollRemove = ref<(() => void) | null>(null);

/**
 * 表示するアイテムのソース
 * 最新が0番目
 */
const items = ref<MisskeyEntityMap>(new Map());

/**
 * タブが非アクティブなどの場合に更新を貯めておく
 * 最新が0番目
 */
const queue = ref<MisskeyEntityMap>(new Map());

const offset = ref(0);

/**
 * 初期化中かどうか（trueならEmLoadingで全て隠す）
 */
const fetching = ref(true);

const moreFetching = ref(false);
const more = ref(false);
const moreError = ref(false);
const isBackTop = ref(false);
const empty = computed(() => items.value.size === 0);
const error = ref(false);

const scrollableElement = computed(() => rootEl.value ? getScrollContainer(rootEl.value) : window.document.body);

const visibility = useDocumentVisibility();

watch([moreEl, active, visibility], ([element, isActive, visible], _, onCleanup) => {
	if (!element || !isActive || visible !== 'visible') return;
	let observing = true;
	const observer = new IntersectionObserver(entries => {
		if (observing && entries.at(-1)?.isIntersecting) void fetchMore();
	});
	observer.observe(element);
	onCleanup(() => {
		observing = false;
		observer.disconnect();
	});
});

let isPausingUpdate = false;
let timerForSetPause: number | null = null;
const BACKGROUND_PAUSE_WAIT_SEC = 10;

// 先頭が表示されているかどうかを検出
// https://qiita.com/mkataigi/items/0154aefd2223ce23398e
const scrollObserver = ref<IntersectionObserver>();

watch([() => props.pagination.reversed, scrollableElement], () => {
	if (scrollObserver.value) scrollObserver.value.disconnect();

	scrollObserver.value = new IntersectionObserver(entries => {
		backed.value = entries[0].isIntersecting;
	}, {
		root: scrollableElement.value,
		rootMargin: props.pagination.reversed ? '-100% 0px 100% 0px' : '100% 0px -100% 0px',
		threshold: 0.01,
	});
}, { immediate: true });

watch(rootEl, () => {
	scrollObserver.value?.disconnect();
	nextTick(() => {
		if (rootEl.value) scrollObserver.value?.observe(rootEl.value);
	});
});

watch([backed, rootEl], () => {
	if (!backed.value) {
		if (!rootEl.value) return;

		scrollRemove.value = (props.pagination.reversed ? onScrollBottom : onScrollTop)(rootEl.value, executeQueue, TOLERANCE);
	} else {
		if (scrollRemove.value) scrollRemove.value();
		scrollRemove.value = null;
	}
});

// パラメータに何らかの変更があった際、再読込したい（チャンネル等のIDが変わったなど）
watch(() => [props.pagination.endpoint, props.pagination.params], init, { deep: true });

watch(queue, (a, b) => {
	if (a.size === 0 && b.size === 0) return;
	emit('queue', queue.value.size);
}, { deep: true });

watch(error, (n, o) => {
	if (n === o) return;
	emit('status', n);
});

function getParams() {
	const params = unref(props.pagination.params);
	return params && typeof params === 'object' ? params : {};
}

async function init(): Promise<void> {
	const request = ++requestId;
	items.value = new Map();
	queue.value = new Map();
	fetching.value = true;
	more.value = false;
	moreError.value = false;
	moreFetching.value = false;
	const params = getParams();
	await misskeyApi<MisskeyEntity[]>(props.pagination.endpoint, {
		...params,
		limit: props.pagination.limit ?? 10,
		allowPartial: true,
	}).then(async res => {
		if (disposed || request !== requestId) return;
		for (let i = 0; i < res.length; i++) {
			const item = res[i];
			if (i === 3) item._shouldInsertAd_ = true;
		}

		if (res.length === 0 || props.pagination.noPaging) {
			concatItems(res);
			more.value = false;
		} else {
			if (props.pagination.reversed) moreFetching.value = true;
			concatItems(res);
			more.value = true;
		}

		offset.value = items.value.size;
		error.value = false;
		fetching.value = false;
		if (props.pagination.reversed && items.value.size > 0) {
			await nextTick();
			if (disposed || request !== requestId) return;
			toBottom();
			await nextTick();
			if (request === requestId) moreFetching.value = false;
		}
	}, () => {
		if (disposed || request !== requestId) return;
		error.value = true;
		fetching.value = false;
	});
}

const reload = (): Promise<void> => {
	return init();
};

const fetchMore = async (): Promise<void> => {
	if (disposed || !active.value || !more.value || fetching.value || moreFetching.value || items.value.size === 0) return;
	const request = requestId;
	const cursor = Array.from(items.value.keys()).at(-1);
	moreFetching.value = true;
	moreError.value = false;
	const params = getParams();
	try {
		const res = await misskeyApi<MisskeyEntity[]>(props.pagination.endpoint, {
			...params,
			limit: SECOND_FETCH_LIMIT,
			...(props.pagination.offsetMode ? { offset: offset.value } : props.pagination.reversed ? { sinceId: cursor } : { untilId: cursor }),
		});
		if (disposed || request !== requestId) return;
		for (let i = 0; i < res.length; i++) {
			const item = res[i];
			if (i === 10) item._shouldInsertAd_ = true;
		}

		items.value = concatMapWithArray(items.value, res);
		// 游标没有前进时停止，避免重复结果触发无限请求。
		more.value = res.length > 0 && (props.pagination.offsetMode || Array.from(items.value.keys()).at(-1) !== cursor);
		offset.value += res.length;
	} catch {
		if (!disposed && request === requestId) moreError.value = true;
	} finally {
		if (request === requestId) moreFetching.value = false;
	}
};

const isTop = (): boolean => isBackTop.value || (rootEl.value != null && (props.pagination.reversed ? isTailVisible : isHeadVisible)(rootEl.value, TOLERANCE));

watch(visibility, () => {
	if (visibility.value === 'hidden') {
		timerForSetPause = window.setTimeout(() => {
			isPausingUpdate = true;
			timerForSetPause = null;
		},
		BACKGROUND_PAUSE_WAIT_SEC * 1000);
	} else { // 'visible'
		if (timerForSetPause) {
			window.clearTimeout(timerForSetPause);
			timerForSetPause = null;
		} else {
			isPausingUpdate = false;
			if (isTop()) {
				executeQueue();
			}
		}
	}
});

/**
 * 最新のものとして1つだけアイテムを追加する
 * ストリーミングから降ってきたアイテムはこれで追加する
 * @param item アイテム
 */
const prepend = (item: MisskeyEntity): void => {
	if (items.value.size === 0) {
		items.value.set(item.id, item);
		fetching.value = false;
		return;
	}

	if (isTop() && !isPausingUpdate) unshiftItems([item]);
	else prependQueue(item);
};

/**
 * 新着アイテムをitemsの先頭に追加し、displayLimitを適用する
 * @param newItems 新しいアイテムの配列
 */
function unshiftItems(newItems: MisskeyEntity[]) {
	const length = newItems.length + items.value.size;
	items.value = new Map([...arrayToEntries(newItems), ...items.value].slice(0, props.displayLimit));

	if (length >= props.displayLimit) more.value = true;
}

/**
 * 古いアイテムをitemsの末尾に追加し、displayLimitを適用する
 * @param oldItems 古いアイテムの配列
 */
function concatItems(oldItems: MisskeyEntity[]) {
	const length = oldItems.length + items.value.size;
	items.value = new Map([...items.value, ...arrayToEntries(oldItems)].slice(0, props.displayLimit));

	if (length >= props.displayLimit) more.value = true;
}

function executeQueue() {
	unshiftItems(Array.from(queue.value.values()));
	queue.value = new Map();
}

function prependQueue(newItem: MisskeyEntity) {
	queue.value = new Map([[newItem.id, newItem], ...queue.value].slice(0, props.displayLimit) as [string, MisskeyEntity][]);
}

/*
 * アイテムを末尾に追加する（使うの？）
 */
const appendItem = (item: MisskeyEntity): void => {
	items.value.set(item.id, item);
};

const removeItem = (id: string) => {
	items.value.delete(id);
	queue.value.delete(id);
};

const updateItem = (id: MisskeyEntity['id'], replacer: (old: MisskeyEntity) => MisskeyEntity): void => {
	const item = items.value.get(id);
	if (item) items.value.set(id, replacer(item));

	const queueItem = queue.value.get(id);
	if (queueItem) queue.value.set(id, replacer(queueItem));
};

onActivated(() => {
	active.value = true;
	isBackTop.value = false;
});

onDeactivated(() => {
	active.value = false;
	isBackTop.value = props.pagination.reversed ? window.scrollY >= (rootEl.value ? rootEl.value.scrollHeight - window.innerHeight : 0) : window.scrollY === 0;
});

function toBottom() {
	scrollToBottom(rootEl.value!);
}

onBeforeMount(() => {
	void init();
});

onBeforeUnmount(() => {
	disposed = true;
	requestId++;
	if (timerForSetPause) {
		window.clearTimeout(timerForSetPause);
		timerForSetPause = null;
	}
	scrollRemove.value?.();
	scrollObserver.value?.disconnect();
});

defineExpose({
	items,
	queue,
	backed: backed.value,
	more,
	reload,
	prepend,
	append: appendItem,
	removeItem,
	updateItem,
});
</script>

<style lang="scss" module>
.transition_fade_enterActive,
.transition_fade_leaveActive {
	transition: opacity 0.125s ease;
}
.transition_fade_enterFrom,
.transition_fade_leaveTo {
	opacity: 0;
}

.sentinel {
	height: 1px;
}
</style>
