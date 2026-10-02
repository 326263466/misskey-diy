<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.root, { [$style.maximized]: maximized }]" @keydown="onKeydown">
	<header :class="$style.header">
		<button v-if="!fixed" type="button" class="_button" :class="$style.iconButton" :aria-label="i18n.ts.cancel" :disabled="posting" @click="emit('cancel')"><i class="ti ti-x" aria-hidden="true"></i></button>
		<slot name="mode"></slot>
		<div :class="$style.headerActions">
			<button v-if="canMaximize" type="button" class="_button" :class="$style.iconButton" :aria-label="maximized ? i18n.ts.windowRestore : i18n.ts.windowMaximize" :aria-pressed="maximized" @click="maximized = !maximized"><i :class="maximized ? 'ti ti-arrows-minimize' : 'ti ti-arrows-maximize'" aria-hidden="true"></i></button>
			<button type="button" class="_buttonPrimary" :class="$style.publish" :disabled="!canPublish" data-testid="article-form-submit" @click="publish"><MkEllipsis v-if="posting"/><template v-else>{{ i18n.ts._articleForm.publish }}</template></button>
		</div>
	</header>
	<div :class="$style.editor">
		<MkInfo>{{ i18n.ts._articleForm.publicNotice }}</MkInfo>
		<label :class="$style.field">
			<span>{{ i18n.ts._articleForm.title }}</span>
			<input v-model="title" type="text" :class="[$style.input, $style.title]" :maxlength="256" :disabled="posting || posted" required data-testid="article-form-title">
		</label>
		<label :class="$style.field">
			<span>{{ i18n.ts._articleForm.summary }}</span>
			<input v-model="summary" type="text" :class="$style.input" :maxlength="256" :disabled="posting || posted" data-testid="article-form-summary">
		</label>
		<div :class="[$style.field, $style.bodyField]">
			<div :class="$style.bodyHeader">
				<label :for="bodyId">{{ i18n.ts._articleForm.body }}</label>
				<button type="button" class="_textButton" :aria-pressed="preview" data-testid="article-form-preview" @click="preview = !preview">{{ preview ? i18n.ts.edit : i18n.ts.preview }}</button>
			</div>
			<div v-if="preview" :class="[$style.preview, '_selectable']" data-testid="article-preview"><Mfm :text="text" :isNote="false"/></div>
			<textarea v-else :id="bodyId" v-model="text" :class="[$style.input, $style.body]" :placeholder="i18n.ts._articleForm.bodyPlaceholder" :disabled="posting || posted" required data-testid="article-form-text"></textarea>
		</div>
	</div>
	<footer :class="[$style.footer, { [$style.saveError]: draftSaveFailed }]" role="status">
		<i :class="draftSaveFailed ? 'ti ti-alert-triangle' : 'ti ti-device-floppy'" aria-hidden="true"></i>
		{{ draftSaveFailed ? i18n.ts._articleForm.draftSaveFailed : i18n.ts._articleForm.draftSaved }}
	</footer>
