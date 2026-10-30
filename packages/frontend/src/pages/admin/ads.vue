<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard :actions="headerActions" :tabs="headerTabs">
	<div ref="pageContainer" class="_pageBody">
		<div class="_adminPanel">
			<div class="_adminToolbar">
				<MkSelect v-model="filterType" :items="filterTypeDef" class="_adminToolbarField">
					<template #label>{{ i18n.ts.state }}</template>
				</MkSelect>
				<div class="_adminToolbarActions">
					<MkButton small primary @click="add"><i class="ti ti-plus" aria-hidden="true"></i> {{ i18n.ts.add }}</MkButton>
				</div>
			</div>
			<MkPaginationBar v-slot="{ items }" v-model:page="currentPage" :items="ads" :hasMore="canFetchMore" :loadMore="more" :disabled="loading || error || !pageActive || !componentActive">
				<MkLoading v-if="loading"/>
				<MkError v-else-if="error" @retry="refresh"/>
				<div v-else class="_adminTableContainer">
					<table class="_adminTable">
						<thead>
							<tr>
								<th scope="col">{{ i18n.ts.ads }}</th>
								<th scope="col">{{ i18n.ts._ad.shape }}</th>
								<th scope="col" class="_adminTableNumber">{{ i18n.ts.ratio }}</th>
								<th scope="col" class="_adminTableDate">{{ i18n.ts.startingperiod }}</th>
								<th scope="col" class="_adminTableDate">{{ i18n.ts.expiration }}</th>
								<th scope="col">{{ i18n.ts._ad.schedule }}</th>
								<th scope="col" class="_adminTableActions">{{ i18n.ts.operations }}</th>
							</tr>
						</thead>
						<tbody>
							<tr v-if="ads.length === 0"><td colspan="7" class="_adminTableEmpty">{{ i18n.ts.nothing }}</td></tr>
							<tr v-for="ad in items" :key="getAdKey(ad)">
								<td class="_adminTableMain" :class="$style.adCell">
									<div class="_adminTableIdentity">
										<img v-if="ad.imageUrl" :src="ad.imageUrl" alt="" loading="lazy" decoding="async" draggable="false" :class="$style.thumbnail"/>
										<span v-else :class="[$style.thumbnail, $style.thumbnailEmpty]"><i class="ti ti-ad" aria-hidden="true"></i></span>
										<div>
											<div class="_selectable" :class="$style.destination">{{ ad.url || i18n.ts.draft }}</div>
											<div v-if="ad.memo" class="_adminTableSecondary" :class="$style.memo" :title="ad.memo">{{ ad.memo }}</div>
										</div>
									</div>
								</td>
								<td :class="$style.shape">
									{{ ad.place === 'square' ? i18n.ts._ad.placeSquare : ad.place === 'horizontal' ? i18n.ts._ad.placeHorizontal : i18n.ts._ad.placeHorizontalBig }}
									<span v-if="ad.isSensitive" class="_adminTableStatus" style="--admin-statusColor: var(--MI_THEME-warn);">{{ i18n.ts.sensitive }}</span>
								</td>
								<td class="_adminTableNumber">{{ ad.ratio }}</td>
								<td class="_adminTableDate"><MkTime :key="ad.startsAt" :time="ad.startsAt" mode="absolute"/></td>
								<td class="_adminTableDate"><MkTime :key="ad.expiresAt" :time="ad.expiresAt" mode="absolute"/></td>
								<td>{{ daysOfWeek.filter((_, index) => (ad.dayOfWeek & (1 << index)) !== 0).join(', ') || i18n.ts.none }}</td>
								<td class="_adminTableActions">
									<button type="button" class="_button _textButton" @click="openEditor(ad, $event)">
										<i class="ti ti-pencil" aria-hidden="true"></i> {{ i18n.ts.edit }}
									</button>
								</td>
							</tr>
						</tbody>
					</table>
				</div>
			</MkPaginationBar>
		</div>
	</div>
