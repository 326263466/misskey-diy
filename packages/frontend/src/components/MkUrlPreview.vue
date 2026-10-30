<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<template v-if="player.url && playerEnabled">
	<div
		:class="$style.player"
		:style="player.width ? `padding: ${(player.height || 0) / player.width * 100}% 0 0` : `padding: ${(player.height || 0)}px 0 0`"
	>
		<iframe
			v-if="player.url.startsWith('http://') || player.url.startsWith('https://')"
			sandbox="allow-popups allow-popups-to-escape-sandbox allow-scripts allow-storage-access-by-user-activation allow-same-origin"
			scrolling="no"
			:allow="player.allow == null ? 'autoplay;encrypted-media;fullscreen' : player.allow.filter(x => ['autoplay', 'clipboard-write', 'fullscreen', 'encrypted-media', 'picture-in-picture', 'web-share'].includes(x)).join(';')"
			:class="$style.playerIframe"
			:src="transformPlayerUrl(player.url)"
			:style="{ border: 0 }"
		></iframe>
		<span v-else>{{ i18n.ts.invalidUrl }}</span>
	</div>
	<div :class="$style.action">
		<MkButton :small="true" inline @click="playerEnabled = false">
			<i class="ti ti-x"></i> {{ i18n.ts.disablePlayer }}
		</MkButton>
	</div>
</template>
<template v-else-if="tweetId && tweetExpanded">
	<div>
		<iframe
			allow="fullscreen;web-share"
			sandbox="allow-popups allow-popups-to-escape-sandbox allow-scripts allow-same-origin"
			scrolling="no"
			:style="{ position: 'relative', width: '100%', height: `${tweetHeight}px`, border: 0 }"
			:src="`https://platform.twitter.com/embed/index.html?embedId=${embedId}&amp;hideCard=false&amp;hideThread=false&amp;lang=en&amp;theme=${store.s.darkMode ? 'dark' : 'light'}&amp;id=${tweetId}`"
		></iframe>
	</div>
	<div :class="$style.action">
		<MkButton :small="true" inline @click="tweetExpanded = false">
			<i class="ti ti-x"></i> {{ i18n.ts.close }}
		</MkButton>
	</div>
</template>
<div v-else>
	<component :is="self ? 'MkA' : 'a'" :class="[$style.link, { [$style.compact]: compact }]" :[attr]="maybeRelativeUrl" rel="nofollow noopener" :target="target" :title="url" @click="confirmExternalLink" @auxclick="confirmExternalLink">
		<div v-if="thumbnail && !sensitive" class="_imageContainer" :class="$style.thumbnail">
			<img v-if="!prefer.s.dataSaver.urlPreviewThumbnail" class="_imageBackground" :src="thumbnail" alt=""/>
		</div>
		<article :class="$style.body">
			<footer :class="$style.footer">
				<span :class="$style.siteBadge" aria-hidden="true">
					<img v-if="icon" :class="$style.siteIcon" :src="icon" alt=""/>
					<i v-else class="ti ti-world"></i>
				</span>
				<p :class="$style.siteName" :title="siteAddress">{{ siteAddress }}</p>
				<i class="ti ti-arrow-up-right" :class="$style.externalIcon" aria-hidden="true"></i>
			</footer>
			<div :class="$style.copy">
				<header :class="$style.header">
					<h1 v-if="fetching" :class="$style.title"><MkEllipsis/></h1>
					<h1 v-else :class="$style.title" :title="title">{{ title }}</h1>
				</header>
				<p v-if="fetching" :class="$style.text"><MkEllipsis/></p>
				<p v-else :class="$style.text" :title="description">{{ description }}</p>
			</div>
		</article>
	</component>
	<template v-if="showActions">
		<div v-if="tweetId" :class="$style.action">
			<MkButton :small="true" inline @click="tweetExpanded = true">
				<i class="ti ti-brand-x"></i> {{ i18n.ts.expandTweet }}
			</MkButton>
		</div>
		<div v-if="!playerEnabled && player.url" :class="$style.action">
			<MkButton :small="true" inline @click="playerEnabled = true">
				<i class="ti ti-player-play"></i> {{ i18n.ts.enablePlayer }}
			</MkButton>
			<MkButton v-if="!isMobile" :small="true" inline @click="openPlayer()">
				<i class="ti ti-picture-in-picture"></i> {{ i18n.ts.openInWindow }}
			</MkButton>
		</div>
	</template>
</div>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, onDeactivated, onUnmounted, ref } from 'vue';
import { url as local } from '@@/js/config.js';
import { versatileLang } from '@@/js/intl-const.js';
import type { SummalyResult } from '@misskey-dev/summaly';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { deviceKind } from '@/utility/device-kind.js';
import MkButton from '@/components/MkButton.vue';
import { transformPlayerUrl } from '@/utility/url-preview.js';
import { getUrlPreviewRequestUrl, getUrlPreviewTitle, urlPreviewCache } from '@/utility/url-preview-cache.js';
import { store } from '@/store.js';
import { prefer } from '@/preferences.js';
import { maybeMakeRelative } from '@@/js/url.js';
import { confirmExternalLink } from '@/utility/external-link.js';

