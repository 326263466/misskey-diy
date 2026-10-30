<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard :actions="headerActions" :tabs="headerTabs">
	<div class="_pageBody">
		<div class="_gaps">
			<div class="_adminPanel">
				<div class="_adminToolbar" :class="$style.userToolbar">
					<h2 v-if="role.target === 'manual'" :class="$style.usersTitle"><i class="ti ti-users" aria-hidden="true"></i> {{ i18n.ts.users }} <span class="_adminTableSecondary">{{ role.usersCount }}</span></h2>
					<MkButton small primary @click="edit"><i class="ti ti-pencil"></i> {{ i18n.ts.edit }}</MkButton>
					<MkButton small @click="openInfoDialog($event)"><i class="ti ti-info-circle" aria-hidden="true"></i> {{ i18n.ts.info }}</MkButton>
					<MkButton small danger @click="del"><i class="ti ti-trash"></i> {{ i18n.ts.delete }}</MkButton>
					<MkButton v-if="role.target === 'manual'" small primary @click="assign"><i class="ti ti-plus"></i> {{ i18n.ts.assign }}</MkButton>
				</div>
				<section v-if="role.target === 'manual'">
					<MkPagination :paginator="usersPaginator">
						<template #empty><MkResult type="empty" :text="i18n.ts.noUsers"/></template>

						<template #default="{ items }">
							<div class="_adminTableContainer">
								<table class="_adminTable">
									<thead>
										<tr>
											<th scope="col">{{ i18n.ts.user }}</th>
											<th scope="col">{{ i18n.ts._role.assignedAt }}</th>
											<th scope="col">{{ i18n.ts.period }}</th>
											<th scope="col" class="_adminTableActions">{{ i18n.ts.operations }}</th>
										</tr>
									</thead>
									<tbody>
										<tr v-for="item in items" :key="item.id">
											<td class="_adminTableMain">
												<MkA :class="$style.user" :to="`/admin/user/${item.user.id}`" behavior="window">
													<MkUserCardMini :class="$style.userCard" :user="item.user"/>
												</MkA>
											</td>
											<td :class="$style.date"><MkTime :time="item.createdAt" mode="detail"/></td>
											<td :class="$style.date">{{ item.expiresAt ? new Date(item.expiresAt).toLocaleString() : i18n.ts.indefinitely }}</td>
											<td class="_adminTableActions">
												<div class="_adminTableTools">
													<MkA class="_textButton" :to="`/admin/user/${item.user.id}`" behavior="window">{{ i18n.ts.details }}</MkA>
													<button type="button" class="_button _textButton" style="color: var(--MI_THEME-error)" @click="unassign(item.user.id, $event)"><i class="ti ti-x" aria-hidden="true"></i> {{ i18n.ts.unassign }}</button>
												</div>
											</td>
										</tr>
									</tbody>
								</table>
							</div>
						</template>
					</MkPagination>
				</section>
				<div v-else class="_adminPanelInset"><MkInfo>{{ i18n.ts._role.isConditionalRole }}</MkInfo></div>
			</div>
		</div>
	</div>
</PageWithHeader>
<Teleport to="#misskey-popups" defer>
	<MkModalWindow
		v-if="infoDialogOpen"
		:width="640"
		:height="720"
		autoHeight
		headerIcon="ti ti-info-circle"
		role="dialog"
		tabindex="-1"
		aria-modal="true"
		:aria-label="i18n.ts.info"
		@closed="onInfoDialogClosed"
	>
		<template #header>{{ i18n.ts.info }} · {{ role.name }}</template>
		<div :class="$style.infoDialog"><XEditor :modelValue="role" readonly/></div>
	</MkModalWindow>
</Teleport>
</template>

