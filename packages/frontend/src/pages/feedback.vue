<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :hideHeader="true">
	<div class="_pageBody" :class="$style.page" data-testid="feedback-page">
		<div :class="$style.layout">
			<main :class="$style.main">
				<header :class="$style.composer" data-testid="feedback-header">
					<div :class="$style.hero">
						<span :class="$style.heroIcon" aria-hidden="true"><i class="ti ti-message-heart"></i></span>
						<div :class="$style.heroText"><h1>{{ i18n.ts._feedback.title }}</h1><p>{{ i18n.ts._feedback.description }}</p></div>
					</div>
					<form :class="$style.form" :aria-busy="publishing" novalidate @submit.prevent="publish">
						<MkPostFormInput ref="draftEditor" v-model="draftDescription" v-model:files="draftFiles" :maxLength="CONTENT_LIMITS.feedbackText" :label="i18n.ts._feedback.descriptionLabel" :placeholder="i18n.ts._feedback.publishDescription" :disabled="publishing" @submit="publish">
							<template #actions="{ valid }">
								<div :class="$style.composeActions">
									<MkSelect v-model="draftCategory" :items="categoryOptions" small :class="$style.select" :disabled="publishing"><template #label><span :class="$style.selectLabel">{{ i18n.ts._feedback.category }}</span></template></MkSelect>
									<MkButton type="submit" primary rounded data-testid="feedback-publish" :wait="publishing" :disabled="!$i || listLocked || !valid">{{ publishing ? i18n.ts._feedback.submitting : i18n.ts._feedback.publish }}</MkButton>
								</div>
							</template>
						</MkPostFormInput>
					</form>
				</header>
				<section :class="$style.board" :aria-labelledby="`${id}-board`">
					<h2 :id="`${id}-board`" :class="$style.boardHeading">{{ i18n.ts._feedback.board }}</h2>
					<div :class="$style.statusFilters" data-testid="feedback-status-filters" role="group" :aria-label="i18n.ts._feedback.status">
						<button type="button" class="_button" :class="[$style.statusFilter, $style.all, { [$style.activeFilter]: status === 'all' }]" :aria-pressed="status === 'all'" :disabled="listLocked" @click="status = 'all'"><span :class="$style.statusCount">{{ counts?.all ?? '–' }}</span><span :class="$style.statusName"><i class="ti ti-stack-2" aria-hidden="true"></i>{{ i18n.ts.all }}</span></button>
						<button v-for="option in statuses" :key="option.key" type="button" class="_button" :class="[$style.statusFilter, $style[option.key], { [$style.activeFilter]: status === option.key }]" :aria-pressed="status === option.key" :disabled="listLocked" @click="status = option.key"><span :class="$style.statusCount">{{ counts?.[option.key] ?? '–' }}</span><span :class="$style.statusName"><i :class="option.icon" aria-hidden="true"></i>{{ option.label }}</span></button>
					</div>
					<div :class="$style.boardHeader">
						<div :class="$style.scope" role="group" :aria-label="i18n.ts.sort">
							<button type="button" class="_button" :class="{ [$style.scopeActive]: sort === 'latest' }" :aria-pressed="sort === 'latest'" :disabled="listLocked" @click="sort = 'latest'">{{ i18n.ts._feedback.latest }}</button>
							<button type="button" class="_button" :class="{ [$style.scopeActive]: sort === 'updated' }" :aria-pressed="sort === 'updated'" :disabled="listLocked" @click="sort = 'updated'">{{ i18n.ts._feedback.updated }}</button>
						</div>
						<button v-if="$i" type="button" class="_button" :class="[$style.mineToggle, { [$style.scopeActive]: mine }]" :aria-pressed="mine" :disabled="listLocked" @click="mine = !mine"><i class="ti ti-user" aria-hidden="true"></i>{{ i18n.ts._feedback.mine }}</button>
						<div :class="$style.toolbar">
							<label :class="$style.search"><i class="ti ti-search" aria-hidden="true"></i><input v-model="query" type="search" maxlength="100" :placeholder="i18n.ts._feedback.searchPlaceholder" :aria-label="i18n.ts._feedback.searchPlaceholder" :disabled="listLocked" enterkeyhint="search" @keydown="onSearchKeydown"></label>
							<MkSelect v-model="category" :items="filterCategoryOptions" small :class="$style.select" :disabled="listLocked"><template #label><span :class="$style.selectLabel">{{ i18n.ts._feedback.category }}</span></template></MkSelect>
							<button type="button" class="_button" :class="$style.iconButton" :title="i18n.ts.reload" :aria-label="i18n.ts.reload" :disabled="listLocked || loading || loadingMore" @click="load()"><i class="ti ti-refresh" aria-hidden="true"></i></button>
						</div>
					</div>
					<div :aria-busy="loading">
						<div v-if="loading" :class="$style.empty" role="status"><MkLoading/><p>{{ i18n.ts._feedback.loading }}</p></div>
						<div v-else-if="loadError && !failedMore" :class="$style.empty" role="alert"><i class="ti ti-cloud-off" :class="$style.emptyIcon" aria-hidden="true"></i><p>{{ i18n.ts._feedback.loadFailed }}</p><MkButton :disabled="listLocked" @click="load()">{{ i18n.ts._feedback.retry }}</MkButton></div>
						<div v-else-if="items.length === 0 && total === 0" :class="$style.empty">
							<div :class="$style.emptyArtwork"><i :class="filtered ? 'ti ti-search' : 'ti ti-message-plus'" aria-hidden="true"></i></div>
							<p :class="$style.emptyTitle">{{ filtered ? i18n.ts._feedback.noResults : i18n.ts._feedback.emptyTitle }}</p><p>{{ filtered ? i18n.ts._feedback.noResultsDescription : i18n.ts._feedback.emptyDescription }}</p>
							<MkButton v-if="filtered" :disabled="listLocked" @click="resetFilters">{{ i18n.ts._feedback.resetFilters }}</MkButton>
						</div>
						<template v-else>
							<article v-for="item in items" :key="item.id" :class="[$style.item, $style[item.status]]" :data-feedback-id="item.id">
								<div :class="$style.itemSummary">
									<MkAvatar :user="item.user" :class="$style.feedAvatar"/>
									<div :class="$style.itemBody">
											<h3 :class="$style.feedHeading"><div :class="$style.feedAuthor"><MkA :to="userPage(item.user)" :class="$style.author"><MkUserName :user="item.user"/></MkA><MkTime :time="item.createdAt"/></div><span :class="$style.statusBadge"><i :class="statusIcon(item.status)" aria-hidden="true"></i>{{ statusLabel(item.status) }}</span></h3>
										<Mfm :text="item.description" :author="item.user" class="_selectable" :class="[$style.preview, $style.formattedText]"/>
										<MkMediaList v-if="item.files.length" :mediaList="item.files"/>
										<div :class="$style.metadata">
											<span :class="$style.categoryLabel"><i :class="categoryIcon(item.category)" aria-hidden="true"></i>{{ categoryLabel(item.category) }}</span>
											<div :class="$style.itemActions">
												<button v-if="canModerate" type="button" class="_button" :class="$style.responseEdit" :disabled="listLocked" aria-haspopup="dialog" @click="manageFeedback(item)"><i class="ti ti-adjustments" aria-hidden="true"></i>{{ i18n.ts._feedback.manage }}</button>
												<button v-if="$i && (canModerate || item.userId === $i.id)" type="button" class="_button" :class="$style.deleteButton" :disabled="listLocked" @click="remove(item)"><i class="ti ti-trash" aria-hidden="true"></i>{{ i18n.ts._feedback.delete }}</button>
											</div>
										</div>
										<div v-if="item.response || item.responseFiles.length || canModerate" :class="$style.response">
											<div :class="$style.responseHeader">
												<h4 :id="`${id}-response-label-${item.id}`"><i class="ti ti-shield-check" aria-hidden="true"></i>{{ i18n.ts._feedback.officialResponse }}</h4>
												<button v-if="canModerate && responseId !== item.id" type="button" class="_button" :class="$style.responseEdit" :aria-controls="`${id}-response-${item.id}`" :disabled="listLocked" @click="editReply(item)"><i :class="item.response ? 'ti ti-pencil' : 'ti ti-message-plus'" aria-hidden="true"></i>{{ item.response ? i18n.ts.edit : i18n.ts.reply }}</button>
											</div>
											<form v-if="responseId === item.id" :id="`${id}-response-${item.id}`" :class="$style.responseForm" :aria-labelledby="`${id}-response-label-${item.id}`" :aria-busy="saving" @submit.prevent="saveReply(item)">
												<MkPostFormInput ref="responseInputs" v-model="editResponse" v-model:files="responseFiles" :maxLength="CONTENT_LIMITS.feedbackText" :label="i18n.ts._feedback.officialResponse" :placeholder="i18n.ts._feedback.responsePlaceholder" :rows="4" :disabled="saving || deleting" @submit="saveReply(item)">
													<template #actions="{ busy }">
														<div :class="$style.responseActions">
															<MkButton type="button" small :disabled="saving || deleting || busy" @click="cancelReply">{{ i18n.ts.cancel }}</MkButton>
															<MkButton type="submit" small primary :wait="saving" :disabled="saving || deleting || busy || responseLength > CONTENT_LIMITS.feedbackText || !replyChanged(item)">{{ saving ? i18n.ts._feedback.saving : i18n.ts.save }}</MkButton>
														</div>
													</template>
												</MkPostFormInput>
											</form>
											<div v-else :id="`${id}-response-${item.id}`" class="_selectable" :class="[$style.responseContent, { [$style.muted]: !item.response && !item.responseFiles.length }]"><Mfm v-if="item.response" :text="item.response" :class="$style.formattedText"/><template v-else-if="!item.responseFiles.length">{{ i18n.ts._feedback.noResponse }}</template></div>
											<MkMediaList v-if="responseId !== item.id && item.responseFiles.length" :mediaList="item.responseFiles"/>
											<small>{{ i18n.ts._feedback.updatedAt }} <MkTime :key="item.updatedAt" :time="item.updatedAt" mode="absolute"/></small>
										</div>
										<p v-if="errorId === item.id" role="alert" :class="$style.detailError">{{ detailError }}</p>
									</div>
								</div>
							</article>
							<div v-if="pageActive && hasMore && !loadingMore && !loadError && !listLocked" v-appear="() => load(true)" :class="$style.sentinel" aria-hidden="true"></div>
							<MkLoading v-if="loadingMore" :class="$style.listFooter"/>
							<div v-if="loadError && failedMore" :class="$style.paginationError" role="alert"><p>{{ i18n.ts._feedback.loadFailed }}</p><MkButton small :disabled="listLocked" @click="load(true)">{{ i18n.ts._feedback.retry }}</MkButton></div>
						</template>
					</div>
				</section>
			</main>
			<aside :class="$style.aside">
				<section :class="$style.sideCard">
					<h2 :class="$style.sideTitle">{{ i18n.ts._feedback.guidelinesTitle }}</h2>
					<ol :class="$style.guidelines">
						<li v-for="guide in guides" :key="guide.icon"><span :class="$style.guideIcon"><i :class="guide.icon" aria-hidden="true"></i></span><span>{{ guide.text }}</span></li>
					</ol>
				</section>
				<section :class="$style.sideCard">
					<h2 :class="$style.sideTitle">{{ i18n.ts._feedback.workflowTitle }}</h2>
					<p :class="$style.sideText">{{ i18n.ts._feedback.workflowDescription }}</p>
					<ol :class="$style.workflow">
						<li v-for="step in statuses.slice(0, 3)" :key="step.key" :class="$style[step.key]"><span :class="$style.workflowDot"><i :class="step.icon" aria-hidden="true"></i></span>{{ step.label }}</li>
					</ol>
				</section>
				<section v-if="instance.maintainerEmail" :class="[$style.sideCard, $style.contact]">
					<h2 :class="$style.sideTitle"><i class="ti ti-mail" aria-hidden="true"></i>{{ i18n.ts._feedback.contactTitle }}</h2>
					<p :class="$style.sideText">{{ i18n.ts._feedback.contactDescription }}</p>
					<a :href="`mailto:${instance.maintainerEmail}`" class="_link">{{ instance.maintainerEmail }} <i class="ti ti-arrow-up-right" aria-hidden="true"></i></a>
				</section>
			</aside>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, inject, nextTick, onBeforeUnmount, ref, useId, useTemplateRef, watch } from 'vue';
