<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow ref="dialogEl" :width="560" :height="700" autoHeight @click="close" @close="close" @esc="close" @closed="emit('closed')">
	<template #header><i class="ti ti-share" aria-hidden="true"></i> {{ i18n.ts.share }}</template>
	<div :class="[$style.content, { [$style.motion]: prefer.s.animation }]">
		<div :class="$style.preview">
			<div :class="$style.title" :title="title">{{ title }}</div>
			<div v-if="previewText" :class="$style.text" :title="previewText">{{ previewText }}</div>
		</div>
		<MkInfo v-if="restricted">{{ i18n.ts._share.restrictedNote }}</MkInfo>
		<div :class="$style.linkRow">
			<input ref="linkEl" :class="$style.link" :value="url" :title="url" :aria-label="i18n.ts.copyLink" readonly @focus="selectLink" @click="selectLink">
			<MkButton primary :class="$style.copyButton" :disabled="copying || copied" :wait="copying" :title="copied ? i18n.ts.copiedToClipboard : i18n.ts.copyLink" @click="copy">
				<i class="ti" :class="copied ? 'ti-check' : 'ti-copy'" aria-hidden="true"></i>
				<span :class="$style.copyLabel" aria-live="polite">{{ copied ? i18n.ts._share.copied : i18n.ts.copyLink }}</span>
			</MkButton>
		</div>
		<div :class="$style.platforms" role="group" :aria-label="i18n.ts._share.shareTo">
			<button type="button" class="_button" :class="$style.platform" :aria-expanded="showQr && qrMode === 'wechat'" :aria-controls="qrId" @click="openQr('wechat', $event)">
				<span :class="[$style.platformIcon, $style.wechatIcon]"><i class="ti ti-brand-wechat" aria-hidden="true"></i></span>
				<span :class="$style.platformLabel">{{ i18n.ts._share.wechat }}</span>
			</button>
			<a v-for="platform in platforms" :key="platform.id" :href="platform.url" target="_blank" rel="noopener noreferrer" :class="$style.platform" :title="platform.label">
				<span :class="$style.platformIcon" :style="{ '--share-brand-color': platform.color }"><i class="ti" :class="platform.icon" aria-hidden="true"></i></span>
				<span :class="$style.platformLabel">{{ platform.label }}</span>
			</a>
		</div>
		<div :class="$style.tools">
			<button v-if="canShareWithNote" type="button" class="_button" :class="$style.tool" @click="emit('shareWithNote'); close()">
				<i class="ti ti-pencil" aria-hidden="true"></i>
				<span :class="$style.toolLabel">{{ i18n.ts.shareWithNote }}</span>
			</button>
			<button v-if="canEmbed" type="button" class="_button" :class="$style.tool" @click="emit('embed'); close()">
				<i class="ti ti-code" aria-hidden="true"></i>
				<span :class="$style.toolLabel">{{ i18n.ts.embed }}</span>
			</button>
			<button type="button" class="_button" :class="$style.tool" :disabled="copyingContent || contentCopied" :aria-label="i18n.ts.copyContent" :title="contentCopied ? i18n.ts.copiedToClipboard : i18n.ts.copyContent" @click="copyContent">
				<i class="ti" :class="contentCopied ? 'ti-check' : 'ti-file-text'" aria-hidden="true"></i>
				<span :class="$style.toolLabel" aria-live="polite">{{ contentCopied ? i18n.ts._share.copied : i18n.ts.copyContent }}</span>
			</button>
			<button type="button" class="_button" :class="$style.tool" :aria-expanded="showQr && qrMode === 'qr'" :aria-controls="qrId" @click="openQr('qr', $event)">
				<i class="ti ti-qrcode" aria-hidden="true"></i>
				<span :class="$style.toolLabel">{{ i18n.ts._share.qrCode }}</span>
			</button>
			<button v-if="canShare" type="button" class="_button" :class="$style.tool" :disabled="sharing" :title="i18n.ts._share.system" @click="systemShare">
				<i class="ti ti-share" aria-hidden="true"></i>
				<span :class="$style.toolLabel">{{ i18n.ts._share.system }}</span>
			</button>
		</div>
		<Transition
			:enterActiveClass="prefer.s.animation ? $style.revealActive : ''"
			:leaveActiveClass="prefer.s.animation ? $style.revealActive : ''"
			:enterFromClass="prefer.s.animation ? $style.revealHidden : ''"
			:leaveToClass="prefer.s.animation ? $style.revealHidden : ''"
			@afterEnter="scrollQrIntoView"
		>
			<div v-show="showQr" :class="$style.qrReveal" :inert="!showQr" :aria-hidden="!showQr">
				<div :class="$style.qrRevealInner">
					<section :id="qrId" ref="qrSectionEl" :class="$style.qrSection" :aria-label="i18n.ts._share.qrCode">
						<div :class="$style.qrHeader">
							<strong :class="$style.qrHeading"><i class="ti" :class="qrMode === 'wechat' ? 'ti-brand-wechat' : 'ti-qrcode'" aria-hidden="true"></i> {{ qrMode === 'wechat' ? i18n.ts._share.wechat : i18n.ts._share.qrCode }}</strong>
							<button type="button" class="_button" :class="$style.qrClose" :aria-label="i18n.ts.close" @click="closeQr"><i class="ti ti-x" aria-hidden="true"></i></button>
						</div>
						<div :class="$style.qrBody">
							<div v-show="!qrFailed" :class="$style.qrVisual">
								<div v-if="qrBusy" :class="$style.qrLoading" role="status"><i class="ti ti-loader-2" aria-hidden="true"></i><span>{{ i18n.ts.loading }}</span></div>
								<div v-show="qrCode" ref="qrEl" :class="$style.qr" role="img" :aria-label="i18n.ts._share.qrCode"></div>
							</div>
							<div v-if="qrFailed" :class="$style.qrError">
								<MkInfo warn>{{ i18n.ts._share.qrCodeFailed }}</MkInfo>
								<MkButton @click="generateQr">{{ i18n.ts.retry }}</MkButton>
							</div>
							<div v-else :class="$style.qrDetails">
								<div :class="$style.description">{{ qrMode === 'wechat' ? i18n.ts._share.wechatDescription : i18n.ts._share.qrCodeDescription }}</div>
								<MkButton v-if="qrCode" :class="$style.saveButton" :disabled="savingQr" :wait="savingQr" :title="i18n.ts._share.saveQrCode" @click="saveQr"><i class="ti ti-download" aria-hidden="true"></i> <span :class="$style.saveLabel">{{ i18n.ts._share.saveQrCode }}</span></MkButton>
							</div>
						</div>
					</section>
				</div>
			</div>
		</Transition>
		<div v-if="status" role="status" :class="$style.status">{{ status }}</div>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, useId, useTemplateRef, watch } from 'vue';
