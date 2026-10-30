<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker path="/settings/profile" :label="i18n.ts.profile" :keywords="['profile']" icon="ti ti-user">
	<div class="_gaps_m" :class="$style.profile">
		<div class="_panel" :class="$style.profileHeader">
			<div class="_imageContainer" :class="$style.banner">
				<img v-if="$i.bannerUrl" class="_imageBackground" :src="$i.bannerUrl" alt=""/>
				<div :class="$style.bannerEdit">
					<SearchMarker :keywords="['banner', 'change']">
						<MkButton primary rounded @click="changeBanner"><SearchLabel>{{ i18n.ts._profile.changeBanner }}</SearchLabel></MkButton>
					</SearchMarker>
				</div>
			</div>
			<div :class="$style.avatarContainer">
				<MkAvatar :class="$style.avatar" :user="$i" forceShowDecoration @click="changeAvatar"/>
				<div class="_buttonsCenter">
					<SearchMarker :keywords="['avatar', 'icon', 'change']">
						<MkButton primary rounded @click="changeAvatar"><SearchLabel>{{ i18n.ts._profile.changeAvatar }}</SearchLabel></MkButton>
					</SearchMarker>
					<MkButton primary rounded type="routerLink" to="/settings/avatar-decoration">{{ i18n.ts.decorate }} <i class="ti ti-sparkles"></i></MkButton>
				</div>
			</div>
		</div>

		<SearchMarker :keywords="['name']">
			<MkInput v-model="profile.name" :counterMaxLength="50" :placeholder="$i.username" manualSave :mfmAutocomplete="['emoji']">
				<template #label><SearchLabel>{{ i18n.ts._profile.name }}</SearchLabel></template>
				<template #caption>{{ i18n.ts._profile.nameDescription }}</template>
			</MkInput>
		</SearchMarker>

		<SearchMarker :keywords="['description', 'bio']">
			<MkTextarea v-model="profile.description" :counterMaxLength="Misskey.CONTENT_LIMITS.profileDescription" manualSave mfmAutocomplete :rows="2">
				<template #label><SearchLabel>{{ i18n.ts._profile.description }}</SearchLabel></template>
				<template #caption>{{ i18n.ts._profile.youCanIncludeHashtags }}</template>
			</MkTextarea>
		</SearchMarker>

		<div :class="$style.fieldPair">
			<SearchMarker :keywords="['location', 'locale']">
				<MkInput v-model="profile.location" :counterMaxLength="50" manualSave>
					<template #label><SearchLabel>{{ i18n.ts.location }}</SearchLabel></template>
					<template #prefix><i class="ti ti-map-pin"></i></template>
				</MkInput>
			</SearchMarker>
			<SearchMarker :keywords="['birthday', 'birthdate', 'age']">
				<MkInput v-model="profile.birthday" type="date" :max="birthdayMax" manualSave>
					<template #label><SearchLabel>{{ i18n.ts.birthday }}</SearchLabel></template>
					<template #prefix><i class="ti ti-cake"></i></template>
				</MkInput>
			</SearchMarker>
		</div>

		<div :class="$style.fieldPair">
			<SearchMarker :keywords="['company', 'work', 'organization']">
				<MkInput v-model="profile.company" :placeholder="i18n.ts._profile.companyPlaceholder" :counterMaxLength="128" autocomplete="organization" manualSave>
					<template #label><SearchLabel>{{ i18n.ts._profile.company }}</SearchLabel></template>
					<template #prefix><i class="ti ti-building" aria-hidden="true"></i></template>
				</MkInput>
			</SearchMarker>
			<SearchMarker :keywords="['job', 'title', 'work']">
				<MkInput v-model="profile.jobTitle" :placeholder="i18n.ts._profile.jobTitlePlaceholder" :counterMaxLength="128" autocomplete="organization-title" manualSave>
					<template #label><SearchLabel>{{ i18n.ts._profile.jobTitle }}</SearchLabel></template>
					<template #prefix><i class="ti ti-briefcase" aria-hidden="true"></i></template>
				</MkInput>
			</SearchMarker>
		</div>

		<SearchMarker :keywords="['language', 'locale']">
			<MkSelect v-model="profile.lang" :items="[{ label: i18n.ts.auto, value: null }, ...Object.entries(langmap).map(([code, def]) => ({ label: def.nativeName, value: code }))]">
				<template #label><SearchLabel>{{ i18n.ts.language }}</SearchLabel></template>
			</MkSelect>
		</SearchMarker>

		<SearchMarker :keywords="['website', 'homepage', 'verified']">
			<div class="_gaps_s">
				<MkInput v-model="website" type="url" :maxLength="Misskey.CONTENT_LIMITS.profileFieldValue" :disabled="websiteSaving" placeholder="https://example.com" autocomplete="url">
					<template #label><SearchLabel>{{ i18n.ts._profile.website }}</SearchLabel></template>
					<template #prefix><i class="ti ti-world" aria-hidden="true"></i></template>
					<template #caption>{{ i18n.ts._profile.websiteDescription }}</template>
				</MkInput>
				<div v-if="websiteError" :class="$style.fieldError" role="status">
					<template v-if="websiteError === 'url'">{{ i18n.ts._profile.websiteInvalid }}</template>
					<template v-else-if="websiteError === 'length'">{{ i18n.tsx.inputTooLong({ limit: Misskey.CONTENT_LIMITS.profileFieldValue }) }}</template>
					<template v-else>{{ i18n.tsx._profile.websiteFieldLimit({ max: fieldLimit }) }}</template>
				</div>
				<MkButton v-if="websiteChanged" primary :disabled="!canSaveWebsite" :wait="websiteSaving" @click="saveWebsite">
					<i class="ti ti-check" aria-hidden="true"></i> {{ i18n.ts._profile.saveWebsite }}
				</MkButton>
				<button type="button" class="_textButton" :class="$style.verificationHelp" aria-haspopup="dialog" @click="showWebsiteVerification">{{ i18n.ts._profile.websiteVerification }}</button>
			</div>
		</SearchMarker>

		<SearchMarker :keywords="['metadata']">
			<FormSlot>
				<MkFolder :withSpacer="false">
					<template #icon><i class="ti ti-list"></i></template>
					<template #label><SearchLabel>{{ i18n.ts._profile.metadataEdit }}</SearchLabel></template>

					<div :class="$style.metadataRoot">
						<div :class="$style.metadataList">
							<div v-for="(item, index) in fields" :key="item.id" :class="$style.fieldRow">
								<div :class="$style.fieldForm">
									<MkInput v-model="item.name" :class="$style.metadataInput" :disabled="fieldsSaving" :maxLength="Misskey.CONTENT_LIMITS.profileFieldName" :mfmAutocomplete="['emoji']" :placeholder="i18n.ts._profile.metadataLabel">
										<template #label><span :class="$style.srOnly">{{ i18n.ts._profile.metadataLabel }}</span></template>
									</MkInput>
									<MkInput v-model="item.value" :class="$style.metadataInput" :disabled="fieldsSaving" :maxLength="Misskey.CONTENT_LIMITS.profileFieldValue" mfmAutocomplete :placeholder="i18n.ts._profile.metadataContent">
										<template #label><span :class="$style.srOnly">{{ i18n.ts._profile.metadataContent }}</span></template>
									</MkInput>
								</div>
								<div :class="$style.fieldActions">
									<button type="button" :disabled="fieldsSaving || index === 0" class="_button" :class="$style.fieldAction" :aria-label="i18n.ts._profile.moveFieldUp" :title="i18n.ts._profile.moveFieldUp" @click="moveField(item.id, -1)"><i class="ti ti-arrow-up" aria-hidden="true"></i></button>
									<button type="button" :disabled="fieldsSaving || index === fields.length - 1" class="_button" :class="$style.fieldAction" :aria-label="i18n.ts._profile.moveFieldDown" :title="i18n.ts._profile.moveFieldDown" @click="moveField(item.id, 1)"><i class="ti ti-arrow-down" aria-hidden="true"></i></button>
									<button type="button" :disabled="fieldsSaving" class="_button" :class="[$style.fieldAction, $style.fieldRemove]" :aria-label="i18n.ts._profile.removeField" :title="i18n.ts._profile.removeField" @click="deleteField(item.id)"><i class="ti ti-x" aria-hidden="true"></i></button>
								</div>
							</div>
						</div>
						<div :class="$style.metadataActions">
							<MkButton :disabled="!canAddField" @click="addField"><i class="ti ti-plus" aria-hidden="true"></i> {{ i18n.ts.add }}</MkButton>
							<MkButton primary :disabled="!validFields || fieldsSaving" :wait="fieldsSaving" @click="saveFields"><i class="ti ti-check" aria-hidden="true"></i> {{ i18n.ts.save }}</MkButton>
						</div>
					</div>
				</MkFolder>
				<template #caption>{{ i18n.ts._profile.metadataDescription }}</template>
			</FormSlot>
		</SearchMarker>

		<SearchMarker :keywords="['follow', 'message']">
			<MkInput v-model="profile.followedMessage" :counterMaxLength="256" manualSave :mfmAutocomplete="['emoji']">
				<template #label><SearchLabel>{{ i18n.ts._profile.followedMessage }}</SearchLabel></template>
				<template #caption><SearchText>{{ i18n.ts._profile.followedMessageDescription }}</SearchText></template>
			</MkInput>
		</SearchMarker>

		<SearchMarker :keywords="['reaction']">
			<MkSelect
				v-model="reactionAcceptance"
				:items="[
					{ label: i18n.ts.all, value: null },
					{ label: i18n.ts.likeOnlyForRemote, value: 'likeOnlyForRemote' },
					{ label: i18n.ts.nonSensitiveOnly, value: 'nonSensitiveOnly' },
					{ label: i18n.ts.nonSensitiveOnlyForLocalLikeOnlyForRemote, value: 'nonSensitiveOnlyForLocalLikeOnlyForRemote' },
					{ label: i18n.ts.likeOnly, value: 'likeOnly' },
				]"
			>
				<template #label><SearchLabel>{{ i18n.ts.reactionAcceptance }}</SearchLabel></template>
			</MkSelect>
		</SearchMarker>

		<SearchMarker>
			<MkFolder>
				<template #label><SearchLabel>{{ i18n.ts.advancedSettings }}</SearchLabel></template>

				<div class="_gaps_m">
					<SearchMarker :keywords="['cat']">
						<MkSwitch v-model="profile.isCat">
							<template #label><SearchLabel>{{ i18n.ts.flagAsCat }}</SearchLabel></template>
							<template #caption>{{ i18n.ts.flagAsCatDescription }}</template>
						</MkSwitch>
					</SearchMarker>

					<SearchMarker :keywords="['bot']">
						<MkSwitch v-model="profile.isBot">
							<template #label><SearchLabel>{{ i18n.ts.flagAsBot }}</SearchLabel></template>
							<template #caption>{{ i18n.ts.flagAsBotDescription }}</template>
						</MkSwitch>
					</SearchMarker>
				</div>
			</MkFolder>
		</SearchMarker>

		<hr>

		<SearchMarker :keywords="['qrcode']">
			<FormLink data-testid="profile-qr" @click="showQr">
				<template #icon><i class="ti ti-qrcode"></i></template>
				<SearchLabel>{{ i18n.ts.qr }}</SearchLabel>
			</FormLink>
		</SearchMarker>
	</div>
