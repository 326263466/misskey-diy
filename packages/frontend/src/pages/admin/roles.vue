<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" contentCard :actions="headerActions" :tabs="headerTabs">
	<template #header-actions>
		<div class="_adminToolbar _adminHeaderToolbar">
			<div class="_adminToolbarActions">
				<MkButton small @click="openBaseRoleDialog($event)"><i class="ti ti-adjustments" aria-hidden="true"></i> {{ i18n.ts._role.baseRole }}</MkButton>
				<MkButton small primary @click="create"><i class="ti ti-plus" aria-hidden="true"></i> {{ i18n.ts._role.new }}</MkButton>
			</div>
		</div>
	</template>
	<div class="_pageBody">
		<div class="_gaps">
			<div class="_adminPanel">
				<MkPaginationBar :key="tab" v-slot="{ items }" :items="tabRoles">
						<div class="_adminTableContainer">
							<table class="_adminTable">
								<thead>
									<tr>
										<th scope="col">{{ i18n.ts._role.name }}</th>
										<th scope="col">{{ i18n.ts.description }}</th>
										<th scope="col">{{ i18n.ts._role.permission }}</th>
										<th scope="col">{{ i18n.ts.visibility }}</th>
										<th scope="col" class="_adminTableNumber">{{ i18n.ts.users }}</th>
										<th scope="col" class="_adminTableActions">{{ i18n.ts.operations }}</th>
									</tr>
								</thead>
								<tbody>
									<tr v-if="tabRoles.length === 0">
										<td colspan="6" class="_adminTableEmpty">{{ i18n.ts.nothing }}</td>
									</tr>
									<tr v-for="role in items" :key="role.id">
										<td class="_adminTableMain">
											<button type="button" class="_button _adminTableIdentity" :class="$style.roleName" :style="{ '--role-color': role.color ?? 'var(--MI_THEME-fgTransparentWeak)' }" @click="openRole(`/admin/roles/${role.id}`)">
												<img v-if="role.iconUrl" :class="$style.roleBadge" :src="role.iconUrl" alt="" loading="lazy" decoding="async"/>
												<i v-else-if="role.isAdministrator" class="ti ti-crown" aria-hidden="true"></i>
												<i v-else-if="role.isModerator" class="ti ti-shield" aria-hidden="true"></i>
												<i v-else class="ti ti-user" aria-hidden="true"></i>
												<Mfm :text="role.name" :plain="true" :nowrap="true"/>
											</button>
										</td>
										<td :class="$style.description"><Mfm :text="role.description" :plain="true" :nowrap="true"/></td>
										<td>{{ role.isAdministrator ? i18n.ts.administrator : role.isModerator ? i18n.ts.moderator : i18n.ts.normal }}</td>
										<td>
											<span class="_adminTableStatus" :style="{ '--admin-statusColor': role.isPublic ? 'var(--MI_THEME-success)' : 'var(--MI_THEME-fgTransparentWeak)' }">
												<i :class="role.isPublic ? 'ti ti-world' : 'ti ti-lock'" aria-hidden="true"></i> {{ role.isPublic ? i18n.ts.public : i18n.ts.private }}
											</span>
										</td>
										<td class="_adminTableNumber">{{ role.target === 'manual' ? number(role.usersCount) : '?' }}</td>
										<td class="_adminTableActions">
											<div class="_adminTableTools">
												<button type="button" class="_button _textButton" @click="openRole(`/admin/roles/${role.id}`)">{{ i18n.ts.details }}</button>
												<button type="button" class="_button _textButton" @click="openRole(`/admin/roles/${role.id}/edit`)">{{ i18n.ts.edit }}</button>
											</div>
										</td>
									</tr>
								</tbody>
							</table>
						</div>
				</MkPaginationBar>
			</div>
		</div>
	</div>
