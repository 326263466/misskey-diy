<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="uiWindow"
	:width="460"
	:height="690"
	:autoHeight="deviceKind !== 'smartphone'"
	role="dialog"
	tabindex="-1"
	aria-modal="true"
	:aria-labelledby="titleId"
	:aria-busy="sending"
	:withCloseButton="!locked"
	@close="close"
	@click="close"
	@esc="close"
	@closed="emit('closed')"
>
	<template #header>
		<span :id="titleId" :class="$style.title">{{ i18n.ts.reportAbuse }}</span>
	</template>
	<div :class="$style.body">
		<div :class="$style.target">
			<MkAvatar :user="user" :class="$style.targetAvatar"/>
			<span :class="$style.targetLabel">{{ i18n.ts._abuseUserReport.reportedUser }}</span>
			<span :class="$style.targetName">
				<strong v-if="user.name">{{ user.name }}</strong>
				<MkAcct :user="user"/>
			</span>
		</div>
		<p :class="$style.hint">
			<i class="ti ti-shield-check" :class="$style.hintIcon" aria-hidden="true"></i>
			<span>{{ reportTarget.reportType === 'user' ? i18n.ts._abuseUserReport.accountReportHint : i18n.ts._abuseUserReport.contentReportHint }}</span>
		</p>
		<template v-if="context">
			<h2 :class="$style.heading">{{ i18n.ts._abuseReport.reportedContent }}</h2>
			<div :class="$style.context">
				<div v-if="context.text" :class="$style.contextText" :title="context.text" class="_selectable">{{ context.text }}</div>
				<div v-if="context.sourceUrl" :class="$style.contextLink">
					<Mfm :text="`${i18n.ts._abuseReport._linkLabels.note}: ${context.sourceUrl}`" :linkNavigationBehavior="'window'"/>
				</div>
				<div :class="$style.contextLink">
					<Mfm :text="`${context.label}: ${context.url}`" :linkNavigationBehavior="'window'"/>
				</div>
			</div>
		</template>
		<h2 :class="$style.heading">{{ i18n.ts._abuseReport.selectReason }}</h2>
		<fieldset :class="$style.reasons" :aria-label="i18n.ts._abuseReport.selectReason" :disabled="locked">
			<label v-for="option in reasons" :key="option" :class="[$style.reason, { [$style.reasonSelected]: reason === option }]">
				<input v-model="reason" type="radio" :name="titleId" :value="option" :class="$style.radio">
				<span :class="$style.reasonLabel">{{ i18n.ts._abuseReport._reasons[option] }}</span>
				<i class="ti" :class="[reason === option ? 'ti-circle-dot' : 'ti-circle', $style.reasonRadio]" aria-hidden="true"></i>
			</label>
		</fieldset>
		<label :class="$style.detailLabel">
			<span>{{ i18n.ts._abuseReport.description }}</span>
			<textarea
				v-model="detail"
				:class="$style.detail"
				:placeholder="reason === 'other' ? i18n.ts._abuseReport.otherDescriptionHint : i18n.ts._abuseReport.descriptionHint"
				:required="reason === 'other'"
				:disabled="locked"
				:maxlength="2048"
				rows="2"
			></textarea>
		</label>
	</div>
	<template #footer>
		<MkButton primary full :disabled="!canSubmit" :wait="sending" @click="send">{{ sending ? i18n.ts.processing : i18n.ts._abuseReport.submit }}</MkButton>
	</template>
</MkModalWindow>
</template>

<script setup lang="ts">
import { computed, ref, useId, useTemplateRef } from 'vue';
import type * as Misskey from 'misskey-js';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkButton from '@/components/MkButton.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { deviceKind } from '@/utility/device-kind.js';