</SearchMarker>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, reactive, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { useLowresTime } from '@@/js/use-lowres-time.js';
import { userPage } from '@@/js/user.js';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkFolder from '@/components/MkFolder.vue';
import FormSlot from '@/components/form/slot.vue';
import FormLink from '@/components/form/link.vue';
import { chooseDriveFile } from '@/utility/drive.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { ensureSignin } from '@/i.js';
import { updateCurrentAccount } from '@/accounts.js';
import { langmap } from '@/utility/langmap.js';
import { definePage } from '@/page.js';
import { claimAchievement } from '@/utility/achievements.js';
import { store } from '@/store.js';
import MkTextarea from '@/components/MkTextarea.vue';
import { enqueueProfileSave } from '@/utility/profile-save.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { isAccountSessionErrorHandled } from '@/utility/account-session-error.js';
import { formatTimeString } from '@/utility/format-time-string.js';
import { useProfileFields } from '@/pages/settings/profile.fields.js';

const $i = ensureSignin();
const currentTime = useLowresTime();
const birthdayMax = computed(() => formatTimeString(new Date(currentTime.value), 'yyyy-MM-dd'));

function showQr(): void {
	const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkUserQrDialog.vue')), { user: $i }, {
		closed: () => dispose(),
	});
}

function showWebsiteVerification(): void {
	const { dispose } = os.popup(defineAsyncComponent(() => import('@/pages/settings/profile.website-verification.vue')), {
		profileUrl: userPage($i, undefined, true),
	}, {
		closed: () => dispose(),
	});
}

