<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<TransitionGroup
	:enterActiveClass="prefer.s.animation ? $style.transition_x_enterActive : ''"
	:leaveActiveClass="prefer.s.animation ? $style.transition_x_leaveActive : ''"
	:enterFromClass="prefer.s.animation ? $style.transition_x_enterFrom : ''"
	:leaveToClass="prefer.s.animation ? $style.transition_x_leaveTo : ''"
	:moveClass="prefer.s.animation ? $style.transition_x_move : ''"
	:duration="200"
	tag="div" :class="$style.tabs" :data-current-page="tabs[tabs.length - 1].fullPath"
>
	<div v-for="(tab, i) in tabs" :key="tab.id" :class="$style.tab" :style="{ '--i': i - 1 }">
		<div v-if="i > 0" :class="$style.tabBg" @click="back()"></div>
		<div :class="$style.tabFg" @click.stop="back()">
			<div v-if="i > 0" :class="$style.tabMenu">
				<svg :class="$style.tabMenuShape" viewBox="0 0 24 16">
					<g transform="matrix(2.04108e-17,-0.333333,0.222222,1.36072e-17,21.3333,15.9989)">
						<path d="M23.997,-42C47.903,-23.457 47.997,12 47.997,12L-0.003,12L-0.003,-96C-0.003,-96 0.091,-60.543 23.997,-42Z" style="fill:var(--MI_THEME-panel);"/>
					</g>
				</svg>
				<button :class="$style.tabMenuButton" class="_button _iconButton" @click.stop="mount"><i class="ti ti-rectangle"></i></button>
				<button :class="$style.tabMenuButton" class="_button _iconButton" @click.stop="back"><i class="ti ti-x"></i></button>
			</div>
			<div v-if="i > 0" :class="$style.tabBorder"></div>
			<div :class="$style.tabContent" class="_pageContainer" :data-page-path="tab.fullPath" @click.stop="">
				<PageActivity :active="i === tabs.length - 1">
					<Suspense :timeout="0">
						<component :is="tab.component" v-bind="Object.fromEntries(tab.props)"/>

						<template #fallback>
							<MkLoading v-if="!tab.hideLoading"/>
						</template>
					</Suspense>
				</PageActivity>
			</div>
		</div>
	</div>
</TransitionGroup>
</template>

<script lang="ts" setup>
import { computed, defineComponent, inject, provide, shallowRef } from 'vue';
import type { Router } from '@/router.js';
import { prefer } from '@/preferences.js';
import MkLoadingPage from '@/pages/_loading_.vue';
import { DI } from '@/di.js';
import { deepEqual } from '@/utility/deep-equal.js';
import { isUserOverviewRoute } from '@/pages/user/context.js';
import { getRouteViewKey } from '@/lib/nirax.js';

const PageActivity = defineComponent((props: { active: boolean }, { slots }) => {
	const parentActive = inject(DI.pageActive, null);
	provide(DI.pageActive, computed(() => props.active && (parentActive?.value ?? true)));
	return () => slots.default?.();
}, { props: ['active'] });

const props = defineProps<{
	router?: Router;
}>();

const router = props.router ?? inject(DI.router);

if (router == null) {
	throw new Error('no router provided');
}

const currentDepth = inject(DI.routerCurrentDepth, 0);
provide(DI.routerCurrentDepth, currentDepth + 1);

let nextTabId = 0;
const tabs = shallowRef([{
	id: nextTabId++,
	fullPath: router.getCurrentFullPath(),
	routePath: router.current.route.path,
	viewKey: getRouteViewKey(router.current),
	hideLoading: isUserOverviewRoute(router.current),
	component: 'component' in router.current.route ? router.current.route.component : MkLoadingPage,
	props: router.current.props,
}]);

function mount() {
	const currentTab = tabs.value[tabs.value.length - 1];
	tabs.value = [currentTab];
}

function back() {
	if (tabs.value.length <= 1) return; // transitionの関係でタブが1つの状態でbackが呼ばれることがある
	const prev = tabs.value[tabs.value.length - 2];
	tabs.value = [...tabs.value.slice(0, tabs.value.length - 1)];
	router?.replaceByPath(prev.fullPath);
}