import QRCodeStyling from 'qr-code-styling';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import { canShareWithSystem, copyShareLink, copyShareText, getShareText, getShareUrl, shareWithSystem } from '@/utility/share.js';

const props = defineProps<{
	title: string;
	text?: string;
	url: string;
	restricted?: boolean;
	canShareWithNote?: boolean;
	canEmbed?: boolean;
}>();

const emit = defineEmits<{
	(ev: 'closed'): void;
	(ev: 'shareWithNote'): void;
	(ev: 'embed'): void;
}>();

const dialogEl = useTemplateRef('dialogEl');
const linkEl = useTemplateRef('linkEl');
const qrEl = useTemplateRef('qrEl');
const qrSectionEl = useTemplateRef('qrSectionEl');
const qrId = useId();
const showQr = ref(false);
const qrMode = ref<'qr' | 'wechat'>('qr');
const qrCode = shallowRef<QRCodeStyling | null>(null);
const qrBusy = ref(false);
const qrFailed = ref(false);
const savingQr = ref(false);
const copying = ref(false);
const copied = ref(false);
const copyingContent = ref(false);
const contentCopied = ref(false);
const sharing = ref(false);
const status = ref('');
const previewText = computed(() => props.restricted ? undefined : props.text);
const shareData = computed<ShareData>(() => ({ title: props.title, text: previewText.value, url: props.url }));
const canShare = computed(() => canShareWithSystem(shareData.value));
const platformDefinitions = [
	{ id: 'qq', icon: 'ti-brand-qq', color: '#12b7f5' },
	{ id: 'qzone', icon: 'ti-star-filled', color: '#f6b900' },
	{ id: 'weibo', icon: 'ti-brand-weibo', color: '#e6162d' },
	{ id: 'x', icon: 'ti-brand-x', color: '#000000' },
	{ id: 'telegram', icon: 'ti-brand-telegram', color: '#26a5e4' },
	{ id: 'facebook', icon: 'ti-brand-facebook-filled', color: '#1877f2' },
	{ id: 'whatsapp', icon: 'ti-brand-whatsapp', color: '#25d366' },
] as const;
const platforms = computed(() => platformDefinitions.map(platform => ({
	...platform,
	label: i18n.ts._share[platform.id],
	url: getShareUrl(platform.id, shareData.value),
})));
let qrGeneration = 0;
let downloadUrl: string | null = null;
let qrTrigger: HTMLElement | null = null;
const copyCooldownMs = 3000;
let copyGeneration = 0;
let copyResetTimer: number | undefined;
let contentCopyResetTimer: number | undefined;

