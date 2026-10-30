<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard>
	<div class="_pageBody" :class="$style.page">
		<header :class="$style.intro">
			<div>
				<h1>{{ i18n.ts._ad.advertise }}</h1>
				<p>{{ i18n.ts._ad.advertiseDescription }}</p>
			</div>
			<button type="button" :class="$style.cta" aria-haspopup="dialog" @click="openContact">
				{{ i18n.ts._ad.advertise }}
				<i class="ti ti-message-circle" aria-hidden="true"></i>
			</button>
		</header>

		<section :class="$style.section">
			<header :class="$style.sectionHeader">
				<h2>{{ i18n.ts._ad.processTitle }}</h2>
			</header>
			<ol :class="$style.processList">
				<li>
					<span :class="$style.stepNo" aria-hidden="true">01</span>
					<div>
						<strong>{{ i18n.ts._ad.processContact }}</strong>
						<p>{{ i18n.ts._ad.processContactDescription }}</p>
					</div>
				</li>
				<li>
					<span :class="$style.stepNo" aria-hidden="true">02</span>
					<div>
						<strong>{{ i18n.ts._ad.processAssets }}</strong>
						<p>{{ i18n.ts._ad.processAssetsDescription }}</p>
					</div>
				</li>
				<li>
					<span :class="$style.stepNo" aria-hidden="true">03</span>
					<div>
						<strong>{{ i18n.ts._ad.processLaunch }}</strong>
						<p>{{ i18n.ts._ad.processLaunchDescription }}</p>
					</div>
				</li>
			</ol>
		</section>

		<section :class="$style.section">
			<header :class="$style.sectionHeader">
				<h2>{{ i18n.ts._ad.placements }}</h2>
			</header>
			<ul :class="$style.formatGrid">
				<li>
					<span :class="$style.shapeBox" aria-hidden="true"><span :class="[$style.shape, $style.shapeHorizontal]"></span></span>
					<span>{{ i18n.ts._ad.placeHorizontal }}</span>
				</li>
				<li>
					<span :class="$style.shapeBox" aria-hidden="true"><span :class="[$style.shape, $style.shapeHorizontalBig]"></span></span>
					<span>{{ i18n.ts._ad.placeHorizontalBig }}</span>
				</li>
				<li>
					<span :class="$style.shapeBox" aria-hidden="true"><span :class="[$style.shape, $style.shapeSquare]"></span></span>
					<span>{{ i18n.ts._ad.placeSquare }}</span>
				</li>
				<li>
					<span :class="$style.shapeBox" aria-hidden="true"><span :class="[$style.shape, $style.shapeVertical]"></span></span>
					<span>{{ i18n.ts._ad.placeVertical }}</span>
				</li>
			</ul>
		</section>

	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import * as os from '@/os.js';

function openContact(): void {
	const contactInfo: string[] = [];

	if (instance.inquiryUrl) {
		contactInfo.push(`${i18n.ts._serverSettings.inquiryUrl}: ${instance.inquiryUrl}`);
	}
	if (instance.maintainerEmail) {
		contactInfo.push(`${i18n.ts.email}: ${instance.maintainerEmail}`);
	}

	void os.alert({
		type: 'info',
		title: i18n.ts.contact,
		text: contactInfo.length > 0 ? contactInfo.join('\n\n') : i18n.ts.none,
	});
}

definePage(() => ({
	title: i18n.ts.ads,
	icon: 'ti ti-ad',
}));
</script>

<style lang="scss" module>
.page {
	display: flex;
	flex-direction: column;
	gap: 32px;
	width: 100%;
	min-width: 0;
}

.intro {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	align-items: end;
	gap: 24px;
	padding: 2px 2px 24px;
	border-bottom: 1px solid color-mix(in srgb, var(--MI_THEME-fg) 8%, transparent);

	> div {
		min-width: 0;
	}

	> div > h1 {
		margin: 0;
		color: var(--MI_THEME-fg);
		font-size: 36px;
		font-weight: 800;
		line-height: 1.2;
		letter-spacing: -.02em;
	}

	> div > p {
		margin: 10px 0 0;
		max-width: 44em;
		color: var(--MI_THEME-fgTransparentWeak);
		font-size: 14px;
		line-height: 1.7;
	}
}

