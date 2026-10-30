<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<KeepAlive :max="prefer.s.numberOfPageCache">
	<Suspense :timeout="0">
		<RoutePage :key="key" :router="router" :resolved="currentPage" :component="currentPageComponent" :viewKey="key" :depth="currentDepth"/>

		<template #fallback>
			<MkLoading v-if="!hideLoading" data-splash-gate/>
		</template>
	</Suspense>
</KeepAlive>
</template>

<script lang="ts" setup>
import { inject, provide, ref, shallowRef } from 'vue';
import type { Router } from '@/router.js';
import type { PathResolvedResult } from '@/lib/nirax.js';
import MkLoadingPage from '@/pages/_loading_.vue';
import { DI } from '@/di.js';
import { deepEqual } from '@/utility/deep-equal.js';
import { getRouteViewKey } from '@/lib/nirax.js';
import { prefer } from '@/preferences.js';
import { RoutePage } from '@/composables/use-route-page.js';

const props = defineProps<{
	router?: Router;
	initialRoute?: PathResolvedResult;
	hideLoading?: boolean;
}>();

const router = props.router ?? inject(DI.router);

if (router == null) {
	throw new Error('no router provided');
}

const currentDepth = inject(DI.routerCurrentDepth, 0);
provide(DI.routerCurrentDepth, currentDepth + 1);

// Cached layouts must only follow navigation within their own parent routes.
const ownerRoute = props.initialRoute ?? router.current;
const parentRoutes: PathResolvedResult[] = [];
for (let parent: PathResolvedResult | undefined = ownerRoute; parentRoutes.length < currentDepth && parent != null; parent = parent.child) {
	parentRoutes.push(parent);
}

function resolveNested(current: PathResolvedResult, d = 0): PathResolvedResult | null {
	if (d === currentDepth) {
		return current;
	} else {
		const parent = parentRoutes[d];
		if (current.child && parent != null && current.route.path === parent.route.path && deepEqual(current.props, parent.props)) {
			return resolveNested(current.child, d + 1);
		} else {
			return null;
		}
	}
}

const current = resolveNested(router.current) ?? resolveNested(ownerRoute)!;
const currentPageComponent = shallowRef('component' in current.route ? current.route.component : props.hideLoading ? 'div' : MkLoadingPage);
const currentPageProps = ref(current.props);
const currentPage = shallowRef(current);
let currentRoutePath = current.route.path;
const key = ref(getRouteViewKey(current, router.navigationRef.value.entryId));

router.useListener('change', ({ resolved }) => {
	const current = resolveNested(resolved);
	if (current == null || 'redirect' in current.route) return;
	if (current.route.path === currentRoutePath && deepEqual(current.props, currentPageProps.value) && getRouteViewKey(current, router.navigationRef.value.entryId) === key.value) return;
	currentPageComponent.value = current.route.component;
	currentPageProps.value = current.props;
	currentPage.value = current;
	currentRoutePath = current.route.path;
	key.value = getRouteViewKey(current, router.navigationRef.value.entryId);
});
</script>