function resetCopyState(): void {
	copyGeneration++;
	if (copyResetTimer != null) window.clearTimeout(copyResetTimer);
	if (contentCopyResetTimer != null) window.clearTimeout(contentCopyResetTimer);
	copyResetTimer = undefined;
	contentCopyResetTimer = undefined;
	copying.value = false;
	copyingContent.value = false;
	copied.value = false;
	contentCopied.value = false;
}

function releaseDownloadUrl(): void {
	if (downloadUrl != null) URL.revokeObjectURL(downloadUrl);
	downloadUrl = null;
}

onBeforeUnmount(() => {
	qrGeneration++;
	resetCopyState();
	releaseDownloadUrl();
});

watch(() => props.url, () => {
	qrGeneration++;
	qrCode.value = null;
	qrBusy.value = false;
	qrFailed.value = false;
	resetCopyState();
	status.value = '';
	qrEl.value?.replaceChildren();
	releaseDownloadUrl();
	if (showQr.value) void generateQr();
});

function close(): void {
	dialogEl.value?.close();
}

function selectLink(): void {
	linkEl.value?.select();
}

async function copy(): Promise<void> {
	if (copying.value || copied.value) return;
	const generation = copyGeneration;
	copying.value = true;
	status.value = '';
	const success = await copyShareLink(props.url);
	if (generation !== copyGeneration) return;
	copied.value = success;
	status.value = copied.value ? '' : i18n.ts._share.copyFailed;
	copying.value = false;
	if (copied.value) {
		copyResetTimer = window.setTimeout(() => {
			copied.value = false;
			copyResetTimer = undefined;
		}, copyCooldownMs);
	} else {
		linkEl.value?.focus();
		selectLink();
	}
}

async function copyContent(): Promise<void> {
	if (copyingContent.value || contentCopied.value) return;
	const generation = copyGeneration;
	copyingContent.value = true;
	status.value = '';
	const success = await copyShareText(getShareText(shareData.value));
	if (generation !== copyGeneration) return;
	contentCopied.value = success;
	copyingContent.value = false;
	if (contentCopied.value) {
		contentCopyResetTimer = window.setTimeout(() => {
			contentCopied.value = false;
			contentCopyResetTimer = undefined;
		}, copyCooldownMs);
	} else {
		status.value = i18n.ts._share.copyContentFailed;
	}
}

async function systemShare(): Promise<void> {
	if (sharing.value) return;
	sharing.value = true;
	status.value = '';
	const result = await shareWithSystem(shareData.value);
	sharing.value = false;
	if (result === 'failed') status.value = i18n.ts._share.shareFailed;
}

function closeQr(): void {
	showQr.value = false;
	qrTrigger?.focus({ preventScroll: true });
}

function scrollQrIntoView(): void {
	if (showQr.value) qrSectionEl.value?.scrollIntoView({ block: 'nearest' });
}

async function openQr(mode: 'qr' | 'wechat', event: MouseEvent): Promise<void> {
	qrTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
	if (showQr.value && qrMode.value === mode) {
		closeQr();
		return;
	}
	qrMode.value = mode;
	status.value = '';
	showQr.value = true;
	await nextTick();
	await generateQr();
	await nextTick();
	scrollQrIntoView();
}

