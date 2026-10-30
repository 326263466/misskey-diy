<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :class="$style.adminScope" contentCard :actions="headerActions" :tabs="headerTabs">
	<template v-if="(tab === 'roles' && user.host == null) || tab === 'announcements'" #header-actions>
		<div class="_adminToolbar _adminHeaderToolbar">
			<MkButton v-if="tab === 'roles'" small primary @click="assignRole"><i class="ti ti-plus" aria-hidden="true"></i> {{ i18n.ts.assign }}</MkButton>
			<template v-else>
				<MkSelect v-model="announcementsStatus" :items="announcementsStatusDef" class="_adminToolbarField">
					<template #label>{{ i18n.ts.filter }}</template>
				</MkSelect>
				<div class="_adminToolbarActions">
					<MkButton small primary @click="createAnnouncement"><i class="ti ti-plus" aria-hidden="true"></i> {{ i18n.ts.createNew }}</MkButton>
				</div>
			</template>
		</div>
	</template>
	<div class="_pageBody">
		<div v-if="tab === 'overview'" class="_gaps_m">
			<div class="aeakzknw">
				<MkAvatar class="avatar" :user="user" indicator link preview/>
				<div class="body">
					<span class="name"><MkUserName class="name" :user="user"/></span>
					<span class="sub"><span class="acct _monospace">@{{ acct(user) }}</span></span>
					<span class="state">
						<span v-if="suspended" class="suspended">{{ i18n.ts._userStatus.suspended }}</span>
						<span v-if="silenced" class="silenced">{{ i18n.ts._userStatus.silenced }}</span>
						<span v-if="moderator" class="moderator">{{ i18n.ts.moderator }}</span>
					</span>
				</div>
			</div>

			<MkInfo v-if="isSystem">{{ i18n.ts.isSystemAccount }}</MkInfo>

			<FormLink v-if="user.host" :to="`/instance-info/${user.host}`">{{ i18n.ts.instanceInfo }}</FormLink>

			<div style="display: flex; flex-direction: column; gap: 1em;">
				<MkKeyValue :copy="user.id" oneline>
					<template #key>ID</template>
					<template #value><span class="_monospace">{{ user.id }}</span></template>
				</MkKeyValue>
				<template v-if="!isSystem">
					<MkKeyValue oneline>
						<template #key>{{ i18n.ts.createdAt }}</template>
						<template #value><span class="_monospace"><MkTime :time="user.createdAt" :mode="'detail'"/></span></template>
					</MkKeyValue>
					<MkKeyValue v-if="info" oneline>
						<template #key>{{ i18n.ts.lastActiveDate }}</template>
						<template #value><span class="_monospace"><MkTime :time="info.lastActiveDate" :mode="'detail'"/></span></template>
					</MkKeyValue>
					<MkKeyValue v-if="info" oneline>
						<template #key>{{ i18n.ts.email }}</template>
						<template #value><span class="_monospace">{{ info.email }}</span></template>
					</MkKeyValue>
				</template>
			</div>

			<MkModerationNote v-if="!isSystem" v-model="moderationNote" :save="saveModerationNote"/>

			<FormSection v-if="!isSystem">
				<div class="_gaps">
					<MkSwitch v-model="suspended" @update:modelValue="toggleSuspend">{{ i18n.ts.suspend }}</MkSwitch>

					<div>
						<MkButton v-if="user.host == null" inline style="margin-right: 8px;" @click="resetPassword"><i class="ti ti-key"></i> {{ i18n.ts.resetPassword }}</MkButton>
						<MkButton v-if="user.host == null" inline @click="unsetMfa"><i class="ti ti-shield"></i> {{ i18n.ts.unsetMfa }}</MkButton>
					</div>

					<MkFolder>
						<template #icon><i class="ti ti-license"></i></template>
						<template #label>{{ i18n.ts._role.policies }}</template>
						<div class="_gaps">
							<div v-for="policy in Object.keys(info.policies)" :key="policy">
								{{ policy }} ... {{ info.policies[policy as keyof typeof info.policies] }}
							</div>
						</div>
					</MkFolder>

					<MkFolder>
						<template #icon><i class="ti ti-password"></i></template>
						<template #label>IP</template>
						<MkInfo v-if="!iAmAdmin" warn>{{ i18n.ts.requireAdminForView }}</MkInfo>
						<MkInfo v-else>{{ i18n.ts._adminUser.ipFirstSeenDescription }}</MkInfo>
						<template v-if="iAmAdmin && ips">
							<div v-for="record in ips" :key="record.ip" class="_monospace" :class="$style.ip" style="margin: 1em 0;">
								<span class="date">{{ record.createdAt }}</span>
								<span class="ip">{{ record.ip }}</span>
							</div>
						</template>
					</MkFolder>

					<div>
						<MkButton v-if="iAmModerator" inline danger style="margin-right: 8px;" @click="unsetUserAvatar"><i class="ti ti-user-circle"></i> {{ i18n.ts.unsetUserAvatar }}</MkButton>
						<MkButton v-if="iAmModerator" inline danger @click="unsetUserBanner"><i class="ti ti-photo"></i> {{ i18n.ts.unsetUserBanner }}</MkButton>
					</div>
					<MkButton v-if="$i.isAdmin" inline danger @click="deleteAccount">{{ i18n.ts.deleteAccount }}</MkButton>
				</div>
			</FormSection>
		</div>

		<div v-else-if="tab === 'roles'" class="_gaps">
			<div class="_adminPanel">
				<MkPaginationBar v-slot="{ items }" :items="roleRows">
					<div class="_adminTableContainer">
						<table class="_adminTable" :class="$style.roleTable" :aria-label="i18n.ts.roles">
							<colgroup>
								<col :class="$style.roleNameColumn"/>
								<col :class="$style.typeColumn"/>
								<col :class="$style.permissionColumn"/>
								<col :class="$style.typeColumn"/>
								<col :class="$style.dateColumn"/>
								<col :class="$style.dateColumn"/>
								<col :class="$style.roleActionsColumn"/>
							</colgroup>
							<thead>
								<tr>
									<th scope="col">{{ i18n.ts._role.name }}</th>
									<th scope="col">{{ i18n.ts._role.assignTarget }}</th>
									<th scope="col">{{ i18n.ts._role.permission }}</th>
									<th scope="col">{{ i18n.ts.visibility }}</th>
									<th scope="col">{{ i18n.ts._role.assignedAt }}</th>
									<th scope="col">{{ i18n.ts.expirationDate }}</th>
									<th scope="col" class="_adminTableActions">{{ i18n.ts.operations }}</th>
								</tr>
							</thead>
							<tbody>
								<tr v-for="{ role, assignment } in items" :key="role.id">
									<td>
										<button type="button" class="_button _textButton _adminTableIdentity" :class="$style.roleName" :style="{ '--role-color': role.color ?? 'var(--MI_THEME-fgTransparentWeak)' }" @click="os.pageWindow(`/admin/roles/${role.id}`)">
											<img v-if="role.iconUrl" :class="$style.roleBadge" :src="role.iconUrl" alt="" loading="lazy" decoding="async"/>
											<i v-else-if="role.isAdministrator" class="ti ti-crown" aria-hidden="true"></i>
											<i v-else-if="role.isModerator" class="ti ti-shield" aria-hidden="true"></i>
											<i v-else class="ti ti-user" aria-hidden="true"></i>
											<Mfm :text="role.name" :plain="true" :nowrap="true"/>
										</button>
										<div v-if="role.description" class="_adminTableSecondary" :class="$style.ellipsis" :title="role.description"><Mfm :text="role.description" :plain="true" :nowrap="true"/></div>
									</td>
									<td>{{ role.target === 'manual' ? i18n.ts._role.manual : i18n.ts._role.conditional }}</td>
									<td>{{ role.isAdministrator ? i18n.ts.administrator : role.isModerator ? i18n.ts.moderator : i18n.ts.normal }}</td>
									<td><span class="_adminTableStatus" :style="{ '--admin-statusColor': role.isPublic ? 'var(--MI_THEME-success)' : 'var(--MI_THEME-fgTransparentWeak)' }">{{ role.isPublic ? i18n.ts.public : i18n.ts.private }}</span></td>
									<td><MkTime v-if="assignment" :time="assignment.createdAt" mode="detail"/><span v-else class="_adminTableSecondary">{{ i18n.ts.notSet }}</span></td>
									<td><MkTime v-if="assignment?.expiresAt" :time="assignment.expiresAt" mode="detail"/><span v-else-if="assignment">{{ i18n.ts.indefinitely }}</span><span v-else class="_adminTableSecondary">-</span></td>
									<td class="_adminTableActions">
										<div class="_adminTableTools">
											<button type="button" class="_button _textButton" @click="os.pageWindow(`/admin/roles/${role.id}`)">{{ i18n.ts.details }}</button>
											<button v-if="role.target === 'manual'" type="button" class="_button _textButton" :class="$style.dangerAction" @click="unassignRole(role, $event)">{{ i18n.ts.unassign }}</button>
										</div>
									</td>
								</tr>
								<tr v-if="roleRows.length === 0"><td colspan="7" class="_adminTableEmpty">{{ i18n.ts.nothing }}</td></tr>
							</tbody>
						</table>
					</div>
				</MkPaginationBar>
			</div>
		</div>

		<div v-else-if="tab === 'announcements'" class="_gaps">
			<div class="_adminPanel">
				<MkPagination :paginator="announcementsPaginator" paged>
					<template #default="{ items }">
						<div class="_adminTableContainer">
							<table class="_adminTable" :class="$style.announcementTable" :aria-label="i18n.ts.announcements">
								<colgroup>
									<col :class="$style.announcementTitleColumn"/>
									<col :class="$style.permissionColumn"/>
									<col :class="$style.typeColumn"/>
									<col :class="$style.typeColumn"/>
									<col :class="$style.dateColumn"/>
									<col :class="$style.dateColumn"/>
									<col :class="$style.announcementActionsColumn"/>
								</colgroup>
								<thead>
									<tr>
										<th scope="col">{{ i18n.ts.title }}</th>
										<th scope="col">{{ i18n.ts.display }}</th>
										<th scope="col">{{ i18n.ts.state }}</th>
										<th scope="col" class="_adminTableNumber">{{ i18n.ts.messageRead }}</th>
										<th scope="col">{{ i18n.ts.createdAt }}</th>
										<th scope="col">{{ i18n.ts.updatedAt }}</th>
										<th scope="col" class="_adminTableActions">{{ i18n.ts.operations }}</th>
									</tr>
								</thead>
								<tbody>
									<tr v-for="announcement in items" :key="announcement.id">
										<td>
											<button type="button" class="_button _textButton _adminTableIdentity" :class="$style.announcementTitle" @click="editAnnouncement(announcement)">
												<i v-if="announcement.icon === 'info'" class="ti ti-info-circle" aria-hidden="true"></i>
												<i v-else-if="announcement.icon === 'warning'" class="ti ti-alert-triangle" style="color: var(--MI_THEME-warn);" aria-hidden="true"></i>
												<i v-else-if="announcement.icon === 'error'" class="ti ti-circle-x" style="color: var(--MI_THEME-error);" aria-hidden="true"></i>
												<i v-else-if="announcement.icon === 'success'" class="ti ti-check" style="color: var(--MI_THEME-success);" aria-hidden="true"></i>
												<span :class="$style.ellipsis" :title="announcement.title">{{ announcement.title }}</span>
											</button>
											<div class="_adminTableSecondary" :class="$style.announcementText" :title="announcement.text">{{ announcement.text }}</div>
										</td>
										<td>{{ announcement.display === 'normal' ? i18n.ts._announcement.normalDisplay : announcement.display === 'banner' ? i18n.ts.banner : i18n.ts.dialog }}</td>
										<td><span class="_adminTableStatus" :style="announcement.isActive ? undefined : { '--admin-statusColor': 'var(--MI_THEME-fgTransparentWeak)' }">{{ announcement.isActive ? i18n.ts._announcement.active : i18n.ts.archived }}</span></td>
										<td class="_adminTableNumber">{{ i18n.tsx.nUsersRead({ n: announcement.reads }) }}</td>
										<td><MkTime :time="announcement.createdAt" mode="detail"/></td>
										<td><MkTime v-if="announcement.updatedAt" :time="announcement.updatedAt" mode="detail"/><span v-else class="_adminTableSecondary">-</span></td>
										<td class="_adminTableActions"><button type="button" class="_button _textButton" @click="editAnnouncement(announcement)"><i class="ti ti-pencil" aria-hidden="true"></i> {{ i18n.ts.edit }}</button></td>
									</tr>
								</tbody>
							</table>
						</div>
					</template>
				</MkPagination>
			</div>
		</div>

		<div v-else-if="tab === 'drive'" class="_gaps">
			<MkFileListForAdmin :paginator="filesPaginator" viewMode="grid"/>
		</div>

		<div v-else-if="tab === 'chart'" class="_gaps_m">
			<div class="cmhjzshm">
				<div class="selects">
					<MkSelect v-model="chartSrc" :items="chartSrcDef" style="margin: 0 10px 0 0; flex: 1;">
					</MkSelect>
				</div>
				<div class="charts">
					<div class="label">{{ i18n.tsx.recentNHours({ n: 90 }) }}</div>
					<MkChart class="chart" :src="chartSrc" span="hour" :limit="90" :args="{ user, withoutAll: true }" :detailed="true"></MkChart>
					<div class="label">{{ i18n.tsx.recentNDays({ n: 90 }) }}</div>
					<MkChart class="chart" :src="chartSrc" span="day" :limit="90" :args="{ user, withoutAll: true }" :detailed="true"></MkChart>
				</div>
			</div>
		</div>

		<div v-else-if="tab === 'raw'" class="_gaps_m">
			<MkObjectView v-if="info && $i.isAdmin" tall :value="info">
			</MkObjectView>

			<MkObjectView tall :value="user">
			</MkObjectView>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, watch, ref, markRaw } from 'vue';
