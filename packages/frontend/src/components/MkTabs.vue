<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.tabs, { [$style.centered]: props.centered }]">
	<div :class="$style.tabsInner">
		<button
			v-for="t in tabs"
			:key="t.key"
			v-tooltip="t.iconOnly && t.key !== tab ? t.title : undefined"
			class="_button _tabUnderline"
			:class="[$style.tab, {
				[$style.active]: t.key != null && t.key === tab,
				[$style.animate]: prefer.s.animation,
				_tabUnderlineAnimated: prefer.s.animation,
				_tabUnderlineUpper: tabHighlightUpper,
			}]"
			:aria-label="t.title"
			@mousedown="(ev) => onTabMousedown(t, ev)"
			@click="(ev) => onTabClick(t, ev)"
		>
			<div :class="$style.tabInner">
				<i v-if="t.icon" :class="[$style.tabIcon, t.icon]"></i>
				<div
					v-if="!t.iconOnly || (!prefer.s.animation && t.key === tab)"
					:class="$style.tabTitle"
				>
					{{ t.title }}
				</div>
				<Transition
					v-else
					mode="in-out"
					@enter="enter"
					@afterEnter="afterEnter"
					@leave="leave"
					@afterLeave="afterLeave"
				>
					<div v-show="t.key === tab" :class="[$style.tabTitle, $style.animate]">{{ t.title }}</div>
				</Transition>
			</div>
		</button>
	</div>
</div>
</template>

<script lang="ts">
export type Tab<K = string> = {
	key: K;
	onClick?: (ev: PointerEvent) => void;
	iconOnly?: boolean;
	title: string;
	icon?: string;
};
</script>

<script lang="ts" setup generic="const T extends Tab">
import { prefer } from '@/preferences.js';

const props = withDefaults(defineProps<{
	tabs?: T[];
	centered?: boolean;
	tabHighlightUpper?: boolean;
}>(), {
	tabs: () => ([] as T[]),
});

const emit = defineEmits<{
	(ev: 'tabClick', key: string): void;
}>();

const tab = defineModel<T['key']>('tab');

function onTabMousedown(selectedTab: Tab, ev: MouseEvent): void {
	// ユーザビリティの観点からmousedown時にはonClickは呼ばない
	if (ev.button === 0 && selectedTab.key && selectedTab.key !== tab.value) {
		tab.value = selectedTab.key;
	}
}

function onTabClick(t: Tab, ev: PointerEvent): void {
	emit('tabClick', t.key);

	if (t.onClick) {
		ev.preventDefault();
		ev.stopPropagation();
		t.onClick(ev);
	}

	if (t.key && t.key !== tab.value) {
		tab.value = t.key;
	}
}

function enter(el: Element) {
	if (!(el instanceof HTMLElement)) return;
	const elementWidth = el.getBoundingClientRect().width;
	el.style.width = '0';
	el.style.paddingLeft = '0';
	el.offsetWidth; // reflow
	el.style.width = `${elementWidth}px`;
	el.style.paddingLeft = '';
}

function afterEnter(el: Element) {
	if (!(el instanceof HTMLElement)) return;
	el.style.width = '';
}

function leave(el: Element) {
	if (!(el instanceof HTMLElement)) return;
	const elementWidth = el.getBoundingClientRect().width;
	el.style.width = `${elementWidth}px`;
	el.style.paddingLeft = '';
	el.offsetWidth; // reflow
	el.style.width = '0';
	el.style.paddingLeft = '0';
}

function afterLeave(el: Element) {
	if (!(el instanceof HTMLElement)) return;
	el.style.width = '';
}

</script>

<style lang="scss" module>
.tabs {
	--height: 40px;

	display: block;
	position: relative;
	margin: 0;
	height: var(--height);
	font-size: 85%;
	overflow-x: auto;
	overflow-y: hidden;
	scrollbar-width: none;

	&.centered {
		text-align: center;
	}
}

@container (max-width: 450px) {
	.tabs {
		font-size: 80%;
	}
}

.tabsInner {
	display: inline-block;
	height: var(--height);
	white-space: nowrap;
}

.tab {
	--MI-tabPaddingInline: 10px;
	display: inline-block;
	position: relative;
	padding: 0 var(--MI-tabPaddingInline);
	height: 100%;
	font-weight: normal;

	&.active {
		--MI-tabUnderlineOpacity: 1;
	}

	&:hover > .tabInner,
	&.active > .tabInner {
		opacity: 1;
	}

	&.animate > .tabInner {
		transition: opacity 0.2s ease;
	}
}

.tabInner {
	display: flex;
	align-items: center;
	opacity: 0.7;
}

.tabIcon + .tabTitle {
	padding-left: 4px;
}

.tabTitle {
	overflow: hidden;

	&.animate {
		transition: width .15s linear, padding-left .15s linear;
	}
}

</style>
