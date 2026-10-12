<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader hideHeader>
	<div class="_pageBody">
		<Teleport v-if="channel && active && pageActive && sidebarTarget" :to="sidebarTarget">
			<MkContainer v-if="channel.description" :class="$style.sideCard">
				<template #header>{{ i18n.ts._channel.announcement }}</template>
				<div :class="$style.sideBody"><XAnnouncement :key="channel.id" :text="channel.description"/></div>
			</MkContainer>
			<MkContainer v-if="owner || members.length > 0" :class="$style.sideCard">
				<template #header>{{ i18n.ts._channel.members }}</template>
				<div :class="$style.sideBody">
					<template v-if="owner">
						<h3 :class="$style.memberHeading">{{ i18n.ts.administrator }}</h3>
						<MkA :to="userPage(owner)" :class="$style.owner" :title="owner.name ?? owner.username">
							<MkAvatar :user="owner" :class="$style.ownerAvatar" :link="false"/>
							<MkUserName :user="owner" :class="$style.ownerName"/>
						</MkA>
					</template>
					<template v-if="members.length > 0">
						<h3 :class="$style.memberHeading">{{ i18n.ts._channel.recentMembers }}</h3>
						<div :class="$style.memberStack">
							<MkAvatar v-for="(user, i) in members" :key="user.id" v-tooltip.noDelay="user.name ?? user.username" :user="user" :class="$style.memberAvatar" :style="{ zIndex: members.length - i }" :aria-label="user.name ?? user.username" title="" link/>
						</div>
						<button v-if="participantsCount > members.length" type="button" class="_button _textAction" :class="$style.membersLink" aria-haspopup="dialog" @click="showMembers">
							{{ i18n.tsx._channel.membersJoined({ n: participantsCount }) }}<i class="ti ti-chevron-right" aria-hidden="true"></i>
						</button>
					</template>
				</div>
			</MkContainer>
		</Teleport>

		<MkError v-if="error" @retry="fetchChannel()"/>
		<MkLoading v-else-if="!channel"/>
		<div v-else class="_gaps">
			<section class="_panel" :class="$style.hero">
				<div :class="$style.heroMain">
					<div :class="$style.thumb">
						<img v-if="channel.bannerUrl" :src="channel.bannerUrl" alt=""/>
						<i v-else class="ti ti-device-tv" aria-hidden="true"></i>
					</div>
					<div :class="$style.heroBody">
						<h1 :class="$style.name"><Mfm :text="channel.name" :plain="true"/></h1>
						<div :class="$style.meta">
							<button type="button" class="_button" :class="$style.metaButton" aria-haspopup="dialog" @click="showMembers"><i class="ti ti-users" aria-hidden="true"></i>{{ i18n.tsx._channel.usersCount({ n: participantsCount }) }}</button>
							<span><i class="ti ti-pencil" aria-hidden="true"></i>{{ i18n.tsx._channel.notesCount({ n: channel.notesCount }) }}</span>
							<button type="button" class="_button" :class="$style.metaButton" @click="share()"><i class="ti ti-share" aria-hidden="true"></i>{{ i18n.ts.share }}</button>
							<span v-if="channel.isSensitive" :class="$style.warn">{{ i18n.ts.sensitive }}</span>
							<span v-if="isOwner" :class="$style.admin"><i class="ti ti-user-star" aria-hidden="true"></i>{{ i18n.ts.youAreAdmin }}</span>
						</div>
					</div>
					<div :class="$style.heroActions">
						<XChannelFollowButton v-if="$i" :channel="channel" :full="true" :class="$style.follow"/>
						<button v-if="$i" v-tooltip="favorited ? i18n.ts.unfavorite : i18n.ts.favorite" type="button" class="_button" :class="[$style.iconButton, { [$style.iconButtonActive]: favorited }]" :aria-label="favorited ? i18n.ts.unfavorite : i18n.ts.favorite" :aria-pressed="favorited" @click="favorited ? unfavorite() : favorite()"><i class="ti ti-star" aria-hidden="true"></i></button>
						<button v-tooltip="i18n.ts.more" type="button" class="_button" :class="$style.iconButton" :aria-label="i18n.ts.more" aria-haspopup="menu" @click="showMenu"><i class="ti ti-dots" aria-hidden="true"></i></button>
					</div>
				</div>
				<XAnnouncement v-if="channel.description && !sidebarTarget" :key="channel.id" :text="channel.description" :class="$style.description"/>
				<template v-if="$i && !channel.isArchived">
					<MkPostForm v-if="prefer.r.showFixedPostFormInChannel.value" :channel="channel" fixed :initialRows="3" :autofocus="false" :class="$style.heroPostForm"/>
					<div v-else :class="$style.composer">
						<MkAvatar :user="$i" :class="$style.composerAvatar"/>
						<button type="button" class="_button" :class="$style.composerInput" @click="openPostForm()">{{ i18n.ts.postToTheChannel }}</button>
					</div>
				</template>
			</section>

			<MkInfo v-if="channel.isArchived" warn>{{ i18n.ts.thisChannelArchived }}</MkInfo>

				<MkStickyContainer class="_panel" :class="$style.feedCard">
				<template #header>
					<MkPageHeader v-model:tab="tab" :tabs="headerTabs" hideTitle embedded>
						<template v-if="activePaginator" #actions><MkPaginationControl :paginator="activePaginator" compact/></template>
					</MkPageHeader>
				</template>
				<div :class="$style.feed">
					<MkStreamingNotesTimeline v-if="tab === 'timeline'" :key="channelId" src="channel" :channel="channelId" pageEmpty/>
					<MkNotesTimeline v-else-if="tab === 'featured'" :paginator="featuredPaginator" :withControl="false" noGap pageEmpty/>
					<div v-else-if="tab === 'pinned'" :class="$style.pinnedList">
						<MkNote v-for="note in channel.pinnedNotes ?? []" :key="note.id" :note="note"/>
					</div>
					<template v-else-if="tab === 'search'">
						<div :class="$style.searchBox">
							<MkInput v-model="searchQuery" type="search" :class="$style.searchInput" @enter="search()">
								<template #label>{{ i18n.ts.search }}</template>
								<template #prefix><i class="ti ti-search"></i></template>
							</MkInput>
							<MkButton primary rounded @click="search()">{{ i18n.ts.search }}</MkButton>
						</div>
						<MkNotesTimeline v-if="searchPaginator" :key="searchKey" :paginator="searchPaginator" :withControl="false" noGap pageEmpty/>
					</template>
				</div>
			</MkStickyContainer>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, inject, markRaw, onActivated, onDeactivated, ref, shallowRef, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { url } from '@@/js/config.js';
