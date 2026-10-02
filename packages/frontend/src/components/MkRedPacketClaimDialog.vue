<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow ref="dialogEl" :width="400" :height="620" autoHeight @close="dialogEl?.close()" @esc="dialogEl?.close()" @closed="emit('closed')">
	<template #header>{{ i18n.ts._redPacket.title }}</template>
	<div v-if="canClaim && !showDetails" :class="$style.envelope">
		<i class="ti ti-gift" :class="$style.gift" aria-hidden="true"></i>
		<strong :class="$style.greeting">{{ packet.message || i18n.ts._redPacket.defaultMessage }}</strong>
		<span>{{ stateLabel }}</span>
		<button type="button" class="_button" :class="$style.open" :aria-label="i18n.ts._redPacket.claim" :disabled="loading || claiming || !details" @click="claim"><MkLoading v-if="loading || claiming" :em="true"/><span v-else>{{ i18n.ts.open }}</span></button>
		<button type="button" class="_textButton" @click="showDetails = true">{{ i18n.ts.details }} <i class="ti ti-chevron-right" aria-hidden="true"></i></button>
		<p v-if="error" role="alert">{{ error }} <button type="button" class="_textButton" :disabled="loading || claiming" @click="load">{{ i18n.ts.retry }}</button></p>
	</div>
	<template v-else>
		<MkRedPacketCover :imageUrl="packet.coverUrl" :message="packet.message"><span>{{ stateLabel }}</span></MkRedPacketCover>
		<div :class="$style.details" class="_gaps">
			<p :class="$style.summary">{{ i18n.ts._redPacket.audience }}: {{ packet.audience === 'room' ? i18n.ts._chatRedPacket.audience : packet.audience === 'public' ? i18n.ts._redPacket.publicAudience : i18n.ts._redPacket.selectedAudience }}</p>
			<p v-if="packet.claimedCoins != null" :class="$style.received" role="status">{{ i18n.tsx._redPacket.receivedCoins({ coins: packet.claimedCoins }) }}</p>
			<p :class="$style.summary">{{ i18n.tsx._redPacket.progress({ claimed: packet.count - packet.remainingCount, count: packet.count, coins: packet.totalCoins }) }}</p>
			<p :class="$style.summary">{{ i18n.ts._redPacket.expiresAt }} <MkTime :time="packet.expiresAt" mode="detail"/></p>
			<p v-if="!$i" :class="$style.summary">{{ i18n.ts._redPacket.signinRequired }}</p>
			<p v-else-if="(packet.senderId ?? authorId) === $i.id" :class="$style.summary">{{ i18n.ts._redPacket.ownPacket }}</p>
			<MkLoading v-if="loading"/>
			<p v-if="error" role="alert" :class="$style.error">{{ error }} <button type="button" class="_textButton" :disabled="loading || claiming" @click="load">{{ i18n.ts.retry }}</button></p>
			<template v-if="details">
				<div :class="$style.listHeading"><strong>{{ i18n.ts._redPacket.claims }}</strong><button type="button" class="_textButton" :disabled="loading || claiming" @click="load">{{ i18n.ts.reload }}</button></div>
				<p v-if="details.claims.length === 0" :class="$style.summary">{{ i18n.ts._redPacket.noClaims }}</p>
				<ul v-else :class="$style.claims"><li v-for="entry in details.claims" :key="entry.id" :class="$style.claim"><MkAvatar v-if="entry.user" :user="entry.user" :class="$style.avatar"/><span :class="$style.claimUser"><MkUserName v-if="entry.user" :user="entry.user"/><span v-else>{{ i18n.ts._redPacket.deletedUser }}</span><MkTime :time="entry.createdAt"/></span><strong>{{ i18n.tsx._redPacket.coins({ coins: entry.coins }) }}</strong></li></ul>
			</template>
			<MkA v-if="$i" to="/settings/wallet" class="_link" @click="openHistory">{{ i18n.ts._redPacket.history }}</MkA>
			<MkButton v-if="canClaim" primary :disabled="loading || claiming || !details" :wait="claiming" @click="claim">{{ i18n.ts._redPacket.claim }}</MkButton>
		</div>
	</template>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref, watch, useTemplateRef } from 'vue';
import type { entities } from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkRedPacketCover from '@/components/MkRedPacketCover.vue';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { redPacketError } from '@/utility/red-packet.js';

