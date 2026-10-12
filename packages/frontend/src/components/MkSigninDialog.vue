<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal
	ref="modal"
	:preferType="'dialog'"
	:closeOnBackdrop="false"
	@click="onClose"
	@esc="onClose"
	@closed="emit('closed')"
>
	<div :class="$style.root">
		<div :class="$style.header">
			<div :class="$style.headerText">
				<i class="ti ti-login-2" :class="$style.headerIcon" aria-hidden="true"></i>
				<span :class="$style.headerLabel">{{ i18n.ts.login }}</span>
			</div>
			<button :class="$style.closeButton" class="_button" :aria-label="i18n.ts.close" @click="onClose"><i class="ti ti-x" aria-hidden="true"></i></button>
		</div>
		<div :class="$style.content">
			<MkSignin :autoSet="autoSet" :message="message" :openOnRemote="openOnRemote" :initialUsername="initialUsername" @login="onLogin"/>
		</div>
	</div>
</MkModal>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import { useTemplateRef } from 'vue';
import type { OpenOnRemoteOptions } from '@/utility/please-login.js';
import MkSignin from '@/components/MkSignin.vue';
import MkModal from '@/components/MkModal.vue';
import { i18n } from '@/i18n.js';

withDefaults(defineProps<{
	autoSet?: boolean;
	message?: string,
	openOnRemote?: OpenOnRemoteOptions,
	initialUsername?: string;
}>(), {
	autoSet: false,
	message: '',
	openOnRemote: undefined,
	initialUsername: undefined,
});

const emit = defineEmits<{
	(ev: 'done', v: Misskey.entities.SigninFlowResponse & { finished: true }): void;
	(ev: 'closed'): void;
	(ev: 'cancelled'): void;
}>();

const modal = useTemplateRef('modal');

function onClose() {
	emit('cancelled');
	if (modal.value) modal.value.close();
}

function onLogin(res: Misskey.entities.SigninFlowResponse & { finished: true }) {
	emit('done', res);
	if (modal.value) modal.value.close();
}
</script>

<style lang="scss" module>
@use '@/styles/window-header.scss' as window-header;

.root {
	overflow: auto;
	margin: auto;
	position: relative;
	width: 100%;
	max-width: 400px;
	height: 100%;
	max-height: 450px;
	box-sizing: border-box;
	background: var(--MI_THEME-panel);
	border-radius: var(--MI-radius);
}

.header {
	position: sticky;
	top: 0;
	left: 0;
	width: 100%;
	height: 50px;
	box-sizing: border-box;
	display: flex;
	align-items: center;
	font-weight: bold;
	backdrop-filter: var(--MI-blur, blur(15px));
	background: color(from var(--MI_THEME-bg) srgb r g b / 0.5);
	z-index: 1;
}

.headerText {
	@include window-header.title;
	flex: 1;
	padding: 0 20px;
	box-sizing: border-box;
}

.headerIcon {
	@include window-header.icon;
}

.headerLabel {
	@include window-header.label;
}

.closeButton {
	@include window-header.control;
	margin-left: auto;
	flex-shrink: 0;
	width: 50px;
	height: 50px;
	font-size: 16px;
}

.content {
	padding: var(--MI-cardPadding, 18px);
	box-sizing: border-box;
}
</style>
