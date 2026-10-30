<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl" :class="$style.tabs" :data-current-page="currentPagePath">
<Transition
	v-for="tab in cachedTabs" :key="tab.id"
	:enterActiveClass="prefer.s.animation ? $style.transition_x_enterActive : ''"
	:leaveActiveClass="prefer.s.animation ? $style.transition_x_leaveActive : ''"
	:enterFromClass="prefer.s.animation ? $style.transition_x_enterFrom : ''"
	:leaveToClass="prefer.s.animation ? $style.transition_x_leaveTo : ''"
	:duration="200"
>
	<div v-show="tabIndex(tab) >= 0" :class="[$style.tab, { [$style.firstTab]: tabIndex(tab) === 0 }]" :style="{ '--i': tabIndex(tab) - 1 }" :data-route-active="isCurrent(tab) ? 'true' : 'false'">
		<div v-if="tabIndex(tab) > 0" :class="$style.tabBg" @click="back()"></div>
		<div :class="$style.tabFg" @click.stop="back()">
			<div v-if="tabIndex(tab) > 0" :class="$style.tabMenu">
				<svg :class="$style.tabMenuShape" viewBox="0 0 24 16">
					<g transform="matrix(2.04108e-17,-0.333333,0.222222,1.36072e-17,21.3333,15.9989)">
						<path d="M23.997,-42C47.903,-23.457 47.997,12 47.997,12L-0.003,12L-0.003,-96C-0.003,-96 0.091,-60.543 23.997,-42Z" style="fill:var(--MI_THEME-panel);"/>
					</g>
				</svg>
				<button :class="$style.tabMenuButton" class="_button _iconButton" :aria-label="i18n.ts.showInPage" @click.stop="mount"><i class="ti ti-rectangle"></i></button>
				<button :class="$style.tabMenuButton" class="_button _iconButton" :aria-label="i18n.ts.goBack" @click.stop="back"><i class="ti ti-x"></i></button>
			</div>
			<div v-if="tabIndex(tab) > 0" :class="$style.tabBorder"></div>
			<div :class="$style.tabContent" class="_pageContainer" :data-page-path="tab.fullPath" @click.stop="">
				<PageActivity :active="isCurrent(tab)">
					<Suspense :timeout="0">
						<RoutePage :router="router" :resolved="tab.resolved" :component="tab.component" :viewKey="tab.viewKey" :depth="currentDepth"/>

						<template #fallback>
							<MkLoading v-if="!tab.hideLoading" data-splash-gate/>
						</template>
					</Suspense>
				</PageActivity>
			</div>
		</div>
	</div>
</Transition>
</div>
</template>

<script lang="ts" setup>
import { computed, defineComponent, inject, provide, ref, shallowRef, useTemplateRef } from 'vue';
import type { Router } from '@/router.js';
import { prefer } from '@/preferences.js';
import MkLoadingPage from '@/pages/_loading_.vue';
import { DI } from '@/di.js';
import { isUserOverviewRoute } from '@/pages/user/context.js';
import { getRouteViewKey } from '@/lib/nirax.js';
import type { PathResolvedResult } from '@/lib/nirax.js';
import { RoutePage } from '@/composables/use-route-page.js';
import { useRouteScrollRestoration } from '@/composables/use-route-scroll-restoration.js';
import { i18n } from '@/i18n.js';

const PageActivity = defineComponent((props: { active: boolean }, { slots }) => {
	const parentActive = inject(DI.pageActive, null);
	provide(DI.pageActive, computed(() => props.active && (parentActive?.value ?? true)));
	return () => slots.default?.();
}, { props: ['active'] });

const props = defineProps<{
	router?: Router;
}>();

const providedRouter = props.router ?? inject(DI.router);

if (providedRouter == null) {
	throw new Error('no router provided');
}
const router = providedRouter;
provide(DI.router, router);
const rootEl = useTemplateRef('rootEl');
useRouteScrollRestoration(rootEl, router);

const currentDepth = inject(DI.routerCurrentDepth, 0);
provide(DI.routerCurrentDepth, currentDepth + 1);

let nextTabId = 0;
const stackStart = ref(router.navigationRef.value.entryId);
const currentPagePath = computed(() => router.currentRef.value._parsedRoute.fullPath);

function createTab(resolved: PathResolvedResult, entryId: string, id = nextTabId++) {
	return {
		id,
		fullPath: resolved._parsedRoute.fullPath,
		viewKey: getRouteViewKey(resolved, entryId),
		hideLoading: resolved.route.notFound === true || isUserOverviewRoute(resolved),
		component: 'component' in resolved.route ? resolved.route.component : MkLoadingPage,
		resolved,
	};
}

const cachedTabs = shallowRef([createTab(router.current, router.navigationRef.value.entryId)]);
type CachedTab = typeof cachedTabs.value[number];

const tabs = computed(() => {
	const history = router.historyRef.value;
	const index = router.historyIndexRef.value;
	const start = Math.min(index, Math.max(0, history.findIndex(entry => entry.entryId === stackStart.value)));
	const keys: string[] = [];
	for (const entry of history.slice(start, index + 1)) {
		const key = getRouteViewKey(entry.resolved, entry.entryId);
		const existing = keys.indexOf(key);
		if (existing !== -1) keys.splice(existing);
		keys.push(key);
	}
	return keys.flatMap(key => cachedTabs.value.filter(tab => tab.viewKey === key));
});

function tabIndex(tab: CachedTab) {
	return tabs.value.findIndex(current => current.id === tab.id);
}

function isCurrent(tab: CachedTab) {
	return tabs.value.at(-1)?.id === tab.id;
}

function mount() {
	stackStart.value = router.navigationRef.value.entryId;
}

function back() {
	if (tabs.value.length <= 1) return; // transitionの関係でタブが1つの状態でbackが呼ばれることがある
	router.back();
}

router.useListener('change', ({ resolved, navigation }) => {
	if (resolved == null || 'redirect' in resolved.route) return;
	const viewKey = getRouteViewKey(resolved, navigation.entryId);
	const currentTab = cachedTabs.value.find(tab => tab.viewKey === viewKey);
	const reachable = new Set(router.historyRef.value.map(entry => getRouteViewKey(entry.resolved, entry.entryId)));
	// 显示栈与缓存分开，后退隐藏的页面仍可前进；新 push 的分支和容量上限才清理缓存。
	cachedTabs.value = [
		...cachedTabs.value.filter(tab => tab.viewKey !== viewKey && (navigation.type === 'traverse' || reachable.has(tab.viewKey))),
		createTab(resolved, navigation.entryId, currentTab?.id),
	].slice(-Math.max(1, prefer.s.numberOfPageCache));
});
</script>

<style lang="scss" module>
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

	&.firstTab {
		position: relative;
		width: 100%;
		height: 100%;

		.tabFg {
			position: relative;
			width: 100%;
			height: 100%;
		}
	}

	&:not(.firstTab) {
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