import { useInterval } from '@@/js/use-interval.js';
import { userPage } from '@@/js/user.js';
import XAnnouncement from './channel.announcement.vue';
import type { MenuItem } from '@/types/menu.js';
import MkPostForm from '@/components/MkPostForm.vue';
import MkStreamingNotesTimeline from '@/components/MkStreamingNotesTimeline.vue';
import XChannelFollowButton from '@/components/MkChannelFollowButton.vue';
import MkNotesTimeline from '@/components/MkNotesTimeline.vue';
import MkPaginationControl from '@/components/MkPaginationControl.vue';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkNote from '@/components/MkNote.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkContainer from '@/components/MkContainer.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { $i, iAmModerator } from '@/i.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { favoritedChannelsCache } from '@/cache.js';
import { prefer } from '@/preferences.js';
import { openShareDialog } from '@/utility/share-dialog.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { notesSearchAvailable } from '@/utility/check-permissions.js';
import { miLocalStorage } from '@/local-storage.js';
import { useRouter } from '@/router.js';
import { Paginator } from '@/utility/paginator.js';
import { DI } from '@/di.js';

const props = defineProps<{
	channelId: string;
}>();

const router = useRouter();
const inWindow = inject<boolean>('inWindow', false);
const active = ref(true);
const pageActive = inject(DI.pageActive, ref(true));
const pageSidebar = inject(DI.pageSidebar, ref(null));
// 有右栏时简介和管理员放在右栏；窗口或窄屏没有右栏，简介回到头部卡片
const sidebarTarget = computed(() => inWindow ? null : pageSidebar.value);
onActivated(() => { active.value = true; });
onDeactivated(() => { active.value = false; });

