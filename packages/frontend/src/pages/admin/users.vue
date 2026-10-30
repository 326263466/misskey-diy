<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard :actions="headerActions" :tabs="headerTabs">
	<div class="_pageBody">
		<div class="_gaps">
			<div class="_adminPanel">
				<div class="_adminToolbar">
					<MkInput v-model="searchUsername" class="_adminToolbarField" type="search" :spellcheck="false">
						<template #prefix>@</template>
						<template #label>{{ i18n.ts.username }}</template>
					</MkInput>
					<MkInput v-model="searchHost" class="_adminToolbarField" type="search" :spellcheck="false" :disabled="paginator.computedParams?.value?.origin === 'local'">
						<template #prefix>@</template>
						<template #label>{{ i18n.ts.host }}</template>
					</MkInput>
					<MkSelect v-model="sort" :items="sortDef" class="_adminToolbarField">
						<template #label>{{ i18n.ts.sort }}</template>
					</MkSelect>
					<MkSelect v-model="state" :items="stateDef" class="_adminToolbarField" style="--admin-fieldWidth: 112px;">
						<template #label>{{ i18n.ts.state }}</template>
					</MkSelect>
					<MkSelect v-model="origin" :items="originDef" class="_adminToolbarField" style="--admin-fieldWidth: 112px;">
						<template #label>{{ i18n.ts.instance }}</template>
					</MkSelect>
					<MkButton small @click="resetQuery">{{ i18n.ts.reset }}</MkButton>
					<div class="_adminToolbarActions">
						<MkButton small primary :disabled="createOpen || creating" @click="addUser"><i class="ti ti-plus" aria-hidden="true"></i> {{ i18n.ts.addUser }}</MkButton>
						<MkButton small @click="searchUser"><i class="ti ti-user-search" aria-hidden="true"></i> {{ i18n.ts.search }}</MkButton>
						<MkButton small @click="lookupUser"><i class="ti ti-search" aria-hidden="true"></i> {{ i18n.ts.lookup }}</MkButton>
					</div>
				</div>

				<MkPagination v-slot="{items}" :paginator="paginator" pageEmpty>
					<div class="_adminTableContainer">
						<table class="_adminTable" :class="$style.table" :aria-label="i18n.ts.userList">
							<colgroup>
								<col :class="$style.userColumn"/>
								<col :class="$style.genderColumn"/>
								<col :class="$style.ageColumn"/>
								<col :class="$style.locationColumn"/>
								<col :class="$style.workColumn"/>
								<col :class="$style.fieldsColumn"/>
								<col :class="$style.hostColumn"/>
								<col :class="$style.statisticsColumn"/>
								<col :class="$style.dateColumn"/>
								<col :class="$style.dateColumn"/>
								<col :class="$style.stateColumn"/>
								<col :class="$style.actionsColumn"/>
							</colgroup>
							<thead>
								<tr>
									<th scope="col">{{ i18n.ts.user }}</th>
									<th scope="col" :title="i18n.ts._adminUser.genderDescription">{{ i18n.ts._adminUser.gender }}</th>
									<th scope="col" :title="i18n.ts._adminUser.ageDescription">{{ i18n.ts._adminUser.age }}</th>
									<th scope="col">{{ i18n.ts._adminUser.location }}</th>
									<th scope="col">{{ i18n.ts._adminUser.work }}</th>
									<th scope="col">{{ i18n.ts._profile.metadata }}</th>
									<th scope="col">{{ i18n.ts.host }}</th>
									<th scope="col">{{ i18n.ts._adminUser.statistics }}</th>
									<th scope="col">{{ i18n.ts.registeredDate }}</th>
									<th scope="col" :title="i18n.ts._adminUser.lastPostedAtDescription">{{ i18n.ts.lastPostedAt }}</th>
									<th scope="col">{{ i18n.ts.state }}</th>
									<th scope="col" class="_adminTableActions">{{ i18n.ts.operations }}</th>
								</tr>
							</thead>
							<tbody>
								<tr v-for="{ user, gender, age, fields, fieldsTooltip } in getUserRows(items)" :key="user.id">
									<td>
										<MkA :class="$style.user" :to="`/admin/user/${user.id}`" behavior="window">
											<MkUserCardMini :class="$style.userCard" :user="user" :withChart="false" :subTooltip="`@${acct(user)}\n${i18n.ts.userId}: ${user.id}`"/>
											<div v-if="user.description" :class="$style.description" :title="user.description"><Mfm :text="user.description" :author="user" :plain="true" :nowrap="true"/></div>
										</MkA>
									</td>
									<td>
										<span v-if="gender" :class="$style.ellipsis" :title="gender"><Mfm :text="gender" :author="user" :plain="true" :nowrap="true"/></span>
										<span v-else class="_adminTableSecondary">{{ i18n.ts._adminUser.notProvided }}</span>
									</td>
									<td :class="$style.date">
										<template v-if="age != null">
											<span>{{ i18n.tsx.yearsOld({ age }) }}</span>
											<div class="_adminTableSecondary" :title="`${i18n.ts.birthday}: ${user.birthday}`">{{ user.birthday }}</div>
										</template>
										<span v-else class="_adminTableSecondary">{{ user.birthday ? i18n.ts.unknown : i18n.ts._adminUser.notProvided }}</span>
									</td>
									<td>
										<span v-if="user.location" :class="$style.ellipsis" :title="user.location"><Mfm :text="user.location" :author="user" :plain="true" :nowrap="true"/></span>
										<span v-else class="_adminTableSecondary">{{ i18n.ts._adminUser.notProvided }}</span>
									</td>
									<td>
										<span v-if="user.company" :class="$style.ellipsis" :title="user.company"><Mfm :text="user.company" :author="user" :plain="true" :nowrap="true"/></span>
										<span v-if="user.jobTitle" class="_adminTableSecondary" :class="$style.ellipsis" :title="user.jobTitle"><Mfm :text="user.jobTitle" :author="user" :plain="true" :nowrap="true"/></span>
										<span v-if="!user.company && !user.jobTitle" class="_adminTableSecondary">{{ i18n.ts._adminUser.notProvided }}</span>
									</td>
									<td :class="$style.fields" :title="fieldsTooltip">
										<template v-if="fields.length > 0">
											<div v-for="(field, index) in fields.slice(0, 2)" :key="index" :class="$style.ellipsis">
												<span :class="$style.fieldName">{{ field.name }}: </span><Mfm :text="field.value" :author="user" :plain="true" :nowrap="true"/>
											</div>
											<div v-if="fields.length > 2" class="_adminTableSecondary"><button type="button" class="_button _textButton" @click="showFields(fieldsTooltip)">{{ i18n.tsx._adminUser.moreFields({ count: fields.length - 2 }) }}</button></div>
										</template>
										<span v-else class="_adminTableSecondary">{{ i18n.ts._adminUser.notProvided }}</span>
									</td>
									<td><span class="_monospace" :class="$style.ellipsis" :title="user.host ?? i18n.ts.local">{{ user.host ?? i18n.ts.local }}</span></td>
									<td>
										<div :class="$style.statistics">
											<div><span>{{ i18n.ts.notes }}</span><b :title="number(user.notesCount)">{{ number(user.notesCount) }}</b></div>
											<div><span>{{ i18n.ts.following }}</span><b :title="number(user.followingCount)">{{ number(user.followingCount) }}</b></div>
											<div><span>{{ i18n.ts.followers }}</span><b :title="number(user.followersCount)">{{ number(user.followersCount) }}</b></div>
										</div>
									</td>
									<td :class="$style.date">
										<MkTime :time="user.createdAt" mode="date"/>
										<div class="_adminTableSecondary"><MkTime :time="user.createdAt"/></div>
									</td>
									<td :class="$style.date">
										<template v-if="user.updatedAt">
											<MkTime :time="user.updatedAt" mode="date"/>
											<div class="_adminTableSecondary"><MkTime :time="user.updatedAt"/></div>
										</template>
										<span v-else class="_adminTableSecondary">{{ i18n.ts.unknown }}</span>
									</td>
									<td>
										<span v-if="user.isSuspended" class="_adminTableStatus" :class="$style.status" style="--admin-statusColor: var(--MI_THEME-error)" :title="i18n.ts._userStatus.suspended">{{ i18n.ts._userStatus.suspended }}</span>
										<span v-else-if="user.isSilenced" class="_adminTableStatus" :class="$style.status" style="--admin-statusColor: var(--MI_THEME-warn)" :title="i18n.ts._userStatus.silenced">{{ i18n.ts._userStatus.silenced }}</span>
										<span v-else class="_adminTableStatus" :class="$style.status" style="--admin-statusColor: var(--MI_THEME-success)">{{ i18n.ts.normal }}</span>
										<div v-if="user.isBot || user.isLocked" :class="$style.accountFlags">
											<i v-if="user.isBot" class="ti ti-robot" role="img" :aria-label="i18n.ts._role._condition.isBot" :title="i18n.ts._role._condition.isBot"></i>
											<i v-if="user.isLocked" class="ti ti-lock" role="img" :aria-label="i18n.ts._role._condition.isLocked" :title="i18n.ts._role._condition.isLocked"></i>
										</div>
									</td>
									<td class="_adminTableActions"><button type="button" class="_button _textButton" @click="show(user)">{{ i18n.ts.details }}</button></td>
								</tr>
							</tbody>
						</table>
					</div>
				</MkPagination>
			</div>
		</div>
	</div>
