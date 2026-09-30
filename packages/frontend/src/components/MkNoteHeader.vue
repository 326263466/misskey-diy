<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<header :class="$style.root">
	<div :class="$style.primaryLine">
		<div :class="$style.authorLine">
			<div v-if="mock" :class="$style.name">
				<MkUserName :user="user"/>
			</div>
			<MkA v-else v-user-preview="user.id" :class="$style.name" :to="userPage(user)">
				<MkUserName :user="user"/>
			</MkA>
			<div v-if="showAuthorBadge || user.isBot" :class="$style.badges">
				<div v-if="showAuthorBadge" :class="$style.badge">{{ i18n.ts.author }}</div>
				<div v-if="user.isBot" :class="$style.badge">bot</div>
			</div>
			<div v-if="user.badgeRoles && user.badgeRoles.length > 0" :class="$style.badgeRoles">
				<img v-for="(role, i) in user.badgeRoles" :key="i" v-tooltip="role.name" :class="$style.badgeRole" :src="role.iconUrl!"/>
			</div>
		</div>
		<div :class="$style.meta">
			<MkA :class="$style.account" :to="userPage(user)"><MkAcct :user="user"/></MkA>
			<span v-if="note.visibility !== 'public'" :title="i18n.ts._visibility[note.visibility]">
				<i v-if="note.visibility === 'home'" class="ti ti-home"></i>
				<i v-else-if="note.visibility === 'followers'" class="ti ti-lock"></i>
				<i v-else-if="note.visibility === 'specified'" ref="specified" class="ti ti-mail"></i>
			</span>
			<span v-if="note.localOnly" :title="i18n.ts._visibility['disableFederation']"><i class="ti ti-rocket-off"></i></span>
		</div>
	</div>
	<div v-if="hasWork || showTime" :class="$style.secondaryLine">
		<MkUserWork :user="user" :class="$style.work"/>
		<span v-if="hasWork && showTime" :class="$style.separator" aria-hidden="true">·</span>
		<div v-if="showTime && mock" :class="$style.time">
			<MkTime :time="note.createdAt" colored/>
		</div>
		<MkA v-else-if="showTime" :class="$style.time" :to="notePage(note)">
			<MkTime :time="note.createdAt" colored/>
		</MkA>
	</div>
</header>
</template>

<script lang="ts" setup>
import { computed, inject } from 'vue';
import type * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';
import { notePage } from '@/filters/note.js';
import { userPage } from '@/filters/user.js';
import { DI } from '@/di.js';
import MkUserWork from '@/components/MkUserWork.vue';
import { useUserProfile } from '@/composables/use-user-profile.js';

const props = withDefaults(defineProps<{
	note: Misskey.entities.Note;
	showAuthorBadge?: boolean;
	showTime?: boolean;
}>(), {
	showTime: true,
});

const mock = inject(DI.mock, false);
const user = useUserProfile(() => props.note.user);
const hasWork = computed(() => Boolean(user.value.company?.trim() || user.value.jobTitle?.trim()));
</script>

<style lang="scss" module>
.root {
	min-width: 0;
	max-width: 100%;
	color: color-mix(in srgb, var(--MI_THEME-panel), var(--MI_THEME-fg) 70%);
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
	grid-auto-flow: column;
	grid-auto-columns: 1fr;
	gap: .5em;
	margin: 0;
	font-size: calc(1em - 2px);
}

.badge {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	box-sizing: border-box;
	padding: 1px 4px;
	line-height: 1;
	border: solid 0.5px var(--MI_THEME-divider);
	border-radius: 3px;
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

.time {
	flex-shrink: 0;
	white-space: nowrap;
}

.badgeRoles {
	flex: 0 1 auto;
	min-width: 0;
	overflow: hidden;
	margin: 0;
	font-size: calc(1em - 1px);
}

.badgeRole {
	height: 1.3em;
	vertical-align: -20%;

	& + .badgeRole {
		margin-left: 0.2em;
	}
}
</style>
