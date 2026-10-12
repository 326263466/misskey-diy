<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard :actions="headerActions" :tabs="headerTabs">
	<div class="_pageBody">
		<div class="_gaps">
			<MkInfo>{{ i18n.ts._announcement.shouldNotBeUsedToPresentPermanentInfo }}</MkInfo>
			<MkInfo v-if="announcementsStatus === 'active' && announcements.length > 5" warn>{{ i18n.ts._announcement.tooManyActiveAnnouncementDescription }}</MkInfo>

			<MkSelect v-model="announcementsStatus" :items="announcementsStatusDef">
				<template #label>{{ i18n.ts.filter }}</template>
			</MkSelect>

			<MkLoading v-if="loading" page/>
			<MkError v-else-if="error" page @retry="refresh"/>
			<MkResult v-else-if="announcements.length === 0" type="empty" page/>

			<template v-else>
				<MkFolder v-for="announcement in announcements" :key="announcement.id ?? announcement._id" :defaultOpen="announcement.id == null">
					<template #label><Mfm :text="announcement.title" :plain="true" :nowrap="true"/></template>
					<template #icon>
						<i v-if="announcement.icon === 'info'" class="ti ti-info-circle"></i>
						<i v-else-if="announcement.icon === 'warning'" class="ti ti-alert-triangle" style="color: var(--MI_THEME-warn);"></i>
						<i v-else-if="announcement.icon === 'error'" class="ti ti-circle-x" style="color: var(--MI_THEME-error);"></i>
						<i v-else-if="announcement.icon === 'success'" class="ti ti-check" style="color: var(--MI_THEME-success);"></i>
					</template>
					<template #caption><Mfm :text="announcement.text" :plain="true" :nowrap="true"/></template>
					<template #footer>
						<div class="_buttons">
							<MkButton rounded primary :disabled="!validContent(announcement)" @click="save(announcement)"><i class="ti ti-device-floppy"></i> {{ i18n.ts.save }}</MkButton>
							<MkButton v-if="announcement.id != null && announcement.isActive" rounded @click="archive(announcement)"><i class="ti ti-check"></i> {{ i18n.ts._announcement.end }} ({{ i18n.ts.archive }})</MkButton>
							<MkButton v-if="announcement.id != null && !announcement.isActive" rounded @click="unarchive(announcement)"><i class="ti ti-restore"></i> {{ i18n.ts.unarchive }}</MkButton>
							<MkButton v-if="announcement.id != null" rounded danger @click="del(announcement)"><i class="ti ti-trash"></i> {{ i18n.ts.delete }}</MkButton>
						</div>
					</template>

					<div class="_gaps">
						<MkInput v-model="announcement.title" :counterMaxLength="Misskey.CONTENT_LIMITS.announcementTitle">
							<template #label>{{ i18n.ts.title }}</template>
						</MkInput>
						<MkTextarea v-model="announcement.text" :counterMaxLength="Misskey.CONTENT_LIMITS.announcementText" mfmAutocomplete :mfmPreview="true">
							<template #label>{{ i18n.ts.text }}</template>
						</MkTextarea>
						<MkInput v-model="announcement.imageUrl" type="url">
							<template #label>{{ i18n.ts.imageUrl }}</template>
						</MkInput>
						<MkRadios
							v-model="announcement.icon"
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
							v-model="announcement.display"
							:options="[
								{ value: 'normal', label: i18n.ts._announcement.normalDisplay },
								{ value: 'banner', label: i18n.ts.banner },
								{ value: 'dialog', label: i18n.ts.dialog },
							]"
						>
							<template #label>{{ i18n.ts.display }}</template>
						</MkRadios>
						<MkInfo v-if="announcement.display === 'dialog'" warn>{{ i18n.ts._announcement.dialogAnnouncementUxWarn }}</MkInfo>
						<MkSwitch v-model="announcement.forExistingUsers" :helpText="i18n.ts._announcement.forExistingUsersDescription">
							{{ i18n.ts._announcement.forExistingUsers }}
						</MkSwitch>
						<MkSwitch v-model="announcement.silence" :helpText="i18n.ts._announcement.silenceDescription">
							{{ i18n.ts._announcement.silence }}
						</MkSwitch>
						<MkSwitch v-model="announcement.needConfirmationToRead" :helpText="i18n.ts._announcement.needConfirmationToReadDescription">
							{{ i18n.ts._announcement.needConfirmationToRead }}
						</MkSwitch>
						<p v-if="announcement.reads">{{ i18n.tsx.nUsersRead({ n: announcement.reads }) }}</p>
					</div>
				</MkFolder>
				<template v-if="canFetchMore">
					<div :key="untilId" v-appear="more" :class="$style.sentinel" aria-hidden="true"></div>
				</template>
				<MkLoading v-if="loadingMore"/>
			</template>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkRadios from '@/components/MkRadios.vue';