async function generateQr(): Promise<void> {
	if (qrCode.value || qrBusy.value || qrEl.value == null) return;
	const generation = ++qrGeneration;
	qrBusy.value = true;
	qrFailed.value = false;
	try {
		const code = new QRCodeStyling({
			width: 768,
			height: 768,
			margin: 96,
			type: 'svg',
			data: props.url,
			qrOptions: { errorCorrectionLevel: 'M' },
		});
		const image = await code.getRawData('svg');
		if (generation !== qrGeneration) return;
		if (image == null) throw new Error('QR image unavailable');
		code.append(qrEl.value);
		qrCode.value = code;
	} catch {
		if (generation === qrGeneration) qrFailed.value = true;
	} finally {
		if (generation === qrGeneration) qrBusy.value = false;
	}
}

async function saveQr(): Promise<void> {
	if (savingQr.value || qrCode.value == null) return;
	savingQr.value = true;
	status.value = '';
	const generation = qrGeneration;
	try {
		const blob = await qrCode.value.getRawData('png');
		if (generation !== qrGeneration) return;
		if (!(blob instanceof Blob)) throw new Error('QR image unavailable');
		releaseDownloadUrl();
		downloadUrl = URL.createObjectURL(blob);
		const link = window.document.createElement('a');
		link.href = downloadUrl;
		link.download = 'misskey-share.png';
		window.document.body.appendChild(link);
		link.click();
		link.remove();
	} catch {
		if (generation === qrGeneration) status.value = i18n.ts._share.saveQrCodeFailed;
	} finally {
		savingQr.value = false;
	}
}
</script>

<style lang="scss" module>
.content {
	--MI-cardPadding: 16px;

	display: flex;
	flex-direction: column;
	gap: 16px;
	min-width: 0;
	padding: var(--MI-cardPadding, 18px);
}

.preview {
	min-width: 0;
	overflow-wrap: anywhere;
}

.title {
	font-weight: bold;
	line-height: 1.3;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.text {
	margin-top: 4px;
	line-height: 1.5;
	color: var(--MI_THEME-fgTransparentWeak);
	white-space: pre-wrap;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.linkRow {
	display: flex;
	gap: 4px;
	min-width: 0;
	padding: 4px;
	border: 1px solid var(--MI_THEME-divider);
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-panel);

	&:focus-within {
		border-color: var(--MI_THEME-accent);
	}
}

.link {
	width: 0;
	min-width: 0;
	flex: 1;
	padding: 6px 8px;
	color: var(--MI_THEME-fg);
	background: transparent;
	border: 0;
	border-radius: calc(var(--MI-radius) - 4px);
	font: inherit;
	text-overflow: ellipsis;
}

.copyButton {
	flex: 0 0 120px;
	min-width: 0;
	max-width: 48%;
	border-radius: calc(var(--MI-radius) - 4px);
}

.copyLabel {
	display: inline-block;
	max-width: calc(100% - 22px);
	vertical-align: bottom;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.platforms {
	display: grid;
	grid-template-columns: repeat(8, minmax(0, 1fr));
	gap: 12px 6px;
}

.platform {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 6px;
	min-width: 0;
	padding: 4px 0;
	border-radius: var(--MI-radius);
	color: var(--MI_THEME-fg);
	text-decoration: none;

	&:hover,
	&[aria-expanded="true"] {
		text-decoration: none;
		background: var(--MI_THEME-buttonHoverBg);

		.platformIcon {
			filter: brightness(1.06);
		}
	}
}

.platformIcon {
	display: grid;
	place-items: center;
	width: 40px;
	height: 40px;
	border-radius: var(--MI-radius);
	// Brand colors stay recognizable across themes.
	color: #fff;
	background: var(--share-brand-color);
	box-shadow: 0 3px 8px color-mix(in srgb, var(--share-brand-color) 18%, transparent);
	font-size: 24px;
}

.wechatIcon {
	--share-brand-color: #07c160;
}

.platformLabel {
	max-width: 100%;
	font-size: 0.8em;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.tools {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(100px, 100%), 1fr));
	gap: 4px;
	padding: 4px;
	border: 1px solid var(--MI_THEME-divider);
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-panel);
}

