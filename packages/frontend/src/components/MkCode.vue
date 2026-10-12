<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.codeBlockRoot, { [$style.outerStyle]: withOuterStyle }]" data-note-interactive>
	<div :class="$style.codeBlockHeader">
		<span :class="$style.codeBlockDots" aria-hidden="true"><span></span><span></span><span></span></span>
		<div :class="$style.codeBlockActions">
			<span v-if="lang" :class="$style.codeBlockLanguage">{{ lang }}</span>
			<button v-if="copyButton" type="button" :class="$style.codeBlockAction" class="_button" :aria-label="copied ? i18n.ts._share.copied : i18n.ts.copy" @click="copy">
				{{ copied ? i18n.ts._share.copied : i18n.ts.copy }}
			</button>
		</div>
	</div>
	<div :class="$style.codeBlockBody">
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
import { defineAsyncComponent, onBeforeUnmount, ref } from 'vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';

const props = withDefaults(defineProps<{
	code: string;
	copyButton?: boolean;
	withOuterStyle?: boolean;
	lang?: string;
}>(), {
	copyButton: true,
	withOuterStyle: true,
});

const copied = ref(false);
let copyTimer: number | undefined;
onBeforeUnmount(() => window.clearTimeout(copyTimer));

const XCode = defineAsyncComponent(() => import('@/components/MkCode.core.vue'));

async function copy() {
	try {
		await navigator.clipboard.writeText(props.code);
		copied.value = true;
		window.clearTimeout(copyTimer);
		copyTimer = window.setTimeout(() => { copied.value = false; }, 1500);
	} catch {
		os.toast(i18n.ts.somethingHappened, 'error');
	}
}
</script>

<style module lang="scss">
.codeBlockRoot {
	min-width: 0;
	cursor: default;
	border-radius: 8px;
	overflow: clip;
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
	gap: 4px;
	font-size: 13px;
}

.codeBlockLanguage {
	// 与右侧复制按钮拉开固定间距，复制状态的宽度变化不会挤动语言文字。
	min-width: 0;
	margin-right: 12px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.codeBlockActions > .codeBlockAction {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	min-width: 4em;
	padding: 0 4px;
	height: 28px;
	font-size: inherit;
	font-weight: normal;
	border-radius: 4px;
}

.codeBlockBody {
	box-sizing: border-box;
	padding: 12px 16px;
	overflow: clip;
}

.outerStyle .codeBlockBody {
	background: color-mix(in srgb, var(--MI_THEME-codeBlockBg), black 18%);
}

.codeBlockViewport {
	// 高度由内容撑开，保留长行原样，超出宽度的部分由外层裁切。
	overflow: visible;
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

	&:focus-visible {
		outline: 2px solid currentColor;
		outline-offset: -3px;
	}
}

.codeBlockFallbackRoot {
	display: block;
	white-space: pre;
	overflow-wrap: anywhere;
	min-width: max-content;
	overflow: visible;
	font-family: Consolas, Monaco, Andale Mono, Ubuntu Mono, monospace;
}

.codeBlockFallbackCode {
	font-family: Consolas, Monaco, Andale Mono, Ubuntu Mono, monospace;
}
</style>
