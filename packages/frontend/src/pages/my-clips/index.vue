<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" contentCard :tabs="headerTabs" :swipable="true" :loading="currentPaginator.fetching.value">
	<template v-if="tab === 'my' || tab === 'favorites'" #header-actions>
		<MkPaginationControl :paginator="currentPaginator" compact/>
	</template>
	<div class="_pageBody _gaps">
		<MkTip k="clips">
			{{ i18n.ts._clip.tip }}
		</MkTip>
		<MkPagination :paginator="currentPaginator" class="_gaps" pageEmpty>
			<template #loading>
				<MkLoading page>
					<MkButton v-if="tab === 'my'" primary rounded style="margin: 0 auto;" @click="create"><i class="ti ti-plus"></i> {{ i18n.ts.add }}</MkButton>
				</MkLoading>
			</template>
			<template #error="{ retry }">
				<MkError page @retry="retry">
					<MkButton v-if="tab === 'my'" primary rounded style="margin: 0 auto;" @click="create"><i class="ti ti-plus"></i> {{ i18n.ts.add }}</MkButton>
				</MkError>
			</template>
			<template #empty="{ fetching }">
				<MkResult type="empty" page :loading="fetching">
					<MkButton v-if="tab === 'my'" primary rounded style="margin: 0 auto;" @click="create"><i class="ti ti-plus"></i> {{ i18n.ts.add }}</MkButton>
				</MkResult>
			</template>
			<template #default="{ items }">
				<MkButton v-if="tab === 'my'" primary rounded @click="create"><i class="ti ti-plus"></i> {{ i18n.ts.add }}</MkButton>
				<MkClipPreview v-for="item in items" :key="item.id" :clip="item" :noUserInfo="tab === 'my'"/>
			</template>
		</MkPagination>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed, markRaw } from 'vue';
import MkPagination from '@/components/MkPagination.vue';
import MkPaginationControl from '@/components/MkPaginationControl.vue';
import MkButton from '@/components/MkButton.vue';
import MkClipPreview from '@/components/MkClipPreview.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { clipsCache } from '@/cache.js';
import { Paginator } from '@/utility/paginator.js';

const tab = ref('my');

const paginator = markRaw(new Paginator('clips/list', {
}));

const favoritesPaginator = markRaw(new Paginator('clips/my-favorites', {
	// ページネーションに対応していない
	noPaging: true,
}));
const currentPaginator = computed(() => tab.value === 'favorites' ? favoritesPaginator : paginator);

async function create() {
	const { canceled, result } = await os.form(i18n.ts.createNewClip, {
		name: {
			type: 'string',
			label: i18n.ts.name,
		},
		description: {
			type: 'string',
			required: false,
			multiline: true,
			treatAsMfm: true,
			label: i18n.ts.description,
		},
		isPublic: {
			type: 'boolean',
			label: i18n.ts.public,
			default: false,
		},
	});

	if (canceled) return;

	await os.apiWithDialog('clips/create', result);

	clipsCache.delete();

	paginator.reload();
}

const headerTabs = computed(() => [{
	key: 'my',
	title: i18n.ts.myClips,
}, {
	key: 'favorites',
	title: i18n.ts.favorites,
}]);

definePage(() => ({
	title: i18n.ts.clip,
	icon: 'ti ti-paperclip',
}));
</script>

<style lang="scss" module>

</style>
