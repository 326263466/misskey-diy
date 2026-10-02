<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<section :class="$style.root" data-note-interactive @click.stop @contextmenu.stop>
	<button type="button" class="_button" :class="$style.card" :data-cover="packet.coverId" aria-haspopup="dialog" :disabled="loading" @click="open">
		<MkRedPacketCover :imageUrl="packet.coverUrl" :message="packet.message"><span :class="$style.coverStatus">{{ packet.claimedCoins != null ? i18n.ts._redPacket.claims : stateLabel }} <i class="ti ti-chevron-right" aria-hidden="true"></i></span></MkRedPacketCover>
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

const props = defineProps<{ redPacketId: string; authorId: string; redPacket: entities.RedPacketsCreateResponse }>();
const emit = defineEmits<{ (event: 'claimed'): void }>();
const packet = ref(props.redPacket);
const loading = ref(false);
const now = ref(Date.now());
let timer: number | undefined;
let active = true;
watch(() => props.redPacket, value => { packet.value = value; });
const state = computed(() => packet.value.status === 'active' && Date.parse(packet.value.expiresAt) <= now.value ? 'expired' : packet.value.status);
const stateLabel = computed(() => i18n.ts._redPacket[state.value]);

async function open() {
	if (loading.value) return;
	if (!$i) { void os.alert({ type: 'info', text: i18n.ts._redPacket.signinRequired }); return; }
	loading.value = true;
	try {
		const { dispose } = await os.popupAsyncWithDialog(import('@/components/MkRedPacketClaimDialog.vue').then(module => module.default), {
			redPacketId: props.redPacketId, authorId: props.authorId, redPacket: packet.value,
		}, {
			updated: result => { if (active) packet.value = result; },
			claimed: () => { if (active) emit('claimed'); },
			closed: () => { loading.value = false; dispose(); },
		});
	} catch { loading.value = false; }
}

function scheduleExpiry() {
	window.clearTimeout(timer);
	now.value = Date.now();
	const remaining = Date.parse(packet.value.expiresAt) - now.value;
	if (packet.value.status === 'active' && remaining > 0) timer = window.setTimeout(() => { now.value = Date.now(); }, Math.min(remaining + 1, 2147483647));
}

watch(() => [packet.value.expiresAt, packet.value.status], scheduleExpiry);
onMounted(scheduleExpiry);
onUnmounted(() => { window.clearTimeout(timer); active = false; });
</script>

<style lang="scss" module>
.root { margin-top: 12px; border: 1px solid color-mix(in srgb, var(--MI_THEME-love) 30%, var(--MI_THEME-divider)); border-radius: var(--MI-radius); overflow: hidden; }
.card { width: 100%; display: block; padding: 0; text-align: start; }
.coverStatus { font-size: .8em; }
.card:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -3px; }
</style>