const props = defineProps<{ redPacketId: string; authorId: string; redPacket: entities.RedPacketsCreateResponse }>();
const emit = defineEmits<{ (event: 'claimed'): void; (event: 'updated', packet: entities.RedPacketsShowResponse): void; (event: 'closed'): void }>();
const dialogEl = useTemplateRef('dialogEl');
const packet = ref(props.redPacket);
const details = ref<entities.RedPacketsShowResponse | null>(null);
const showDetails = ref(false);
const loading = ref(false);
const claiming = ref(false);
const error = ref('');
const now = ref(Date.now());
let timer: number | undefined;
let request = 0;
watch(() => props.redPacket, value => { packet.value = value; });
const state = computed(() => packet.value.status === 'active' && Date.parse(packet.value.expiresAt) <= now.value ? 'expired' : packet.value.status);
const stateLabel = computed(() => i18n.ts._redPacket[state.value]);
const canClaim = computed(() => $i && !$i.isSuspended && (packet.value.senderId ?? props.authorId) !== $i.id && state.value === 'active' && packet.value.claimedCoins == null);

function openHistory(event: MouseEvent) {
	if (event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) dialogEl.value?.close();
}

async function load() {
	if (!$i || loading.value || claiming.value) return;
	const sequence = ++request;
	loading.value = true;
	error.value = '';
	try {
		const result = await misskeyApi('red-packets/show', { redPacketId: props.redPacketId });
		if (sequence !== request) return;
		details.value = result;
		packet.value = result;
		emit('updated', result);
		now.value = Date.now();
	} catch (err) {
		if (sequence === request) error.value = redPacketError(err);
	} finally {
		if (sequence === request) loading.value = false;
	}
}

async function claim() {
	if (!canClaim.value || claiming.value || loading.value || !details.value) return;
	claiming.value = true;
	error.value = '';
	try {
		const result = await misskeyApi('red-packets/claim', { redPacketId: props.redPacketId });
		details.value = result;
		packet.value = result;
		emit('updated', result);
		showDetails.value = true;
		emit('claimed');
	} catch (err) {
		error.value = redPacketError(err);
		// 领取成功也可能丢失响应，重试前先核对到账状态。
		try {
			const result = await misskeyApi('red-packets/show', { redPacketId: props.redPacketId });
			details.value = result;
			packet.value = result;
			emit('updated', result);
			if (result.claimedCoins != null) {
				error.value = '';
				emit('claimed');
			}
		} catch { /* 保留原错误，允许重试。 */ }
	} finally {
		claiming.value = false;
		now.value = Date.now();
	}
}

function scheduleExpiry() {
	window.clearTimeout(timer);
	now.value = Date.now();
	const remaining = Date.parse(packet.value.expiresAt) - now.value;
	if (packet.value.status === 'active' && remaining > 0) timer = window.setTimeout(() => { now.value = Date.now(); }, Math.min(remaining + 1, 2147483647));
}

watch(() => [packet.value.expiresAt, packet.value.status], scheduleExpiry);
onMounted(() => { scheduleExpiry(); void load(); });
onUnmounted(() => { window.clearTimeout(timer); request++; });
</script>

<style lang="scss" module>
.envelope {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 24px;
	padding: 36px var(--MI-cardPadding);
	color: var(--MI-redPacketGold);
	background: linear-gradient(145deg, var(--MI-redPacketStart), var(--MI-redPacketEnd));
	text-align: center;
}

.envelope :global(._textButton) {
	color: inherit;
}

.gift {
	font-size: 48px;
}

.greeting {
	font-size: 1.25em;
	line-height: 1.5;
	overflow-wrap: anywhere;
}

.envelope .open {
	display: grid;
	place-items: center;
	width: 88px;
	height: 88px;
	margin: 12px 0;
	border-radius: 50%;
	background: var(--MI-redPacketGold);
	color: var(--MI-redPacketEnd);
	font-size: 1.3em;
	font-weight: bold;
}

.open:focus-visible {
	outline: 2px solid currentColor;
	outline-offset: 4px;
}

.details {
	padding: var(--MI-cardPadding);
}

.summary, .received {
	margin: 0;
	font-size: .9em;
	line-height: 1.6;
	color: var(--MI_THEME-fgTransparentWeak);
}

.received {
	color: var(--MI_THEME-fg);
	font-weight: bold;
	font-size: 1.4em;
	text-align: center;
}

.listHeading {
	display: flex;
	justify-content: space-between;
	gap: var(--MI-cardPadding);
}

.claims {
	list-style: none;
	padding: 0;
	margin: 0;
}

.claim {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 10px 0;
	border-top: 1px solid var(--MI_THEME-divider);
	font-size: .85em;
}

.avatar {
	width: 32px;
	height: 32px;
	flex-shrink: 0;
}

.claimUser {
	min-width: 0;
	flex: 1;
	display: flex;
	flex-direction: column;
	gap: 4px;
	overflow-wrap: anywhere;
}

.claimUser time {
	color: var(--MI_THEME-fgTransparentWeak);
}

.error {
	color: var(--MI_THEME-error);
	margin: 0;
}

</style>
