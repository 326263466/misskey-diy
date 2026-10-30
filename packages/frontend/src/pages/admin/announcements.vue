<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard :actions="headerActions" :tabs="headerTabs">
	<div ref="pageContainer" class="_pageBody">
		<div class="_gaps">
			<MkInfo>{{ i18n.ts._announcement.shouldNotBeUsedToPresentPermanentInfo }}</MkInfo>
			<MkInfo v-if="announcementsStatus === 'active' && filteredAnnouncements.length > 5" warn>{{ i18n.ts._announcement.tooManyActiveAnnouncementDescription }}</MkInfo>

			<div class="_adminPanel">
				<div class="_adminToolbar">
					<MkSelect v-model="announcementsStatus" :items="announcementsStatusDef" class="_adminToolbarField">
						<template #label>{{ i18n.ts.filter }}</template>
					</MkSelect>
					<div class="_adminToolbarActions">
						<MkButton small primary :disabled="loading || loadError || announcementsStatus === 'archived'" @click="add"><i class="ti ti-plus" aria-hidden="true"></i> {{ i18n.ts.add }}</MkButton>
					</div>
				</div>

				<MkPaginationBar v-slot="{ items }" v-model:page="currentPage" :items="filteredAnnouncements" :hasMore="hasMore" :loadMore="more" :disabled="loading || loadError || !pageActive || !componentActive">
					<MkLoading v-if="loading"/>
					<MkError v-else-if="loadError" @retry="refresh"/>

					<template v-else>
						<div class="_adminTableContainer">
							<table class="_adminTable">
								<thead>
									<tr>
										<th scope="col">{{ i18n.ts.title }}</th>
										<th scope="col">{{ i18n.ts.display }}</th>
										<th scope="col">{{ i18n.ts.state }}</th>
										<th scope="col">{{ i18n.ts._announcement.autoArchiveAt }}</th>
										<th scope="col" class="_adminTableNumber">{{ i18n.ts.statistics }}</th>
										<th scope="col" class="_adminTableActions">{{ i18n.ts.operations }}</th>
									</tr>
								</thead>
								<tbody>
									<tr v-if="filteredAnnouncements.length === 0">
										<td colspan="6"><div class="_adminTableEmpty">{{ i18n.ts.nothing }}</div></td>
									</tr>
									<template v-for="announcement in items" :key="announcement._id ?? announcement.id ?? undefined">
										<tr>
											<td class="_adminTableMain">
												<div class="_adminTableIdentity">
													<i v-if="announcement.icon === 'info'" class="ti ti-info-circle" aria-hidden="true"></i>
													<i v-else-if="announcement.icon === 'warning'" class="ti ti-alert-triangle" style="color: var(--MI_THEME-warn);" aria-hidden="true"></i>
													<i v-else-if="announcement.icon === 'error'" class="ti ti-circle-x" style="color: var(--MI_THEME-error);" aria-hidden="true"></i>
													<i v-else-if="announcement.icon === 'success'" class="ti ti-check" style="color: var(--MI_THEME-success);" aria-hidden="true"></i>
													<strong>{{ announcement.title }}</strong>
												</div>
												<div class="_adminTableSecondary" :class="$style.announcementText">{{ announcement.text }}</div>
											</td>
											<td>{{ announcement.display === 'normal' ? i18n.ts._announcement.normalDisplay : announcement.display === 'banner' ? i18n.ts.banner : i18n.ts.dialog }}</td>
											<td><span class="_adminTableStatus" :style="announcement.id == null || !announcement.isActive ? { '--admin-statusColor': 'var(--MI_THEME-fgTransparentWeak)' } : undefined">{{ announcement.id == null ? i18n.ts.draft : announcement.isActive ? i18n.ts._announcement.published : i18n.ts.archived }}</span></td>
											<td :class="$style.autoArchiveAt">
												<MkTime v-if="announcement.autoArchiveAt" :key="announcement.autoArchiveAt" :time="announcement.autoArchiveAt" mode="absolute"/>
												<span v-else class="_adminTableSecondary">{{ i18n.ts.notSet }}</span>
											</td>
											<td class="_adminTableNumber">{{ i18n.tsx.nUsersRead({ n: announcement.reads ?? 0 }) }}</td>
											<td class="_adminTableActions">
												<button type="button" class="_button _textButton" @click="openEditor(announcement, $event)">
													<i class="ti ti-pencil" aria-hidden="true"></i> {{ i18n.ts.edit }}
												</button>
											</td>
										</tr>
									</template>
								</tbody>
							</table>
						</div>
					</template>
				</MkPaginationBar>
			</div>
		</div>
	</div>