const props = withDefaults(defineProps<{
	url: string;
	detail?: boolean;
	compact?: boolean;
	showActions?: boolean;
}>(), {
	detail: false,
	compact: false,
	showActions: true,
});

const MOBILE_THRESHOLD = 500;
const isMobile = ref(deviceKind === 'smartphone' || window.innerWidth <= MOBILE_THRESHOLD);

const maybeRelativeUrl = maybeMakeRelative(props.url, local);
const self = maybeRelativeUrl !== props.url;
const attr = self ? 'to' : 'href';
const target = self ? null : '_blank';
const requestUrl = new URL(props.url, window.location.href);
const siteAddress = requestUrl.host;
const previewRequestUrl = getUrlPreviewRequestUrl(requestUrl);
const fetching = ref(true);
const summalyResult = ref<SummalyResult | null>(null);
const title = computed(() => getUrlPreviewTitle(summalyResult.value, props.url) ?? i18n.ts.urlPreviewFallbackTitle);
const description = computed(() => summalyResult.value?.description?.trim() || i18n.ts.urlPreviewFallbackDescription);
const thumbnail = computed(() => summalyResult.value?.thumbnail ?? null);
const icon = computed(() => summalyResult.value?.icon ?? null);
const sensitive = computed(() => summalyResult.value?.sensitive ?? false);
const player = computed(() => summalyResult.value?.player ?? { url: null, width: null, height: null });
const playerEnabled = ref(false);
const tweetId = ref<string | null>(null);
const tweetExpanded = ref(props.detail);
const embedId = `embed${Math.random().toString().replace(/\D/, '')}`;
const tweetHeight = ref(150);

onDeactivated(() => {
	playerEnabled.value = false;
});

if (!['http:', 'https:'].includes(requestUrl.protocol)) throw new Error('invalid url');

if (requestUrl.hostname === 'twitter.com' || requestUrl.hostname === 'mobile.twitter.com' || requestUrl.hostname === 'x.com' || requestUrl.hostname === 'mobile.x.com') {
	const m = requestUrl.pathname.match(/^\/.+\/status(?:es)?\/(\d+)/);
	if (m) tweetId.value = m[1];
}

let disposed = false;
const cachedPreview = urlPreviewCache.get(previewRequestUrl, versatileLang);
if (cachedPreview) {
	summalyResult.value = cachedPreview;
	fetching.value = false;
}
const previewRequest = cachedPreview ? null : urlPreviewCache.request(previewRequestUrl, versatileLang);

previewRequest?.promise
	.then((info: SummalyResult | null) => {
		if (disposed) return;
		fetching.value = false;
		summalyResult.value = info;
	})
	.catch(() => {
		if (disposed) return;
		fetching.value = false;
	});

function adjustTweetHeight(message: MessageEvent) {
	if (message.origin !== 'https://platform.twitter.com') return;
	const embed = message.data?.['twttr.embed'];
	if (embed?.method !== 'twttr.private.resize') return;
	if (embed?.id !== embedId) return;
	const height = embed?.params[0]?.height;
	if (height) tweetHeight.value = height;
}

function openPlayer(): void {
	if (!summalyResult.value) return;

	const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkYouTubePlayer.vue')), {
		urlOrSummalyResult: summalyResult.value,
	}, {
		closed: () => {
			dispose();
		},
	});
}

window.addEventListener('message', adjustTweetHeight);

onUnmounted(() => {
	disposed = true;
	previewRequest?.release();
	window.removeEventListener('message', adjustTweetHeight);
});
</script>

<style lang="scss" module>
.player {
	position: relative;
	width: 100%;
}

.playerIframe {
	height: 100%;
	left: 0;
	position: absolute;
	top: 0;
	width: 100%;
}

.link {
	position: relative;
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	margin-block: var(--MI-urlPreviewMarginBlock, 4px);
	padding: 0;
	font-size: 14px;
	line-height: 1.4;
	border: var(--MI-dividerWidth) solid color-mix(in srgb, var(--MI_THEME-accent) 20%, var(--MI_THEME-divider)); // divider-exempt: accent-mixed card border
	border-radius: calc(var(--MI-radius) * .82);
	background:
		linear-gradient(135deg, color-mix(in srgb, var(--MI_THEME-accent) 6%, var(--MI_THEME-panelHighlight)), var(--MI_THEME-panelHighlight) 58%),
		var(--MI_THEME-panelHighlight);
	overflow: clip;
	text-align: left;
	isolation: isolate;

	&::before {
		content: '';
		position: absolute;
		inset: 13px auto 13px 0;
		width: 3px;
		border-radius: 0 999px 999px 0;
		background: color-mix(in srgb, var(--MI_THEME-accent) 74%, var(--MI_THEME-divider)); // divider-exempt: accent bar
	}

	&.compact {
		> .thumbnail {
			width: 104px;
			min-height: 72px;
		}

		> .body {
			> .copy > .header > .title {
				display: block;
				overflow: hidden;
				white-space: nowrap;
				text-overflow: ellipsis;
			}

			> .copy > .text {
				-webkit-line-clamp: 1;
			}
		}
	}
}

