<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="uiWindow"
	:closeOnBackdrop="false"
	:width="460"
	:height="720"
	autoHeight
	headerIcon="ti ti-flag"
	role="dialog"
	tabindex="-1"
	aria-modal="true"
	:aria-labelledby="titleId"
	:aria-busy="sending"
	:withCloseButton="!locked"
	@close="close"
	@esc="close"
	@closed="emit('closed')"
>
	<template #header>
		<span :id="titleId">{{ i18n.ts.reportAbuse }}</span>
	</template>
	<div :class="$style.body">
		<section :class="$style.summary">
			<div :class="$style.summaryLead" aria-hidden="true">
				<i :class="reportTarget.reportType === 'user' ? 'ti ti-user' : 'ti ti-file-description'"></i>
			</div>
			<div :class="$style.summaryBody">
				<div v-if="reportTarget.reportType === 'user'" :class="$style.target">
					<strong v-if="user.name" :class="$style.targetName"><MkUserName :user="user" :nowrap="false"/></strong>
					<MkAcct :user="user" :class="$style.targetAcct"/>
				</div>
				<template v-if="context">
					<div v-if="context.text" :class="$style.contextText" :title="context.text" class="_selectable">{{ context.text }}</div>
					<div :class="$style.contextLinks">
						<div v-if="context.sourceUrl" :class="$style.contextLink">
							<Mfm :text="`${i18n.ts._abuseReport._linkLabels.note}: ${context.sourceUrl}`" :linkNavigationBehavior="'window'"/>
						</div>
						<div :class="$style.contextLink">
							<Mfm :text="`${context.label}: ${context.url}`" :linkNavigationBehavior="'window'"/>
						</div>
					</div>
				</template>
			</div>
			<p :class="$style.hint">
				<i class="ti ti-shield-check" aria-hidden="true"></i>
				<span>{{ reportTarget.reportType === 'user' ? i18n.ts._abuseUserReport.accountReportHint : i18n.ts._abuseUserReport.contentReportHint }}</span>
			</p>
		</section>
		<section :class="$style.section">
			<div :class="$style.headingRow">
				<span :class="$style.headingMark" aria-hidden="true"></span>
				<h2 :class="$style.heading">{{ i18n.ts._abuseReport.selectReason }}</h2>
			</div>
			<fieldset :class="$style.reasons" :aria-label="i18n.ts._abuseReport.selectReason" :disabled="locked">
				<label v-for="option in reasons" :key="option" :data-reason="option" :class="[$style.reason, { [$style.reasonSelected]: reason === option }]">
					<input v-model="reason" type="radio" :name="titleId" :value="option" :class="$style.radio">
					<span :class="$style.reasonIcon" aria-hidden="true"><i :class="reasonIcons[option]"></i></span>
					<span :class="$style.reasonText">{{ i18n.ts._abuseReport._reasons[option] }}</span>
				</label>
			</fieldset>
		</section>
		<section :class="$style.section">
			<div :class="$style.headingRow">
				<span :class="$style.headingMark" aria-hidden="true"></span>
				<label :class="$style.heading" :for="detailId">{{ i18n.ts._abuseReport.description }}</label>
			</div>
			<div :class="$style.detailField">
				<textarea
					:id="detailId"
					v-model="detail"
					:class="$style.detail"
					:placeholder="reason === 'other' ? i18n.ts._abuseReport.otherDescriptionHint : i18n.ts._abuseReport.descriptionHint"
					:required="reason === 'other'"
					:disabled="locked"
					:aria-invalid="detailLength > CONTENT_LIMITS.abuseReportComment"
					rows="2"
				></textarea>
				<span class="_inputCounter" :class="{ _inputCounterOver: detailLength > CONTENT_LIMITS.abuseReportComment }">{{ detailLength }}/{{ CONTENT_LIMITS.abuseReportComment }}</span>
			</div>
		</section>
	</div>
	<template #footer>
		<div :class="$style.footerActions">
			<MkButton :disabled="locked" @click="close">{{ i18n.ts.cancel }}</MkButton>
			<MkButton primary :disabled="!canSubmit" :wait="sending" @click="send">{{ sending ? i18n.ts.processing : i18n.ts._abuseReport.submit }}</MkButton>
		</div>
	</template>
</MkModalWindow>
</template>

