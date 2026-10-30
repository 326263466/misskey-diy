<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl" class="superMenu" :class="{ sidebar: sidebarMode, noAnimation: !prefer.s.animation }">
	<div
		class="rrevdjwu"
		:class="{ grid, expandedTrack: sidebarMode, trackHidden: sidebarMode && compactMode }"
		:aria-hidden="sidebarMode && compactMode ? true : undefined"
		:inert="sidebarMode && compactMode"
	>
		<MkInput
			v-if="searchIndex && searchIndex.length > 0"
			v-model="searchQuery"
			class="menuSearch"
			:placeholder="i18n.ts.search"
			type="search"
			style="margin-bottom: 16px;"
			@keydown="searchOnKeyDown"
		>
			<template #prefix><i class="ti ti-search"></i></template>
		</MkInput>

		<template v-if="rawSearchQuery == ''">
			<div v-for="(group, groupIndex) in def" :key="group.title ?? groupIndex" class="group" :class="{ collapsible: isCollapsible(group) }">
				<button
					v-if="isCollapsible(group)"
					type="button"
					class="_button toggle"
					:class="{ hasActive: !sidebarMode && !isOpen(group) && hasActiveItem(group) }"
					:aria-expanded="isOpen(group)"
					:aria-controls="`${groupIdPrefix}-${groupIndex}`"
					@click="toggleGroup(group)"
				>
					<span v-if="group.icon" class="icon"><i :class="group.icon" class="ti-fw"></i></span>
					<span class="text">{{ group.title }}</span>
					<i class="ti ti-chevron-down ti-fw arrow" :class="{ opened: isOpen(group) }" aria-hidden="true"></i>
				</button>
				<div v-else-if="group.title" class="title">{{ group.title }}</div>

				<div v-show="!isCollapsible(group) || isOpen(group)" :id="`${groupIdPrefix}-${groupIndex}`" class="items">
					<template v-for="(item, i) in group.items">
						<a v-if="item.type === 'a'" :href="item.href" :target="item.target" class="_button item" :class="{ danger: item.danger, active: item.active }">
							<span v-if="item.icon" class="icon" aria-hidden="true"><i :class="item.icon" class="ti-fw"></i></span>
							<span class="text">{{ item.text }}</span>
						</a>
						<button v-else-if="item.type === 'button'" type="button" class="_button item" :class="{ danger: item.danger, active: item.active }" :disabled="item.active" @click="ev => item.action(ev)">
							<span v-if="item.icon" class="icon" aria-hidden="true"><i :class="item.icon" class="ti-fw"></i></span>
							<span class="text">{{ item.text }}</span>
						</button>
						<MkA v-else :to="item.to" class="_button item" :class="{ danger: item.danger, active: item.active }">
							<span v-if="item.icon" class="icon" aria-hidden="true"><i :class="item.icon" class="ti-fw"></i></span>
							<span class="text">{{ item.text }}</span>
						</MkA>
					</template>
				</div>
			</div>
		</template>
		<template v-else>
			<div v-for="item, index in searchResult">
				<MkA
					:to="item.path + '#' + item.id"
					class="_button searchResultItem"
					:class="{ selected: searchSelectedIndex !== null && searchSelectedIndex === index }"
				>
					<span v-if="item.icon" class="icon"><i :class="item.icon" class="ti-fw"></i></span>
					<span class="text">
						<template v-if="item.isRoot">
							{{ item.label }}
						</template>
						<template v-else>
							<span style="color: var(--MI_THEME-fgTransparentWeak); font-size: 90%; word-break: break-word;">{{ item.parentLabels.join(' > ') }}</span>
							<br>
							<span style="word-break: break-word;">{{ item.label }}</span>
						</template>
					</span>
				</MkA>
			</div>
		</template>
		<slot></slot>
	</div>
	<div v-if="sidebarMode" class="rrevdjwu compact compactTrack" :class="{ trackHidden: !compactMode }" :aria-hidden="!compactMode ? true : undefined" :inert="!compactMode">
		<div v-for="(group, groupIndex) in def" :key="group.title ?? groupIndex" class="group" :class="{ collapsible: isCollapsible(group) }">
			<button
				v-if="isCompactGroup(group)"
				v-tooltip.noDelay.right="group.title"
				type="button"
				class="_button toggle compactToggle"
				:class="{ active: hasActiveItem(group), popupOpen: compactPopupGroup === groupIndex }"
				:aria-label="group.title"
				aria-haspopup="menu"
				:aria-expanded="compactPopupGroup === groupIndex"
				@click="ev => openCompactGroup(group, groupIndex, ev)"
			>
				<span class="icon" aria-hidden="true"><i :class="group.icon" class="ti-fw"></i></span>
			</button>
			<div v-else class="items">
				<template v-for="(item, i) in group.items" :key="i">
					<a v-if="item.type === 'a'" v-tooltip.noDelay.right="item.text" :href="item.href" :target="item.target" class="_button item" :class="{ danger: item.danger, active: item.active }" :aria-label="item.text">
						<span class="icon" aria-hidden="true"><i :class="item.icon ?? 'ti ti-circle'" class="ti-fw"></i></span>
					</a>
					<button v-else-if="item.type === 'button'" v-tooltip.noDelay.right="item.text" type="button" class="_button item" :class="{ danger: item.danger, active: item.active }" :disabled="item.active" :aria-label="item.text" @click="ev => item.action(ev)">
						<span class="icon" aria-hidden="true"><i :class="item.icon ?? 'ti ti-circle'" class="ti-fw"></i></span>
					</button>
					<MkA v-else v-tooltip.noDelay.right="item.text" :to="item.to" class="_button item" :class="{ danger: item.danger, active: item.active }" :aria-label="item.text">
						<span class="icon" aria-hidden="true"><i :class="item.icon ?? 'ti ti-circle'" class="ti-fw"></i></span>
					</MkA>
				</template>
			</div>
		</div>
	</div>
