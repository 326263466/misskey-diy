<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :hideHeader="true">
	<div class="_pageBody" :class="$style.page" data-testid="feedback-page">
		<div :class="$style.layout">
			<main :class="$style.main">
				<header :class="$style.heading" data-testid="feedback-header">
					<div :class="$style.headingBody">
						<div :class="$style.headingIcon"><i class="ti ti-mailbox" aria-hidden="true"></i></div>
						<div><h1>{{ i18n.ts._feedback.title }}</h1><p>{{ i18n.ts._feedback.description }}</p></div>
					</div>
					<form :class="$style.form" :aria-busy="publishing" novalidate @submit.prevent="publish">
						<textarea v-model="draftDescription" name="feedback-description" :class="[$style.input, $style.composeInput]" :aria-label="i18n.ts._feedback.descriptionLabel" :placeholder="i18n.ts._feedback.publishDescription" rows="2" maxlength="10000" :disabled="publishing"></textarea>
						<div :class="$style.composeActions">
							<MkSelect v-model="draftCategory" :items="categoryOptions" small :class="$style.select" :disabled="publishing"><template #label><span :class="$style.selectLabel">{{ i18n.ts._feedback.category }}</span></template></MkSelect>
							<MkButton type="submit" primary data-testid="feedback-publish" :wait="publishing" :disabled="publishing || !draftDescription.trim()">{{ publishing ? i18n.ts._feedback.submitting : i18n.ts._feedback.publish }}</MkButton>
						</div>
						<p v-if="publishError" role="alert" :class="$style.error">{{ publishError }}</p>
					</form>
				</header>
				<section class="_panel" :class="$style.board" :aria-label="i18n.ts._feedback.board">
					<div :class="$style.boardHeader">
						<div :class="$style.scope" role="group" :aria-label="i18n.ts._feedback.board">
							<button type="button" class="_button" :class="{ [$style.scopeActive]: !mine && sort === 'latest' }" :aria-pressed="!mine && sort === 'latest'" @click="mine = false; sort = 'latest'">{{ i18n.ts._feedback.latest }}</button>
							<button type="button" class="_button" :class="{ [$style.scopeActive]: !mine && sort === 'updated' }" :aria-pressed="!mine && sort === 'updated'" @click="mine = false; sort = 'updated'">{{ i18n.ts._feedback.updated }}</button>
							<button v-if="$i" type="button" class="_button" :class="{ [$style.scopeActive]: mine }" :aria-pressed="mine" @click="mine = true">{{ i18n.ts._feedback.mine }}</button>
						</div>
						<button type="button" class="_button" :class="$style.iconButton" :aria-label="i18n.ts.reload" :disabled="loading || loadingMore" @click="load()"><i class="ti ti-refresh" aria-hidden="true"></i></button>
					</div>
					<div :class="$style.toolbar">
						<label :class="$style.search"><i class="ti ti-search" aria-hidden="true"></i><input v-model="query" type="search" maxlength="100" :placeholder="i18n.ts._feedback.searchPlaceholder" :aria-label="i18n.ts._feedback.searchPlaceholder"></label>
						<MkSelect v-model="category" :items="filterCategoryOptions" small :class="$style.select"><template #label><span :class="$style.selectLabel">{{ i18n.ts._feedback.category }}</span></template></MkSelect>
					</div>
					<div :class="$style.statusFilters" data-testid="feedback-status-filters" role="group" :aria-label="i18n.ts._feedback.status">
						<button type="button" class="_button" :class="[$style.statusFilter, { [$style.activeFilter]: status === 'all' }]" :aria-pressed="status === 'all'" @click="status = 'all'">{{ i18n.ts.all }}<span>{{ counts?.all ?? '–' }}</span></button>
						<button v-for="option in statuses" :key="option.key" type="button" class="_button" :class="[$style.statusFilter, { [$style.activeFilter]: status === option.key }]" :aria-pressed="status === option.key" @click="status = option.key"><i :class="[option.icon, $style[option.key]]" aria-hidden="true"></i>{{ option.label }}<span>{{ counts?.[option.key] ?? '–' }}</span></button>
					</div>
					<div :aria-busy="loading">
						<div v-if="loading" :class="$style.empty" role="status"><MkLoading/><p>{{ i18n.ts._feedback.loading }}</p></div>
						<div v-else-if="loadError && !failedMore" :class="$style.empty" role="alert"><i class="ti ti-cloud-off" :class="$style.emptyIcon" aria-hidden="true"></i><p>{{ i18n.ts._feedback.loadFailed }}</p><MkButton @click="load()">{{ i18n.ts._feedback.retry }}</MkButton></div>
						<div v-else-if="items.length === 0" :class="$style.empty">
							<div :class="$style.emptyArtwork"><i :class="filtered ? 'ti ti-search' : 'ti ti-message-plus'" aria-hidden="true"></i></div>
							<h3>{{ filtered ? i18n.ts._feedback.noResults : i18n.ts._feedback.emptyTitle }}</h3><p>{{ filtered ? i18n.ts._feedback.noResultsDescription : i18n.ts._feedback.emptyDescription }}</p>
							<MkButton v-if="filtered" @click="resetFilters">{{ i18n.ts._feedback.resetFilters }}</MkButton>
						</div>
						<template v-else>
							<article v-for="item in items" :key="item.id" :class="[$style.item, { [$style.expanded]: selectedId === item.id }]" :data-feedback-id="item.id">
								<div :class="$style.itemSummary">
									<MkAvatar :user="item.user" :class="$style.feedAvatar"/>
									<div :class="$style.itemBody">
										<div :class="$style.feedHeading"><div :class="$style.feedAuthor"><MkA :to="userPage(item.user)" :class="$style.author">{{ item.user.name || item.user.username }}</MkA><MkTime :time="item.createdAt"/></div><span :class="[$style.statusBadge, $style[item.status]]"><i :class="statusIcon(item.status)" aria-hidden="true"></i>{{ statusLabel(item.status) }}</span></div>
										<div :class="$style.itemHeading"><h3><button type="button" class="_button" :class="$style.titleButton" :aria-expanded="selectedId === item.id" :aria-controls="`${id}-detail-${item.id}`" :disabled="saving || deleting" @click="toggleDetails(item)">{{ item.title }}<i :class="selectedId === item.id ? 'ti ti-chevron-up' : 'ti ti-chevron-down'" aria-hidden="true"></i></button></h3></div>
										<p class="_selectable" :class="$style.preview">{{ item.description }}</p>
										<div :class="$style.metadata"><span :class="$style.categoryLabel"><i :class="categoryIcon(item.category)" aria-hidden="true"></i>{{ categoryLabel(item.category) }}</span><span v-if="item.response" :class="$style.replied"><i class="ti ti-message-check" aria-hidden="true"></i>{{ i18n.ts._feedback.officialResponse }}</span></div>
											<div v-if="item.response || selectedId === item.id" :class="$style.response"><h4><i class="ti ti-shield-check" aria-hidden="true"></i>{{ i18n.ts._feedback.officialResponse }}</h4><p class="_selectable" :class="{ [$style.muted]: !item.response }">{{ item.response || i18n.ts._feedback.noResponse }}</p><small>{{ i18n.ts._feedback.updatedAt }} <MkTime :key="item.updatedAt" :time="item.updatedAt" mode="absolute"/></small></div>
										<div v-if="selectedId === item.id" :id="`${id}-detail-${item.id}`" :class="$style.details">
											<form v-if="canModerate" :class="$style.manage" :aria-label="i18n.ts._feedback.manage" :aria-busy="saving" @submit.prevent="save(item)">
												<h4>{{ i18n.ts._feedback.manage }}</h4><div :class="$style.field"><MkSelect v-model="editStatus" :items="statusOptions" small :class="$style.select" :disabled="saving || deleting"><template #label><span :class="$style.selectLabel">{{ i18n.ts._feedback.status }}</span></template></MkSelect></div>
												<label :class="$style.field"><span>{{ i18n.ts._feedback.officialResponse }}</span><textarea v-model="editResponse" :class="$style.input" :placeholder="i18n.ts._feedback.responsePlaceholder" rows="4" maxlength="10000" :disabled="saving || deleting"></textarea></label>
						<MkButton type="submit" primary :wait="saving" :disabled="saving || deleting || !editChanged(item)">{{ saving ? i18n.ts._feedback.saving : i18n.ts._feedback.save }}</MkButton>
											</form>
											<p v-if="detailError" role="alert" :class="$style.error">{{ detailError }}</p>
											<button v-if="$i && (canModerate || item.userId === $i.id)" type="button" class="_button" :class="$style.deleteButton" :disabled="saving || deleting" @click="remove(item)"><i class="ti ti-trash" aria-hidden="true"></i>{{ i18n.ts._feedback.delete }}</button>
										</div>
									</div>
								</div>
							</article>
							<footer :class="$style.listFooter"><span>{{ i18n.tsx._feedback.results({ count: total }) }}</span><MkButton v-if="nextOffset < total" small :wait="loadingMore" @click="load(true)">{{ i18n.ts._feedback.loadMore }}</MkButton></footer>
							<div v-if="loadError && failedMore" :class="$style.paginationError" role="alert"><p>{{ i18n.ts._feedback.loadFailed }}</p><MkButton small @click="load(true)">{{ i18n.ts._feedback.retry }}</MkButton></div>
						</template>
					</div>
				</section>
			</main>
			<aside :class="$style.aside">
				<section class="_panel" :class="$style.sideCard"><h2>{{ i18n.ts._feedback.guidelinesTitle }}</h2><ul :class="$style.guidelines"><li><i class="ti ti-search" aria-hidden="true"></i><span>{{ i18n.ts._feedback.guideSearch }}</span></li><li><i class="ti ti-list-details" aria-hidden="true"></i><span>{{ i18n.ts._feedback.guideDetails }}</span></li><li><i class="ti ti-circle-check" aria-hidden="true"></i><span>{{ i18n.ts._feedback.guideProgress }}</span></li></ul></section>
				<section class="_panel" :class="$style.sideCard"><h2>{{ i18n.ts._feedback.workflowTitle }}</h2><p>{{ i18n.ts._feedback.workflowDescription }}</p><div :class="$style.workflow"><span v-for="step in statuses.slice(0, 3)" :key="step.key"><i :class="[step.icon, $style[step.key]]" aria-hidden="true"></i>{{ step.label }}</span></div></section>
				<section v-if="instance.maintainerEmail" class="_panel" :class="$style.contact"><h2><i class="ti ti-mail" aria-hidden="true"></i> {{ i18n.ts._feedback.contactTitle }}</h2><p>{{ i18n.ts._feedback.contactDescription }}</p><a :href="`mailto:${instance.maintainerEmail}`" class="_link">{{ instance.maintainerEmail }} <i class="ti ti-arrow-up-right" aria-hidden="true"></i></a></section>
			</aside>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
