<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl" class="_pageContainer" :class="$style.root">
	<KeepAlive :max="prefer.s.numberOfPageCache">
		<Suspense :timeout="0">
			<RoutePage :key="key" :router="router" :resolved="currentPage" :component="currentPageComponent" :viewKey="key" :depth="currentDepth"/>

			<template #fallback>
				<MkLoading v-if="!hideLoading" data-splash-gate/>
			</template>
		</Suspense>
	</KeepAlive>
</div>
</template>

<script lang="ts" setup>
import { computed, inject, provide, ref, shallowRef, useTemplateRef } from 'vue';
import type { Router } from '@/router.js';
import { prefer } from '@/preferences.js';
import MkLoadingPage from '@/pages/_loading_.vue';
import { DI } from '@/di.js';
import { randomId } from '@/utility/random-id.js';
import { deepEqual } from '@/utility/deep-equal.js';
import { isUserOverviewRoute } from '@/pages/user/context.js';
import { getRouteViewKey } from '@/lib/nirax.js';
import { RoutePage } from '@/composables/use-route-page.js';
import { useRouteScrollRestoration } from '@/composables/use-route-scroll-restoration.js';

const props = defineProps<{
	router?: Router;
}>();

const _router = props.router ?? inject(DI.router);

if (_router == null) {
	throw new Error('no router provided');
}

const router = _router;
provide(DI.router, router);
const rootEl = useTemplateRef('rootEl');
useRouteScrollRestoration(rootEl, router);

const viewId = randomId();
provide(DI.viewId, viewId);

const currentDepth = inject(DI.routerCurrentDepth, 0);
provide(DI.routerCurrentDepth, currentDepth + 1);

const current = router.current;
const hideLoading = computed(() => router.currentRef.value.route.notFound === true || router.currentRef.value.route.name === 'chat' || isUserOverviewRoute(router.currentRef.value));
const currentPageComponent = shallowRef('component' in current.route ? current.route.component : MkLoadingPage);
const currentPageProps = ref(current.props);
const currentPage = shallowRef(current);
let currentRoutePath = current.route.path;
const key = ref(getRouteViewKey(current, router.navigationRef.value.entryId));

router.useListener('change', ({ resolved }) => {
	if (resolved == null || 'redirect' in resolved.route) return;
	if (resolved.route.path === currentRoutePath && deepEqual(resolved.props, currentPageProps.value) && getRouteViewKey(resolved, router.navigationRef.value.entryId) === key.value) return;

	currentPageComponent.value = resolved.route.component;
	currentPage.value = resolved;
	currentPageProps.value = resolved.props;
	key.value = getRouteViewKey(resolved, router.navigationRef.value.entryId);
	currentRoutePath = resolved.route.path;
});
</script>

<style lang="scss" module>
.root {
	height: 100%;
	background-color: var(--MI_THEME-bg);

	// FIXME: Safari 26 で contain: layout を指定するとバグるので、hotfixとして _pageContainer の content: strict を上書き
	// https://github.com/misskey-dev/misskey/issues/16204#issuecomment-3265404776
	// https://bugs.webkit.org/show_bug.cgi?id=297186
	contain: size style paint !important;
}
</style>
