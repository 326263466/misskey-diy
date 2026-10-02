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
	<div ref="twitter">
		<iframe
			ref="tweet"
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
		<div v-if="thumbnail && !sensitive" :class="$style.thumbnail" :style="prefer.s.dataSaver.urlPreviewThumbnail ? '' : { backgroundImage: `url('${thumbnail}')` }">
		</div>
		<article :class="$style.body">
			<header :class="$style.header">
				<h1 v-if="unknownUrl" :class="$style.title">{{ url }}</h1>
				<h1 v-else-if="fetching" :class="$style.title"><MkEllipsis/></h1>
				<h1 v-else :class="$style.title" :title="title ?? undefined">{{ title }}</h1>
			</header>
			<p v-if="unknownUrl" :class="$style.text">{{ i18n.ts.failedToPreviewUrl }}</p>
			<p v-else-if="fetching" :class="$style.text"><MkEllipsis/></p>
			<p v-else-if="description?.trim()" :class="$style.text" :title="description">{{ description }}</p>
			<footer :class="$style.footer">
				<img v-if="icon" :class="$style.siteIcon" :src="icon"/>
				<p v-if="unknownUrl" :class="$style.siteName">{{ requestUrl.host }}</p>
				<p v-else-if="fetching" :class="$style.siteName"><MkEllipsis/></p>
				<p v-else :class="$style.siteName" :title="sitename ?? requestUrl.host">{{ sitename ?? requestUrl.host }}</p>
			</footer>
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
const fetching = ref(true);
const summalyResult = ref<SummalyResult | null>(null);
const title = computed(() => summalyResult.value?.title ?? null);
const description = computed(() => summalyResult.value?.description ?? null);
const thumbnail = computed(() => summalyResult.value?.thumbnail ?? null);
const icon = computed(() => summalyResult.value?.icon ?? null);
const sitename = computed(() => summalyResult.value?.sitename ?? null);
const sensitive = computed(() => summalyResult.value?.sensitive ?? false);
const player = computed(() => summalyResult.value?.player ?? { url: null, width: null, height: null });
const playerEnabled = ref(false);
const tweetId = ref<string | null>(null);
const tweetExpanded = ref(props.detail);
const embedId = `embed${Math.random().toString().replace(/\D/, '')}`;
const tweetHeight = ref(150);
const unknownUrl = ref(false);

onDeactivated(() => {
	playerEnabled.value = false;
});

const requestUrl = new URL(props.url, window.location.href);
if (!['http:', 'https:'].includes(requestUrl.protocol)) throw new Error('invalid url');

if (requestUrl.hostname === 'twitter.com' || requestUrl.hostname === 'mobile.twitter.com' || requestUrl.hostname === 'x.com' || requestUrl.hostname === 'mobile.x.com') {
	const m = requestUrl.pathname.match(/^\/.+\/status(?:es)?\/(\d+)/);
	if (m) tweetId.value = m[1];
}

if (requestUrl.hostname === 'music.youtube.com' && requestUrl.pathname.match('^/(?:watch|channel)')) {
	requestUrl.hostname = 'www.youtube.com';
}

requestUrl.hash = '';

let disposed = false;
const requestController = new AbortController();
const requestTimeout = window.setTimeout(() => requestController.abort(), 30000);

window.fetch(`/url?url=${encodeURIComponent(requestUrl.href)}&lang=${versatileLang}`, { signal: requestController.signal, cache: 'no-cache' })
	.then(res => {
		if (!res.ok) {
			if (_DEV_) {
				console.warn(`[HTTP${res.status}] Failed to fetch url preview`);
			}
			return null;
		}

		return res.json();
	})
	.then((info: SummalyResult | null) => {
		if (disposed) return;
		if (!info || info.url == null) {
			fetching.value = false;
			unknownUrl.value = true;
			return;
		}

		fetching.value = false;
		unknownUrl.value = false;

		summalyResult.value = info;
	})
	.catch(() => {
		if (disposed) return;
		fetching.value = false;
		unknownUrl.value = true;
	})
	.finally(() => {
		window.clearTimeout(requestTimeout);
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
	window.clearTimeout(requestTimeout);
	requestController.abort();
	window.removeEventListener('message', adjustTweetHeight);
});
</script>

<style lang="scss" module>
.player {
	position: relative;
	width: 100%;
}

.disablePlayer {
	position: absolute;
	top: -1.5em;
	right: 0;
	font-size: 1em;
	width: 1.5em;
	height: 1.5em;
	padding: 0;
	margin: 0;
	color: var(--MI_THEME-fgTransparentWeak);
	background: var(--MI_THEME-buttonBg);

	&:hover {
		color: var(--MI_THEME-fgHighlighted);
		background: var(--MI_THEME-buttonHoverBg);
	}
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
	display: flex;
	flex-direction: row-reverse;
	align-items: stretch;
	gap: 12px;
	padding: 6px 8px;
	font-size: 14px;
	line-height: 1.4;
	border-left: 4px solid var(--MI_THEME-accent);
	background: var(--MI_THEME-accentedBg);
	border-radius: calc(var(--MI-radius) / 3);
	overflow: clip;
	text-align: left;

	&:hover {
		text-decoration: none;

		> .body > .header > .title {
			text-decoration: underline;
		}
	}

	&.compact {
		> .body {
			> .header .title, .footer {
				overflow: hidden;
				white-space: nowrap;
				text-overflow: ellipsis;
			}
		}
	}
}

.thumbnail {
	flex: none;
	width: 100px;
	height: auto;
	border-radius: calc(var(--MI-radius) / 3);
	background-position: center;
	background-size: contain;
	background-repeat: no-repeat;
	background-color: var(--MI_THEME-bg);
	display: flex;
	justify-content: center;
	align-items: center;
}

.body {
	display: flex;
	flex-direction: column;
	flex: 1;
	min-width: 0;
	box-sizing: border-box;
	overflow-wrap: anywhere;
}

.header {
	margin: 0;
}

.title {
	margin: 0;
	font-size: 1em;
}

.text {
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	overflow: hidden;
	margin: 0;
	color: var(--MI_THEME-fgTransparent);
	font-size: 1em;
	line-height: 1.4;
}

.footer {
	order: -1;
	display: flex;
	align-items: center;
	gap: 4px;
	margin: 0;
	color: var(--MI_THEME-accent);
}

.siteIcon {
	display: none;
	width: 16px;
	height: 16px;
	flex: none;
	vertical-align: top;
}

.siteName {
	min-width: 0;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
	margin: 0;
	font-size: 1em;
	line-height: 1.4;
	vertical-align: top;
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
		width: 80px;
	}
}

@container (max-width: 350px) {
	.link {
		gap: 8px;

		&.compact {
			> .thumbnail {
				width: 56px;
			}
		}
	}

	.thumbnail {
		width: 70px;
	}

	.siteIcon {
		width: 12px;
		height: 12px;
	}
}
</style>