</div>
</template>

<script lang="ts">
import type { Awaitable } from '@/types/misc.js';

export type SuperMenuDef = {
	title?: string;
	icon?: string;
	/** 作为可折叠的一级菜单显示，需要同时提供 title。宫格布局下始终展开。 */
	collapsible?: boolean;
	items: ({
		type: 'a';
		href: string;
		target?: string;
		icon?: string;
		text: string;
		danger?: boolean;
		active?: boolean;
	} | {
		type: 'button';
		icon?: string;
		text: string;
		danger?: boolean;
		active?: boolean;
		action: (ev: PointerEvent) => Awaitable<void>;
	} | {
		type?: 'link';
		to: string;
		icon?: string;
		text: string;
		danger?: boolean;
		active?: boolean;
	})[];
};
</script>

<script lang="ts" setup>
import { useTemplateRef, ref, watch, nextTick, computed, onUnmounted, onDeactivated, inject, useId } from 'vue';
import type { Ref } from 'vue';
import { debounce } from 'throttle-debounce';
import { getScrollContainer } from '@@/js/scroll.js';
import type { SearchIndexItem } from '@/utility/inapp-search.js';
import type { MenuItem } from '@/types/menu.js';
import MkInput from '@/components/MkInput.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { DI } from '@/di.js';
import { useRouter } from '@/router.js';
import { initIntlString, compareStringIncludes } from '@/utility/intl-string.js';
import { prefer } from '@/preferences.js';

const props = withDefaults(defineProps<{
	def: SuperMenuDef[];
	grid?: boolean;
	/** 传入此选项启用侧栏双轨，收起时只显示一级图标；宫格布局忽略此选项。 */
	compact?: boolean;
	searchIndex?: SearchIndexItem[];
}>(), {
	compact: undefined,
});

type SearchResultItem = {
	id: string;
	path: string;
	label: string;
	icon?: string;
	isRoot: boolean;
	parentLabels: string[];
};

initIntlString();

const maxSearchResult = 20;

const router = useRouter();
const rootEl = useTemplateRef('rootEl');
const pageActive = inject(DI.pageActive, ref(true));