</PageWithHeader>
<Teleport to="#misskey-popups" defer>
	<MkModalWindow
		v-if="createOpen"
		ref="createWindow"
		:width="520"
		:height="400"
		autoHeight
		:closeOnBackdrop="false"
		:withCloseButton="!creating"
		headerIcon="ti ti-user-plus"
		role="dialog"
		tabindex="-1"
		aria-modal="true"
		:aria-label="i18n.ts.addUser"
		@close="closeCreate"
		@esc="closeCreate"
		@closed="onCreateClosed"
	>
		<template #header>{{ i18n.ts.addUser }}</template>
		<form class="_gaps" :class="$style.createForm" :aria-busy="creating" @compositionstart="createComposing = true" @compositionend="createComposing = false" @keydown="onCreateKeydown" @submit.prevent="createUser">
			<MkInput v-model="createUsername" :disabled="creating" :spellcheck="false" autocapitalize="off" autocomplete="off" autofocus>
				<template #label>{{ i18n.ts.username }}</template>
			</MkInput>
			<MkInput v-model="createPassword" type="password" :disabled="creating" autocomplete="new-password">
				<template #label>{{ i18n.ts.password }}</template>
			</MkInput>
			<div class="_buttons">
				<MkButton type="submit" primary :disabled="creating" :wait="creating">{{ i18n.ts.create }}</MkButton>
				<MkButton :disabled="creating" @click="closeCreate">{{ i18n.ts.cancel }}</MkButton>
			</div>
		</form>
	</MkModalWindow>
