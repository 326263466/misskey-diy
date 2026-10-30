<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="dialog"
	:closeOnBackdrop="false"
	:width="400"
	@close="dialog?.close()"
	@closed="emit('closed')"
>
	<template v-if="announcement" #header>:{{ announcement.title }}:</template>
	<template v-else #header>{{ i18n.ts._announcement.newTitle }}</template>

	<div>
		<div class="_spacer _spacerCard">
			<div class="_gaps_m">
				<MkInput v-model="title" :counterMaxLength="Misskey.CONTENT_LIMITS.announcementTitle">
					<template #label>{{ i18n.ts.title }}</template>
				</MkInput>
				<MkTextarea v-model="text" :counterMaxLength="Misskey.CONTENT_LIMITS.announcementText">
					<template #label>{{ i18n.ts.text }}</template>
				</MkTextarea>
				<MkRadios
					v-model="icon"
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
					v-model="display"
					:options="[
						{ value: 'normal', label: i18n.ts._announcement.normalDisplay },
						{ value: 'banner', label: i18n.ts.banner },
						{ value: 'dialog', label: i18n.ts.dialog },
					]"
				>
					<template #label>{{ i18n.ts.display }}</template>
				</MkRadios>
				<MkInput v-model="autoArchiveAt" type="datetime-local">
					<template #label>{{ i18n.ts._announcement.autoArchiveAt }}</template>
					<template #caption>{{ i18n.ts._announcement.autoArchiveAtDescription }}</template>
				</MkInput>
				<MkSwitch v-model="needConfirmationToRead">
					{{ i18n.ts._announcement.needConfirmationToRead }}
					<template #caption>{{ i18n.ts._announcement.needConfirmationToReadDescription }}</template>
				</MkSwitch>
				<MkButton v-if="announcement" danger @click="del()"><i class="ti ti-trash"></i> {{ i18n.ts.delete }}</MkButton>
			</div>
		</div>
		<div :class="$style.footer">
			<MkButton primary rounded style="margin: 0 auto;" :disabled="!validContent" @click="done"><i class="ti ti-check"></i> {{ props.announcement ? i18n.ts.update : i18n.ts.create }}</MkButton>
		</div>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { computed, ref, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import type { ApiWithDialogCustomErrors } from '@/os.js';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import MkTextarea from '@/components/MkTextarea.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkRadios from '@/components/MkRadios.vue';
import { formatDateTimeString } from '@/utility/format-time-string.js';

type AdminAnnouncementType = Misskey.entities.AdminAnnouncementsListResponse[number];
type AdminAnnouncementUpdate = Misskey.entities.AdminAnnouncementsCreateRequest & { id: string; };

const props = defineProps<{
	user: Misskey.entities.User,
	announcement?: AdminAnnouncementType,
}>();

const emit = defineEmits<{
	(ev: 'done', v: { deleted?: boolean; updated?: AdminAnnouncementUpdate; created?: Misskey.entities.AdminAnnouncementsCreateResponse; }): void,
	(ev: 'closed'): void
}>();

const dialog = useTemplateRef('dialog');
const title = ref(props.announcement ? props.announcement.title : '');
const text = ref(props.announcement ? props.announcement.text : '');
const validContent = computed(() => (title.value === props.announcement?.title || Array.from(title.value).length <= Misskey.CONTENT_LIMITS.announcementTitle) &&
	(text.value === props.announcement?.text || Array.from(text.value).length <= Misskey.CONTENT_LIMITS.announcementText));
const icon = ref(props.announcement ? props.announcement.icon : 'info');
const display = ref(props.announcement ? props.announcement.display : 'dialog');
const needConfirmationToRead = ref(props.announcement ? props.announcement.needConfirmationToRead : false);
const initialAutoArchiveAt = props.announcement?.autoArchiveAt ? formatDateTimeString(new Date(props.announcement.autoArchiveAt), 'yyyy-MM-ddTHH:mm') : '';
const autoArchiveAt = ref(initialAutoArchiveAt);

const createAnnouncementErrors: ApiWithDialogCustomErrors = {
	'2a892bd5-487d-46a2-a5fe-3d85ad51defe': {
		title: i18n.ts._announcement.autoArchiveAt,
		text: i18n.ts._announcement.autoArchiveAtMustBeInFuture,
	},
};

async function done() {
	const autoArchiveAtMs = props.announcement?.autoArchiveAt != null && autoArchiveAt.value === initialAutoArchiveAt
		? new Date(props.announcement.autoArchiveAt).getTime()
		: autoArchiveAt.value === '' ? null : new Date(autoArchiveAt.value).getTime();
	if (!props.announcement && autoArchiveAtMs != null && (Number.isNaN(autoArchiveAtMs) || autoArchiveAtMs <= Date.now())) {
		await os.alert({
			type: 'error',
			title: i18n.ts._announcement.autoArchiveAt,
			text: i18n.ts._announcement.autoArchiveAtMustBeInFuture,
		});
		return;
	}

	const params = {
		title: title.value,
		text: text.value,
		icon: icon.value,
		imageUrl: null,
		display: display.value,
		needConfirmationToRead: needConfirmationToRead.value,
		userId: props.user.id,
		autoArchiveAt: autoArchiveAtMs,
	} satisfies Misskey.entities.AdminAnnouncementsCreateRequest;

	if (props.announcement) {
		await os.apiWithDialog('admin/announcements/update', {
			...params,
			id: props.announcement.id,
		});
		os.toast(i18n.ts.saved, 'success');

		emit('done', {
			updated: {
				...params,
				id: props.announcement.id,
			},
		});

		dialog.value?.close();
	} else {
		const created = await os.apiWithDialog('admin/announcements/create', params, undefined, createAnnouncementErrors);

		emit('done', {
			created,
		});

		dialog.value?.close();
	}
}

async function del() {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.tsx.deleteAreYouSure({ x: title.value }),
	});
	if (canceled) return;

	if (props.announcement) {
		// 失败提示由 apiWithDialog 处理
		await os.apiWithDialog('admin/announcements/delete', {
			id: props.announcement.id,
		});
		os.toast(i18n.ts.deleteSucceeded, 'success');
	}

	emit('done', {
		deleted: true,
	});
	dialog.value?.close();
}
</script>

<style lang="scss" module>
.footer {
	position: sticky;
	bottom: 0;
	left: 0;
	padding: var(--MI-cardPadding, 18px);
	border-top: var(--MI-divider);
	-webkit-backdrop-filter: var(--MI-blur, blur(15px));
	backdrop-filter: var(--MI-blur, blur(15px));
}
</style>
