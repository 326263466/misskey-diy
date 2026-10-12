<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader hideHeader contentCard fillHeight :class="$style.shell">
	<div :class="$style.root" :aria-busy="loading || saving || uploading > 0" @focusout="scheduleBlurSave" @compositionstart="startComposition" @compositionend="endComposition">
		<header :class="$style.header">
			<div :class="$style.titleField">
				<input v-model="title" :class="$style.title" :disabled="!ready || saving" :aria-label="i18n.ts._article.title" :aria-invalid="titleLength > CONTENT_LIMITS.articleTitle" :placeholder="`${i18n.ts._article.title}…`">
				<span class="_inputCounter" :class="{ _inputCounterOver: titleLength > CONTENT_LIMITS.articleTitle }">{{ titleLength }}/{{ CONTENT_LIMITS.articleTitle }}</span>
			</div>
			<div :class="$style.headerActions">
				<span :class="[$style.draftStatus, { [$style.failed]: draftStatus === 'failed' }]" :title="i18n.ts._article.draftStrategy">
					{{ draftStatusText }}
				</span>
				<button type="button" class="_button" :class="$style.cloudSaveButton" :disabled="!canOpenSettings || !withinCloudContentLimits || !hasArticleDraftContent(snapshot())" @click="saveCloudDraft()">{{ cloudSaving ? i18n.ts._article.cloudDraftSaving : i18n.ts._article.saveDraft }}</button>
				<button ref="publishButton" type="button" class="_button _buttonPrimary" :class="$style.publishButton" :disabled="!canOpenSettings" aria-haspopup="dialog" :aria-expanded="settingsVisible" @click="openPublishSettings">
					{{ articleId ? i18n.ts.save : i18n.ts.publish }}
				</button>
				<button ref="avatarButton" type="button" class="_button" :class="$style.avatarButton" :disabled="!canManageDrafts()" :aria-label="i18n.ts._article.menu" aria-haspopup="menu" @click="openArticleMenu"><MkAvatar :user="account" :class="$style.avatar"/></button>
			</div>
		</header>
		<p v-if="draftStatus === 'failed'" :class="$style.saveError" role="alert">{{ i18n.ts._article.draftSaveFailed }} <button type="button" class="_textButton" @click="flushDraft">{{ i18n.ts.retry }}</button></p>
		<p v-if="cloudError" :class="$style.saveError" role="alert">{{ cloudError }} <button type="button" class="_textButton" :disabled="cloudSaving" @click="saveCloudDraft(cloudConflict)">{{ cloudConflict ? i18n.ts._article.saveDraftCopy : i18n.ts.retry }}</button></p>
		<MkLoading v-if="loading"/>
		<template v-else-if="ready">
			<MdEditor
				:id="editorId"
				ref="markdownEditor"
				v-model="markdown"
				:class="$style.editor"
				:theme="store.s.darkMode ? 'dark' : 'light'"
				:language="lang.startsWith('zh') ? 'zh-CN' : 'en-US'"
				:disabled="saving"
				:sanitize="sanitizeMarkdown"
				:toolbars="toolbars"
				:footers="footers"
				:scrollAuto="true"
				:preview="wideEditor"
				:placeholder="i18n.ts._article.bodyPlaceholder"
				:aria-label="i18n.ts._article.article"
				noHighlight noKatex noMermaid noEcharts noPrettier
				@onSave="saveCloudDraft()"
				@onUploadImg="uploadImages"
				@onError="os.toast(i18n.ts.somethingHappened, 'error')"
			>
				<template #defFooters><span class="md-editor-footer-item" :class="$style.readingTime">{{ i18n.tsx._article.readingTime({ minutes: readingMinutes }) }}</span></template>
			</MdEditor>
			<Teleport defer :to="`#${editorId} .md-editor-input-wrapper`">
				<span class="_inputCounter" :class="{ _inputCounterOver: markdownLength > CONTENT_LIMITS.articleText }">{{ markdownLength }}/{{ CONTENT_LIMITS.articleText }}</span>
			</Teleport>
		</template>
		<MkButton v-else @click="init()">{{ i18n.ts.retry }}</MkButton>
	</div>
	<Teleport to="body">
		<DraftsDialog v-if="draftsVisible" ref="draftsDialog" :drafts="drafts" :cloudDrafts="cloudDrafts" :cloudLoading="cloudLoading" :cloudFailed="cloudListFailed" :currentKey="workingRaw ? workingKey : sourceDraft?.key" :busy="draftBusy" @closed="closeDrafts" @restore="restoreSelectedDraft" @delete="deleteDraft" @create="newDraft" @restoreCloud="restoreCloudDraft" @deleteCloud="deleteCloudDraft" @reloadCloud="loadCloudDrafts"/>
		<MkModal v-if="settingsVisible" ref="publishModal" v-slot="{ maxHeight, type }" :anchorElement="publishButton" :returnFocusTo="publishButton" align="right" transparentBg :closeOnBackdrop="!saving" @click="closePublishSettings" @esc="closePublishSettings" @opened="focusPublishSettings" @closed="settingsVisible = false">
			<section ref="settingsPanel" :class="[$style.settings, { [$style.settingsDrawer]: type === 'drawer' }]" :style="{ maxHeight: `${maxHeight}px` }" role="dialog" aria-modal="true" :aria-label="articleId ? i18n.ts._article.edit : i18n.ts._article.publish" :aria-busy="saving" @focusout="scheduleBlurSave" @compositionstart="startComposition" @compositionend="endComposition">
				<header :class="$style.settingsHeader">
					<h2>{{ articleId ? i18n.ts._article.edit : i18n.ts._article.publish }}</h2>
					<button type="button" class="_button" :class="$style.closeButton" :disabled="saving" :aria-label="i18n.ts.close" @click="closePublishSettings"><i class="ti ti-x"></i></button>
				</header>
				<div :class="$style.settingsBody">
					<div :class="$style.field">
						<label :for="`${editorId}-category`" :class="$style.fieldLabel">{{ i18n.ts._article.category }}</label>
						<CategoryPicker :id="`${editorId}-category`" v-model="articleCategoryId" :disabled="saving || !editorActive"/>
					</div>
					<div :class="$style.field">
						<label :for="`${editorId}-tags`" :class="$style.fieldLabel">{{ i18n.ts._article.tags }}</label>
						<TagSelect :id="`${editorId}-tags`" v-model="articleTags" :disabled="saving || !editorActive"/>
					</div>
					<div :class="$style.field">
						<span :class="$style.fieldLabel">{{ i18n.ts._article.cover }}</span>
						<div :class="$style.coverRow">
							<button type="button" class="_button" :class="$style.coverPicker" :disabled="saving || uploading > 0" :aria-label="i18n.ts._article.chooseCover" @click="chooseCover">
								<img v-if="cover" :src="cover.thumbnailUrl || cover.url" :alt="i18n.ts._article.cover" :class="$style.cover"/>
								<span :class="[$style.coverPickerAction, { [$style.coverPickerEmpty]: !cover }]" aria-hidden="true"><i class="ti ti-photo-edit"></i>{{ i18n.ts._article.chooseCover }}</span>
							</button>
							<div :class="$style.coverActions">
								<MkButton small :disabled="!canOpenSettings" :wait="generatingCover" @click="generateDefaultCover"><i class="ti ti-wand" aria-hidden="true"></i> {{ i18n.ts._article.generateDefaultCover }}</MkButton>
								<button v-if="cover" type="button" class="_textButton" :disabled="saving || uploading > 0" @click="removeCover">{{ i18n.ts.remove }}</button>
							</div>
						</div>
						<p :class="$style.coverHint">{{ i18n.ts._article.defaultCoverHint }}</p>
					</div>
					<label :class="$style.field">
						<span :class="$style.fieldLabel">{{ i18n.ts._article.summary }}</span>
						<span :class="$style.summaryField">
							<textarea v-model="summary" :class="$style.summary" :disabled="saving" :aria-label="i18n.ts._article.summary" :aria-invalid="summaryLength > CONTENT_LIMITS.articleSummary" :placeholder="i18n.ts._article.summary" rows="4"></textarea>
							<span class="_inputCounter" :class="{ _inputCounterOver: summaryLength > CONTENT_LIMITS.articleSummary }">{{ summaryLength }}/{{ CONTENT_LIMITS.articleSummary }}</span>
						</span>
					</label>
				</div>
				<footer :class="$style.settingsFooter">
					<MkButton :disabled="saving" @click="closePublishSettings">{{ i18n.ts.cancel }}</MkButton>
					<MkButton primary :disabled="!canPublish" :wait="saving" @click="save">{{ articleId ? i18n.ts.save : i18n.ts.publish }}</MkButton>
				</footer>
			</section>
		</MkModal>
	</Teleport>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, inject, markRaw, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, useId, useTemplateRef, watch } from 'vue';