</Teleport>
</template>

<script lang="ts" setup>
import { computed, markRaw, ref, watch, watchEffect, inject, nextTick, onActivated, onDeactivated, onBeforeUnmount, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import { defaultMemoryStorage } from '@/memory-storage';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkPagination from '@/components/MkPagination.vue';
import MkButton from '@/components/MkButton.vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import * as os from '@/os.js';
import { lookupUser } from '@/utility/admin-lookup.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { useMkSelect } from '@/composables/use-mkselect.js';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import { Paginator } from '@/utility/paginator.js';
import { acct } from '@@/js/user.js';
import number from '@/filters/number.js';
import { useLowresTime } from '@@/js/use-lowres-time.js';
import { DI } from '@/di.js';

type SearchQuery = {
	sort?: '-createdAt' | '+createdAt' | '-updatedAt' | '+updatedAt';
	state?: 'all' | 'available' | 'admin' | 'moderator' | 'suspended';
	origin?: 'combined' | 'local' | 'remote';
	username?: string;
	hostname?: string;
};

const storedQuery = JSON.parse(defaultMemoryStorage.getItem('admin-users-query') ?? '{}') as SearchQuery;

const {
	model: sort,
	def: sortDef,
} = useMkSelect({
	items: [
		{ label: `${i18n.ts.registeredDate} (${i18n.ts.ascendingOrder})`, value: '-createdAt' },
		{ label: `${i18n.ts.registeredDate} (${i18n.ts.descendingOrder})`, value: '+createdAt' },
		{ label: `${i18n.ts.lastPostedAt} (${i18n.ts.ascendingOrder})`, value: '-updatedAt' },
		{ label: `${i18n.ts.lastPostedAt} (${i18n.ts.descendingOrder})`, value: '+updatedAt' },
	],
	initialValue: storedQuery.sort ?? '+createdAt',
});
const {
	model: state,
	def: stateDef,
} = useMkSelect({
	items: [
		{ label: i18n.ts.all, value: 'all' },
		{ label: i18n.ts.normal, value: 'available' },
		{ label: i18n.ts.administrator, value: 'admin' },
		{ label: i18n.ts.moderator, value: 'moderator' },
		{ label: i18n.ts._userStatus.suspended, value: 'suspended' },
	],
	initialValue: storedQuery.state ?? 'all',
});
const {
	model: origin,
	def: originDef,
} = useMkSelect({
	items: [
		{ label: i18n.ts.all, value: 'combined' },
		{ label: i18n.ts.local, value: 'local' },
		{ label: i18n.ts.remote, value: 'remote' },
	],
	initialValue: storedQuery.origin ?? 'local',
});
const searchUsername = ref(storedQuery.username ?? '');
const searchHost = ref(storedQuery.hostname ?? '');
const searchFilters = ref({ username: searchUsername.value, hostname: searchHost.value });

watch([searchUsername, searchHost], ([username, hostname], _previous, onCleanup) => {
	if (username === '' && hostname === '') {
		searchFilters.value = { username, hostname };
		return;
	}
	const timer = window.setTimeout(() => { searchFilters.value = { username, hostname }; }, 250);
	onCleanup(() => window.clearTimeout(timer));
});

const paginator = markRaw(new Paginator('admin/show-users', {
	limit: 10,
	computedParams: computed(() => ({
		sort: sort.value,
		state: state.value,
		origin: origin.value,
		...searchFilters.value,
	})),
	offsetMode: true,
}));

const genderFieldNames = new Set(['性别', '性別', 'gender', 'sex']);
const now = useLowresTime();
const today = computed(() => {
	const date = new Date(now.value);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
});

function getAge(birthday: string | null): number | null {
	if (!birthday || !/^\d{4}-\d{2}-\d{2}$/.test(birthday) || birthday > today.value) return null;
	const date = new Date(`${birthday}T00:00:00.000Z`);
	if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== birthday) return null;

	// 按日历日期计算，避免 UTC 生日在负时区被当作前一天。
	const yearDifference = Number(today.value.slice(0, 4)) - Number(birthday.slice(0, 4));
	return yearDifference - (today.value.slice(5) < birthday.slice(5) ? 1 : 0);
}