import * as Misskey from 'misskey-js';
import { url } from '@@/js/config.js';
import MkChart from '@/components/MkChart.vue';
import MkObjectView from '@/components/MkObjectView.vue';
import MkModerationNote from '@/components/MkModerationNote.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import FormLink from '@/components/form/link.vue';
import FormSection from '@/components/form/section.vue';
import MkButton from '@/components/MkButton.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkKeyValue from '@/components/MkKeyValue.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkFileListForAdmin from '@/components/MkFileListForAdmin.vue';
import MkInfo from '@/components/MkInfo.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { isAccountSessionErrorHandled } from '@/utility/account-session-error.js';
import { acct } from '@@/js/user.js';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import { useMkSelect } from '@/composables/use-mkselect.js';
import { ensureSignin, iAmAdmin, iAmModerator } from '@/i.js';
import MkPagination from '@/components/MkPagination.vue';
import MkPaginationBar from '@/components/MkPaginationBar.vue';
import { Paginator } from '@/utility/paginator.js';

const $i = ensureSignin();

const props = withDefaults(defineProps<{
	userId: string;
	initialTab?: string;
}>(), {
	initialTab: 'overview',
});

const result = await _fetch_();

const tab = ref(props.initialTab);
const {
	model: chartSrc,
	def: chartSrcDef,
} = useMkSelect({
	items: [
		{ label: i18n.ts.notes, value: 'per-user-notes' },
	],
	initialValue: 'per-user-notes',
});
const user = ref(result.user);
const info = ref(result.info);
const ips = ref(result.ips);
const ap = ref<Misskey.entities.ApGetResponse | null>(null);
const moderator = ref(info.value.isModerator);
const silenced = ref(info.value.isSilenced);
const suspended = ref(info.value.isSuspended);
const isSystem = ref(user.value.host == null && user.value.username.includes('.'));
const moderationNote = ref(info.value.moderationNote ?? '');
const filesPaginator = markRaw(new Paginator('admin/drive/files', {
	limit: 10,
	computedParams: computed(() => ({
		userId: props.userId,
	})),
}));

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

