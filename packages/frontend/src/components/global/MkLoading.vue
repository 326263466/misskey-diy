<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.root, { [$style.inModal]: inModal, [$style.inline]: inline, [$style.colored]: colored, [$style.mini]: mini, [$style.em]: em, [$style.page]: page, [$style.imagePlaceholder]: page && !!instance.infoImageUrl }]" role="status" aria-busy="true">
	<span v-if="inModal">{{ i18n.ts.loading }}</span>
	<div v-else :class="$style.container">
		<svg :class="[$style.spinner, $style.bg]" viewBox="0 0 168 168" xmlns="http://www.w3.org/2000/svg">
			<g transform="matrix(1.125,0,0,1.125,12,12)">
				<circle cx="64" cy="64" r="64" style="fill:none;stroke:currentColor;stroke-width:21.33px;"/>
			</g>
		</svg>
		<svg :class="[$style.spinner, $style.fg, { [$style.static]: static }]" viewBox="0 0 168 168" xmlns="http://www.w3.org/2000/svg">
			<g transform="matrix(1.125,0,0,1.125,12,12)">
				<path d="M128,64C128,28.654 99.346,0 64,0C99.346,0 128,28.654 128,64Z" style="fill:none;stroke:currentColor;stroke-width:21.33px;"/>
			</g>
		</svg>
	</div>
	<slot></slot>
</div>
</template>

<script lang="ts" setup>
import { inject } from 'vue';
import { instance } from '@/instance.js';
import { DI } from '@/di.js';
import { i18n } from '@/i18n.js';

const inModal = inject(DI.inModal, false) || inject('inWindow', false);

const props = withDefaults(defineProps<{
	static?: boolean;
	inline?: boolean;
	colored?: boolean;
	mini?: boolean;
	em?: boolean;
	page?: boolean;
}>(), {
	static: false,
	inline: false,
	colored: true,
	mini: false,
	em: false,
	page: false,
});
</script>

<style lang="scss" module>
@use "../../styles/page-state.scss";

@keyframes spinner {
	0% {
		transform: rotate(0deg);
	}
	100% {
		transform: rotate(360deg);
	}
}

.root {
	padding: 32px;
	text-align: center;
	cursor: wait;

	--size: 38px;

	&.colored {
		color: var(--MI_THEME-accent);
	}

	&.inline {
		display: inline;
		padding: 0;
		--size: 32px;
	}

	&.mini {
		padding: 16px;
		--size: 32px;
	}

	&.em {
		display: inline-block;
		vertical-align: middle;
		padding: 0;
		--size: 1em;
	}
}

.page {
	@include page-state.surface;

	.container {
		@include page-state.icon;
	}

	.spinner {
		top: calc(50% - var(--size) / 2);
		left: calc(50% - var(--size) / 2);
	}
}

.root.inModal {
	padding: 12px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 13px;
	line-height: 1.5;

	&.em, &.inline {
		padding: 0;
		font-size: inherit;
	}
}

.imagePlaceholder .container {
	width: 128px;
	height: 128px;
	margin-bottom: 16px;
}

.container {
	position: relative;
	width: var(--size);
	height: var(--size);
	margin: 0 auto;
}

.spinner {
	position: absolute;
	top: 0;
	left: 0;
	width: var(--size);
	height: var(--size);
	fill-rule: evenodd;
	clip-rule: evenodd;
	stroke-linecap: round;
	stroke-linejoin: round;
	stroke-miterlimit: 1.5;
}

.bg {
	opacity: 0.275;
}

.fg {
	animation: spinner 0.5s linear infinite;

	&.static {
		animation-play-state: paused;
	}
}
</style>