</PageWithHeader>
<Teleport to="#misskey-popups" defer>
	<MkModalWindow
		v-if="editingAnnouncement"
		ref="editorWindow"
		:width="680"
		:height="720"
		autoHeight
		:closeOnBackdrop="false"
		headerIcon="ti ti-speakerphone"
		role="dialog"
		tabindex="-1"
		aria-modal="true"
		:aria-label="i18n.ts.edit"
		@closed="onEditorClosed"
	>
		<template #header>{{ i18n.ts.edit }} · {{ i18n.ts.announcements }}</template>
		<div :class="$style.editor">
			<div class="_gaps">
				<MkInput v-model="editingAnnouncement.title" :counterMaxLength="Misskey.CONTENT_LIMITS.announcementTitle">
					<template #label>{{ i18n.ts.title }}</template>
				</MkInput>
				<MkTextarea v-model="editingAnnouncement.text" :counterMaxLength="Misskey.CONTENT_LIMITS.announcementText" mfmAutocomplete :mfmPreview="true">
					<template #label>{{ i18n.ts.text }}</template>
				</MkTextarea>
				<MkInput v-model="editingAnnouncement.imageUrl" type="url">
					<template #label>{{ i18n.ts.imageUrl }}</template>
				</MkInput>
				<MkInput v-model="editingAnnouncement.autoArchiveAt" type="datetime-local">
					<template #label>{{ i18n.ts._announcement.autoArchiveAt }}</template>
					<template #caption>{{ i18n.ts._announcement.autoArchiveAtDescription }}</template>
				</MkInput>
				<MkRadios
					v-model="editingAnnouncement.icon"
					:options="[
						{ value: 'info', icon: 'ti ti-info-circle' },
						{ value: 'warning', icon: 'ti ti-alert-triangle', iconStyle: 'color: var(--MI_THEME-warn);' },
						{ value: 'error', icon: 'ti ti-circle-x', iconStyle: 'color: var(--MI_THEME-error);' },
						{ value: 'success', icon: 'ti ti-check', iconStyle: 'color: var(--MI_THEME-success);' },
					]"
				>
					<template #label>{{ i18n.ts.icon }}</template>
				</MkRadios>
				<MkRadios
					v-model="editingAnnouncement.display"
					:options="[
						{ value: 'normal', label: i18n.ts._announcement.normalDisplay },
						{ value: 'banner', label: i18n.ts.banner },
						{ value: 'dialog', label: i18n.ts.dialog },
					]"
				>
					<template #label>{{ i18n.ts.display }}</template>
				</MkRadios>
				<MkInfo v-if="editingAnnouncement.display === 'dialog'" warn>{{ i18n.ts._announcement.dialogAnnouncementUxWarn }}</MkInfo>
				<MkSwitch v-model="editingAnnouncement.forExistingUsers" :helpText="i18n.ts._announcement.forExistingUsersDescription">
					{{ i18n.ts._announcement.forExistingUsers }}
				</MkSwitch>
				<MkSwitch v-model="editingAnnouncement.silence" :helpText="i18n.ts._announcement.silenceDescription">
					{{ i18n.ts._announcement.silence }}
				</MkSwitch>
				<MkSwitch v-model="editingAnnouncement.needConfirmationToRead" :helpText="i18n.ts._announcement.needConfirmationToReadDescription">
					{{ i18n.ts._announcement.needConfirmationToRead }}
				</MkSwitch>
				<div class="_buttons">
					<MkButton primary :disabled="!validContent(editingAnnouncement)" @click="save(editingAnnouncement)">
						<i :class="isSaved(editingAnnouncement) ? 'ti ti-check' : 'ti ti-device-floppy'" aria-hidden="true"></i>
						<span :class="$style.buttonLabel">
							<span :class="$style.labelSizer" aria-hidden="true">{{ i18n.ts.save }}</span>
							<span :class="$style.labelSizer" aria-hidden="true">{{ i18n.ts.saved }}</span>
							<span aria-live="polite">{{ isSaved(editingAnnouncement) ? i18n.ts.saved : i18n.ts.save }}</span>
						</span>
					</MkButton>
					<MkButton v-if="editingAnnouncement.id != null" @click="setActive(editingAnnouncement, !editingAnnouncement.isActive)">
						<i :class="editingAnnouncement.isActive ? 'ti ti-check' : 'ti ti-restore'" aria-hidden="true"></i>
						<span :class="$style.buttonLabel">
							<span :class="$style.labelSizer" aria-hidden="true">{{ i18n.ts._announcement.published }} · {{ i18n.ts._announcement.end }} ({{ i18n.ts.archive }})</span>
							<span :class="$style.labelSizer" aria-hidden="true">{{ i18n.ts.archived }} · {{ i18n.ts.unarchive }}</span>
							<span aria-live="polite"><template v-if="activeFeedback.has(editingAnnouncement)">{{ editingAnnouncement.isActive ? i18n.ts._announcement.published : i18n.ts.archived }} · </template>{{ editingAnnouncement.isActive ? `${i18n.ts._announcement.end} (${i18n.ts.archive})` : i18n.ts.unarchive }}</span>
						</span>
					</MkButton>
					<MkButton v-if="editingAnnouncement.id != null" danger @click="del(editingAnnouncement)"><i class="ti ti-trash"></i> {{ i18n.ts.delete }}</MkButton>
				</div>
			</div>
		</div>
	</MkModalWindow>
