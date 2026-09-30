<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal ref="modal" preferType="dialog" :zPriority="'middle'" @click="modal?.close()" @closed="emit('closed')">
	<div :class="$style.root" role="dialog" aria-modal="true" :aria-label="updateTitle">
		<div :class="$style.title"><MkSparkle>{{ updateTitle }}</MkSparkle></div>
		<div :class="$style.version">✨{{ version }}🚀</div>
		<div v-if="isBeta" :class="$style.beta">{{ i18n.ts.thankYouForTestingBeta }}</div>
		<MkButton full :aria-expanded="showReleaseNotes" @click="showReleaseNotes = !showReleaseNotes">{{ i18n.ts.whatIsNew }}</MkButton>
		<div v-if="showReleaseNotes" :class="$style.releaseNotes" class="_selectable" role="region" :aria-label="i18n.ts.whatIsNew" tabindex="0">
			<ul v-if="releaseNotes.length" :class="$style.releaseList">
				<li v-for="(note, index) in releaseNotes" :key="index">{{ note }}</li>
			</ul>
			<p v-else>{{ i18n.ts.nothing }}</p>
		</div>
		<MkButton :class="$style.gotIt" primary full @click="modal?.close()">{{ i18n.ts.gotIt }}</MkButton>
	</div>
</MkModal>
</template>

<script lang="ts" setup>
import { onMounted, ref, useTemplateRef } from 'vue';
import { version } from '@@/js/config.js';
import bundledReleaseNotes from '../../../../release-notes.json';
import MkModal from '@/components/MkModal.vue';
import MkButton from '@/components/MkButton.vue';
import MkSparkle from '@/components/MkSparkle.vue';
import { i18n } from '@/i18n.js';
import { confetti } from '@/utility/confetti.js';

const modal = useTemplateRef('modal');
const updateTitle = `${i18n.ts.update}${i18n.ts.done}`;
const showReleaseNotes = ref(false);
const releaseNotes = (bundledReleaseNotes as Record<string, string[]>)[version] ?? [];

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const isBeta = version.includes('-beta') || version.includes('-alpha') || version.includes('-rc');

onMounted(() => {
	confetti({
		duration: 1000 * 3,
	});
});
</script>

<style lang="scss" module>
.root {
	margin: auto;
	position: relative;
	padding: 32px;
	width: min(480px, calc(100vw - 32px));
	max-height: calc(100dvh - 32px);
	overflow-y: auto;
	box-sizing: border-box;
	text-align: center;
	background: var(--MI_THEME-panel);
	border-radius: var(--MI-radius);
}

.title {
	font-weight: bold;
}

.version {
	margin: 1em 0;
}

.beta {
	margin: 1em 0;
}

.gotIt {
	margin: 8px 0 0 0;
}

.releaseNotes {
	margin-top: 16px;
	padding: 12px 16px;
	max-height: 40dvh;
	overflow-y: auto;
	scrollbar-gutter: stable;
	text-align: start;
	line-height: 1.7;
	overflow-wrap: anywhere;
	background: var(--MI_THEME-bg);
	border-radius: var(--MI-radius);
}

.releaseList {
	margin: 0;
	padding-inline-start: 1.2em;

	li + li {
		margin-top: 8px;
	}
}
</style>