const tab = ref<'timeline' | 'featured' | 'pinned' | 'search'>('timeline');
const channel = ref<Misskey.entities.Channel | null>(null);
const owner = shallowRef<Misskey.entities.UserDetailed | null>(null);
const MEMBER_LIMIT = 5;
const members = shallowRef<Misskey.entities.UserLite[]>([]);
const participantsCount = computed(() => channel.value?.participantsCount ?? 0);
const error = ref<unknown>(null);
const favorited = ref(false);
const isOwner = computed(() => $i != null && channel.value != null && $i.id === channel.value.userId);
const searchQuery = ref('');
const searchPaginator = shallowRef<Paginator<'notes/search'> | null>(null);
const searchKey = ref('');
const featuredPaginator = markRaw(new Paginator('notes/featured', {
	limit: 10,
	computedParams: computed(() => ({
		channelId: props.channelId,
	})),
}));
const activePaginator = computed(() => tab.value === 'featured'
	? featuredPaginator
	: tab.value === 'search' ? searchPaginator.value : null);

useInterval(() => {
	if (channel.value == null) return;
	miLocalStorage.setItemAsJson(`channelLastReadedAt:${channel.value.id}`, Date.now());
}, 3000, {
	immediate: true,
	afterMounted: true,
});

async function fetchChannel() {
	const channelId = props.channelId;
	error.value = null;
	channel.value = null;
	owner.value = null;
	members.value = [];
	tab.value = 'timeline';

	let _channel: Misskey.entities.Channel;
	try {
		_channel = await misskeyApi('channels/show', { channelId });
	} catch (err) {
		if (channelId === props.channelId) error.value = err;
		return;
	}
	if (channelId !== props.channelId) return;

	favorited.value = _channel.isFavorited ?? false;
	if ((favorited.value || _channel.isFollowing) && _channel.lastNotedAt) {
		const lastReadedAt: number = miLocalStorage.getItemAsJson(`channelLastReadedAt:${_channel.id}`) ?? 0;
		const lastNotedAt = Date.parse(_channel.lastNotedAt);

		if (lastNotedAt > lastReadedAt) {
			miLocalStorage.setItemAsJson(`channelLastReadedAt:${_channel.id}`, lastNotedAt);
		}
	}
	channel.value = _channel;

	if (_channel.userId != null) {
		misskeyApi('users/show', { userId: _channel.userId }).then(user => {
			if (channelId === props.channelId) owner.value = user;
		}).catch(() => {
			// 成员信息只用于展示，加载失败时不显示
		});
	}

		misskeyApi('channels/participants', { channelId, limit: MEMBER_LIMIT }).then(users => {
			if (channelId === props.channelId) members.value = users;
		}).catch(() => {});
}

watch(() => props.channelId, fetchChannel, { immediate: true });

function showMembers() {
	const { dispose } = os.popup(defineAsyncComponent(() => import('./channel.members-dialog.vue')), {
		channelId: props.channelId,
	}, {
		closed: () => dispose(),
	});
}

function edit() {
	router.push('/channels/:channelId/edit', {
		params: {
			channelId: props.channelId,
		},
	});
}

function openPostForm() {
	os.post({
		channel: channel.value,
	});
}

function share() {
	if (!channel.value) return;
	openShareDialog({
		title: channel.value.name,
		text: channel.value.description ?? undefined,
		url: `${url}/channels/${channel.value.id}`,
	});
}

function favorite() {
	if (!channel.value) return;

	os.apiWithDialog('channels/favorite', {
		channelId: channel.value.id,
	}).then(() => {
		favorited.value = true;
		favoritedChannelsCache.delete();
	});
}

async function unfavorite() {
	if (!channel.value) return;

	const confirm = await os.confirm({
		type: 'warning',
		text: i18n.ts.unfavoriteConfirm,
	});
	if (confirm.canceled) return;
	os.apiWithDialog('channels/unfavorite', {
		channelId: channel.value.id,
	}).then(() => {
		favorited.value = false;
		favoritedChannelsCache.delete();
	});
}

