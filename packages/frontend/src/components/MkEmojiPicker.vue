<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="omfetrab" :class="['s' + size, 'w' + width, 'h' + height, { asDrawer, asWindow }]" :style="{ maxHeight: maxHeight ? maxHeight + 'px' : undefined }">
	<input
		ref="searchEl"
		:value="q"
		class="search"
		data-prevent-emoji-insert
		:class="{ filled: q != null && q != '' }"
		:placeholder="i18n.ts.search"
		:aria-label="i18n.ts.search"
		type="search"
		autocapitalize="off"
		@input="input()"
		@paste.stop="paste"
		@keydown="onKeydown"
	>
	<div class="main">
		<div ref="emojisEl" class="emojis" tabindex="-1" :data-emoji-group="searchedQuery ? 'search' : activeGroup" @scroll.passive="onEmojiScroll" @pointermove.passive="rememberTooltipPointer" @pointerleave="clearTooltipPointer" @pointerdown="clearTooltipPointer">
			<section v-if="searchedQuery" class="result">
				<div v-if="searchResultCustom.length > 0" class="body">
					<button
						v-for="emoji in searchResultCustom"
						:key="emoji.name"
						v-tooltip.emoji="getKey(emoji)"
						class="_button item"
						:disabled="!canReact(emoji)"
						tabindex="0"
						@click="chosen(emoji, $event)"
					>
						<MkCustomEmoji class="emoji" :name="emoji.name" :fallbackToImage="true"/>
					</button>
				</div>
				<div v-if="searchResultUnicode.length > 0" class="body">
					<button
						v-for="emoji in searchResultUnicode"
						:key="emoji.name"
						v-tooltip.emoji="getKey(emoji)"
						class="_button item"
						tabindex="0"
						@click="chosen(emoji, $event)"
					>
						<MkEmoji class="emoji" :emoji="emoji.char"/>
					</button>
				</div>
				<div v-if="searchResultCustom.length === 0 && searchResultUnicode.length === 0" class="empty">{{ i18n.ts.notFound }}</div>
			</section>

			<div v-else class="categoryList">
				<section v-if="(showPinned && pinned?.length) || recentlyUsedEmojisDef.length > 0" data-emoji-category-group="recent">
					<section v-if="showPinned && (pinned && pinned.length > 0)">
						<div class="body">
							<button
								v-for="emoji in pinnedEmojisDef"
								:key="getKey(emoji)"
								v-tooltip.emoji="getKey(emoji)"
								:data-emoji="getKey(emoji)"
								class="_button item"
								:disabled="!canReact(emoji)"
								tabindex="0"
								@click="chosen(emoji, $event)"
							>
								<MkCustomEmoji v-if="!emoji.hasOwnProperty('char')" class="emoji" :name="getKey(emoji)" :normal="true"/>
								<MkEmoji v-else class="emoji" :emoji="getKey(emoji)" :normal="true"/>
							</button>
						</div>
					</section>

					<section v-if="recentlyUsedEmojisDef.length > 0">
						<header class="title"><i class="ti ti-clock ti-fw" aria-hidden="true"></i> {{ i18n.ts.recentUsed }}</header>
						<div v-if="recentlyUsedEmojisDef.length > 0" class="body">
							<button
								v-for="emoji in recentlyUsedEmojisDef"
								:key="getKey(emoji)"
								v-tooltip.emoji="getKey(emoji)"
								class="_button item"
								:disabled="!canReact(emoji)"
								:data-emoji="getKey(emoji)"
								@click="chosen(emoji, $event)"
							>
								<MkCustomEmoji v-if="!emoji.hasOwnProperty('char')" class="emoji" :name="getKey(emoji)" :normal="true"/>
								<MkEmoji v-else class="emoji" :emoji="getKey(emoji)" :normal="true"/>
							</button>
						</div>
					</section>
				</section>

				<section v-for="group in customGroupSections" :key="`custom:${group.folder.value}`" :data-emoji-category-group="`custom:${group.folder.value}`">
					<XSection
						continuous
						:initialShown="true"
						:emojis="group.emojis"
						:disabledEmojis="group.disabledEmojis"
						:hasChildSection="group.folder.children.length !== 0"
						:customEmojiTree="group.folder.children"
						:canReact="canReact"
						@chosen="chosen"
					>
						<i class="ti ti-folder ti-fw" aria-hidden="true"></i> {{ group.folder.value || i18n.ts.other }}
					</XSection>
				</section>

				<XSection
					v-for="category in categories"
					:key="`unicode:${category}`"
					:data-emoji-category-group="`unicode:${category}`"
					continuous
					:initialShown="true"
					:emojis="emojiCharByCategory.get(category) ?? []"
					@chosen="chosen"
				>
					<i :class="unicodeCategoryIcons[category]" aria-hidden="true"></i> {{ i18n.ts._emojiCategories[category] }}
				</XSection>
			</div>
		</div>
	</div>
	<nav class="toolbar" :aria-label="i18n.ts.category">
		<button v-tooltip="i18n.ts.recentUsed" type="button" class="_button toolbarButton" :class="{ active: activeGroup === 'recent' }" :aria-label="i18n.ts.recentUsed" :aria-pressed="activeGroup === 'recent'" @click="selectGroup('recent')"><i class="ti ti-clock" aria-hidden="true"></i></button>
		<button v-tooltip="i18n.ts.emoji" type="button" class="_button toolbarButton" :class="{ active: activeGroup.startsWith('unicode:') }" :aria-label="i18n.ts.emoji" :aria-pressed="activeGroup.startsWith('unicode:')" @click="selectGroup('unicode:face')"><i class="ti ti-mood-smile" aria-hidden="true"></i></button>
		<button v-if="customGroups.length > 0" v-tooltip="i18n.ts.customEmojis" type="button" class="_button toolbarButton" :class="{ active: activeGroup.startsWith('custom:') }" :aria-label="i18n.ts.customEmojis" :aria-pressed="activeGroup.startsWith('custom:')" @click="selectGroup(`custom:${customGroups[0].value}`)"><i class="ti ti-photo" aria-hidden="true"></i></button>
		<button v-tooltip="i18n.ts.settings" type="button" class="_button toolbarButton settingsButton" :aria-label="i18n.ts.settings" @click="settings"><i class="ti ti-settings" aria-hidden="true"></i></button>
	</nav>
