<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal ref="modal" v-slot="{ type, maxHeight }" :anchorElement="anchorElement" :returnFocusTo="anchorElement" :transparentBg="true" :hasInteractionWithOtherFocusTrappedEls="true" align="left" zPriority="middle" @click="close" @esc="close" @opened="focus" @closed="emit('closed')">
	<section class="_popup _shadow" :class="[$style.root, { [$style.drawer]: type === 'drawer' }]" :style="{ maxHeight: maxHeight ? `min(500px, 75dvh, ${maxHeight}px)` : undefined }" role="dialog" :aria-label="i18n.ts.selectChannel" :aria-describedby="descriptionId" @keydown="onKeydown">
		<header :class="$style.header">
			<span :class="$style.title"><i class="ti ti-device-tv" aria-hidden="true"></i>{{ i18n.ts.selectChannel }}</span>
			<button type="button" class="_button" :class="$style.close" :aria-label="i18n.ts.close" @click="close"><i class="ti ti-x" aria-hidden="true"></i></button>
		</header>
		<div :class="$style.searchArea">
			<div :class="$style.searchBox">
				<i class="ti ti-search" aria-hidden="true"></i>
				<input ref="input" v-model="query" :class="$style.input" :disabled="disabled" :placeholder="i18n.ts._channelPicker.searchPlaceholder" :aria-label="i18n.ts._channelPicker.searchPlaceholder" autocomplete="off" autocapitalize="off" spellcheck="false" @compositionstart="composing = true" @compositionend="composing = false">
			</div>
		</div>
		<div :class="$style.body">
			<div :class="$style.categories" role="group" :aria-label="i18n.ts.selectChannel">
				<button v-for="category in categories" :key="category" type="button" class="_button" :class="[$style.category, { [$style.active]: tab === category && !query.trim() }]" :aria-pressed="tab === category && !query.trim()" :disabled="disabled" @click="selectCategory(category)">{{ category === 'featured' ? i18n.ts.recommended : i18n.ts._channelPicker[category] }}</button>
			</div>
			<div ref="resultsEl" :class="$style.results" :aria-busy="loading">
				<button v-for="channel in results" :key="channel.id" type="button" class="_button" :class="[$style.option, { [$style.selected]: channel.id === selectedId }]" :aria-pressed="channel.id === selectedId" :disabled="disabled" @click="choose(channel)">
					<span :class="$style.thumbnail">
						<img v-if="channel.bannerUrl && !channel.isSensitive" :src="channel.bannerUrl" alt="" loading="lazy">
						<i v-else class="ti ti-device-tv" aria-hidden="true"></i>
					</span>
					<span :class="$style.optionText">
						<span :class="$style.name" :title="channel.name">{{ channel.name }}</span>
						<span :class="$style.metadata">{{ i18n.tsx._channel.usersCount({ n: channel.usersCount }) }} · {{ i18n.tsx._channel.notesCount({ n: channel.notesCount }) }}</span>
					</span>
					<i v-if="channel.id === selectedId" class="ti ti-check" aria-hidden="true"></i>
				</button>
				<MkLoading v-if="loading" :class="$style.loading"/>
				<p v-else-if="failed" :class="$style.message" role="status">{{ i18n.ts.error }} <button type="button" class="_textButton" :disabled="disabled" @click="load()">{{ i18n.ts.retry }}</button></p>
				<template v-else>
					<p v-if="results.length === 0 && !hasMore" :class="$style.message" role="status">{{ i18n.ts._channelPicker.empty }}</p>
					<button v-if="hasMore" type="button" class="_button" :class="$style.loadMore" :disabled="disabled" @click="load()">{{ i18n.ts.loadMore }}</button>
				</template>
			</div>
		</div>
		<footer :class="$style.footer">
			<p :id="descriptionId" :class="$style.description">{{ i18n.ts._channelPicker.description }}</p>
			<button type="button" class="_button" :class="$style.clear" :disabled="disabled" @click="choose(null)">{{ i18n.ts._channelPicker.noChannel }}</button>
		</footer>
	</section>
</MkModal>
</template>