async function mute() {
	if (!channel.value) return;
	const _channel = channel.value;

	const { canceled, result: period } = await os.select({
		title: i18n.ts._channel.mutePeriod,
		items: [{
			value: 'indefinitely', label: i18n.ts.indefinitely,
		}, {
			value: 'tenMinutes', label: i18n.ts.tenMinutes,
		}, {
			value: 'oneHour', label: i18n.ts.oneHour,
		}, {
			value: 'oneDay', label: i18n.ts.oneDay,
		}, {
			value: 'oneWeek', label: i18n.ts.oneWeek,
		}],
		default: 'indefinitely',
	});
	if (canceled) return;

	const expiresAt = period === 'indefinitely' ? null
		: period === 'tenMinutes' ? Date.now() + (1000 * 60 * 10)
		: period === 'oneHour' ? Date.now() + (1000 * 60 * 60)
		: period === 'oneDay' ? Date.now() + (1000 * 60 * 60 * 24)
		: period === 'oneWeek' ? Date.now() + (1000 * 60 * 60 * 24 * 7)
		: null;

	os.apiWithDialog('channels/mute/create', {
		channelId: _channel.id,
		expiresAt,
	}).then(() => {
		_channel.isMuting = true;
	});
}

async function unmute() {
	if (!channel.value) return;
	const _channel = channel.value;

	os.apiWithDialog('channels/mute/delete', {
		channelId: _channel.id,
	}).then(() => {
		_channel.isMuting = false;
	});
}

function showMenu(ev: MouseEvent) {
	if (!channel.value) return;
	const _channel = channel.value;
	const items: MenuItem[] = [{
		icon: 'ti ti-link',
		text: i18n.ts.copyUrl,
		action: () => {
			copyToClipboard(`${url}/channels/${_channel.id}`);
		},
	}];

	if ($i) {
		items.push(_channel.isMuting ? {
			icon: 'ti ti-volume-off',
			text: i18n.ts._channel.unmute,
			action: unmute,
		} : {
			icon: 'ti ti-volume',
			text: i18n.ts._channel.mute,
			action: mute,
		});
	}

	if (isOwner.value || iAmModerator) {
		items.push({ type: 'divider' }, {
			icon: 'ti ti-settings',
			text: i18n.ts.edit,
			action: edit,
		});
	}

	os.popupMenu(items, (ev.currentTarget ?? ev.target) as HTMLElement);
}

async function search() {
	if (!channel.value) return;

	const query = searchQuery.value.toString().trim();
	if (query === '') return;

	searchPaginator.value = markRaw(new Paginator('notes/search', {
		limit: 10,
		params: {
			query: query,
			channelId: channel.value.id,
		},
	}));

	searchKey.value = query;
}

const headerTabs = computed(() => [{
	key: 'timeline',
	title: i18n.ts._channel.latest,
}, {
	key: 'featured',
	title: i18n.ts._channel.featured,
}, ...(channel.value?.pinnedNotes?.length ? [{
	key: 'pinned',
	title: i18n.ts.pinnedNotes,
}] : []), ...(notesSearchAvailable ? [{
	key: 'search',
	title: i18n.ts.search,
}] : [])]);

definePage(() => ({
	title: channel.value ? channel.value.name : i18n.ts.channel,
	icon: 'ti ti-device-tv',
}));
</script>

<style lang="scss" module>
.hero {
	display: flex;
	flex-direction: column;
	gap: 16px;
	padding: var(--MI-cardPadding);
}

.heroMain {
	display: flex;
	align-items: center;
	gap: 16px;
	min-width: 0;
}

.thumb {
	flex-shrink: 0;
	display: grid;
	place-items: center;
	width: 72px;
	height: 72px;
	overflow: hidden;
	border-radius: calc(var(--MI-radius) / 2);
	background-image: linear-gradient(135deg, var(--MI_THEME-accentedBg), var(--MI_THEME-panelHighlight));
	color: var(--MI_THEME-accent);
	font-size: 28px;

	> img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
}

