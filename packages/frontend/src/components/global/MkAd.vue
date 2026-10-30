<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div
	v-if="chosen && !shouldHide"
	:class="[$style.main, {
		[$style.fill]: fill,
		[$style.edgeToEdge]: edgeToEdge,
		[$style.plain]: plain,
		[$style.square]: chosen.place === 'square',
		[$style.horizontal]: chosen.place === 'horizontal',
		[$style.horizontalBig]: chosen.place === 'horizontal-big',
		[$style.vertical]: chosen.place === 'vertical',
	}]"
	@contextmenu.capture="onContextmenu"
>
	<component
		:is="self ? 'MkA' : 'a'"
		:class="$style.link"
		v-bind="self ? {
			to: chosen.url.substring(local.length),
		} : {
			href: chosen.url,
			rel: 'nofollow noopener',
			target: '_blank',
		}"
	>
		<img :src="chosen.imageUrl" :class="$style.img">
		<span v-if="!plain" :class="$style.label">{{ i18n.ts.ads }}</span>
	</component>
</div>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import { url as local, host } from '@@/js/config.js';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import { store } from '@/store.js';
import * as os from '@/os.js';
import { $i } from '@/i.js';
import { prefer } from '@/preferences.js';
import type { MenuItem } from '@/types/menu.js';

type Ad = (typeof instance)['ads'][number];

const props = defineProps<{
	fill?: boolean;
	edgeToEdge?: boolean;
	plain?: boolean;
	preferForms?: string[];
	specify?: Ad;
}>();

// 广告操作放在右键菜单里，图上只保留“广告”标识。
function onContextmenu(ev: PointerEvent): void {
	if (props.plain || chosen.value == null) return;
	// 捕获阶段阻止内部链接抢先打开通用菜单。
	ev.stopPropagation();
	const items: MenuItem[] = [{
		type: 'label',
		text: i18n.tsx._ad.adsBy({ host }),
	}];
	if (chosen.value.ratio !== 0) {
		items.push({
			icon: 'ti ti-eye-minus',
			text: i18n.ts._ad.reduceFrequencyOfThisAd,
			action: reduceFrequency,
		});
	}
	os.contextMenu(items, ev);
}

const choseAd = (): Ad | null => {
	if (props.specify) {
		return props.specify;
	}

	const allAds = instance.ads.map(ad => store.s.mutedAds.includes(ad.id) ? {
		...ad,
		ratio: 0,
	} : ad);

	let ads = props.preferForms ? allAds.filter(ad => props.preferForms!.includes(ad.place)) : allAds;

	if (ads.length === 0) {
		ads = allAds.filter(ad => ad.place === 'square');
	}

	const lowPriorityAds = ads.filter(ad => ad.ratio === 0);
	ads = ads.filter(ad => ad.ratio !== 0);

	if (ads.length === 0) {
		if (lowPriorityAds.length !== 0) {
			return lowPriorityAds[Math.floor(Math.random() * lowPriorityAds.length)];
		} else {
			return null;
		}
	}

	const totalFactor = ads.reduce((a, b) => a + b.ratio, 0);
	const r = Math.random() * totalFactor;

	let stackedFactor = 0;
	for (const ad of ads) {
		if (r >= stackedFactor && r <= stackedFactor + ad.ratio) {
			return ad;
		} else {
			stackedFactor += ad.ratio;
		}
	}

	return null;
};

const chosen = ref(choseAd());

const self = computed(() => chosen.value?.url.startsWith(local));

const shouldHide = ref(!prefer.s.forceShowAds && $i && $i.policies.canHideAds && (props.specify == null));

function reduceFrequency(): void {
	if (chosen.value == null) return;
	if (store.s.mutedAds.includes(chosen.value.id)) return;
	store.push('mutedAds', chosen.value.id);
	os.toast(i18n.ts.applied, 'success');
	chosen.value = choseAd();
}
</script>

