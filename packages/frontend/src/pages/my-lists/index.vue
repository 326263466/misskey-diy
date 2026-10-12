<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard :actions="headerActions">
	<div class="_pageBody">
		<div class="_gaps">
			<MkTip k="userLists">
				{{ i18n.ts._userLists.tip }}
			</MkTip>

			<MkResult v-if="!error && items.length === 0" type="empty" page :loading="fetching">
				<MkButton primary rounded style="margin: 0 auto;" @click="create"><i class="ti ti-plus"></i> {{ i18n.ts.createList }}</MkButton>
			</MkResult>
			<MkLoading v-else-if="fetching" page>
				<MkButton primary rounded style="margin: 0 auto;" @click="create"><i class="ti ti-plus"></i> {{ i18n.ts.createList }}</MkButton>
			</MkLoading>
			<MkError v-else-if="error" page @retry="_fetch_">
				<MkButton primary rounded style="margin: 0 auto;" @click="create"><i class="ti ti-plus"></i> {{ i18n.ts.createList }}</MkButton>
			</MkError>

			<div v-else class="_gaps">
				<MkButton primary rounded style="margin: 0 auto;" @click="create"><i class="ti ti-plus"></i> {{ i18n.ts.createList }}</MkButton>
				<MkA v-for="list in items" :key="list.id" class="_panel" :class="$style.list" :to="`/timeline/list/${list.id}`">
					<div style="margin-bottom: 4px;"><Mfm :text="list.name" :plain="true" :nowrap="true"/> <span :class="$style.nUsers">({{ i18n.tsx.nUsers({ n: `${list.userIds!.length}/${$i.policies['userEachUserListsLimit']}` }) }})</span></div>
					<MkAvatars :userIds="list.userIds!" :limit="10"/>
				</MkA>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { onActivated, computed, ref } from 'vue';
import MkButton from '@/components/MkButton.vue';
import MkAvatars from '@/components/MkAvatars.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { userListsCache } from '@/cache.js';
import { ensureSignin } from '@/i.js';

const $i = ensureSignin();

const items = computed(() => userListsCache.value.value ?? []);
const fetching = ref(false);
const error = ref(false);
let requestId = 0;

async function _fetch_() {
	const request = ++requestId;
	fetching.value = true;
	error.value = false;
	const pending = userListsCache.fetch();
	try {
		await pending;
	} catch {
		if (request === requestId) error.value = true;
	} finally {
		if (request === requestId) fetching.value = false;
	}
}

_fetch_();

async function create() {
	const { canceled, result: name } = await os.inputText({
		title: i18n.ts.enterListName,
		minLength: 1,
		maxLength: 100,
	});
	if (canceled || name == null) return;
	await os.apiWithDialog('users/lists/create', { name: name });
	userListsCache.delete();
	_fetch_();
}

const headerActions = computed(() => [{
	asFullButton: true,
	icon: 'ti ti-refresh',
	text: i18n.ts.reload,
	handler: () => {
		userListsCache.delete();
		_fetch_();
	},
}]);

definePage(() => ({
	title: i18n.ts.manageLists,
	icon: 'ti ti-list',
}));

onActivated(_fetch_);
</script>

<style lang="scss" module>
.list {
	display: block;
	padding: var(--MI-cardPadding);
	border: var(--MI-divider);
	border-radius: 6px;

	&:hover {
		border: solid 1px var(--MI_THEME-accent);
		text-decoration: none;
	}
}

.nUsers {
	font-size: .9em;
	color: var(--MI_THEME-fgTransparentWeak);
}
</style>
