<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div data-image-fade="off" :class="[$style.root, { [$style.compact]: compact }]">
	<div :class="[$style.content]">
		<div
			ref="qrCodeEl" v-flip role="img" :aria-label="i18n.ts._qr.showUser"
			:class="$style.qr"
		></div>
		<div v-flip :class="$style.user">
			<MkAvatar :class="$style.avatar" :user="user" :indicator="false"/>
			<div>
				<div :class="$style.name"><MkCondensedLine :minScale="2 / 3"><MkUserName :user="user" :nowrap="true"/></MkCondensedLine></div>
				<div><MkCondensedLine :minScale="2 / 3">{{ acct }}</MkCondensedLine></div>
			</div>
		</div>
		<div v-if="!compact" v-flip :class="$style.instanceName" @click="requestDeviceMotion">{{ instanceName }}</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import tinycolor from 'tinycolor2';
import QRCodeStyling from 'qr-code-styling';
import { computed, ref, watch, onMounted, onUnmounted, useTemplateRef } from 'vue';
import { host, instanceName } from '@@/js/config.js';
import type { Directive } from 'vue';
import type * as Misskey from 'misskey-js';
import { instance } from '@/instance.js';
import { ensureSignin } from '@/i.js';
import { userPage } from '@@/js/user.js';
import { getStaticImageUrl } from '@/utility/media-proxy.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	user?: Misskey.entities.UserDetailed;
	compact?: boolean;
}>();

const user = computed(() => props.user ?? ensureSignin());
const acct = computed(() => `@${user.value.username}@${user.value.host ?? host}`);
const userProfileUrl = computed(() => userPage(user.value, undefined, true));
const qrCodeEl = useTemplateRef('qrCodeEl');

const qrColor = computed(() => tinycolor(instance.themeColor ?? '#86b300'));
const qrHsl = computed(() => qrColor.value.toHsl());

const qrCodeInstance = new QRCodeStyling({
	width: 600,
	height: 600,
	margin: 42,
	type: 'canvas',
	data: userProfileUrl.value,
	image: instance.iconUrl ? getStaticImageUrl(instance.iconUrl) : '/favicon.ico',
	qrOptions: {
		typeNumber: 0,
		mode: 'Byte',
		errorCorrectionLevel: 'H',
	},
	imageOptions: {
		hideBackgroundDots: true,
		imageSize: 0.3,
		margin: 16,
		crossOrigin: 'anonymous',
	},
	dotsOptions: {
		type: 'dots',
		color: tinycolor(`hsl(${qrHsl.value.h}, 100, 18)`).toRgbString(),
	},
	cornersDotOptions: {
		type: 'dot',
	},
	cornersSquareOptions: {
		type: 'extra-rounded',
	},
	backgroundOptions: {
		color: tinycolor(`hsl(${qrHsl.value.h}, 100, 97)`).toRgbString(),
	},
});

watch(userProfileUrl, data => qrCodeInstance.update({ data }));

onMounted(() => {
	if (qrCodeEl.value != null) {
		qrCodeInstance.append(qrCodeEl.value);
	}
});

//#region flip
const THRESHOLD = -3;
// @ts-expect-error TS(2339)
const deviceMotionPermissionNeeded = window.DeviceMotionEvent && typeof window.DeviceMotionEvent.requestPermission === 'function';
const flipEls: Set<Element> = new Set();
const flip = ref(false);

function handleOrientationChange(event: DeviceOrientationEvent) {
	const isUpsideDown = event.beta ? event.beta < THRESHOLD : false;
	flip.value = isUpsideDown;
}

watch(flip, (newState) => {
	flipEls.forEach(el => {
		el.classList.toggle('_qrShowFlipFliped', newState);
	});
});

function requestDeviceMotion() {
	if (!deviceMotionPermissionNeeded) return;
	// @ts-expect-error TS(2339)
	window.DeviceMotionEvent.requestPermission()
		.then((response: string) => {
			if (response === 'granted') {
				window.addEventListener('deviceorientation', handleOrientationChange);
			}
		})
		.catch(console.error);
}

onMounted(() => {
	window.addEventListener('deviceorientation', handleOrientationChange);
});

onUnmounted(() => {
	window.removeEventListener('deviceorientation', handleOrientationChange);
});

const vFlip = {
	mounted(el: Element) {
		flipEls.add(el);
		el.classList.add('_qrShowFlip');
	},
	unmounted(el: Element) {
		el.classList.remove('_qrShowFlip');
		flipEls.delete(el);
	},
} as Directive;
//#endregion
</script>

<style lang="scss" module>
$s1: 14px;
$s2: 21px;
$s3: 28px;
$avatarSize: 58px;

.root {
	position: relative;
	flex: 1;
	display: flex;
	flex-direction: column;
	justify-content: center;
}

.content {
	display: flex;
	flex-direction: column;
	align-items: center;
}

.qr {
	position: relative;
	margin: 0 auto;
	width: 100%;
	max-width: 230px;
	border-radius: 12px;
	overflow: clip;
	aspect-ratio: 1;

	> svg,
	> canvas {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
	}
}

.user {
	display: flex;
	flex-direction: column;
	margin: $s3 auto;
	justify-content: center;
	align-items: center;
	text-align: center;
	overflow: visible;
	width: fit-content;
	max-width: 100%;
}

.avatar {
	width: $avatarSize;
	height: $avatarSize;
	margin-bottom: 16px;
}

.name {
	font-weight: bold;
	font-size: 110%;
}

.instanceName {
	max-width: 100%;
	margin: $s3 auto 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 24px;
	font-weight: 800;
	color: #fff;
	filter: drop-shadow(0 0 6px #0007);
}

.compact {
	flex: none;
	padding: var(--MI-cardPadding, 18px);
}

.compact .qr {
	max-width: 210px;
}

.compact .user {
	flex-direction: row;
	align-items: center;
	gap: 10px;
	margin: 18px 0 0;
	text-align: start;
}

.compact .avatar {
	width: 42px;
	height: 42px;
	margin-bottom: 0;
}
</style>

<style lang="scss">
// useCssModuleで$styleを読み込みたかったが、rollupでのunwindが壊れてしまうらしく失敗。
// グローバルにクラスを定義することでお茶を濁す。
._qrShowFlip {
	transition: rotate .3s linear, scale .3s .15s step-start;
}

._qrShowFlipFliped {
	scale: -1 1;
  rotate: x 180deg;
}
</style>