</div>
</template>

<script lang="ts" setup>
import { ref, useTemplateRef, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import * as Misskey from 'misskey-js';
import {
	emojilist,
	emojiCharByCategory,
	unicodeEmojiCategories as categories,
	getUnicodeEmoji,
} from '@@/js/emojilist.js';
import type {
	UnicodeEmojiDef,
	CustomEmojiFolderTree,
} from '@@/js/emojilist.js';
import XSection from '@/components/MkEmojiPicker.section.vue';
import MkRippleEffect from '@/components/MkRippleEffect.vue';
import * as os from '@/os.js';
import { isTouchUsing } from '@/utility/touch.js';
import { deviceKind } from '@/utility/device-kind.js';
import { i18n } from '@/i18n.js';
import { store } from '@/store.js';
import { customEmojiCategories, customEmojis, customEmojisMap } from '@/custom-emojis.js';
import { $i } from '@/i.js';
import { checkReactionPermissions } from '@/utility/check-reaction-permissions.js';
import { prefer } from '@/preferences.js';
import { useRouter } from '@/router.js';
import { haptic } from '@/utility/haptic.js';
import { refreshTooltipAtPointer } from '@/directives/tooltip.js';

const router = useRouter();

const props = withDefaults(defineProps<{
	showPinned?: boolean;
	pinnedEmojis?: string[];
	maxHeight?: number;
	asDrawer?: boolean;
	asWindow?: boolean;
	asReactionPicker?: boolean; // 今は使われてないが将来的に使いそう
	targetNote?: Misskey.entities.Note | null;
}>(), {
	showPinned: true,
});

const emit = defineEmits<{
	(ev: 'chosen', v: string): void;
	(ev: 'esc'): void;
}>();

const searchEl = useTemplateRef('searchEl');
const emojisEl = useTemplateRef('emojisEl');

const {
	emojiPickerScale,
	emojiPickerWidth,
	emojiPickerHeight,
} = prefer.r;

const recentlyUsedEmojis = store.r.recentlyUsedEmojis;

const recentlyUsedEmojisDef = computed(() => {
	return recentlyUsedEmojis.value.slice(0, (4 + emojiPickerWidth.value) * 2).map(getDef);
});
const pinnedEmojisDef = computed(() => {
	return pinned.value?.map(getDef);
});

const pinned = computed(() => props.pinnedEmojis);
const size = computed(() => emojiPickerScale.value);
const width = computed(() => emojiPickerWidth.value);
const height = computed(() => emojiPickerHeight.value);
const q = ref<string>('');
const searchedQuery = ref('');
let searchTimer: number | undefined;
const searchResultCustom = ref<Misskey.entities.EmojiSimple[]>([]);
const searchResultUnicode = ref<UnicodeEmojiDef[]>([]);
type EmojiGroup = 'recent' | `custom:${string}` | `unicode:${typeof categories[number]}`;
const activeGroup = ref<EmojiGroup>('recent');

const unicodeCategoryIcons: Record<typeof categories[number], string> = {
	face: 'ti ti-mood-smile ti-fw',
	people: 'ti ti-user ti-fw',
	animals_and_nature: 'ti ti-paw ti-fw',
	food_and_drink: 'ti ti-tools-kitchen-2 ti-fw',
	activity: 'ti ti-ball-football ti-fw',
	travel_and_places: 'ti ti-plane ti-fw',
	objects: 'ti ti-bulb ti-fw',
	symbols: 'ti ti-heart ti-fw',
	flags: 'ti ti-flag ti-fw',
};

const customEmojiFolderRoot: CustomEmojiFolderTree = { value: '', category: '', children: [] };

function parseAndMergeCategories(input: string, root: CustomEmojiFolderTree): CustomEmojiFolderTree {
	const parts = input.split('/').map(p => p.trim());
	let currentNode: CustomEmojiFolderTree = root;

	for (const [index, part] of parts.entries()) {
		let existingNode = currentNode.children.find((node) => node.value === part);

		if (!existingNode) {
			const newNode: CustomEmojiFolderTree = { value: part, category: index === parts.length - 1 ? input : parts.slice(0, index + 1).join('/'), children: [] };
			currentNode.children.push(newNode);
			existingNode = newNode;
		}

		currentNode = existingNode;
	}

	return currentNode;
}

customEmojiCategories.value.forEach(ec => {
	if (ec !== null) {
		parseAndMergeCategories(ec, customEmojiFolderRoot);
	}
});

parseAndMergeCategories('', customEmojiFolderRoot);

// 只列出有表情的顶层文件夹，避免左侧出现点开为空的分组。
const customGroups = customEmojiFolderRoot.children.filter(node => node.children.length > 0 || customEmojis.value.some(e => filterCategory(e, node.value)));
const customGroupSections = computed(() => customGroups.map(folder => {
	const emojis = customEmojis.value.filter(emoji => filterCategory(emoji, folder.value));
	return { folder, emojis: emojis.map(emoji => `:${emoji.name}:`), disabledEmojis: emojis.filter(emoji => !canReact(emoji)).map(emoji => `:${emoji.name}:`) };
}));

async function selectGroup(group: EmojiGroup) {
	activeGroup.value = group;
	if (q.value !== '') {
		q.value = '';
		if (searchEl.value) searchEl.value.value = '';
	}
	await nextTick();
	const scroller = emojisEl.value;
	const target = Array.from(scroller?.querySelectorAll<HTMLElement>('[data-emoji-category-group]') ?? []).find(section => section.dataset.emojiCategoryGroup === group);
	if (!scroller || !target) return;
	scroller.scrollTo({ top: scroller.scrollTop + target.getBoundingClientRect().top - scroller.getBoundingClientRect().top, behavior: 'instant' });
	onEmojiScroll();
}

let scrollFrame: number | null = null;
let tooltipFrame: number | null = null;
let tooltipPointer: { x: number; y: number } | null = null;
let disposed = false;

function rememberTooltipPointer(event: PointerEvent) {
	if (event.pointerType === 'touch') return;
	tooltipPointer = { x: event.clientX, y: event.clientY };
}

function clearTooltipPointer() {
	tooltipPointer = null;
	if (tooltipFrame != null) cancelAnimationFrame(tooltipFrame);
	tooltipFrame = null;
}

function refreshScrolledTooltip() {
	if (disposed || tooltipPointer == null || tooltipFrame != null) return;
	// 分段虚拟列表在第一帧更新可见行，下一帧再识别鼠标下的新按钮。
	tooltipFrame = requestAnimationFrame(() => {
		tooltipFrame = requestAnimationFrame(() => {
			tooltipFrame = null;
			void nextTick(() => {
				if (disposed || tooltipPointer == null || emojisEl.value == null) return;
				refreshTooltipAtPointer(emojisEl.value, tooltipPointer.x, tooltipPointer.y);
			});
		});
	});
}

function onEmojiScroll() {
	refreshScrolledTooltip();
	if (disposed || scrollFrame != null || q.value) return;
	scrollFrame = requestAnimationFrame(() => {
		scrollFrame = null;
		const scroller = emojisEl.value;
		if (!scroller || q.value) return;
		const scrollTop = scroller.getBoundingClientRect().top;
		for (const title of scroller.querySelectorAll<HTMLElement>('header.title')) {
			const rect = title.getBoundingClientRect();
			title.classList.toggle('stuck', Math.abs(rect.top - scrollTop) < 1);
		}
		const top = scrollTop + 33;
		const sections = Array.from(scroller.querySelectorAll<HTMLElement>('[data-emoji-category-group]'));
		const current = sections.findLast(section => section.getBoundingClientRect().top <= top) ?? sections[0];
		if (current?.dataset.emojiCategoryGroup) activeGroup.value = current.dataset.emojiCategoryGroup as EmojiGroup;
	});
}

watch(q, async query => {
	if (query) return;
	await nextTick();
	onEmojiScroll();
});

onBeforeUnmount(() => {
	disposed = true;
	window.clearTimeout(searchTimer);
	if (scrollFrame != null) cancelAnimationFrame(scrollFrame);
	clearTooltipPointer();
});

watch(q, query => {
	window.clearTimeout(searchTimer);
	searchTimer = undefined;
	if (query === '') {
		search(query);
		return;
	}
	searchTimer = window.setTimeout(() => {
		searchTimer = undefined;
		search(query);
	}, 150);
});

function search(query: string) {
	searchedQuery.value = query;
	if (emojisEl.value) emojisEl.value.scrollTop = 0;

	if (query === '') {
		searchResultCustom.value = [];
		searchResultUnicode.value = [];
		return;
	}

	const newQ = query.replace(/:/g, '').toLowerCase();

	const searchCustom = () => {
		const max = 48;
		const emojis = customEmojis.value;
		const matches = new Set<Misskey.entities.EmojiSimple>();

		const exactMatch = emojis.find(emoji => emoji.name === newQ);
		if (exactMatch) matches.add(exactMatch);

		if (newQ.includes(' ')) { // AND検索
			const keywords = newQ.split(' ');

			// 名前にキーワードが含まれている
			for (const emoji of emojis) {
				if (keywords.every(keyword => emoji.name.includes(keyword))) {
					matches.add(emoji);
					if (matches.size >= max) break;
				}
			}
			if (matches.size >= max) return matches;

			// 名前またはエイリアスにキーワードが含まれている
			for (const emoji of emojis) {
				if (keywords.every(keyword => emoji.name.includes(keyword) || emoji.aliases.some(alias => alias.includes(keyword)))) {
					matches.add(emoji);
					if (matches.size >= max) break;
				}
			}
		} else {
			if (customEmojisMap.has(newQ)) {
				matches.add(customEmojisMap.get(newQ)!);
			}
			if (matches.size >= max) return matches;

			for (const emoji of emojis) {
				if (emoji.aliases.some(alias => alias === newQ)) {
					matches.add(emoji);
					if (matches.size >= max) break;
				}
			}
			if (matches.size >= max) return matches;

			for (const emoji of emojis) {
				if (emoji.name.startsWith(newQ)) {
					matches.add(emoji);
					if (matches.size >= max) break;
				}
			}
			if (matches.size >= max) return matches;

			for (const emoji of emojis) {
				if (emoji.aliases.some(alias => alias.startsWith(newQ))) {
					matches.add(emoji);
					if (matches.size >= max) break;
				}
			}
			if (matches.size >= max) return matches;

			for (const emoji of emojis) {
				if (emoji.name.includes(newQ)) {
					matches.add(emoji);
					if (matches.size >= max) break;
				}
			}
			if (matches.size >= max) return matches;

			for (const emoji of emojis) {
				if (emoji.aliases.some(alias => alias.includes(newQ))) {
					matches.add(emoji);
					if (matches.size >= max) break;
				}
			}
		}

		return matches;
	};

	const searchUnicode = () => {
		const max = 48;
		const emojis = emojilist;
		const matches = new Set<UnicodeEmojiDef>();

		const exactMatch = emojis.find(emoji => emoji.name === newQ);
		if (exactMatch) matches.add(exactMatch);

		if (newQ.includes(' ')) { // AND検索
			const keywords = newQ.split(' ');

			for (const emoji of emojis) {
				if (keywords.every(keyword => emoji.name.includes(keyword))) {
					matches.add(emoji);
					if (matches.size >= max) break;
				}
			}
			if (matches.size >= max) return matches;

			for (const index of Object.values(store.s.additionalUnicodeEmojiIndexes)) {
				if (matches.size >= max) return matches;
				for (const emoji of emojis) {
					if (keywords.every(keyword => index[emoji.char]?.some(k => k.includes(keyword)))) {
						matches.add(emoji);
						if (matches.size >= max) break;
					}
				}
			}
		} else {
			for (const emoji of emojis) {
				if (emoji.name.startsWith(newQ)) {
					matches.add(emoji);
					if (matches.size >= max) break;
				}
			}
			if (matches.size >= max) return matches;

			for (const index of Object.values(store.s.additionalUnicodeEmojiIndexes)) {
				if (matches.size >= max) return matches;
				for (const emoji of emojis) {
					if (index[emoji.char]?.some(k => k.startsWith(newQ))) {
						matches.add(emoji);
						if (matches.size >= max) break;
					}
				}
			}

			if (matches.size >= max) return matches;
			for (const emoji of emojis) {
				if (emoji.name.includes(newQ)) {
					matches.add(emoji);
					if (matches.size >= max) break;
				}
			}
			if (matches.size >= max) return matches;

			for (const index of Object.values(store.s.additionalUnicodeEmojiIndexes)) {
				if (matches.size >= max) return matches;
				for (const emoji of emojis) {
					if (index[emoji.char]?.some(k => k.includes(newQ))) {
						matches.add(emoji);
						if (matches.size >= max) break;
					}
				}
			}
		}

		return matches;
	};

	searchResultCustom.value = Array.from(searchCustom());
	searchResultUnicode.value = Array.from(searchUnicode());
}

function canReact(emoji: Misskey.entities.EmojiSimple | UnicodeEmojiDef | string): boolean {
	return !props.targetNote || checkReactionPermissions($i!, props.targetNote, emoji);
}

function filterCategory(emoji: Misskey.entities.EmojiSimple, category: string): boolean {
	return category === '' ? (emoji.category === 'null' || !emoji.category) : emoji.category === category;
}

function focus() {
	if (!['smartphone', 'tablet'].includes(deviceKind) && !isTouchUsing) {
		searchEl.value?.focus({
			preventScroll: true,
		});
	}
}

function reset() {
	if (emojisEl.value) emojisEl.value.scrollTop = 0;
	q.value = '';
	activeGroup.value = 'recent';
}

function getKey(emoji: string | Misskey.entities.EmojiSimple | UnicodeEmojiDef): string {
	return typeof emoji === 'string' ? emoji : 'char' in emoji ? emoji.char : `:${emoji.name}:`;
}

function getDef(emoji: string): string | Misskey.entities.EmojiSimple | UnicodeEmojiDef {
	if (emoji.includes(':')) {
		// カスタム絵文字が存在する場合はその情報を持つオブジェクトを返し、
		// サーバの管理画面から削除された等で情報が見つからない場合は名前の文字列をそのまま返しておく（undefinedを返すとエラーになるため）
		const name = emoji.replaceAll(':', '');
		return customEmojisMap.get(name) ?? emoji;
	} else {
		return getUnicodeEmoji(emoji);
	}
}

function chosen(emoji: string | Misskey.entities.EmojiSimple | UnicodeEmojiDef, ev?: PointerEvent) {
	const el = ev && (ev.currentTarget ?? ev.target) as HTMLElement | null | undefined;
	if (el && prefer.s.animation) {
		const rect = el.getBoundingClientRect();
		const x = rect.left + (el.offsetWidth / 2);
		const y = rect.top + (el.offsetHeight / 2);
		const { dispose } = os.popup(MkRippleEffect, { x, y }, {
			end: () => dispose(),
		});
	}

	const key = getKey(emoji);
	emit('chosen', key);

	haptic();

	// 最近使った絵文字更新
	if (!pinned.value?.includes(key)) {
		let recents = store.s.recentlyUsedEmojis;
		recents = recents.filter((emoji) => emoji !== key);
		recents.unshift(key);
		store.set('recentlyUsedEmojis', recents.splice(0, 32));
	}
}

function input(): void {
	// Using custom input event instead of v-model to respond immediately on
	// Android, where composition happens on all languages
	// (v-model does not update during composition)
	q.value = searchEl.value?.value.trim() ?? '';
}

function paste(event: ClipboardEvent): void {
	const pasted = event.clipboardData?.getData('text') ?? '';
	if (done(pasted, false)) {
		event.preventDefault();
	}
}

function onKeydown(ev: KeyboardEvent) {
	if (ev.isComposing || ev.key === 'Process' || ev.keyCode === 229) return;
	if (ev.key === 'Enter') {
		ev.preventDefault();
		ev.stopPropagation();
		done();
	}
	if (ev.key === 'Escape') {
		ev.preventDefault();
		ev.stopPropagation();
		emit('esc');
	}
}

function done(query?: string, allowSearchResult = true): boolean | void {
	if (query == null) query = q.value;
	if (query == null || typeof query !== 'string') return;

	const q2 = query.replace(/:/g, '');
	const exactMatchCustom = customEmojisMap.get(q2);
	if (exactMatchCustom) {
		chosen(exactMatchCustom);
		return true;
	}
	const exactMatchUnicode = emojilist.find(emoji => emoji.char === q2 || emoji.name === q2);
	if (exactMatchUnicode) {
		chosen(exactMatchUnicode);
		return true;
	}
	if (!allowSearchResult) return false;
	if (searchedQuery.value !== query) {
		window.clearTimeout(searchTimer);
		searchTimer = undefined;
		search(query);
	}
	if (searchResultCustom.value.length > 0) {
		chosen(searchResultCustom.value[0]);
		return true;
	}
	if (searchResultUnicode.value.length > 0) {
		chosen(searchResultUnicode.value[0]);
		return true;
	}
}

function settings() {
	emit('esc');
	router.push('/settings/emoji-palette');
}

onMounted(() => {
	focus();
	onEmojiScroll();
});

defineExpose({
	focus,
	reset,
});
</script>

<style lang="scss" scoped>
.omfetrab {
	$pad: 6px;

	display: flex;
	flex-direction: column;

	&.s1 {
		--eachSize: 37px;
	}

	&.s2 {
		--eachSize: 42px;
	}

	&.s3 {
		--eachSize: 47px;
	}

	&.s4 {
		--eachSize: 52px;
	}

	&.s5 {
		--eachSize: 57px;
	}

	&.w1 {
		--columns: 5;
	}

	&.w2 {
		--columns: 6;
	}

	&.w3 {
		--columns: 7;
	}

	&.w4 {
		--columns: 8;
	}

	&.w5 {
		--columns: 9;
	}

	&.h1 {
		--rows: 4;
	}

	&.h2 {
		--rows: 6;
	}

	&.h3 {
		--rows: 8;
	}

	&.h4 {
		--rows: 10;
	}

	width: calc((var(--eachSize) * var(--columns)) + (#{$pad} * 2));
	height: min(calc((var(--eachSize) * var(--rows)) + (#{$pad} * 2) + 80px), 320px, calc(100dvh - 96px));

	&.asDrawer {
		width: 100% !important;
		height: min(42dvh, 320px);

		> .main > .emojis {
			::v-deep(section) {
				> header {
					height: 32px;
					line-height: 32px;
					padding: 0 12px;
					font-size: 15px;
				}

				> .body {
					display: grid;
					grid-template-columns: repeat(var(--columns), 1fr);
					font-size: 30px;

					> .config {
						aspect-ratio: 1 / 1;
						width: auto;
						height: auto;
						min-width: 0;
						font-size: 14px;
					}

					> .item {
						aspect-ratio: 1 / 1;
						width: auto;
						height: auto;
						min-width: 0;

						&:disabled {
							cursor: not-allowed;
							background: linear-gradient(-45deg, transparent 0% 48%, light-dark(rgba(0, 0, 0, 0.25), rgba(255, 255, 255, 0.15)) 48% 52%, transparent 52% 100%);
							opacity: 1;

							> .emoji {
								filter: grayscale(1);
								mix-blend-mode: exclusion;
								opacity: 0.8;
							}
						}
					}
				}
			}
		}
	}

	&.asWindow {
		width: 100% !important;
		height: 100% !important;

		> .main > .emojis {
			::v-deep(section) {
				> .body {
					display: grid;
					grid-template-columns: repeat(var(--columns), 1fr);
					font-size: 30px;

					> .item {
						aspect-ratio: 1 / 1;
						width: auto;
						height: auto;
						min-width: 0;
						padding: 0;

						&:disabled {
							cursor: not-allowed;
							background: linear-gradient(-45deg, transparent 0% 48%, light-dark(rgba(0, 0, 0, 0.25), rgba(255, 255, 255, 0.15)) 48% 52%, transparent 52% 100%);
							opacity: 1;

							> .emoji {
								filter: grayscale(1);
								mix-blend-mode: exclusion;
								opacity: 0.8;
							}
						}
					}
				}
			}
		}
	}

	> .search {
		order: 1;
		flex: none;
		width: 100%;
		padding: 12px;
		box-sizing: border-box;
		font-size: 1em;
		outline: none;
		border: none;
		background: var(--MI_THEME-panel);
		color: var(--MI_THEME-fg);

		box-shadow: 0 calc(-1 * var(--MI-dividerWidth)) 0 0 var(--MI-dividerColor);
	}

	> .main {
		display: flex;
		flex: 1;
		min-height: 0;
	}

	.toolbar {
		background: var(--MI_THEME-panel);
		display: flex;
		flex: none;
		order: 2;
		align-items: center;
		gap: 4px;
		box-sizing: border-box;
		min-height: 40px;
		padding: 0 8px env(safe-area-inset-bottom, 0px);
		border-top: var(--MI-divider);
	}

	.toolbarButton {
		display: grid;
		place-items: center;
		flex: 0 0 32px;
		width: 32px;
		height: 32px;
		border-radius: 6px;
		font-size: 20px;
		color: var(--MI_THEME-fgTransparentWeak);

		&:hover {
			background: var(--MI_THEME-buttonHoverBg);
		}

		&.active {
			color: var(--MI_THEME-fgTransparent);
			background: var(--MI_THEME-buttonBg);
		}

		&:focus-visible {
			outline: 2px solid var(--MI_THEME-focus);
			outline-offset: -2px;
		}
	}

	.settingsButton {
		margin-left: auto;
	}

	.emojis {
		flex: 1;
		min-width: 0;
		height: 100%;
		overflow-y: auto;
		overflow-x: hidden;
		scrollbar-gutter: stable;

		:deep(.title) {
			background: transparent;
			position: sticky;
			top: 0;
			z-index: 2;
			padding: 0 8px;
			line-height: 32px;
			font-size: 12px;
			cursor: default;

			&:hover {
				color: inherit;
			}
		}

		:deep(.title.stuck) {
			background: var(--MI_THEME-panel);
		}

		.empty {
			padding: 24px 8px;
			text-align: center;
			font-size: 12px;
			color: var(--MI_THEME-fgTransparentWeak);
		}

		::v-deep(section) {
			> header {
				position: sticky;
				top: 0;
				left: 0;
				line-height: 28px;
				z-index: 1;
				padding: 0 8px;
				font-size: 12px;
				cursor: pointer;

				&:hover {
					color: var(--MI_THEME-accent);
				}
			}

			> .body {
				position: relative;
				display: grid;
				grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
				padding: $pad;

				> .config {
					position: relative;
					padding: 0 3px;
					width: auto;
					height: auto;
					min-width: 0;
					aspect-ratio: 1 / 1;
					contain: strict;
					opacity: 0.5;
				}

				> .item {
					position: relative;
					padding: 0 3px;
					width: auto;
					height: auto;
					min-width: 0;
					aspect-ratio: 1 / 1;
					contain: strict;
					border-radius: 4px;
					font-size: 24px;

					&:hover {
						background: rgba(0, 0, 0, 0.05);
					}

					&:active {
						background: var(--MI_THEME-accent);
						box-shadow: inset 0 0.15em 0.3em rgba(27, 31, 35, 0.15);
					}

					&:disabled {
						cursor: not-allowed;
						background: linear-gradient(-45deg, transparent 0% 48%, light-dark(rgba(0, 0, 0, 0.25), rgba(255, 255, 255, 0.15)) 48% 52%, transparent 52% 100%);
						opacity: 1;

						> .emoji {
							filter: grayscale(1);
							mix-blend-mode: exclusion;
							opacity: 0.8;
						}
					}

					> .emoji {
						height: var(--MI-emojiHeight);
						vertical-align: var(--MI-emojiVerticalAlign);
						pointer-events: none;
						width: 100%;
						object-fit: contain;
					}
				}
			}

			&.result {
				border-bottom: var(--MI-divider);

				&:empty {
					display: none;
				}
			}
		}
	}
}
</style>
