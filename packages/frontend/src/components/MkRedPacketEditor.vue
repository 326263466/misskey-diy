<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<section :class="[$style.root, { [$style.simple]: simple }]" :aria-label="i18n.ts._redPacket.title">
	<header v-if="removable" :class="$style.heading"><strong>{{ i18n.ts._redPacket.title }}</strong><button type="button" class="_button _iconButton" :disabled="disabled" :aria-label="i18n.ts.remove" @click="!disabled && emit('remove')"><i class="ti ti-x" aria-hidden="true"></i></button></header>
	<div v-if="!simple" :class="$style.cover">
		<MkRedPacketCover :imageUrl="model.coverUrl"/>
		<div :class="$style.coverActions">
				<button v-if="model.coverFileId" type="button" class="_button" :disabled="disabled || uploading" :aria-label="i18n.ts._redPacket.resetCover" :title="i18n.ts._redPacket.resetCover" @click="resetCover"><i class="ti ti-arrow-back-up" aria-hidden="true"></i></button>
				<button type="button" class="_button" :disabled="disabled || uploading" :aria-label="i18n.ts._redPacket.uploadCover" :title="i18n.ts._redPacket.uploadCover" @click="chooseCover"><i class="ti ti-photo-up" aria-hidden="true"></i></button>
		</div>
	</div>
	<input ref="coverInput" type="file" :accept="coverTypes.join(',')" :disabled="disabled || uploading" :aria-label="i18n.ts._redPacket.uploadCover" hidden @change="uploadCover">
	<div :class="$style.mode" role="group" :style="{ '--mode-count': modeOptions.length, '--mode-index': modeOptions.findIndex(option => option.value === packetType) }" :aria-label="i18n.ts._redPacket.mode">
		<button v-for="option in modeOptions" :key="option.value" type="button" class="_button" :class="{ [$style.active]: packetType === option.value }" :aria-pressed="packetType === option.value" :disabled="disabled" @click="setPacketType(option.value)"><span>{{ option.label }}</span></button>
	</div>
	<div v-if="model.kind === 'direct' && !simple" :class="$style.recipient"><span>{{ i18n.ts._redPacket.singleRecipientOnly }}</span><span v-for="id in model.recipientIds" :key="id"><template v-if="recipientUsers?.[id]"><template v-if="recipientUsers[id].name"><MkUserName :user="recipientUsers[id]"/> </template>(<MkAcct :user="recipientUsers[id]"/>)</template><span v-else>{{ i18n.tsx._redPacket.recipientId({ id }) }}</span></span></div>
	<fieldset :disabled="disabled" :class="$style.fields">
		<label v-if="model.kind === 'group'">{{ i18n.ts._redPacket.count }}<input v-model.number="packetCount" type="number" inputmode="numeric" :placeholder="i18n.ts._redPacket.countPlaceholder" min="1" :max="model.audience === 'recipients' ? Math.min(100, model.recipientIds.length) : 100" step="1" required></label>
		<p v-if="simple && memberCount != null && model.audience === 'room'" :class="$style.memberCount">{{ i18n.tsx._redPacket.roomMembers({ count: memberCount }) }}</p>
		<label>{{ amountLabel }}<input v-model.number="amount" type="number" inputmode="decimal" placeholder="0.00" :min="model.kind === 'group' && packetType === 'equal' ? 0.01 : 1" :max="model.kind === 'group' && packetType === 'equal' ? Math.floor(100000 / Math.max(1, model.count)) / 100 : 1000" step="0.01" required></label>
		<label v-if="packetType === 'password'" :class="[$style.message, $style.password]" :for="passwordInputId">
			<span v-if="!simple">{{ i18n.ts._redPacket.password }}</span>
			<span :class="$style.passwordControl">
				<span :class="$style.passwordInput">
					<input :id="passwordInputId" v-model="model.password" type="text" :aria-label="i18n.ts._redPacket.password" :aria-invalid="passwordLength > CONTENT_LIMITS.redPacketPassword" :aria-describedby="messageHintId" required @input="setPassword" @compositionend="setPassword">
					<span :id="messageHintId" class="_inputCounter" :class="{ _inputCounterOver: passwordLength > CONTENT_LIMITS.redPacketPassword }">{{ passwordLength }}/{{ CONTENT_LIMITS.redPacketPassword }}</span>
				</span>
				<button type="button" class="_button" :class="$style.randomPassword" :aria-label="i18n.ts._redPacket.randomPassword" @click="randomizePassword"><i class="ti ti-dice" aria-hidden="true"></i> {{ i18n.ts.random }}</button>
			</span>
		</label>
		<label v-else :class="$style.message"><span v-if="!simple">{{ i18n.ts._redPacket.message }}</span><input v-model="model.message" type="text" :placeholder="i18n.ts._redPacket.defaultMessage" :aria-label="i18n.ts._redPacket.message" :aria-describedby="messageHintId" @input="setMessage" @compositionend="setMessage"><span :id="messageHintId" class="_inputCounter" :class="{ _inputCounterOver: Array.from(model.message).length > RED_PACKET_MESSAGE_MAX_LENGTH }">{{ Array.from(model.message).length }}/{{ RED_PACKET_MESSAGE_MAX_LENGTH }}</span></label>
	</fieldset>
	<div v-if="model.kind === 'group' && model.audience === 'recipients'" :class="$style.recipient"><span>{{ i18n.ts._redPacket.recipients }}: {{ model.recipientIds.length }}</span><button v-if="!fixedAudience" type="button" class="_textButton" :disabled="disabled" @click="addRecipient">{{ i18n.ts.addUser }}</button><span v-for="id in model.recipientIds" :key="id"><template v-if="recipientUsers?.[id]"><template v-if="recipientUsers[id].name"><MkUserName :user="recipientUsers[id]"/> </template>(<MkAcct :user="recipientUsers[id]"/>)</template><span v-else>{{ i18n.tsx._redPacket.recipientId({ id }) }}</span> <button v-if="!fixedAudience" type="button" class="_textButton" :disabled="disabled" @click="model.recipientIds = model.recipientIds.filter(recipient => recipient !== id)">{{ i18n.ts.remove }}</button></span></div>
	<p v-if="!simple && model.kind === 'group' && model.mode === 'equal' && Number.isFinite(model.totalCoins)" :class="$style.caption">{{ i18n.ts._redPacket.totalCoins }}: {{ model.totalCoins.toLocaleString() }}</p>
	<p v-if="!simple" :class="$style.refund">{{ i18n.tsx._redPacket.shortRefund({ hours: model.expiresInHours }) }}</p>
	<p v-if="!simple && model.audience === 'room'" :class="$style.caption">{{ i18n.ts._chatRedPacket.eligibility }}</p>