const reactionAcceptance = store.model('reactionAcceptance');

function assertVaildLang(lang: string | null): lang is keyof typeof langmap {
	return lang != null && lang in langmap;
}

const profile = reactive({
	name: $i.name,
	description: $i.description,
	followedMessage: $i.followedMessage,
	location: $i.location,
	birthday: $i.birthday,
	company: $i.company ?? null,
	jobTitle: $i.jobTitle ?? null,
	lang: assertVaildLang($i.lang) ? $i.lang : null,
	isBot: $i.isBot ?? false,
	isCat: $i.isCat ?? false,
});

async function updateProfile(patch: Misskey.entities.IUpdateRequest, showFeedback = true) {
	try {
		const user = await misskeyApi('i/update', patch);
		if (showFeedback) os.toast(i18n.ts.saved, 'success');
		return user;
	} catch (error) {
		if (showFeedback && !isAccountSessionErrorHandled(error)) {
			const messages: Record<string, string> = {
				'0b3f9f6a-2f4d-4b1f-9fb4-49d3a2fd7191': i18n.ts.yourNameContainsProhibitedWordsDescription,
				'75aedb19-2afd-4e6d-87fc-67941256fa60': i18n.ts._profile.bannerImageOnly,
			};
			os.toast(messages[(error as { id?: string }).id ?? ''] ?? i18n.ts.somethingHappened, 'error');
		}
		throw error;
	}
}

