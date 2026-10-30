<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard>
	<div class="_pageBody">
		<div class="_gaps">
			<div class="_adminPanel">
				<div class="_adminToolbar">
					<MkSelect v-model="origin" :items="originDef" class="_adminToolbarField">
						<template #label>{{ i18n.ts.instance }}</template>
					</MkSelect>
					<MkInput v-model="searchHost" type="search" class="_adminToolbarField" :disabled="paginator.computedParams?.value?.origin === 'local'">
						<template #label>{{ i18n.ts.host }}</template>
					</MkInput>
					<MkInput v-model="userId" type="search" class="_adminToolbarField">
						<template #label>{{ i18n.ts.userId }}</template>
					</MkInput>
					<MkInput v-model="type" type="search" class="_adminToolbarField">
						<template #label>{{ i18n.ts.mimeType }}</template>
					</MkInput>
					<div class="_adminToolbarActions">
						<div :class="$style.viewModes">
							<button v-tooltip.noDelay="i18n.ts.preview" type="button" class="_button" :class="[$style.viewButton, { [$style.active]: viewMode === 'grid' }]" :aria-label="i18n.ts.preview" :aria-pressed="viewMode === 'grid'" @click="viewMode = 'grid'"><i class="ti ti-layout-grid" aria-hidden="true"></i></button>
							<button v-tooltip.noDelay="i18n.ts.details" type="button" class="_button" :class="[$style.viewButton, { [$style.active]: viewMode === 'table' }]" :aria-label="i18n.ts.details" :aria-pressed="viewMode === 'table'" @click="viewMode = 'table'"><i class="ti ti-list-details" aria-hidden="true"></i></button>
						</div>
						<MkButton small @click="lookupFile"><i class="ti ti-search" aria-hidden="true"></i> {{ i18n.ts.lookup }}</MkButton>
						<MkButton small @click="clear"><i class="ti ti-trash" aria-hidden="true"></i> {{ i18n.ts.clearCachedFiles }}</MkButton>
					</div>
				</div>
				<MkFileListForAdmin :paginator="paginator" :viewMode="viewMode" :class="{ _adminPanelInset: viewMode !== 'table' }"/>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, markRaw, ref } from 'vue';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkFileListForAdmin from '@/components/MkFileListForAdmin.vue';
import * as os from '@/os.js';
import { lookupFile } from '@/utility/admin-lookup.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { useMkSelect } from '@/composables/use-mkselect.js';
import { Paginator } from '@/utility/paginator.js';
import { useSearchQuery } from '@/composables/use-search-query.js';

const {
	model: origin,
	def: originDef,
} = useMkSelect({
	items: [
		{ label: i18n.ts.all, value: 'combined' },
		{ label: i18n.ts.local, value: 'local' },
		{ label: i18n.ts.remote, value: 'remote' },
	],
	initialValue: 'local',
});
const type = ref<string | null>(null);
const searchHost = ref('');
const userId = ref('');
const filteredType = useSearchQuery(type);
const filteredHost = useSearchQuery(searchHost);
const filteredUserId = useSearchQuery(userId);
const viewMode = ref<'grid' | 'table'>('grid');
const paginator = markRaw(new Paginator('admin/drive/files', {
	limit: 10,
	computedParams: computed(() => ({
		type: filteredType.value || null,
		userId: filteredUserId.value || null,
		origin: origin.value,
		hostname: filteredHost.value || null,
	})),
}));

function clear() {
	os.confirm({
		type: 'warning',
		text: i18n.ts.clearCachedFilesConfirm,
	}).then(({ canceled }) => {
		if (canceled) return;

		// 失败提示由 apiWithDialog 处理
		os.apiWithDialog('admin/drive/clean-remote-files', {}).then(() => {
			os.toast(i18n.ts.cleared, 'success');
		}, () => {});
	});
}

definePage(() => ({
	title: i18n.ts.files,
	icon: 'ti ti-cloud',
}));
</script>

<style lang="scss" module>
.viewModes {
	display: flex;
	align-items: center;
	gap: 2px;
}

.viewButton {
	display: grid;
	place-items: center;
	width: 32px;
	height: 32px;
	border-radius: calc(var(--MI-radius) / 3);
	color: var(--MI_THEME-fgTransparent);
	font-size: 1em;

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
	}

	&.active {
		background: var(--MI_THEME-accentedBg);
		color: var(--MI_THEME-accent);
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: -2px;
	}
}
</style>