<script lang="ts" setup>
import { computed, markRaw, reactive, ref, inject, watch, onActivated, onDeactivated, nextTick } from 'vue';
import * as Misskey from 'misskey-js';
import XEditor from './roles.editor.vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkPageWindow from '@/components/MkPageWindow.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkButton from '@/components/MkButton.vue';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkPagination from '@/components/MkPagination.vue';
import { useRouter } from '@/router.js';
import { Paginator } from '@/utility/paginator.js';
import { DI } from '@/di.js';

const router = useRouter();
const closeWindow = inject<(() => void) | null>('pageWindowClose', null);

const props = defineProps<{
	id: string;
}>();

const usersPaginator = markRaw(new Paginator('admin/roles/users', {
	limit: 20,
	computedParams: computed(() => props.id ? ({
		roleId: props.id,
	}) : undefined),
}));

const infoDialogOpen = ref(false);
const pageActive = inject(DI.pageActive, ref(true));
const componentActive = ref(true);
let infoFocusTarget: HTMLElement | null = null;

function openInfoDialog(event: PointerEvent) {
	if (!pageActive.value || !componentActive.value) return;
	infoFocusTarget = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
	infoDialogOpen.value = true;
}

function onInfoDialogClosed() {
	infoDialogOpen.value = false;
	const target = infoFocusTarget;
	infoFocusTarget = null;
	if (!target || !pageActive.value || !componentActive.value) return;
	nextTick(() => {
		if (pageActive.value && componentActive.value && target.isConnected) target.focus({ preventScroll: true });
	});
}

function dismissInfoDialog() {
	infoFocusTarget = null;
	infoDialogOpen.value = false;
}

watch(pageActive, value => {
	if (!value) dismissInfoDialog();
}, { flush: 'sync' });
onActivated(() => { componentActive.value = true; });
onDeactivated(() => {
	componentActive.value = false;
	dismissInfoDialog();
});

const role = reactive(await misskeyApi('admin/roles/show', {
	roleId: props.id,
}));

function edit() {
	const { dispose } = os.popup(MkPageWindow, { initialPath: `/admin/roles/${role.id}/edit` }, {
		closed: () => {
			dispose();
			misskeyApi('admin/roles/show', { roleId: role.id }).then(result => {
				Object.assign(role, result);
			}, () => {});
		},
	});
}

async function del() {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.tsx.deleteAreYouSure({ x: role.name }),
	});
	if (canceled) return;

	await os.apiWithDialog('admin/roles/delete', {
		roleId: role.id,
	});
	os.toast(i18n.ts.deleteSucceeded, 'success');

	if (closeWindow) closeWindow();
	else router.push('/admin/roles');
}

async function assign() {
	const user = await os.selectUser({ includeSelf: true });

	const { canceled: canceled2, result: period } = await os.select({
		title: i18n.ts.period + ': ' + role.name,
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

	await os.apiWithDialog('admin/roles/assign', { roleId: role.id, userId: user.id, expiresAt });
	os.toast(i18n.ts.added, 'success');
	//role.users.push(user);
	usersPaginator.reload();
}

async function unassign(userId: Misskey.entities.User['id'], ev: PointerEvent) {
	os.popupMenu([{
		text: i18n.ts.unassign,
		icon: 'ti ti-x',
		danger: true,
		action: async () => {
			await os.apiWithDialog('admin/roles/unassign', { roleId: role.id, userId: userId });
			os.toast(i18n.ts.removed, 'success');
			//role.users = role.users.filter(u => u.id !== userId);
			usersPaginator.reload();
		},
	}], ev.currentTarget ?? ev.target);
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: `${i18n.ts.role}: ${role.name}`,
	icon: 'ti ti-badge',
}));
</script>

<style lang="scss" module>
.userToolbar {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 12px;
}

.usersTitle {
	margin: 0 auto 0 0;
	font-size: 1em;
	font-weight: 600;
}

.user {
	display: block;
	min-width: 220px;
	max-width: 340px;

	&:hover {
		text-decoration: none;
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

.date {
	white-space: nowrap;
}

.infoDialog {
	padding: var(--MI-cardPadding);
}
</style>
