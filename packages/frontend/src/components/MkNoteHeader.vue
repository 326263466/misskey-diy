<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<header :class="[$style.root, { [$style.detailLayout]: detailLayout, [$style.mini]: mini }]">
	<div :class="$style.primaryLine">
		<div :class="$style.authorLine">
			<slot name="avatar"></slot>
			<div v-if="mock" :class="$style.name">
				<MkUserName :user="user"/>
			</div>
			<MkA v-else v-user-preview="user.id" :class="$style.name" :to="userPage(user)">
				<MkUserName :user="user"/>
			</MkA>
			<div v-if="showAuthorBadge || user.isBot" :class="$style.badges">
				<div v-if="showAuthorBadge" :class="$style.badge">{{ i18n.ts.author }}</div>
				<i v-if="user.isBot" v-tooltip="'bot'" class="ti ti-robot" :class="$style.badge" role="img" aria-label="bot"></i>
			</div>
			<div v-if="user.badgeRoles && user.badgeRoles.length > 0" :class="$style.badgeRoles">
				<img v-for="(role, i) in user.badgeRoles" :key="i" v-tooltip="role.name" :class="$style.badgeRole" :src="role.iconUrl!"/>
			</div>
		</div>
		<div v-if="!mini && !detailLayout && (showVisibility || note.visibility !== 'public')" :class="$style.meta">
			<span v-if="!detailLayout && (showVisibility || note.visibility !== 'public')" :title="i18n.ts._visibility[note.visibility]">
				<i v-if="note.visibility === 'public'" class="ti ti-world"></i>
				<i v-if="note.visibility === 'home'" class="ti ti-home"></i>
				<i v-else-if="note.visibility === 'followers'" class="ti ti-lock"></i>
				<i v-else-if="note.visibility === 'specified'" ref="specified" class="ti ti-mail"></i>
			</span>
		</div>
		<template v-if="detailLayout">
			<MkTime v-if="showTime" :time="note.createdAt" mode="date" :class="$style.time"/>
			<span v-if="viewsCount != null" :class="$style.views" :title="i18n.ts.viewsCount"><i class="ti ti-eye" role="img" :aria-label="i18n.ts.viewsCount"></i> {{ viewsCount.toLocaleString() }}</span>
		</template>
		<div v-else-if="mini && showTime" :class="$style.time"><MkTime :time="note.createdAt" colored/></div>
		<MkA
			v-if="channel"
			:class="$style.channelLink"
			:to="`/channels/${channel.id}`"
			:title="channel.name"
			:aria-label="`${i18n.ts.channel}: ${channel.name}`"
			@click.stop
			@keydown.enter.stop
		>
			<i class="ti ti-broadcast" aria-hidden="true"></i>
			<span :class="$style.channelLabel">{{ i18n.ts.channel }}</span>
			<span :class="$style.channelName"><Mfm :text="channel.name" :plain="true" :nowrap="true"/></span>
		</MkA>
	</div>
	<div v-if="!mini && !detailLayout && (hasWork || showTime)" :class="$style.secondaryLine">
		<MkUserWork :user="user" :class="$style.work"/>
		<span v-if="hasWork && showTime" :class="$style.separator" aria-hidden="true">·</span>
		<div v-if="showTime" :class="$style.time">
			<MkTime :time="note.createdAt" colored/>
		</div>
	</div>
</header>
</template>

<script lang="ts" setup>
import { computed, inject } from 'vue';
import type * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';
import { userPage } from '@@/js/user.js';
import { DI } from '@/di.js';
import MkUserWork from '@/components/MkUserWork.vue';
import { useUserProfile } from '@/composables/use-user-profile.js';

const props = withDefaults(defineProps<{
	note: Misskey.entities.Note;
	showAuthorBadge?: boolean;
	showTime?: boolean;
	showVisibility?: boolean;
	detailLayout?: boolean;
	viewsCount?: number;
	/** 引用/转发卡片：头像内联名字行，时间紧跟用户名，不显示可见范围图标 */
	mini?: boolean;
}>(), {
	showTime: true,
});

