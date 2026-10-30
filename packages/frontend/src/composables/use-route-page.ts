/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, defineComponent, h, inject, onActivated, onDeactivated, provide, ref } from 'vue';
import type { Component } from 'vue';
import type { Router } from '@/router.js';
import type { PathResolvedResult } from '@/lib/nirax.js';
import { getRouteViewKey } from '@/lib/nirax.js';
import { DI } from '@/di.js';

export const RoutePage = defineComponent((props: {
	router: Router;
	resolved: PathResolvedResult;
	component: Component | string;
	viewKey: string;
	depth: number;
}) => {
	const parentActive = inject(DI.pageActive, ref(true));
	const activated = ref(true);
	const createdNavigation = props.router.navigationRef.value;
	const active = computed(() => {
		if (!parentActive.value || !activated.value) return false;
		let current: PathResolvedResult | undefined = props.router.currentRef.value;
		for (let depth = 0; depth < props.depth; depth++) current = current?.child;
		return current != null && current.route.path === props.resolved.route.path && getRouteViewKey(current, props.router.navigationRef.value.entryId) === props.viewKey;
	});
	provide(DI.pageActive, active);
	provide(DI.pageHistoryRestoring, computed(() => active.value && props.router.navigationRef.value.type === 'traverse'
		&& props.router.navigationRef.value !== createdNavigation));
	onActivated(() => { activated.value = true; });
	onDeactivated(() => { activated.value = false; });
	return () => h('div', { 'data-route-active': active.value ? 'true' : 'false', style: { display: 'contents' } }, [
		h(props.component, Object.fromEntries(props.resolved.props)),
	]);
}, { name: 'RoutePage', props: ['router', 'resolved', 'component', 'viewKey', 'depth'] });