import { CONTENT_LIMITS } from 'misskey-js';
import type { entities } from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkPostFormInput from '@/components/MkPostFormInput.vue';
import MkMediaList from '@/components/MkMediaList.vue';
import { i18n } from '@/i18n.js';
import { onSearchKeydown } from '@/utility/search-keydown.js';
import { $i } from '@/i.js';
import { instance } from '@/instance.js';
import { definePage } from '@/page.js';
import { DI } from '@/di.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { pleaseLogin } from '@/utility/please-login.js';
import { isAccountSessionErrorHandled } from '@/utility/account-session-error.js';
import { userPage } from '@@/js/user.js';
import * as os from '@/os.js';

type Feedback = entities.Feedback;
type Status = Feedback['status'];
type Category = Feedback['category'];

const id = useId();
const pageActive = inject(DI.pageActive, ref(true));
const categoryOptions = computed(() => categories.map(option => ({ value: option.key, label: option.label })));
const filterCategoryOptions = computed(() => [{ value: 'all' as const, label: i18n.ts._feedback.allCategories }, ...categoryOptions.value]);
const statusOptions = computed(() => statuses.map(option => ({ value: option.key, label: option.label })));
const categories = [
	{ key: 'bug', label: i18n.ts._feedback.bug, icon: 'ti ti-bug' },
	{ key: 'feature', label: i18n.ts._feedback.feature, icon: 'ti ti-bulb' },
	{ key: 'other', label: i18n.ts._feedback.other, icon: 'ti ti-message-circle' },
] as const;
const statuses = [
	{ key: 'open', label: i18n.ts._feedback.open, icon: 'ti ti-circle-dotted' },
	{ key: 'inProgress', label: i18n.ts._feedback.inProgress, icon: 'ti ti-progress' },
	{ key: 'resolved', label: i18n.ts._feedback.resolved, icon: 'ti ti-circle-check' },
	{ key: 'closed', label: i18n.ts._feedback.closed, icon: 'ti ti-circle-minus' },
] as const;
const guides = [
	{ icon: 'ti ti-search', text: i18n.ts._feedback.guideSearch },
	{ icon: 'ti ti-list-details', text: i18n.ts._feedback.guideDetails },
	{ icon: 'ti ti-circle-check', text: i18n.ts._feedback.guideProgress },
];
const statusLabel = (value: Status) => statuses.find(s => s.key === value)?.label;
const statusIcon = (value: Status) => statuses.find(s => s.key === value)?.icon;
const categoryLabel = (value: Category) => categories.find(c => c.key === value)?.label;
const categoryIcon = (value: Category) => categories.find(c => c.key === value)?.icon;
const canModerate = $i?.isAdmin || $i?.isModerator;
const items = ref<Feedback[]>([]);
const counts = ref<Record<Status | 'all', number> | null>(null);
const total = ref(0);
const nextOffset = ref(0);
const hasMore = ref(false);
const query = ref('');
const category = ref<Category | 'all'>('all');
const status = ref<Status | 'all'>('all');
const mine = ref(false);
const sort = ref<'latest' | 'updated'>('latest');
const filtered = computed(() => Boolean(query.value.trim()) || category.value !== 'all' || status.value !== 'all' || mine.value);
const loading = ref(true);
const loadingMore = ref(false);
const loadError = ref(false);
const failedMore = ref(false);
let requestVersion = 0;
let controller: AbortController | undefined;
let searchTimer: number | undefined;
let disposed = false;
let suppressFilterReload = false;
const draftCategory = ref<Category>('bug');
const draftDescription = ref('');
const draftFiles = ref<entities.DriveFile[]>([]);
const draftEditor = useTemplateRef('draftEditor');
const publishing = ref(false);
const responseId = ref<string | null>(null);
const editResponse = ref('');
const responseFiles = ref<entities.DriveFile[]>([]);
const descriptionLength = computed(() => Array.from(draftDescription.value).length);
const responseLength = computed(() => Array.from(editResponse.value).length);
const responseInputs = useTemplateRef<InstanceType<typeof MkPostFormInput>[]>('responseInputs');
const managing = ref(false);
const saving = ref(false);
const deleting = ref(false);
const detailError = ref('');
const errorId = ref<string | null>(null);
const listLocked = computed(() => publishing.value || draftEditor.value?.busy || managing.value || saving.value || deleting.value || responseId.value !== null);

