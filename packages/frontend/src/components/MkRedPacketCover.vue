<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<span :class="[$style.root, { [$style.custom]: imageUrl && !failed }]" data-red-packet-cover>
	<img v-if="imageUrl && !failed" :src="imageUrl" alt="" :class="$style.image" @error="failed = true">
	<span :class="$style.pattern" aria-hidden="true"></span>
	<span :class="$style.seal" aria-hidden="true"><i class="ti ti-gift"></i></span>
	<span :class="$style.content"><strong>{{ message || i18n.ts._redPacket.defaultMessage }}</strong><slot></slot></span>
</span>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { i18n } from '@/i18n.js';

const props = defineProps<{ imageUrl?: string | null; message?: string }>();
const failed = ref(false);
watch(() => props.imageUrl, () => { failed.value = false; });
</script>

<style lang="scss" module>
.root { position: relative; isolation: isolate; overflow: hidden; display: flex; align-items: center; gap: 18px; min-height: 112px; padding: 20px; box-sizing: border-box; width: 100%; border-radius: var(--MI-radius); color: var(--MI-redPacketGold); background: linear-gradient(125deg, var(--MI-redPacketStart), var(--MI-redPacketEnd)); }
.pattern { position: absolute; inset: 0; z-index: -1; background: repeating-radial-gradient(circle at 105% -20%, transparent 0 24px, color-mix(in srgb, var(--MI-redPacketGold) 16%, transparent) 25px 26px, transparent 27px 48px); }
.root::before { content: ''; position: absolute; inset: 52% -10% -70%; border: 1px solid color-mix(in srgb, var(--MI-redPacketGold) 35%, transparent); border-radius: 50%; background: color-mix(in srgb, var(--MI-redPacketGold) 6%, transparent); z-index: -1; }
.root::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(115deg, transparent 20%, color-mix(in srgb, var(--MI-redPacketGold) 18%, transparent) 48%, transparent 70%); transform: translateX(-120%); }
.root:hover::after { animation: sheen 850ms ease-out; }
.seal { display: grid; place-items: center; flex: 0 0 54px; height: 54px; border: 1px solid currentColor; border-radius: 50%; box-shadow: 0 0 0 5px color-mix(in srgb, var(--MI-redPacketGold) 12%, transparent); font-size: 26px; transition: transform 220ms ease; }
.root:hover .seal { transform: rotate(-8deg) scale(1.04); }
.content { min-width: 0; display: flex; flex-direction: column; gap: 6px; overflow-wrap: anywhere; text-align: start; }
.content strong { font-size: 1.05em; }
.image { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: -3; }
.custom { background: transparent; }
.custom .pattern { background: linear-gradient(90deg, color-mix(in srgb, var(--MI-redPacketEnd) 90%, transparent), color-mix(in srgb, var(--MI-redPacketEnd) 65%, transparent)); z-index: -2; }
@keyframes sheen { to { transform: translateX(120%); } }
@media (prefers-reduced-motion: reduce) { .root:hover::after { animation: none; } .seal { transition: none; } .root:hover .seal { transform: none; } }
</style>
