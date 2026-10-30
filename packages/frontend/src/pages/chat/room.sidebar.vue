<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<aside :class="[$style.root, { [$style.pageMode]: pageMode }]" :aria-label="i18n.ts._chat.members">
	<button v-if="!pageMode" type="button" class="_button" :class="$style.announcement" :aria-label="i18n.ts._chat.announcement" @click="emit('announcement')">
		<span :class="$style.heading">
			<span>{{ i18n.ts._chat.announcement }}</span>
			<i class="ti ti-chevron-right" aria-hidden="true"></i>
		</span>
		<span :class="$style.announcementText">
			<Mfm v-if="room.announcement" :text="room.announcement" :plain="true"/>
			<template v-else>{{ i18n.ts._chat.noAnnouncement }}</template>
		</span>
	</button>
	<section :class="$style.members">
		<div :class="$style.memberControls">
			<div :class="[$style.heading, $style.memberHeading]">
				<span>{{ i18n.ts._chat.members }} ({{ room.memberCount }})</span>
				<div :class="$style.headingActions">
					<button type="button" class="_button" :class="$style.searchButton" :aria-expanded="searchOpen" :aria-label="searchOpen ? i18n.ts.close : i18n.ts._chat.searchMembers" @click="toggleSearch"><i class="ti ti-search" aria-hidden="true"></i></button>
					<button v-if="!pageMode" type="button" class="_button" :class="$style.searchButton" :aria-label="i18n.ts.close" @click="emit('close')"><i class="ti ti-x" aria-hidden="true"></i></button>
				</div>
			</div>
			<div v-if="searchOpen" :class="$style.search" @keydown.esc.stop="toggleSearch">
				<MkInput v-model="query" type="search" small :autofocus="true" :placeholder="i18n.ts._chat.searchMembers" :class="$style.searchInput"><template #prefix><i class="ti ti-search" aria-hidden="true"></i></template></MkInput>
			</div>
		</div>
		<div :class="$style.memberList">
			<button v-if="membersFailed" type="button" class="_textButton" :class="$style.retry" @click="emit('retry')">{{ i18n.ts.retry }}</button>
			<div v-for="member in filteredMembers" :key="member.user.id" role="group" :aria-label="member.nickname || member.user.name || member.user.username" :class="$style.member" @contextmenu.prevent.stop="emit('menu', $event, member)">
				<MkAvatar :user="member.user" :link="false" :preview="false" :decorations="[]" :class="$style.avatar"/>
				<div :class="$style.memberInfo">
					<Mfm v-if="member.nickname" :text="member.nickname" :plain="true" :nowrap="true" :author="member.user" :class="$style.name"/>
					<span v-else :class="$style.name"><MkUserName :user="member.user" :nowrap="true"/></span>
					<span v-if="member.role !== 'member'" :class="$style.owner">{{ member.role === 'owner' ? i18n.ts._chat.roomOwner : i18n.ts._chat.roomAdministrator }}</span>
					<XMemberActivity v-else :userId="member.user.id" :class="$style.activity"/>
				</div>
				<button type="button" class="_button" :class="$style.memberMenu" :aria-label="i18n.ts.more" aria-haspopup="menu" @click.stop="emit('menu', $event, member)"><i class="ti ti-dots" aria-hidden="true"></i></button>
			</div>
			<MkLoading v-if="membersLoading"/>
			<template v-else-if="membersMore && !membersFailed">
				<div v-appear="() => emit('more')" :class="$style.sentinel" aria-hidden="true"></div>
				<button type="button" class="_textButton" :class="$style.more" @click="emit('more')">{{ i18n.ts.loadMore }}</button>
			</template>
			<div v-if="filteredMembers.length === 0 && query.trim() && !membersLoading && !membersMore && !membersFailed" :class="$style.noResults">{{ i18n.ts.noUsers }}</div>
		</div>
	</section>
</aside>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import type * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';
import { roomMembers } from './member-menu.js';
import type { ChatMember } from './member-menu.js';
import MkInput from '@/components/MkInput.vue';
import XMemberActivity from './member.activity.vue';

