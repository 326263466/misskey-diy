<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<div :class="$style.banner">
		<i class="ti ti-checklist" aria-hidden="true"></i>
		<div :class="$style.introduction">
			<span>{{ i18n.ts.pleaseConfirmBelowBeforeSignup }}</span>
			<strong>{{ i18n.ts.beSureToReadThisAsItIsImportant }}</strong>
		</div>
	</div>
	<div class="_spacer _spacerCard">
		<div :class="$style.sections">
			<MkInfo v-if="instance.disableRegistration" warn>{{ i18n.ts.invitationRequiredToRegister }}</MkInfo>

			<MkFolder v-if="availableServerRules" :defaultOpen="true">
				<template #label>{{ i18n.ts.serverRules }}</template>
				<template #suffix><i v-if="agreeServerRules" class="ti ti-check" style="color: var(--MI_THEME-success)"></i></template>

				<ol class="_gaps_s" :class="$style.rules">
					<li v-for="item in instance.serverRules" :class="$style.rule"><div :class="$style.ruleText" v-html="item"></div></li>
				</ol>

				<MkSwitch :modelValue="agreeServerRules" :class="$style.agree" @update:modelValue="updateAgreeServerRules">{{ i18n.ts.agree }}</MkSwitch>
			</MkFolder>

			<MkFolder v-if="availableTos || availablePrivacyPolicy" :defaultOpen="true">
				<template #label>{{ tosPrivacyPolicyLabel }}</template>
				<template #suffix><i v-if="agreeTosAndPrivacyPolicy" class="ti ti-check" style="color: var(--MI_THEME-success)"></i></template>
				<div class="_gaps_s">
					<div v-if="availableTos"><a :href="instance.tosUrl ?? undefined" class="_link" target="_blank">{{ i18n.ts.termsOfService }} <i class="ti ti-external-link"></i></a></div>
					<div v-if="availablePrivacyPolicy"><a :href="instance.privacyPolicyUrl ?? undefined" class="_link" target="_blank">{{ i18n.ts.privacyPolicy }} <i class="ti ti-external-link"></i></a></div>
				</div>

				<MkSwitch :modelValue="agreeTosAndPrivacyPolicy" :class="$style.agree" @update:modelValue="updateAgreeTosAndPrivacyPolicy">{{ i18n.ts.agree }}</MkSwitch>
			</MkFolder>

			<MkFolder :defaultOpen="true">
				<template #label>{{ i18n.ts.basicNotesBeforeCreateAccount }}</template>
				<template #suffix><i v-if="agreeNote" class="ti ti-check" style="color: var(--MI_THEME-success)"></i></template>

				<a href="https://misskey-hub.net/docs/for-users/onboarding/warning/" class="_link" target="_blank" :aria-label="i18n.ts.basicNotesBeforeCreateAccount">{{ i18n.ts.basicNotesBeforeCreateAccount }} <i class="ti ti-external-link"></i></a>

				<MkSwitch :modelValue="agreeNote" :class="$style.agree" data-testid="signup-rules-notes-agree" @update:modelValue="updateAgreeNote">{{ i18n.ts.agree }}</MkSwitch>
			</MkFolder>

			<div v-if="!agreed" :class="$style.continueHint">{{ i18n.ts.pleaseAgreeAllToContinue }}</div>

			<div class="_buttonsCenter">
				<MkButton inline rounded @click="emit('cancel')">{{ i18n.ts.cancel }}</MkButton>
				<MkButton inline primary rounded gradate :disabled="!agreed" data-testid="signup-rules-continue" @click="emit('done')">{{ i18n.ts.continue }} <i class="ti ti-arrow-right"></i></MkButton>
			</div>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { instance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import MkButton from '@/components/MkButton.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkInfo from '@/components/MkInfo.vue';
import * as os from '@/os.js';

const availableServerRules = instance.serverRules.length > 0;
const availableTos = instance.tosUrl != null && instance.tosUrl !== '';
const availablePrivacyPolicy = instance.privacyPolicyUrl != null && instance.privacyPolicyUrl !== '';

const agreeServerRules = ref(false);
const agreeTosAndPrivacyPolicy = ref(false);
const agreeNote = ref(false);

const agreed = computed(() => {
	return (!availableServerRules || agreeServerRules.value) && ((!availableTos && !availablePrivacyPolicy) || agreeTosAndPrivacyPolicy.value) && agreeNote.value;
});

const emit = defineEmits<{
	(ev: 'cancel'): void;
	(ev: 'done'): void;
}>();

const tosPrivacyPolicyLabel = computed(() => {
	if (availableTos && availablePrivacyPolicy) {
		return i18n.ts.tosAndPrivacyPolicy;
	} else if (availableTos) {
		return i18n.ts.termsOfService;
	} else if (availablePrivacyPolicy) {
		return i18n.ts.privacyPolicy;
	} else {
		return '';
	}
});

async function updateAgreeServerRules(v: boolean) {
	if (v) {
		const confirm = await os.confirm({
			type: 'question',
			title: i18n.ts.doYouAgree,
			text: i18n.tsx.iHaveReadXCarefullyAndAgree({ x: i18n.ts.serverRules }),
		});
		if (confirm.canceled) return;
		agreeServerRules.value = true;
	} else {
		agreeServerRules.value = false;
	}
}

async function updateAgreeTosAndPrivacyPolicy(v: boolean) {
	if (v) {
		const confirm = await os.confirm({
			type: 'question',
			title: i18n.ts.doYouAgree,
			text: i18n.tsx.iHaveReadXCarefullyAndAgree({
				x: tosPrivacyPolicyLabel.value,
			}),
		});
		if (confirm.canceled) return;
		agreeTosAndPrivacyPolicy.value = true;
	} else {
		agreeTosAndPrivacyPolicy.value = false;
	}
}

async function updateAgreeNote(v: boolean) {
	if (v) {
		const confirm = await os.confirm({
			type: 'question',
			title: i18n.ts.doYouAgree,
			text: i18n.tsx.iHaveReadXCarefullyAndAgree({ x: i18n.ts.basicNotesBeforeCreateAccount }),
		});
		if (confirm.canceled) return;
		agreeNote.value = true;
	} else {
		agreeNote.value = false;
	}
}
</script>

<style lang="scss" module>
.root {
	--MI-cardPadding: 14px;
}

.banner {
	display: flex;
	align-items: flex-start;
	gap: 10px;
	padding: 12px var(--MI-cardPadding);
	font-size: 0.9em;
	line-height: 1.5;
	background-color: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);

	> i {
		flex-shrink: 0;
		margin-top: 2px;
		font-size: 18px;
	}
}

.introduction {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
}

.sections {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.agree {
	margin-top: 10px;
}

.continueHint {
	text-align: center;
	font-size: 0.85em;
	line-height: 1.5;
	color: var(--MI_THEME-fgTransparentWeak);
}

.rules {
	counter-reset: item;
	list-style: none;
	padding: 0;
	margin: 0;
}

.rule {
	display: flex;
	gap: 8px;
	word-break: break-word;

	&::before {
		flex-shrink: 0;
		display: flex;
		position: sticky;
		top: calc(var(--MI-stickyTop, 0px) + 8px);
		counter-increment: item;
		content: counter(item);
		width: 24px;
		height: 24px;
		line-height: 24px;
		background-color: var(--MI_THEME-accentedBg);
		color: var(--MI_THEME-accent);
		font-size: 12px;
		font-weight: bold;
		align-items: center;
		justify-content: center;
		border-radius: 999px;
	}
}

.ruleText {
	padding-top: 2px;
}
</style>
