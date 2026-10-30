<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<component
	:is="self ? 'MkA' : 'a'" ref="el" :class="$style.root" class="_link" :[attr]="maybeRelativeUrl" :rel="rel ?? 'nofollow noopener'" :target="target"
	:behavior="props.navigationBehavior"
	@click="confirmExternalLink"
	@auxclick="confirmExternalLink"
>
	<template v-if="!self">
		<span :class="$style.schema">{{ schema }}//</span>
		<span :class="$style.hostname">{{ hostname }}</span>
		<span v-if="port != ''" :class="$style.hostname">:{{ port }}</span>
	</template>
	<template v-if="pathname === '/' && self">
		<span :class="$style.self">{{ hostname }}</span>
	</template>
	<span v-if="pathname != ''">{{ self ? pathname.substring(1) : pathname }}</span>
	<span :class="$style.query">{{ query }}</span>
	<span :class="$style.hash">{{ hash }}</span>
	<i v-if="target === '_blank'" :class="$style.icon" class="ti ti-external-link" aria-hidden="true"></i>
</component>
</template>

<script lang="ts" setup>
import { defineAsyncComponent, ref } from 'vue';
import { url as local } from '@@/js/config.js';
import { maybeMakeRelative, parseUrlForDisplay } from '@@/js/url.js';
import type { MkABehavior } from '@/components/global/MkA.vue';
import * as os from '@/os.js';
import { useTooltip } from '@/composables/use-tooltip.js';
import { isEnabledUrlPreview } from '@/utility/url-preview.js';
import { confirmExternalLink } from '@/utility/external-link.js';

const props = withDefaults(defineProps<{
	url: string;
	rel?: string;
	showUrlPreview?: boolean;
	navigationBehavior?: MkABehavior;
}>(), {
	showUrlPreview: true,
});

const maybeRelativeUrl = maybeMakeRelative(props.url, local);
const self = maybeRelativeUrl !== props.url;
const { schema, hostname, port, pathname, query, hash } = parseUrlForDisplay(props.url);
const el = ref();

if (props.showUrlPreview && isEnabledUrlPreview.value) {
	useTooltip(el, (showing, pointerPosition) => {
		const anchorElement = el.value instanceof HTMLElement ? el.value : el.value?.$el;
		if (anchorElement == null) return;
		const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkUrlPreviewPopup.vue')), {
			showing,
			url: props.url,
			anchorElement,
			pointerPosition,
		}, {
			closed: () => dispose(),
		});
	});
}

const attr = self ? 'to' : 'href';
const target = self ? null : '_blank';
</script>

<style lang="scss" module>
.root {
	word-break: break-all;
	// 正文网址整体弱化，只保留域名的链接色用于区分。
	color: color-mix(in srgb, var(--MI_THEME-link) 45%, var(--MI_THEME-fgTransparentWeak));
}

.icon {
	padding-left: 2px;
	font-size: .9em;
}

.self {
	color: var(--MI_THEME-link);
}

.schema {
	color: color-mix(in srgb, var(--MI_THEME-link) 30%, var(--MI_THEME-fgTransparentWeak));
}

.hostname {
	color: var(--MI_THEME-link);
}

.query {
	color: color-mix(in srgb, var(--MI_THEME-link) 30%, var(--MI_THEME-fgTransparentWeak));
}

.hash {
	color: color-mix(in srgb, var(--MI_THEME-link) 30%, var(--MI_THEME-fgTransparentWeak));
	font-style: italic;
}
</style>