const announcementsPaginator = markRaw(new Paginator('admin/announcements/list', {
	limit: 10,
	computedParams: computed(() => ({
		userId: props.userId,
		status: announcementsStatus.value,
	})),
}));
const roleRows = computed(() => {
	const assignments = new Map(info.value.roleAssigns.map(assignment => [assignment.roleId, assignment]));
	return info.value.roles.map(role => ({ role, assignment: assignments.get(role.id) }));
});

function _fetch_() {
	return Promise.all([misskeyApi('users/show', {
		userId: props.userId,
	}), misskeyApi('admin/show-user', {
		userId: props.userId,
	}), iAmAdmin ? misskeyApi('admin/get-user-ips', {
		userId: props.userId,
	}) : Promise.resolve(null)]).then(([_user, _info, _ips]) => ({
		user: _user,
		info: _info,
		ips: _ips,
	}));
}

async function saveModerationNote(value: string) {
	await os.apiWithDialog('admin/update-user-note', { userId: user.value.id, text: value });
	await refreshUser();
}

async function refreshUser() {
	const result = await _fetch_();
	user.value = result.user;
	info.value = result.info;
	ips.value = result.ips;
	moderator.value = info.value.isModerator;
	silenced.value = info.value.isSilenced;
	suspended.value = info.value.isSuspended;
	isSystem.value = user.value.host == null && user.value.username.includes('.');
	moderationNote.value = info.value.moderationNote ?? '';
}

