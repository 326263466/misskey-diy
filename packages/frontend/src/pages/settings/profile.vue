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

		<SearchMarker :keywords="['metadata']">
			<FormSlot>
				<MkFolder>
					<template #icon><i class="ti ti-list"></i></template>
					<template #label><SearchLabel>{{ i18n.ts._profile.metadataEdit }}</SearchLabel></template>
					<template #footer>
						<div class="_buttons">
							<MkButton primary :disabled="!validFields" @click="saveFields"><i class="ti ti-check"></i> {{ i18n.ts.save }}</MkButton>
							<MkButton :disabled="fields.length >= 16" @click="addField"><i class="ti ti-plus"></i> {{ i18n.ts.add }}</MkButton>
							<MkButton v-if="!fieldEditMode" :disabled="fields.length <= 1" danger @click="fieldEditMode = !fieldEditMode"><i class="ti ti-trash"></i> {{ i18n.ts.delete }}</MkButton>
							<MkButton v-else @click="fieldEditMode = !fieldEditMode"><i class="ti ti-arrows-sort"></i> {{ i18n.ts.rearrange }}</MkButton>
						</div>
					</template>

					<div :class="$style.metadataRoot" class="_gaps_s">
						<MkInfo>{{ i18n.ts._profile.verifiedLinkDescription }}</MkInfo>

						<MkDraggable
							v-model="fields"
							direction="vertical"
							withGaps
							manualDragStart
						>
							<template #default="{ item, dragStart }">
								<div v-panel :class="$style.fieldDragItem">
							<button v-if="!fieldEditMode" class="_button _iconButton" :class="$style.dragItemHandle" tabindex="-1" :draggable="true" @dragstart.stop="dragStart"><i class="ti ti-menu"></i></button>
									<button v-if="fieldEditMode" :disabled="fields.length <= 1" class="_button" :class="$style.dragItemRemove" @click="deleteField(item.id)"><i class="ti ti-x"></i></button>
									<div :class="$style.dragItemForm">
										<FormSplit :minWidth="200">
											<MkInput v-model="item.name" :counterMaxLength="Misskey.CONTENT_LIMITS.profileFieldName" small :mfmAutocomplete="['emoji']" :placeholder="i18n.ts._profile.metadataLabel">
											</MkInput>
											<MkInput v-model="item.value" :counterMaxLength="Misskey.CONTENT_LIMITS.profileFieldValue" small mfmAutocomplete :placeholder="i18n.ts._profile.metadataContent">
											</MkInput>
										</FormSplit>
									</div>
								</div>
							</template>
						</MkDraggable>
					</div>
				</MkFolder>
				<template #caption>{{ i18n.ts._profile.metadataDescription }}</template>
			</FormSlot>
		</SearchMarker>

		<SearchMarker :keywords="['follow', 'message']">
			<MkInput v-model="profile.followedMessage" :counterMaxLength="256" manualSave :mfmAutocomplete="['emoji']">
				<template #label><SearchLabel>{{ i18n.ts._profile.followedMessage }}</SearchLabel></template>
				<template #caption>
					<div><SearchText>{{ i18n.ts._profile.followedMessageDescription }}</SearchText></div>
					<div>{{ i18n.ts._profile.followedMessageDescriptionForLockedAccount }}</div>
				</template>
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
import { computed, defineAsyncComponent, reactive, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { useLowresTime } from '@@/js/use-lowres-time.js';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkSelect from '@/components/MkSelect.vue';
import FormSplit from '@/components/form/split.vue';
import MkFolder from '@/components/MkFolder.vue';
import FormSlot from '@/components/form/slot.vue';
import FormLink from '@/components/form/link.vue';
import MkDraggable from '@/components/MkDraggable.vue';
import { chooseDriveFile } from '@/utility/drive.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { ensureSignin } from '@/i.js';
import { updateCurrentAccountPartial } from '@/accounts.js';
import { langmap } from '@/utility/langmap.js';
import { definePage } from '@/page.js';
import { claimAchievement } from '@/utility/achievements.js';
import { store } from '@/store.js';
import MkInfo from '@/components/MkInfo.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import { genId } from '@/utility/id.js';
import { enqueueProfileSave } from '@/utility/profile-save.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { isAccountSessionErrorHandled } from '@/utility/account-session-error.js';
import { formatTimeString } from '@/utility/format-time-string.js';

const $i = ensureSignin();
const currentTime = useLowresTime();
const birthdayMax = computed(() => formatTimeString(new Date(currentTime.value), 'yyyy-MM-dd'));

function showQr(): void {
	const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkUserQrDialog.vue')), { user: $i }, {
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

async function updateProfile(patch: Misskey.entities.IUpdateRequest) {
	try {
		const user = await misskeyApi('i/update', patch);
		os.toast(i18n.ts.saved, 'success');
		return user;
	} catch (error) {
		if (!isAccountSessionErrorHandled(error)) {
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

const fields = ref($i.fields.map(field => ({ id: genId(), name: field.name, value: field.value })) ?? []);
const fieldEditMode = ref(false);
const validFields = computed(() => fields.value.every(field => {
	if (field.name.trim() === '' || field.value.trim() === '') return true;
	const existing = $i.fields.find(original => original.name === field.name.trim());
	return (existing != null || Array.from(field.name.trim()).length <= Misskey.CONTENT_LIMITS.profileFieldName) &&
		(existing?.value === field.value.trim() || Array.from(field.value.trim()).length <= Misskey.CONTENT_LIMITS.profileFieldValue);
}));

function addField() {
	fields.value.push({
		id: genId(),
		name: '',
		value: '',
	});
}

while (fields.value.length < 4) {
	addField();
}

function deleteField(itemId: string) {
	fields.value = fields.value.filter(f => f.id !== itemId);
}

function saveFields() {
	if (!validFields.value) return;
	const update = fields.value.filter(field => field.name.trim() !== '' && field.value.trim() !== '').map(field => ({ name: field.name.trim(), value: field.value.trim() }));
	enqueueProfileSave(async () => {
		const user = await updateProfile({ fields: update });
		updateCurrentAccountPartial({ fields: user.fields, verifiedLinks: user.verifiedLinks });
	}).catch(() => {});
}

function save(patch: Misskey.entities.IUpdateRequest) {
	enqueueProfileSave(async () => {
		const user = await updateProfile(patch);
		updateCurrentAccountPartial(Object.fromEntries(Object.keys(patch).map(field => [field, user[field as keyof typeof user]])));
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
			updateCurrentAccountPartial({
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
			updateCurrentAccountPartial({
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
}

.fieldDragItem {
	display: flex;
	padding: 10px;
	align-items: flex-end;
	border-radius: 6px;

	// (drag button) 32px + (drag button margin) 8px + (input width) 200px * 2 + (input gap) 12px = 452px
	@container (max-width: 452px) {
		align-items: center;
	}
}

.dragItemHandle {
	cursor: grab;
	width: 32px;
	height: 32px;
	margin: 0 8px 0 0;
	color: var(--MI_THEME-fgTransparentWeak);
	flex-shrink: 0;

	&:active {
		cursor: grabbing;
	}
}

.dragItemRemove {
	@extend .dragItemHandle;

	color: var(--MI_THEME-error);
	opacity: 1;
	cursor: pointer;

	&:hover, &:focus {
		opacity: .7;
	}

	&:active {
		cursor: pointer;
	}
}

.dragItemForm {
	min-width: 0;
	flex-grow: 1;
}
</style>
