<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.codeBlockRoot, { [$style.outerStyle]: withOuterStyle }]" data-note-interactive>
	<div :class="$style.codeBlockHeader">
		<span :class="$style.codeBlockDots" aria-hidden="true"><span></span><span></span><span></span></span>
		<div :class="$style.codeBlockActions">
			<span :class="$style.codeBlockLanguage">{{ lang || i18n.ts.code }}</span>
			<button v-if="copyButton" type="button" :class="$style.codeBlockAction" class="_button" :title="copyFailed ? i18n.ts.error : copied ? i18n.ts._share.copied : i18n.ts.copy" :aria-label="copyFailed ? i18n.ts.retry : copied ? i18n.ts._share.copied : i18n.ts.copy" @click="copy">
				<span aria-live="polite">{{ copied ? i18n.ts._share.copied : copyFailed ? i18n.ts.retry : i18n.ts.copy }}</span>
			</button>
			<button type="button" class="_button" :class="$style.codeBlockToggle" :aria-expanded="expanded" :aria-controls="bodyId" :aria-label="expanded ? i18n.ts.showLess : i18n.ts.clickToShow" :title="expanded ? i18n.ts.showLess : i18n.ts.clickToShow" @click="expanded = !expanded">
				<i :class="expanded ? 'ti ti-circle-chevron-down' : 'ti ti-circle-chevron-left'" aria-hidden="true"></i>
			</button>
		</div>
	</div>
	<div :id="bodyId" :class="[$style.codeBlockBody, { [$style.collapsed]: !expanded }]" :inert="!expanded" :aria-hidden="!expanded">
		<div :class="$style.codeBlockViewport" tabindex="0" :aria-label="i18n.ts.code">
			<Suspense>
				<template #fallback>
					<pre
						tabindex="0"
						class="_selectable"
						:class="$style.codeBlockFallbackRoot"
					><code :class="$style.codeBlockFallbackCode">{{ code }}</code></pre>
				</template>
				<XCode
					v-if="lang"
					class="_selectable"
					:code="code"
					:lang="lang"
					:withOuterStyle="false"
					:forceDark="withOuterStyle"
				/>
				<pre
					v-else
					tabindex="0"
					class="_selectable"
					:class="$style.codeBlockFallbackRoot"
				><code :class="$style.codeBlockFallbackCode">{{ code }}</code></pre>
			</Suspense>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { defineAsyncComponent, onBeforeUnmount, ref, useId, watch } from 'vue';
import { i18n } from '@/i18n.js';

const props = withDefaults(defineProps<{
	code: string;
	forceShow?: boolean;
	copyButton?: boolean;
	withOuterStyle?: boolean;
	lang?: string;
}>(), {
	copyButton: true,
	forceShow: true,
	withOuterStyle: true,
});

const expanded = ref(props.forceShow);
const bodyId = useId();
const copied = ref(false);
const copyFailed = ref(false);
let copyRequestId = 0;
let copiedTimeout: ReturnType<typeof window.setTimeout> | null = null;

function resetCopyFeedback() {
	copyRequestId++;
	if (copiedTimeout !== null) window.clearTimeout(copiedTimeout);
	copiedTimeout = null;
	copied.value = false;
	copyFailed.value = false;
}

watch(() => props.code, resetCopyFeedback);
onBeforeUnmount(resetCopyFeedback);

const XCode = defineAsyncComponent(() => import('@/components/MkCode.core.vue'));

async function copy() {
	const requestId = ++copyRequestId;
	try {
		await navigator.clipboard.writeText(props.code);
		if (requestId !== copyRequestId) return;
		copied.value = true;
		copyFailed.value = false;
		if (copiedTimeout !== null) window.clearTimeout(copiedTimeout);
		copiedTimeout = window.setTimeout(() => {
			copied.value = false;
			copiedTimeout = null;
		}, 3000);
	} catch {
		if (requestId !== copyRequestId) return;
		resetCopyFeedback();
		copyFailed.value = true;
	}
}
</script>

<style module lang="scss">
.codeBlockRoot {
	min-width: 0;
	cursor: default;
	border-radius: 8px;
	overflow: hidden;
}

.outerStyle {
	color: var(--MI_THEME-codeBlockFg);
	background: var(--MI_THEME-codeBlockBg);
}

.codeBlockHeader {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 0 12px;
	height: 40px;
	box-sizing: border-box;
}

.codeBlockActions > .codeBlockToggle {
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	width: 28px;
	height: 28px;
	font-size: inherit;
	font-weight: normal;
	border-radius: 4px;

	&:hover {
		background: color-mix(in srgb, currentColor 6%, transparent);
	}

	&:focus-visible {
		outline: 2px solid currentColor;
		outline-offset: -3px;
	}
}

.codeBlockDots {
	display: flex;
	flex-shrink: 0;
	gap: 5px;

	> span {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--MI_THEME-error);
	}

	> span:nth-child(2) { background: var(--MI_THEME-warn); }
	> span:nth-child(3) { background: var(--MI_THEME-success); }
}

.codeBlockActions {
	min-width: 0;
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 13px;
}

.codeBlockLanguage {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.codeBlockActions > .codeBlockAction {
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	height: 28px;
	padding: 0 4px;
	border-radius: 4px;
	white-space: nowrap;

	&:hover, &:focus-visible {
		background: color-mix(in srgb, currentColor 12%, transparent);
	}
}

.codeBlockBody {
	padding: 12px 16px;

	&.collapsed {
		// 保留代码的固有宽度，避免按内容收缩的卡片在折叠后变窄。
		height: 0;
		padding-block: 0;
		overflow: hidden;
		visibility: hidden;
	}
}

.outerStyle .codeBlockBody {
	--MI_THEME-scrollbarHandle: color-mix(in srgb, var(--MI_THEME-codeBlockFg) 45%, transparent);
	--MI_THEME-scrollbarHandleHover: color-mix(in srgb, var(--MI_THEME-codeBlockFg) 65%, transparent);
	background: color-mix(in srgb, var(--MI_THEME-codeBlockBg), black 18%);
}

.codeBlockViewport {
	max-height: 7.5em;
	overflow-y: auto;
	// 长行在块内横向滚动，而不是被裁掉看不到
	overflow-x: auto;
	font-family: Consolas, Monaco, Andale Mono, Ubuntu Mono, monospace;
	line-height: 1.5;

	&:focus-visible {
		outline: 2px solid currentColor;
		outline-offset: -3px;
	}
}

.codeBlockBody pre {
	padding: 0;
	margin: 0;
	font-size: inherit;
	line-height: inherit;
	scrollbar-width: none;

	&::-webkit-scrollbar {
		display: none;
	}

	&:focus-visible {
		outline: 2px solid currentColor;
		outline-offset: -3px;
	}
}

.codeBlockFallbackRoot {
	display: block;
	white-space: pre;
	overflow-wrap: anywhere;
	overflow: auto;
	font-family: Consolas, Monaco, Andale Mono, Ubuntu Mono, monospace;
}

.codeBlockFallbackCode {
	font-family: Consolas, Monaco, Andale Mono, Ubuntu Mono, monospace;
}
</style>