.cta {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 7px;
	box-sizing: border-box;
	padding: 9px 18px;
	border: 0;
	border-radius: 999px;
	background: var(--MI_THEME-accent);
	color: var(--MI_THEME-fgOnAccent);
	font-family: inherit;
	font-size: 13px;
	font-weight: 700;
	line-height: 20px;
	text-decoration: none;
	white-space: nowrap;
	cursor: pointer;
	transition: filter .15s ease;

	> i {
		font-size: 15px;
	}

	&:hover {
		text-decoration: none;
		filter: brightness(1.06);
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: 2px;
	}
}

.section {
	min-width: 0;
}

.sectionHeader {
	margin-bottom: 14px;

	> h2 {
		margin: 0;
		color: var(--MI_THEME-fg);
		font-size: 19px;
		font-weight: 700;
		line-height: 1.35;
	}
}

.processList {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	margin: 0;
	padding: 0;
	list-style: none;

	> li {
		display: grid;
		grid-template-columns: 36px minmax(0, 1fr);
		gap: 12px;
		min-width: 0;
		padding: 0 22px;
		border-left: 1px solid color-mix(in srgb, var(--MI_THEME-fg) 8%, transparent);
	}

	> li:first-child {
		padding-left: 0;
		border-left: 0;
	}

	> li:last-child {
		padding-right: 0;
	}

	> li > div {
		min-width: 0;
	}

	strong {
		display: block;
		color: var(--MI_THEME-fg);
		font-size: 14px;
		font-weight: 700;
		line-height: 1.5;
	}

	p {
		margin: 3px 0 0;
		color: var(--MI_THEME-fgTransparentWeak);
		font-size: 12px;
		line-height: 1.65;
	}
}

.stepNo {
	display: grid;
	place-items: center;
	width: 36px;
	height: 36px;
	border-radius: 50%;
	background: color-mix(in srgb, var(--MI_THEME-accent) 9%, transparent);
	color: var(--MI_THEME-accent);
	font-size: 11px;
	font-weight: 700;
	line-height: 1;
}

.formatGrid {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 12px;
	margin: 0;
	padding: 0;
	list-style: none;

	> li {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
		box-sizing: border-box;
		padding: 16px;
		border-radius: var(--MI-cardRadius);
		background: var(--MI_THEME-panelHighlight);
		color: var(--MI_THEME-fg);
		font-size: 13px;
		font-weight: 600;
		line-height: 1.4;
	}
}

.shapeBox {
	display: grid;
	flex: none;
	place-items: center;
	width: 46px;
	height: 36px;
	border-radius: 7px;
	background: var(--MI_THEME-panel);
}

.shape {
	display: block;
	border-radius: 3px;
	background: color-mix(in srgb, var(--MI_THEME-accent) 24%, transparent);
}

.shapeHorizontal {
	width: 30px;
	height: 10px;
}

.shapeHorizontalBig {
	width: 30px;
	height: 17px;
}

.shapeSquare {
	width: 19px;
	height: 19px;
}

.shapeVertical {
	width: 11px;
	height: 25px;
}

@container (max-width: 760px) {
	.intro {
		grid-template-columns: minmax(0, 1fr);
		align-items: start;
	}

	.cta {
		justify-self: start;
	}

	.processList {
		grid-template-columns: minmax(0, 1fr);
		gap: 18px;
	}

	.processList > li {
		padding: 0 0 18px;
		border-bottom: 1px solid color-mix(in srgb, var(--MI_THEME-fg) 8%, transparent);
		border-left: 0;
	}

	.processList > li:last-child {
		padding-bottom: 0;
		border-bottom: 0;
	}

	.formatGrid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@container (max-width: 480px) {
	.intro > div > h1 {
		font-size: 30px;
	}

	.formatGrid {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (prefers-reduced-motion: reduce) {
	.cta {
		transition: none;
	}
}
</style>