<script setup lang="ts">
import { computed, ref, useId, useTemplateRef } from 'vue';
import { CONTENT_LIMITS } from 'misskey-js';
import type * as Misskey from 'misskey-js';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkButton from '@/components/MkButton.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	user: Misskey.entities.UserLite;
	context?: { label: string; text?: string | null; url: string; sourceUrl?: string };
	initialComment?: string;
	reportTarget: { reportType: 'user' } | { reportType: 'note' | 'chat' | 'page' | 'article' | 'article_comment' | 'gallery' | 'play'; targetId: string };
}>();

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const uiWindow = useTemplateRef('uiWindow');
const titleId = useId();
const detailId = useId();
const reason = ref<(typeof reasons)[number] | null>(null);
const detail = ref(props.initialComment ?? '');
const detailLength = computed(() => Array.from(detail.value).length);
const sending = ref(false);
const submitted = ref(false);
const locked = computed(() => sending.value || submitted.value);
const canSubmit = computed(() => !locked.value && reason.value != null && detailLength.value <= CONTENT_LIMITS.abuseReportComment && (reason.value !== 'other' || detail.value.trim().length > 0));
let submission: { payload: string; requestId: string } | null = null;
const reasons = [
	'spam',
	'scam',
	'sexualContent',
	'harassment',
	'privacyViolation',
	'other',
] as const;
const reasonIcons: Record<(typeof reasons)[number], string> = {
	spam: 'ti ti-mail-off',
	scam: 'ti ti-alert-triangle',
	sexualContent: 'ti ti-eye-off',
	harassment: 'ti ti-message-off',
	privacyViolation: 'ti ti-shield-lock',
	other: 'ti ti-dots',
};

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
	os.toast(i18n.ts.abuseReported, 'success');
	uiWindow.value?.close();
}
</script>

<style lang="scss" module>
@use '../styles/input.scss' as input;

.body {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 8px 14px 12px;
}

// 把举报对象和存证说明收进一张摘要卡，避免顶部信息散落。
.summary {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr);
	gap: 6px 10px;
	min-width: 0;
	padding: 9px 10px;
	border: 1px solid color-mix(in srgb, var(--MI_THEME-accent) 12%, transparent);
	border-radius: var(--MI-radius);
	background: linear-gradient(135deg,
		color-mix(in srgb, var(--MI_THEME-accent) 7%, var(--MI_THEME-panel)),
		var(--MI_THEME-panelHighlight));
	box-shadow: 0 1px 0 color-mix(in srgb, var(--MI_THEME-fg) 4%, transparent);
}

.summaryLead {
	display: grid;
	place-items: center;
	align-self: start;
	width: 30px;
	height: 30px;
	border-radius: calc(var(--MI-radius) * .8);
	background: color-mix(in srgb, var(--MI_THEME-accent) 14%, var(--MI_THEME-panel));
	color: var(--MI_THEME-accent);
	font-size: 16px;
}

.summaryBody {
	display: flex;
	flex-direction: column;
	gap: 3px;
	min-width: 0;
}

.target {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 6px;
	min-width: 0;
	overflow-wrap: anywhere;
}

.targetName {
	line-height: 1.4;
}

.targetAcct {
	font-size: 0.9em;
	line-height: 1.4;
	color: var(--MI_THEME-fgTransparentWeak);
}

.hint {
	grid-column: 1 / -1;
	display: flex;
	align-items: flex-start;
	gap: 5px;
	margin: 0;
	margin-top: 2px;
	font-size: .8em;
	line-height: 1.45;
	color: var(--MI_THEME-fgTransparentWeak);

	> i {
		flex: none;
		color: var(--MI_THEME-accent);
	}
}

.contextText {
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 1;
	overflow: hidden;
	font-size: 1em;
	line-height: 1.4;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}

.contextLinks {
	display: flex;
	flex-direction: column;
	gap: 1px;
	min-width: 0;
}

.contextLink {
	font-size: .875em;
	line-height: 1.4;
	overflow-wrap: anywhere;
}

.section {
	display: flex;
	flex-direction: column;
	gap: 7px;
	min-width: 0;
}

.headingRow {
	display: flex;
	align-items: center;
	gap: 6px;
	min-width: 0;
}

.headingMark {
	flex: none;
	width: 3px;
	height: 14px;
	border-radius: 999px;
	background: linear-gradient(to bottom, var(--MI_THEME-accent), color-mix(in srgb, var(--MI_THEME-accent) 45%, transparent));
}

