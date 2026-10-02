<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<Suspense :timeout="0">
	<component :is="currentPageComponent" :key="key" v-bind="Object.fromEntries(currentPageProps)"/>

	<template #fallback>
		<MkLoading/>
	</template>
</Suspense>
</template>

<script lang="ts" setup>
import { inject, provide, ref, shallowRef } from 'vue';
import type { Router } from '@/router.js';
import type { PathResolvedResult } from '@/lib/nirax.js';
import MkLoadingPage from '@/pages/_loading_.vue';
import { DI } from '@/di.js';
import { deepEqual } from '@/utility/deep-equal.js';

const props = defineProps<{
	router?: Router;
	initialRoute?: PathResolvedResult;
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
const currentPageComponent = shallowRef('component' in current.route ? current.route.component : MkLoadingPage);
const currentPageProps = ref(current.props);
const key = ref(current._parsedRoute.fullPath);

router.useListener('change', ({ resolved }) => {
	const current = resolveNested(resolved);
	if (current == null || 'redirect' in current.route) return;
	currentPageComponent.value = current.route.component;
	currentPageProps.value = current.props;
	key.value = router.getCurrentFullPath();
});
</script>
