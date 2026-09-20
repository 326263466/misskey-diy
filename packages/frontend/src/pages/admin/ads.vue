<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 900px;">
		<MkSelect v-model="filterType" :items="filterTypeDef" :class="$style.input">
			<template #label>{{ i18n.ts.state }}</template>
		</MkSelect>

		<MkLoading v-if="loading"/>
		<MkError v-else-if="error" @retry="refresh"/>
		<div v-else>
			<div v-for="ad in ads" class="_panel _gaps_m" :class="$style.ad">
				<MkAd v-if="ad.url" :key="ad.id" :specify="ad"/>

				<MkInput v-model="ad.url" type="url">
					<template #label>URL</template>
				</MkInput>

				<MkInput v-model="ad.imageUrl" type="url">
					<template #label>{{ i18n.ts.imageUrl }}</template>
				</MkInput>

				<MkRadios
					v-model="ad.place"
					:options="[
						{ value: 'square' },
						{ value: 'horizontal' },
						{ value: 'horizontal-big' },
					]"
				>
					<template #label>Form</template>
				</MkRadios>

				<FormSplit>
					<MkInput v-model="ad.ratio" type="number">
						<template #label>{{ i18n.ts.ratio }}</template>
					</MkInput>
					<MkInput v-model="ad.startsAt" type="datetime-local">
						<template #label>{{ i18n.ts.startingperiod }}</template>
					</MkInput>
					<MkInput v-model="ad.expiresAt" type="datetime-local">
						<template #label>{{ i18n.ts.expiration }}</template>
					</MkInput>
				</FormSplit>

				<MkSwitch v-model="ad.isSensitive">
					<template #label>{{ i18n.ts.sensitive }}</template>
				</MkSwitch>

				<MkFolder>
					<template #label>{{ i18n.ts.advancedSettings }}</template>
					<span>
						{{ i18n.ts._ad.timezoneinfo }}
						<div v-for="(day, index) in daysOfWeek" :key="index">
							<input
								:id="`ad${ad.id}-${index}`" type="checkbox" :checked="(ad.dayOfWeek & (1 << index)) !== 0"
								@change="toggleDayOfWeek(ad, index)"
							>
							<label :for="`ad${ad.id}-${index}`">{{ day }}</label>
						</div>
					</span>
				</MkFolder>

				<MkTextarea v-model="ad.memo">
					<template #label>{{ i18n.ts.memo }}</template>
				</MkTextarea>

				<div class="_buttons">
					<MkButton inline primary style="margin-right: 12px;" @click="save(ad)">
						<i
							class="ti ti-device-floppy"
						></i> {{ i18n.ts.save }}
					</MkButton>
					<MkButton inline danger @click="remove(ad)">
						<i class="ti ti-trash"></i> {{ i18n.ts.remove }}
					</MkButton>
				</div>
			</div>

			<template v-if="canFetchMore">
				<div :key="untilId" v-appear="more" :class="$style.sentinel" aria-hidden="true"></div>
			</template>
			<MkLoading v-if="loadingMore"/>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkRadios from '@/components/MkRadios.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkSelect from '@/components/MkSelect.vue';
import FormSplit from '@/components/form/split.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { useMkSelect } from '@/composables/use-mkselect.js';

type Ad = Misskey.entities.Ad & {
	place: 'square' | 'horizontal' | 'horizontal-big';
};

const ads = ref<Ad[]>([]);
const loading = ref(true);
const loadingMore = ref(false);
const error = ref(false);
const canFetchMore = ref(false);
const untilId = ref<string>();
const limit = 10;
let requestId = 0;

// 日期输入使用本地时间，转换为 ISO 字符串前先补偿时区偏移。
const localTime = new Date();
const localTimeDiff = localTime.getTimezoneOffset() * 60 * 1000;
const daysOfWeek: string[] = [i18n.ts._weekday.sunday, i18n.ts._weekday.monday, i18n.ts._weekday.tuesday, i18n.ts._weekday.wednesday, i18n.ts._weekday.thursday, i18n.ts._weekday.friday, i18n.ts._weekday.saturday];
const {
	model: filterType,
	def: filterTypeDef,
} = useMkSelect({
	items: [
		{ label: i18n.ts.all, value: 'all' },
		{ label: i18n.ts.publishing, value: 'publishing' },
		{ label: i18n.ts.expired, value: 'expired' },
	],
	initialValue: 'all',
});
const publishing = computed(() => filterType.value === 'all' ? null : filterType.value === 'publishing');