</Teleport>
</template>

<script lang="ts" setup>
import { ref, computed, watch, onBeforeUnmount, onActivated, onDeactivated, inject, nextTick, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkPaginationBar from '@/components/MkPaginationBar.vue';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkRadios from '@/components/MkRadios.vue';
import MkInfo from '@/components/MkInfo.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkTextarea from '@/components/MkTextarea.vue';
import { genId } from '@/utility/id.js';
import { useMkSelect } from '@/composables/use-mkselect.js';
import { formatDateTimeString } from '@/utility/format-time-string.js';
import { isAccountSessionErrorHandled } from '@/utility/account-session-error.js';
import { DI } from '@/di.js';

const {
	model: announcementsStatus,
	def: announcementsStatusDef,
} = useMkSelect({
	items: [
		{ label: i18n.ts._announcement.active, value: 'active' },
		{ label: i18n.ts.archived, value: 'archived' },
	],
	initialValue: 'active',
});

const loading = ref(true);
const loadingMore = ref(false);
const loadError = ref(false);
const hasMore = ref(false);
const pageLimit = 10;
let lastLoadedId: string | undefined;
let listRequest = 0;
let disposed = false;

type EditableAnnouncement = Omit<Misskey.entities.AdminAnnouncementsListResponse[number], 'id' | 'createdAt' | 'updatedAt' | 'reads' | 'isActive' | 'autoArchiveAt'> & {
	id: string | null;
	_id?: string;
	isActive?: Misskey.entities.AdminAnnouncementsListResponse[number]['isActive'];
	reads?: Misskey.entities.AdminAnnouncementsListResponse[number]['reads'];
	autoArchiveAt: string;
	originalAutoArchiveAt: Misskey.entities.AdminAnnouncementsListResponse[number]['autoArchiveAt'];
};

const announcements = ref<EditableAnnouncement[]>([]);
const pageActive = inject(DI.pageActive, ref(true));
const componentActive = ref(true);
const currentPage = ref(1);
const filteredAnnouncements = computed(() => announcements.value.filter(announcement => announcement.id == null
	? announcementsStatus.value === 'active'
	: announcement.isActive === (announcementsStatus.value === 'active')));

const editingAnnouncement = ref<EditableAnnouncement | null>(null);
const editorWindow = useTemplateRef('editorWindow');
const pageContainer = useTemplateRef('pageContainer');
let editorFocusTarget: HTMLElement | null = null;

function openEditor(announcement: EditableAnnouncement, event?: PointerEvent) {
	if (!pageActive.value || !componentActive.value) return;
	editorFocusTarget = event?.currentTarget instanceof HTMLElement ? event.currentTarget : window.document.activeElement instanceof HTMLElement ? window.document.activeElement : null;
	editingAnnouncement.value = announcement;
}

function onEditorClosed() {
	editingAnnouncement.value = null;
	const target = editorFocusTarget;
	editorFocusTarget = null;
	if (!target || !pageActive.value || !componentActive.value) return;
	nextTick(() => {
		if (!pageActive.value || !componentActive.value) return;
		const nextTarget = target?.isConnected ? target : pageContainer.value?.querySelector<HTMLButtonElement>('button');
		nextTarget?.focus({ preventScroll: true });
	});
}

function dismissEditor() {
	editorFocusTarget = null;
	editingAnnouncement.value = null;
}

watch(pageActive, value => {
	if (!value) dismissEditor();
}, { flush: 'sync' });
onActivated(() => { componentActive.value = true; });
onDeactivated(() => {
	componentActive.value = false;
	dismissEditor();
});

watch(announcements, items => {
	if (editingAnnouncement.value != null && !items.includes(editingAnnouncement.value)) editorWindow.value?.close();
});

const pendingAnnouncements = new Set<EditableAnnouncement>();
const savedContent = ref(new Map<EditableAnnouncement, string>());
const savedText = new Map<string, { title: string; text: string }>();
const activeFeedback = ref(new Set<EditableAnnouncement>());

function validContent(announcement: EditableAnnouncement): boolean {
	const previous = announcement.id != null ? savedText.get(announcement.id) : null;
	return (announcement.title === previous?.title || Array.from(announcement.title).length <= Misskey.CONTENT_LIMITS.announcementTitle) &&
		(announcement.text === previous?.text || Array.from(announcement.text).length <= Misskey.CONTENT_LIMITS.announcementText);
}

function getAnnouncementContent(announcement: EditableAnnouncement): string {
	return JSON.stringify([
		announcement.title,
		announcement.text,
		announcement.imageUrl,
		announcement.autoArchiveAt,
		announcement.icon,
		announcement.display,
		announcement.forExistingUsers,
		announcement.silence,
		announcement.needConfirmationToRead,
	]);
}

function isSaved(announcement: EditableAnnouncement): boolean {
	return savedContent.value.get(announcement) === getAnnouncementContent(announcement);
}

function toEditableAnnouncement(announcement: Misskey.entities.AdminAnnouncementsListResponse[number]): EditableAnnouncement {
	return {
		...announcement,
		autoArchiveAt: announcement.autoArchiveAt ? formatDateTimeString(new Date(announcement.autoArchiveAt), 'yyyy-MM-ddTHH:mm') : '',
		originalAutoArchiveAt: announcement.autoArchiveAt,
	};
}

function toAutoArchiveAt(value: string, originalValue: Misskey.entities.AdminAnnouncementsListResponse[number]['autoArchiveAt']): number | null {
	if (originalValue != null && value === formatDateTimeString(new Date(originalValue), 'yyyy-MM-ddTHH:mm')) {
		return new Date(originalValue).getTime();
	}

	return value === '' ? null : new Date(value).getTime();
}

watch(announcementsStatus, refresh, { immediate: true });
onBeforeUnmount(() => {
	listRequest++;
	disposed = true;
});

function add() {
	currentPage.value = 1;
	announcements.value.unshift({
		_id: genId(),
		id: null,
		title: i18n.ts._announcement.newTitle,
		text: '',
		imageUrl: null,
		icon: 'info',
		display: 'normal',
		forExistingUsers: false,
		silence: false,
		needConfirmationToRead: false,
		autoArchiveAt: '',
		originalAutoArchiveAt: null,
		userId: null,
	});
	openEditor(announcements.value[0]);
}

async function runAction(announcement: EditableAnnouncement, action: () => Promise<void>) {
	if (pendingAnnouncements.has(announcement)) return;
	pendingAnnouncements.add(announcement);
	try {
		await action();
	} catch (error) {
		if (disposed || isAccountSessionErrorHandled(error)) return;
		const { code, id } = (typeof error === 'object' && error !== null ? error : {}) as { code?: string; id?: string };
		let message = i18n.ts.somethingHappened;
		if (code === 'INVALID_AUTO_ARCHIVE_AT') {
			message = id === '2a892bd5-487d-46a2-a5fe-3d85ad51defe' ? i18n.ts._announcement.autoArchiveAtMustBeInFuture : i18n.ts._datePicker.invalid;
		} else if (code === 'INVALID_PARAM') {
			message = i18n.ts.invalidParamErrorDescription;
		} else if (code === 'ROLE_PERMISSION_DENIED' || code === 'PERMISSION_DENIED') {
			message = i18n.ts.permissionDeniedErrorDescription;
		} else if (code === 'RATE_LIMIT_EXCEEDED') {
			message = i18n.ts.cannotPerformTemporaryDescription;
		}
		os.toast(message, 'error');
	} finally {
		pendingAnnouncements.delete(announcement);
	}
}

function del(announcement: EditableAnnouncement) {
	const id = announcement.id;
	if (id == null) return;
	return runAction(announcement, async () => {
		const { canceled } = await os.confirm({
			type: 'warning',
			text: i18n.tsx.deleteAreYouSure({ x: announcement.title }),
		});
		if (canceled || disposed) return;
		await misskeyApi('admin/announcements/delete', { id });
		if (disposed) return;
		announcements.value = announcements.value.filter(x => x !== announcement);
		savedContent.value.delete(announcement);
		savedText.delete(id);
		activeFeedback.value.delete(announcement);
		os.toast(i18n.ts.removed, 'success');
	});
}

function setActive(announcement: EditableAnnouncement, isActive: boolean) {
	const id = announcement.id;
	if (id == null) return;
	return runAction(announcement, async () => {
		const { _id, autoArchiveAt, originalAutoArchiveAt, ...data } = announcement;
		const autoArchiveAtMs = toAutoArchiveAt(autoArchiveAt, originalAutoArchiveAt);
		const nextAutoArchiveAt = isActive && autoArchiveAtMs != null && autoArchiveAtMs <= Date.now() ? null : autoArchiveAtMs;
		const content = getAnnouncementContent({ ...announcement, autoArchiveAt: nextAutoArchiveAt == null ? '' : autoArchiveAt });
		await misskeyApi('admin/announcements/update', {
			...data,
			id,
			isActive,
			autoArchiveAt: nextAutoArchiveAt,
		});
		if (disposed) return;
		if (announcements.value.includes(announcement)) {
			announcement.isActive = isActive;
			announcement.originalAutoArchiveAt = nextAutoArchiveAt == null ? null : new Date(nextAutoArchiveAt).toISOString();
			if (nextAutoArchiveAt == null && announcement.autoArchiveAt === autoArchiveAt) announcement.autoArchiveAt = '';
			savedContent.value.set(announcement, content);
			savedText.set(id, { title: data.title, text: data.text });
			activeFeedback.value.add(announcement);
		}
	});
}

function save(announcement: EditableAnnouncement) {
	if (!validContent(announcement)) return;
	return runAction(announcement, async () => {
		const { _id, id, isActive, reads, autoArchiveAt, originalAutoArchiveAt, ...data } = announcement;
		const autoArchiveAtMs = toAutoArchiveAt(autoArchiveAt, originalAutoArchiveAt);
		const content = getAnnouncementContent(announcement);
		if (id == null) {
			if (autoArchiveAtMs != null && (Number.isNaN(autoArchiveAtMs) || autoArchiveAtMs <= Date.now())) {
				os.toast(i18n.ts._announcement.autoArchiveAtMustBeInFuture, 'error');
				return;
			}

			const created = await misskeyApi('admin/announcements/create', {
				...data,
				autoArchiveAt: autoArchiveAtMs,
			});
			if (disposed) return;
			// 只回填服务端标识，保留保存期间的编辑和其他草稿，不重建公告表单。
			announcement.id = created.id;
			announcement.isActive = true;
			announcement.originalAutoArchiveAt = autoArchiveAtMs == null ? null : new Date(autoArchiveAtMs).toISOString();
		} else {
			await misskeyApi('admin/announcements/update', {
				...data,
				id,
				isActive,
				autoArchiveAt: autoArchiveAtMs,
			});
			if (disposed) return;
			announcement.originalAutoArchiveAt = autoArchiveAtMs == null ? null : new Date(autoArchiveAtMs).toISOString();
		}
		if (disposed) return;
		if (announcements.value.includes(announcement)) {
			savedContent.value.set(announcement, content);
			if (announcement.id != null) savedText.set(announcement.id, { title: data.title, text: data.text });
		}
		os.toast(i18n.ts.saved, 'success');
	});
}

async function loadPage(append: boolean): Promise<boolean> {
	if (append && (loading.value || loadingMore.value || !hasMore.value)) return false;
	// 消费游标独立于可见列表，删除或归档整页后仍能继续加载。
	const untilId = append ? lastLoadedId : undefined;
	if (append && untilId == null) return false;
	const status = announcementsStatus.value;
	const request = append ? listRequest : ++listRequest;
	if (append) loadingMore.value = true;
	else {
		currentPage.value = 1;
		loading.value = true;
		loadingMore.value = false;
		loadError.value = false;
		hasMore.value = false;
	}
	try {
		const response = await misskeyApi('admin/announcements/list', {
			status,
			limit: pageLimit + 1,
			...(untilId == null ? {} : { untilId }),
		});
		if (request !== listRequest || status !== announcementsStatus.value) return false;
		const page = response.slice(0, pageLimit).map(toEditableAnnouncement);
		const nextCursor = page.at(-1)?.id ?? undefined;
		const seenIds = new Set(append ? announcements.value.map(announcement => announcement.id) : []);
		const nextItems = page.filter(announcement => !seenIds.has(announcement.id));
		if (!append) {
			savedContent.value.clear();
			savedText.clear();
			activeFeedback.value.clear();
		}
		for (const announcement of nextItems) {
			if (announcement.id != null) savedText.set(announcement.id, { title: announcement.title, text: announcement.text });
		}
		announcements.value = append ? [...announcements.value, ...nextItems] : nextItems;
		lastLoadedId = nextCursor ?? (append ? lastLoadedId : undefined);
		hasMore.value = response.length > pageLimit && nextCursor != null && (!append || untilId == null || nextCursor < untilId);
		return true;
	} catch {
		if (request !== listRequest) return false;
		if (append) os.toast(i18n.ts.somethingHappened, 'error');
		else loadError.value = true;
		return false;
	} finally {
		if (request === listRequest) {
			loading.value = false;
			loadingMore.value = false;
		}
	}
}

// 由分页组件补载；游标前进但可见条目未增加时也返回 true，继续补载。
function more() {
	if (!pageActive.value || !componentActive.value) return Promise.resolve(false);
	return loadPage(true);
}

function refresh() {
	return loadPage(false);
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.announcements,
	icon: 'ti ti-speakerphone',
}));
</script>

<style lang="scss" module>
.editor {
	padding: 20px;
}

.buttonLabel {
	display: grid;

	> span {
		grid-area: 1 / 1;
	}
}

.labelSizer {
	visibility: hidden;
}

.announcementText {
	display: -webkit-box;
	overflow: hidden;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
}

.autoArchiveAt {
	white-space: nowrap;
}
</style>
