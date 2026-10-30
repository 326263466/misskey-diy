<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard :tabs="headerTabs">
	<div class="_pageBody">
		<SearchMarker path="/admin/branding" :label="i18n.ts.branding" :keywords="['branding']" icon="ti ti-paint">
			<div class="_gaps_m">
				<SearchMarker :keywords="['entrance', 'welcome', 'landing', 'front', 'home', 'page', 'style']">
					<MkRadios
						v-model="entrancePageStyle"
						:options="[
							{ value: 'classic', label: i18n.ts.classic },
							{ value: 'simple', label: i18n.ts._serverSettings.entrancePageStyleSimple },
						]"
					>
						<template #label><SearchLabel>{{ i18n.ts._serverSettings.entrancePageStyle }}</SearchLabel></template>
					</MkRadios>
				</SearchMarker>

				<SearchMarker :keywords="['timeline']">
					<MkSwitch v-model="showTimelineForVisitor">
						<template #label><SearchLabel>{{ i18n.ts._serverSettings.showTimelineForVisitor }}</SearchLabel></template>
					</MkSwitch>
				</SearchMarker>

				<SearchMarker :keywords="['activity', 'activities']">
					<MkSwitch v-model="showActivitiesForVisitor">
						<template #label><SearchLabel>{{ i18n.ts._serverSettings.showActivitiesForVisitor }}</SearchLabel></template>
					</MkSwitch>
				</SearchMarker>

				<SearchMarker :keywords="['logo', 'icon', 'image']">
					<MkInput v-model="iconUrl" type="url">
						<template #prefix><i class="ti ti-link"></i></template>
						<template #label><SearchLabel>{{ i18n.ts._brandingImages.icon }}</SearchLabel></template>
						<template #suffix><button type="button" class="_button _textButton" :class="$style.imageButton" :aria-label="`${i18n.ts._brandingImages.chooseImage}: ${i18n.ts._brandingImages.icon}`" aria-haspopup="menu" @click="chooseImage($event, 'iconUrl')"><i class="ti ti-upload" aria-hidden="true"></i>{{ i18n.ts._brandingImages.chooseImage }}</button></template>
						<template #caption>{{ i18n.ts._brandingImages.imageInputHint }} {{ i18n.ts._brandingImages.iconDescription }}</template>
					</MkInput>
				</SearchMarker>

				<SearchMarker :keywords="['icon', 'image']">
					<MkInput v-model="app192IconUrl" type="url">
						<template #prefix><i class="ti ti-link"></i></template>
						<template #label><SearchLabel>{{ i18n.ts._brandingImages.appIconSmall }}</SearchLabel></template>
						<template #suffix><button type="button" class="_button _textButton" :class="$style.imageButton" :aria-label="`${i18n.ts._brandingImages.chooseImage}: ${i18n.ts._brandingImages.appIconSmall}`" aria-haspopup="menu" @click="chooseImage($event, 'app192IconUrl')"><i class="ti ti-upload" aria-hidden="true"></i>{{ i18n.ts._brandingImages.chooseImage }}</button></template>
						<template #caption>
							<div>{{ i18n.ts._brandingImages.imageInputHint }}</div>
							<div>{{ i18n.tsx._serverSettings.appIconDescription({ host: instance.name ?? host }) }}</div>
							<div>({{ i18n.ts._serverSettings.appIconUsageExample }})</div>
							<div>{{ i18n.ts._serverSettings.appIconStyleRecommendation }}</div>
							<div><strong>{{ i18n.tsx._serverSettings.appIconResolutionMustBe({ resolution: '192 × 192 px' }) }}</strong></div>
						</template>
					</MkInput>
				</SearchMarker>

				<SearchMarker :keywords="['icon', 'image']">
					<MkInput v-model="app512IconUrl" type="url">
						<template #prefix><i class="ti ti-link"></i></template>
						<template #label><SearchLabel>{{ i18n.ts._brandingImages.appIconLarge }}</SearchLabel></template>
						<template #suffix><button type="button" class="_button _textButton" :class="$style.imageButton" :aria-label="`${i18n.ts._brandingImages.chooseImage}: ${i18n.ts._brandingImages.appIconLarge}`" aria-haspopup="menu" @click="chooseImage($event, 'app512IconUrl')"><i class="ti ti-upload" aria-hidden="true"></i>{{ i18n.ts._brandingImages.chooseImage }}</button></template>
						<template #caption>
							<div>{{ i18n.ts._brandingImages.imageInputHint }}</div>
							<div>{{ i18n.tsx._serverSettings.appIconDescription({ host: instance.name ?? host }) }}</div>
							<div>({{ i18n.ts._serverSettings.appIconUsageExample }})</div>
							<div>{{ i18n.ts._serverSettings.appIconStyleRecommendation }}</div>
							<div><strong>{{ i18n.tsx._serverSettings.appIconResolutionMustBe({ resolution: '512 × 512 px' }) }}</strong></div>
						</template>
					</MkInput>
				</SearchMarker>

				<SearchMarker :keywords="['banner', 'image']">
					<MkInput v-model="bannerUrl" type="url">
						<template #prefix><i class="ti ti-link"></i></template>
						<template #label><SearchLabel>{{ i18n.ts._brandingImages.banner }}</SearchLabel></template>
						<template #suffix><button type="button" class="_button _textButton" :class="$style.imageButton" :aria-label="`${i18n.ts._brandingImages.chooseImage}: ${i18n.ts._brandingImages.banner}`" aria-haspopup="menu" @click="chooseImage($event, 'bannerUrl')"><i class="ti ti-upload" aria-hidden="true"></i>{{ i18n.ts._brandingImages.chooseImage }}</button></template>
						<template #caption>{{ i18n.ts._brandingImages.imageInputHint }} {{ i18n.ts._brandingImages.bannerDescription }}</template>
					</MkInput>
				</SearchMarker>

				<SearchMarker :keywords="['background', 'image']">
					<MkInput v-model="backgroundImageUrl" type="url">
						<template #prefix><i class="ti ti-link"></i></template>
						<template #label><SearchLabel>{{ i18n.ts._brandingImages.background }}</SearchLabel></template>
						<template #suffix><button type="button" class="_button _textButton" :class="$style.imageButton" :aria-label="`${i18n.ts._brandingImages.chooseImage}: ${i18n.ts._brandingImages.background}`" aria-haspopup="menu" @click="chooseImage($event, 'backgroundImageUrl')"><i class="ti ti-upload" aria-hidden="true"></i>{{ i18n.ts._brandingImages.chooseImage }}</button></template>
						<template #caption>{{ i18n.ts._brandingImages.imageInputHint }} {{ i18n.ts._brandingImages.backgroundDescription }}</template>
					</MkInput>
				</SearchMarker>

				<SearchMarker :keywords="['image']">
					<MkInput v-model="notFoundImageUrl" type="url">
						<template #prefix><i class="ti ti-link"></i></template>
						<template #label><SearchLabel>{{ i18n.ts._brandingImages.notFound }}</SearchLabel></template>
						<template #suffix><button type="button" class="_button _textButton" :class="$style.imageButton" :aria-label="`${i18n.ts._brandingImages.chooseImage}: ${i18n.ts._brandingImages.notFound}`" aria-haspopup="menu" @click="chooseImage($event, 'notFoundImageUrl')"><i class="ti ti-upload" aria-hidden="true"></i>{{ i18n.ts._brandingImages.chooseImage }}</button></template>
						<template #caption>{{ i18n.ts._brandingImages.imageInputHint }} {{ i18n.ts._brandingImages.notFoundDescription }}</template>
					</MkInput>
				</SearchMarker>

				<SearchMarker :keywords="['image']">
					<MkInput v-model="infoImageUrl" type="url">
						<template #prefix><i class="ti ti-link"></i></template>
						<template #label><SearchLabel>{{ i18n.ts._brandingImages.empty }}</SearchLabel></template>
						<template #suffix><button type="button" class="_button _textButton" :class="$style.imageButton" :aria-label="`${i18n.ts._brandingImages.chooseImage}: ${i18n.ts._brandingImages.empty}`" aria-haspopup="menu" @click="chooseImage($event, 'infoImageUrl')"><i class="ti ti-upload" aria-hidden="true"></i>{{ i18n.ts._brandingImages.chooseImage }}</button></template>
						<template #caption>{{ i18n.ts._brandingImages.imageInputHint }} {{ i18n.ts._brandingImages.emptyDescription }}</template>
					</MkInput>
				</SearchMarker>

				<SearchMarker :keywords="['image']">
					<MkInput v-model="serverErrorImageUrl" type="url">
						<template #prefix><i class="ti ti-link"></i></template>
						<template #label><SearchLabel>{{ i18n.ts._brandingImages.error }}</SearchLabel></template>
						<template #suffix><button type="button" class="_button _textButton" :class="$style.imageButton" :aria-label="`${i18n.ts._brandingImages.chooseImage}: ${i18n.ts._brandingImages.error}`" aria-haspopup="menu" @click="chooseImage($event, 'serverErrorImageUrl')"><i class="ti ti-upload" aria-hidden="true"></i>{{ i18n.ts._brandingImages.chooseImage }}</button></template>
						<template #caption>{{ i18n.ts._brandingImages.imageInputHint }} {{ i18n.ts._brandingImages.errorDescription }}</template>
					</MkInput>
				</SearchMarker>

				<SearchMarker :keywords="['theme', 'color']">
					<MkColorInput v-model="themeColor">
						<template #label><SearchLabel>{{ i18n.ts.themeColor }}</SearchLabel></template>
					</MkColorInput>
				</SearchMarker>

				<SearchMarker :keywords="['theme', 'default', 'light']">
					<MkTextarea v-model="defaultLightTheme">
						<template #label><SearchLabel>{{ i18n.ts.instanceDefaultLightTheme }}</SearchLabel></template>
						<template #caption>{{ i18n.ts.instanceDefaultThemeDescription }}</template>
					</MkTextarea>
				</SearchMarker>

				<SearchMarker :keywords="['theme', 'default', 'dark']">
					<MkTextarea v-model="defaultDarkTheme">
						<template #label><SearchLabel>{{ i18n.ts.instanceDefaultDarkTheme }}</SearchLabel></template>
						<template #caption>{{ i18n.ts.instanceDefaultThemeDescription }}</template>
					</MkTextarea>
				</SearchMarker>

				<SearchMarker>
					<MkInput v-model="repositoryUrl" type="url">
						<template #prefix><i class="ti ti-link"></i></template>
						<template #label><SearchLabel>{{ i18n.ts.repositoryUrl }}</SearchLabel></template>
						<template #caption>{{ i18n.ts._brandingImages.repositoryDescription }}</template>
					</MkInput>
				</SearchMarker>

				<SearchMarker>
					<MkInput v-model="feedbackUrl" type="url">
						<template #prefix><i class="ti ti-link"></i></template>
						<template #label><SearchLabel>{{ i18n.ts.feedbackUrl }}</SearchLabel></template>
					</MkInput>
				</SearchMarker>

				<SearchMarker>
					<MkTextarea v-model="manifestJsonOverride">
						<template #label><SearchLabel>{{ i18n.ts._serverSettings.manifestJsonOverride }}</SearchLabel></template>
					</MkTextarea>
				</SearchMarker>
			</div>
		</SearchMarker>
	</div>
	<template #footer>
		<div :class="$style.footer">
			<div class="_pageFooter _formActions">
				<MkButton primary rounded :wait="saving" :aria-busy="saving" @click="save">
					<i class="ti ti-check" aria-hidden="true"></i>
					<span aria-live="polite">{{ saving ? i18n.ts._brandingImages.saving : saved ? i18n.ts.saved : i18n.ts.save }}</span>
				</MkButton>
			</div>
		</div>
	</template>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import type { Ref } from 'vue';
