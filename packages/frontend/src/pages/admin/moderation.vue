<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard :tabs="headerTabs">
	<div class="_pageBody">
		<SearchMarker path="/admin/moderation" :label="i18n.ts.moderationSettings" :keywords="['moderation']" icon="ti ti-shield" :inlining="['serverRules']">
			<div class="_gaps_m">
				<SearchMarker :keywords="['open', 'registration']">
					<MkSwitch :modelValue="enableRegistration" :disabled="registrationSaving" @update:modelValue="onChange_enableRegistration">
						<template #label><SearchLabel>{{ i18n.ts._serverSettings.openRegistration }}</SearchLabel></template>
						<template #caption>
							<div><SearchText>{{ i18n.ts._serverSettings.thisSettingWillAutomaticallyOffWhenModeratorsInactive }}</SearchText></div>
							<div><i class="ti ti-alert-triangle" style="color: var(--MI_THEME-warn);"></i> <SearchText>{{ i18n.ts._serverSettings.openRegistrationWarning }}</SearchText></div>
						</template>
					</MkSwitch>
				</SearchMarker>

				<SearchMarker :keywords="['email', 'required', 'signup']">
					<MkSwitch v-model="emailRequiredForSignup" @change="onChange_emailRequiredForSignup">
						<template #label><SearchLabel>{{ i18n.ts.emailRequiredForSignup }}</SearchLabel> ({{ i18n.ts.recommended }})</template>
					</MkSwitch>
				</SearchMarker>

				<SearchMarker :keywords="['open', 'access', 'visitor', 'guest']">
					<MkSwitch :modelValue="openGuestAccess" data-testid="open-guest-access" @update:modelValue="onChange_openGuestAccess">
						<template #label><SearchLabel>{{ i18n.ts._serverSettings.openGuestAccess }}</SearchLabel></template>
						<template #caption><SearchText>{{ i18n.ts._serverSettings.openGuestAccessDescription }}</SearchText></template>
					</MkSwitch>
				</SearchMarker>

				<SearchMarker v-if="!openGuestAccess" :keywords="['ugc', 'content', 'visibility', 'visitor', 'guest']">
					<MkSelect v-model="ugcVisibilityForVisitor" :items="ugcVisibilityForVisitorDef" @update:modelValue="onChange_ugcVisibilityForVisitor">
						<template #label><SearchLabel>{{ i18n.ts._serverSettings.userGeneratedContentsVisibilityForVisitor }}</SearchLabel></template>
						<template #caption>
							<div><SearchText>{{ i18n.ts._serverSettings.userGeneratedContentsVisibilityForVisitor_description }}</SearchText></div>
							<div><i class="ti ti-alert-triangle" style="color: var(--MI_THEME-warn);"></i> <SearchText>{{ i18n.ts._serverSettings.userGeneratedContentsVisibilityForVisitor_description2 }}</SearchText></div>
						</template>
					</MkSelect>
				</SearchMarker>

				<XServerRules/>

				<SearchMarker :keywords="['preserved', 'usernames']">
					<MkFolder>
						<template #icon><SearchIcon><i class="ti ti-lock-star"></i></SearchIcon></template>
						<template #label><SearchLabel>{{ i18n.ts.preservedUsernames }}</SearchLabel></template>

						<div class="_gaps">
							<MkTextarea v-model="preservedUsernames">
								<template #caption>{{ i18n.ts.preservedUsernamesDescription }}</template>
							</MkTextarea>
							<MkButton primary @click="save_preservedUsernames">{{ i18n.ts.save }}</MkButton>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker :keywords="['sensitive', 'words']">
					<MkFolder>
						<template #icon><SearchIcon><i class="ti ti-message-exclamation"></i></SearchIcon></template>
						<template #label><SearchLabel>{{ i18n.ts.sensitiveWords }}</SearchLabel></template>

						<div class="_gaps">
							<MkTextarea v-model="sensitiveWords">
								<template #caption>{{ i18n.ts.sensitiveWordsDescription }}<br>{{ i18n.ts.sensitiveWordsDescription2 }}</template>
							</MkTextarea>
							<MkButton primary @click="save_sensitiveWords">{{ i18n.ts.save }}</MkButton>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker :keywords="['prohibited', 'words']">
					<MkFolder>
						<template #icon><SearchIcon><i class="ti ti-message-x"></i></SearchIcon></template>
						<template #label><SearchLabel>{{ i18n.ts.prohibitedWords }}</SearchLabel></template>

						<div class="_gaps">
							<MkTextarea v-model="prohibitedWords">
								<template #caption>{{ i18n.ts.prohibitedWordsDescription }}<br>{{ i18n.ts.prohibitedWordsDescription2 }}</template>
							</MkTextarea>
							<MkButton primary @click="save_prohibitedWords">{{ i18n.ts.save }}</MkButton>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker :keywords="['prohibited', 'name', 'user']">
					<MkFolder>
						<template #icon><SearchIcon><i class="ti ti-user-x"></i></SearchIcon></template>
						<template #label><SearchLabel>{{ i18n.ts.prohibitedWordsForNameOfUser }}</SearchLabel></template>

						<div class="_gaps">
							<MkTextarea v-model="prohibitedWordsForNameOfUser">
								<template #caption>{{ i18n.ts.prohibitedWordsForNameOfUserDescription }}<br>{{ i18n.ts.prohibitedWordsDescription2 }}</template>
							</MkTextarea>
							<MkButton primary @click="save_prohibitedWordsForNameOfUser">{{ i18n.ts.save }}</MkButton>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker :keywords="['hidden', 'tags', 'hashtags']">
					<MkFolder>
						<template #icon><SearchIcon><i class="ti ti-eye-off"></i></SearchIcon></template>
						<template #label><SearchLabel>{{ i18n.ts.hiddenTags }}</SearchLabel></template>

						<div class="_gaps">
							<MkTextarea v-model="hiddenTags">
								<template #caption>{{ i18n.ts.hiddenTagsDescription }}</template>
							</MkTextarea>
							<MkButton primary @click="save_hiddenTags">{{ i18n.ts.save }}</MkButton>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker :keywords="['silenced', 'servers', 'hosts']">
					<MkFolder>
						<template #icon><SearchIcon><i class="ti ti-eye-off"></i></SearchIcon></template>
						<template #label><SearchLabel>{{ i18n.ts.silencedInstances }}</SearchLabel></template>

						<div class="_gaps">
							<MkTextarea v-model="silencedHosts">
								<template #caption>{{ i18n.ts.silencedInstancesDescription }}</template>
							</MkTextarea>
							<MkButton primary @click="save_silencedHosts">{{ i18n.ts.save }}</MkButton>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker :keywords="['media', 'silenced', 'servers', 'hosts']">
					<MkFolder>
						<template #icon><SearchIcon><i class="ti ti-eye-off"></i></SearchIcon></template>
						<template #label><SearchLabel>{{ i18n.ts.mediaSilencedInstances }}</SearchLabel></template>

						<div class="_gaps">
							<MkTextarea v-model="mediaSilencedHosts">
								<template #caption>{{ i18n.ts.mediaSilencedInstancesDescription }}</template>
							</MkTextarea>
							<MkButton primary @click="save_mediaSilencedHosts">{{ i18n.ts.save }}</MkButton>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker :keywords="['blocked', 'servers', 'hosts']">
					<MkFolder>
						<template #icon><SearchIcon><i class="ti ti-ban"></i></SearchIcon></template>
						<template #label><SearchLabel>{{ i18n.ts.blockedInstances }}</SearchLabel></template>

						<div class="_gaps">
							<MkTextarea v-model="blockedHosts">
								<template #caption>{{ i18n.ts.blockedInstancesDescription }}</template>
							</MkTextarea>
							<MkButton primary @click="save_blockedHosts">{{ i18n.ts.save }}</MkButton>
						</div>
					</MkFolder>
				</SearchMarker>
			</div>
		</SearchMarker>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import XServerRules from './server-rules.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { useMkSelect } from '@/composables/use-mkselect.js';