function cancelListRequest() {
	window.clearTimeout(searchTimer);
	controller?.abort();
	requestVersion++;
	loadingMore.value = false;
}

async function load(append = false) {
	if (disposed) return;
	if (append && (!pageActive.value || loading.value || loadingMore.value || listLocked.value || !hasMore.value)) return;
	window.clearTimeout(searchTimer);
	controller?.abort();
	controller = new AbortController();
	const version = ++requestVersion;
	loading.value = !append;
	loadingMore.value = append;
	loadError.value = false;
	failedMore.value = false;
	try {
		const result = await misskeyApi('feedback/list', {
			limit: 20, offset: append ? nextOffset.value : 0,
			query: query.value.trim() || undefined,
			category: category.value === 'all' ? undefined : category.value,
			status: status.value === 'all' ? undefined : status.value,
			mine: mine.value, sort: sort.value,
		}, undefined, controller.signal);
		if (version !== requestVersion) return;
		nextOffset.value = (append ? nextOffset.value : 0) + result.items.length;
		items.value = append ? [...new Map([...items.value, ...result.items].map(item => [item.id, item])).values()] : result.items;
		total.value = result.total;
		hasMore.value = result.items.length > 0 && nextOffset.value < result.total;
		counts.value = result.counts;
		// A full refresh invalidates the editor baseline, including changes by another moderator.
		if (!append || (responseId.value && !items.value.some(item => item.id === responseId.value))) {
			responseId.value = null;
			editResponse.value = '';
		}
		errorId.value = null;
		detailError.value = '';
	} catch {
		if (version !== requestVersion) return;
		loadError.value = true;
		failedMore.value = append;
	} finally {
		if (version === requestVersion) {
			loading.value = false;
			loadingMore.value = false;
		}
	}
}

