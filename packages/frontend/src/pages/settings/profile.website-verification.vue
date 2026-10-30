<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="dialog"
	:width="520"
	:height="500"
	autoHeight
	@close="dialog?.close()"
	@esc="dialog?.close()"
	@closed="emit('closed')"
>
	<template #header>{{ i18n.ts._profile.websiteVerification }}</template>
	<div :class="$style.body" class="_selectable">
		<ol :class="$style.steps">
			<li>
				<div>{{ i18n.ts._profile.verifiedLinkDescription }}</div>
				<MkCode :class="$style.code" :code="verificationCode" lang="html" scrollable/>
			</li>
			<li>{{ i18n.ts._profile.verifiedLinkAction }}</li>
		</ol>
		<p :class="$style.note">{{ i18n.ts._profile.websiteVerificationNote }}</p>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { computed, useTemplateRef } from 'vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkCode from '@/components/MkCode.vue';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	profileUrl: string;
}>();

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const dialog = useTemplateRef('dialog');
const verificationCode = computed(() => i18n.tsx._profile.websiteVerificationCode({ url: props.profileUrl }));
</script>

<style lang="scss" module>
.body {
	padding: var(--MI-cardPadding);
	line-height: 1.6;
}

.steps {
	display: grid;
	gap: 18px;
	margin: 0;
	padding-inline-start: 24px;

	> li::marker {
		font-weight: bold;
	}
}

.code {
	min-width: 0;
	margin-top: 12px;
}

.note {
	margin: 18px 0 0;
	font-size: .9em;
	color: var(--MI_THEME-fgTransparentWeak);
}
</style>