.heading {
	margin: 0;
	font-size: .92em;
	font-weight: 700;
	line-height: 1.4;
}

.reasons {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 6px;
	min-width: 0;
	margin: 0;
	padding: 0;
	border: 0;

	&:disabled .reason {
		cursor: default;
		opacity: 0.6;
	}
}

.reason {
	--reason-color: var(--MI_THEME-accent);

	position: relative;
	display: flex;
	align-items: center;
	justify-content: flex-start;
	gap: 7px;
	min-width: 0;
	min-height: 44px;
	box-sizing: border-box;
	padding: 6px 8px;
	border: 1px solid color-mix(in srgb, var(--reason-color) 20%, var(--MI_THEME-inputBorder));
	border-radius: var(--MI-radius);
	background: color-mix(in srgb, var(--reason-color) 3%, var(--MI_THEME-panel));
	color: var(--MI_THEME-fg);
	font-size: .95em;
	line-height: 1.4;
	text-align: left;
	cursor: pointer;
	transition: background-color .15s ease-out, border-color .15s ease-out, box-shadow .15s ease-out;

	@media (prefers-reduced-motion: reduce) {
		transition: none;
	}

	&:has(.radio:enabled):hover {
		border-color: color-mix(in srgb, var(--reason-color) 48%, var(--MI_THEME-inputBorder));
		background: color-mix(in srgb, var(--reason-color) 7%, var(--MI_THEME-panel));
	}

	&:has(.radio:focus-visible) {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: 2px;
	}
}

.reason[data-reason='spam'] {
	--reason-color: var(--MI_THEME-accent);
}

.reason[data-reason='scam'] {
	--reason-color: var(--MI_THEME-warn);
}

.reason[data-reason='sexualContent'] {
	--reason-color: color-mix(in srgb, var(--MI_THEME-accent) 55%, var(--MI_THEME-success));
}

.reason[data-reason='harassment'] {
	--reason-color: var(--MI_THEME-error);
}

.reason[data-reason='privacyViolation'] {
	--reason-color: color-mix(in srgb, var(--MI_THEME-accent) 48%, var(--MI_THEME-warn));
}

.reason[data-reason='other'] {
	--reason-color: var(--MI_THEME-fgTransparent);
}

.reasonSelected {
	border-color: var(--reason-color);
	color: var(--MI_THEME-fg);
	box-shadow:
		inset 0 0 0 1px color-mix(in srgb, var(--reason-color) 35%, transparent),
		0 2px 8px color-mix(in srgb, var(--reason-color) 16%, transparent);

	&, &:has(.radio:enabled):hover {
		background: color-mix(in srgb, var(--reason-color) 13%, var(--MI_THEME-panel));
	}

	.reasonIcon {
		background: var(--reason-color);
		color: var(--MI_THEME-fgOnAccent);
	}
}

.reasonIcon {
	flex: none;
	display: grid;
	place-items: center;
	width: 24px;
	height: 24px;
	border-radius: 50%;
	background: color-mix(in srgb, var(--reason-color) 12%, var(--MI_THEME-panel));
	color: var(--reason-color);
	font-size: 14px;
	transition: background-color .15s ease-out, color .15s ease-out;
}

.reasonText {
	flex: 1;
	min-width: 0;
	overflow-wrap: anywhere;
}

.radio {
	position: absolute;
	width: 1px;
	height: 1px;
	margin: 0;
	opacity: 0;
}

.detailField {
	position: relative;
}

.detail {
	@include input.field;
	display: block;
	width: 100%;
	box-sizing: border-box;
	min-height: 88px;
	padding: 8px 10px 24px;
	border-radius: var(--MI-radius);
	font: inherit;
	color: var(--MI_THEME-fg);
	resize: none;
}

.footerActions {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
}

@media (max-width: 420px) {
	.body {
		padding: 8px 12px 12px;
	}

	.summary {
		gap: 6px 8px;
		padding: 8px;
	}

	.summaryLead {
		width: 28px;
		height: 28px;
		font-size: 15px;
	}

	.reasons {
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 5px;
	}
	.reason {
		gap: 7px;
		padding: 6px 7px;
	}
	.reasonIcon {
		width: 22px;
		height: 22px;
	}
}

@media (prefers-reduced-motion: reduce) {
	.reasonIcon { transition: none; }
}
</style>