function resetFilters() {
	query.value = '';
	category.value = 'all';
	status.value = 'all';
	mine.value = false;
}

watch([query, category, status, mine, sort], (current, previous) => {
	if (suppressFilterReload) return;
	window.clearTimeout(searchTimer);
	controller?.abort();
	requestVersion++;
	loading.value = true;
	loadingMore.value = false;
	responseId.value = null;
	editResponse.value = '';
	errorId.value = null;
	detailError.value = '';
	if (current[0] !== previous[0]) searchTimer = window.setTimeout(() => { void load(); }, 300);
	else void load();
});
onBeforeUnmount(() => {
	disposed = true;
	window.clearTimeout(searchTimer);
	requestVersion++;
	controller?.abort();
});
void load();

async function publish() {
	if (listLocked.value) return;
	if (!$i) {
		await pleaseLogin({ message: i18n.ts._feedback.signInToPublish });
		return;
	}
	const description = draftDescription.value.trim();
	const title = Array.from(description.split('\n')[0] || i18n.ts._feedback.title).slice(0, CONTENT_LIMITS.feedbackTitle).join('');
	const publishError = !description && !draftFiles.value.length ? i18n.ts._feedback.draftRequired
		: descriptionLength.value > CONTENT_LIMITS.feedbackText ? i18n.ts._feedback.descriptionTooLong : '';
	if (publishError) { os.toast(publishError, 'error'); return; }
	publishing.value = true;
	try {
		await misskeyApi('feedback/create', { title, description, category: draftCategory.value, fileIds: draftFiles.value.map(file => file.id) });
		if (disposed) return;
		draftEditor.value?.submitted();
		draftCategory.value = 'bug';
		suppressFilterReload = true;
		resetFilters();
		sort.value = 'latest';
		await nextTick();
		suppressFilterReload = false;
		await load();
	} catch (error) {
		if (!disposed && !isAccountSessionErrorHandled(error)) os.toast(i18n.ts._feedback.publishFailed, 'error');
	} finally {
		publishing.value = false;
	}
}