async function resetPassword() {
	const confirm = await os.confirm({
		type: 'warning',
		text: i18n.ts.resetPasswordConfirm,
	});
	if (confirm.canceled) {
		return;
	} else {
		const { password } = await os.apiWithDialog('admin/reset-password', {
			userId: user.value.id,
		});
		os.alert({
			type: 'success',
			text: i18n.tsx.newPasswordIs({ password }),
		});
	}
}

async function unsetMfa() {
	const confirm = await os.confirm({
		type: 'warning',
		text: i18n.ts.unsetMfaConfirm,
	});
	if (confirm.canceled) {
		return;
	} else {
		await os.apiWithDialog('admin/unset-mfa', {
			userId: user.value.id,
		});
		os.toast(i18n.ts._adminUser.mfaUnset, 'success');
	}
}

async function toggleSuspend(v: boolean) {
	const confirm = await os.confirm({
		type: 'warning',
		text: v ? i18n.ts.suspendConfirm : i18n.ts.unsuspendConfirm,
	});
	if (confirm.canceled) {
		suspended.value = !v;
	} else {
		// 开关成功不提示；失败时提示并还原开关
		try {
			await misskeyApi(v ? 'admin/suspend-user' : 'admin/unsuspend-user', { userId: user.value.id });
		} catch (error) {
			suspended.value = !v;
			if (!isAccountSessionErrorHandled(error)) os.toast(i18n.ts.somethingHappened, 'error');
			return;
		}
		await refreshUser();
	}
}