const mock = inject(DI.mock, false);
const inChannel = inject(DI.inChannel, null);
const user = useUserProfile(() => props.note.user);
const hasWork = computed(() => Boolean(user.value.company?.trim() || user.value.jobTitle?.trim()));
const channel = computed(() => props.note.channel != null && inChannel?.value !== props.note.channel.id ? props.note.channel : null);
</script>

<style lang="scss" module>
.root {
	min-width: 0;
	max-width: 100%;
	color: var(--MI_THEME-fgTransparentWeak);
	line-height: 1.3;
}

.primaryLine {
	display: flex;
	align-items: center;
	gap: 6px;
	min-width: 0;
	max-width: 100%;
	white-space: nowrap;
}

.authorLine {
	display: flex;
	flex: 0 1 auto;
	align-items: center;
	gap: 6px;
	min-width: 0;
	max-width: 100%;
	overflow: hidden;
}

.name,
.account {
	color: inherit;
	font-size: 1em;
	font-weight: normal;
	text-decoration: none;
}

.name {
	flex: 0 1 auto;
	display: block;
	min-width: 0;
	margin: 0;
	padding: 0;
	color: var(--MI_THEME-fg);
	font-weight: bold;
	overflow: hidden;
	text-overflow: ellipsis;

	&:hover {
		text-decoration: underline;
	}
}

.badges {
	flex-shrink: 0;
	display: inline-grid;
	align-items: center;
	grid-auto-flow: column;
	grid-auto-columns: 1fr;
	gap: .5em;
	margin: 0;
	font-size: calc(1em - 2px);
}

.badge {
	display: block;
	line-height: 1.3;
}

.meta {
	display: flex;
	flex: 0 1 auto;
	align-items: center;
	gap: 4px;
	min-width: 0;
	max-width: 100%;
	overflow: hidden;
	font-size: calc(1em - 2px);
	color: var(--MI_THEME-fgTransparentWeak);
}

.secondaryLine {
	display: flex;
	align-items: center;
	gap: 0.18em;
	min-width: 0;
	margin-top: 1px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: .875em;
	line-height: 1.4;
}

.work {
	flex: 0 1 auto;
	margin: 0;
	font-size: inherit;
	line-height: inherit;
}

.account {
	flex: 0 1 auto;
	display: block;
	color: inherit;
	font-size: inherit;
	font-weight: normal;
	text-decoration: none;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;

	&:hover {
		text-decoration: none;
	}
}

.separator {
	flex-shrink: 0;
}

.channelLink {
	flex: 1 1 auto;
	display: flex;
	align-items: center;
	justify-content: flex-end;
	gap: 4px;
	min-width: 0;
	max-width: 50%;
	margin-left: auto;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: .85em;
	font-weight: normal;
	text-decoration: none;

	> i {
		flex: none;
		color: inherit;
	}

	&:hover .channelName {
		text-decoration: underline;
	}

	&:focus-visible {
		border-radius: 2px;
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: 2px;
	}
}

.channelLabel {
	flex: none;

	&::after {
		content: "·";
		margin-left: 4px;
		opacity: .65;
	}
}

.channelName {
	min-width: 0;
	overflow: hidden;
	color: inherit;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.time {
	flex-shrink: 0;
	white-space: nowrap;
}

// mini 布局的时间内联在名字后，沿用原先次行的时间字号
.mini .time {
	font-size: .875em;
}

.detailLayout .primaryLine {
	flex-wrap: wrap;
	gap: 8px 14px;
	font-size: .9em;
	line-height: 1.6;
	white-space: normal;
}

.detailLayout .name {
	font-weight: normal;
	white-space: nowrap;
}

.detailLayout .channelLink {
	// 详情页频道与日期同为辅助信息，避免频道在长标题行里显得过小。
	font-size: 1em;
}

.views {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	white-space: nowrap;
	font-variant-numeric: tabular-nums;
}

.badgeRoles {
	display: flex;
	align-items: center;
	flex: 0 1 auto;
	min-width: 0;
	overflow: hidden;
	margin: 0;
	font-size: calc(1em - 1px);
}

.badgeRole {
	flex-shrink: 0;
	height: 1.3em;

	& + .badgeRole {
		margin-left: 0.2em;
	}
}
</style>
