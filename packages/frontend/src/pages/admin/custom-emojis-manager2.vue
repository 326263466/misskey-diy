<!--
SPDX-FileCopyrightText: syuilo and other misskey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="headerTab" contentCard :tabs="headerTabs">
	<template #header-actions>
		<div :id="toolbarId" class="_adminToolbar _adminHeaderToolbar"></div>
	</template>
	<XGridLocalComponent v-if="headerTab === 'local'"/>
	<XGridRemoteComponent v-else-if="headerTab === 'remote'"/>
	<XRegisterComponent v-else-if="headerTab === 'register'"/>
</PageWithHeader>
</template>

<script setup lang="ts">
import { computed, provide, ref, useId } from 'vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import XGridLocalComponent from '@/pages/admin/custom-emojis-manager.local.list.vue';
import XGridRemoteComponent from '@/pages/admin/custom-emojis-manager.remote.vue';
import XRegisterComponent from '@/pages/admin/custom-emojis-manager.register.vue';

type PageMode = 'local' | 'remote' | 'register';

const headerTab = ref<PageMode>('local');
const toolbarId = useId();

// 各标签页把工具栏传送到页头，与标签放在同一行。
provide('adminEmojisToolbarTarget', `#${toolbarId}`);

const headerTabs = computed(() => [{
	key: 'local',
	title: i18n.ts.local,
}, {
	key: 'remote',
	title: i18n.ts.remote,
}, {
	key: 'register',
	title: i18n.ts._customEmojisManager._local.tabTitleRegister,
}]);

definePage(computed(() => ({
	title: i18n.ts.customEmojisBeta,
	icon: 'ti ti-icons',
	needWideArea: true,
})));
</script>