<style lang="scss" module>
.main {
	--ad-max-width: 100%;
	--ad-max-height: none;
	--ad-inset: 8px;
	// 角标压在广告图上，固定用深色半透明底，避免浅色主题或浅色图片上看不清。
	--ad-overlay-fg: white;
	--ad-overlay-bg: color-mix(in srgb, black 58%, transparent);
	--ad-overlay-border: color-mix(in srgb, white 42%, transparent);

	box-sizing: border-box;
	display: flex;
	justify-content: center;
	width: 100%;
	min-width: 0;

	&:not(.plain) {
		background-color: var(--MI_THEME-panel);
		background-image: repeating-linear-gradient(45deg, transparent, transparent 8px, var(--MI_THEME-bg) 8px, var(--MI_THEME-bg) 14px);
	}

	&:not(.plain):not(.fill) {
		padding: var(--MI-cardPadding);
	}

	&.fill {
		height: 100%;

		> .link {
			width: 100%;
			height: 100%;
			max-width: none;
			max-height: none;
		}

		> .link > .img {
			width: 100%;
			height: 100%;
			max-width: none;
			max-height: none;
			object-fit: cover;
		}

		&.square > .link > .img,
		&.vertical > .link > .img {
			object-fit: contain;
		}
	}

	&.plain {
		> .link {
			--ad-preview-checker: color-mix(in srgb, var(--MI_THEME-fg) 2%, transparent);

			background-color: var(--MI_THEME-bg);
			background-image: linear-gradient(45deg, var(--ad-preview-checker) 16.67%, var(--MI_THEME-bg) 16.67%, var(--MI_THEME-bg) 50%, var(--ad-preview-checker) 50%, var(--ad-preview-checker) 66.67%, var(--MI_THEME-bg) 66.67%, var(--MI_THEME-bg) 100%);
			background-size: 16px 16px;

			&:hover > .img {
				filter: none;
			}
		}
	}

	&.edgeToEdge {
		> .link {
			width: 100%;
			max-width: none;
			max-height: none;
		}

		> .link > .img {
			width: 100%;
			height: auto;
			max-width: none;
			max-height: none;
			object-fit: cover;
		}

		> .link > .label {
			top: var(--ad-inset);
			bottom: auto;
		}
	}

	&.square {
		--ad-max-width: min(300px, 100%);
		--ad-max-height: 300px;
	}

	&.horizontal {
		--ad-max-width: min(600px, 100%);
		--ad-max-height: 112px;
	}

	&.horizontalBig {
		--ad-max-width: min(600px, 100%);
		--ad-max-height: 250px;
	}

	&.vertical {
		--ad-max-width: min(100px, 100%);
		--ad-inset: 4px;
	}
}

.link {
	position: relative;
	display: block;
	width: fit-content;
	min-width: 0;
	max-width: var(--ad-max-width);
	max-height: var(--ad-max-height);
	background: transparent;
	overflow: clip;
	text-decoration: none;

	&:hover {
		text-decoration: none;

		> .img {
			filter: brightness(1.03);
		}
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: 3px;
	}
}

.img {
	display: block;
	width: auto;
	height: auto;
	max-width: 100%;
	max-height: var(--ad-max-height);
	object-fit: contain;
	transition: filter .18s ease;
}

.label {
	position: absolute;
	right: var(--ad-inset);
	bottom: var(--ad-inset);
	z-index: 1;
	padding: 0 4px;
	border: 1px solid var(--ad-overlay-border);
	border-radius: 3px;
	background: var(--ad-overlay-bg);
	color: var(--ad-overlay-fg);
	font-size: 10px;
	line-height: 14px;
	white-space: nowrap;
	// 只作标识，点击仍落到广告链接上。
	pointer-events: none;
}

.vertical .label {
	padding: 0 3px;
	font-size: 9px;
	line-height: 12px;
}

@media (prefers-reduced-motion: reduce) {
	.img {
		transition: none;
	}
}
</style>
