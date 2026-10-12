<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard :actions="headerActions">
	<div class="_pageBody">
		<MkTip k="antennas" style="margin-bottom: var(--MI-margin);">{{ i18n.ts._antennas.tip }}</MkTip>
		<MkResult v-if="!error && antennas.length === 0" type="empty" page :loading="fetching">
			<MkButton type="routerLink" to="/my/antennas/create" primary :class="$style.add"><i class="ti ti-plus"></i> {{ i18n.ts.add }}</MkButton>
		</MkResult>
		<MkLoading v-else-if="fetching" page>
			<MkButton type="routerLink" to="/my/antennas/create" primary :class="$style.add"><i class="ti ti-plus"></i> {{ i18n.ts.add }}</MkButton>
		</MkLoading>
		<MkError v-else-if="error" page @retry="_fetch_">
			<MkButton type="routerLink" to="/my/antennas/create" primary :class="$style.add"><i class="ti ti-plus"></i> {{ i18n.ts.add }}</MkButton>
		</MkError>
		<div v-else class="_gaps">
			<MkButton type="routerLink" to="/my/antennas/create" primary :class="$style.add"><i class="ti ti-plus"></i> {{ i18n.ts.add }}</MkButton>

			<div class="_gaps">
				<MkA v-for="antenna in antennas" :key="antenna.id" :class="$style.antenna" :to="`/timeline/antenna/${antenna.id}`">
					<div class="name"><Mfm :text="antenna.name" :plain="true" :nowrap="true"/></div>
				</MkA>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { onActivated, computed, ref } from 'vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { antennasCache } from '@/cache.js';

const antennas = computed(() => antennasCache.value.value ?? []);
const fetching = ref(false);
const error = ref(false);
let requestId = 0;

async function _fetch_() {
	const request = ++requestId;
	fetching.value = true;
	error.value = false;
	const pending = antennasCache.fetch();
	try {
		await pending;
	} catch {
		if (request === requestId) error.value = true;
	} finally {
		if (request === requestId) fetching.value = false;
	}
}

_fetch_();

const headerActions = computed(() => [{
	asFullButton: true,
	icon: 'ti ti-refresh',
	text: i18n.ts.reload,
	handler: () => {
		antennasCache.delete();
		_fetch_();
	},
}]);

definePage(() => ({
	title: i18n.ts.manageAntennas,
	icon: 'ti ti-antenna',
}));

onActivated(_fetch_);
</script>

<style lang="scss" module>
.add {
	margin: 0 auto;
}

.antenna {
	display: block;
	padding: var(--MI-cardPadding);
	border: var(--MI-divider);
	border-radius: 6px;

	&:hover {
		border: solid 1px var(--MI_THEME-accent);
		text-decoration: none;
	}
}

.name {
	font-weight: bold;
}
</style>