function updateFeedback(updated: Feedback) {
	const previous = items.value.find(item => item.id === updated.id);
	if (!previous) return;
	if (previous.status !== updated.status && counts.value) {
		counts.value = {
			...counts.value,
			[previous.status]: Math.max(0, counts.value[previous.status] - 1),
			[updated.status]: counts.value[updated.status] + 1,
		};
	}
	if (status.value !== 'all' && updated.status !== status.value) {
		items.value = items.value.filter(item => item.id !== updated.id);
		total.value = Math.max(0, total.value - 1);
		nextOffset.value = Math.max(0, nextOffset.value - 1);
	} else {
		items.value = items.value.map(item => item.id === updated.id ? updated : item);
		if (sort.value === 'updated') {
			items.value.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
		}
	}
}

async function editReply(item: Feedback) {
	if (!canModerate || listLocked.value) return;
	cancelListRequest();
	responseId.value = item.id;
	editResponse.value = item.response ?? '';
	responseFiles.value = [...item.responseFiles];
	detailError.value = '';
	errorId.value = null;
	await nextTick();
	if (disposed || responseId.value !== item.id || saving.value || deleting.value) return;
	responseInputs.value?.[0]?.focus();
}

function cancelReply() {
	if (saving.value || deleting.value) return;
	responseId.value = null;
	editResponse.value = '';
}

async function saveReply(item: Feedback) {
	if (!canModerate || responseId.value !== item.id || saving.value || deleting.value || responseInputs.value?.[0]?.busy || responseFiles.value.length > 16) return;
	if (responseLength.value > CONTENT_LIMITS.feedbackText) {
		os.toast(i18n.ts._feedback.descriptionTooLong, 'error');
		return;
	}
	const response = editResponse.value.trim() || null;
	if (!replyChanged(item)) return;
	saving.value = true;
	try {
		const updated = await misskeyApi('feedback/update', { feedbackId: item.id, response, responseFileIds: responseFiles.value.map(file => file.id) });
		if (disposed) return;
		updateFeedback(updated);
		responseInputs.value?.[0]?.submitted();
		responseId.value = null;
		editResponse.value = '';
		os.toast(i18n.ts.saved, 'success');
	} catch (error) {
		if (!disposed && !isAccountSessionErrorHandled(error)) os.toast(i18n.ts._feedback.updateFailed, 'error');
	} finally {
		saving.value = false;
	}
}

function replyChanged(item: Feedback) {
	return editResponse.value.trim() !== (item.response ?? '') || responseFiles.value.map(file => file.id).join(',') !== item.responseFiles.map(file => file.id).join(',');
}

async function manageFeedback(item: Feedback) {
	if (!canModerate || listLocked.value) return;
	cancelListRequest();
	managing.value = true;
	detailError.value = '';
	errorId.value = null;
	try {
		const selection = await os.select({
			title: i18n.ts._feedback.manage,
			items: statusOptions.value,
			default: item.status,
		});
		if (selection.canceled || disposed || selection.result === item.status) return;
		saving.value = true;
		const updated = await misskeyApi('feedback/update', { feedbackId: item.id, status: selection.result });
		if (disposed) return;
		updateFeedback(updated);
	} catch {
		detailError.value = i18n.ts._feedback.updateFailed;
		errorId.value = item.id;
	} finally {
		saving.value = false;
		managing.value = false;
	}
}