import MkButton from '@/components/MkButton.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkSelect from '@/components/MkSelect.vue';

const meta = await misskeyApi('admin/meta');

const enableRegistration = ref(!meta.disableRegistration);
const registrationSaving = ref(false);
const emailRequiredForSignup = ref(meta.emailRequiredForSignup);
const {
	model: ugcVisibilityForVisitor,
	def: ugcVisibilityForVisitorDef,
} = useMkSelect({
	items: [
		{ label: i18n.ts._serverSettings._userGeneratedContentsVisibilityForVisitor.all, value: 'all' },
		{ label: i18n.ts._serverSettings._userGeneratedContentsVisibilityForVisitor.localOnly, value: 'local' },
		{ label: i18n.ts._serverSettings._userGeneratedContentsVisibilityForVisitor.none, value: 'none' },
	],
	initialValue: meta.ugcVisibilityForVisitor,
});
const openGuestAccess = ref(meta.clientOptions.openGuestAccess === true);
const sensitiveWords = ref(meta.sensitiveWords.join('\n'));
const prohibitedWords = ref(meta.prohibitedWords.join('\n'));
const prohibitedWordsForNameOfUser = ref(meta.prohibitedWordsForNameOfUser.join('\n'));
const hiddenTags = ref(meta.hiddenTags.join('\n'));
const preservedUsernames = ref(meta.preservedUsernames.join('\n'));
const blockedHosts = ref(meta.blockedHosts.join('\n'));
const silencedHosts = ref(meta.silencedHosts?.join('\n') ?? '');
const mediaSilencedHosts = ref(meta.mediaSilencedHosts.join('\n'));