// Watch scalar fields separately: an untouched form snapshot must never be sent.
const profileTextLimits: Partial<Record<keyof typeof profile, number>> = {
	name: 50,
	description: Misskey.CONTENT_LIMITS.profileDescription,
	followedMessage: 256,
	location: 50,
	company: 128,
	jobTitle: 128,
};
for (const field of Object.keys(profile) as (keyof typeof profile)[]) {
	watch(() => profile[field], value => {
		const limit = profileTextLimits[field];
		if (typeof value === 'string' && limit != null && Array.from(value).length > limit) {
			os.toast(i18n.tsx.inputTooLong({ limit }), 'error');
			return;
		}
		// Empty optional strings are cleared with null.
		const normalizedValue = value === '' || value == null ? null : value;
		save({ [field]: normalizedValue });
	});
}

const {
	website, websiteChanged, websiteError, websiteSaving, canSaveWebsite,
	fields, validFields, fieldsSaving, canAddField, fieldLimit,
	addField, deleteField, moveField, saveWebsite, saveFields,
} = useProfileFields({
	websiteLabel: i18n.ts._profile.website,
	getFields: () => $i.fields,
	save: async update => {
		const user = await updateProfile({ fields: update });
		updateCurrentAccount({ fields: user.fields, verifiedLinks: user.verifiedLinks });
	},
});
while (fields.value.length < 2) {
	addField();
}

