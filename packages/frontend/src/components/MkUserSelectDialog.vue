<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="dialogEl"
	:withOkButton="false"
	@close="cancel()"
	@closed="emit('closed')"
>
	<template #header>{{ title ?? i18n.ts.selectUser }}</template>
	<div>
		<div :class="$style.form">
			<MkInput v-if="computedLocalOnly" v-model="username" :autofocus="true">
				<template #label>{{ i18n.ts.username }}</template>
				<template #prefix>@</template>
			</MkInput>
			<FormSplit v-else :minWidth="170">
				<MkInput v-model="username" :autofocus="true">
					<template #label>{{ i18n.ts.username }}</template>
					<template #prefix>@</template>
				</MkInput>
				<MkInput v-model="host" :datalist="[hostname]">
					<template #label>{{ i18n.ts.host }}</template>
					<template #prefix>@</template>
				</MkInput>
			</FormSplit>
		</div>
		<div v-if="username != '' || host != ''" :class="[$style.result, { [$style.hit]: users.length > 0 }]">
			<div v-if="users.length > 0" :class="$style.users">
				<button v-for="user in users" :key="user.id" type="button" class="_button" :class="[$style.user, { [$style.selected]: selected?.id === user.id }]" :aria-pressed="selected?.id === user.id" :disabled="submitting" @click="choose(user)">
					<MkAvatar :user="user" :class="$style.avatar" indicator :link="false" :preview="false"/>
					<div :class="$style.userBody">
						<MkUserName :user="user" :class="$style.userName"/>
						<MkAcct :user="user" :class="$style.userAcct"/>
					</div>
				</button>
			</div>
			<div v-else-if="!searching" :class="$style.empty">
				<span>{{ i18n.ts.noUsers }}</span>
			</div>
		</div>
		<div v-if="username == '' && host == '' && displayedRecentUsers.length > 0" :class="$style.recent">
			<div :class="$style.users">
				<button v-for="user in displayedRecentUsers" :key="user.id" type="button" class="_button" :class="[$style.user, { [$style.selected]: selected?.id === user.id }]" :aria-pressed="selected?.id === user.id" :disabled="submitting" @click="choose(user)">
					<MkAvatar :user="user" :class="$style.avatar" indicator :link="false" :preview="false"/>
					<div :class="$style.userBody">
						<MkUserName :user="user" :class="$style.userName"/>
						<MkAcct :user="user" :class="$style.userAcct"/>
					</div>
				</button>
			</div>
		</div>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { onMounted, onBeforeUnmount, ref, computed, useTemplateRef, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { hostname } from '@@/js/config.js';
import MkInput from '@/components/MkInput.vue';
import FormSplit from '@/components/form/split.vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { store } from '@/store.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import { instance } from '@/instance.js';
import { misskeyApiWithErrorToast } from '@/utility/misskey-api-with-toast.js';

const emit = defineEmits<{
	(ev: 'ok', selected: Misskey.entities.UserDetailed): void;
	(ev: 'cancel'): void;
	(ev: 'closed'): void;
}>();

const props = withDefaults(defineProps<{
	title?: string;
	includeSelf?: boolean;
	localOnly?: boolean;
	excludeUserIds?: string[];
}>(), {
	includeSelf: false,
	localOnly: false,
	excludeUserIds: () => [],
});

const computedLocalOnly = computed(() => props.localOnly || instance.federation === 'none');

const username = ref('');
const host = ref('');
const users = ref<Misskey.entities.UserLite[]>([]);
const recentUsers = ref<Misskey.entities.UserLite[]>([]);
const excludedIds = computed(() => new Set(props.excludeUserIds));
const selected = ref<Misskey.entities.UserLite | null>(null);
const displayedRecentUsers = computed(() => [...new Map(recentUsers.value.filter(allowed).map(user => [user.id, user])).values()]);
const submitting = ref(false);
const searching = ref(false);
const dialogEl = useTemplateRef('dialogEl');
let disposed = false;
let canceled = false;
let completed = false;
let searchVersion = 0;
let searchTimer: number | undefined;
let searchController: AbortController | null = null;
onBeforeUnmount(() => { disposed = true; cancelSearch(); });

function cancelSearch() {
	window.clearTimeout(searchTimer);
	searchTimer = undefined;
	searchController?.abort();
	searchController = null;
	searchVersion++;
}

function allowed(user: Misskey.entities.UserLite) {
	return (props.includeSelf || user.id !== $i?.id) && (!computedLocalOnly.value || user.host == null) && !excludedIds.value.has(user.id);
}

function choose(user: Misskey.entities.UserLite) {
	if (submitting.value || canceled || disposed || !allowed(user)) return;
	selected.value = user;
	void ok();
}

function scheduleSearch() {
	cancelSearch();
	users.value = [];
	if (disposed || canceled || completed || (username.value === '' && host.value === '')) {
		searching.value = false;
		return;
	}
	searching.value = true;
	const version = searchVersion;
	searchTimer = window.setTimeout(() => {
		searchTimer = undefined;
		void search(version);
	}, 250);
}

async function search(version: number) {
	if (disposed || canceled || completed || version !== searchVersion) return;
	const controller = new AbortController();
	searchController = controller;
	try {
		const found = await misskeyApi('users/search-by-username-and-host', {
			username: username.value,
			host: computedLocalOnly.value ? '.' : host.value,
			limit: 10,
			detail: false,
		}, undefined, controller.signal);
		if (!disposed && !canceled && version === searchVersion) users.value = [...new Map(found.filter(allowed).map(user => [user.id, user])).values()];
	} catch {
		// 搜索失败保留已选用户，修改搜索条件后可重试。
	} finally {
		if (version === searchVersion) searching.value = false;
		if (searchController === controller) searchController = null;
	}
}

watch([username, host, computedLocalOnly], scheduleSearch);

async function ok() {
	if (submitting.value || completed || canceled || disposed || selected.value == null || !allowed(selected.value)) return;
	const id = selected.value.id;
	submitting.value = true;
	try {
		const user = await misskeyApiWithErrorToast('users/show', { userId: id });
		if (disposed || canceled || !allowed(user)) return;
		completed = true;
		cancelSearch();
		emit('ok', user);
		dialogEl.value?.close();
		store.set('recentlyUsedUsers', [id, ...store.s.recentlyUsedUsers.filter(recentId => recentId !== id)].slice(0, 16));
	} catch {
		// 获取资料失败后保留选择，允许重试。
	} finally {
		if (!completed) submitting.value = false;
	}
}

function cancel() {
	if (canceled || completed) return;
	canceled = true;
	cancelSearch();
	emit('cancel');
	dialogEl.value?.close();
}

onMounted(() => {
	misskeyApi('users/show', {
		userIds: store.s.recentlyUsedUsers,
	}).then(foundUsers => {
		if (!disposed && !canceled) recentUsers.value = foundUsers;
	}).catch(() => { /* 最近联系人失败不影响搜索和已选用户。 */ });
});
</script>

<style lang="scss" module>

.form {
	padding: var(--MI-cardPadding, 18px);
}

.result,
.recent {
	display: flex;
	flex-direction: column;

	&.result.hit {
		padding: 0;
	}

	&.recent {
		padding: 0;
	}
}

.users {
	display: flex;
	flex-direction: column;
	gap: 1px;
	padding: 0 0 var(--MI-cardPadding, 18px);
}

.user {
	display: flex;
	width: 100%;
	box-sizing: border-box;
	text-align: left;
	align-items: center;
	gap: 8px;
	padding: 8px var(--MI-cardPadding, 18px);
	font-size: 14px;

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
	}

	&.selected {
		background: var(--MI_THEME-buttonHoverBg);
		color: var(--MI_THEME-fg);
	}
}

.userBody {
	flex: 1;
	min-width: 0;
}

.avatar {
	flex-shrink: 0;
	width: 34px;
	height: 34px;
}

.userName {
	display: flex;
	align-items: center;
	font-weight: normal;
}

.userAcct {
	color: var(--MI_THEME-fgTransparentWeak);
}

.empty {
	color: var(--MI_THEME-fgTransparentWeak);
	text-align: center;
	padding: var(--MI-cardPadding, 18px);
}
</style>