.tool {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	min-width: 0;
	min-height: 36px;
	padding: 8px;
	border-radius: calc(var(--MI-radius) - 4px);
	font-size: 0.85em;
	box-sizing: border-box;

	> i {
		font-size: 18px;
		color: var(--MI_THEME-accent);
	}

	&:not(:disabled):hover {
		background: var(--MI_THEME-buttonHoverBg);
	}

	&[aria-expanded="true"] {
		background: var(--MI_THEME-accentedBg);
		color: var(--MI_THEME-accent);
	}

	&:disabled {
		opacity: 0.6;
	}
}

.toolLabel {
	display: block;
	line-height: 1.4;
	min-width: 0;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.platform:focus-visible,
.tool:focus-visible,
.qrClose:focus-visible {
	outline: 2px solid var(--MI_THEME-focus);
	outline-offset: 2px;
}

.qrReveal {
	display: grid;
	grid-template-rows: 1fr;
}

.qrRevealInner {
	min-height: 0;
	overflow: hidden;
}

.qrSection {
	border: 1px solid var(--MI_THEME-divider);
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-panel);
	overflow: hidden;
}

.qrHeader {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 8px;
	padding: 8px var(--MI-cardPadding);
	border-bottom: 1px solid var(--MI_THEME-divider);
}

.qrHeading {
	display: flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
	font-size: 0.9em;
	font-weight: 600;

	> i {
		color: var(--MI_THEME-accent);
	}
}

.qrClose {
	flex-shrink: 0;
	width: 28px;
	height: 28px;
	border-radius: calc(var(--MI-radius) - 4px);
	color: var(--MI_THEME-fgTransparentWeak);

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
		color: var(--MI_THEME-fg);
	}
}

.qrBody {
	display: grid;
	grid-template-columns: 160px minmax(0, 1fr);
	align-items: center;
	gap: 16px;
	padding: var(--MI-cardPadding);
}

.qrVisual {
	display: grid;
	place-items: center;
	width: 160px;
	aspect-ratio: 1;
	box-sizing: border-box;
	border: 1px solid var(--MI_THEME-divider);
	border-radius: calc(var(--MI-radius) - 4px);
	background: var(--MI_THEME-bg);
	overflow: hidden;
}

.qrLoading {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 8px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.85em;

	> i {
		font-size: 24px;
	}
}

.qrError {
	grid-column: 1 / -1;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 12px;
}

.qr {
	width: 100%;

	> svg {
		display: block;
		max-width: 100%;
		height: auto;
	}
}

.qrDetails {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 12px;
	min-width: 0;
}

.description {
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.9em;
	line-height: 1.5;
	overflow-wrap: anywhere;
}

.saveButton {
	width: 160px;
	min-width: 0;
	max-width: 100%;
	border-radius: calc(var(--MI-radius) - 4px);
}

.saveLabel {
	display: inline-block;
	max-width: calc(100% - 22px);
	vertical-align: bottom;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.status {
	font-size: 0.9em;
	color: var(--MI_THEME-error);
}

@media (prefers-reduced-motion: no-preference) {
	.motion {
		.platform,
		.tool,
		.qrClose {
			transition: background 160ms ease, color 160ms ease, transform 160ms ease;
		}

		.platformIcon {
			transition: transform 180ms ease, box-shadow 180ms ease, filter 180ms ease;
		}

		.platform:hover .platformIcon {
			transform: translateY(-2px);
			box-shadow: 0 5px 12px color-mix(in srgb, var(--share-brand-color) 25%, transparent);
		}

		.platform:active .platformIcon {
			transform: scale(0.94);
		}

		.tool:not(:disabled):active,
		.qrClose:active {
			transform: scale(0.97);
		}

		.qrLoading > i {
			animation: qrSpin 800ms linear infinite;
		}
	}

	.revealActive {
		transition: grid-template-rows 250ms ease;
	}

	.revealHidden {
		grid-template-rows: 0fr;
	}
}

@keyframes qrSpin {
	to { transform: rotate(360deg); }
}

@media (max-width: 400px) {
	.copyButton {
		flex-basis: 112px;
	}
}

@container (max-width: 450px) {
	.platforms {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}

	.tool {
		gap: 6px;
		padding-inline: 6px;
	}
}

@container (max-width: 360px) {
	.qrBody {
		grid-template-columns: minmax(0, 1fr);
		justify-items: center;
		gap: 12px;
	}

	.qrDetails {
		align-items: center;
		text-align: center;
	}
}
</style>
