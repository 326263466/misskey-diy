<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<span :class="$style.television" aria-hidden="true">
	<!-- 耳を先に描き、頭 (プレイヤー本体) を後から重ねるので耳の根元は頭の下に隠れる -->
	<svg :class="$style.rabbit" viewBox="0 0 100 100">
		<!-- 左耳: 完整 -->
		<g :class="$style.earL">
			<path :class="$style.earShell" d="M 24 46 C 19 24 20 1 26 -13 C 28.5 -18 32.5 -18 35 -13 C 41 1 42 24 37 46 Z"/>
			<path :class="$style.earInner" d="M 27 44 C 23.5 23 24.5 4 29 -8 C 30.3 -11.5 32.3 -11.5 33.5 -8 C 38 4 39 23 34.5 44 Z"/>
		</g>
		<!-- 右耳: 耳尖向外折叠 (叠) -->
		<g :class="$style.earR">
			<path :class="$style.earShell" d="M 61 46 C 58.5 27 58.5 10 61.5 2 C 63.5 -2 68.5 -2 71 2 C 74 10 74 27 71.5 46 Z"/>
			<path :class="$style.earInner" d="M 63.5 44 C 61.5 26 61.5 11 64 4 C 65.5 1 68 1 69.5 4 C 72 11 72 26 70 44 Z"/>
			<path :class="$style.earShell" d="M 62 2 C 57.5 -8 62.5 -17 71.5 -17 C 79.5 -17 83 -9 78.5 -3 C 75 1.5 66.5 3.5 62 2 Z"/>
			<path :class="$style.earInner" d="M 64 1 C 60.5 -7.5 64.5 -14 71.5 -14 C 77.5 -14 80 -8.5 76.5 -4.5 C 73.5 -1 67 .5 64 1 Z"/>
		</g>
		<!-- 頭 = プレイヤー本体。耳より後に描くので不透明に覆い、根元の継ぎ目が出ない -->
		<path :class="$style.head" d="M 18 24 H 82 A 15 15 0 0 1 97 39 V 82 A 15 15 0 0 1 82 97 H 18 A 15 15 0 0 1 3 82 V 39 A 15 15 0 0 1 18 24 Z"/>
	</svg>
	<span :class="$style.face"><i class="ti ti-player-play-filled" :class="$style.triangle"></i></span>
</span>
</template>

<style lang="scss" module>
.television {
	color-scheme: light;
	position: relative;
	pointer-events: none;
	display: inline-block;
	width: 1em;
	height: 1em;
	scale: 1;
}

// 耳と頭で 1 つのグループ。opacity はグループ全体に掛かるので、
// 不透明な頭に隠れた耳の根元が透けることはない。
.rabbit {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	overflow: visible;
	opacity: .82;
	filter: drop-shadow(0 1px 2px color-mix(in srgb, CanvasText 32%, transparent));
}

.head,
.earShell {
	fill: Canvas;
}

.earInner {
	fill: #ff8fb7;
}

// 耳は平常時は頭の中に縮んで見えず、hover (--MI-mediaPlayHover は各プレイヤーの .animated hover時に 1)
// で斜めに伸びる。回転軸を頭の内側 (y=46) に置いているので、伸び縮みしても根元は常に頭の下。
.earL,
.earR {
	transform-box: view-box;
	transition: transform .45s cubic-bezier(.34, 1.5, .5, 1);
}

.earL {
	transform-origin: 30.5px 46px;
	transform: rotate(calc(-6deg - var(--MI-mediaPlayHover, 0) * 18deg)) scaleY(calc(.06 + var(--MI-mediaPlayHover, 0) * .94));
}

.earR {
	transform-origin: 66px 46px;
	transform: rotate(calc(5deg + var(--MI-mediaPlayHover, 0) * 16deg)) scaleY(calc(.06 + var(--MI-mediaPlayHover, 0) * .94));
}

.face {
	position: absolute;
	inset: 24% 0 3%;
	display: grid;
	place-items: center;
	color: color-mix(in srgb, CanvasText 70%, Canvas);
}

.triangle {
	font-size: .48em;
	line-height: 1;
	translate: .03em 0;
}
</style>