const groupIdPrefix = useId();
const sidebarMode = computed(() => props.compact !== undefined && !props.grid);
const compactMode = computed(() => props.compact === true && !props.grid);
const compactPopupGroup = ref<number | null>(null);
let compactPopupCloseRequested: Ref<boolean> | null = null;
let compactPopupSequence = 0;
// 分组默认全部展开，只记录用户手动收起的分组。
const closedGroups = ref(new Set<string>());

function isCompactGroup(group: SuperMenuDef): boolean {
	return group.title != null && group.icon != null;
}

function openCompactGroup(group: SuperMenuDef, groupIndex: number, ev: PointerEvent) {
	const anchor = ev.currentTarget;
	if (!compactMode.value || !isCompactGroup(group) || !pageActive.value || compactPopupGroup.value === groupIndex || !(anchor instanceof HTMLElement) || !anchor.isConnected) return;
	const items = group.items.map((item): MenuItem => {
		const common = { text: item.text, icon: item.icon, active: item.active, danger: item.danger };
		if (item.type === 'button') {
			return {
				...common,
				type: 'button',
				action: event => {
					if (!item.active) void item.action(event);
				},
			};
		}
		return item.type === 'a'
			? { ...common, type: 'a', href: item.href, target: item.target }
			: { ...common, type: 'link', to: item.to };
	});
	closeCompactPopup();
	const sequence = ++compactPopupSequence;
	const closeRequested = ref(false);
	compactPopupCloseRequested = closeRequested;
	compactPopupGroup.value = groupIndex;
	const resetPopup = () => {
		if (sequence !== compactPopupSequence) return;
		compactPopupGroup.value = null;
		compactPopupCloseRequested = null;
	};
	void os.popupMenu(items, anchor, {
		width: 210,
		placement: 'right',
		style: {
			'--MI_THEME-popup': 'var(--MI_THEME-navBg)',
			'--menuFg': 'var(--MI_THEME-navFg)',
			'--menuActiveFg': 'var(--MI_THEME-accent)',
			'--menuActiveBg': 'var(--MI_THEME-accentedBg)',
			'--menuItemInset': '0px',
			'--menuItemRadius': '0px',
		},
		closeRequested,
		onClosing: resetPopup,
		onClosed: resetPopup,
	});
}

function closeCompactPopup() {
	compactPopupSequence++;
	if (compactPopupCloseRequested) compactPopupCloseRequested.value = true;
	compactPopupCloseRequested = null;
	compactPopupGroup.value = null;
}

watch([compactMode, pageActive], ([isCompact, isActive]) => {
	if (!isCompact || !isActive) closeCompactPopup();
});
watch(() => router.currentRef.value._parsedRoute.fullPath, closeCompactPopup);
watch(() => props.def, closeCompactPopup);
onDeactivated(closeCompactPopup);
onUnmounted(closeCompactPopup);

function isCollapsible(group: SuperMenuDef): boolean {
	return group.collapsible === true && group.title != null && !props.grid;
}

function hasActiveItem(group: SuperMenuDef): boolean {
	return group.items.some(item => item.active);
}

function isOpen(group: SuperMenuDef): boolean {
	return group.title == null || !closedGroups.value.has(group.title);
}

function toggleGroup(group: SuperMenuDef) {
	if (group.title == null) return;
	if (closedGroups.value.has(group.title)) {
		closedGroups.value.delete(group.title);
	} else {
		closedGroups.value.add(group.title);
	}
}

// 切换到其他分组的页面时展开该分组；用户手动收起当前分组后不再强制展开。
const activeGroupTitle = computed(() => props.def.find(group => group.collapsible && hasActiveItem(group))?.title ?? null);
watch(activeGroupTitle, title => {
	if (title == null) return;
	closedGroups.value.delete(title);
}, { immediate: true });

const searchQuery = ref('');
const rawSearchQuery = ref('');

