<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<button v-if="count > 0" type="button" class="_button" :class="$style.root" aria-haspopup="dialog" :aria-label="i18n.tsx._likes.countOnly({ n: count })" @click.stop="showUsers">
	<span v-if="shownUsers.length > 0" :class="$style.avatars" aria-hidden="true">
		<MkAvatar v-for="(user, index) in shownUsers" :key="user.id" :user="user" :class="$style.avatar" :style="{ zIndex: shownUsers.length - index }"/>
	</span>
	<span :class="$style.caption">{{ caption }}</span>
</button>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import MkLikesDialog from '@/components/MkLikesDialog.vue';

const props = defineProps<{
	noteId: Misskey.entities.Note['id'];
	count: number;
	users: Misskey.entities.UserLite[];
}>();

const shownUsers = computed(() => props.users.slice(0, 3));

// 有头像没露脸时才说「等人赞过」，头像列全或一个都没有则只说「赞过」
const caption = computed(() => shownUsers.value.length > 0 && props.count > shownUsers.value.length ? i18n.ts._likes.likedByOthers : i18n.ts._likes.liked);

function showUsers(): void {
	const { dispose } = os.popup(MkLikesDialog, { noteId: props.noteId, count: props.count }, { closed: () => dispose() });
}
</script>

<style lang="scss" module>
.root {
	display: flex;
	align-items: center;
	gap: 8px;
	width: fit-content;
	max-width: 100%;
	// 固定 24px 且不留纵向 margin，点赞出现/消失时所在行不会改变高度
	height: 24px;
	margin-inline-start: auto;
	font-size: calc(1em - 1px);
	color: var(--MI_THEME-fgTransparentWeak);
	text-align: right;
	&:hover { color: var(--MI_THEME-link); }
}
.avatars { display: flex; align-items: center; flex-shrink: 0; }
.avatar {
	position: relative;
	box-sizing: border-box;
	width: 24px;
	height: 24px;
	border: 2px solid var(--MI_THEME-panel);
	border-radius: 50%;
	& + .avatar { margin-left: -7px; }
}
.caption { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
</style>