watch(filterType, refresh, { immediate: true });
onBeforeUnmount(() => requestId++);

function toEditableAd(ad: Misskey.entities.Ad): Ad {
	return {
		...(ad as Ad),
		expiresAt: new Date(new Date(ad.expiresAt).getTime() - localTimeDiff).toISOString().slice(0, 16),
		startsAt: new Date(new Date(ad.startsAt).getTime() - localTimeDiff).toISOString().slice(0, 16),
	};
}

function toggleDayOfWeek(ad: Misskey.entities.Ad, index: number) {
	ad.dayOfWeek ^= 1 << index;
}

function add() {
	ads.value.unshift({
		id: '',
		memo: '',
		place: 'square',
		priority: 'middle',
		ratio: 1,
		url: '',
		imageUrl: '',
		expiresAt: new Date().toISOString(),
		startsAt: new Date().toISOString(),
		dayOfWeek: 0,
		isSensitive: false,
	});
}

function remove(ad: Misskey.entities.Ad) {
	os.confirm({
		type: 'warning',
		text: i18n.tsx.removeAreYouSure({ x: ad.url }),
	}).then(({ canceled }) => {
		if (canceled) return;
		ads.value = ads.value.filter(x => x !== ad);
		if (ad.id === '') return;
		os.apiWithDialog('admin/ad/delete', {
			id: ad.id,
		}).then(() => {
			refresh();
		});
	});
}

function save(ad: Misskey.entities.Ad) {
	if (ad.id === '') {
		misskeyApi('admin/ad/create', {
			...ad,
			expiresAt: new Date(ad.expiresAt).getTime(),
			startsAt: new Date(ad.startsAt).getTime(),
		}).then(() => {
			os.alert({
				type: 'success',
				text: i18n.ts.saved,
			});
			refresh();
		}).catch(err => {
			os.alert({
				type: 'error',
				text: err,
			});
		});
	} else {
		misskeyApi('admin/ad/update', {
			...ad,
			expiresAt: new Date(ad.expiresAt).getTime(),
			startsAt: new Date(ad.startsAt).getTime(),
		}).then(() => {
			os.alert({
				type: 'success',
				text: i18n.ts.saved,
			});
		}).catch(err => {
			os.alert({
				type: 'error',
				text: err,
			});
		});
	}
}

async function more() {
	if (loading.value || loadingMore.value || !canFetchMore.value || untilId.value == null) return;
	const currentRequestId = requestId;
	const previousUntilId = untilId.value;
	loadingMore.value = true;
	const adsResponse = await misskeyApi('admin/ad/list', {
		publishing: publishing.value,
		limit: limit + 1,
		untilId: previousUntilId,
	}).catch(() => null);
	if (currentRequestId !== requestId) return;
	loadingMore.value = false;
	if (adsResponse == null) return;
	const page = adsResponse.slice(0, limit);
	const existingIds = new Set(ads.value.map(ad => ad.id));
	ads.value.push(...page.filter(ad => !existingIds.has(ad.id)).map(toEditableAd));
	const nextUntilId = page.at(-1)?.id;
	canFetchMore.value = adsResponse.length > limit && nextUntilId !== previousUntilId;
	untilId.value = nextUntilId ?? previousUntilId;
}

async function refresh() {
	const currentRequestId = ++requestId;
	loading.value = true;
	loadingMore.value = false;
	error.value = false;
	canFetchMore.value = false;
	untilId.value = undefined;
	const adsResponse = await misskeyApi('admin/ad/list', {
		publishing: publishing.value,
		limit: limit + 1,
	}).catch(() => null);
	if (currentRequestId !== requestId) return;
	loading.value = false;
	if (adsResponse == null) {
		error.value = true;
		return;
	}
	ads.value = adsResponse.slice(0, limit).map(toEditableAd);
	untilId.value = ads.value.at(-1)?.id;
	canFetchMore.value = adsResponse.length > limit;
}

const headerActions = computed(() => [{
	asFullButton: true,
	icon: 'ti ti-plus',
	text: i18n.ts.add,
	handler: add,
}]);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.ads,
	icon: 'ti ti-ad',
}));
</script>

<style lang="scss" module>
.sentinel {
	height: 1px;
}

.ad {
	padding: 32px;

	&:not(:last-child) {
		margin-bottom: var(--MI-margin);
	}
}
.input {
	margin-bottom: 32px;
}
</style>
