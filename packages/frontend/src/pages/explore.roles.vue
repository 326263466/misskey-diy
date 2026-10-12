<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_pageBody">
	<div v-if="roles != null && roles.length > 0" class="_gaps_s">
		<MkRolePreview v-for="role in roles" :key="role.id" :role="role" :forModeration="false"/>
	</div>
	<MkLoading v-else-if="loading" page/>
	<MkError v-else-if="error" page @retry="load"/>
	<MkResult v-else type="empty" :text="i18n.ts.noRole" page/>
</div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkRolePreview from '@/components/MkRolePreview.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';

const roles = ref<Misskey.entities.Role[] | null>(null);
const loading = ref(true);
const error = ref(false);

async function load() {
	loading.value = true;
	error.value = false;
	try {
		const res = await misskeyApi('roles/list');
		roles.value = res.filter(x => x.target === 'manual').sort((a, b) => b.displayOrder - a.displayOrder);
	} catch {
		error.value = true;
	} finally {
		loading.value = false;
	}
}

load();
</script>

