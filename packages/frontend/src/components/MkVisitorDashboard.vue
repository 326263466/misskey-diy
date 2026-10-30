<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-if="instance" :class="$style.root">
	<div :class="[$style.main, $style.panel]">
		<div :class="$style.mainFg">
			<div :class="$style.mainHeader">
				<img :src="instance.iconUrl || '/favicon.ico'" alt="" :class="$style.mainIcon"/>
				<h1 :class="$style.mainTitle">
					<MkA to="/">{{ instanceName }}</MkA>
				</h1>
			</div>
			<div :class="$style.mainAbout">
				<div v-html="instance.description || i18n.ts.headlineMisskey"></div>
			</div>
			<div v-if="instance.disableRegistration" :class="$style.mainWarn" class="_gaps_s">
				<MkInfo v-if="instance.disableRegistration" warn>{{ i18n.ts.invitationRequiredToRegister }}</MkInfo>
			</div>
			<div :class="$style.mainActions">
				<MkButton :class="$style.mainAction" full rounded gradate large data-testid="signup" @click="signup()">{{ i18n.ts.joinThisServer }}</MkButton>
				<MkButton :class="[$style.mainAction, $style.mainActionSub]" full rounded large data-testid="signin" @click="signin()">{{ i18n.ts.login }}</MkButton>
			</div>
		</div>
	</div>
	<div v-if="stats && instance.clientOptions.showActivitiesForVisitor !== false" :class="$style.stats">
		<div :class="[$style.statsItem, $style.panel]">
			<div :class="$style.statsItemLabel">{{ i18n.ts.users }}</div>
			<div :class="$style.statsItemCount"><MkNumber :value="stats.originalUsersCount"/></div>
		</div>
		<div :class="[$style.statsItem, $style.panel]">
			<div :class="$style.statsItemLabel">{{ i18n.ts.notes }}</div>
			<div :class="$style.statsItemCount"><MkNumber :value="stats.originalNotesCount"/></div>
		</div>
	</div>
	<div v-if="instance.policies.ltlAvailable && instance.clientOptions.showTimelineForVisitor !== false" :class="[$style.tl, $style.panel]">
		<div :class="$style.tlHeader">{{ i18n.ts.letsLookAtTimeline }}</div>
		<div :class="$style.tlBody">
			<MkStreamingNotesTimeline src="local"/>
		</div>
	</div>
	<div v-if="instance.clientOptions.showActivitiesForVisitor !== false" :class="$style.panel">
		<XActiveUsersChart/>
	</div>
</div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import * as Misskey from 'misskey-js';
import { instanceName } from '@@/js/config.js';

import XSigninDialog from '@/components/MkSigninDialog.vue';
import XSignupDialog from '@/components/MkSignupDialog.vue';
import MkButton from '@/components/MkButton.vue';
import MkStreamingNotesTimeline from '@/components/MkStreamingNotesTimeline.vue';
import MkInfo from '@/components/MkInfo.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import MkNumber from '@/components/MkNumber.vue';
import XActiveUsersChart from '@/components/MkVisitorDashboard.ActiveUsersChart.vue';

const stats = ref<Misskey.entities.StatsResponse | null>(null);

if (instance.clientOptions.showActivitiesForVisitor !== false) {
	misskeyApi('stats', {}).then((res) => {
		stats.value = res;
	});
}

function signin() {
	const { dispose } = os.popup(XSigninDialog, {
		autoSet: true,
	}, {
		closed: () => dispose(),
	});
}

function signup() {
	const { dispose } = os.popup(XSignupDialog, {
		autoSet: true,
	}, {
		closed: () => dispose(),
	});
}

</script>

<style lang="scss" module>
@use '@/styles/card-header.scss';

.root {
	position: relative;
	display: flex;
	flex-direction: column;
	gap: 16px;
	padding: 32px 0 0 0;
}

.panel {
	position: relative;
	background: var(--MI_THEME-panel);
	border-radius: var(--MI-radius);
}

.main {
	overflow: clip;
	padding: 36px 32px 32px;
	background: color-mix(in srgb, var(--MI_THEME-panel) 86%, transparent);
	-webkit-backdrop-filter: var(--MI-blur, blur(20px));
	backdrop-filter: var(--MI-blur, blur(20px));
	border: solid 1px color-mix(in srgb, var(--MI_THEME-fg) 8%, transparent);
	border-radius: calc(var(--MI-radius) * 2);
	box-shadow: 0 24px 64px -16px var(--MI_THEME-shadow);

	&::before {
		content: '';
		position: absolute;
		top: -120px;
		left: -60px;
		width: 320px;
		height: 240px;
		background: radial-gradient(closest-side, color-mix(in srgb, var(--MI_THEME-accent) 28%, transparent), transparent);
		pointer-events: none;
	}

	@media (max-width: 450px) {
		padding: 28px 22px 22px;
	}
}

.mainHeader {
	display: flex;
	align-items: center;
	gap: 16px;
}

.mainIcon {
	flex-shrink: 0;
	width: 56px;
	height: 56px;
	object-fit: contain;
	padding: 6px;
	box-sizing: border-box;
	background: var(--MI_THEME-bg);
	border-radius: 16px;
	box-shadow: 0 0 0 1px color-mix(in srgb, var(--MI_THEME-fg) 8%, transparent);
}

.mainFg {
	position: relative;
	z-index: 1;
}

.mainTitle {
	min-width: 0;
	margin: 0;
	font-size: 1.7em;
	line-height: 1.25;
	letter-spacing: 0.02em;
	overflow-wrap: anywhere;
}

.mainAbout {
	margin-top: 20px;
	color: var(--MI_THEME-fgTransparentWeak);
	line-height: 1.7;
}

.mainWarn {
	margin-top: 24px;
}

.mainActions {
	display: flex;
	flex-direction: column;
	gap: 12px;
	margin-top: 32px;
}

.mainActions .mainAction {
	padding-block: 12px;
	font-weight: bold;
	letter-spacing: 0.05em;
}

.mainActions .mainActionSub {
	box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--MI_THEME-fg) 16%, transparent);

	&:not(:hover) {
		background: transparent;
	}
}

.stats {
	display: grid;
	grid-template-columns: 1fr 1fr;
	grid-gap: 16px;
}

.statsItem {
	overflow: clip;
	padding: var(--MI-cardPadding);
}

.statsItemLabel {
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.9em;
}

.statsItemCount {
	font-weight: bold;
	font-size: 1.2em;
	color: var(--MI_THEME-accent);
}

.tl {
	overflow: clip;
}

.tlHeader {
	@include card-header.title;
	padding-inline: 16px;
	border-bottom: var(--MI-divider);
}

.tlBody {
	height: 350px;
	overflow: auto;
	scrollbar-width: none;

	&::-webkit-scrollbar {
		display: none;
	}
}
</style>
