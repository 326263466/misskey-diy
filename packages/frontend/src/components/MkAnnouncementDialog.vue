<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal ref="modal" :zPriority="'middle'" :preferType="'dialog'" :closeOnBackdrop="hasReachedBottom && !announcement.needConfirmationToRead" @click="ok" @closed="emit('closed')">
	<div ref="rootEl" :class="$style.root" @scroll.passive="checkReachedBottom">
		<div :class="$style.header">
			<i v-if="announcement.icon === 'info'" :class="$style.icon" class="ti ti-info-circle" aria-hidden="true"></i>
			<i v-else-if="announcement.icon === 'warning'" :class="$style.icon" class="ti ti-alert-triangle" style="color: var(--MI_THEME-warn);" aria-hidden="true"></i>
			<i v-else-if="announcement.icon === 'error'" :class="$style.icon" class="ti ti-circle-x" style="color: var(--MI_THEME-error);" aria-hidden="true"></i>
			<i v-else-if="announcement.icon === 'success'" :class="$style.icon" class="ti ti-check" style="color: var(--MI_THEME-success);" aria-hidden="true"></i>
			<span :class="$style.title"><Mfm :text="announcement.title" :plain="true"/></span>
		</div>
		<div :class="$style.text"><Mfm :text="announcement.text"/></div>
		<div :class="$style.footer">
			<MkButton
				primary
				full
				:disabled="!hasReachedBottom"
				@click="ok"
			>{{ hasReachedBottom ? i18n.ts.close : i18n.ts.scrollToClose }}</MkButton>
		</div>
	</div>
</MkModal>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, ref, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import MkModal from '@/components/MkModal.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import { updateCurrentAccountPartial } from '@/accounts.js';

const props = defineProps<{
	announcement: Misskey.entities.Announcement;
}>();

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const rootEl = useTemplateRef('rootEl');
const modal = useTemplateRef('modal');

async function ok() {
	if (props.announcement.needConfirmationToRead) {
		const confirm = await os.confirm({
			type: 'question',
			title: i18n.ts._announcement.readConfirmTitle,
			text: i18n.tsx._announcement.readConfirmText({ title: props.announcement.title }),
		});
		if (confirm.canceled) return;
	}

	modal.value?.close();
	misskeyApi('i/read-announcement', { announcementId: props.announcement.id });
	updateCurrentAccountPartial({
		unreadAnnouncements: $i!.unreadAnnouncements.filter(a => a.id !== props.announcement.id),
	});
}

const hasReachedBottom = ref(false);
const resizeObserver = new ResizeObserver(checkReachedBottom);

function checkReachedBottom() {
	const root = rootEl.value;
	if (root && root.scrollTop + root.clientHeight >= root.scrollHeight - 1) {
		hasReachedBottom.value = true;
	}
}

onMounted(() => {
	checkReachedBottom();
	if (rootEl.value) resizeObserver.observe(rootEl.value);
});

onUnmounted(() => resizeObserver.disconnect());
</script>

<style lang="scss" module>
@use '@/styles/window-header.scss' as window-header;

.root {
	margin: auto;
	position: relative;
	padding: var(--MI-cardPadding) var(--MI-cardPadding) 0;
	min-width: min(320px, 100%);
	max-width: min(480px, 100%);
	max-height: 100%;
	overflow-y: auto;
	overflow-x: hidden;
	box-sizing: border-box;
	background: var(--MI_THEME-panel);
	border-radius: var(--MI-radius);
}

.header {
	@include window-header.title;
	font-size: 120%;
}

.icon {
	@include window-header.icon;
}

.title {
	min-width: 0;
	overflow-wrap: anywhere;
	font-weight: bold;
}

.text {
	margin: 1em 0;
}

.footer {
	position: sticky;
	bottom: 0;
	left: 0;
	backdrop-filter: var(--MI-blur, blur(15px));
	background: var(--MI_THEME-panel);
	border-top: var(--MI-divider);
	margin: 0 calc(-1 * var(--MI-cardPadding));
	padding: var(--MI-cardPadding);
}
</style>