</section>
</template>

<script lang="ts" setup>
import { computed, ref, watch, onBeforeUnmount, useTemplateRef, useId, markRaw } from 'vue';
import isAnimated from 'is-file-animated';
import { CONTENT_LIMITS } from 'misskey-js';
import type { entities } from 'misskey-js';
import MkRedPacketCover from '@/components/MkRedPacketCover.vue';
import type { RedPacketDraft } from '@/utility/red-packet.js';
import { RED_PACKET_MESSAGE_MAX_LENGTH } from '@/utility/red-packet.js';
import { isCoinAmount, toCoinUnits } from '@/utility/coins.js';
import { cleanupRedPacketCovers } from '@/utility/red-packet-cover-cleanup.js';
import { ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';

const props = withDefaults(defineProps<{ removable?: boolean; disabled?: boolean; balance?: number | null; fixedAudience?: boolean; recipientUsers?: Record<string, entities.UserLite>; simple?: boolean; allowPassword?: boolean; memberCount?: number; }>(), { removable: true });
let disposed = false;
onBeforeUnmount(() => { disposed = true; });
const model = defineModel<RedPacketDraft>({ required: true });
const passwordLength = computed(() => Array.from(model.value.password ?? '').length);
const emit = defineEmits<{ (event: 'remove'): void; (event: 'coverUploaded', fileId: string): void; (event: 'uploading', value: boolean): void }>();
const coverInput = useTemplateRef('coverInput');
const messageHintId = useId();
const passwordInputId = useId();
const coverTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];
const uploading = ref(false);
const fixedDirect = props.fixedAudience && model.value.kind === 'direct';
const fixedAmount = ref((toCoinUnits(model.value.totalCoins) / model.value.count) / 100);
watch(() => model.value, value => { fixedAmount.value = (toCoinUnits(value.totalCoins) / value.count) / 100; });
const packetType = computed(() => model.value.password != null ? 'password' : model.value.kind === 'direct' ? 'direct' : model.value.mode);
const amountLabel = computed(() => {
	if (props.simple && fixedDirect) return i18n.ts._redPacket.amount;
	const perPerson = model.value.kind === 'group' && packetType.value === 'equal';
	return props.simple ? (perPerson ? i18n.ts._redPacket.eachAmount : i18n.ts._redPacket.totalAmount) : (perPerson ? i18n.ts._redPacket.amountPerPerson : i18n.ts._redPacket.totalCoins);
});
const modeOptions = computed(() => [
	...(fixedDirect ? [{ value: 'direct' as const, label: props.simple ? i18n.ts._redPacket.ordinaryPacket : i18n.ts._redPacket.direct }] : []),
	...(!fixedDirect ? [{ value: 'random' as const, label: props.simple ? i18n.ts._redPacket.luckyPacket : i18n.ts._redPacket.random }, { value: 'equal' as const, label: props.simple ? i18n.ts._redPacket.ordinaryPacket : i18n.ts._redPacket.equal }] : []),
	...(props.allowPassword ? [{ value: 'password' as const, label: i18n.ts._redPacket.passwordPacket }] : []),
]);
const amount = computed({
	get: () => packetType.value === 'equal' && model.value.kind === 'group' ? fixedAmount.value : model.value.totalCoins,
	set: value => {
		if (packetType.value === 'equal' && model.value.kind === 'group') {
			fixedAmount.value = value;
			model.value.totalCoins = fixedTotal(value, model.value.count);
		} else model.value.totalCoins = value;
	},
});
const packetCount = computed({
	get: () => model.value.count,
	set: value => {
		model.value.count = value;
		if (model.value.mode === 'equal') model.value.totalCoins = fixedTotal(fixedAmount.value, value);
	},
});

