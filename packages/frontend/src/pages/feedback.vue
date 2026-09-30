<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :hideHeader="true">
	<div class="_spacer" style="--MI_SPACER-w: 1080px; --MI_SPACER-min: 24px;">
		<div :class="$style.layout">
			<div :class="$style.main">
				<div class="_panel" :class="$style.banner">
					<div :class="$style.bannerIcon"><i class="ti ti-message-report"></i></div>
					<div :class="$style.bannerBody">
						<div :class="$style.bannerTitle">{{ i18n.ts.didYouLikeMisskey }}</div>
						<div :class="$style.bannerDesc">
							<I18n :src="i18n.ts.pleaseDonate" tag="span">
								<template #host>{{ instance.name ?? host }}</template>
							</I18n>
						</div>
					</div>
				</div>

				<a
					v-if="instance.maintainerEmail"
					class="_panel"
					:class="[$style.contactCard, $style.contactLink]"
					:href="`mailto:${instance.maintainerEmail}`"
				>
					<i class="ti ti-mail" :class="$style.contactIcon" aria-hidden="true"></i>
					<span :class="$style.contactBody">
						<span :class="$style.contactLabel">{{ i18n.ts.contact }}</span>
						<span :class="$style.contactValue">{{ instance.maintainerEmail }}</span>
					</span>
					<i class="ti ti-chevron-right" :class="$style.contactArrow" aria-hidden="true"></i>
				</a>
			</div>

			<div :class="$style.aside">
				<div class="_panel" :class="$style.card">
					<div :class="$style.cardTitle">
						<i class="ti ti-bulb" :class="$style.cardIcon" aria-hidden="true"></i>
						<span>{{ i18n.ts._feedback.howToTitle }}</span>
					</div>
					<div :class="$style.cardBody">{{ i18n.ts._feedback.howToDescription }}</div>
				</div>

				<div v-if="instance.maintainerName" class="_panel" :class="$style.card">
					<div :class="$style.cardTitle">
						<i class="ti ti-user-circle" :class="$style.cardIcon" aria-hidden="true"></i>
						<span>{{ i18n.ts.administrator }}</span>
					</div>
					<div :class="$style.member">
						<i class="ti ti-user" :class="$style.memberAvatar" aria-hidden="true"></i>
						<span :class="$style.memberName">{{ instance.maintainerName }}</span>
					</div>
				</div>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { host } from '@@/js/config.js';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import { definePage } from '@/page.js';

definePage(() => ({
	title: i18n.ts.feedback,
	icon: 'ti ti-message-report',
	needWideArea: true,
}));
</script>

<style lang="scss" module>
.layout {
	display: flex;
	align-items: flex-start;
	gap: 24px;
	padding-top: 24px;
}

.main {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.aside {
	flex-shrink: 0;
	width: 300px;
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.banner {
	display: flex;
	align-items: center;
	gap: 20px;
	padding: 28px;
}

.bannerIcon {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 72px;
	height: 72px;
	border-radius: 18px;
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	font-size: 34px;
}

.bannerBody {
	flex: 1;
	min-width: 0;
}

.bannerTitle {
	margin-bottom: 6px;
	font-size: 1.4em;
	font-weight: 700;
}

.bannerDesc {
	line-height: 1.7;
	color: var(--MI_THEME-fgTransparentWeak);
}

.contactCard {
	display: flex;
	align-items: center;
	gap: 14px;
	padding: 18px 20px;
}

.contactLink {
	color: inherit;
	text-decoration: none;
	cursor: pointer;
	transition: background 0.2s;

	&:hover {
		background: var(--MI_THEME-panelHighlight);
		text-decoration: none;
	}
}

.contactIcon {
	flex-shrink: 0;
	font-size: 24px;
	color: var(--MI_THEME-accent);
}

.contactBody {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 3px;
}

.contactLabel {
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.contactValue {
	font-weight: 500;
	word-break: break-all;
}

.contactArrow {
	flex-shrink: 0;
	color: var(--MI_THEME-fgTransparentWeak);
}

.card {
	padding: 20px;
}

.cardTitle {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-bottom: 12px;
	font-weight: 700;
}

.cardIcon {
	color: var(--MI_THEME-accent);
	font-size: 18px;
}

.cardBody {
	line-height: 1.7;
	color: var(--MI_THEME-fgTransparentWeak);
}

.member {
	display: flex;
	align-items: center;
	gap: 10px;
}

.memberAvatar {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 36px;
	height: 36px;
	border-radius: 50%;
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	font-size: 18px;
}

.memberName {
	min-width: 0;
	font-weight: 500;
	word-break: break-word;
}

@media (max-width: 900px) {
	.layout {
		flex-direction: column;
	}

	.aside {
		width: 100%;
	}
}
</style>