import MkInfo from '@/components/MkInfo.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkFolder from '@/components/MkFolder.vue';
import { genId } from '@/utility/id.js';
import { useMkSelect } from '@/composables/use-mkselect.js';

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
const error = ref(false);
const canFetchMore = ref(false);
const untilId = ref<string>();
const limit = 10;
let requestId = 0;

const announcements = ref<(Omit<Misskey.entities.AdminAnnouncementsListResponse[number], 'id' | 'createdAt' | 'updatedAt' | 'reads' | 'isActive'> & {
	id: string | null;
	_id?: string;
	isActive?: Misskey.entities.AdminAnnouncementsListResponse[number]['isActive'];
	reads?: Misskey.entities.AdminAnnouncementsListResponse[number]['reads'];
})[]>([]);
const savedContent = new Map<string, { title: string; text: string }>();

function validContent(announcement: (typeof announcements)['value'][number]) {
	const previous = announcement.id != null ? savedContent.get(announcement.id) : null;
	return (announcement.title === previous?.title || Array.from(announcement.title).length <= Misskey.CONTENT_LIMITS.announcementTitle) &&
		(announcement.text === previous?.text || Array.from(announcement.text).length <= Misskey.CONTENT_LIMITS.announcementText);
}

watch(announcementsStatus, refresh, { immediate: true });
onBeforeUnmount(() => requestId++);

function add() {
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
		userId: null,
	});
}

async function del(announcement: (typeof announcements)['value'][number]) {
	if (announcement.id == null) return;
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.tsx.deleteAreYouSure({ x: announcement.title }),
	});
	if (canceled) return;
	announcements.value = announcements.value.filter(x => x !== announcement);
	misskeyApi('admin/announcements/delete', {
		id: announcement.id,
	});
}

async function archive(announcement: (typeof announcements)['value'][number]) {
	if (announcement.id == null) return;
	const { _id, ...data } = announcement;
	await os.apiWithDialog('admin/announcements/update', {
		...data,
		id: announcement.id,
		isActive: false,
	});
	refresh();
}

async function unarchive(announcement: (typeof announcements)['value'][number]) {
	if (announcement.id == null) return;
	const { _id, ...data } = announcement;
	await os.apiWithDialog('admin/announcements/update', {
		...data,
		id: announcement.id,
		isActive: true,
	});
	refresh();
}

async function save(announcement: (typeof announcements)['value'][number]) {
	if (!validContent(announcement)) return;
	const { _id, ...data } = announcement;
	if (announcement.id == null) {
		await os.apiWithDialog('admin/announcements/create', data);
		refresh();
	} else {
		await os.apiWithDialog('admin/announcements/update', {
			...data,
			id: announcement.id,
		});
		savedContent.set(announcement.id, { title: data.title, text: data.text });
	}
}

async function more() {
	if (loading.value || loadingMore.value || !canFetchMore.value || untilId.value == null) return;
	const currentRequestId = requestId;
	const previousUntilId = untilId.value;
	loadingMore.value = true;
	const announcementResponse = await misskeyApi('admin/announcements/list', {
		status: announcementsStatus.value,
		limit: limit + 1,
		untilId: previousUntilId,
	}).catch(() => null);
	if (currentRequestId !== requestId) return;
	loadingMore.value = false;
	if (announcementResponse == null) return;
	const page = announcementResponse.slice(0, limit);
	for (const announcement of page) savedContent.set(announcement.id, { title: announcement.title, text: announcement.text });
	const existingIds = new Set(announcements.value.map(announcement => announcement.id));
	announcements.value.push(...page.filter(announcement => !existingIds.has(announcement.id)));
	const nextUntilId = page.at(-1)?.id;
	canFetchMore.value = announcementResponse.length > limit && nextUntilId !== previousUntilId;
	untilId.value = nextUntilId ?? previousUntilId;
}

async function refresh() {
	const currentRequestId = ++requestId;
	loading.value = true;
	loadingMore.value = false;
	error.value = false;
	canFetchMore.value = false;
	untilId.value = undefined;
	const announcementResponse = await misskeyApi('admin/announcements/list', {
		status: announcementsStatus.value,
		limit: limit + 1,
	}).catch(() => null);
	if (currentRequestId !== requestId) return;
	loading.value = false;
	if (announcementResponse == null) {
		error.value = true;
		return;
	}
	announcements.value = announcementResponse.slice(0, limit);
	savedContent.clear();
	for (const announcement of announcements.value) {
		if (announcement.id != null) savedContent.set(announcement.id, { title: announcement.title, text: announcement.text });
	}
	untilId.value = announcements.value.at(-1)?.id ?? undefined;
	canFetchMore.value = announcementResponse.length > limit;
}

const headerActions = computed(() => [{
	asFullButton: true,
	icon: 'ti ti-plus',
	text: i18n.ts.add,
	handler: add,
	disabled: announcementsStatus.value === 'archived',
}]);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.announcements,
	icon: 'ti ti-speakerphone',
}));
</script>

<style lang="scss" module>
.sentinel {
	height: 1px;
}
</style>