</PageWithHeader>
<Teleport to="#misskey-popups" defer>
	<MkModalWindow
		v-if="baseRoleDialogOpen"
		:width="640"
		:height="720"
		autoHeight
		:closeOnBackdrop="false"
		headerIcon="ti ti-adjustments"
		role="dialog"
		tabindex="-1"
		aria-modal="true"
		:aria-label="i18n.ts._role.baseRole"
		@closed="onBaseRoleDialogClosed"
	>
		<template #header>{{ i18n.ts._role.baseRole }}</template>
		<div class="_gaps_s" :class="$style.baseRoleDialog">
			<MkInput v-model="baseRoleQ" type="search">
				<template #prefix><i class="ti ti-search"></i></template>
				<template #label>{{ i18n.ts.search }}</template>
			</MkInput>
			<XPolicyEditor v-model:rolePolicies="policies" :isBaseRole="true" :roleQuery="baseRoleQ"/>
		</div>
		<template #footer>
			<MkButton primary @click="updateBaseRole">{{ i18n.ts.save }}</MkButton>
		</template>
	</MkModalWindow>
</Teleport>
</template>

<script lang="ts" setup>
import { computed, reactive, ref, inject, watch, onActivated, onDeactivated, nextTick } from 'vue';
import MkInput from '@/components/MkInput.vue';
import MkButton from '@/components/MkButton.vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkPageWindow from '@/components/MkPageWindow.vue';
import MkPaginationBar from '@/components/MkPaginationBar.vue';
import XPolicyEditor from './roles.policy-editor.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { instance, fetchInstance } from '@/instance.js';
import { deepClone } from '@/utility/clone.js';
import number from '@/filters/number.js';
import { DI } from '@/di.js';

const baseRoleQ = ref('');
const baseRoleDialogOpen = ref(false);
const pageActive = inject(DI.pageActive, ref(true));
const componentActive = ref(true);
let baseRoleFocusTarget: HTMLElement | null = null;

function openBaseRoleDialog(event: PointerEvent) {
	if (!pageActive.value || !componentActive.value) return;
	baseRoleFocusTarget = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
	baseRoleDialogOpen.value = true;
}

function onBaseRoleDialogClosed() {
	baseRoleDialogOpen.value = false;
	const target = baseRoleFocusTarget;
	baseRoleFocusTarget = null;
	if (!target || !pageActive.value || !componentActive.value) return;
	nextTick(() => {
		if (pageActive.value && componentActive.value && target.isConnected) target.focus({ preventScroll: true });
	});
}

function dismissBaseRoleDialog() {
	baseRoleFocusTarget = null;
	baseRoleDialogOpen.value = false;
}

watch(pageActive, value => {
	if (!value) dismissBaseRoleDialog();
}, { flush: 'sync' });
onActivated(() => { componentActive.value = true; });
onDeactivated(() => {
	componentActive.value = false;
	dismissBaseRoleDialog();
});

const roles = ref(await misskeyApi('admin/roles/list'));
const tab = ref<'manual' | 'conditional'>('manual');
const tabRoles = computed(() => roles.value.filter(role => role.target === tab.value));

const policies = reactive(deepClone(instance.policies));

async function updateBaseRole() {
	await os.apiWithDialog('admin/roles/update-default-policies', {
		//@ts-expect-error misskey-js側の型定義が不十分
		policies,
	});
	os.toast(i18n.ts.saved, 'success');
	fetchInstance(true);
}

function create() {
	openRole('/admin/roles/new');
}

function openRole(path: string) {
	const { dispose } = os.popup(MkPageWindow, { initialPath: path }, {
		closed: () => {
			dispose();
			misskeyApi('admin/roles/list').then(result => {
				roles.value = result;
			}, () => {});
		},
	});
}

const headerActions = computed(() => []);

const headerTabs = computed(() => [{
	key: 'manual',
	title: i18n.ts._role.manualRoles,
	icon: 'ti ti-user-check',
}, {
	key: 'conditional',
	title: i18n.ts._role.conditionalRoles,
	icon: 'ti ti-filter',
}]);

definePage(() => ({
	title: i18n.ts.roles,
	icon: 'ti ti-badges',
}));
</script>

<style lang="scss" module>
.roleName {
	padding-left: 10px;
	border-left: 3px solid var(--role-color);
	max-width: 100%;
	font-weight: 600;
	text-align: start;
}

.roleBadge {
	width: 24px;
	height: 24px;
	object-fit: contain;
	flex-shrink: 0;
}

.description {
	min-width: 160px;
	max-width: 300px;
	color: var(--MI_THEME-fgTransparentWeak);
}

.baseRoleDialog {
	padding: var(--MI-cardPadding);
}
</style>