.heroBody {
	flex: 1;
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-width: 0;
}

.name {
	margin: 0;
	font-size: 1.4em;
	font-weight: 700;
	line-height: 1.4;
	overflow-wrap: anywhere;
}

.meta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 4px 16px;
	font-size: 0.9em;
	color: var(--MI_THEME-fgTransparentWeak);

	> span {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}

	> .warn {
		color: var(--MI_THEME-warn);
	}

	> .admin {
		color: var(--MI_THEME-accent);
	}
}

.metaButton {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	color: inherit;

	&:hover {
		color: var(--MI_THEME-accent);
	}
}

.heroActions {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	gap: 8px;
}

// 与图标按钮同高；加上全局类提高优先级，避免依赖样式加载顺序
.follow:global(._button) {
	height: 36px;
	padding: 0 16px;
}

.iconButton {
	display: grid;
	place-items: center;
	width: 36px;
	height: 36px;
	border-radius: 50%;
	color: var(--MI_THEME-fgTransparent);

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
		color: var(--MI_THEME-fg);
	}
}

.iconButtonActive {
	color: var(--MI_THEME-warn);

	&:hover {
		color: var(--MI_THEME-warn);
	}
}

.description {
	color: var(--MI_THEME-fgTransparent);
	line-height: 1.7;
	overflow-wrap: anywhere;
}

.composer {
	display: flex;
	align-items: flex-start;
	gap: 12px;
}

.composerAvatar {
	flex-shrink: 0;
	width: 36px;
	height: 36px;
}

.composerInput {
	flex: 1;
	min-width: 0;
	min-height: 72px;
	padding: 10px 14px;
	box-sizing: border-box;
	border-radius: calc(var(--MI-radius) / 2);
	background: var(--MI_THEME-bg);
	color: var(--MI_THEME-fgTransparentWeak);
	text-align: left;
	vertical-align: top;
	align-self: stretch;

	&:hover {
		color: var(--MI_THEME-fgTransparent);
	}
}

.heroPostForm {
	--MI-postForm-spacing: 0px;
	padding: 0;
}

.feedCard {
	overflow: visible;
}

.feed {
	border-radius: 0 0 var(--MI-cardRadius) var(--MI-cardRadius);
	overflow: clip;

	:global(._card) {
		border-radius: 0 !important;
	}
}

.pinnedList > :not(:last-child) {
	border-bottom: var(--MI-divider);
}

.searchBox {
	padding: var(--MI-cardPadding);
	display: flex;
	flex-wrap: wrap;
	align-items: flex-end;
	gap: 10px;
}

.searchInput {
	flex: 1 1 220px;
	min-width: 0;
}

.sideCard {
	--MI-containerHeaderBg: var(--MI_THEME-panel);
}

.sideCard + .sideCard {
	margin-top: var(--MI-margin);
}

.sideBody {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 14px var(--MI-cardPadding);
	border-top: var(--MI-divider);
	line-height: 1.7;
	overflow-wrap: anywhere;
}

.memberHeading {
	margin: 0;
	font-size: 1em;
	font-weight: normal;
}

.owner {
	display: flex;
	flex-direction: column;
	align-self: flex-start;
	align-items: flex-start;
	gap: 4px;
	max-width: 100%;
}

.ownerAvatar {
	width: 40px;
	height: 40px;
}

.ownerName {
	font-size: 0.85em;
}

.memberStack {
	display: flex;
	isolation: isolate;
	padding-left: 6px;
}

.memberAvatar {
	width: 24px;
	height: 24px;
	margin-left: -6px;
	box-shadow: 0 0 0 2px var(--MI_THEME-panel);
}

.membersLink {
	display: inline-flex;
	align-items: center;
	align-self: flex-start;
	gap: 4px;
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparentWeak);

	&:hover {
		color: var(--MI_THEME-accent);
		text-decoration: none;
	}
}

@container (max-width: 500px) {
	.heroMain {
		flex-wrap: wrap;
	}

	.thumb {
		width: 56px;
		height: 56px;
	}

	.heroActions {
		width: 100%;
	}
}
</style>