const searchSelectedIndex = ref<null | number>(null);
const searchResult = ref<SearchResultItem[]>([]);
let searchedQuery = '';
const searchIndexItemByIdComputed = computed(() => props.searchIndex && new Map<string, SearchIndexItem>(props.searchIndex.map(i => [i.id, i])));

watch(searchQuery, (value) => {
	rawSearchQuery.value = value;
});

function execSearch(value: string) {
	searchedQuery = value;
	searchSelectedIndex.value = null;
	const newResult: SearchResultItem[] = [];

	const searchIndexItemById = searchIndexItemByIdComputed.value;
	if (searchIndexItemById != null) {
		const addSearchResult = (item: SearchIndexItem) => {
			let path: string | undefined = item.path;
			let icon: string | undefined = item.icon;
			const parentLabels: string[] = [];

			for (let current = searchIndexItemById.get(item.parentId ?? '');
				current != null;
				current = searchIndexItemById.get(current.parentId ?? '')) {
				path ??= current.path;
				icon ??= current.icon;
				parentLabels.push(current.label);
			}

			if (_DEV_ && path == null) throw new Error('path is null for ' + item.id);

			newResult.push({
				id: item.id,
				path: path ?? '/', // never gets `/`
				label: item.label,
				parentLabels: parentLabels.toReversed(),
				icon,
				isRoot: item.parentId == null,
			});
		};

		// label, keywords, texts の順に優先して表示

		const items = Array.from(searchIndexItemById.values());
		const matchedIds = new Set<string>();

		for (const item of items) {
			if (matchedIds.size >= maxSearchResult) break;
			if (matchedIds.has(item.id)) continue;
			if (compareStringIncludes(item.label, value)) {
				addSearchResult(item);
				matchedIds.add(item.id);
			}
		}

		for (const item of items) {
			if (matchedIds.size >= maxSearchResult) break;
			if (matchedIds.has(item.id)) continue;
			if (item.keywords.some((x) => compareStringIncludes(x, value))) {
				addSearchResult(item);
				matchedIds.add(item.id);
			}
		}

		for (const item of items) {
			if (matchedIds.size >= maxSearchResult) break;
			if (matchedIds.has(item.id)) continue;
			if (item.texts.some((x) => compareStringIncludes(x, value))) {
				addSearchResult(item);
				matchedIds.add(item.id);
			}
		}
	}

	searchResult.value = newResult;
}

const execSearchDebounced = debounce(200, execSearch);

onUnmounted(() => {
	execSearchDebounced.cancel();
});

watch(rawSearchQuery, (value) => {
	searchSelectedIndex.value = null;

	if (value === '') {
		// クリア時は即座にメニュー表示へ戻すため、保留中の検索も破棄する
		execSearchDebounced.cancel({ upcomingOnly: true });
		searchedQuery = value;
		searchResult.value = [];
		return;
	}

	execSearchDebounced(value);
});

function searchOnKeyDown(ev: KeyboardEvent) {
	if (ev.isComposing || !['Enter', 'ArrowDown', 'ArrowUp'].includes(ev.key)) return;
	if (searchedQuery !== rawSearchQuery.value) {
		execSearchDebounced.cancel({ upcomingOnly: true });
		execSearch(rawSearchQuery.value);
	}
	if (searchResult.value.length === 0) return;

	if (ev.key === 'Enter' && searchSelectedIndex.value != null) {
		const selected = searchResult.value[searchSelectedIndex.value];
		if (!selected) {
			searchSelectedIndex.value = null;
			return;
		}
		ev.preventDefault();
		router.pushByPath(selected.path + '#' + selected.id);
	} else if (ev.key === 'ArrowDown') {
		ev.preventDefault();
		const current = searchSelectedIndex.value ?? -1;
		searchSelectedIndex.value = current + 1 >= searchResult.value.length ? 0 : current + 1;
	} else if (ev.key === 'ArrowUp') {
		ev.preventDefault();
		const current = searchSelectedIndex.value ?? 0;
		searchSelectedIndex.value = current - 1 < 0 ? searchResult.value.length - 1 : current - 1;
	}

	if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
		nextTick(() => {
			if (!rootEl.value) return;
			const selectedEl = rootEl.value.querySelector<HTMLElement>('.searchResultItem.selected');
			if (selectedEl != null) {
				const scrollContainer = getScrollContainer(selectedEl);
				if (!scrollContainer) return;
				scrollContainer.scrollTo({
					top: selectedEl.offsetTop - scrollContainer.clientHeight / 2 + selectedEl.clientHeight / 2,
					behavior: 'instant',
				});
			}
		});
	}
}
</script>

