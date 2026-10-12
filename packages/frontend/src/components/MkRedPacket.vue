<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<section :class="$style.root" @click.stop @contextmenu.stop>
	<button type="button" class="_button" :class="$style.card" :data-cover="packet.coverId" aria-haspopup="dialog" :disabled="loading" @click="open">
		<MkRedPacketCover :imageUrl="packet.coverUrl" :message="packet.password || packet.message"><span :class="$style.coverStatus">{{ packet.password ? i18n.ts._redPacket.passwordPacket : '' }} {{ packet.claimedCoins != null ? i18n.ts._redPacket.claimedShort : stateLabel }} <i class="ti ti-chevron-right" aria-hidden="true"></i></span></MkRedPacketCover>
	</button>
</section>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { entities } from 'misskey-js';
import MkRedPacketCover from '@/components/MkRedPacketCover.vue';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { useGlobalEvent } from '@/events.js';

const props = defineProps<{ redPacketId: string; authorId: string; redPacket: entities.RedPacketsCreateResponse; author?: entities.UserLite | null }>();
const emit = defineEmits<{ (event: 'claimed'): void }>();
const packet = ref(props.redPacket);
const loading = ref(false);
useGlobalEvent('redPacketClaimed', id => { if (id === props.redPacketId) void load(); });

let timer: number | undefined;
let active = true;
watch(() => props.redPacket, value => { packet.value = value; });
const state = computed(() => packet.value.status);
const stateLabel = computed(() => i18n.ts._redPacket[state.value]);

async function open() {
	if (loading.value) return;
	if (!$i) { void os.alert({ type: 'info', text: i18n.ts._redPacket.signinRequired }); return; }
	loading.value = true;
	try {
		const { dispose } = await os.popupAsyncWithDialog(import('@/components/MkRedPacketClaimDialog.vue').then(module => module.default), {
			redPacketId: props.redPacketId, authorId: props.authorId, redPacket: packet.value, author: props.author,
		}, {
			updated: result => { if (active) packet.value = result; },
			claimed: () => { if (active) emit('claimed'); },
			closed: () => { loading.value = false; dispose(); },
		});
	} catch { loading.value = false; }
}

async function load() {
	if (!$i || !active) return;
	try {
		const result = await misskeyApi('red-packets/show', { redPacketId: props.redPacketId });
		if (active) packet.value = result;
	} catch { /* 打开详情时可重试获取服务端状态。 */ }
}

function scheduleExpiry() {
	window.clearTimeout(timer);
	if (!['active', 'scheduled'].includes(packet.value.status)) return;
	const boundary = packet.value.status === 'scheduled' ? packet.value.startsAt : packet.value.expiresAt;
	const delay = Date.parse(boundary ?? '') - Date.parse(packet.value.serverTime);
	if (Number.isFinite(delay)) timer = window.setTimeout(() => { void load(); }, Math.min(Math.max(delay + 50, 1000), 2147483647));
}

watch(() => packet.value, scheduleExpiry);
onMounted(() => { scheduleExpiry(); void load(); });
onUnmounted(() => { window.clearTimeout(timer); active = false; });
</script>

<style lang="scss" module>
.card { width: 100%; display: block; padding: 0; text-align: start; }
.coverStatus { font-size: .8em; }
.card:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -3px; }
</style>