function fixedTotal(value: number, count: number): number {
	return isCoinAmount(value) ? toCoinUnits(value) * count / 100 : Number.NaN;
}

function setMessage(event: Event) {
	if (props.disabled || ('isComposing' in event && event.isComposing)) return;
	const input = event.target as HTMLInputElement;
	model.value.message = Array.from(input.value).slice(0, RED_PACKET_MESSAGE_MAX_LENGTH).join('');
	input.value = model.value.message;
}

function setPassword(event: Event) {
	if (props.disabled || ('isComposing' in event && event.isComposing)) return;
	const input = event.target as HTMLInputElement;
	model.value.password = Array.from(input.value).slice(0, CONTENT_LIMITS.redPacketPassword).join('');
	input.value = model.value.password;
}

function randomizePassword() {
	if (props.disabled || packetType.value !== 'password') return;
	const greetings = Object.values(i18n.ts._redPacket._passwordGreetings).filter(greeting =>
		greeting !== model.value.password && greeting.trim() !== '' && Array.from(greeting).length <= CONTENT_LIMITS.redPacketPassword);
	if (greetings.length > 0) model.value.password = greetings[Math.floor(Math.random() * greetings.length)];
}

function chooseCover() {
	if (props.disabled || uploading.value) return;
	coverInput.value?.click();
}

function resetCover() {
	if (props.disabled || uploading.value) return;
	model.value.coverFileId = null;
	model.value.coverUrl = null;
}

async function uploadCover() {
	const input = coverInput.value;
	const file = input?.files?.[0];
	if (input) input.value = '';
	if (!file || props.disabled || uploading.value) return;
	if (!coverTypes.includes(file.type)) {
		os.toast(i18n.ts._redPacket.coverImageOnly, 'error');
		return;
	}
	const account = ensureSignin();
	const draft = model.value;
	uploading.value = true;
	emit('uploading', true);
	try {
		let animated = true;
		try { animated = await isAnimated(file); } catch { /* 无法识别时保留原图，避免把动图处理成单帧。 */ }
		if (disposed || props.disabled || model.value !== draft) return;
		const files = await new Promise<entities.DriveFile[]>((resolve, reject) => {
			let dispose: (() => void) | undefined;
			let closed = false;
			void os.popupAsyncWithDialog(import('@/components/MkUploaderDialog.vue').then(module => module.default), {
				files: markRaw([file]), multiple: false, features: { imageEditing: !animated, watermark: !animated },
			}, {
				done: resolve,
				canceled: () => resolve([]),
				closed: () => { closed = true; dispose?.(); resolve([]); },
			}).then(popup => { dispose = popup.dispose; if (closed) dispose(); }, reject);
		});
		if (files.length === 0) return;
		const cover = files[0];
		const valid = coverTypes.includes(cover.type) && !cover.isSensitive;
		if (disposed || props.disabled || model.value !== draft || !valid) {
			const cleaned = await cleanupRedPacketCovers(account, files.map(uploaded => uploaded.id));
			if (!disposed && !cleaned) os.toast(i18n.ts._redPacket.coverCleanupFailed, 'error');
			else if (!disposed && !valid) os.toast(i18n.ts._redPacket.coverImageOnly, 'error');
			return;
		}
		draft.coverFileId = cover.id;
		draft.coverUrl = cover.url;
		emit('coverUploaded', cover.id);
	} catch {
		if (!disposed) os.toast(i18n.ts.failedToUpload, 'error');
	} finally {
		uploading.value = false;
		emit('uploading', false);
	}
}