function save(patch: Misskey.entities.IUpdateRequest) {
	enqueueProfileSave(async () => {
		const user = await updateProfile(patch, !('isBot' in patch || 'isCat' in patch));
		updateCurrentAccount(Object.fromEntries(Object.keys(patch).map(field => [field, user[field as keyof typeof user]])));
	}).catch(() => {});
	claimAchievement('profileFilled');
	if (profile.name === 'syuilo' || profile.name === 'しゅいろ') {
		claimAchievement('setNameToSyuilo');
	}
	if (profile.isCat) {
		claimAchievement('markedAsCat');
	}
}

function changeAvatar(ev: PointerEvent) {
	async function done(driveFile: Misskey.entities.DriveFile | null) {
		await enqueueProfileSave(async () => {
			const i = await updateProfile({
				avatarId: driveFile?.id ?? null,
			});
			updateCurrentAccount({
				avatarId: i.avatarId,
				avatarUrl: i.avatarUrl,
				avatarBlurhash: i.avatarBlurhash,
			});
			if (driveFile) claimAchievement('profileFilled');
		});
	}

	os.popupMenu([{
		text: i18n.ts.avatar,
		type: 'label',
	}, {
		text: i18n.ts.upload,
		icon: 'ti ti-upload',
		action: async () => {
			const files = await os.chooseFileFromPc({ multiple: false });
			const file = files[0];

			let originalOrCropped = file;

			const { canceled } = await os.confirm({
				type: 'question',
				text: i18n.ts.cropImageAsk,
				okText: i18n.ts.cropYes,
				cancelText: i18n.ts.cropNo,
			});

			if (!canceled) {
				originalOrCropped = await os.cropImageFile(file, {
					aspectRatio: 1,
				});
			}

			const driveFile = (await os.launchUploader([originalOrCropped], { multiple: false }))[0];
			done(driveFile);
		},
	}, {
		text: i18n.ts.fromDrive,
		icon: 'ti ti-cloud',
		action: () => {
			chooseDriveFile({ multiple: false }).then(files => {
				done(files[0]);
			});
		},
	}, {
		text: i18n.ts.resetToDefaultValue,
		icon: 'ti ti-restore',
		disabled: $i.avatarId == null,
		action: () => done(null),
	}], ev.currentTarget ?? ev.target);
}

function changeBanner(ev: PointerEvent) {
	function checkImage(file: { type: string }): boolean {
		if (file.type.startsWith('image/')) return true;
		os.toast(i18n.ts._profile.bannerImageOnly, 'error');
		return false;
	}

	async function done(driveFile: Misskey.entities.DriveFile | null) {
		if (driveFile && !checkImage(driveFile)) return;
		await enqueueProfileSave(async () => {
			const i = await updateProfile({
				bannerId: driveFile === null ? null : driveFile.id,
			});
			updateCurrentAccount({
				bannerId: i.bannerId,
				bannerUrl: i.bannerUrl,
				bannerBlurhash: i.bannerBlurhash,
			});
		});
	}

	os.popupMenu([{
		text: i18n.ts.banner,
		type: 'label',
	}, {
		text: i18n.ts.upload,
		icon: 'ti ti-upload',
		action: async () => {
			const files = await os.chooseFileFromPc({ multiple: false });
			const file = files[0];
			if (!file || (file.type && !checkImage(file))) return;

			let originalOrCropped = file;

			const { canceled } = await os.confirm({
				type: 'question',
				text: i18n.ts.cropImageAsk,
				okText: i18n.ts.cropYes,
				cancelText: i18n.ts.cropNo,
			});

			if (!canceled) {
				originalOrCropped = await os.cropImageFile(file, {
					aspectRatio: 2,
				});
			}

			const driveFile = (await os.launchUploader([originalOrCropped], { multiple: false }))[0];
			if (driveFile) await done(driveFile).catch(() => {});
		},
	}, {
		text: i18n.ts.fromDrive,
		icon: 'ti ti-cloud',
		action: () => chooseDriveFile({ multiple: false }).then(async files => {
			if (files[0]) await done(files[0]);
		}).catch(() => {}),
	}, {
		text: i18n.ts.resetToDefaultValue,
		icon: 'ti ti-restore',
		disabled: $i.bannerId == null,
		action: () => done(null).catch(() => {}),
	}], ev.currentTarget ?? ev.target);
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.profile,
	icon: 'ti ti-user',
}));
</script>

