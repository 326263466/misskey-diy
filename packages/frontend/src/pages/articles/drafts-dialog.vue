<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal ref="dialogEl" v-slot="{ type }" :preferType="deviceKind === 'smartphone' ? 'drawer' : 'dialog'" :closeOnBackdrop="!busy" @click="requestClose" @esc="requestClose" @closed="emit('closed')">
	<section data-popup-boundary :class="[$style.dialog, { [$style.drawer]: type === 'drawer' }]" role="dialog" aria-modal="true" :aria-labelledby="`${id}-title`" :aria-busy="busy">
		<header :class="$style.header">
			<h2 :id="`${id}-title`" :class="$style.dialogTitle"><i class="ti ti-notes" aria-hidden="true"></i> {{ i18n.ts._article.drafts }}</h2>
			<button type="button" class="_button" :class="$style.closeButton" :disabled="busy" :aria-label="i18n.ts.close" @click="requestClose"><i class="ti ti-x" aria-hidden="true"></i></button>
		</header>
		<div :class="$style.body">
			<p :class="$style.info">{{ i18n.ts._article.draftStrategy }}</p>
			<div :class="$style.tabs" role="tablist" :aria-label="i18n.ts._article.drafts">
				<button :id="`${id}-local-tab`" type="button" class="_button" :class="[$style.tab, { [$style.activeTab]: tab === 'local' }]" role="tab" :aria-selected="tab === 'local'" :aria-controls="`${id}-local-panel`" :tabindex="tab === 'local' ? 0 : -1" :disabled="busy" @click="tab = 'local'" @keydown="changeTab">{{ i18n.ts._article.localDrafts }}</button>
				<button :id="`${id}-cloud-tab`" type="button" class="_button" :class="[$style.tab, { [$style.activeTab]: tab === 'cloud' }]" role="tab" :aria-selected="tab === 'cloud'" :aria-controls="`${id}-cloud-panel`" :tabindex="tab === 'cloud' ? 0 : -1" :disabled="busy" @click="tab = 'cloud'" @keydown="changeTab">{{ i18n.ts._article.cloudDrafts }}</button>
			</div>
			<section v-show="tab === 'local'" :id="`${id}-local-panel`" role="tabpanel" :aria-labelledby="`${id}-local-tab`" tabindex="0">
				<p :class="$style.info">{{ i18n.ts._article.localDraftsInfo }}</p>
				<p v-if="drafts.length === 0" :class="$style.empty">{{ i18n.ts._article.noDrafts }}</p>
				<ul v-else :class="$style.list">
					<li v-for="entry in drafts" :key="entry.key" :class="$style.draft">
						<div :class="$style.heading">
							<h3 :class="$style.title">{{ entry.draft.title.trim() || i18n.ts._article.untitledDraft }}</h3>
							<span v-if="entry.key === currentKey" :class="$style.current">{{ i18n.ts._article.draftInUse }}</span>
						</div>
						<p v-if="entry.draft.text.trim()" :class="$style.preview">{{ preview(entry.draft.text) }}</p>
						<div :class="$style.meta">
							<MkTime v-if="hasValidTime(entry.draft.updatedAt)" :key="entry.draft.updatedAt" :time="entry.draft.updatedAt" mode="detail"/>
							<span v-if="entry.draft.articleId">{{ i18n.ts._article.editingPublishedDraft }}</span>
						</div>
						<div :class="$style.actions">
							<MkButton small :disabled="busy || entry.key === currentKey" @click="emit('restore', entry)">{{ i18n.ts._drafts.restore }}</MkButton>
							<MkButton small danger :disabled="busy || entry.key === currentKey" @click="emit('delete', entry)">{{ i18n.ts.delete }}</MkButton>
						</div>
					</li>
				</ul>
			</section>
			<section v-show="tab === 'cloud'" :id="`${id}-cloud-panel`" role="tabpanel" :aria-labelledby="`${id}-cloud-tab`" :aria-busy="cloudLoading" tabindex="0">
				<div :class="$style.cloudActions">
					<MkButton small :disabled="busy || cloudLoading" @click="emit('reloadCloud')"><i class="ti ti-refresh" aria-hidden="true"></i> {{ i18n.ts.reload }}</MkButton>
				</div>
				<p v-if="cloudLoading" :class="$style.empty" role="status">{{ i18n.ts.loading }}</p>
				<div v-else-if="cloudFailed" :class="$style.failure" role="alert">
					<p>{{ i18n.ts._article.cloudDraftsFailed }}</p>
					<MkButton small :disabled="busy" @click="emit('reloadCloud')">{{ i18n.ts.retry }}</MkButton>
				</div>
				<p v-else-if="cloudDrafts.length === 0" :class="$style.empty">{{ i18n.ts._article.noDrafts }}</p>
				<ul v-else :class="$style.list">
					<li v-for="draft in cloudDrafts" :key="draft.id" :class="$style.draft">
						<h3 :class="$style.title">{{ draft.title.trim() || i18n.ts._article.untitledDraft }}</h3>
						<p v-if="draft.summary.trim() || draft.text.trim()" :class="$style.preview">{{ preview(draft.summary || draft.text) }}</p>
						<div :class="$style.meta">
							<MkTime v-if="hasValidTime(draft.updatedAt)" :key="draft.updatedAt" :time="draft.updatedAt" mode="detail"/>
							<span v-if="draft.articleId">{{ i18n.ts._article.editingPublishedDraft }}</span>
						</div>
						<div :class="$style.actions">
							<MkButton small :disabled="busy" @click="emit('restoreCloud', draft)">{{ i18n.ts._drafts.restore }}</MkButton>
							<MkButton small danger :disabled="busy" @click="emit('deleteCloud', draft)">{{ i18n.ts.delete }}</MkButton>
						</div>
					</li>
				</ul>
			</section>
		</div>
		<footer :class="$style.footer">
			<MkButton primary :disabled="busy" @click="emit('create')"><i class="ti ti-plus" aria-hidden="true"></i> {{ i18n.ts._article.newDraft }}</MkButton>
		</footer>
	</section>