</div>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue';
import MkInfo from '@/components/MkInfo.vue';
import { ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { genId } from '@/utility/id.js';
import { activeComposerDrafts } from '@/utility/composer-drafts.js';

const props = defineProps<{
	fixed?: boolean;
	canMaximize?: boolean;
	freezeAfterPosted?: boolean;
	mock?: boolean;
}>();

const maximized = defineModel<boolean>('maximized', { default: false });
const emit = defineEmits<{
	(ev: 'posted'): void;
	(ev: 'cancel'): void;
	(ev: 'esc'): void;
}>();

const account = ensureSignin();
const draftPrefix = `misskey:articleDraft:${account.id}`;
const draftKey = `${draftPrefix}:${genId()}`;
let restoredSource: { key: string; raw: string } | undefined;
const bodyId = useId();
const title = ref('');
const summary = ref('');
const text = ref('');
const preview = ref(false);
const posting = ref(false);
const posted = ref(false);
const draftSaveFailed = ref(false);
let pageName = genId();
let preserveDraftOnClose = false;
let closeRequest: Promise<boolean> | null = null;

const hasContent = computed(() => title.value !== '' || summary.value !== '' || text.value !== '');
const canPublish = computed(() => !props.mock && !posting.value && !posted.value &&
	title.value.trim().length > 0 && title.value.length <= 256 && summary.value.length <= 256 && text.value.trim().length > 0);

if (!props.mock) {
	try {
		const candidate = Object.keys(localStorage).filter(key => (key === draftPrefix || key.startsWith(`${draftPrefix}:`)) && !activeComposerDrafts.has(key))
			.sort((a, b) => (JSON.parse(localStorage.getItem(b) ?? '{}').updatedAt ?? '').localeCompare(JSON.parse(localStorage.getItem(a) ?? '{}').updatedAt ?? ''))[0];
		const raw = candidate ? localStorage.getItem(candidate) : null;
		const stored: unknown = JSON.parse(raw ?? 'null');
		if (stored != null && typeof stored === 'object' && 'version' in stored && stored.version === 1 &&
			'title' in stored && typeof stored.title === 'string' &&
			'summary' in stored && typeof stored.summary === 'string' &&
			'text' in stored && typeof stored.text === 'string' &&
			'name' in stored && typeof stored.name === 'string' && /^[a-z0-9-]+$/.test(stored.name)) {
			title.value = stored.title;
			summary.value = stored.summary;
			text.value = stored.text;
			pageName = stored.name;
			if (candidate && raw) restoredSource = { key: candidate, raw };
		}
	} catch {
		draftSaveFailed.value = true;
	}
}
activeComposerDrafts.add(draftKey);

function saveDraft(): boolean {
	if (props.mock || posted.value) return true;
	try {
		if (hasContent.value) {
			localStorage.setItem(draftKey, JSON.stringify({
				version: 1,
				name: pageName,
				title: title.value,
				summary: summary.value,
				text: text.value,
				updatedAt: new Date().toISOString(),
			}));
		} else {
			localStorage.removeItem(draftKey);
		}
		draftSaveFailed.value = false;
		return true;
	} catch {
		draftSaveFailed.value = true;
		return false;
	}
}

// Copy a restored draft before releasing its old key. Other tabs keep their own copy.
if (restoredSource && saveDraft()) {
	try {
		if (localStorage.getItem(restoredSource.key) === restoredSource.raw) localStorage.removeItem(restoredSource.key);
	} catch { draftSaveFailed.value = true; }
}

watch([title, summary, text], () => {
	preserveDraftOnClose = false;
	saveDraft();
});

function clear() {
	// The dialog also calls clear after closing. A confirmed saved draft must survive it.
	if (preserveDraftOnClose) return;
	title.value = '';
	summary.value = '';
	text.value = '';
	preview.value = false;
	pageName = genId();
	if (!props.mock) {
		try {
			localStorage.removeItem(draftKey);
			draftSaveFailed.value = false;
		} catch {
			draftSaveFailed.value = true;
		}
	}
}

async function confirmClose(): Promise<boolean> {
	if (posted.value) return true;
	if (posting.value) return false;
	if (posted.value || !hasContent.value) return true;
	const { canceled, result } = await os.actions({
		type: 'question',
		text: i18n.ts._articleForm.closeConfirm,
		actions: [
			{ value: 'save', text: i18n.ts._articleForm.saveAndClose, primary: true },
			{ value: 'discard', text: i18n.ts._articleForm.discardAndClose, danger: true },
			{ value: 'continue', text: i18n.ts._articleForm.continueEditing },
		],
	});
	if (canceled || result === 'continue') return false;
	if (result === 'save') {
		if (!saveDraft()) {
			await os.alert({ type: 'error', text: i18n.ts._articleForm.draftSaveFailed });
			return false;
		}
		preserveDraftOnClose = true;
		return true;
	}
	if (result === 'discard') {
		preserveDraftOnClose = false;
		clear();
		return true;
	}
	return false;
}

function canClose(): Promise<boolean> {
	if (closeRequest) return closeRequest;
	closeRequest = confirmClose().finally(() => { closeRequest = null; });
	return closeRequest;
}

async function publish() {
	if (!canPublish.value) return;
	posting.value = true;
	try {
		const created = await os.apiWithDialog('pages/create', {
			title: title.value.trim(),
			name: pageName,
			summary: summary.value.trim() || null,
			content: [{ id: genId(), type: 'text', text: text.value }],
			variables: [],
			script: '',
			font: 'sans-serif',
			alignCenter: false,
			hideTitleWhenPinned: false,
		});
		posted.value = true;
		preserveDraftOnClose = false;
		clear();
		emit('posted');
		os.pageWindow(`/@${account.username}/pages/${created.name}`);
		if (!props.freezeAfterPosted) posted.value = false;
	} catch {
		// apiWithDialog shows the API error. Keep the article ready to retry.
		saveDraft();
	} finally {
		posting.value = false;
	}
}

function onKeydown(event: KeyboardEvent) {
	if (event.isComposing) return;
	if (event.key === 'Escape') {
		event.stopPropagation();
		emit('esc');
	} else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
		event.preventDefault();
		publish();
	}
}