import { MdEditor } from 'md-editor-v3';
import type { ExposeParam, Footers, ToolbarNames, UploadImgCallBack } from 'md-editor-v3';
import 'md-editor-v3/lib/style.css';
import { CONTENT_LIMITS } from 'misskey-js';
import type { entities } from 'misskey-js';
import { lang } from '@@/js/config.js';
import MkModal from '@/components/MkModal.vue';
import MkButton from '@/components/MkButton.vue';
import DraftsDialog from '@/pages/articles/drafts-dialog.vue';
import CategoryPicker from '@/pages/articles/category-picker.vue';
import TagSelect from '@/pages/articles/tag-select.vue';
import { DI } from '@/di.js';
import { activeComposerDrafts } from '@/utility/composer-drafts.js';
import { createArticleDraftKey, hasArticleDraftContent, listArticleDrafts, removeArticleDraft, writeArticleDraft } from '@/utility/article-drafts.js';
import type { ArticleDraft, StoredArticleDraft } from '@/utility/article-drafts.js';
import { ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';
import { fetchInstance } from '@/instance.js';
import { store } from '@/store.js';
import { definePage } from '@/page.js';
import { useRouter } from '@/router.js';
import { genId } from '@/utility/id.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { selectFile, uploadFile } from '@/utility/drive.js';
import { articleBody, isArticle, rememberPublishedArticle } from '@/utility/article.js';
import { createArticleCoverFile } from '@/utility/article-cover.js';
import { sanitizeMarkdown } from '@/utility/markdown.js';
import { isAccountSessionErrorHandled } from '@/utility/account-session-error.js';
import { createDraftFileProtection } from '@/utility/draft-file-protection.js';
import * as os from '@/os.js';

const props = defineProps<{ articleId?: string; draftKey?: string; cloudDraftId?: string }>();
const account = ensureSignin();
let fileProtection = createDraftFileProtection(account);
const router = useRouter();
const pageActive = inject(DI.pageActive, ref(true));
const activated = ref(true);
const editorActive = computed(() => activated.value && pageActive.value);
const title = ref('');
const summary = ref('');
const articleCategoryId = ref<string | null>(null);
const articleTags = ref<string[]>([]);
const markdown = ref('');
const titleLength = computed(() => Array.from(title.value).length);
const summaryLength = computed(() => Array.from(summary.value).length);
const markdownLength = computed(() => Array.from(markdown.value).length);
type ArticleText = Pick<ArticleDraft, 'title' | 'summary' | 'text' | 'articleTags'>;
const originalArticle = ref<ArticleText | null>(null);
const originalCloudDraft = ref<ArticleText | null>(null);
const withinContentLimits = computed(() => isWithinContentLimits(originalArticle.value));
const withinCloudContentLimits = computed(() => isWithinContentLimits(originalCloudDraft.value ?? originalArticle.value));
const cover = ref<entities.DriveFile | null>(null);
const name = ref(`article-${genId()}`);
const generatingCover = ref(false);
let abortCoverUpload: (() => void) | undefined;
let coverRequest = 0;
const loading = ref(true);
const ready = ref(false);
const saving = ref(false);
const uploading = ref(0);
const editorId = useId();
const markdownEditor = useTemplateRef<ExposeParam>('markdownEditor');
const publishButton = useTemplateRef('publishButton');
const publishModal = useTemplateRef('publishModal');
const settingsPanel = useTemplateRef('settingsPanel');
const settingsVisible = ref(false);
const editorMedia = window.matchMedia('(min-width: 700px)');
const wideEditor = ref(editorMedia.matches);
// 超限旧稿也需要打开设置，才能修正摘要等隐藏字段。
const canOpenSettings = computed(() => ready.value && !saving.value && !cloudSaving.value && uploading.value === 0);
const canPublish = computed(() => canOpenSettings.value && !!title.value.trim() && !!markdown.value.trim() && withinContentLimits.value);
const toolbars: ToolbarNames[] = ['bold', 'italic', 'strikeThrough', 'title', 'quote', 'unorderedList', 'orderedList', 'task', 'codeRow', 'code', 'link', 'image', 'table', 'revoke', 'next', 'save', 'pageFullscreen', 'preview', 'catalog'];
const footers: Footers[] = [0, 'scrollSwitch', '=', 'markdownTotal'];
const readingMinutes = computed(() => Math.ceil(markdown.value.replace(/\s/gu, '').length / 400));
let disposed = false;
let saved = false;
let fileProtectionTimer: number | undefined;
let saveTimer: number | undefined;
let composing = false;
let cleanSnapshot = '';
let cloudSavedSnapshot: string | null = null;
let cloudSavedId: string | null = null;
const workingKey = ref(createArticleDraftKey(account.id, props.articleId));
const workingRaw = ref<string | null>(null);
const sourceDraft = ref<StoredArticleDraft | null>(null);
const drafts = ref<StoredArticleDraft[]>([]);
const draftsVisible = ref(false);
const draftBusy = ref(false);
const draftsDialog = useTemplateRef('draftsDialog');
const avatarButton = useTemplateRef('avatarButton');
const cloudId = ref<string | null>(null);
const cloudRevision = ref(0);
const cloudSaving = ref(false);
const cloudError = ref('');
const cloudConflict = ref(false);
const cloudDrafts = ref<entities.ArticlesDraftsShowResponse[]>([]);
const cloudLoading = ref(false);
const cloudListFailed = ref(false);
const draftStatus = ref<'idle' | 'pending' | 'saved' | 'failed'>('idle');
const countdown = ref(0);
const draftStatusText = computed(() => draftStatus.value === 'failed' ? i18n.ts._article.draftPending
	: countdown.value ? i18n.tsx._article.draftCountdown({ seconds: countdown.value })
		: draftStatus.value === 'saved' ? i18n.ts._article.draftSaved
			: draftStatus.value === 'pending' ? i18n.ts._article.draftPending : '');

function canManageDrafts() { return ready.value && !saving.value && !cloudSaving.value && !draftBusy.value && uploading.value === 0; }

function isWithinContentLimits(original: ArticleText | null) {
	return (titleLength.value <= CONTENT_LIMITS.articleTitle || title.value === original?.title)
		&& (summaryLength.value <= CONTENT_LIMITS.articleSummary || summary.value === original?.summary)
		&& (markdownLength.value <= CONTENT_LIMITS.articleText || markdown.value === original?.text)
		&& articleTags.value.every(tag => Array.from(tag).length <= CONTENT_LIMITS.articleTag || original?.articleTags?.includes(tag));
}

function snapshot() {
	return { title: title.value, summary: summary.value, text: markdown.value, name: name.value, articleCategoryId: articleCategoryId.value, articleTags: articleTags.value, cover: cover.value };
}

function clearSaveTimer() {
	window.clearTimeout(saveTimer);
	countdown.value = 0;
}

function refreshDrafts(showError = false) {
	try { drafts.value = listArticleDrafts(account.id); return true; } catch {
		if (showError) os.toast(i18n.ts._article.draftReadFailed, 'error');
		return false;
	}
}

function forgetSource() {
	if (!sourceDraft.value) return;
	// 另一窗口仍持有附件引用时保留原稿，不能替它解除保护。
	if (sourceDraft.value.draft.fileProtectionId && sourceDraft.value.draft.fileProtectionId !== fileProtection.id) return;
	removeArticleDraft(sourceDraft.value.key, sourceDraft.value.raw);
	activeComposerDrafts.delete(sourceDraft.value.key);
	sourceDraft.value = null;
}

function flushDraft(): boolean {
	clearSaveTimer();
	if (!ready.value || saved || disposed) return true;
	const content = snapshot();
	const serialized = draftSnapshot();
	if (serialized === cleanSnapshot) return draftStatus.value !== 'failed';
	try {
		if (!hasArticleDraftContent(content)) {
			if (workingRaw.value) removeArticleDraft(workingKey.value, workingRaw.value);
			forgetSource();
			workingRaw.value = null;
			void fileProtection.release();
			draftStatus.value = 'idle';
		} else {
			// 每个编辑器独立写入；外部改动过的记录也保留，避免覆盖。
			if (workingRaw.value && localStorage.getItem(workingKey.value) !== workingRaw.value) {
				activeComposerDrafts.delete(workingKey.value);
				workingKey.value = createArticleDraftKey(account.id, props.articleId);
			}
			const draft: ArticleDraft = { version: 1, ...content, fileProtectionId: fileProtection.id, updatedAt: new Date().toISOString(), ...(props.articleId ? { articleId: props.articleId } : {}), ...(cloudId.value ? { cloudId: cloudId.value, cloudRevision: cloudRevision.value } : {}) };
			workingRaw.value = writeArticleDraft(account.id, workingKey.value, draft);
			activeComposerDrafts.add(workingKey.value);
			fileProtection.markPersisted();
			// 新副本落盘后才移除恢复来源，配额失败时原稿仍在。
			forgetSource();
			draftStatus.value = 'saved';
		}
		cleanSnapshot = serialized;
		refreshDrafts();
		return true;
	} catch {
		draftStatus.value = 'failed';
		fileProtection.markStorageFailed();
		return false;
	}
}

function scheduleSave(delay = 3000) {
	clearSaveTimer();
	if (!ready.value || saved || disposed || composing) return;
	if (draftSnapshot() === cleanSnapshot) { draftStatus.value = workingRaw.value || sourceDraft.value ? 'saved' : 'idle'; return; }
	if (draftStatus.value !== 'failed') draftStatus.value = 'pending';
	countdown.value = delay / 1000;
	saveTimer = window.setTimeout(function tick() {
		countdown.value--;
		if (countdown.value <= 0) flushDraft();
		else saveTimer = window.setTimeout(tick, 1000);
	}, 1000);
}

function scheduleBlurSave(event: FocusEvent) {
	if (event.target instanceof HTMLElement && event.target.matches('input, textarea, [contenteditable="true"]')) scheduleSave(1000);
}

function startComposition() { composing = true; clearSaveTimer(); }

function endComposition() { composing = false; scheduleSave(); }

watch([title, summary, markdown, cover, articleCategoryId, articleTags], () => scheduleSave(), { flush: 'sync' });

function openArticleMenu(event: MouseEvent) {
	if (!canManageDrafts()) return;
	os.popupMenu([
		{ type: 'link', text: i18n.ts.home, icon: 'ti ti-home', to: '/' },
		{ text: i18n.ts._article.drafts, icon: 'ti ti-notes', action: () => { if (canManageDrafts()) openDrafts(); } },
		{ text: i18n.ts._article.newArticle, icon: 'ti ti-pencil-plus', action: () => { if (canManageDrafts()) newDraft(); } },
	], event.currentTarget);
}

function openDrafts() {
	flushDraft();
	if (!refreshDrafts(true)) return;
	draftsVisible.value = true;
	void loadCloudDrafts();
}

function closeDrafts() {
	draftsVisible.value = false;
	if (editorActive.value) {
		avatarButton.value?.focus({ preventScroll: true });
	}
}

function draftSnapshot() {
	return JSON.stringify({ ...snapshot(), cloudId: cloudId.value, cloudRevision: cloudRevision.value });
}

function preserveDraft() {
	return flushDraft() || (cloudRevision.value > 0 && cloudId.value === cloudSavedId && cloudSavedSnapshot === JSON.stringify(snapshot()));
}

async function saveCloudDraft(asCopy = false) {
	if (!ready.value || saving.value || cloudSaving.value || uploading.value > 0) return;
	if (!isWithinContentLimits(asCopy ? originalArticle.value : originalCloudDraft.value ?? originalArticle.value)) {
		os.toast(i18n.ts._article.invalidArticle, 'error');
		return;
	}
	if (!hasArticleDraftContent(snapshot())) return;
	if (asCopy || !cloudId.value) { cloudId.value = genId(); cloudRevision.value = 0; originalCloudDraft.value = null; }
	flushDraft();
	cloudSaving.value = true;
	cloudError.value = '';
	cloudConflict.value = false;
	const requestedDraft = snapshot();
	const requestedContent = JSON.stringify(requestedDraft);
	try {
		const result = await misskeyApi('articles/drafts/save', { draftId: cloudId.value, expectedRevision: cloudRevision.value, ...requestedDraft, coverId: cover.value?.id ?? null, articleId: props.articleId ?? null });
		cloudRevision.value = result.revision;
		originalCloudDraft.value = requestedDraft;
		cloudSavedSnapshot = requestedContent;
		cloudSavedId = cloudId.value;
		flushDraft();
		if (!disposed) os.toast(requestedContent === JSON.stringify(snapshot()) ? i18n.ts._article.cloudDraftSaved : i18n.ts._article.cloudDraftPreviousSaved, 'success');
	} catch (error) {
		cloudConflict.value = (error as { code?: string }).code === 'DRAFT_CONFLICT';
		const invalidTags = (error as { code?: string }).code === 'INVALID_ARTICLE_TAGS';
		cloudError.value = invalidTags ? i18n.ts._article.tagsUnavailable : cloudConflict.value ? i18n.ts._article.cloudDraftConflict : i18n.ts._article.cloudDraftFailed;
		if (invalidTags && !disposed) settingsVisible.value = true;
	} finally { cloudSaving.value = false; }
}

async function loadCloudDrafts() {
	if (cloudLoading.value) return;
	cloudLoading.value = true;
	cloudListFailed.value = false;
	try {
		const first = await misskeyApi('articles/drafts/list', { limit: 50 });
		cloudDrafts.value = first.length === 50 ? [...first, ...await misskeyApi('articles/drafts/list', { limit: 50, untilId: first[first.length - 1].id })] : first;
	} catch { cloudListFailed.value = true; } finally { cloudLoading.value = false; }
}

function cloudEntry(draft: entities.ArticlesDraftsShowResponse): StoredArticleDraft {
	return { key: '', raw: '', draft: { version: 1, title: draft.title, summary: draft.summary, text: draft.text, name: draft.name, articleCategoryId: draft.articleCategoryId, articleTags: draft.articleTags, cover: draft.cover, updatedAt: draft.updatedAt, ...(draft.articleId ? { articleId: draft.articleId } : {}), cloudId: draft.id, cloudRevision: draft.revision } };
}

async function restoreCloudDraft(draft: entities.ArticlesDraftsShowResponse) {
	if (draftBusy.value || !preserveDraft()) return;
	if ((draft.articleId ?? undefined) !== props.articleId) {
		draftsDialog.value?.close();
		router.pushByPath(`${draft.articleId ? `/articles/edit/${encodeURIComponent(draft.articleId)}` : '/articles/new'}?cloudDraft=${encodeURIComponent(draft.id)}`);
		return;
	}
	draftBusy.value = true;
	try {
		const latest = await misskeyApi('articles/drafts/show', { draftId: draft.id });
		resetDraft();
		await init(cloudEntry(latest));
		draftsDialog.value?.close();
	} catch { os.toast(i18n.ts._article.cloudDraftsFailed, 'error'); } finally { draftBusy.value = false; }
}

async function deleteCloudDraft(draft: entities.ArticlesDraftsShowResponse) {
	if (draftBusy.value) return;
	draftBusy.value = true;
	try {
		const { canceled } = await os.confirm({ type: 'warning', text: i18n.ts._article.cloudDraftDeleteConfirm });
		if (canceled) return;
		await misskeyApi('articles/drafts/delete', { draftId: draft.id, expectedRevision: draft.revision });
		if (cloudId.value === draft.id) { cloudId.value = null; cloudRevision.value = 0; originalCloudDraft.value = null; flushDraft(); }
		await loadCloudDrafts();
	} catch (error) {
		os.toast((error as { code?: string }).code === 'DRAFT_CONFLICT' ? i18n.ts._article.cloudDraftConflict : i18n.ts.somethingHappened, 'error');
	} finally { draftBusy.value = false; }
}

async function applyDraft(entry: StoredArticleDraft) {
	sourceDraft.value = entry.key ? entry : null;
	if (entry.key) activeComposerDrafts.add(entry.key);
	await fileProtection.restore(entry.draft.fileProtectionId);
	if (disposed) return;
	title.value = entry.draft.title;
	summary.value = entry.draft.summary;
	markdown.value = entry.draft.text;
	articleCategoryId.value = entry.draft.articleCategoryId;
	articleTags.value = entry.draft.articleTags ?? [];
	cloudId.value = entry.draft.cloudId ?? null;
	cloudRevision.value = entry.draft.cloudRevision ?? 0;
	cover.value = entry.draft.cover;
	if (!props.articleId) name.value = entry.draft.name;
	cloudSavedSnapshot = entry.key ? null : JSON.stringify(snapshot());
	cloudSavedId = entry.key ? null : cloudId.value;
	originalCloudDraft.value = entry.key ? null : entry.draft;
	// 本地副本可能已经改过超限字段，只以服务端原值作为保留旧内容的依据。
	if (entry.key && cloudId.value && !isWithinContentLimits(null)) {
		try { originalCloudDraft.value = await misskeyApi('articles/drafts/show', { draftId: cloudId.value }); } catch { /* 离线时仍允许恢复并修正本地草稿。 */ }
		if (disposed) return;
	}
	fileProtection.markPersisted();
	draftStatus.value = 'saved';
}

function resetDraft() {
	clearSaveTimer();
	coverRequest++;
	abortCoverUpload?.();
	saving.value = false;
	activeComposerDrafts.delete(workingKey.value);
	if (sourceDraft.value) activeComposerDrafts.delete(sourceDraft.value.key);
	if (!workingRaw.value && !sourceDraft.value) void fileProtection.release();
	fileProtection.dispose();
	fileProtection = createDraftFileProtection(account);
	workingKey.value = createArticleDraftKey(account.id, props.articleId);
	workingRaw.value = null;
	sourceDraft.value = null;
	draftStatus.value = 'idle';
	cloudId.value = null;
	cloudRevision.value = 0;
	cloudError.value = '';
	cloudConflict.value = false;
	cloudSavedSnapshot = null;
	cloudSavedId = null;
	originalArticle.value = null;
	originalCloudDraft.value = null;
	ready.value = false;
	title.value = '';
	summary.value = '';
	markdown.value = '';
	cover.value = null;
	articleCategoryId.value = null;
	articleTags.value = [];
	name.value = `article-${genId()}`;
}

async function restoreSelectedDraft(entry: StoredArticleDraft) {
	if (draftBusy.value || !preserveDraft()) return;
	try {
		if (localStorage.getItem(entry.key) !== entry.raw) { os.toast(i18n.ts._article.draftChanged, 'error'); refreshDrafts(); return; }
		if (entry.draft.articleId !== props.articleId) {
			draftsDialog.value?.close();
			router.pushByPath(`${entry.draft.articleId ? `/articles/edit/${encodeURIComponent(entry.draft.articleId)}` : '/articles/new'}?draft=${encodeURIComponent(entry.key)}`);
			return;
		}
		draftBusy.value = true;
		resetDraft();
		await init(entry);
		draftsDialog.value?.close();
	} catch { os.toast(i18n.ts._article.draftReadFailed, 'error'); } finally { draftBusy.value = false; }
}

function newDraft() {
	if (draftBusy.value || !preserveDraft()) return;
	draftsDialog.value?.close();
	if (props.articleId) { router.pushByPath('/articles/new?draft=new'); return; }
	resetDraft();
	cleanSnapshot = draftSnapshot();
	ready.value = true;
}

async function deleteDraft(entry: StoredArticleDraft) {
	if (draftBusy.value || entry.key === workingKey.value || entry.key === sourceDraft.value?.key) return;
	draftBusy.value = true;
	try {
		const { canceled } = await os.confirm({ type: 'warning', text: i18n.ts._article.draftDeleteConfirm });
		if (canceled || disposed) return;
		if (!removeArticleDraft(entry.key, entry.raw)) { os.toast(i18n.ts._article.draftChanged, 'error'); return; }
		if (entry.draft.fileProtectionId) {
			const protection = createDraftFileProtection(account);
			try {
				await protection.restore(entry.draft.fileProtectionId);
				if (protection.id === entry.draft.fileProtectionId) void protection.release();
			} finally { protection.dispose(); }
		}
	} catch { os.toast(i18n.ts._article.draftSaveFailed, 'error'); } finally { draftBusy.value = false; refreshDrafts(); }
}

function openPublishSettings() {
	if (!canOpenSettings.value) return;
	settingsVisible.value = true;
}

function closePublishSettings() {
	if (saving.value) return;
	publishModal.value?.close();
}

function focusPublishSettings() {
	settingsPanel.value?.querySelector<HTMLButtonElement>('[aria-haspopup="dialog"]')?.focus({ preventScroll: true });
}

function protectFiles() {
	window.clearTimeout(fileProtectionTimer);
	if (!ready.value || saved || disposed) return;
	// 本地草稿正文不上传，附件保护只提交资源地址。
	const urls = markdown.value.match(/https?:\/\/[^\s<>"')]+|\/(?:files|drive)\/[^\s<>"')]+/gu) ?? [];
	void fileProtection.update(cover.value ? [cover.value.id] : [], urls.join('\n'));
}

watch([markdown, cover], () => {
	if (!ready.value) return;
	window.clearTimeout(fileProtectionTimer);
	fileProtectionTimer = window.setTimeout(protectFiles, 500);
});

function restoredCategoryId(value: unknown): string | null {
	return typeof value === 'string' && value.length > 0 ? value : null;
}

async function init(selected?: StoredArticleDraft) {
	ready.value = false;
	saved = false;
	loading.value = true;
	try {
		await fetchInstance(true).catch(() => { /* 元数据不可用时仍使用缓存中的分类。 */ });
		if (disposed) return;
		if (props.articleId) {
			const article = await misskeyApi('pages/show', { pageId: props.articleId });
			if (disposed) return;
			if (!isArticle(article) || article.userId !== account.id) {
				os.toast(i18n.ts._article.cannotEdit, 'error');
				router.push('/articles/:articleId', { params: { articleId: props.articleId } });
				return;
			}
			title.value = article.title;
			summary.value = article.summary ?? '';
			articleCategoryId.value = restoredCategoryId(article.articleCategoryId);
			articleTags.value = article.articleTags ?? [];
			markdown.value = articleBody(article);
			originalArticle.value = { title: title.value, summary: summary.value, text: markdown.value, articleTags: [...articleTags.value] };
			cover.value = article.eyeCatchingImage;
			name.value = article.name;
		}
		let candidate = selected;
		if (!candidate && props.cloudDraftId) candidate = cloudEntry(await misskeyApi('articles/drafts/show', { draftId: props.cloudDraftId }));
		if (candidate && candidate.draft.articleId !== props.articleId) throw new Error('Article draft does not match this editor');
		if (refreshDrafts(true) && !candidate) {
			candidate = props.draftKey === 'new' ? undefined : drafts.value.find(entry =>
				entry.draft.articleId === props.articleId && !activeComposerDrafts.has(entry.key) && (!props.draftKey || entry.key === props.draftKey));
		}
		if (candidate) await applyDraft(candidate);
		if (disposed) return;
		cleanSnapshot = draftSnapshot();
		if (candidate && !candidate.key) cleanSnapshot = '';
		ready.value = true;
		if (candidate && !candidate.key) flushDraft();
		protectFiles();
	} catch (error) {
		if (!disposed && !isAccountSessionErrorHandled(error)) os.toast(i18n.ts.somethingHappened, 'error');
	} finally { if (!disposed) loading.value = false; }
}

async function save() {
	if (!ready.value || saving.value || cloudSaving.value || uploading.value > 0) return;
	if (!title.value.trim() || !markdown.value.trim() || !withinContentLimits.value) {
		os.toast(i18n.ts._article.invalidArticle, 'error');
		return;
	}
	saving.value = true;
	flushDraft();
	const publishingKey = workingKey.value;
	const articlePageReady = import('@/pages/articles/article.vue').catch(() => null);
	const options: entities.PagesCreateRequest = {
		title: titleLength.value > CONTENT_LIMITS.articleTitle ? title.value : title.value.trim(),
		summary: (summaryLength.value > CONTENT_LIMITS.articleSummary ? summary.value : summary.value.trim()) || null,
		name: name.value,
		articleCategoryId: articleCategoryId.value,
		articleTags: articleTags.value,
		content: [{ id: 'body', type: 'markdown', text: markdown.value }],
		variables: [], script: '', alignCenter: false, hideTitleWhenPinned: false, font: 'sans-serif', eyeCatchingImageId: cover.value?.id ?? null,
	};
	try {
		let id = props.articleId;
		if (id) await misskeyApi('pages/update', { pageId: id, ...options });
		else id = (await misskeyApi('pages/create', options)).id;
		saved = true;
		clearSaveTimer();
		try {
			if (workingRaw.value) removeArticleDraft(workingKey.value, workingRaw.value);
			forgetSource();
		} catch { /* 文章已发布，保留本地副本也不影响发布结果。 */ }
		if (cloudId.value && cloudRevision.value > 0) {
			try { await misskeyApi('articles/drafts/delete', { draftId: cloudId.value, expectedRevision: cloudRevision.value }); } catch {
				if (!disposed) os.toast(i18n.ts._article.cloudDraftCleanupFailed, 'error');
			}
		}
		void fileProtection.release();
		window.clearTimeout(fileProtectionTimer);
		if (disposed || !editorActive.value || workingKey.value !== publishingKey) return;
		// 保留发布界面直到详情准备好；预载超时不能阻止已发布文章的跳转。
		const controller = new AbortController();
		let preloadTimer: number | undefined;
		const prepared = await Promise.race([
			Promise.all([articlePageReady, misskeyApi('articles/show', { articleId: id! }, undefined, controller.signal).catch(() => null)]),
			new Promise<null>(resolve => { preloadTimer = window.setTimeout(() => resolve(null), 3000); }),
		]);
		window.clearTimeout(preloadTimer);
		controller.abort();
		if (disposed || !editorActive.value || workingKey.value !== publishingKey) return;
		rememberPublishedArticle(router, id!, prepared?.[1] ?? null);
		router.push('/articles/:articleId', { params: { articleId: id! } });
	} catch (error) {
		if (!disposed && !isAccountSessionErrorHandled(error)) {
			os.toast((error as { code?: string }).code === 'INVALID_ARTICLE_TAGS' ? i18n.ts._article.tagsUnavailable : i18n.ts.somethingHappened, 'error');
		}
	} finally { if (!disposed && !saved && workingKey.value === publishingKey) saving.value = false; }
}

async function chooseCover(event: PointerEvent) {
	if (!canOpenSettings.value) return;
	const draftKey = workingKey.value;
	const request = ++coverRequest;
	try {
		const file = await selectFile({ anchorElement: event.currentTarget, multiple: false, isManaged: true, draftId: fileProtection.id });
		if (disposed || !editorActive.value || workingKey.value !== draftKey || coverRequest !== request) return;
		if (!file.type.startsWith('image/') || file.isSensitive) { os.toast(i18n.ts._article.imageOnly, 'error'); return; }
		cover.value = file;
		protectFiles();
	} catch (error) { if (error && !disposed) os.toast(i18n.ts.failedToUpload, 'error'); }
}

function removeCover() {
	if (!canOpenSettings.value) return;
	coverRequest++;
	cover.value = null;
}

async function generateDefaultCover() {
	if (!canOpenSettings.value) return;
	const draftKey = workingKey.value;
	const protection = fileProtection;
	const request = ++coverRequest;
	const isCurrentDraft = () => !disposed && editorActive.value && workingKey.value === draftKey && coverRequest === request;
	let uploadTimeout: number | undefined;
	generatingCover.value = true;
	uploading.value++;
	try {
		const file = await createArticleCoverFile({ title: title.value, createdAt: new Date().toISOString(), name: `${name.value}:${genId()}`, userId: account.id });
		if (!isCurrentDraft()) return;
		const upload = uploadFile(file, { isManaged: true, draftId: protection.id });
		abortCoverUpload = upload.abort;
		uploadTimeout = window.setTimeout(upload.abort, 60_000);
		const result = await upload.filePromise;
		if (!isCurrentDraft()) return;
		cover.value = result;
		protectFiles();
		flushDraft();
	} catch {
		if (isCurrentDraft()) os.toast(i18n.ts._article.generateCoverFailed, 'error');
	} finally {
		window.clearTimeout(uploadTimeout);
		abortCoverUpload = undefined;
		generatingCover.value = false;
		uploading.value--;
	}
}

async function uploadImages(files: File[], callback: UploadImgCallBack) {
	if (saving.value || files.length === 0 || files.some(file => !file.type.startsWith('image/'))) {
		if (files.length && !saving.value) os.toast(i18n.ts._article.imageOnly, 'error');
		callback([]);
		return;
	}
	uploading.value++;
	try {
		const uploaded = await new Promise<entities.DriveFile[]>((resolve, reject) => {
			let dispose: (() => void) | undefined;
			let closed = false;
			void os.popupAsyncWithDialog(import('@/components/MkUploaderDialog.vue').then(module => module.default), { files: markRaw(files), multiple: true, isManaged: true, draftId: fileProtection.id }, {
				done: resolve,
				canceled: () => resolve([]),
				closed: () => { closed = true; dispose?.(); resolve([]); },
			}).then(popup => { dispose = popup.dispose; if (closed) dispose(); }, reject);
		});
		if (!disposed) {
			callback(uploaded.map(file => ({ url: file.url, alt: file.name, title: file.name })));
			await nextTick();
			protectFiles();
		}
	} catch { if (!disposed) { os.toast(i18n.ts.failedToUpload, 'error'); callback([]); } } finally { uploading.value--; }
}

function updateEditorWidth(event: MediaQueryListEvent) {
	wideEditor.value = event.matches;
	markdownEditor.value?.togglePreview(event.matches);
}

function saveBeforeLeave(event: BeforeUnloadEvent) {
	if (!preserveDraft()) { event.preventDefault(); event.returnValue = ''; }
}

function saveWhenHidden() { if (window.document.visibilityState === 'hidden') flushDraft(); }

let previousNavHook: typeof router.navHook = null;
const leaveHook: NonNullable<typeof router.navHook> = (path, flag) => {
	if (editorActive.value && !preserveDraft()) { os.toast(i18n.ts._article.draftSaveFailed, 'error'); return true; }
	return previousNavHook?.(path, flag) ?? false;
};

function installLeaveHook() {
	if (router.navHook === leaveHook) return;
	previousNavHook = router.navHook;
	router.navHook = leaveHook;
}

function removeLeaveHook() { if (router.navHook === leaveHook) router.navHook = previousNavHook; }

watch(editorActive, active => {
	if (!active) {
		coverRequest++;
		abortCoverUpload?.();
		flushDraft();
		removeLeaveHook();
		if (saved) settingsVisible.value = false;
		else publishModal.value?.close();
		draftsDialog.value?.close();
	} else {
		if (saved) { resetDraft(); void init(); }
		installLeaveHook();
	}
});

onMounted(() => {
	installLeaveHook();
	editorMedia.addEventListener('change', updateEditorWidth);
	window.addEventListener('beforeunload', saveBeforeLeave);
	window.addEventListener('pagehide', flushDraft);
	window.addEventListener('storage', onStorage);
	window.document.addEventListener('visibilitychange', saveWhenHidden);
	void init();
});

function onStorage() { refreshDrafts(); }

onDeactivated(() => { activated.value = false; flushDraft(); if (saved) settingsVisible.value = false; else publishModal.value?.close(); draftsDialog.value?.close(); });
onActivated(() => { activated.value = true; });
onBeforeUnmount(() => {
	abortCoverUpload?.();
	removeLeaveHook();
	flushDraft();
	clearSaveTimer();
	activeComposerDrafts.delete(workingKey.value);
	if (sourceDraft.value) activeComposerDrafts.delete(sourceDraft.value.key);
	window.removeEventListener('beforeunload', saveBeforeLeave);
	window.removeEventListener('pagehide', flushDraft);
	window.removeEventListener('storage', onStorage);
	window.document.removeEventListener('visibilitychange', saveWhenHidden);
	editorMedia.removeEventListener('change', updateEditorWidth);
	window.clearTimeout(fileProtectionTimer);
	if (!saved && !workingRaw.value && !sourceDraft.value) void fileProtection.release();
	fileProtection.dispose();
	disposed = true;
});
definePage(() => ({ title: props.articleId ? i18n.ts._article.edit : i18n.ts._article.publish, icon: 'ti ti-pencil' }));
</script>

<style lang="scss" module>
.shell {
	--MI-pageContentPadding: 0px;
	--MI-cardRadius: 0px;
	--MI-pageHeaderRadius: 0px;
}

.root {
	display: flex;
	flex-direction: column;
	height: 100cqh;
	min-height: 440px;
	min-width: 0;
	background: var(--MI_THEME-panel);
}

.header {
	display: flex;
	align-items: center;
	gap: 12px;
	min-height: 56px;
	padding: 0 24px;
	flex-shrink: 0;
	border-bottom: var(--MI-divider);
}

.draftStatus { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--MI_THEME-fgTransparentWeak); }
.failed { color: var(--MI_THEME-error); }
.saveError { margin: 0; padding: 8px 16px; background: var(--MI_THEME-infoWarnBg); color: var(--MI_THEME-infoWarnFg); font-size: 13px; }
.cloudSaveButton {
	padding: 7px 14px;
	background: var(--MI_THEME-buttonBg);
	border-radius: 5px;
	font-size: 13px;
	color: var(--MI_THEME-fg);
	white-space: nowrap;

	&:not(:disabled):hover { background: var(--MI_THEME-buttonHoverBg); }
	&:not(:disabled):active { background: var(--MI_THEME-buttonHoverBg); }
	&:disabled { opacity: .5; }
}
.avatarButton { display: flex; flex-shrink: 0; }
.readingTime { white-space: nowrap; }

.avatar { width: 32px; height: 32px; flex-shrink: 0; }

.titleField {
	position: relative;
	display: flex;
	align-items: center;
	flex: 1;
	min-width: 0;
}

.title {
	display: block;
	flex: 1;
	min-width: 0;
	padding: 8px 0;
	border: 0;
	background: transparent;
	color: var(--MI_THEME-fg);
	font: inherit;
	font-size: 22px;
	outline: none;

	&::placeholder { color: var(--MI_THEME-fgTransparentWeak); }
	&:focus-visible { box-shadow: 0 2px var(--MI_THEME-accent); }
}

.headerActions {
	display: flex;
	align-items: center;
	gap: 12px;
	flex-shrink: 0;
	margin-left: auto;
}

.publishButton {
	min-width: 80px;
	padding: 8px 20px;
	border-radius: 4px;
	font-size: 14px;
	white-space: nowrap;

	&:disabled { opacity: .5; }
}

.editor {
	--md-bk-color: var(--MI_THEME-panel);
	--md-bk-color-outstand: var(--MI_THEME-panelHighlight);
	--md-bk-hover-color: var(--MI_THEME-buttonHoverBg);
	--md-color: var(--MI_THEME-fg);
	--md-border-color: var(--MI-dividerColor);
	--md-scrollbar-bg-color: transparent;
	--md-scrollbar-thumb-color: var(--MI_THEME-scrollbarHandle);
	--md-scrollbar-thumb-hover-color: var(--MI_THEME-scrollbarHandleHover);
	flex: 1;
	min-width: 0;
	height: 0;
	min-height: 320px;
	border: 0;
	border-radius: 0;

	:global(.md-editor-toolbar-wrapper) {
		padding: 8px 20px;
		background: var(--MI_THEME-panelHighlight);
	}

	:global(.md-editor-input-wrapper) {
		position: relative;
		background: color-mix(in srgb, var(--MI_THEME-bg) 45%, var(--MI_THEME-panel));
	}

	:global(.cm-editor) { background: transparent; }
	:global(.cm-scroller) { padding: 16px; }
	:global(.md-editor-resize-operate) {
		background: color-mix(in srgb, var(--MI_THEME-fg) 18%, var(--MI_THEME-panel));
		width: 1px;
		opacity: 1;

		// 视觉上保持细线，拖动区域仍便于鼠标命中。
		&::after { content: ''; position: absolute; inset: 0 -4px; }
	}
	:global(.md-editor-preview-wrapper) { padding: 16px 32px; }
	:global(.md-editor-footer) { padding: 6px 20px; }
}

.settings {
	display: flex;
	flex-direction: column;
	width: 680px;
	max-width: calc(100vw - 32px);
	box-sizing: border-box;
	overflow: hidden;
	background: var(--MI_THEME-panel);
	border: var(--MI-divider);
	border-radius: 4px;
	box-shadow: 0 8px 32px var(--MI_THEME-shadow);
}

.settingsHeader {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16px;
	padding: 20px 24px;
	border-bottom: var(--MI-divider);
	flex-shrink: 0;

	h2 { margin: 0; font-size: 18px; font-weight: 500; }
}

.closeButton { padding: 4px; font-size: 18px; }

.settingsBody {
	display: flex;
	flex-direction: column;
	gap: 28px;
	padding: 28px 24px;
	min-height: 0;
	overflow-y: auto;
	overscroll-behavior: contain;
}

.field {
	display: grid;
	grid-template-columns: 88px minmax(0, 1fr);
	gap: 16px;
	align-items: start;
}

.fieldLabel { padding-top: 8px; font-size: 14px; }
.coverRow { display: flex; align-items: center; flex-wrap: wrap; gap: 16px; }
.coverActions { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; }

.coverPicker {
	position: relative;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 10px;
	width: 192px;
	height: 128px;
	overflow: hidden;
	border-radius: var(--MI-cardRadius);
	border: 1px dashed var(--MI_THEME-inputBorder);
	background: var(--MI_THEME-bg);
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 13px;

	i { font-size: 24px; }
}

.coverPickerAction {
	position: absolute;
	inset: auto 0 0;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	padding: 6px 8px;
	background: var(--MI_THEME-panel);
	color: var(--MI_THEME-fg);

	> i { font-size: 1em; }
}

.coverPickerEmpty { position: static; background: transparent; color: inherit; }

.coverHint {
	grid-column: 2;
	margin: -8px 0 0;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 12px;
	line-height: 1.6;
}

.cover { width: 100%; height: 100%; object-fit: cover; }
.summaryField { position: relative; display: block; min-width: 0; }

.summary {
	display: block;
	box-sizing: border-box;
	width: 100%;
	min-height: 112px;
	padding: 12px 12px 32px;
	resize: none;
	border: 1px solid var(--MI_THEME-inputBorder);
	border-radius: 3px;
	background: var(--MI_THEME-bg);
	color: var(--MI_THEME-fg);
	font: inherit;
	font-size: 14px;
	line-height: 1.6;

	&::placeholder { color: var(--MI_THEME-fgTransparentWeak); }
	&:focus-visible { outline: 2px solid var(--MI_THEME-accent); outline-offset: 2px; }
}

.settingsFooter {
	display: flex;
	justify-content: flex-end;
	gap: 12px;
	padding: 16px 24px;
	border-top: var(--MI-divider);
	flex-shrink: 0;
}

.settingsDrawer { width: 100%; max-width: 100%; border-radius: var(--MI-radius) var(--MI-radius) 0 0; }

@media (max-width: 700px) {
	.header { flex-wrap: wrap; gap: 6px 12px; padding: 8px 12px; }
	.titleField { order: 1; flex-basis: 100%; }
	.title { padding: 6px 0; font-size: 18px; }
	.draftStatus { display: none; }
	.headerActions { gap: 12px; }
	.publishButton { min-width: 64px; padding: 7px 16px; }
	.editor :global(.md-editor-toolbar-wrapper) { padding: 6px 8px; }
	.editor :global(.md-editor-preview-wrapper) { padding: 12px 16px; }
	.settingsHeader, .settingsBody, .settingsFooter { padding: 16px; }
	.settingsBody { gap: 20px; }
	.field { grid-template-columns: minmax(0, 1fr); gap: 10px; }
	.fieldLabel { padding-top: 0; }
	.coverHint { grid-column: 1; margin-top: 0; }
}
</style>