function setPacketType(type: 'direct' | 'random' | 'equal' | 'password') {
	if (props.disabled) return;
	if (type === 'password') {
		if (!props.allowPassword) return;
		model.value.password = i18n.ts._redPacket.passwordDefault;
		model.value.mode = 'random';
		return;
	}
	model.value.password = null;
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
		if (type === 'equal') {
			const count = Math.max(1, model.value.count);
			const units = Math.round(toCoinUnits(model.value.totalCoins) / count);
			fixedAmount.value = Math.min(Math.floor(100000 / count), Math.max(Math.ceil(100 / count), units)) / 100;
			model.value.totalCoins = fixedTotal(fixedAmount.value, model.value.count);
		}
	}
}

async function addRecipient() {
	if (props.disabled || props.fixedAudience) return;
	const user = await os.selectUser({ includeSelf: false, localOnly: true });
	if (props.disabled || model.value.recipientIds.includes(user.id)) return;
	model.value.recipientIds = model.value.kind === 'direct' ? [user.id] : [...model.value.recipientIds, user.id];
}

defineExpose({ chooseCover, resetCover });
</script>

<style lang="scss" module>
.root { margin: 12px var(--MI-margin); display: flex; flex-direction: column; gap: 12px; }
.recipient { display: flex; flex-wrap: wrap; gap: 8px; font-size: .85em; }
.heading { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
.cover { position: relative; }
.cover :deep([data-red-packet-cover]) { min-height: 100px; padding: 16px; }
.coverActions { position: absolute; top: 8px; right: 8px; display: flex; gap: 6px; }
.coverActions button { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; color: var(--MI-redPacketGold); background: color-mix(in srgb, var(--MI-redPacketEnd) 88%, transparent); }
.coverActions button:hover:not(:disabled) { background: var(--MI-redPacketEnd); }
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
.message { position: relative; grid-column: 1 / -1; min-width: 0; overflow-wrap: anywhere; }
.passwordControl { display: flex; align-items: center; gap: 8px; min-width: 0; width: 100%; box-sizing: border-box; padding-right: 10px; border: 1px solid var(--MI_THEME-inputBorder); border-radius: var(--MI-radius); background: var(--MI_THEME-panel); }
.passwordControl:focus-within { border-color: var(--MI_THEME-accent); }
.passwordInput { position: relative; display: flex; flex: 1; min-width: 0; }
.fields .passwordControl input { border: 0; background: transparent; }
.randomPassword { flex-shrink: 0; color: var(--MI_THEME-accent); font-size: .85em; }

.simple {
	margin: 0;
	gap: 12px;
	.mode { order: -1; padding: 0; border-radius: 0; background: transparent; }
	.mode::before { display: none; }
	.mode button { position: relative; padding: 8px 2px; color: var(--MI_THEME-fg); font-size: 14px; }
	.mode .active { color: var(--MI_THEME-love); }
	.fields { grid-template-columns: minmax(0, 1fr); gap: 12px; }
	.fields label { flex-direction: row; align-items: center; gap: 12px; padding: 8px 14px; min-height: 24px; border-radius: 6px; background: var(--MI_THEME-panel); font-size: 15px; }
	.fields input { flex: 1; width: 0; padding: 0; border: none; border-radius: 0; background: transparent; text-align: end; }
	.fields input[type='number'] { appearance: textfield; }
	.fields input::-webkit-inner-spin-button { appearance: none; }
	.fields .message input { text-align: start; }
	.fields .passwordControl { padding: 0; border: 0; background: transparent; }
	.refund { padding: 0; background: transparent; }
}

.memberCount { margin: -8px 14px 0; font-size: 12px; color: var(--MI_THEME-fgTransparentWeak); }
</style>