import type { entities } from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkSelect from '@/components/MkSelect.vue';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import { instance } from '@/instance.js';
import { definePage } from '@/page.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { pleaseLogin } from '@/utility/please-login.js';
import { userPage } from '@/filters/user.js';
import * as os from '@/os.js';

type Feedback = entities.Feedback;
type Status = Feedback['status'];
type Category = Feedback['category'];

const id = useId();
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
const statusLabel = (value: Status) => statuses.find(s => s.key === value)?.label;
const statusIcon = (value: Status) => statuses.find(s => s.key === value)?.icon;
const categoryLabel = (value: Category) => categories.find(c => c.key === value)?.label;
const categoryIcon = (value: Category) => categories.find(c => c.key === value)?.icon;
const canModerate = $i?.isAdmin || $i?.isModerator;
const items = ref<Feedback[]>([]);
const counts = ref<Record<Status | 'all', number> | null>(null);
const total = ref(0);
const nextOffset = ref(0);
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
const publishing = ref(false);
const publishError = ref('');
const selectedId = ref<string | null>(null);
const editStatus = ref<Status>('open');
const editResponse = ref('');
const saving = ref(false);
const deleting = ref(false);
const detailError = ref('');

async function load(append = false) {
	if (disposed) return;
	if (append && (loading.value || loadingMore.value)) return;
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
		counts.value = result.counts;
		// A full refresh invalidates the editor baseline, including changes by another moderator.
		if (!append || (selectedId.value && !items.value.some(item => item.id === selectedId.value))) selectedId.value = null;
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
	selectedId.value = null;
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
	if (publishing.value) return;
	if (!$i) {
		await pleaseLogin({ message: i18n.ts._feedback.signInToPublish });
		return;
	}
	const description = draftDescription.value.trim();
	const title = Array.from(description.split('\n')[0]).slice(0, 120).join('');
	publishError.value = !description ? i18n.ts._feedback.draftRequired
		: Array.from(description).length > 10000 ? i18n.ts._feedback.descriptionTooLong : '';
	if (publishError.value) return;
	publishing.value = true;
	try {
		await misskeyApi('feedback/create', { title, description, category: draftCategory.value });
		if (disposed) return;
		draftDescription.value = '';
		draftCategory.value = 'bug';
		suppressFilterReload = true;
		resetFilters();
		sort.value = 'latest';
		await nextTick();
		suppressFilterReload = false;
		await load();
	} catch {
		publishError.value = i18n.ts._feedback.publishFailed;
	} finally {
		publishing.value = false;
	}
}