async function remove(item: Feedback) {
	if (!$i || (!canModerate && item.userId !== $i.id) || listLocked.value) return;
	cancelListRequest();
	deleting.value = true;
	detailError.value = '';
	errorId.value = null;
	try {
		const { canceled } = await os.confirm({ type: 'warning', text: i18n.ts._feedback.deleteConfirm });
		if (canceled || disposed) return;
		await misskeyApi('feedback/delete', { feedbackId: item.id });
		os.toast(i18n.ts.deleteSucceeded, 'success');
		await load();
	} catch {
		detailError.value = i18n.ts._feedback.deleteFailed;
		errorId.value = item.id;
	} finally {
		deleting.value = false;
	}
}

definePage(() => ({ title: i18n.ts._feedback.title, icon: 'ti ti-messages', needWideArea: true }));
</script>

<style lang="scss" module>
@use '../styles/search.scss' as search;

// 以 14px 为基准，辅助信息不低于 12px。
// 状态色：待处理用警示色，处理中用主色，已解决用成功色，已关闭用弱化色。
.all { --MI-statusColor: var(--MI_THEME-fg); }
.open { --MI-statusColor: var(--MI_THEME-warn); }
.inProgress { --MI-statusColor: var(--MI_THEME-accent); }
.resolved { --MI-statusColor: var(--MI_THEME-success); }
.closed { --MI-statusColor: var(--MI_THEME-fgTransparentWeak); }

.sentinel { height: 1px; }
.layout { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: var(--MI-pageGap); align-items: start; }
.main, .aside { display: flex; flex-direction: column; gap: var(--MI-pageGap); min-width: 0; }
// 与时间线、帖子详情一致：右栏固定在可视区内，只有左侧随页面滚动；右栏超过屏幕高度时才在自身范围内滚动，不显示滚动条。
.aside {
	position: sticky;
	top: var(--MI-stickyTop, 0px);
	max-height: calc(100dvh - var(--MI-stickyTop, 0px) - 2 * var(--MI-pageGap, 18px));
	overflow-y: auto;
	overscroll-behavior: contain;
	scrollbar-width: none;

	&::-webkit-scrollbar { display: none; }
	> * { flex-shrink: 0; }
}

// 发布区：顶部标题，下方直接输入，不跳转页面。
.composer {
	overflow: clip;
	border-radius: var(--MI-cardRadius);
	background: var(--MI_THEME-panel);
}

.hero {
	position: relative;
	display: flex;
	align-items: center;
	gap: 14px;
	padding: 22px var(--MI-cardPadding) 18px;
}

.heroIcon {
	display: grid;
	flex-shrink: 0;
	place-items: center;
	width: 48px;
	height: 48px;
	border-radius: calc(var(--MI-radius) * 2);
	background: var(--MI_THEME-accent);
	color: var(--MI_THEME-fgOnAccent);
	font-size: 26px;
	box-shadow: 0 6px 16px color-mix(in srgb, var(--MI_THEME-accent) 30%, transparent);
}

.heroText {
	min-width: 0;

	h1 { margin: 0; font-size: 1.35em; font-weight: 700; line-height: 1.4; }
	p { margin: 4px 0 0; color: var(--MI_THEME-fgTransparent); line-height: 1.6; }
}