<script lang="ts" setup>
import { onBeforeUnmount, ref, useId, useTemplateRef, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import MkModal from '@/components/MkModal.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';

const props = defineProps<{
	anchorElement?: HTMLElement;
	selectedId?: string;
	disabled?: boolean;
}>();
const emit = defineEmits<{
	(ev: 'choose', channel: Misskey.entities.Channel | null): void;
	(ev: 'closed'): void;
}>();

const categories = ['featured', 'mine', 'other'] as const;
type Category = typeof categories[number];
type MineSource = 'channels/owned' | 'channels/followed';
type PageState = { cursor?: string; hasMore: boolean };
const PAGE_SIZE = 20;
const modal = useTemplateRef('modal');
const input = useTemplateRef('input');
const resultsEl = useTemplateRef('resultsEl');
const descriptionId = useId();
const query = ref('');
const tab = ref<Category>('featured');
const composing = ref(false);
const results = ref<Misskey.entities.Channel[]>([]);
const loading = ref(false);
const failed = ref(false);
const hasMore = ref(false);
let cursor: string | undefined;
let minePages: Record<MineSource, PageState> = {
	'channels/owned': { hasMore: true },
	'channels/followed': { hasMore: true },
};
let timer: number | undefined;
let generation = 0;
let closed = false;

function focus(): void { if (!closed) input.value?.focus(); }

function close(): void {
	if (closed) return;
	closed = true;
	generation++;
	window.clearTimeout(timer);
	modal.value?.close();
}

function selectCategory(category: Category): void {
	if (props.disabled || closed) return;
	tab.value = category;
	query.value = '';
}

function choose(channel: Misskey.entities.Channel | null): void {
	if (props.disabled || closed || composing.value || channel?.isArchived) return;
	emit('choose', channel);
	close();
}

function onKeydown(event: KeyboardEvent): void {
	if (event.isComposing || composing.value || event.keyCode === 229) return;
	if (event.key === 'Enter' && event.target === input.value) {
		event.preventDefault();
		event.stopPropagation();
		return;
	}
	if (event.key === 'Escape') {
		event.preventDefault();
		event.stopPropagation();
		close();
	}
}

async function load(): Promise<void> {
	window.clearTimeout(timer);
	if (closed || props.disabled || composing.value) return;
	const request = ++generation;
	const search = query.value.trim();
	const featured = !search && tab.value === 'featured';
	const mine = !search && tab.value === 'mine';
	const other = !search && tab.value === 'other';
	loading.value = true;
	failed.value = false;
	try {
		let channels: Misskey.entities.Channel[];
		if (mine) {
			const sources = ['channels/owned', 'channels/followed'] as const;
			const pages = await Promise.all(sources.map(async source => {
				const page = minePages[source];
				return page.hasMore ? await misskeyApi(source, { limit: PAGE_SIZE, ...(page.cursor ? { untilId: page.cursor } : {}) }) : [];
			}));
			if (closed || request !== generation) return;
			// Commit both cursors only after both sources succeed, so retries cannot skip a partial batch.
			for (const [index, source] of sources.entries()) {
				const nextCursor = pages[index].at(-1)?.id;
				minePages[source] = { cursor: nextCursor, hasMore: pages[index].length === PAGE_SIZE && nextCursor !== minePages[source].cursor };
			}
			hasMore.value = sources.some(source => minePages[source].hasMore);
			channels = pages.flat();
		} else {
			channels = featured
				? await misskeyApi('channels/featured', {})
				: await misskeyApi('channels/search', { query: search, type: 'nameOnly', limit: PAGE_SIZE, ...(cursor ? { untilId: cursor } : {}) });
			if (closed || request !== generation) return;
			const nextCursor = channels.at(-1)?.id;
			hasMore.value = !featured && channels.length === PAGE_SIZE && nextCursor !== cursor;
			cursor = nextCursor;
		}
		// Keep raw cursors before filtering archived or personal channels, including entirely filtered pages.
		const seen = new Set(results.value.map(channel => channel.id));
		results.value.push(...channels.filter(channel => {
			if (channel.isArchived || seen.has(channel.id) || (other && (channel.isFollowing || ($i && channel.userId === $i.id)))) return false;
			seen.add(channel.id);
			return true;
		}));
	} catch {
		if (!closed && request === generation) failed.value = true;
	} finally {
		if (!closed && request === generation) loading.value = false;
	}
}

watch([query, tab, composing], () => {
	generation++;
	window.clearTimeout(timer);
	results.value = [];
	cursor = undefined;
	minePages = { 'channels/owned': { hasMore: true }, 'channels/followed': { hasMore: true } };
	hasMore.value = false;
	failed.value = false;
	loading.value = false;
	if (resultsEl.value) resultsEl.value.scrollTop = 0;
	if (closed || props.disabled || composing.value) return;
	if (!query.value.trim()) { void load(); return; }
	loading.value = true;
	timer = window.setTimeout(() => { void load(); }, 250);
}, { immediate: true });

watch(() => props.disabled, disabled => { if (disabled) close(); });
onBeforeUnmount(() => { closed = true; generation++; window.clearTimeout(timer); });
</script>

<style lang="scss" module>
.root {
	--MI-channelPicker-muted: var(--MI_THEME-fgTransparentWeak);
	--MI-channelPicker-hover: color-mix(in srgb, var(--MI_THEME-fg) 8%, var(--MI_THEME-popup));
	--MI-channelPicker-selected: color-mix(in srgb, var(--MI_THEME-accent) 12%, var(--MI_THEME-popup));

	display: flex;
	flex-direction: column;
	box-sizing: border-box;
	width: min(328px, calc(100vw - 32px));
	height: 380px;
	max-height: min(500px, 75dvh);
	border: 1px solid var(--MI_THEME-divider);
	background: var(--MI_THEME-popup);
	color: var(--MI_THEME-fg);
	overflow: hidden;
}
.drawer { width: 100%; border-radius: var(--MI-radius) var(--MI-radius) 0 0; }
.header { display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; padding: 4px 10px 0 12px; }
.title { display: flex; align-items: center; gap: 6px; font-size: .85em; font-weight: 700; }
.close { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 8px; color: var(--MI-channelPicker-muted); }
.searchArea { flex-shrink: 0; padding: 6px 12px 10px; }
.searchBox { display: flex; align-items: center; gap: 6px; padding: 0 8px; border: 1px solid var(--MI_THEME-divider); border-radius: 6px; background: color-mix(in srgb, var(--MI_THEME-fg) 4%, var(--MI_THEME-popup)); color: var(--MI-channelPicker-muted); }
.searchBox:focus-within { border-color: var(--MI_THEME-accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--MI_THEME-accent) 12%, transparent); }
.input { min-width: 0; flex: 1; height: 34px; padding: 0; border: 0; outline: 0; background: transparent; color: var(--MI_THEME-fg); font: inherit; font-size: .9em; }
.input::placeholder { color: var(--MI-channelPicker-muted); }
.body { display: flex; flex: 1; min-height: 0; overflow: hidden; border-top: 1px solid var(--MI_THEME-divider); }
.categories { display: flex; flex-direction: column; flex-shrink: 0; box-sizing: border-box; width: 80px; padding: 4px; gap: 2px; background: color-mix(in srgb, var(--MI_THEME-fg) 3%, var(--MI_THEME-popup)); overflow-y: auto; }
.category { display: grid; place-items: center; flex-shrink: 0; min-height: 40px; padding: 6px; border-radius: 6px; text-align: center; font-size: .8em; line-height: 1.4; overflow-wrap: anywhere; }
.active { color: var(--MI_THEME-accent); background: var(--MI-channelPicker-selected); font-weight: 700; }
.results { flex: 1; min-width: 0; overflow-y: auto; overscroll-behavior: contain; padding: 4px; }
.option { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 52px; padding: 8px 6px; border-radius: 6px; text-align: start; }
.close:enabled:hover, .category:enabled:hover, .option:enabled:hover, .clear:enabled:hover, .loadMore:enabled:hover { background: var(--MI-channelPicker-hover); }
.close:focus-visible, .category:focus-visible, .option:focus-visible, .clear:focus-visible, .loadMore:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -2px; }
.selected { color: var(--MI_THEME-accent); background: var(--MI-channelPicker-selected); }
.category.active:enabled:hover, .option.selected:enabled:hover { background: color-mix(in srgb, var(--MI_THEME-accent) 18%, var(--MI_THEME-popup)); }
.thumbnail { display: grid; place-items: center; flex-shrink: 0; width: 32px; height: 32px; overflow: hidden; border-radius: 6px; background: var(--MI-channelPicker-selected); color: var(--MI_THEME-accent); font-size: 1em; }
.thumbnail img { width: 100%; height: 100%; object-fit: cover; }
.optionText { min-width: 0; flex: 1; }
.name { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .9em; }
.metadata { display: block; margin-top: 3px; color: var(--MI-channelPicker-muted); font-size: .7em; line-height: 1.4; overflow-wrap: anywhere; }
.loading { padding: 24px; }
.message { margin: 12px 8px; color: var(--MI-channelPicker-muted); font-size: .85em; line-height: 1.5; }
.loadMore { display: block; width: 100%; min-height: 40px; border-radius: 8px; color: var(--MI_THEME-accent); font-size: .85em; }
.footer { display: flex; align-items: center; gap: 8px; flex-shrink: 0; padding: 10px 12px; border-top: 1px solid var(--MI_THEME-divider); }
.description { flex: 1; min-width: 0; margin: 0; color: var(--MI-channelPicker-muted); font-size: .7em; line-height: 1.5; overflow-wrap: anywhere; }
.clear { flex-shrink: 0; max-width: 45%; min-height: 34px; padding: 6px 8px; border: 1px solid var(--MI_THEME-divider); border-radius: 6px; color: var(--MI_THEME-accent); font-size: .8em; overflow-wrap: anywhere; }
@media (max-width: 480px) {
	.categories { width: 68px; }
}
</style>
