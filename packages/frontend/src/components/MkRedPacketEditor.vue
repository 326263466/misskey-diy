<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<section :class="$style.root" :aria-label="i18n.ts._redPacket.title">
	<header v-if="removable" :class="$style.heading"><strong>{{ i18n.ts._redPacket.title }}</strong><button type="button" class="_button" :disabled="disabled" :aria-label="i18n.ts.remove" @click="!disabled && emit('remove')"><i class="ti ti-x" aria-hidden="true"></i></button></header>
	<div :class="$style.cover">
		<MkRedPacketCover :imageUrl="model.coverUrl"/>
	</div>
	<div v-if="model.kind !== 'tip'" :class="$style.mode" role="group" :style="{ '--mode-count': modeOptions.length, '--mode-index': modeOptions.findIndex(option => option.value === packetType) }" :aria-label="i18n.ts._redPacket.mode">
		<button v-for="option in modeOptions" :key="option.value" type="button" class="_button" :class="{ [$style.active]: packetType === option.value }" :aria-pressed="packetType === option.value" :disabled="disabled" @click="setPacketType(option.value)"><i :class="option.value === 'direct' ? 'ti ti-user' : option.value === 'random' ? 'ti ti-dice' : 'ti ti-users'" aria-hidden="true"></i><span>{{ option.label }}</span></button>
	</div>
	<div v-if="model.kind === 'direct'" :class="$style.recipient"><span>{{ i18n.ts._redPacket.singleRecipientOnly }}</span><button v-if="!fixedAudience" type="button" class="_textButton" :disabled="disabled" @click="addRecipient">{{ i18n.ts.selectUser }}</button><span v-for="id in model.recipientIds" :key="id">{{ recipientNames?.[id] || i18n.tsx._redPacket.recipientId({ id }) }}</span></div>
	<fieldset :disabled="disabled" :class="$style.fields">
		<label>{{ model.kind === 'group' && packetType === 'equal' ? i18n.ts._redPacket.amountPerPerson : i18n.ts._redPacket.totalCoins }}<input v-model.number="amount" type="number" inputmode="numeric" min="1" max="1000000" step="1" required></label>
		<label v-if="model.kind === 'group'">{{ i18n.ts._redPacket.count }}<input v-model.number="packetCount" type="number" inputmode="numeric" min="1" :max="model.audience === 'recipients' ? Math.min(100, model.recipientIds.length) : 100" step="1" required></label>
		<label :class="$style.message">{{ i18n.ts._redPacket.message }}<input v-model="model.message" type="text" maxlength="200" :placeholder="i18n.ts._redPacket.defaultMessage"></label>
	</fieldset>
	<div v-if="model.kind === 'group' && model.audience === 'recipients'" :class="$style.recipient"><span>{{ i18n.ts._redPacket.recipients }}: {{ model.recipientIds.length }}</span><button v-if="!fixedAudience" type="button" class="_textButton" :disabled="disabled" @click="addRecipient">{{ i18n.ts.addUser }}</button><span v-for="id in model.recipientIds" :key="id">{{ recipientNames?.[id] || i18n.tsx._redPacket.recipientId({ id }) }} <button v-if="!fixedAudience" type="button" class="_textButton" :disabled="disabled" @click="model.recipientIds = model.recipientIds.filter(recipient => recipient !== id)">{{ i18n.ts.remove }}</button></span></div>
	<p v-if="error" role="alert" :class="$style.error">{{ error }}</p>
	<p v-else-if="model.kind === 'group' && model.mode === 'equal'" :class="$style.caption">{{ i18n.ts._redPacket.totalCoins }}: {{ model.totalCoins.toLocaleString() }}</p>
	<p :class="$style.refund"><i class="ti ti-shield-check" aria-hidden="true"></i>{{ model.kind === 'tip' ? i18n.ts._redPacket.tipDescription : i18n.tsx._redPacket.shortRefund({ hours: model.expiresInHours }) }}</p>
	<p v-if="model.audience === 'room'" :class="$style.caption">{{ i18n.ts._chatRedPacket.eligibility }}</p>
</section>
</template>

<script lang="ts" setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import MkRedPacketCover from '@/components/MkRedPacketCover.vue';
import type { RedPacketDraft } from '@/utility/red-packet.js';
import { redPacketValidation } from '@/utility/red-packet.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';

