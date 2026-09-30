<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.tabs" @wheel="onTabWheel">
	<div :class="$style.tabsInner">
		<button
			v-for="t in tabs"
			:key="t.key"
			class="_button _tabUnderline"
			:class="[$style.tab, {
				[$style.active]: t.key != null && t.key === props.tab,
				[$style.animate]: prefer.s.animation,
				_tabUnderlineAnimated: prefer.s.animation,
			}]"
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
					v-else mode="in-out" @enter="enter" @afterEnter="afterEnter" @leave="leave"
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
export type Tab = {
	key: string;
	onClick?: (ev: PointerEvent) => void;
	iconOnly?: boolean;
	title: string;
	icon?: string;
};
</script>

<script lang="ts" setup>
import { prefer } from '@/preferences.js';

const props = withDefaults(defineProps<{
	tabs?: Tab[];
	tab?: string;
	rootEl?: HTMLElement | null;
}>(), {
	tabs: () => ([] as Tab[]),
});

const emit = defineEmits<{
	(ev: 'update:tab', key: string): void;
	(ev: 'tabClick', key: string): void;
}>();

function onTabMousedown(tab: Tab, ev: MouseEvent): void {
	// ユーザビリティの観点からmousedown時にはonClickは呼ばない
	if (ev.button === 0 && tab.key && tab.key !== props.tab) {
		emit('update:tab', tab.key);
	}
}

function onTabClick(t: Tab, ev: PointerEvent): void {
	emit('tabClick', t.key);

	if (t.onClick) {
		ev.preventDefault();
		ev.stopPropagation();
		t.onClick(ev);
	}

	if (t.key && t.key !== props.tab) {
		emit('update:tab', t.key);
	}
}

function onTabWheel(ev: WheelEvent) {
	if (ev.deltaY !== 0 && ev.deltaX === 0) {
		ev.preventDefault();
		ev.stopPropagation();
		(ev.currentTarget as HTMLElement).scrollBy({
			left: ev.deltaY,
			behavior: 'instant',
		});
	}
	return false;
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
	display: block;
	position: relative;
	margin: 0;
	height: var(--height);
	font-size: 1em;
	text-align: left;
	overflow-x: auto;
	overflow-y: hidden;
	scrollbar-width: none;
}

.tabsInner {
	display: inline-flex;
	gap: 20px;
	height: var(--height);
	white-space: nowrap;
}

.tab {
	display: inline-block;
	position: relative;
	padding: 0;
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
