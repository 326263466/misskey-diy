<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :tabs="headerTabs">
	<div v-if="loading" class="_pageBody">
		<MkLoading page/>
	</div>
	<div v-else-if="error != null" class="_pageBody">
		<MkResult type="error" :text="error" page/>
	</div>
	<div v-else-if="tab === 'users'" class="_pageBody">
		<div class="_gaps_s">
			<div v-if="role?.description" class="_panel _panelPadding"><Mfm :text="role.description" :plain="true"/></div>
			<MkUserList v-if="visible" :paginator="usersPaginator" :extractor="(item) => item.user" pageEmpty/>
			<MkResult v-else-if="!visible" type="empty" page/>
		</div>
	</div>
	<div v-else-if="tab === 'timeline'" class="_pageBody">
		<MkStreamingNotesTimeline v-if="visible" ref="timeline" src="role" :role="props.roleId" pageEmpty/>
		<MkResult v-else-if="!visible" type="empty" page/>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, watch, ref, markRaw } from 'vue';
import * as Misskey from 'misskey-js';
import { misskeyApi } from '@/utility/misskey-api.js';
import MkUserList from '@/components/MkUserList.vue';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import MkStreamingNotesTimeline from '@/components/MkStreamingNotesTimeline.vue';
import { Paginator } from '@/utility/paginator.js';

const props = withDefaults(defineProps<{
	roleId: string;
	initialTab?: string;
}>(), {
	initialTab: 'users',
});

// eslint-disable-next-line vue/no-setup-props-reactivity-loss
const tab = ref(props.initialTab);
const role = ref<Misskey.entities.Role | null>(null);
const error = ref<string | null>(null);
const visible = ref(false);
const loading = ref(true);

watch(() => props.roleId, (roleId, _oldRoleId, onCleanup) => {
	let active = true;
	onCleanup(() => { active = false; });
	loading.value = true;
	role.value = null;
	error.value = null;
	visible.value = false;

	misskeyApi('roles/show', {
		roleId,
	}).then(res => {
		if (!active) return;
		role.value = res;
		visible.value = res.isExplorable && res.isPublic;
	}).catch((err) => {
		if (!active) return;
		if (err.code === 'NO_SUCH_ROLE') {
			error.value = i18n.ts.roleNotFound;
		} else {
			error.value = i18n.ts.somethingHappened;
		}
	}).finally(() => {
		if (active) loading.value = false;
	});
}, { immediate: true });

const usersPaginator = markRaw(new Paginator('roles/users', {
	limit: 30,
	computedParams: computed(() => ({
		roleId: props.roleId,
	})),
}));

const headerTabs = computed(() => [{
	key: 'users',
	icon: 'ti ti-users',
	title: i18n.ts.users,
}, {
	key: 'timeline',
	icon: 'ti ti-pencil',
	title: i18n.ts.timeline,
}]);

definePage(() => ({
	title: role.value ? role.value.name : (error.value ?? i18n.ts.role),
	icon: 'ti ti-badge',
}));
</script>