function toggleDetails(item: Feedback) {
	if (saving.value || deleting.value) return;
	selectedId.value = selectedId.value === item.id ? null : item.id;
	editStatus.value = item.status;
	editResponse.value = item.response ?? '';
	detailError.value = '';
}

function editChanged(item: Feedback) {
	return editStatus.value !== item.status || editResponse.value.trim() !== (item.response ?? '');
}

async function save(item: Feedback) {
	if (!canModerate || saving.value || deleting.value || !editChanged(item)) return;
	saving.value = true;
	detailError.value = '';
	try {
		const updated = await misskeyApi('feedback/update', { feedbackId: item.id, status: editStatus.value, response: editResponse.value.trim() || null });
		if (disposed) return;
		items.value = items.value.map(entry => entry.id === updated.id ? updated : entry);
		editResponse.value = updated.response ?? '';
		await load();
	} catch {
		detailError.value = i18n.ts._feedback.updateFailed;
	} finally {
		saving.value = false;
	}
}

async function remove(item: Feedback) {
	if (!$i || saving.value || deleting.value) return;
	deleting.value = true;
	detailError.value = '';
	try {
		const { canceled } = await os.confirm({ type: 'warning', text: i18n.ts._feedback.deleteConfirm });
		if (canceled || disposed) return;
		await misskeyApi('feedback/delete', { feedbackId: item.id });
		selectedId.value = null;
		await load();
	} catch {
		detailError.value = i18n.ts._feedback.deleteFailed;
	} finally {
		deleting.value = false;
	}
}