const props = withDefaults(defineProps<{ removable?: boolean; disabled?: boolean; balance?: number | null; fixedAudience?: boolean; recipientNames?: Record<string, string> }>(), { removable: true });
let disposed = false;
onBeforeUnmount(() => { disposed = true; });
const model = defineModel<RedPacketDraft>({ required: true });
const emit = defineEmits<{ (event: 'remove'): void }>();
const error = computed(() => redPacketValidation(model.value, props.balance));
const fixedDirect = props.fixedAudience && model.value.kind === 'direct';
const fixedAmount = ref(model.value.totalCoins / model.value.count);
watch(() => model.value, value => { fixedAmount.value = value.totalCoins / value.count; });
const packetType = computed(() => model.value.kind === 'direct' ? 'direct' : model.value.mode);
const modeOptions = computed(() => [
	...(!props.fixedAudience || model.value.recipientIds.length === 1 ? [{ value: 'direct' as const, label: i18n.ts._redPacket.direct }] : []),
	...(!fixedDirect ? [{ value: 'random' as const, label: i18n.ts._redPacket.random }, { value: 'equal' as const, label: i18n.ts._redPacket.equal }] : []),
]);
const amount = computed({
	get: () => packetType.value === 'equal' && model.value.kind === 'group' ? fixedAmount.value : model.value.totalCoins,
	set: value => {
		if (packetType.value === 'equal' && model.value.kind === 'group') {
			fixedAmount.value = value;
			model.value.totalCoins = value * model.value.count;
		} else model.value.totalCoins = value;
	},
});
const packetCount = computed({
	get: () => model.value.count,
	set: value => {
		model.value.count = value;
		if (model.value.mode === 'equal') model.value.totalCoins = fixedAmount.value * value;
	},
});

function setPacketType(type: 'direct' | 'random' | 'equal') {
	if (props.disabled) return;
	if (type === 'direct') {
		model.value.kind = 'direct';
		model.value.audience = 'recipients';
		model.value.recipientIds = model.value.recipientIds.slice(0, 1);
		model.value.count = 1;
		model.value.mode = 'equal';
	} else {
		const wasDirect = model.value.kind === 'direct';
		model.value.kind = 'group';
		model.value.mode = type;
		if (wasDirect && !props.fixedAudience) {
			model.value.audience = 'public';
			model.value.recipientIds = [];
			model.value.count = 5;
		}
		if (type === 'equal') fixedAmount.value = model.value.count > 0 ? model.value.totalCoins / model.value.count : 1;
	}
}

async function addRecipient() {
	if (props.disabled || props.fixedAudience) return;
	const user = await os.selectUser({ includeSelf: false, localOnly: true });
	if (props.disabled || model.value.recipientIds.includes(user.id)) return;
	model.value.recipientIds = model.value.kind === 'direct' ? [user.id] : [...model.value.recipientIds, user.id];
}
</script>

<style lang="scss" module>
.root { margin: 12px var(--MI-margin); display: flex; flex-direction: column; gap: 12px; }
.recipient { display: flex; flex-wrap: wrap; gap: 8px; font-size: .85em; }
.heading { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
.cover { position: relative; }
.cover :deep([data-red-packet-cover]) { min-height: 100px; padding: 16px; }
.mode { position: relative; isolation: isolate; display: grid; grid-template-columns: repeat(var(--mode-count), minmax(0, 1fr)); gap: 0; padding: 4px; border-radius: var(--MI-radius); background: color-mix(in srgb, var(--MI_THEME-accent) 7%, var(--MI_THEME-panel)); }
.mode::before { content: ''; position: absolute; z-index: -1; top: 4px; bottom: 4px; left: 4px; width: calc((100% - 8px) / var(--mode-count)); border-radius: calc(var(--MI-radius) - 3px); background: var(--MI_THEME-panel); box-shadow: 0 2px 8px color-mix(in srgb, var(--MI_THEME-accent) 12%, transparent); transform: translateX(calc(var(--mode-index) * 100%)); transition: transform 220ms cubic-bezier(.2,.8,.2,1); }
.mode button { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; min-width: 0; padding: 10px 4px; border-radius: var(--MI-radius); color: var(--MI_THEME-fgTransparentWeak); font-size: .8em; transition: color 180ms, background 180ms; }
.mode button i { font-size: 19px; }
.mode button:hover { color: var(--MI_THEME-accent); }
.mode .active { color: var(--MI_THEME-accent); font-weight: bold; }
.refund { display: flex; gap: 7px; margin: 0; padding: 10px 12px; border-radius: var(--MI-radius); color: var(--MI_THEME-fgTransparentWeak); background: var(--MI_THEME-accentedBg); font-size: .75em; line-height: 1.5; }
@media (prefers-reduced-motion: reduce) { .mode::before, .mode button { transition: none; } }
.caption { margin: 0; font-size: .75em; color: var(--MI_THEME-fgTransparentWeak); line-height: 1.5; }
.fields { min-width: 0; margin: 0; padding: 0; border: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.fields label { min-width: 0; display: flex; flex-direction: column; gap: 5px; font-size: .85em; }
.fields input { width: 100%; min-width: 0; box-sizing: border-box; font: inherit; color: var(--MI_THEME-fg); background: var(--MI_THEME-panel); border: 1px solid var(--MI_THEME-inputBorder); border-radius: var(--MI-radius); padding: 9px 10px; }
.fields input:focus-visible, .root button:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: 2px; }
.root button:disabled, .fields:disabled { opacity: .6; }
.message { grid-column: 1 / -1; min-width: 0; overflow-wrap: anywhere; }
.error { margin: 0; color: var(--MI_THEME-error); font-size: .85em; }
</style>
