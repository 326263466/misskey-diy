<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<section class="_panel _juejinCard" :class="$style.root" :aria-label="i18n.ts._checkin.dailyCheckin">
	<div :class="$style.message">
		<strong :class="$style.greeting">{{ greeting }}</strong>
		<p :class="$style.description">{{ i18n.ts._checkin.description }}</p>
	</div>
	<MkA v-if="!checkedInToday" to="/checkin" :class="$style.action">{{ i18n.ts._checkin.goCheckin }}</MkA>
	<button v-else ref="actionButton" type="button" class="_button" :class="[$style.action, $style.checkedIn]" @click="showReward">{{ i18n.ts._checkin.checkedIn }}</button>
</section>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, useTemplateRef } from 'vue';
import { useInterval } from '@@/js/use-interval.js';
import { i18n } from '@/i18n.js';
import { useCheckinStatus } from '@/composables/use-checkin-status.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import * as os from '@/os.js';

const MkCheckinSuccessDialog = defineAsyncComponent(() => import('@/components/MkCheckinSuccessDialog.vue'));

const { checkedInToday } = useCheckinStatus();
const actionButton = useTemplateRef<HTMLButtonElement>('actionButton');
let successDialog: { dispose: () => void } | undefined;

// 已签到时再点击：与签到页同样弹出奖励信息（当天奖励以 +1 / 0 补签卡的形式复述）
async function showReward() {
	if (successDialog) return;
	try {
		const result = await misskeyApi('i/checkin-status', {});
		if (!result.checkedInToday) return;
		successDialog = os.popup(MkCheckinSuccessDialog, {
			points: 1,
			consecutiveDays: result.consecutiveDays,
			earnedMakeupCards: 0,
			returnFocusTo: actionButton.value ?? undefined,
		}, {
			closed: () => { successDialog?.dispose(); successDialog = undefined; },
		});
	} catch {
		// 状态获取失败时不弹窗，保持按钮原样
	}
}

const hour = ref(new Date().getHours());
const greeting = computed(() => hour.value < 12
	? i18n.ts._checkin.morningGreeting
	: hour.value < 18 ? i18n.ts._checkin.afternoonGreeting : i18n.ts._checkin.eveningGreeting);

function updateHour() {
	if (window.document.visibilityState !== 'hidden') hour.value = new Date().getHours();
}

useInterval(updateHour, 60_000, { immediate: true, afterMounted: true });
onMounted(() => {
	window.addEventListener('focus', updateHour);
	window.document.addEventListener('visibilitychange', updateHour);
});
onUnmounted(() => {
	window.removeEventListener('focus', updateHour);
	window.document.removeEventListener('visibilitychange', updateHour);
});
</script>

<style lang="scss" module>
.root {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: var(--MI-cardPadding, 18px);
	margin-bottom: var(--MI-margin);
}

.message {
	min-width: 0;
}

.greeting {
	display: block;
	font-size: 16px;
	line-height: 1.5;
}

.description {
	margin: 6px 0 0;
	font-size: 12px;
	line-height: 1.6;
	color: var(--MI_THEME-fgTransparentWeak);
}

.action {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	flex-shrink: 0;
	padding: 8px 12px;
	border-radius: var(--MI-cardRadius);
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	font-size: 13px;
	line-height: 1.5;
	text-align: center;
}

.checkedIn {
	color: var(--MI_THEME-link, var(--MI_THEME-accent));
	background: color-mix(in srgb, var(--MI_THEME-link, var(--MI_THEME-accent)) 10%, var(--MI_THEME-panel));
}
</style>