async function unsetUserAvatar() {
	const confirm = await os.confirm({
		type: 'warning',
		text: i18n.ts.unsetUserAvatarConfirm,
	});
	if (confirm.canceled) return;
	const process = async () => {
		await misskeyApi('admin/unset-user-avatar', { userId: user.value.id });
		os.toast(i18n.ts.removed, 'success');
	};
	await process().catch(err => {
		if (!isAccountSessionErrorHandled(err)) os.toast(err?.message || i18n.ts.somethingHappened, 'error');
	});
	refreshUser();
}

async function unsetUserBanner() {
	const confirm = await os.confirm({
		type: 'warning',
		text: i18n.ts.unsetUserBannerConfirm,
	});
	if (confirm.canceled) return;
	const process = async () => {
		await misskeyApi('admin/unset-user-banner', { userId: user.value.id });
		os.toast(i18n.ts.removed, 'success');
	};
	await process().catch(err => {
		if (!isAccountSessionErrorHandled(err)) os.toast(err?.message || i18n.ts.somethingHappened, 'error');
	});
	refreshUser();
}

async function deleteAccount() {
	const confirm = await os.confirm({
		type: 'warning',
		text: i18n.ts.deleteAccountConfirm,
	});
	if (confirm.canceled) return;

	const typed = await os.inputText({
		text: i18n.tsx.typeToConfirm({ x: user.value?.username }),
	});
	if (typed.canceled) return;

	if (typed.result === user.value?.username) {
		await os.apiWithDialog('admin/delete-account', {
			userId: user.value.id,
		});
		os.toast(i18n.ts._accountDelete.started, 'success');
	} else {
		os.alert({
			type: 'error',
			text: i18n.ts._adminUser.confirmationMismatch,
		});
	}
}