definePage(() => ({ title: i18n.ts._feedback.title, icon: 'ti ti-messages', needWideArea: true }));
</script>

<style lang="scss" module>
.heading { display: flex; flex-direction: column; gap: 24px; padding: var(--MI-cardPadding); border-radius: var(--MI-cardRadius); background: var(--MI_THEME-panel); }
.headingBody { display: flex; align-items: center; gap: 16px; min-width: 0; }
.heading h1 { margin: 0 0 8px; font-size: 24px; letter-spacing: -0.5px; }
.headingBody p { margin: 0; color: var(--MI_THEME-fgTransparentWeak); line-height: 1.7; font-size: .85em; }
.headingIcon { display: grid; place-items: center; flex-shrink: 0; width: 68px; height: 68px; color: var(--MI_THEME-warn); background: color-mix(in srgb, var(--MI_THEME-warn) 18%, var(--MI_THEME-panel)); border-radius: var(--MI-radius); font-size: 38px; }
.layout { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: var(--MI-pageGap); align-items: start; }
.main, .aside { display: flex; flex-direction: column; gap: var(--MI-pageGap); min-width: 0; }
.aside { position: sticky; top: var(--MI-stickyTop, 0px); max-height: calc(100dvh - var(--MI-stickyTop, 0px) - 2 * var(--MI-pageGap, 18px)); overflow-y: auto; }
.aside > * { flex-shrink: 0; }
.aside {
	scrollbar-width: none;
	&::-webkit-scrollbar { display: none; }
}
.board, .sideCard { border-radius: var(--MI-cardRadius); }
.board { overflow: clip; }
.iconButton { display: grid; place-items: center; flex-shrink: 0; width: 36px; height: 36px; border-radius: var(--MI-radius); color: var(--MI_THEME-fgTransparentWeak); font-size: 18px; }
.iconButton:hover { color: var(--MI_THEME-accent); background: var(--MI_THEME-accentedBg); }
.composeInput { min-height: calc(2lh + 26px); resize: none; field-sizing: content; }
.composeActions { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.form { display: flex; flex-direction: column; gap: 18px; }
.field { display: flex; flex-direction: column; gap: 9px; font-size: 13px; font-weight: 600; }
.field > span { display: flex; justify-content: space-between; gap: 8px; }
.input { box-sizing: border-box; width: 100%; min-width: 0; padding: 12px 14px; color: var(--MI_THEME-fg); background: var(--MI_THEME-panel); border: 1px solid var(--MI_THEME-inputBorder); border-radius: 8px; font: inherit; font-weight: 400; line-height: 1.7; }
textarea.input:not(.composeInput) { resize: none; min-height: 100px; }
.input::placeholder, .search input::placeholder { color: var(--MI_THEME-fgTransparentWeak); }
.input:focus, .search:focus-within { border-color: var(--MI_THEME-accent); }
.error { color: var(--MI_THEME-error); margin: 0; line-height: 1.6; font-size: 13px; }
.boardHeader { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 var(--MI-cardPadding); border-bottom: 1px solid var(--MI_THEME-divider); }
.scope { display: flex; gap: 24px; }
.scope button { position: relative; padding: 20px 0; color: var(--MI_THEME-fgTransparentWeak); font-weight: 600; }
.scope button.scopeActive { color: var(--MI_THEME-accent); }
.scopeActive::after { content: ''; position: absolute; height: 3px; bottom: -1px; left: 0; right: 0; border-radius: 3px; background: var(--MI_THEME-accent); }
.toolbar { display: flex; gap: 10px; padding: var(--MI-cardPadding); }
.search { display: flex; align-items: center; flex: 1; min-width: 0; gap: 8px; padding: 0 12px; background: var(--MI_THEME-bg); border: 1px solid transparent; border-radius: 8px; color: var(--MI_THEME-fgTransparentWeak); }
.search input { width: 100%; min-width: 0; padding: 11px 0; color: var(--MI_THEME-fg); font: inherit; font-size: 13px; background: transparent; border: 0; outline: 0; }
.select { min-width: 120px; max-width: 100%; }
.selectLabel { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.statusFilters { display: flex; gap: 6px; padding: 0 var(--MI-cardPadding) var(--MI-cardPadding); overflow-x: auto; }
.statusFilter { display: flex; align-items: center; justify-content: center; gap: 6px; flex-shrink: 0; border-radius: 6px; padding: 7px 9px; font-size: 12px; white-space: nowrap; color: var(--MI_THEME-fgTransparentWeak); }
.statusFilter > span { min-width: 12px; text-align: center; font-variant-numeric: tabular-nums; font-size: 11px; }
.statusFilter:hover { background: var(--MI_THEME-buttonHoverBg); }
.statusFilter.activeFilter { color: var(--MI_THEME-accent); background: var(--MI_THEME-accentedBg); font-weight: 600; }
.open { color: var(--MI_THEME-fgTransparentWeak); }
.inProgress { color: var(--MI_THEME-link); }
.resolved { color: var(--MI_THEME-success); }
.closed { color: var(--MI_THEME-fgTransparentWeak); }
.item { border-top: 1px solid var(--MI_THEME-divider); padding: var(--MI-cardPadding); }
.item { transition: background .15s; }
.item:hover, .item.expanded { background: color-mix(in srgb, var(--MI_THEME-accent) 3%, var(--MI_THEME-panel)); }
.itemSummary { display: flex; gap: 14px; }
.feedAvatar { width: 40px; height: 40px; flex-shrink: 0; }
.feedHeading { display: flex; align-items: start; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.feedAuthor { display: flex; flex-direction: column; gap: 4px; font-size: .9em; }
.feedAuthor > :last-child { color: var(--MI_THEME-fgTransparentWeak); font-size: .8em; }
.itemBody { flex: 1; min-width: 0; }
.itemHeading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.itemHeading h3 { margin: 0; font-size: 15px; line-height: 1.5; overflow-wrap: anywhere; }
.titleButton { display: inline-flex; align-items: baseline; gap: 8px; text-align: start; font-weight: 600; }
.titleButton i { flex-shrink: 0; color: var(--MI_THEME-fgTransparentWeak); font-size: .8em; }
.titleButton:hover { color: var(--MI_THEME-accent); }
.statusBadge { display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; padding: 3px 7px; border-radius: 5px; font-size: 11px; line-height: 1.5; background: color-mix(in srgb, currentColor 8%, transparent); }
.preview { color: var(--MI_THEME-fg); font-size: 14px; line-height: 1.85; margin: 10px 0 16px; white-space: pre-wrap; overflow-wrap: anywhere; }
.metadata { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-top: 12px; color: var(--MI_THEME-fgTransparentWeak); font-size: 11px; line-height: 1.5; }
.author { max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.categoryLabel { display: inline-flex; align-items: center; gap: 4px; color: var(--MI_THEME-link); background: color-mix(in srgb, var(--MI_THEME-link) 7%, transparent); border-radius: 4px; padding: 3px 7px; }
.replied { display: inline-flex; align-items: center; gap: 4px; margin-left: auto; color: var(--MI_THEME-success); }
.details { padding-top: 16px; }
.fullDescription { margin: 0 0 20px; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.8; font-size: 14px; }
.response { margin-top: 16px; padding: var(--MI-cardPadding); border-radius: 8px; background: var(--MI_THEME-accentedBg); }
.response h4 { display: flex; align-items: center; gap: 7px; margin: 0; color: var(--MI_THEME-accent); font-size: 13px; }
.response p { margin: 10px 0; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.7; font-size: 13px; }
.response small { color: var(--MI_THEME-fgTransparentWeak); font-size: 11px; }
.muted { color: var(--MI_THEME-fgTransparentWeak); }
.manage { display: flex; flex-direction: column; align-items: stretch; gap: 14px; margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--MI_THEME-divider); }
.manage h4 { margin: 0; font-size: 14px; }
.manage > button { align-self: flex-end; }
.details .error { margin-top: 14px; }
.deleteButton { display: flex; align-items: center; gap: 6px; margin-top: 20px; color: var(--MI_THEME-error); font-size: 12px; }
.listFooter { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: var(--MI-cardPadding); border-top: 1px solid var(--MI_THEME-divider); color: var(--MI_THEME-fgTransparentWeak); font-size: 12px; }
.paginationError { display: flex; align-items: center; flex-wrap: wrap; justify-content: center; gap: 12px; padding: 0 var(--MI-cardPadding) var(--MI-cardPadding); color: var(--MI_THEME-error); font-size: 13px; }
.empty { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 290px; padding: var(--MI-cardPadding); text-align: center; border-top: 1px solid var(--MI_THEME-divider); }
.empty h3 { margin: 18px 0 0; font-size: 16px; }
.empty p { margin: 12px 0 22px; color: var(--MI_THEME-fgTransparentWeak); font-size: 13px; line-height: 1.7; }
.emptyIcon { color: var(--MI_THEME-fgTransparentWeak); font-size: 36px; }
.emptyArtwork { display: grid; place-items: center; width: 72px; height: 72px; font-size: 32px; color: var(--MI_THEME-accent); background: var(--MI_THEME-accentedBg); border-radius: 50%; }
.sideCard { padding: var(--MI-cardPadding); }
.sideCard h2, .contact h2 { margin: 0; font-size: 14px; line-height: 1.7; }
.sideCard p, .contact p { color: var(--MI_THEME-fgTransparentWeak); font-size: 12px; line-height: 1.8; margin: 10px 0 18px; }
.guidelines { list-style: none; padding: 0; margin: 18px 0 0; display: flex; flex-direction: column; gap: 16px; }
.guidelines li { display: flex; align-items: flex-start; gap: 10px; color: var(--MI_THEME-fgTransparentWeak); font-size: 12px; line-height: 1.8; }
.guidelines i { color: var(--MI_THEME-accent); font-size: 18px; margin-top: 2px; }
.workflow { display: flex; justify-content: space-between; gap: 8px; position: relative; }
.workflow::before { content: ''; position: absolute; left: 24px; right: 24px; top: 10px; height: 1px; background: var(--MI_THEME-divider); }
.workflow span { display: flex; flex-direction: column; align-items: center; gap: 9px; position: relative; font-size: 11px; }
.workflow i { padding: 0 6px; font-size: 20px; background: var(--MI_THEME-panel); }
.contact { padding: var(--MI-cardPadding); }
.contact p { margin-bottom: 10px; }
.contact a { font-size: 12px; overflow-wrap: anywhere; }

@container (max-width: 1000px) {
	.layout { grid-template-columns: minmax(0, 1fr) 240px; gap: var(--MI-pageGap); }
	.toolbar { flex-wrap: wrap; }
	.search { flex-basis: 100%; }
	.toolbar .select { flex: 1; }
}
@container (max-width: 780px) {
	.layout { grid-template-columns: minmax(0, 1fr); }
	.aside { position: static; max-height: none; overflow: visible; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
	.contact { grid-column: 1 / -1; }
	.heading h1 { font-size: 23px; }
}
@container (max-width: 480px) {
	.heading { gap: 16px; }
	.headingBody { gap: 12px; }
	.headingIcon { width: 42px; height: 42px; font-size: 23px; }
	.heading h1 { font-size: 21px; margin-bottom: 4px; }
	.headingBody p { font-size: 12px; }
	.scope { gap: 18px; font-size: 13px; }
	.itemSummary { gap: 10px; }
	.feedAvatar { width: 30px; height: 30px; }
	.feedHeading { gap: 6px; }
	.itemHeading { flex-direction: column; gap: 7px; }
	.itemHeading h3 { font-size: 14px; }
	.replied { margin-left: 0; }
	.aside { grid-template-columns: minmax(0, 1fr); }
	.details { margin-left: -40px; }
}
.page button:focus-visible, .page a:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) { .item { transition: none; } }
</style>