.form { padding: 4px var(--MI-cardPadding) var(--MI-cardPadding); }
// 分类和发布按钮放进工具栏，与左侧操作图标同行；工具图标 30px，分类和按钮统一 33px 高，行内垂直居中。
.composeActions { flex: 1; display: flex; align-items: center; justify-content: flex-end; gap: 12px; min-width: 0; }
.select {
	min-width: 128px;
	max-width: 100%;

	// 隐藏的分类 label 占位不占高度，否则下拉框比同行的发布按钮低 8px。
	> :first-child {
		height: 0;
		padding: 0;
		overflow: hidden;
	}
}
.selectLabel { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
// 看板：顶部状态统计兼作筛选，下方排序、搜索和列表。
.board { overflow: clip; border-radius: var(--MI-cardRadius); background: var(--MI_THEME-panel); }
// 面向读屏软件的看板标题，视觉上由状态统计卡承担。
.boardHeading { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

.statusFilters {
	display: grid;
	grid-template-columns: repeat(5, minmax(0, 1fr));
	gap: 8px;
	padding: var(--MI-cardPadding) var(--MI-cardPadding) 0;
}

.statusFilter {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 2px;
	min-width: 0;
	padding: 10px 12px;
	border: var(--MI-divider);
	border-radius: calc(var(--MI-radius) * 1.6);
	text-align: left;
	transition: border-color .15s ease, background-color .15s ease;

	&:hover:not(:disabled) { border-color: color-mix(in srgb, var(--MI-statusColor) 45%, var(--MI-dividerColor)); }

	&.activeFilter {
		border-color: var(--MI-statusColor);
		background: color-mix(in srgb, var(--MI-statusColor) 8%, var(--MI_THEME-panel));
	}
}

.statusCount {
	color: var(--MI-statusColor);
	font-size: 1.4em;
	font-weight: 700;
	line-height: 1.3;
	font-variant-numeric: tabular-nums;
}

.statusName {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	max-width: 100%;
	overflow: hidden;
	color: var(--MI_THEME-fgTransparent);
	font-size: .9em;
	white-space: nowrap;
	text-overflow: ellipsis;

	> i { color: var(--MI-statusColor); }
}

.boardHeader {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px 16px;
	padding: 6px var(--MI-cardPadding) 0;
	border-bottom: var(--MI-divider);
}

.scope { display: flex; gap: 20px; }
.scope button { position: relative; padding: 12px 0; color: var(--MI_THEME-fgTransparent); font-weight: 600; }
.scope button:hover:not(:disabled) { color: var(--MI_THEME-fg); }
.scope button.scopeActive { color: var(--MI_THEME-accent); }
// 选中指示条贴合底部 1px 分割线。
.scopeActive::after { content: ''; position: absolute; height: 3px; bottom: -1px; left: 0; right: 0; border-radius: 3px; background: var(--MI_THEME-accent); }
// “我的反馈”是筛选项，与排序分开摆放。
.mineToggle { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 999px; color: var(--MI_THEME-fgTransparent); font-weight: 600; }
.mineToggle:has(i) { font-size: .95em; }
.mineToggle:hover:not(:disabled) { color: var(--MI_THEME-fg); background: var(--MI_THEME-buttonHoverBg); }
.mineToggle.scopeActive { color: var(--MI_THEME-accent); background: var(--MI_THEME-accentedBg); }
.mineToggle.scopeActive::after { display: none; }

.toolbar { display: flex; flex: 1; align-items: flex-end; justify-content: flex-end; gap: 8px; min-width: 0; padding: 6px 0; }
.search {
	@include search.container;
	--MI-searchHeight: 33px;
	flex: 0 1 260px;
	> i { @include search.icon; }
}
.search input { @include search.input; width: 100%; }

.iconButton { display: grid; place-items: center; flex-shrink: 0; width: 33px; height: 33px; border-radius: 8px; color: var(--MI_THEME-fgTransparentWeak); font-size: 18px; }
.iconButton:hover:not(:disabled) { color: var(--MI_THEME-accent); background: var(--MI_THEME-accentedBg); }
// 列表项：状态由右上角标签表达，不额外画左侧细条，也不做整行悬停高亮。
.item {
	padding: var(--MI-cardPadding);

	& + & { border-top: var(--MI-divider); }
}

.itemSummary { display: flex; gap: 12px; }
.feedAvatar { width: 40px; height: 40px; flex-shrink: 0; }
.itemBody { flex: 1; min-width: 0; }
// 条目标题不放大字号，只为标题导航提供正确层级。
.feedHeading { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin: 0; font-size: 1em; font-weight: normal; }
.feedAuthor { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.feedAuthor > :last-child { color: var(--MI_THEME-fgTransparentWeak); font-size: .9em; }
.author { max-width: 100%; overflow: hidden; color: var(--MI_THEME-fg); font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }

.statusBadge {
	display: inline-flex;
	flex-shrink: 0;
	align-items: center;
	gap: 4px;
	padding: 3px 10px;
	border-radius: 999px;
	background: color-mix(in srgb, var(--MI-statusColor) 12%, transparent);
	color: var(--MI-statusColor);
	font-size: .9em;
	font-weight: 600;
	line-height: 1.5;
}

.formattedText { display: block; min-width: 0; max-width: 100%; overflow-wrap: anywhere; }
.preview { margin: 8px 0; color: var(--MI_THEME-fg); line-height: 1.75; }

.metadata { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 10px; color: var(--MI_THEME-fgTransparentWeak); font-size: .9em; line-height: 1.5; }
.categoryLabel { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 6px; background: var(--MI_THEME-buttonBg); color: var(--MI_THEME-fgTransparent); }
.itemActions { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin-left: auto; }
.responseEdit { color: var(--MI_THEME-accent); }
.deleteButton { color: var(--MI_THEME-error); }

// 管理员回复用引用块，与用户内容区分。
.response {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
	margin-top: 8px;
	padding: 8px 12px;
	border-left: 3px solid var(--MI_THEME-accent);
	border-radius: 0 8px 8px 0;
	background: var(--MI_THEME-accentedBg);
}
.responseHeader { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.response h4 { display: flex; align-items: center; gap: 6px; margin: 0; color: var(--MI_THEME-accent); font-size: .95em; }
.responseContent { min-width: 0; max-width: 100%; margin: 0; overflow-wrap: anywhere; line-height: 1.6; }
.response small { color: var(--MI_THEME-fgTransparentWeak); font-size: .85em; }
.responseForm { display: flex; flex-direction: column; gap: 8px; margin: 4px 0; }
.responseActions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; }
// 编辑时保存按钮与左侧操作图标同行，由 MkPostFormInput 的工具栏布局承载。
.muted { color: var(--MI_THEME-fgTransparentWeak); }
.detailError { margin: 8px 0 0; color: var(--MI_THEME-error); line-height: 1.6; }

.listFooter { display: flex; justify-content: center; padding: 12px var(--MI-cardPadding); border-top: var(--MI-divider); }
.paginationError { display: flex; align-items: center; flex-wrap: wrap; justify-content: center; gap: 8px; padding: 0 var(--MI-cardPadding) 12px; color: var(--MI_THEME-error); }
.empty { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 300px; padding: var(--MI-cardPadding); text-align: center; }
.emptyTitle { margin: 18px 0 0; font-size: 1.15em; font-weight: 700; }
.empty p { margin: 8px 0 20px; color: var(--MI_THEME-fgTransparentWeak); line-height: 1.7; }
.emptyIcon { color: var(--MI_THEME-fgTransparentWeak); font-size: 36px; }
.emptyArtwork { display: grid; place-items: center; width: 76px; height: 76px; border-radius: 50%; background: var(--MI_THEME-accentedBg); color: var(--MI_THEME-accent); font-size: 34px; }
// 侧栏
.sideCard { padding: var(--MI-cardPadding); border-radius: var(--MI-cardRadius); background: var(--MI_THEME-panel); }
.sideTitle { display: flex; align-items: center; gap: 6px; margin: 0 0 14px; font-size: 1.05em; font-weight: 700; }
.sideText { margin: 0 0 16px; color: var(--MI_THEME-fgTransparentWeak); line-height: 1.7; }

.guidelines { display: flex; flex-direction: column; gap: 14px; margin: 0; padding: 0; list-style: none; }
.guidelines li { display: flex; align-items: flex-start; gap: 10px; color: var(--MI_THEME-fgTransparent); line-height: 1.7; }
.guideIcon { display: grid; flex-shrink: 0; place-items: center; width: 28px; height: 28px; border-radius: 8px; background: var(--MI_THEME-accentedBg); color: var(--MI_THEME-accent); font-size: 16px; }

.workflow {
	position: relative;
	display: flex;
	justify-content: space-between;
	margin: 0;
	padding: 0;
	list-style: none;

	&::before {
		content: '';
		position: absolute;
		top: 16px;
		left: 16%;
		right: 16%;
		height: 2px;
		background: linear-gradient(90deg, var(--MI_THEME-warn), var(--MI_THEME-accent), var(--MI_THEME-success));
		opacity: .35;
	}

	li { position: relative; display: flex; flex: 1; flex-direction: column; align-items: center; gap: 8px; color: var(--MI_THEME-fgTransparent); font-size: .9em; }
}
.workflowDot { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; background: color-mix(in srgb, var(--MI-statusColor) 14%, var(--MI_THEME-panel)); color: var(--MI-statusColor); font-size: 18px; }

.contact a { overflow-wrap: anywhere; }

@container (max-width: 1000px) {
	.layout { grid-template-columns: minmax(0, 1fr) 240px; }
	.statusFilter { padding: 8px 10px; }
	.toolbar { flex-basis: 100%; justify-content: stretch; }
	.search { flex: 1 1 auto; }
}
@container (max-width: 780px) {
	.layout { grid-template-columns: minmax(0, 1fr); }
	.aside { position: static; max-height: none; overflow: visible; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
	.contact { grid-column: 1 / -1; }
}
@container (max-width: 480px) {
	.statusFilters { display: flex; overflow-x: auto; scrollbar-width: none; }
	.statusFilter { flex: 0 0 auto; min-width: 84px; }
	.composeActions { flex-wrap: wrap; }
	.feedAvatar { width: 32px; height: 32px; }
	.itemActions { margin-left: 0; }
	.aside { grid-template-columns: minmax(0, 1fr); }
}
.page button:focus-visible, .page a:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: 2px; }

@media (prefers-reduced-motion: reduce) {
	.statusFilter, .item, .search { transition: none; }
}
</style>