async function assignRole() {
	const roles = await misskeyApi('admin/roles/list').then(it => it.filter(r => r.target === 'manual'));

	const { canceled, result: roleId } = await os.select({
		title: i18n.ts._role.chooseRoleToAssign,
		items: roles.map(r => ({ label: r.name, value: r.id })),
	});
	if (canceled || roleId == null) return;

	const { canceled: canceled2, result: period } = await os.select({
		title: i18n.ts.period + ': ' + roles.find(r => r.id === roleId)!.name,
		items: [{
			value: 'indefinitely', label: i18n.ts.indefinitely,
		}, {
			value: 'oneHour', label: i18n.ts.oneHour,
		}, {
			value: 'oneDay', label: i18n.ts.oneDay,
		}, {
			value: 'oneWeek', label: i18n.ts.oneWeek,
		}, {
			value: 'oneMonth', label: i18n.ts.oneMonth,
		}],
		default: 'indefinitely',
	});
	if (canceled2) return;

	const expiresAt = period === 'indefinitely' ? null
		: period === 'oneHour' ? Date.now() + (1000 * 60 * 60)
		: period === 'oneDay' ? Date.now() + (1000 * 60 * 60 * 24)
		: period === 'oneWeek' ? Date.now() + (1000 * 60 * 60 * 24 * 7)
		: period === 'oneMonth' ? Date.now() + (1000 * 60 * 60 * 24 * 30)
		: null;

	await os.apiWithDialog('admin/roles/assign', { roleId, userId: user.value.id, expiresAt });
	os.toast(i18n.ts.added, 'success');
	refreshUser();
}

async function unassignRole(role: typeof info.value.roles[number], ev: PointerEvent) {
	os.popupMenu([{
		text: i18n.ts.unassign,
		icon: 'ti ti-x',
		danger: true,
		action: async () => {
			await os.apiWithDialog('admin/roles/unassign', { roleId: role.id, userId: user.value.id });
			os.toast(i18n.ts.removed, 'success');
			refreshUser();
		},
	}], ev.currentTarget ?? ev.target);
}

async function createAnnouncement() {
	const { dispose } = await os.popupAsyncWithDialog(import('@/components/MkUserAnnouncementEditDialog.vue').then(x => x.default), {
		user: user.value,
	}, {
		done: () => announcementsPaginator.reload(),
		closed: () => dispose(),
	});
}

async function editAnnouncement(announcement: Misskey.entities.AdminAnnouncementsListResponse[number]) {
	const { dispose } = await os.popupAsyncWithDialog(import('@/components/MkUserAnnouncementEditDialog.vue').then(x => x.default), {
		user: user.value,
		announcement,
	}, {
		done: () => announcementsPaginator.reload(),
		closed: () => dispose(),
	});
}

