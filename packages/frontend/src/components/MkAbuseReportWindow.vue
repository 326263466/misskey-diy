<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkWindow ref="uiWindow" :initialWidth="460" :initialHeight="560" :canResize="true" @closed="emit('closed')">
	<template #header>
		<i class="ti ti-exclamation-circle" style="margin-right: 0.5em;"></i>
		<I18n :src="i18n.ts.reportAbuseOf" tag="span" :class="$style.title">
			<template #name>
				<MkAcct :user="user"/>
			</template>
		</I18n>
	</template>
	<div :class="$style.root">
		<div :class="$style.body">
			<div :class="$style.label">{{ i18n.ts._abuseReport.selectReason }}</div>
			<div :class="$style.reasons">
				<button
					v-for="option in reasons"
					:key="option"
					class="_button"
					:class="[$style.reason, { [$style.reasonSelected]: reason === option }]"
					:aria-pressed="reason === option"
					@click="reason = option"
				>{{ option }}</button>
			</div>
			<MkTextarea v-model="detail" :class="$style.detail" :placeholder="i18n.ts.fillAbuseReportDescription"/>
			<MkButton primary full :disabled="reason == null" @click="send">{{ i18n.ts.send }}</MkButton>
		</div>
	</div>
</MkWindow>
</template>

<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import MkWindow from '@/components/MkWindow.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkButton from '@/components/MkButton.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	user: Misskey.entities.UserLite;
	initialComment?: string;
}>();

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const uiWindow = useTemplateRef('uiWindow');
const reason = ref<string | null>(null);
const detail = ref(props.initialComment ?? '');

const reasons = computed(() => [
	i18n.ts._abuseReport._reasons.sexualContent,
	i18n.ts._abuseReport._reasons.spam,
	i18n.ts._abuseReport._reasons.scam,
	i18n.ts._abuseReport._reasons.sensitivePolitics,
	i18n.ts._abuseReport._reasons.harassment,
	i18n.ts._abuseReport._reasons.hateSpeech,
	i18n.ts._abuseReport._reasons.inciting,
	i18n.ts._abuseReport._reasons.privacyViolation,
	i18n.ts._abuseReport._reasons.impersonation,
	i18n.ts._abuseReport._reasons.copyrightViolation,
	i18n.ts._abuseReport._reasons.other,
]);

function send() {
	if (reason.value == null) return;

	// モデレーターは comment だけを読むので、選んだ理由を先頭に置く
	const comment = detail.value.length > 0 ? `${reason.value}\n${detail.value}` : reason.value;

	os.apiWithDialog('users/report-abuse', {
		userId: props.user.id,
		comment,
	}, undefined).then(() => {
		os.alert({
			type: 'success',
			text: i18n.ts.abuseReported,
		});
		uiWindow.value?.close();
		emit('closed');
	});
}
</script>

<style lang="scss" module>
// ウィンドウのヘッダは既定で太字なので、この通報ウィンドウだけ本文と同じ太さに戻す
.title {
	font-size: 1.1em;
	font-weight: normal;
}

.root {
	border-top: solid 1px var(--MI_THEME-divider);
}

.body {
	padding: 16px 20px 20px;
}

.label {
	margin-bottom: 10px;
	font-size: 0.9em;
	user-select: none;
}

// 2列グリッド。文字数の違う選択肢でも幅が揃い、行ごとのギザギザが出ない
.reasons {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.reason {
	padding: 10px 12px;
	font-size: 0.9em;
	line-height: 1.3;
	text-align: center;
	border-radius: 6px;
	background: var(--MI_THEME-buttonBg);
	transition: background 0.2s, color 0.2s;

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
	}
}

.reasonSelected {
	&, &:hover {
		background: var(--MI_THEME-accentedBg);
		color: var(--MI_THEME-accent);
		box-shadow: 0 0 0 1px var(--MI_THEME-accent) inset;
	}
}

.detail {
	margin: 16px 0;
}
</style>