<style lang="scss" module>
.profile {
	container-type: inline-size;
	--MI-formLabelFontSize: 1em;
	--MI-formCaptionFontSize: .9em;
}

.profileHeader {
	margin-top: calc(-1 * var(--MI-pageContentPadding, var(--MI-cardPadding)));
	margin-inline: calc(-1 * var(--MI-pageContentPadding, var(--MI-cardPadding)));
	border-radius: 0;
}

.fieldPair {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 16px;
	align-items: start;

	> * {
		min-width: 0;
	}

	@container (max-width: 520px) {
		grid-template-columns: minmax(0, 1fr);
	}
}

.banner {
	position: relative;
	height: 130px;
	background-color: var(--MI-userBannerBg);
	border-bottom: var(--MI-divider);
	overflow: clip;
}

.avatarContainer {
	margin-top: -50px;
	padding-bottom: 16px;
	text-align: center;
}

.avatar {
	display: inline-block;
	width: 72px;
	height: 72px;
	margin: 0 auto 16px auto;
}

.bannerEdit {
	position: absolute;
	top: 16px;
	right: 16px;
}

.metadataRoot {
	container-type: inline-size;
	padding: var(--MI-cardPadding);
	background: var(--MI_THEME-bg);
	--MI-inputFill: var(--MI_THEME-panel);
}

.metadataList {
	display: flex;
	flex-direction: column;
}

.verificationHelp {
	align-self: flex-start;
	font: inherit;

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: 2px;
	}
}

.fieldError {
	font-size: .9em;
	color: var(--MI_THEME-error);
}

.fieldRow {
	display: flex;
	gap: 10px;
	padding-block: 12px;
	align-items: center;
	border-bottom: var(--MI-divider);

	&:first-child {
		padding-top: 0;
	}

	@container (max-width: 480px) {
		align-items: stretch;
		flex-direction: column;
	}
}

.fieldActions {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	gap: 4px;
}

.fieldAction {
	display: grid;
	place-items: center;
	width: 32px;
	height: 32px;
	color: var(--MI_THEME-fgTransparentWeak);
	border-radius: 6px;

	&:not(:disabled):hover {
		background: var(--MI_THEME-buttonHoverBg);
		color: var(--MI_THEME-fg);
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: 2px;
	}

	&:disabled {
		opacity: .3;
	}
}

.fieldRemove {
	&:not(:disabled):hover {
		color: var(--MI_THEME-error);
	}
}

.fieldForm {
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
	gap: 12px;
	min-width: 0;
	flex-grow: 1;

	@container (max-width: 480px) {
		grid-template-columns: minmax(0, 1fr);
		gap: 8px;
	}
}

.metadataInput {
	min-width: 0;

	> div:first-child {
		padding: 0;
	}
}

.metadataActions {
	display: flex;
	justify-content: space-between;
	gap: 12px;
	padding-top: 12px;
}

.srOnly {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	margin: -1px;
	overflow: hidden;
	clip: rect(0, 0, 0, 0);
	white-space: nowrap;
	border: 0;
}
</style>
