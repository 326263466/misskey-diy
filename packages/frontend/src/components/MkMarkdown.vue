<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MdPreview
	:id="previewId"
	:class="$style.root"
	:modelValue="text"
	:theme="store.s.darkMode ? 'dark' : 'light'"
	:sanitize="sanitizeMarkdown"
	:mdHeadingId="headingId"
	noHighlight noKatex noMermaid noEcharts
	@onGetCatalog="updateCatalog"
	@click="confirmExternalLink"
	@auxclick="confirmExternalLink"
/>
</template>

<script lang="ts">
export type MarkdownHeading = { id: string; text: string; level: number };
</script>

<script lang="ts" setup>
import { computed, useId } from 'vue';
import { MdPreview } from 'md-editor-v3';
import type { HeadList } from 'md-editor-v3';
import 'md-editor-v3/lib/preview.css';
import { store } from '@/store.js';
import { sanitizeMarkdown } from '@/utility/markdown.js';
import { confirmExternalLink } from '@/utility/external-link.js';

const props = defineProps<{ text: string; previewId?: string }>();
const emit = defineEmits<{ (ev: 'catalog', headings: MarkdownHeading[]): void }>();
const generatedId = useId();
const previewId = computed(() => props.previewId ?? generatedId);

function headingId({ index }: { index: number }): string {
	return `${previewId.value}-heading-${index}`;
}

function updateCatalog(headings: HeadList[]) {
	emit('catalog', headings.flatMap(heading => {
		const token = heading.currentToken;
		if (!token) return [];
		const id = token.attrGet('id');
		if (!id) return [];
		return [{ id, text: heading.text, level: Number(token.tag.slice(1)) || heading.level }];
	}));
}

</script>

<style lang="scss" module>
.root {
	--md-bk-color: var(--MI_THEME-panel);
	--md-color: var(--MI_THEME-fg);
	--md-theme-color: var(--MI_THEME-accent);
	min-width: 0;
	background: transparent;
	color: var(--MI_THEME-fg);
	overflow-wrap: anywhere;

	:global(.md-editor-preview) { padding: 0; }
	:global(.md-editor-preview > :first-child) { margin-top: 0; }
	:global(.md-editor-preview > :last-child) { margin-bottom: 0; }
	:global(img) { max-width: 100%; height: auto; }
	:global(pre) { max-width: 100%; overflow: clip; background: var(--MI_THEME-panelHighlight); }
	:global(.md-editor-preview .md-editor-code pre code) { max-height: none; overflow: clip; }
	:global(.md-editor-preview .md-editor-code pre code .md-editor-code-line-content) { white-space: pre; }
	:global(table) { display: block; max-width: 100%; overflow: auto; }
	:global(blockquote) { background: var(--MI_THEME-panelHighlight); }
}
</style>
