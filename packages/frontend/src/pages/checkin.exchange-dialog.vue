<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal ref="modal" preferType="dialog" zPriority="high" :returnFocusTo="returnFocusTo" @click="finish(false)" @esc="finish(false)" @closed="emit('closed')">
	<section class="_panel" :class="$style.root" role="dialog" aria-modal="true" :aria-labelledby="titleId" :aria-describedby="costId">
		<header :class="$style.header">
			<h2 :id="titleId">{{ i18n.ts._checkin.exchangeCard }}</h2>
			<button type="button" class="_button" :class="$style.close" :aria-label="i18n.ts.close" @click="finish(false)"><i class="ti ti-x" aria-hidden="true"></i></button>
		</header>
		<div :class="$style.body">
			<div :class="$style.ticket">
				<div :class="$style.ticketContent">
					<i class="ti ti-ticket" :class="$style.ticketIcon" aria-hidden="true"></i>
					<div :class="$style.ticketDetails"><strong>{{ i18n.tsx._checkin.exchangeItem({ n: 1 }) }}</strong><p>{{ i18n.ts._checkin.exchangeMonthlyHint }}</p></div>
				</div>
				<p :id="costId" :class="$style.cost" :title="i18n.ts._checkin.exchangeCostLabel"><strong>{{ cost }} <small>{{ i18n.ts._checkin.points }}</small></strong></p>
			</div>
			<p :class="[$style.balance, { [$style.insufficient]: !canConfirm }]">{{ canConfirm ? i18n.tsx._checkin.exchangeBalance({ points }) : i18n.tsx._checkin.exchangeInsufficient({ points: Math.max(0, Math.round((cost - points) * 100) / 100) }) }}</p>
			<footer :class="$style.actions">
				<MkButton :class="$style.action" autofocus @click="finish(false)">{{ i18n.ts.cancel }}</MkButton>
				<MkButton :class="$style.action" primary :disabled="!canConfirm" @click="finish(true)">{{ i18n.ts._checkin.exchangeNow }}</MkButton>
			</footer>
		</div>
	</section>
</MkModal>
</template>

<script lang="ts" setup>
import { useId, useTemplateRef } from 'vue';
import MkModal from '@/components/MkModal.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	cost: number;
	points: number;
	canConfirm: boolean;
	returnFocusTo?: HTMLElement;
}>();

const emit = defineEmits<{
	(ev: 'done', confirmed: boolean): void;
	(ev: 'closed'): void;
}>();

const modal = useTemplateRef('modal');
const titleId = useId();
const costId = useId();
let settled = false;

function finish(confirmed: boolean) {
	if (settled || (confirmed && !props.canConfirm)) return;
	settled = true;
	emit('done', confirmed);
	modal.value?.close();
}
</script>

<style lang="scss" module>
.root {
	--MI_THEME-accent: var(--MI_THEME-link);
	--exchange-muted: color-mix(in srgb, var(--MI_THEME-fg) 65%, var(--MI_THEME-panel));
	--exchange-gold: color-mix(in srgb, var(--MI-rankingGold) 75%, var(--MI_THEME-fg));
	--exchange-accent: color-mix(in srgb, var(--MI_THEME-link) 45%, var(--MI_THEME-renote));

	width: 360px;
	max-width: 100%;
	margin: auto;
	padding: 20px;
	overflow: clip;
	box-sizing: border-box;
}

.header {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	align-items: center;
	gap: 10px;
	margin-bottom: 14px;
}

.header h2 {
	margin: 0;
	font-size: 1.15em;
	font-weight: 700;
}

.close {
	display: grid;
	place-items: center;
	flex-shrink: 0;
	width: 32px;
	height: 32px;
	border-radius: var(--MI-radius);
	color: var(--exchange-muted);

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
	}
}

.body {
	min-width: 0;
}

.ticket {
	position: relative;
	display: grid;
	grid-template-columns: minmax(0, 1fr) 82px;
	min-height: 84px;
	border-radius: var(--MI-cardRadius);
	background: var(--exchange-accent);
	background: linear-gradient(120deg, hsl(from var(--exchange-accent) h s 22%), hsl(from var(--exchange-accent) h s 28%));

	&::before, &::after {
		content: '';
		position: absolute;
		inset-inline-end: 77px;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--MI_THEME-panel);
	}

	&::before {
		top: -5px;
	}

	&::after {
		bottom: -5px;
	}
}

.ticketContent {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr);
	align-items: center;
	gap: 12px;
	padding: 16px;
	color: var(--MI_THEME-fgOnAccent);
}

.ticketIcon {
	font-size: 2em;
}

.ticketDetails > strong {
	font-size: 1.1em;
	font-weight: 600;
}

.ticketDetails p {
	margin: 4px 0 0;
	font-size: .78em;
	opacity: .9;
}

.cost {
	display: grid;
	place-items: center;
	margin: 0;
	padding: 10px;
	border-inline-start: 1px dashed color-mix(in srgb, var(--MI-rankingGold) 40%, transparent);
	border-radius: 0 var(--MI-cardRadius) var(--MI-cardRadius) 0;
	color: var(--exchange-gold);
	background: linear-gradient(130deg, color-mix(in srgb, var(--MI-rankingGold) 12%, var(--MI_THEME-panel)), color-mix(in srgb, var(--MI-rankingGold) 24%, var(--MI_THEME-panel)));
	white-space: nowrap;
	text-align: center;
}

.cost strong {
	font-size: 1.65em;
	font-variant-numeric: tabular-nums;
	font-weight: 650;
}

.cost small {
	display: block;
	margin-top: 2px;
	color: var(--MI_THEME-fg);
	font-size: .5em;
	font-weight: 400;
}

.balance {
	margin: 12px 0 18px;
	color: var(--exchange-muted);
	font-size: .82em;
	line-height: 1.6;
}

.balance.insufficient {
	color: var(--MI_THEME-error);
}

.actions {
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
	gap: 10px;
}

.action {
	width: 100%;
	min-width: 0;
	min-height: 44px;
	border-radius: var(--MI-radius);
	font-size: .95em;
}

@media (max-width: 360px) {
	.root {
		padding: 16px;
	}

	.ticketContent {
		gap: 10px;
		padding: 14px 12px;
	}
}
</style>