.thumbnail {
	grid-column: 2;
	grid-row: 1;
	flex: none;
	align-self: stretch;
	position: relative;
	width: 136px;
	min-height: 84px;
	border-left: var(--MI-dividerWidth) solid color-mix(in srgb, var(--MI_THEME-accent) 14%, var(--MI_THEME-divider)); // divider-exempt: accent-mixed media divider
	// 与帖子图片同样的斜纹底，透明或不铺满的图片也能看出图片区域。
	background-color: var(--MI_THEME-bg);
	background-size: 16px 16px;
	display: flex;
	justify-content: center;
	align-items: center;

	&::after {
		content: '';
		position: absolute;
		inset: 0;
		z-index: 1;
		pointer-events: none;
		background: linear-gradient(
			90deg,
			color-mix(in srgb, var(--MI_THEME-panelHighlight) 38%, transparent),
			transparent 32%
		);
	}
}

html[data-color-scheme=dark] .thumbnail {
	--c: rgb(255 255 255 / 2%);
	background-image: linear-gradient(45deg, var(--c) 16.67%, var(--MI_THEME-bg) 16.67%, var(--MI_THEME-bg) 50%, var(--c) 50%, var(--c) 66.67%, var(--MI_THEME-bg) 66.67%, var(--MI_THEME-bg) 100%);
}

html[data-color-scheme=light] .thumbnail {
	--c: rgb(0 0 0 / 2%);
	background-image: linear-gradient(45deg, var(--c) 16.67%, var(--MI_THEME-bg) 16.67%, var(--MI_THEME-bg) 50%, var(--c) 50%, var(--c) 66.67%, var(--MI_THEME-bg) 66.67%, var(--MI_THEME-bg) 100%);
}

.body {
	grid-column: 1;
	grid-row: 1;
	display: flex;
	flex-direction: column;
	gap: 5px;
	flex: 1;
	min-width: 0;
	justify-content: center;
	padding: 11px 14px 11px 18px;
	box-sizing: border-box;
	overflow-wrap: anywhere;
}

.copy {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
}

.header {
	margin: 0;
}

.title {
	margin: 0;
	font-size: 1.02em;
	font-weight: 700;
	line-height: 1.45;
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	overflow: hidden;
	color: var(--MI_THEME-fgHighlighted);
}

.text {
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	overflow: hidden;
	margin: 0;
	color: var(--MI_THEME-fgTransparent);
	font-size: .9em;
	line-height: 1.5;
}

.footer {
	display: flex;
	align-items: center;
	gap: 7px;
	min-width: 0;
	margin: 0;
	color: var(--MI_THEME-fgTransparentWeak);
}

.siteBadge {
	display: grid;
	place-items: center;
	flex: none;
	width: 20px;
	height: 20px;
	box-sizing: border-box;
	border: 1px solid color-mix(in srgb, var(--MI_THEME-accent) 22%, transparent);
	border-radius: 7px;
	color: var(--MI_THEME-accent);
	background: linear-gradient(
		145deg,
		color-mix(in srgb, var(--MI_THEME-accent) 17%, var(--MI_THEME-panel)),
		color-mix(in srgb, var(--MI_THEME-accent) 7%, var(--MI_THEME-panel))
	);

	> i {
		font-size: 14px;
	}
}

.siteIcon {
	display: block;
	width: 16px;
	height: 16px;
	flex: none;
	object-fit: contain;
}

.siteName {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
	margin: 0;
	font-size: .82em;
	line-height: 1.4;
}

.externalIcon {
	flex: none;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 14px;
}

.action {
	display: flex;
	gap: 6px;
	flex-wrap: wrap;
	margin-top: 6px;
}

@container (max-width: 400px) {
	.link {
		font-size: 12px;
	}

	.thumbnail {
		width: 122px;
		min-height: 78px;
	}

	.body {
		padding: 9px 10px 9px 15px;
	}
}

@container (max-width: 350px) {
	.link {
		gap: 8px;

		&.compact {
			> .thumbnail {
				width: 68px;
			}
		}
	}

	.thumbnail {
		width: 88px;
		min-height: 66px;
	}

	.siteIcon {
		width: 12px;
		height: 12px;
	}

	.siteBadge {
		width: 18px;
		height: 18px;
	}

	.externalIcon {
		display: none;
	}
}

</style>