router.useListener('change', ({ resolved }) => {
	if (resolved == null || 'redirect' in resolved.route) return;
	const currentTab = tabs.value[tabs.value.length - 1];
	const routePath = resolved.route.path;
	const fullPath = router.getCurrentFullPath();
	const viewKey = getRouteViewKey(resolved);
	const matchesTab = (tab: typeof currentTab) => tab.routePath === routePath && (
		deepEqual(resolved.props, tab.props) || (resolved.route.reuseOnPropsChange && tab.viewKey === viewKey)
	);
	if (matchesTab(currentTab)) {
		// 子路由或可复用的查询参数变化时，保留实例并同步返回地址与页面参数。
		tabs.value = [...tabs.value.slice(0, -1), { ...currentTab, fullPath, props: resolved.props, hideLoading: isUserOverviewRoute(resolved) }];
		return;
	}

	if (tabs.value.some(matchesTab)) {
		const newTabs = [] as typeof tabs.value;
		for (const tab of tabs.value) {
			newTabs.push(tab);

			if (matchesTab(tab)) {
				tab.fullPath = fullPath;
				tab.props = resolved.props;
				tab.hideLoading = isUserOverviewRoute(resolved);
				break;
			}
		}
		tabs.value = newTabs;
		return;
	}

	tabs.value = tabs.value.length >= prefer.s.numberOfPageCache ? [
		...tabs.value.slice(1),
		{
			id: nextTabId++,
			fullPath: fullPath,
			routePath,
			viewKey,
			hideLoading: isUserOverviewRoute(resolved),
			component: resolved.route.component,
			props: resolved.props,
		},
	] : [...tabs.value, {
		id: nextTabId++,
		fullPath: fullPath,
		routePath,
		viewKey,
		hideLoading: isUserOverviewRoute(resolved),
		component: resolved.route.component,
		props: resolved.props,
	}];
});

router.useListener('replace', ({ fullPath }) => {
	const currentTab = tabs.value[tabs.value.length - 1];
	currentTab.fullPath = fullPath;
	tabs.value = [...tabs.value.slice(0, tabs.value.length - 1), currentTab];
});
</script>

<style lang="scss" module>
.transition_x_move,
.transition_x_enterActive,
.transition_x_leaveActive {
	.tabBg {
		transition: opacity 0.2s cubic-bezier(0,.5,.5,1), transform 0.2s cubic-bezier(0,.5,.5,1) !important;
	}

	.tabFg {
		transition: opacity 0.2s cubic-bezier(0,.5,.5,1), transform 0.2s cubic-bezier(0,.5,.5,1) !important;
	}
}
.transition_x_enterFrom,
.transition_x_leaveTo {
	.tabBg {
		opacity: 0;
	}

	.tabFg {
		opacity: 0;
		transform: translateY(100px);
	}
}
.transition_x_leaveActive {
	.tabFg {
		//position: absolute;
	}
}

.tabs {
	position: relative;
	width: 100%;
	height: 100%;
}

.tab {
	overflow: clip;

	&:first-child {
		position: relative;
		width: 100%;
		height: 100%;

		.tabFg {
			position: relative;
			width: 100%;
			height: 100%;
		}
	}

	&:not(:first-child) {
		position: absolute;
		top: 0;
		left: 0;
		height: 100%;
		width: 100%;

		.tabBg {
			position: absolute;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			background: #0003;
			-webkit-backdrop-filter: var(--MI-blur, blur(3px));
			backdrop-filter: var(--MI-blur, blur(3px));
		}

		.tabFg {
			position: absolute;
			bottom: 0;
			left: 0;
			width: 100%;
			height: calc(100% - (10px + (20px * var(--i))));
			display: flex;
			flex-direction: column;
		}

		.tabContent {
			flex: 1;
		}
	}
}

.tabContent {
	position: relative;
	width: 100%;
	height: 100%;
	background: var(--MI_THEME-bg);
}

.tabMenu {
	position: relative;
	margin-left: auto;
	padding: 0 4px;
	background: var(--MI_THEME-panel);
}

.tabMenuShape {
	position: absolute;
	bottom: -1px;
	left: -100%;
	height: calc(100% + 1px);
	width: 129%;
	pointer-events: none;
}

.tabBorder {
	height: 6px;
	background: var(--MI_THEME-panel);
}

.tabMenuButton {
	padding: 8px;
	font-size: 13px;
}
</style>