</PageWithHeader>
<Teleport to="#misskey-popups" defer>
	<MkModalWindow
		v-if="editingAd"
		ref="editorWindow"
		:width="680"
		:height="700"
		autoHeight
		:closeOnBackdrop="false"
		headerIcon="ti ti-ad"
		role="dialog"
		tabindex="-1"
		aria-modal="true"
		:aria-label="i18n.ts.edit"
		@closed="onEditorClosed"
	>
		<template #header>{{ i18n.ts.edit }} · {{ i18n.ts.ads }}</template>
		<div :class="$style.editor">
			<div class="_gaps_m">
				<MkAd v-if="editingAd.url" :key="editingAd.id" :specify="editingAd" plain/>

				<MkInput v-model="editingAd.url" type="url">
					<template #label>URL</template>
				</MkInput>

				<MkInput v-model="editingAd.imageUrl" type="url">
					<template #label>{{ i18n.ts.imageUrl }}</template>
				</MkInput>

				<MkRadios
					v-model="editingAd.place"
					:options="[
						{ value: 'square', label: i18n.ts._ad.placeSquare },
						{ value: 'horizontal', label: i18n.ts._ad.placeHorizontal },
						{ value: 'horizontal-big', label: i18n.ts._ad.placeHorizontalBig },
					]"
				>
					<template #label>{{ i18n.ts._ad.shape }}</template>
				</MkRadios>

				<FormSplit>
					<MkInput v-model="editingAd.ratio" type="number">
						<template #label>{{ i18n.ts.ratio }}</template>
					</MkInput>
					<MkInput v-model="editingAd.startsAt" type="datetime-local">
						<template #label>{{ i18n.ts.startingperiod }}</template>
					</MkInput>
					<MkInput v-model="editingAd.expiresAt" type="datetime-local">
						<template #label>{{ i18n.ts.expiration }}</template>
					</MkInput>
				</FormSplit>

				<MkSwitch v-model="editingAd.isSensitive">
					<template #label>{{ i18n.ts.sensitive }}</template>
				</MkSwitch>

				<MkFolder>
					<template #label>{{ i18n.ts._ad.schedule }}</template>
					<div class="_gaps_s">
						<div>{{ i18n.ts._ad.timezoneinfo }}</div>
						<div v-for="(day, index) in daysOfWeek" :key="index">
							<input
								:id="`ad${getAdKey(editingAd)}-${index}`" type="checkbox" :checked="(editingAd.dayOfWeek & (1 << index)) !== 0"
								@change="toggleDayOfWeek(editingAd, index)"
							>
							<label :for="`ad${getAdKey(editingAd)}-${index}`">{{ day }}</label>
						</div>
					</div>
				</MkFolder>

				<MkTextarea v-model="editingAd.memo">
					<template #label>{{ i18n.ts.memo }}</template>
				</MkTextarea>

				<div class="_buttons">
					<MkButton inline primary @click="save(editingAd)">
						<i class="ti ti-device-floppy"></i> {{ i18n.ts.save }}
					</MkButton>
					<MkButton inline danger @click="remove(editingAd)">
						<i class="ti ti-trash"></i> {{ i18n.ts.delete }}
					</MkButton>
				</div>
			</div>
		</div>
	</MkModalWindow>
</Teleport>
</template>

<script lang="ts" setup>
import { ref, computed, watch, onBeforeUnmount, onActivated, onDeactivated, inject, nextTick, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkPaginationBar from '@/components/MkPaginationBar.vue';
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
import { genId } from '@/utility/id.js';
import { DI } from '@/di.js';

type Ad = Misskey.entities.Ad & {
	place: 'square' | 'horizontal' | 'horizontal-big';
};

const ads = ref<Ad[]>([]);
const pageActive = inject(DI.pageActive, ref(true));
const componentActive = ref(true);

const editingAd = ref<Ad | null>(null);
const editorWindow = useTemplateRef('editorWindow');
const pageContainer = useTemplateRef('pageContainer');
let editorFocusTarget: HTMLElement | null = null;

function openEditor(ad: Ad, event?: PointerEvent) {
	if (!pageActive.value || !componentActive.value) return;
	editorFocusTarget = event?.currentTarget instanceof HTMLElement ? event.currentTarget : window.document.activeElement instanceof HTMLElement ? window.document.activeElement : null;
	editingAd.value = ad;
}

function onEditorClosed() {
	editingAd.value = null;
	const target = editorFocusTarget;
	editorFocusTarget = null;
	if (!target || !pageActive.value || !componentActive.value) return;
	nextTick(() => {
		if (!pageActive.value || !componentActive.value) return;
		const nextTarget = target?.isConnected ? target : pageContainer.value?.querySelector<HTMLButtonElement>('button');
		nextTarget?.focus({ preventScroll: true });
	});
}

function dismissEditor() {
	editorFocusTarget = null;
	editingAd.value = null;
}

watch(pageActive, value => {
	if (!value) dismissEditor();
}, { flush: 'sync' });
onActivated(() => { componentActive.value = true; });
onDeactivated(() => {
	componentActive.value = false;
	dismissEditor();
});

watch(ads, items => {
	if (editingAd.value != null && !items.includes(editingAd.value)) editorWindow.value?.close();
});

const adKeys = new WeakMap<Ad, string>();

function getAdKey(ad: Ad): string {
	let key = adKeys.get(ad);
	if (key == null) {
		key = genId();
		adKeys.set(ad, key);
	}
	return key;
}

const loading = ref(true);
const loadingMore = ref(false);
const error = ref(false);
const canFetchMore = ref(false);
const untilId = ref<string>();
const limit = 10;
let requestId = 0;
const currentPage = ref(1);

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
		{ label: i18n.ts._ad.publishing, value: 'publishing' },
		{ label: i18n.ts._ad.notPublishing, value: 'expired' },
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
	currentPage.value = 1;
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
	openEditor(ads.value[0]);
}