function onBeforeUnload(event: BeforeUnloadEvent) {
	if (!hasContent.value || posted.value || props.mock) return;
	saveDraft();
	event.preventDefault();
	event.returnValue = '';
}

function onPageHide() {
	if (hasContent.value) saveDraft();
}

window.addEventListener('beforeunload', onBeforeUnload);
window.addEventListener('pagehide', onPageHide);
onBeforeUnmount(() => {
	saveDraft();
	activeComposerDrafts.delete(draftKey);
	window.removeEventListener('beforeunload', onBeforeUnload);
	window.removeEventListener('pagehide', onPageHide);
});

defineExpose({ canClose, clear, abortUploader: () => {}, hasContent });
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-direction: column;
	min-height: 0;
	background: var(--MI_THEME-panel);
	color: var(--MI_THEME-fg);
	border-radius: inherit;
	overflow: clip;
}

.header {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
	flex-shrink: 0;
	padding: 12px 16px;
	border-bottom: 1px solid var(--MI_THEME-divider);
}

.headerActions {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-left: auto;
}

.iconButton {
	width: 36px;
	height: 36px;
	border-radius: var(--MI-radius-sm);
	color: var(--MI_THEME-fgTransparentWeak);

	&:hover { background: var(--MI_THEME-buttonHoverBg); }
}

.publish {
	min-height: 36px;
	padding: 8px 16px;
	border-radius: var(--MI-radius-sm);
	font-weight: bold;
}

.editor {
	display: flex;
	flex-direction: column;
	gap: 18px;
	min-height: 0;
	max-height: 65dvh;
	padding: 20px;
	overflow-y: auto;
	overscroll-behavior: contain;
}

.field {
	display: flex;
	flex-direction: column;
	gap: 8px;
	font-size: 0.9em;
}

.input {
	box-sizing: border-box;
	width: 100%;
	border: 1px solid var(--MI_THEME-divider);
	border-radius: var(--MI-radius-sm);
	padding: 12px;
	background: var(--MI_THEME-bg);
	color: var(--MI_THEME-fg);
	font: inherit;

	&::placeholder {
		color: var(--MI_THEME-fgTransparentWeak);
		opacity: 1;
	}

	&:focus-visible { outline: 2px solid var(--MI_THEME-accent); outline-offset: 1px; }
}

.title { font-size: 1.2em; font-weight: bold; }
.bodyField { flex: 1; min-height: 230px; }
.bodyHeader { display: flex; justify-content: space-between; gap: 12px; }
.body { flex: 1; min-height: 200px; resize: vertical; line-height: 1.7; }
.preview { flex: 1; min-height: 200px; padding: 12px; overflow-wrap: anywhere; line-height: 1.7; }

.footer {
	display: flex;
	align-items: baseline;
	gap: 8px;
	flex-shrink: 0;
	padding: 12px 20px;
	border-top: 1px solid var(--MI_THEME-divider);
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.8em;
}

.saveError { color: var(--MI_THEME-error); }

.maximized {
	height: 100%;
	border-radius: 0;

	.editor { flex: 1; max-height: none; }
}
</style>