import JSON5 from 'json5';
import * as Misskey from 'misskey-js';
import { host } from '@@/js/config.js';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { selectFile } from '@/utility/drive.js';
import { instance, fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkButton from '@/components/MkButton.vue';
import MkColorInput from '@/components/MkColorInput.vue';
import MkRadios from '@/components/MkRadios.vue';
import MkSwitch from '@/components/MkSwitch.vue';

const meta = await misskeyApi('admin/meta');

// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
const entrancePageStyle = ref<Misskey.entities.MetaClientOptions['entrancePageStyle']>(meta.clientOptions.entrancePageStyle ?? 'classic');
// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
const showTimelineForVisitor = ref<Misskey.entities.MetaClientOptions['showTimelineForVisitor']>(meta.clientOptions.showTimelineForVisitor ?? true);
// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
const showActivitiesForVisitor = ref<Misskey.entities.MetaClientOptions['showActivitiesForVisitor']>(meta.clientOptions.showActivitiesForVisitor ?? true);

const iconUrl = ref(meta.iconUrl);
const app192IconUrl = ref(meta.app192IconUrl);
const app512IconUrl = ref(meta.app512IconUrl);
const bannerUrl = ref(meta.bannerUrl);
const backgroundImageUrl = ref(meta.backgroundImageUrl);
const themeColor = ref(meta.themeColor);
const defaultLightTheme = ref(meta.defaultLightTheme);
const defaultDarkTheme = ref(meta.defaultDarkTheme);
const serverErrorImageUrl = ref(meta.serverErrorImageUrl);
const infoImageUrl = ref(meta.infoImageUrl);
const notFoundImageUrl = ref(meta.notFoundImageUrl);
const imageFields = { iconUrl, app192IconUrl, app512IconUrl, bannerUrl, backgroundImageUrl, notFoundImageUrl, infoImageUrl, serverErrorImageUrl };
const imageSelections = new Map<Ref<string | null>, symbol>();

for (const field of Object.values(imageFields)) {
	watch(field, () => imageSelections.delete(field), { flush: 'sync' });
}
// Treat the inherited upstream links as empty defaults; keep custom addresses.
const repositoryUrl = ref(meta.repositoryUrl === 'https://github.com/misskey-dev/misskey' ? null : meta.repositoryUrl);
const feedbackUrl = ref(meta.feedbackUrl === 'https://github.com/misskey-dev/misskey/issues/new' ? null : meta.feedbackUrl);
const manifestJsonOverride = ref(meta.manifestJsonOverride === '' ? '{}' : JSON.stringify(JSON.parse(meta.manifestJsonOverride), null, '\t'));

const saving = ref(false);
const saved = ref(false);
let savedTimer: number | undefined;
let formRevision = 0;
let disposed = false;

watch([
	entrancePageStyle, showTimelineForVisitor, showActivitiesForVisitor,
	iconUrl, app192IconUrl, app512IconUrl, bannerUrl, backgroundImageUrl, themeColor,
	defaultLightTheme, defaultDarkTheme, serverErrorImageUrl, infoImageUrl, notFoundImageUrl,
	repositoryUrl, feedbackUrl, manifestJsonOverride,
], () => {
	formRevision++;
	saved.value = false;
	window.clearTimeout(savedTimer);
}, { flush: 'sync' });

onBeforeUnmount(() => {
	disposed = true;
	window.clearTimeout(savedTimer);
});

async function chooseImage(event: PointerEvent, name: keyof typeof imageFields) {
	const field = imageFields[name];
	const selection = Symbol();
	imageSelections.set(field, selection);
	try {
		const selected: Promise<Misskey.entities.DriveFile | undefined> = selectFile({ anchorElement: event.currentTarget ?? event.target, multiple: false });
		const file = await selected;
		// 手填链接或重新选图后，旧选择结果不再写回。
		if (disposed || imageSelections.get(field) !== selection || file == null) return;
		if (!file.type.startsWith('image/')) {
			await os.alert({ type: 'error', text: i18n.ts._brandingImages.imageOnly });
			return;
		}
		field.value = file.url;
	} catch {
		// 选择和上传失败由公共流程提示，保留原值，不阻止再次选择。
	}
}

async function save() {
	if (saving.value) return;
	saved.value = false;
	window.clearTimeout(savedTimer);
	let manifest: string;
	try {
		manifest = manifestJsonOverride.value === '' ? '{}' : JSON.stringify(JSON5.parse(manifestJsonOverride.value));
	} catch {
		await os.alert({ type: 'error', title: i18n.ts.invalidParamError, text: i18n.ts._brandingImages.invalidManifest });
		return;
	}

	const revision = formRevision;
	saving.value = true;
	try {
		await os.apiWithDialog('admin/update-meta', {
			clientOptions: {
				entrancePageStyle: entrancePageStyle.value,
				showTimelineForVisitor: showTimelineForVisitor.value,
				showActivitiesForVisitor: showActivitiesForVisitor.value,
			},
			iconUrl: iconUrl.value === '' ? null : iconUrl.value,
			app192IconUrl: app192IconUrl.value === '' ? null : app192IconUrl.value,
			app512IconUrl: app512IconUrl.value === '' ? null : app512IconUrl.value,
			bannerUrl: bannerUrl.value === '' ? null : bannerUrl.value,
			backgroundImageUrl: backgroundImageUrl.value === '' ? null : backgroundImageUrl.value,
			themeColor: themeColor.value === '' ? null : themeColor.value,
			defaultLightTheme: defaultLightTheme.value === '' ? null : defaultLightTheme.value,
			defaultDarkTheme: defaultDarkTheme.value === '' ? null : defaultDarkTheme.value,
			infoImageUrl: infoImageUrl.value === '' ? null : infoImageUrl.value,
			notFoundImageUrl: notFoundImageUrl.value === '' ? null : notFoundImageUrl.value,
			serverErrorImageUrl: serverErrorImageUrl.value === '' ? null : serverErrorImageUrl.value,
			repositoryUrl: repositoryUrl.value === '' ? null : repositoryUrl.value,
			feedbackUrl: feedbackUrl.value === '' ? null : feedbackUrl.value,
			manifestJsonOverride: manifest,
		});
		if (!disposed && revision === formRevision) {
			saved.value = true;
			savedTimer = window.setTimeout(() => { saved.value = false; }, 3000);
		}
		void fetchInstance(true).catch(err => console.error('Failed to refresh instance metadata after saving branding', err));
	} catch {
		// apiWithDialog already displays the save error. Keep the form available for retry.
	} finally {
		saving.value = false;
	}
}

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.branding,
	icon: 'ti ti-paint',
}));
</script>

<style lang="scss" module>
.imageButton {
	display: inline-flex;
	align-items: center;
	gap: 4px;

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: 2px;
	}
}

.footer {
	-webkit-backdrop-filter: var(--MI-blur, blur(15px));
	backdrop-filter: var(--MI-blur, blur(15px));
}
</style>