function remove(ad: Misskey.entities.Ad) {
	os.confirm({
		type: 'warning',
		text: i18n.tsx.deleteAreYouSure({ x: ad.url }),
	}).then(({ canceled }) => {
		if (canceled) return;
		ads.value = ads.value.filter(x => x !== ad);
		if (ad.id === '') return;
		// 失败提示由 apiWithDialog 处理
		os.apiWithDialog('admin/ad/delete', {
			id: ad.id,
		}).then(() => {
			os.toast(i18n.ts.deleteSucceeded, 'success');
			refresh();
		}, () => {});
	});
}

// 失败提示由 apiWithDialog 处理
function save(ad: Misskey.entities.Ad) {
	if (ad.id === '') {
		os.apiWithDialog('admin/ad/create', {
			...ad,
			expiresAt: new Date(ad.expiresAt).getTime(),
			startsAt: new Date(ad.startsAt).getTime(),
		}).then(() => {
			os.toast(i18n.ts.saved, 'success');
			refresh();
		}, () => {});
	} else {
		os.apiWithDialog('admin/ad/update', {
			...ad,
			expiresAt: new Date(ad.expiresAt).getTime(),
			startsAt: new Date(ad.startsAt).getTime(),
		}).then(() => {
			os.toast(i18n.ts.saved, 'success');
		}, () => {});
	}
}

// 由分页组件补载；返回 false 时停止，再次翻页即重试。
async function more(): Promise<boolean> {
	if (loading.value || loadingMore.value || !canFetchMore.value || untilId.value == null || !pageActive.value || !componentActive.value) return false;
	const currentRequestId = requestId;
	const previousUntilId = untilId.value;
	loadingMore.value = true;
	const adsResponse = await misskeyApi('admin/ad/list', {
		publishing: publishing.value,
		limit: limit + 1,
		untilId: previousUntilId,
	}).catch(() => null);
	if (currentRequestId !== requestId) return false;
	loadingMore.value = false;
	if (adsResponse == null) {
		os.toast(i18n.ts.somethingHappened, 'error');
		return false;
	}
	const page = adsResponse.slice(0, limit);
	const existingIds = new Set(ads.value.map(ad => ad.id));
	ads.value.push(...page.filter(ad => !existingIds.has(ad.id)).map(toEditableAd));
	const nextUntilId = page.at(-1)?.id;
	canFetchMore.value = adsResponse.length > limit && nextUntilId !== previousUntilId;
	untilId.value = nextUntilId ?? previousUntilId;
	return true;
}

async function refresh() {
	const currentRequestId = ++requestId;
	currentPage.value = 1;
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

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.ads,
	icon: 'ti ti-ad',
}));
</script>

<style lang="scss" module>
.editor {
	padding: 20px;
}

.thumbnail {
	display: block;
	flex: 0 0 auto;
	width: 96px;
	height: 48px;
	border-radius: calc(var(--MI-radius) / 2);
	background: var(--MI_THEME-bg);
	object-fit: contain;
}

.thumbnailEmpty {
	display: grid;
	place-items: center;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 1.4em;
}

.adCell {
	min-width: 280px;
	max-width: 420px;
}

.destination {
	overflow-wrap: anywhere;
}

.memo {
	display: -webkit-box;
	overflow: hidden;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
}

.shape {
	white-space: nowrap;

	> span {
		margin-inline-start: 6px;
	}
}
</style>