watch(user, () => {
	misskeyApi('ap/get', {
		uri: user.value.uri ?? `${url}/users/${user.value.id}`,
	}).then(res => {
		ap.value = res;
	});
}, { immediate: true });

const headerActions = computed(() => []);

const headerTabs = computed(() => isSystem.value ? [{
	key: 'overview',
	title: i18n.ts.overview,
	icon: 'ti ti-info-circle',
}, {
	key: 'raw',
	title: i18n.ts.rawData,
	icon: 'ti ti-code',
}] : [{
	key: 'overview',
	title: i18n.ts.overview,
	icon: 'ti ti-info-circle',
}, {
	key: 'roles',
	title: i18n.ts.roles,
	icon: 'ti ti-badges',
}, {
	key: 'announcements',
	title: i18n.ts.announcements,
	icon: 'ti ti-speakerphone',
}, {
	key: 'drive',
	title: i18n.ts.drive,
	icon: 'ti ti-cloud',
}, {
	key: 'chart',
	title: i18n.ts.charts,
	icon: 'ti ti-chart-line',
}, {
	key: 'raw',
	title: i18n.ts.rawData,
	icon: 'ti ti-code',
}]);

definePage(() => ({
	title: user.value ? acct(user.value) : i18n.ts.userInfo,
	icon: 'ti ti-user-exclamation',
}));
</script>

<style lang="scss" scoped>
.aeakzknw {
	display: flex;
	align-items: center;

	> .avatar {
		display: block;
		width: 64px;
		height: 64px;
		margin-right: 16px;
	}

	> .body {
		flex: 1;
		overflow: hidden;

		> .name {
			display: block;
			width: 100%;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		> .sub {
			display: block;
			width: 100%;
			font-size: 85%;
			color: var(--MI_THEME-fgTransparentWeak);
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		> .state {
			display: flex;
			gap: 8px;
			flex-wrap: wrap;
			margin-top: 4px;

			&:empty {
				display: none;
			}

			> .suspended, > .silenced, > .moderator {
				display: inline-block;
				border: solid 1px;
				border-radius: 6px;
				padding: 2px 6px;
				font-size: 85%;
			}

			> .suspended {
				color: var(--MI_THEME-error);
				border-color: var(--MI_THEME-error);
			}

			> .silenced {
				color: var(--MI_THEME-warn);
				border-color: var(--MI_THEME-warn);
			}

			> .moderator {
				color: var(--MI_THEME-success);
				border-color: var(--MI_THEME-success);
			}
		}
	}
}

.cmhjzshm {
	> .selects {
		display: flex;
		margin: 0 0 16px 0;
	}

	> .charts {
		> .label {
			margin-bottom: 12px;
			font-weight: bold;
		}
	}
}
</style>

<style lang="scss" module>
@use './admin/table.scss' as admin-table;

@include admin-table.styles;

.ip {
	display: flex;
	word-break: break-all;

	> :global(.date) {
		color: var(--MI_THEME-fgTransparentWeak);
	}

	> :global(.ip) {
		margin-left: auto;
	}
}

.roleTable,
.announcementTable {
	table-layout: fixed;
	min-width: 900px;
}

.roleNameColumn {
	width: 230px;
}

.announcementTitleColumn {
	width: 300px;
}

.typeColumn {
	width: 90px;
}

.permissionColumn {
	width: 110px;
}

.dateColumn {
	width: 160px;
}

.roleActionsColumn {
	width: 140px;
}

.announcementActionsColumn {
	width: 80px;
}

.roleName,
.announcementTitle {
	width: 100%;
	text-align: start;

	> i {
		flex-shrink: 0;
	}

	> :last-child {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
}

.roleName {
	color: var(--role-color);
}

.roleBadge {
	flex-shrink: 0;
	width: 1.3em;
	height: 1.3em;
	object-fit: contain;
}

.ellipsis {
	min-width: 0;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.announcementText {
	display: -webkit-box;
	overflow: hidden;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	overflow-wrap: anywhere;
}

.dangerAction {
	color: var(--MI_THEME-error);
}
</style>