function getUserRows(users: Misskey.entities.UserDetailed[]) {
	return users.map(user => {
		const genderIndex = user.fields.findIndex(field => genderFieldNames.has(field.name.trim().toLowerCase()));
		const fields = user.fields.filter((field, index) => index !== genderIndex && field.name.trim() !== '' && field.value.trim() !== '');
		return {
			user,
			gender: genderIndex >= 0 ? user.fields[genderIndex].value.trim() : null,
			age: getAge(user.birthday),
			fields,
			fieldsTooltip: fields.map(field => `${field.name}: ${field.value}`).join('\n'),
		};
	});
}

function showFields(text: string) {
	os.alert({
		type: 'info',
		title: i18n.ts._profile.metadata,
		text,
	});
}

function searchUser() {
	os.selectUser({ includeSelf: true }).then(user => {
		show(user);
	});
}

const pageActive = inject(DI.pageActive, ref(true));
const componentActive = ref(true);
const createOpen = ref(false);
const creating = ref(false);
const createComposing = ref(false);
const createUsername = ref('');
const createPassword = ref('');
const createWindow = useTemplateRef('createWindow');
let createTrigger: HTMLElement | null = null;
let createRevision = 0;
let disposed = false;

function addUser(event: PointerEvent) {
	if (creating.value || createOpen.value || !pageActive.value || !componentActive.value) return;
	createTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
	createUsername.value = '';
	createPassword.value = '';
	createComposing.value = false;
	createRevision++;
	createOpen.value = true;
}

function closeCreate() {
	if (!creating.value) createWindow.value?.close();
}

function onCreateKeydown(event: KeyboardEvent) {
	// 输入法确认候选的 Enter 不应触发原生表单提交。
	if ((event.key === 'Enter' || event.code === 'Enter') && (createComposing.value || event.isComposing || event.keyCode === 229)) {
		event.preventDefault();
	}
}