</MkModal>
</template>

<script lang="ts" setup>
import { nextTick, ref, useId, useTemplateRef } from 'vue';
import type { entities } from 'misskey-js';
import type { StoredArticleDraft } from '@/utility/article-drafts.js';
import MkModal from '@/components/MkModal.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { deviceKind } from '@/utility/device-kind.js';

const props = defineProps<{
	drafts: StoredArticleDraft[];
	cloudDrafts: entities.ArticlesDraftsShowResponse[];
	cloudLoading: boolean;
	cloudFailed: boolean;
	currentKey?: string;
	busy?: boolean;
}>();

const emit = defineEmits<{
	(ev: 'closed'): void;
	(ev: 'restore', draft: StoredArticleDraft): void;
	(ev: 'delete', draft: StoredArticleDraft): void;
	(ev: 'create'): void;
	(ev: 'restoreCloud', draft: entities.ArticlesDraftsShowResponse): void;
	(ev: 'deleteCloud', draft: entities.ArticlesDraftsShowResponse): void;
	(ev: 'reloadCloud'): void;
}>();

const dialogEl = useTemplateRef('dialogEl');
const id = useId();
const tab = ref<'local' | 'cloud'>('local');

async function changeTab(event: KeyboardEvent) {
	if (props.busy || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
	event.preventDefault();
	tab.value = event.key === 'Home' ? 'local' : event.key === 'End' ? 'cloud' : tab.value === 'local' ? 'cloud' : 'local';
	await nextTick();
	window.document.getElementById(`${id}-${tab.value}-tab`)?.focus();
}

function preview(text: string): string {
	const value = text.replace(/\s+/gu, ' ').trim();
	return value.length > 160 ? `${value.slice(0, 160)}…` : value;
}

function hasValidTime(time: string): boolean {
	return time.length > 0 && !Number.isNaN(Date.parse(time));
}

function close() {
	dialogEl.value?.close();
}

function requestClose() {
	if (!props.busy) close();
}

defineExpose({ close });
</script>

<style lang="scss" module>
.dialog {
	display: flex;
	flex-direction: column;
	margin: auto;
	width: 600px;
	max-width: 100%;
	max-height: min(640px, 100%);
	overflow: hidden;
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-panel);
}

.drawer {
	width: 100%;
	max-height: calc(100dvh - 30px);
	border-radius: 0;
}

.header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	flex-shrink: 0;
	padding: 8px 12px 8px 20px;
	border-bottom: var(--MI-divider);
}

.dialogTitle {
	margin: 0;
	font-size: 1em;
	font-weight: 600;
	line-height: 1.6;
}

.closeButton {
	display: grid;
	place-items: center;
	width: 36px;
	height: 36px;
	border-radius: var(--MI-cardRadius);
	&:hover { background: var(--MI_THEME-buttonHoverBg); }
}

.body {
	flex: 0 1 auto;
	min-height: 0;
	padding: 20px;
	overflow: auto;
}

.info {
	margin: 0 0 16px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.9em;
	line-height: 1.7;
}

.tabs {
	display: flex;
	gap: 24px;
	margin-bottom: 16px;
	border-bottom: var(--MI-divider);
}

.tab {
	padding: 12px 0;
	border-bottom: 2px solid transparent;
	color: var(--MI_THEME-fgTransparentWeak);
	font-weight: 600;
}

.activeTab {
	border-bottom-color: var(--MI_THEME-accent);
	color: var(--MI_THEME-accent);
}

.cloudActions {
	display: flex;
	justify-content: flex-end;
	margin-bottom: 12px;
}

.failure {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 12px;
	padding: 24px 0;
	color: var(--MI_THEME-fgTransparentWeak);
	> p { margin: 0; }
}

.empty {
	margin: 0;
	padding: 36px 0;
	text-align: center;
	color: var(--MI_THEME-fgTransparentWeak);
}

.list {
	margin: 0;
	padding: 0;
	list-style: none;
}

.draft {
	padding: 16px 0;
	border-top: var(--MI-divider);
}

.heading {
	display: flex;
	align-items: center;
	gap: 8px;
}

.title {
	flex: 1;
	min-width: 0;
	margin: 0;
	overflow: hidden;
	font-size: 1em;
	line-height: 1.6;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.current {
	flex-shrink: 0;
	padding: 2px 6px;
	border-radius: 4px;
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	font-size: 0.8em;
}

.preview {
	display: -webkit-box;
	margin: 8px 0;
	overflow: hidden;
	overflow-wrap: anywhere;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.9em;
	line-height: 1.6;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
}

.meta {
	display: flex;
	flex-wrap: wrap;
	gap: 4px 12px;
	margin-top: 8px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.8em;
	line-height: 1.6;
}

.actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	margin-top: 12px;
}

.footer {
	display: flex;
	justify-content: flex-end;
	flex-shrink: 0;
	padding: 16px 20px max(16px, env(safe-area-inset-bottom, 0px));
	border-top: var(--MI-divider);
}

@media (max-width: 500px) {
	.body {
		padding: 16px;
	}
}
</style>