const props = defineProps<{
	user: Misskey.entities.UserLite;
	context?: { label: string; text?: string | null; url: string; sourceUrl?: string };
	reportTarget: { reportType: 'user' } | { reportType: 'note' | 'chat' | 'page' | 'gallery' | 'play'; targetId: string } | { reportType: 'boost'; targetId: string; reaction: string };
}>();

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const uiWindow = useTemplateRef('uiWindow');
const titleId = useId();
const reason = ref<(typeof reasons)[number] | null>(null);
const detail = ref('');
const sending = ref(false);
const submitted = ref(false);
const locked = computed(() => sending.value || submitted.value);
const canSubmit = computed(() => !locked.value && reason.value != null && detail.value.trim().length <= 2048 && (reason.value !== 'other' || detail.value.trim().length > 0));
let submission: { payload: string; requestId: string } | null = null;
const reasons = [
	'spam',
	'scam',
	'sexualContent',
	'harassment',
	'privacyViolation',
	'other',
] as const;

function close() {
	if (!locked.value) uiWindow.value?.close();
}

async function send() {
	if (!canSubmit.value || reason.value == null) return;

	const payload = {
		userId: props.user.id,
		reason: reason.value,
		comment: detail.value.trim(),
		...props.reportTarget,
	};
	const serializedPayload = JSON.stringify(payload);
	if (submission?.payload !== serializedPayload) submission = { payload: serializedPayload, requestId: window.crypto.randomUUID() };
	sending.value = true;
	try {
		await os.apiWithDialog('users/report-abuse', { ...payload, requestId: submission.requestId }, undefined);
	} catch {
		return;
	} finally {
		sending.value = false;
	}
	submitted.value = true;
	await os.alert({ type: 'success', text: i18n.ts.abuseReported });
	uiWindow.value?.close();
}
</script>

<style lang="scss" module>
.title {
	font-weight: normal;
}

.body {
	padding: 14px 16px 16px;
}

.target {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	margin-bottom: 8px;
	overflow-wrap: anywhere;
}

.targetAvatar {
	width: 28px;
	height: 28px;
}

.targetLabel {
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.targetName {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 6px;
}

.hint {
	display: flex;
	align-items: center;
	gap: 6px;
	margin: 0 0 8px;
	font-size: 0.85em;
	line-height: 1.5;
	color: var(--MI_THEME-fgTransparentWeak);
}

.hintIcon {
	flex-shrink: 0;
}

.context {
	margin-bottom: 8px;
	padding: 10px 12px;
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-bg);
	border: 1px solid var(--MI_THEME-divider);
}

.contextText {
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 1;
	overflow: hidden;
	margin-bottom: 4px;
	font-size: 0.9em;
	line-height: 1.5;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}

.contextLink {
	font-size: 0.8em;
	line-height: 1.5;
	overflow-wrap: anywhere;
}

.heading {
	margin: 0 0 6px;
	font-size: 0.9em;
	font-weight: normal;
}

.reasons {
	min-width: 0;
	margin: 0 0 10px;
	padding: 0;
	border: 0;

	&:disabled .reason {
		cursor: default;
		opacity: 0.6;
	}
}

.reason {
	position: relative;
	display: flex;
	align-items: center;
	gap: 8px;
	min-height: 38px;
	padding: 7px 10px;
	box-sizing: border-box;
	border-radius: calc(var(--MI-radius) / 2);
	color: var(--MI_THEME-fg);
	font-size: 0.95em;
	line-height: 1.4;
	cursor: pointer;
	transition: background 0.15s ease;

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
	}

	&:has(.radio:focus-visible) {
		outline: 2px solid var(--MI_THEME-accent);
		outline-offset: -2px;
	}
}

.reasonSelected {
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	font-weight: bold;

	.reasonRadio {
		color: var(--MI_THEME-accent);
	}
}

.reasonRadio {
	flex-shrink: 0;
	font-size: 1.15em;
	color: color-mix(in srgb, var(--MI_THEME-fg) 35%, transparent);
	transition: color 0.15s ease;
}

.radio {
	position: absolute;
	width: 1px;
	height: 1px;
	margin: 0;
	opacity: 0;
}

.detailLabel {
	display: flex;
	flex-direction: column;
	gap: 6px;
	font-size: 0.9em;
}

.detail {
	width: 100%;
	box-sizing: border-box;
	min-height: 56px;
	padding: 10px 12px;
	border: 1px solid var(--MI_THEME-inputBorder);
	border-radius: var(--MI-radius);
	font: inherit;
	color: var(--MI_THEME-fg);
	background: var(--MI_THEME-bg);
	resize: none;

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-accent);
		outline-offset: -1px;
	}
}
</style>