function onCreateClosed() {
	createRevision++;
	createOpen.value = false;
	createPassword.value = '';
	createComposing.value = false;
	const target = createTrigger;
	createTrigger = null;
	void nextTick(() => {
		if (pageActive.value && componentActive.value && target?.isConnected) target.focus({ preventScroll: true });
	});
}

function dismissCreate() {
	createRevision++;
	createOpen.value = false;
	createPassword.value = '';
	createComposing.value = false;
	createTrigger = null;
}

watch(pageActive, active => { if (!active) dismissCreate(); }, { flush: 'sync' });
onActivated(() => { componentActive.value = true; });
onDeactivated(() => {
	componentActive.value = false;
	dismissCreate();
});
onBeforeUnmount(() => {
	disposed = true;
	dismissCreate();
});

async function createUser() {
	if (creating.value || !createOpen.value || !pageActive.value || !componentActive.value) return;
	const revision = createRevision;
	creating.value = true;
	try {
		await os.apiWithDialog('admin/accounts/create', {
			username: createUsername.value,
			password: createPassword.value,
		});
		if (disposed) return;
		if (pageActive.value && componentActive.value) os.toast(i18n.ts.created, 'success');
		if (revision === createRevision) createWindow.value?.close();
		void paginator.reload();
	} catch {
		// 沿用 API 弹窗提示错误，保留表单供重试。
	} finally {
		creating.value = false;
	}
}

function show(user: Misskey.entities.UserDetailed) {
	os.pageWindow(`/admin/user/${user.id}`);
}

function resetQuery() {
	sort.value = '+createdAt';
	state.value = 'all';
	origin.value = 'local';
	searchUsername.value = '';
	searchHost.value = '';
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

watchEffect(() => {
	defaultMemoryStorage.setItem('admin-users-query', JSON.stringify({
		sort: sort.value,
		state: state.value,
		origin: origin.value,
		username: searchUsername.value,
		hostname: searchHost.value,
	}));
});

definePage(() => ({
	title: i18n.ts.userList,
	icon: 'ti ti-users',
}));
</script>

<style lang="scss" module>
.table {
	table-layout: fixed;
}

.userColumn {
	width: 190px;
}

.genderColumn {
	width: 70px;
}

.ageColumn {
	width: 100px;
}

.locationColumn {
	width: 80px;
}

.workColumn {
	width: 120px;
}

.fieldsColumn {
	width: 150px;
}

.hostColumn {
	width: 96px;
}

.statisticsColumn {
	width: 104px;
}

.dateColumn {
	width: 104px;
}

.stateColumn {
	width: 88px;
}

.actionsColumn {
	width: 72px;
}

.user {
	display: block;
	min-width: 0;

	&:hover {
		text-decoration: none;
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: 2px;
	}
}

.userCard.userCard {
	padding: 0;
	background: transparent;
	border-radius: 0;

	> :first-child {
		width: 32px;
		height: 32px;
		margin-right: 10px;
		flex-shrink: 0;
	}

	> :nth-child(2) {
		font-size: inherit;
	}
}

.description,
.ellipsis {
	display: block;
	min-width: 0;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.description {
	margin-top: 4px;
	margin-inline-start: 42px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.9em;
	line-height: 1.4;
}

.date {
	white-space: nowrap;
	font-variant-numeric: tabular-nums;

	> time,
	> div {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
	}
}

.accountFlags {
	display: flex;
	gap: 6px;
	margin-top: 4px;
	color: var(--MI_THEME-fgTransparentWeak);
}

.status {
	max-width: 100%;
	box-sizing: border-box;
	white-space: normal;
	overflow-wrap: anywhere;
}

.fields {
	font-size: 1em;

	> div + div {
		margin-top: 3px;
	}
}

.fieldName {
	color: var(--MI_THEME-fgTransparentWeak);
}

.statistics {
	display: grid;
	gap: 2px;
	font-size: 1em;

	> div {
		display: flex;
		justify-content: space-between;
		gap: 6px;

		> span {
			flex-shrink: 0;
			color: var(--MI_THEME-fgTransparentWeak);
		}

		> b {
			min-width: 0;
			overflow: hidden;
			font-weight: normal;
			font-variant-numeric: tabular-nums;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
	}
}

.createForm {
	padding: var(--MI-cardPadding);
	font-size: 1em;
}
</style>
