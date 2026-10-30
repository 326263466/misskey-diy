<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_pageScrollable">
	<MkDrive ref="drive" :initialFolder="props.folder ?? null" contentCard controlledNavigation @cd="onCd" @navigate="navigateFolder" @openFile="openFile"/>
</div>
</template>

<script lang="ts" setup>
import { ref, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import MkDrive from '@/components/MkDrive.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { useRouter } from '@/router.js';

const props = defineProps<{
	folder?: string;
}>();

const router = useRouter();
const drive = useTemplateRef('drive');

const folder = ref<Misskey.entities.DriveFolder | null>(null);

function onCd(target: Misskey.entities.DriveFolder | null) {
	folder.value = target;
}

// 只有用户点击写入历史；请求完成和浏览器前进后退只同步内容。
function navigateFolder(folderId: string | null) {
	const currentPath = router.currentRef.value._parsedRoute.fullPath.split(/[?#]/)[0];
	const pagePath = props.folder ? `/my/drive/folder/${encodeURIComponent(props.folder)}` : '/my/drive';
	if (currentPath !== pagePath) return;
	const path = folderId ? `/my/drive/folder/${encodeURIComponent(folderId)}` : '/my/drive';
	if (currentPath === path) {
		drive.value?.cd(folderId);
		return;
	}
	if (folderId) router.push('/my/drive/folder/:folder', { params: { folder: folderId } });
	else router.push('/my/drive');
}

function openFile(file: Misskey.entities.DriveFile) {
	router.push('/my/drive/file/:fileId', { params: { fileId: file.id } });
}

definePage(() => ({
	title: folder.value ? folder.value.name : i18n.ts.drive,
	icon: 'ti ti-cloud',
	hideHeader: true,
}));
</script>