<style lang="scss" scoped>
.superMenu.sidebar {
	position: relative;
	width: 100%;
	height: 100%;
	min-height: 0;
	overflow: clip;

	// 两条轨道保持各自的宽度和滚动位置，切换时不重排纵向菜单。
	> .expandedTrack,
	> .compactTrack {
		position: absolute;
		inset-block: 0;
		inset-inline-start: 0;
		height: 100%;
		box-sizing: border-box;
		overflow-x: hidden;
		overflow-y: auto;
		overscroll-behavior: contain;
		scrollbar-width: none;
		visibility: visible;
		opacity: 1;
		transition: opacity 0.16s ease 0.06s, visibility 0s;

		&::-webkit-scrollbar {
			display: none;
		}

		&.trackHidden {
			visibility: hidden;
			opacity: 0;
			pointer-events: none;
			transition: opacity 0.08s ease, visibility 0s linear 0.08s;
		}
	}

	> .expandedTrack {
		width: 210px;
		padding: 16px 10px 24px;

		> .group > .items > .item > .text,
		> .group > .toggle > .text {
			min-width: 0;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}
	}

	> .compactTrack {
		width: 54px;
		padding: 16px 0 24px;
	}

	> .rrevdjwu {
		> .group > .items > .item:not(.active):hover,
		> .group.collapsible > .toggle:not(.active):hover,
		.searchResultItem:not(.active):hover {
			background: var(--MI_THEME-panelHighlight);
		}
	}

	> .expandedTrack > .group.collapsible > .items {
		color: var(--MI_THEME-fgTransparentWeak);
	}

	&.noAnimation {
		> .expandedTrack,
		> .compactTrack,
		> .expandedTrack > .group.collapsible > .toggle > .arrow {
			transition: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		> .expandedTrack,
		> .compactTrack {
			transition: none;
		}
	}
}

.rrevdjwu {
	> .group {
		& + .group {
			margin-top: 16px;
		}

		> .title {
			color: var(--MI_THEME-fgTransparentWeak);
			margin: 0 0 8px 0;
			font-size: 1em;
		}

		> .items {
			display: flex;
			flex-direction: column;
			gap: 2px;
			color: var(--MI_THEME-fgTransparent);

			> .item {
				color: inherit;
				display: flex;
				align-items: center;
				width: 100%;
				min-height: 40px;
				box-sizing: border-box;
				padding: 9px 16px 9px 8px;
				border-radius: var(--MI-cardRadius);
				font-size: 1em;

				&:hover {
					text-decoration: none;
					background: none;
					color: var(--MI_THEME-accent);
				}

				&:focus-visible {
					outline-offset: -2px;
				}

				&.active {
					color: var(--MI_THEME-accent);
					background: var(--MI_THEME-accentedBg);
					font-weight: 500;
				}

				&.danger {
					color: var(--MI_THEME-error);
				}

				> .icon {
					width: 32px;
					margin-right: 2px;
					flex-shrink: 0;
					text-align: center;
				}

				> .text {
					white-space: normal;
					padding-right: 12px;
					flex-shrink: 1;
				}

			}
		}
	}

	// 一级菜单可折叠时与菜单项同高排列，二级菜单缩进
	> .group.collapsible {
		& + .group.collapsible {
			margin-top: 2px;
		}

		> .toggle {
			display: flex;
			align-items: center;
			width: 100%;
			min-height: 40px;
			box-sizing: border-box;
			padding: 9px 12px 9px 8px;
			border-radius: var(--MI-cardRadius);
			color: var(--MI_THEME-fg);
			font-size: 1em;
			text-align: left;

			&:hover {
				color: var(--MI_THEME-accent);
			}

			&:focus-visible {
				outline-offset: -2px;
			}

			&.hasActive {
				color: var(--MI_THEME-accent);
			}

			> .icon {
				width: 32px;
				margin-right: 2px;
				flex-shrink: 0;
				text-align: center;
			}

			> .text {
				flex: 1;
				min-width: 0;
				font-weight: 500;
			}

			> .arrow {
				flex-shrink: 0;
				color: var(--MI_THEME-fgTransparentWeak);
				transition: transform 0.2s ease;

				&.opened {
					transform: rotate(180deg);
				}
			}
		}

		> .items {
			margin-top: 2px;
			padding-left: 16px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		> .group.collapsible > .toggle > .arrow {
			transition: none;
		}
	}

	&.grid {
		> .group {
			margin-left: 0;
			margin-right: 0;

			& + .group {
				padding-top: 0;
				border-top: none;
			}

			> .title {
				font-size: 1em;
				color: var(--MI_THEME-fgTransparentWeak);
				margin: 0 0 8px 16px;
			}

			> .items {
				display: grid;
				grid-template-columns: repeat(auto-fill, minmax(min(70px, 100%), 1fr));
				grid-gap: 16px;
				padding: 0 16px;

				> .item {
					flex-direction: column;
					text-align: center;
					padding: 0;

					&:hover {
						text-decoration: none;
						background: none;
						color: var(--MI_THEME-accent);

						> .icon {
							background: var(--MI_THEME-accentedBg);
						}
					}

					> .icon {
						display: grid;
						place-content: center;
						margin-right: 0;
						margin-bottom: 6px;
						font-size: 1.5em;
						width: 60px;
						height: 60px;
						aspect-ratio: 1;
						background: var(--MI_THEME-panel);
						border-radius: 100%;
					}

					> .text {
						padding-right: 0;
						width: 100%;
						font-size: 1em;
					}
				}
			}
		}
	}

	&.compact {
		> .group {
			& + .group {
				margin-top: 0;
			}

			> .compactToggle,
			> .items > .item {
				justify-content: center;
				min-height: 50px;
				padding: 0;
				border-radius: 0;

				> .icon {
					width: 22px;
					margin: 0;
				}
			}

			> .compactToggle {
				display: flex;
				align-items: center;
				width: 100%;
				color: var(--MI_THEME-navFg);
				font-size: 1em;

				&:not(.active):hover,
				&:not(.active).popupOpen {
					background: var(--MI_THEME-panelHighlight);
					color: var(--MI_THEME-accent);
				}

				&.active {
					color: var(--MI_THEME-accent);
					background: var(--MI_THEME-accentedBg);
				}

				&:focus-visible {
					outline: 2px solid var(--MI_THEME-accent);
					outline-offset: -2px;
				}
			}

			> .items {
				gap: 0;
				margin-top: 0;
				padding-left: 0;

				> .item > .text {
					display: none;
				}
			}
		}
	}

	.searchResultItem {
		color: var(--MI_THEME-fgTransparent);
		display: flex;
		align-items: center;
		width: 100%;
		box-sizing: border-box;
		margin-bottom: 2px;
		padding: 9px 16px 9px 8px;
		border-radius: 9px;
		font-size: 1em;

		&:hover {
			text-decoration: none;
			background: none;
			color: var(--MI_THEME-accent);
		}

		&.selected {
			outline: 2px solid var(--MI_THEME-focus);
		}

		&:focus-visible,
		&.selected {
			outline-offset: -2px;
		}

		&.active {
			color: var(--MI_THEME-accent);
			background: var(--MI_THEME-accentedBg);
		}

		&.danger {
			color: var(--MI_THEME-error);
		}

		> .icon {
			width: 32px;
			margin-right: 2px;
			flex-shrink: 0;
			text-align: center;
		}

		> .text {
			white-space: normal;
			padding-right: 12px;
			flex-shrink: 1;
		}
	}
}
</style>
