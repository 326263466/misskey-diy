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
					<MkInput v-model="host" type="search" class="_adminToolbarField">
						<template #prefix><i class="ti ti-search"></i></template>
						<template #label>{{ i18n.ts.host }}</template>
					</MkInput>
					<MkSelect v-model="state" :items="stateDef" class="_adminToolbarField">
						<template #label>{{ i18n.ts.state }}</template>
					</MkSelect>
					<MkSelect v-model="sort" :items="sortDef" class="_adminToolbarField" style="--admin-fieldWidth: 200px;">
						<template #label>{{ i18n.ts.sort }}</template>
					</MkSelect>
				</div>

				<MkPagination v-slot="{items}" :paginator="paginator" pageEmpty>
					<div class="_adminTableContainer">
						<table class="_adminTable">
							<thead>
								<tr>
									<th scope="col">{{ i18n.ts.instance }}</th>
									<th scope="col">{{ i18n.ts.software }}</th>
									<th scope="col">{{ i18n.ts.state }}</th>
									<th scope="col" class="_adminTableNumber">{{ i18n.ts.users }}</th>
									<th scope="col" class="_adminTableNumber">{{ i18n.ts.notes }}</th>
									<th scope="col" class="_adminTableNumber">{{ i18n.ts.following }}</th>
									<th scope="col" class="_adminTableNumber">{{ i18n.ts.followers }}</th>
									<th scope="col" class="_adminTableActions">{{ i18n.ts.operations }}</th>
								</tr>
							</thead>
							<tbody>
								<tr v-for="instance in items" :key="instance.id">
									<td class="_adminTableMain">
										<MkA :class="$style.instance" :to="`/instance-info/${instance.host}`" behavior="window">
											<MkInstanceCardMini :class="$style.instanceCard" :instance="instance"/>
										</MkA>
									</td>
									<td>
										<div>{{ instance.softwareName || '?' }}</div>
										<div v-if="instance.softwareVersion" class="_adminTableSecondary _monospace">{{ instance.softwareVersion }}</div>
									</td>
									<td><span class="_adminTableStatus" :style="{ '--admin-statusColor': instance.isBlocked ? 'var(--MI_THEME-error)' : instance.isSuspended || instance.isNotResponding ? 'var(--MI_THEME-warn)' : instance.isSilenced ? 'var(--MI_THEME-fgTransparentWeak)' : 'var(--MI_THEME-success)' }">{{ getStatus(instance) }}</span></td>
									<td class="_adminTableNumber">{{ number(instance.usersCount) }}</td>
									<td class="_adminTableNumber">{{ number(instance.notesCount) }}</td>
									<td class="_adminTableNumber">{{ number(instance.followingCount) }}</td>
									<td class="_adminTableNumber">{{ number(instance.followersCount) }}</td>
									<td class="_adminTableActions"><MkA class="_textButton" :to="`/instance-info/${instance.host}`" behavior="window">{{ i18n.ts.details }}</MkA></td>
								</tr>
							</tbody>
						</table>
					</div>
				</MkPagination>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import { computed, markRaw, ref } from 'vue';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkPagination from '@/components/MkPagination.vue';
import MkInstanceCardMini from '@/components/MkInstanceCardMini.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { useMkSelect } from '@/composables/use-mkselect.js';
import { Paginator } from '@/utility/paginator.js';
import { useSearchQuery } from '@/composables/use-search-query.js';
import number from '@/filters/number.js';

const host = ref('');
const searchHost = useSearchQuery(host);
const {
	model: state,
	def: stateDef,
} = useMkSelect({
	items: [
		{ label: i18n.ts.all, value: 'all' },
		{ label: i18n.ts.federating, value: 'federating' },
		{ label: i18n.ts._chartSeries.federationSub, value: 'subscribing' },
		{ label: i18n.ts._chartSeries.federationPub, value: 'publishing' },
		{ label: i18n.ts.suspended, value: 'suspended' },
		{ label: i18n.ts.blocked, value: 'blocked' },
		{ label: i18n.ts.silence, value: 'silenced' },
		{ label: i18n.ts.notResponding, value: 'notResponding' },
	],
	initialValue: 'federating',
});
const {
	model: sort,
	def: sortDef,
} = useMkSelect({
	items: [
		{ label: `${i18n.ts.pubSub} (${i18n.ts.descendingOrder})`, value: '+pubSub' },
		{ label: `${i18n.ts.pubSub} (${i18n.ts.ascendingOrder})`, value: '-pubSub' },
		{ label: `${i18n.ts.notes} (${i18n.ts.descendingOrder})`, value: '+notes' },
		{ label: `${i18n.ts.notes} (${i18n.ts.ascendingOrder})`, value: '-notes' },
		{ label: `${i18n.ts.users} (${i18n.ts.descendingOrder})`, value: '+users' },
		{ label: `${i18n.ts.users} (${i18n.ts.ascendingOrder})`, value: '-users' },
		{ label: `${i18n.ts.following} (${i18n.ts.descendingOrder})`, value: '+following' },
		{ label: `${i18n.ts.following} (${i18n.ts.ascendingOrder})`, value: '-following' },
		{ label: `${i18n.ts.followers} (${i18n.ts.descendingOrder})`, value: '+followers' },
		{ label: `${i18n.ts.followers} (${i18n.ts.ascendingOrder})`, value: '-followers' },
		{ label: `${i18n.ts.registeredAt} (${i18n.ts.descendingOrder})`, value: '+firstRetrievedAt' },
		{ label: `${i18n.ts.registeredAt} (${i18n.ts.ascendingOrder})`, value: '-firstRetrievedAt' },
	],
	initialValue: '+pubSub',
});
const paginator = markRaw(new Paginator('federation/instances', {
	limit: 10,
	offsetMode: true,
	computedParams: computed(() => ({
		sort: sort.value,
		host: searchHost.value !== '' ? searchHost.value : null,
		...(
			state.value === 'federating' ? { federating: true, suspended: false, blocked: false } :
			state.value === 'subscribing' ? { subscribing: true, suspended: false, blocked: false } :
			state.value === 'publishing' ? { publishing: true, suspended: false, blocked: false } :
			state.value === 'suspended' ? { suspended: true } :
			state.value === 'blocked' ? { blocked: true } :
			state.value === 'silenced' ? { silenced: true } :
			state.value === 'notResponding' ? { notResponding: true } :
			{}),
	})),
}));

function getStatus(instance: Misskey.entities.FederationInstance) {
	switch (instance.suspensionState) {
		case 'manuallySuspended':
			return i18n.ts._instanceStatus.manuallySuspended;
		case 'goneSuspended':
			return i18n.ts._instanceStatus.autoSuspendedGone;
		case 'autoSuspendedForNotResponding':
			return i18n.ts._instanceStatus.autoSuspendedNotResponding;
		case 'none':
			break;
	}
	if (instance.isBlocked) return i18n.ts.blocked;
	if (instance.isSilenced) return i18n.ts._instanceStatus.silenced;
	if (instance.isNotResponding) return i18n.ts.error;
	return i18n.ts._instanceStatus.alive;
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.federation,
	icon: 'ti ti-whirl',
}));
</script>

<style lang="scss" module>
.instance {
	display: block;
	min-width: 220px;
	max-width: 340px;

	&:hover {
		text-decoration: none;
	}
}

.instance .instanceCard.instanceCard {
	padding: 0;
	background: transparent;
	background-image: none;
	border-radius: 0;

	> :global(.icon) {
		width: 32px;
		height: 32px;
		flex-shrink: 0;
	}

	> :global(.body) {
		font-size: inherit;
	}
}
</style>