const props = defineProps<{
	room: Misskey.entities.ChatRoom;
	memberships: Misskey.entities.ChatRoomMembership[];
	membersFailed?: boolean;
	membersLoading?: boolean;
	membersMore?: boolean;
	pageMode?: boolean;
}>();
const emit = defineEmits<{ (event: 'announcement'): void; (event: 'retry'): void; (event: 'more'): void; (event: 'close'): void; (event: 'menu', ev: MouseEvent | KeyboardEvent, member: ChatMember): void }>();
const members = computed(() => roomMembers(props.room, props.memberships));
const searchOpen = ref(false);
const query = ref('');
const filteredMembers = computed(() => {
	const term = query.value.trim().toLocaleLowerCase();
	return !term ? members.value : members.value.filter(member => [member.nickname, member.user.name, member.user.username].some(value => value?.toLocaleLowerCase().includes(term)));
});

function toggleSearch() {
	searchOpen.value = !searchOpen.value;
	if (!searchOpen.value) query.value = '';
}

</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-direction: column;
	min-height: 0;
	min-width: 0;
	container-type: inline-size;
	border-left: var(--MI-divider);
	background: var(--MI_THEME-panel);
}
.pageMode { border-left: 0; }
.announcement {
	flex: none;
	min-width: 0;
	width: 100%;
	padding: 18px 0;
	text-align: left;
	border-bottom: var(--MI-divider);
	&:hover .heading { color: var(--MI_THEME-accent); }
	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -2px; }
}
.announcementText {
	display: -webkit-box;
	margin-inline: 16px;
	overflow: hidden;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 5;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 13px;
	line-height: 1.5;
}
.heading {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	width: 100%;
	box-sizing: border-box;
	padding-inline: 16px;
	margin-bottom: 12px;
	font-weight: 650;
	font-size: 13px;
	color: var(--MI_THEME-fg);
	> span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}
.headingActions { display: flex; flex: none; }
.members {
	display: flex;
	flex: 1;
	flex-direction: column;
	min-height: 0;
	padding: 18px 0;
}
.memberList {
	min-height: 0;
	overflow-y: auto;
	scrollbar-gutter: stable;
}
.memberControls { flex-shrink: 0; }
.memberHeading { min-height: 32px; }
.search { display: flex; align-items: center; gap: 4px; min-height: 32px; padding-inline: 12px; margin-bottom: 12px; }
.searchInput { flex: 1; min-width: 0; }
.searchButton { flex-shrink: 0; width: 32px; height: 32px; border-radius: 9px; color: var(--MI_THEME-fgTransparentWeak); }
.searchButton:hover { background: var(--MI_THEME-buttonHoverBg); }
.retry { margin-inline: 16px; }
.more { display: block; margin: 12px 16px; }
.sentinel { height: 1px; }
.noResults { padding: 12px 16px; color: var(--MI_THEME-fgTransparentWeak); }
.member {
	position: relative;
	isolation: isolate;
	display: flex;
	align-items: center;
	gap: 9px;
	margin-inline: 8px;
	padding: 8px;
	font-weight: normal;
	& + .member { border-top: var(--MI-divider); }
	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -2px; }
}
.activity {
	flex: none;
	width: 48px;
	height: 14px;
	opacity: 0.22;
	pointer-events: none;
}
.avatar {
	flex-shrink: 0;
	width: 34px;
	height: 34px;
}
.name {
	display: block;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	font-size: 13px;
	font-weight: 500;
}
.memberInfo { display: flex; flex: 1; flex-direction: column; align-items: flex-start; gap: 3px; min-width: 0; }
.memberInfo > .name { max-width: 100%; }
.memberMenu { display: grid; place-items: center; flex: none; width: 24px; height: 28px; border-radius: 4px; color: var(--MI_THEME-fgTransparentWeak); }
.searchButton:focus-visible, .memberMenu:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -2px; }
.owner {
	flex-shrink: 0;
	padding: 2px 4px;
	border-radius: 4px;
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	font-size: 12px;
	line-height: 1.35;
	white-space: nowrap;
}

@container (max-width: 180px) {
	.announcementText { margin-inline: 6px; -webkit-line-clamp: 3; }
	.heading { padding-inline: 6px; gap: 2px; }
	.searchButton { width: 24px; }
	.member { margin-inline: 2px; padding: 6px 2px; gap: 4px; }
	.avatar { width: 24px; height: 24px; }
	.memberMenu { width: 20px; }
	.owner { max-width: 100%; box-sizing: border-box; overflow: hidden; text-overflow: ellipsis; }
}
</style>
