<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard :actions="headerActions" :tabs="headerTabs">
	<div class="_pageBody">
		<div class="_gaps_m">
			<div class="_adminPanel">
				<div class="_adminToolbar">
					<MkSelect v-model="type" :items="typeDef" class="_adminToolbarField">
						<template #label>{{ i18n.ts.state }}</template>
					</MkSelect>
					<MkSelect v-model="sort" :items="sortDef" class="_adminToolbarField" style="--admin-fieldWidth: 200px;">
						<template #label>{{ i18n.ts.sort }}</template>
					</MkSelect>
					<div class="_adminToolbarActions">
						<MkButton small primary @click="openCreateDialog($event)"><i class="ti ti-plus" aria-hidden="true"></i> {{ i18n.ts.createInviteCode }}</MkButton>
					</div>
				</div>
				<MkPagination :paginator="paginator" pageEmpty>
					<template #default="{ items }">
						<div class="_adminTableContainer">
							<table class="_adminTable">
								<thead>
									<tr>
										<th scope="col">{{ i18n.ts.invitationCode }}</th>
										<th scope="col">{{ i18n.ts.state }}</th>
										<th scope="col">{{ i18n.ts.inviteCodeCreator }}</th>
										<th scope="col">{{ i18n.ts.registeredUserUsingInviteCode }}</th>
										<th scope="col">{{ i18n.ts.createdAt }}</th>
										<th scope="col">{{ i18n.ts.expirationDate }}</th>
										<th scope="col">{{ i18n.ts.inviteCodeUsedAt }}</th>
										<th scope="col" class="_adminTableActions">{{ i18n.ts.operations }}</th>
									</tr>
								</thead>
								<tbody>
									<MkInviteCode v-for="item in items" :key="item.id" :invite="item" :onDeleted="deleted" moderator table/>
								</tbody>
							</table>
						</div>
					</template>
				</MkPagination>
			</div>
		</div>
	</div>
</PageWithHeader>
<Teleport to="#misskey-popups" defer>
	<MkModalWindow
		v-if="createDialogOpen"
		:width="480"
		:height="520"
		autoHeight
		:closeOnBackdrop="false"
		headerIcon="ti ti-user-plus"
		role="dialog"
		tabindex="-1"
		aria-modal="true"
		:aria-label="i18n.ts.createInviteCode"
		@closed="onCreateDialogClosed"
	>
		<template #header>{{ i18n.ts.createInviteCode }}</template>
		<div class="_gaps_m" :class="$style.createDialog">
			<MkSwitch v-model="noExpirationDate">
				<template #label>{{ i18n.ts.noExpirationDate }}</template>
			</MkSwitch>
			<MkInput v-if="!noExpirationDate" v-model="expiresAt" type="datetime-local">
				<template #label>{{ i18n.ts.expirationDate }}</template>
			</MkInput>
			<MkInput v-model="createCount" type="number" :min="1">
				<template #label>{{ i18n.ts.createCount }}</template>
			</MkInput>
		</div>
		<template #footer>
			<MkButton primary @click="createWithOptions">{{ i18n.ts.create }}</MkButton>
		</template>
	</MkModalWindow>
</Teleport>
</template>

<script lang="ts" setup>
import { computed, markRaw, ref, inject, watch, onActivated, onDeactivated, nextTick } from 'vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import MkButton from '@/components/MkButton.vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkInput from '@/components/MkInput.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkPagination from '@/components/MkPagination.vue';
import MkInviteCode from '@/components/MkInviteCode.vue';
import { definePage } from '@/page.js';
import { useMkSelect } from '@/composables/use-mkselect.js';
import { Paginator } from '@/utility/paginator.js';
import { DI } from '@/di.js';

const {
	model: type,
	def: typeDef,
} = useMkSelect({
	items: [
		{ label: i18n.ts.all, value: 'all' },
		{ label: i18n.ts.unused, value: 'unused' },
		{ label: i18n.ts.used, value: 'used' },
		{ label: i18n.ts.expired, value: 'expired' },
	],
	initialValue: 'all',
});
const {
	model: sort,
	def: sortDef,
} = useMkSelect({
	items: [
		{ label: `${i18n.ts.createdAt} (${i18n.ts.ascendingOrder})`, value: '+createdAt' },
		{ label: `${i18n.ts.createdAt} (${i18n.ts.descendingOrder})`, value: '-createdAt' },
		{ label: `${i18n.ts.usedAt} (${i18n.ts.ascendingOrder})`, value: '+usedAt' },
		{ label: `${i18n.ts.usedAt} (${i18n.ts.descendingOrder})`, value: '-usedAt' },
	],
	initialValue: '+createdAt',
});

const paginator = markRaw(new Paginator('admin/invite/list', {
	limit: 10,
	computedParams: computed(() => ({
		type: type.value,
		sort: sort.value,
	})),
	offsetMode: true,
}));

const expiresAt = ref('');
const noExpirationDate = ref(true);
const createCount = ref(1);
const createDialogOpen = ref(false);
const pageActive = inject(DI.pageActive, ref(true));
const componentActive = ref(true);
let createFocusTarget: HTMLElement | null = null;

function openCreateDialog(event: PointerEvent) {
	if (!pageActive.value || !componentActive.value) return;
	createFocusTarget = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
	createDialogOpen.value = true;
}

function onCreateDialogClosed() {
	createDialogOpen.value = false;
	const target = createFocusTarget;
	createFocusTarget = null;
	if (!target || !pageActive.value || !componentActive.value) return;
	nextTick(() => {
		if (pageActive.value && componentActive.value && target.isConnected) target.focus({ preventScroll: true });
	});
}

function dismissCreateDialog() {
	createFocusTarget = null;
	createDialogOpen.value = false;
}

watch(pageActive, value => {
	if (!value) dismissCreateDialog();
}, { flush: 'sync' });
onActivated(() => { componentActive.value = true; });
onDeactivated(() => {
	componentActive.value = false;
	dismissCreateDialog();
});

async function createWithOptions() {
	const options = {
		expiresAt: noExpirationDate.value ? null : expiresAt.value,
		count: createCount.value,
	};

	// 失败提示由 apiWithDialog 处理；生成的邀请码需要用户查看，保留对话框
	const tickets = await os.apiWithDialog('admin/invite/create', options);
	os.alert({
		type: 'success',
		title: i18n.ts.inviteCodeCreated,
		text: tickets.map(x => x.code).join('\n'),
	});

	// 分页缓存可能超过 Paginator 的实时插入保留上限，重新读取可避免裁掉已加载的后续页。
	await paginator.reload();
}

function deleted(id: string) {
	paginator.removeItem(id);
}

const headerActions = computed(() => []);
const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.invitationCode,
	icon: 'ti ti-user-plus',
}));
</script>

<style lang="scss" module>
.createDialog {
	padding: var(--MI-cardPadding);
}
</style>
