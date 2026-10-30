<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader class="_standalonePage" hideHeader>
	<div class="_pageBody" :class="$style.root">
		<header :class="$style.hero">
			<span :class="$style.heroIcon" aria-hidden="true"><i class="ti ti-device-gamepad-2"></i></span>
			<div>
				<h1 :class="$style.heroTitle">{{ i18n.ts.games }}</h1>
				<p :class="$style.heroDescription">{{ i18n.ts._games.description }}</p>
			</div>
		</header>

		<ul :class="$style.grid">
			<li v-for="game in games" :key="game.to">
				<MkA :to="game.to" class="_panel" :class="$style.card" :style="{ '--MI-gameTint': game.tint }">
					<div :class="$style.cover">
						<img :src="game.logo" alt="" :class="$style.logo"/>
					</div>
					<div :class="$style.body">
						<div :class="$style.titleRow">
							<h2 :class="$style.title">{{ game.title }}</h2>
							<span :class="$style.mode"><i :class="game.modeIcon" aria-hidden="true"></i>{{ game.mode }}</span>
						</div>
						<p :class="$style.description">{{ game.description }}</p>
						<span :class="$style.action">
							<template v-if="game.loginRequired && !$i"><i class="ti ti-lock" aria-hidden="true"></i>{{ i18n.ts._games.needSignIn }}</template>
							<template v-else>{{ i18n.ts._games.play }}<i class="ti ti-arrow-right" aria-hidden="true"></i></template>
						</span>
					</div>
				</MkA>
			</li>
		</ul>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';

// 游戏数量少，不需要左侧菜单；每个游戏以大卡片展示，整张卡片可点击进入。
const games = [{
	to: '/bubble-game',
	title: i18n.ts.bubbleGame,
	description: i18n.ts._games.bubbleGameDescription,
	logo: '/client-assets/drop-and-fusion/logo.png',
	mode: i18n.ts._games.singlePlayer,
	modeIcon: 'ti ti-user',
	tint: 'var(--MI_THEME-warn)',
	loginRequired: true,
}, {
	to: '/reversi',
	title: i18n.ts._reversi.reversi,
	description: i18n.ts._games.reversiDescription,
	logo: '/client-assets/reversi/logo.png',
	mode: i18n.ts._games.multiplayer,
	modeIcon: 'ti ti-users',
	tint: 'var(--MI_THEME-success)',
	loginRequired: false,
}];

definePage(() => ({
	title: i18n.ts.games,
	icon: 'ti ti-device-gamepad',
}));
</script>

<style lang="scss" module>
.root {
	container-type: inline-size;
	max-width: var(--MI-pageWidth);
	margin-inline: auto;
	padding-bottom: var(--MI-pageBottomInset, 32px);
	box-sizing: border-box;
}

.hero {
	display: flex;
	align-items: center;
	gap: 16px;
	margin-bottom: var(--MI-pageGap);
	padding: 24px var(--MI-cardPadding);
	border-radius: var(--MI-cardRadius);
	background: linear-gradient(120deg, var(--MI_THEME-accentedBg), var(--MI_THEME-panel) 70%);
}

.heroIcon {
	display: grid;
	flex-shrink: 0;
	place-items: center;
	width: 52px;
	height: 52px;
	border-radius: 14px;
	background: var(--MI_THEME-accent);
	color: var(--MI_THEME-fgOnAccent);
	font-size: 28px;
}

.heroTitle {
	margin: 0;
	font-size: 1.5em;
	font-weight: 700;
	line-height: 1.4;
}

.heroDescription {
	margin: 4px 0 0;
	color: var(--MI_THEME-fgTransparentWeak);
	line-height: 1.6;
}

.grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: var(--MI-pageGap);
	margin: 0;
	padding: 0;
	list-style: none;

	@container (max-width: 640px) {
		grid-template-columns: minmax(0, 1fr);
	}
}

.card {
	display: flex;
	flex-direction: column;
	height: 100%;
	overflow: clip;
	border-radius: var(--MI-cardRadius);
	color: var(--MI_THEME-fg);
	transition: box-shadow .15s ease, transform .15s ease;

	&:hover {
		text-decoration: none;
		box-shadow: 0 8px 24px var(--MI_THEME-shadow);
		transform: translateY(-2px);

		.logo { transform: scale(1.04); }
		.action { gap: 10px; }
	}

	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: 2px; }
}

.cover {
	display: grid;
	place-items: center;
	aspect-ratio: 16 / 7;
	padding: 20px;
	box-sizing: border-box;
	background:
		radial-gradient(circle at 30% 20%, color-mix(in srgb, var(--MI-gameTint) 22%, transparent), transparent 60%),
		color-mix(in srgb, var(--MI-gameTint) 8%, var(--MI_THEME-panel));
}

.logo {
	display: block;
	max-width: 80%;
	max-height: 100%;
	object-fit: contain;
	transition: transform .2s ease;
}

.body {
	display: flex;
	flex: 1;
	flex-direction: column;
	gap: 8px;
	padding: 16px var(--MI-cardPadding) 18px;
}

.titleRow {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.title {
	margin: 0;
	font-size: 1.15em;
	font-weight: 700;
}

.mode {
	display: inline-flex;
	flex-shrink: 0;
	align-items: center;
	gap: 4px;
	padding: 2px 8px;
	border-radius: 999px;
	background: color-mix(in srgb, var(--MI-gameTint) 12%, transparent);
	color: var(--MI-gameTint);
	font-size: .9em;
}

.description {
	flex: 1;
	margin: 0;
	color: var(--MI_THEME-fgTransparentWeak);
	line-height: 1.7;
}

.action {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	margin-top: 4px;
	color: var(--MI_THEME-accent);
	font-weight: 600;
	transition: gap .15s ease;
}

@media (prefers-reduced-motion: reduce) {
	.card, .logo, .action { transition: none; }

	.card:hover { transform: none; }
}
</style>
