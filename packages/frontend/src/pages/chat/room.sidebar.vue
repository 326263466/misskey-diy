<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<aside :class="$style.root" :aria-label="i18n.ts._chat.members">
	<section :class="$style.members">
		<div ref="searchEl" :class="$style.memberControls">
			<div :class="[$style.heading, $style.memberHeading]">
				<span>{{ i18n.ts._chat.members }} ({{ room.memberCount }})</span>
				<button type="button" class="_button _iconButton" :class="$style.searchButton" :aria-expanded="searchOpen" :aria-label="searchOpen ? i18n.ts.close : i18n.ts._chat.searchMembers" @click="toggleSearch"><i class="ti ti-search" aria-hidden="true"></i></button>
			</div>
			<div v-if="searchOpen" :class="$style.search" @keydown.esc.stop="toggleSearch">
				<MkInput v-model="query" type="search" small :autofocus="true" :placeholder="i18n.ts._chat.searchMembers" :class="$style.searchInput"><template #prefix><i class="ti ti-search" aria-hidden="true"></i></template></MkInput>
			</div>
		</div>
		<div class="_scrollbarOnHover" :class="$style.memberList">
			<button v-if="membersFailed" type="button" class="_textButton" :class="$style.retry" @click="emit('retry')">{{ i18n.ts.retry }}</button>
			<div v-for="member in filteredMembers" :key="member.user.id" role="group" :aria-label="member.nickname || member.user.name || member.user.username" tabindex="0" :class="$style.member" @contextmenu.prevent.stop="emit('menu', $event, member)" @keydown.shift.f10.prevent="emit('menu', $event, member)">
				<MkAvatar :user="member.user" :link="false" :preview="false" :class="$style.avatar"/>
				<Mfm v-if="member.nickname" :text="member.nickname" :plain="true" :nowrap="true" :author="member.user" :class="$style.name"/>
				<span v-else :class="$style.name"><MkUserName :user="member.user" :nowrap="true"/></span>
				<XMemberActivity :userId="member.user.id" :class="$style.activity"/>
				<span v-if="member.role !== 'member'" :class="$style.owner">{{ member.role === 'owner' ? i18n.ts._chat.roomOwner : i18n.ts._chat.roomAdministrator }}</span>
			</div>
			<div v-if="filteredMembers.length === 0 && query.trim()" :class="$style.noResults">{{ i18n.ts.noUsers }}</div>
		</div>
	</section>
</aside>
</template>

<script lang="ts" setup>
import { computed, ref, useTemplateRef, onMounted, onBeforeUnmount } from 'vue';
import type * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';
import { roomMembers } from './member-menu.js';
import type { ChatMember } from './member-menu.js';
import MkInput from '@/components/MkInput.vue';
import XMemberActivity from './member.activity.vue';

const props = defineProps<{ room: Misskey.entities.ChatRoom; memberships: Misskey.entities.ChatRoomMembership[]; membersFailed?: boolean }>();
const emit = defineEmits<{ (event: 'retry'): void; (event: 'menu', ev: MouseEvent | KeyboardEvent, member: ChatMember): void }>();
const members = computed(() => roomMembers(props.room, props.memberships));
const searchOpen = ref(false);
const searchEl = useTemplateRef('searchEl');
const query = ref('');
const filteredMembers = computed(() => {
	const term = query.value.trim().toLocaleLowerCase();
	return !term ? members.value : members.value.filter(member => [member.nickname, member.user.name, member.user.username].some(value => value?.toLocaleLowerCase().includes(term)));
});

function toggleSearch() {
	searchOpen.value = !searchOpen.value;
	if (!searchOpen.value) query.value = '';
}

function onOutsideClick(event: MouseEvent) {
	if (searchOpen.value && event.target instanceof Node && !searchEl.value?.contains(event.target)) {
		searchOpen.value = false;
		query.value = '';
	}
}

onMounted(() => window.document.addEventListener('click', onOutsideClick, true));
onBeforeUnmount(() => window.document.removeEventListener('click', onOutsideClick, true));
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-direction: column;
	min-height: 0;
	border-left: var(--MI-divider);
	background: var(--MI_THEME-panel);
}
.heading {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	width: 100%;
	box-sizing: border-box;
	padding-inline: var(--MI-cardPadding);
	margin-bottom: 14px;
	font-weight: 600;
	font-size: 14px;
	color: var(--MI_THEME-fg);
}
.members {
	display: flex;
	flex: 1;
	flex-direction: column;
	min-height: 0;
	padding: 16px 0;
}
.memberList {
	min-height: 0;
	overflow-y: auto;
}
.memberControls { flex-shrink: 0; }
.memberHeading { min-height: 32px; }
.search { display: flex; align-items: center; gap: 4px; min-height: 32px; padding-inline: var(--MI-cardPadding); margin-bottom: 14px; }
.searchInput { flex: 1; min-width: 0; }
.searchButton { flex-shrink: 0; width: 32px; height: 32px; border-radius: 4px; color: var(--MI_THEME-fgTransparentWeak); }
.retry { margin-inline: var(--MI-cardPadding); }
.noResults { padding: 12px var(--MI-cardPadding); color: var(--MI_THEME-fgTransparentWeak); }
.member {
	position: relative;
	isolation: isolate;
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 7px var(--MI-cardPadding);
	border-radius: 8px;
	font-weight: normal;
	&:hover { text-decoration: none; background: color-mix(in srgb, var(--MI_THEME-buttonHoverBg) 45%, transparent); }
}
.avatar, .name, .owner { position: relative; z-index: 1; }
.member > .activity {
	position: absolute;
	right: var(--MI-cardPadding);
	top: 50%;
	transform: translateY(-50%);
	width: 56px;
	height: 14px;
	opacity: 0.22;
	pointer-events: none;
	z-index: 0;
}
.avatar {
	flex-shrink: 0;
	width: 28px;
	height: 28px;
}
.name {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	font-size: 13px;
}
.owner {
	flex-shrink: 0;
	padding: 2px 4px;
	border-radius: 4px;
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	font-size: 10px;
}
.empty { color: var(--MI_THEME-fgTransparentWeak); }
</style>
