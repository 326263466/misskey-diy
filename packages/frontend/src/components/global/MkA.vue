<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<a ref="el" :href="to" :class="[$style.root, active ? activeClass : null]" :aria-current="active ? 'page' : undefined" @click="nav" @contextmenu.prevent.stop="onContextmenu">
	<slot></slot>
</a>
</template>

<script lang="ts">
import { url } from '@@/js/config.js';
import * as os from '@/os.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { i18n } from '@/i18n.js';
import { deviceKind } from '@/utility/device-kind.js';
import type { Router } from '@/router.js';
import type { MenuItem } from '@/types/menu.js';

export type MkABehavior = 'window' | 'browser' | null;

export function getLinkMenu(to: string, router: Router, options?: { plainCanvas?: boolean }): MenuItem[] {
	const items: MenuItem[] = [{
		type: 'label',
		text: to,
	}];
	if (deviceKind !== 'smartphone' && window.innerWidth > 500) items.push({
		icon: 'ti ti-app-window',
		text: i18n.ts.openInWindow,
		action: () => {
			os.pageWindow(to, options);
		},
	}, {
		icon: 'ti ti-player-eject',
		text: i18n.ts.showInPage,
		action: () => {
			router.pushByPath(to, 'forcePage');
		},
	});
	items.push({ type: 'divider' }, {
		icon: 'ti ti-external-link',
		text: i18n.ts.openInNewTab,
		action: () => {
			window.open(to, '_blank', 'noopener');
		},
	}, {
		icon: 'ti ti-link',
		text: i18n.ts.copyLink,
		action: () => {
			copyToClipboard(`${url}${to}`);
		},
	});
	return items;
}
</script>

<style lang="scss" module>
// 用户名链接悬停时不加下划线。
.root:has(> :global(._userName)):hover {
	text-decoration: none !important;
}
</style>

<script lang="ts" setup>
import { computed, inject, useTemplateRef } from 'vue';
import { useRouter } from '@/router.js';

const props = withDefaults(defineProps<{
	to: string;
	activeClass?: null | string;
	exact?: boolean;
	behavior?: MkABehavior;
}>(), {
	activeClass: null,
	exact: false,
	behavior: null,
});

const behavior = props.behavior ?? inject<MkABehavior>('linkNavigationBehavior', null);
const isWindow = inject<boolean>('inWindow', false);
const plainCanvas = inject('pagePlainCanvas', false);

const el = useTemplateRef('el');

defineExpose({ $el: el });

const router = useRouter();

const active = computed(() => {
	if (props.activeClass == null) return false;
	const targetPath = props.to.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
	const currentPath = router.currentRef.value._parsedRoute.fullPath.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
	// 同一父路由下的菜单必须区分实际地址，不能按路由名称一起选中。
	return currentPath === targetPath || (!props.exact && targetPath !== '/' && currentPath.startsWith(`${targetPath}/`));
});

function onContextmenu(ev: PointerEvent) {
	const selection = window.getSelection();
	if (selection && selection.toString() !== '') return;
	os.contextMenu(getLinkMenu(props.to, router, { plainCanvas: plainCanvas || undefined }), ev);
}

function openWindow() {
	os.pageWindow(props.to, { plainCanvas: plainCanvas || undefined });
}

function nav(ev: PointerEvent) {
	// 制御キーとの組み合わせは無視（shiftを除く）
	if (ev.metaKey || ev.altKey || ev.ctrlKey) return;

	ev.preventDefault();

	if (behavior === 'browser') {
		if (isWindow) {
			window.open(props.to, '_blank', 'noopener');
		} else {
			window.location.href = props.to;
		}
		return;
	}

	if ((behavior === 'window' || ev.shiftKey) && deviceKind !== 'smartphone' && window.innerWidth > 500) {
		return openWindow();
	}

	router.pushByPath(props.to, ev.ctrlKey ? 'forcePage' : null);
}
</script>