async function onChange_enableRegistration(value: boolean) {
	if (registrationSaving.value || value === enableRegistration.value) return;
	// 同源码：开启注册前先确认说明。
	if (value) {
		const { canceled } = await os.confirm({
			type: 'warning',
			text: i18n.ts.acknowledgeNotesAndEnable,
		});
		if (canceled || registrationSaving.value) return;
	}
	const previousValue = enableRegistration.value;
	registrationSaving.value = true;
	enableRegistration.value = value;
	let saved = false;

	try {
		await os.apiWithDialog('admin/update-meta', {
			disableRegistration: !value,
		}, undefined, undefined, { toastOnInternalError: true });
		saved = true;
		const updatedMeta = await fetchInstance(true);
		enableRegistration.value = !updatedMeta.disableRegistration;
	} catch {
		// 保存失败由公共流程提示；刷新失败不反转已保存的新值。
		if (!saved) enableRegistration.value = previousValue;
	} finally {
		registrationSaving.value = false;
	}
}

function onChange_emailRequiredForSignup(value: boolean) {
	// 成功不提示；失败原因由公共流程提示，并还原开关。
	os.apiWithDialog('admin/update-meta', {
		emailRequiredForSignup: value,
	}, undefined, undefined, { toastOnInternalError: true }).then(() => {
		fetchInstance(true);
	}, () => {
		emailRequiredForSignup.value = !value;
	});
}

async function onChange_openGuestAccess(value: boolean) {
	try {
		await os.apiWithDialog('admin/update-meta', { clientOptions: { openGuestAccess: value } }, undefined, undefined, { toastOnInternalError: true });
		openGuestAccess.value = value;
		await fetchInstance(true);
	} catch {
		// 保存失败时值尚未更新；公共流程已提示原因。
	}
}

let savedUgcVisibilityForVisitor = ugcVisibilityForVisitor.value;

function onChange_ugcVisibilityForVisitor(value: typeof ugcVisibilityForVisitor.value) {
	// 选择成功不提示；失败提示由 apiWithDialog 处理，并还原选择
	os.apiWithDialog('admin/update-meta', {
		ugcVisibilityForVisitor: value,
	}).then(() => {
		savedUgcVisibilityForVisitor = value;
		fetchInstance(true);
	}, () => {
		ugcVisibilityForVisitor.value = savedUgcVisibilityForVisitor;
	});
}

function save_preservedUsernames() {
	os.apiWithDialog('admin/update-meta', {
		preservedUsernames: preservedUsernames.value.split('\n'),
	}).then(() => {
		fetchInstance(true);
		os.toast(i18n.ts.saved, 'success');
	}, () => {}); // 失败提示由 apiWithDialog 处理
}

function save_sensitiveWords() {
	os.apiWithDialog('admin/update-meta', {
		sensitiveWords: sensitiveWords.value.split('\n'),
	}).then(() => {
		fetchInstance(true);
		os.toast(i18n.ts.saved, 'success');
	}, () => {}); // 失败提示由 apiWithDialog 处理
}

function save_prohibitedWords() {
	os.apiWithDialog('admin/update-meta', {
		prohibitedWords: prohibitedWords.value.split('\n'),
	}).then(() => {
		fetchInstance(true);
		os.toast(i18n.ts.saved, 'success');
	}, () => {}); // 失败提示由 apiWithDialog 处理
}

function save_prohibitedWordsForNameOfUser() {
	os.apiWithDialog('admin/update-meta', {
		prohibitedWordsForNameOfUser: prohibitedWordsForNameOfUser.value.split('\n'),
	}).then(() => {
		fetchInstance(true);
		os.toast(i18n.ts.saved, 'success');
	}, () => {}); // 失败提示由 apiWithDialog 处理
}

function save_hiddenTags() {
	os.apiWithDialog('admin/update-meta', {
		hiddenTags: hiddenTags.value.split('\n'),
	}).then(() => {
		fetchInstance(true);
		os.toast(i18n.ts.saved, 'success');
	}, () => {}); // 失败提示由 apiWithDialog 处理
}

function save_blockedHosts() {
	os.apiWithDialog('admin/update-meta', {
		blockedHosts: blockedHosts.value.split('\n') || [],
	}).then(() => {
		fetchInstance(true);
		os.toast(i18n.ts.saved, 'success');
	}, () => {}); // 失败提示由 apiWithDialog 处理
}

function save_silencedHosts() {
	os.apiWithDialog('admin/update-meta', {
		silencedHosts: silencedHosts.value.split('\n') || [],
	}).then(() => {
		fetchInstance(true);
		os.toast(i18n.ts.saved, 'success');
	}, () => {}); // 失败提示由 apiWithDialog 处理
}

function save_mediaSilencedHosts() {
	os.apiWithDialog('admin/update-meta', {
		mediaSilencedHosts: mediaSilencedHosts.value.split('\n') || [],
	}).then(() => {
		fetchInstance(true);
		os.toast(i18n.ts.saved, 'success');
	}, () => {}); // 失败提示由 apiWithDialog 处理
}

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.moderationSettings,
	icon: 'ti ti-shield',
}));
</script>
