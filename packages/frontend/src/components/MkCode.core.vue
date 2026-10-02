<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<!-- eslint-disable vue/no-v-html -->
<template>
<div
	:class="[$style.codeBlockRoot, {
		[$style.codeEditor]: codeEditor,
		[$style.outerStyle]: !codeEditor && withOuterStyle,
		[$style.dark]: darkMode,
		[$style.light]: !darkMode,
	}]" v-html="html"></div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { getHighlighter, getTheme, loadCodeLanguage } from '@/utility/code-highlighter.js';
import { store } from '@/store.js';

const props = withDefaults(defineProps<{
	code: string;
	lang?: string;
	codeEditor?: boolean;
	withOuterStyle?: boolean;
	forceDark?: boolean;
}>(), {
	codeEditor: false,
	withOuterStyle: true,
	forceDark: false,
});

const darkMode = computed(() => props.forceDark || store.r.darkMode.value);

const [highlighter, lightThemeName, darkThemeName, initialLanguage] = await Promise.all([
	getHighlighter(),
	getTheme('light', true),
	getTheme('dark', true),
	loadCodeLanguage(props.lang ?? 'js'),
]);
const codeLang = ref(initialLanguage);

const html = computed(() => highlighter.codeToHtml(props.code, {
	lang: codeLang.value,
	themes: {
		fallback: 'dark-plus',
		light: lightThemeName,
		dark: darkThemeName,
	},
	defaultColor: false,
	cssVariablePrefix: '--shiki-',
}));

watch(() => props.lang, async (to, _from, onCleanup) => {
	if (codeLang.value === to || !to) return;
	let cancelled = false;
	onCleanup(() => { cancelled = true; });
	const language = await loadCodeLanguage(to);
	if (!cancelled) codeLang.value = language;
}, { immediate: true });
</script>

<style module lang="scss">
.codeBlockRoot :global(.shiki) {
	overflow: auto;
	white-space: pre;
	overflow-wrap: anywhere;
	font-family: Consolas, Monaco, Andale Mono, Ubuntu Mono, monospace;

	color: var(--shiki-fallback);

	& span {
		color: var(--shiki-fallback);
	}

	& pre,
	& code {
		font-family: Consolas, Monaco, Andale Mono, Ubuntu Mono, monospace;
	}
}

.outerStyle.codeBlockRoot :global(.shiki) {
	padding: 1em;
	margin: 0;
	border-radius: 8px;
	border: 1px solid var(--MI_THEME-divider);
	background-color: var(--shiki-fallback-bg);
}

.light.codeBlockRoot :global(.shiki) {
	color: var(--shiki-light);

	& span {
		color: var(--shiki-light);
	}
}

.light.outerStyle.codeBlockRoot :global(.shiki),
.light.codeEditor.codeBlockRoot :global(.shiki) {
	background-color: var(--shiki-light-bg);
}

.dark.codeBlockRoot :global(.shiki) {
	color: var(--shiki-dark);

	& span {
		color: var(--shiki-dark);
	}
}

.dark.outerStyle.codeBlockRoot :global(.shiki),
.dark.codeEditor.codeBlockRoot :global(.shiki) {
	background-color: var(--shiki-dark-bg);
}

.codeBlockRoot.codeEditor {
	min-width: 100%;
	height: 100%;

	& :global(.shiki) {
		padding: 12px;
		margin: 0;
		border-radius: 6px;
		border: none;
		min-height: 130px;
		pointer-events: none;
		min-width: calc(100% - 24px);
		height: 100%;
		display: inline-block;
		line-height: 1.5em;
		font-size: 1em;
		overflow: visible;
		text-rendering: inherit;
    text-transform: inherit;
    white-space: pre;

		& span {
			display: inline-block;
			min-height: 1em;
		}
	}
}
</style>
