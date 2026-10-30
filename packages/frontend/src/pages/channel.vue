<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="layoutEl" class="_pageLayout" :class="[$style.layout, { _pageLayoutWithSidebar: !narrow }]">
	<PageWithHeader class="_pageContent" :class="$style.main" hideHeader>
		<MkError v-if="error" @retry="fetchChannel()"/>
		<MkLoading v-else-if="!channel"/>
		<div v-else class="_gaps">
			<section class="_panel" :class="$style.hero" :style="{ '--MI-channelColor': channel.color }">
				<div class="_imageContainer" :class="$style.cover">
					<img v-if="channel.bannerUrl" class="_imageBackground" :src="channel.bannerUrl" alt=""/>
					<div v-if="!channel.bannerUrl" :class="$style.coverMark" aria-hidden="true">
						<i class="ti ti-broadcast"></i>
					</div>
					<div :class="$style.heroActions">
						<XChannelFollowButton v-if="$i" :channel="channel" :class="$style.follow"/>
						<button v-if="$i" v-tooltip="favorited ? i18n.ts.unfavorite : i18n.ts.favorite" type="button" class="_button" :class="[$style.iconButton, { [$style.iconButtonActive]: favorited }]" :aria-label="favorited ? i18n.ts.unfavorite : i18n.ts.favorite" :aria-pressed="favorited" @click="favorited ? unfavorite() : favorite()"><i class="ti ti-star" aria-hidden="true"></i></button>
						<button v-tooltip="i18n.ts.more" type="button" class="_button" :class="$style.iconButton" :aria-label="i18n.ts.more" aria-haspopup="menu" @click="showMenu"><i class="ti ti-dots" aria-hidden="true"></i></button>
					</div>
				</div>
				<div :class="$style.heroMain">
					<div :class="$style.thumb">
						<img v-if="channel.bannerUrl" :src="channel.bannerUrl" alt=""/>
						<i v-else class="ti ti-broadcast" aria-hidden="true"></i>
					</div>
					<div :class="$style.heroBody">
						<div :class="$style.nameRow">
							<h1 :class="$style.name"><Mfm :text="channel.name" :plain="true"/></h1>
							<span v-if="channel.isSensitive" :class="[$style.statusChip, $style.statusWarn]">{{ i18n.ts.sensitive }}</span>
							<span v-if="isOwner" :class="[$style.statusChip, $style.statusAdmin]"><i class="ti ti-user-star" aria-hidden="true"></i>{{ i18n.ts.youAreAdmin }}</span>
						</div>
						<div :class="$style.meta">
							<button type="button" class="_textButton" :class="$style.metaButton" aria-haspopup="dialog" @click="showMembers"><i class="ti ti-users" aria-hidden="true"></i>{{ i18n.tsx._channel.usersCount({ n: participantsCount }) }}</button>
							<span><i class="ti ti-pencil" aria-hidden="true"></i>{{ i18n.tsx._channel.notesCount({ n: channel.notesCount }) }}</span>
							<button type="button" class="_textButton" :class="$style.metaButton" @click="share()"><i class="ti ti-share" aria-hidden="true"></i>{{ i18n.ts.share }}</button>
						</div>
					</div>
				</div>
				<template v-if="$i && !channel.isArchived">
					<div :class="$style.composerArea">
						<MkPostForm v-if="prefer.r.showFixedPostFormInChannel.value" :channel="channel" fixed :initialRows="2" :autofocus="false" :class="$style.heroPostForm"/>
						<div v-else :class="$style.composer">
							<MkAvatar :user="$i" :class="$style.composerAvatar"/>
							<button type="button" class="_button" :class="$style.composerInput" @click="openPostForm()">{{ i18n.ts.postToTheChannel }}</button>
						</div>
					</div>
				</template>
			</section>

			<Teleport :to="sidebarEl ?? 'body'" :disabled="narrow || !sidebarEl">
				<aside :aria-label="i18n.ts.channel">
					<MkContainer v-if="channel.description" :class="$style.sideCard">
						<template #header>{{ i18n.ts._channel.announcement }}</template>
						<div :class="$style.sideBody"><XAnnouncement :key="channel.id" :text="channel.description"/></div>
					</MkContainer>
					<!-- 管理员不一定发过帖，单独一张卡片，不计入参与者。 -->
					<MkContainer v-if="owner" :class="$style.sideCard">
						<template #header>{{ i18n.ts.administrator }}</template>
						<div :class="$style.sideBody">
							<MkA :to="userPage(owner)" :class="$style.owner" :title="owner.name ?? owner.username">
								<MkAvatar :user="owner" :class="$style.ownerAvatar" :link="false"/>
								<MkUserName :user="owner" :class="$style.ownerName"/>
							</MkA>
						</div>
					</MkContainer>
					<MkContainer v-if="members.length > 0" :class="$style.sideCard">
						<template #header>{{ i18n.ts._channel.recentMembers }}</template>
						<div :class="$style.sideBody">
							<!-- 与帖子点赞汇总一致：整块点击打开参与者弹窗，头像悬停只显示名称。 -->
							<button type="button" class="_button" :class="$style.memberSummary" aria-haspopup="dialog" :aria-label="i18n.tsx._channel.membersJoined({ n: participantsCount })" @click="showMembers">
								<span :class="$style.memberStack">
									<span v-for="(user, i) in members" :key="user.id" v-tooltip.noDelay="user.name ?? user.username" :class="$style.memberAvatarWrap" :style="{ zIndex: members.length - i }">
										<MkAvatar :user="user" :class="$style.memberAvatar" imageOnly title=""/>
									</span>
								</span>
								<span v-if="participantsCount > members.length" class="_textAction" :class="$style.membersLink">
									{{ i18n.tsx._channel.membersJoined({ n: participantsCount }) }}<i class="ti ti-chevron-right" aria-hidden="true"></i>
								</span>
							</button>
						</div>
					</MkContainer>
				</aside>
			</Teleport>

			<div class="_gaps">
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
									<template #suffix>
										<button type="button" class="_button" :class="$style.searchAction" @click="search()">{{ i18n.ts.search }}</button>
									</template>
								</MkInput>
							</div>
							<MkNotesTimeline v-if="searchPaginator" :key="searchKey" :paginator="searchPaginator" :withControl="false" noGap pageEmpty/>
						</template>
					</div>
				</MkStickyContainer>
			</div>
		</div>
	</PageWithHeader>
	<div v-show="!narrow" ref="sidebarEl" class="_pageNavigation" :class="$style.sidebar"></div>
</div>
</template>

<script lang="ts" setup>
import { notesSearchAvailable } from '@/utility/check-permissions.js';
import { computed, defineAsyncComponent, markRaw, provide, ref, shallowRef, useTemplateRef, watch } from 'vue';
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
import MkInput from '@/components/MkInput.vue';
import MkNote from '@/components/MkNote.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkContainer from '@/components/MkContainer.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { useStream } from '@/stream.js';
import { globalEvents } from '@/events.js';
import { $i, iAmModerator } from '@/i.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { favoritedChannelsCache } from '@/cache.js';
import { prefer } from '@/preferences.js';
import { openShareDialog } from '@/utility/share-dialog.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { miLocalStorage } from '@/local-storage.js';
import { useRouter } from '@/router.js';
import { Paginator } from '@/utility/paginator.js';
import { usePageNavigationNarrow } from '@/composables/use-page-navigation-narrow.js';
import { DI } from '@/di.js';

const props = defineProps<{
	channelId: string;
}>();

provide(DI.inChannel, computed<string | null>(() => props.channelId));

const router = useRouter();
const layoutEl = useTemplateRef('layoutEl');
const sidebarEl = useTemplateRef('sidebarEl');
const narrow = usePageNavigationNarrow(layoutEl);
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

// “最近参与”实时更新，按最近一次发帖排序：
// - 已知参与者再次发帖时只在本地移到最前，人数不变，不请求接口。
// - 新帖子来自本次会话中未出现过的用户时，可能是新参与者，重新获取参与者和人数。
// - 频道推送不包含删除事件，改为监听帖子删除事件后刷新。删除事件不带频道信息，刷新只请求前几名参与者和人数，开销很小。
watch(() => props.channelId, (channelId, _previous, onCleanup) => {
	const connection = useStream().useChannel('channel', { channelId });
	let knownUserIds = new Set<string>();
	let timer: number | undefined;
	let resetKnown = false;
	const refreshMembers = async () => {
		timer = undefined;
		const reset = resetKnown;
		resetKnown = false;
		const [show, users] = await Promise.all([
			misskeyApi('channels/show', { channelId }),
			misskeyApi('channels/participants', { channelId, limit: MEMBER_LIMIT }),
		]).catch(() => [null, null] as const);
		if (channelId !== props.channelId || show == null || users == null || channel.value?.id !== channelId) return;
		// 删除后某人可能已不是参与者，按最新列表重建，之后他再发帖仍能被识别为新参与者。
		if (reset) knownUserIds = new Set();
		channel.value = { ...channel.value, participantsCount: show.participantsCount };
		members.value = users;
	};
	const scheduleRefresh = () => {
		window.clearTimeout(timer);
		timer = window.setTimeout(refreshMembers, 1000);
	};
	const stopWatchingMembers = watch(members, users => { for (const user of users) knownUserIds.add(user.id); }, { immediate: true });
	connection.on('note', (note: Misskey.entities.Note) => {
		if (!knownUserIds.has(note.userId)) {
			knownUserIds.add(note.userId);
			scheduleRefresh();
			return;
		}
		if (members.value[0]?.id === note.userId) return;
		members.value = [note.user, ...members.value.filter(user => user.id !== note.userId)].slice(0, MEMBER_LIMIT);
	});
	const onNoteDeleted = () => {
		resetKnown = true;
		scheduleRefresh();
	};
	globalEvents.on('noteDeleted', onNoteDeleted);
	onCleanup(() => {
		window.clearTimeout(timer);
		stopWatchingMembers();
		globalEvents.off('noteDeleted', onNoteDeleted);
		connection.dispose();
	});
}, { immediate: true });

function showMembers() {
	const { dispose } = os.popup(defineAsyncComponent(() => import('./channel.members-dialog.vue')), {
		channelId: props.channelId,
		count: participantsCount.value,
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
		os.toast(i18n.ts.muted, 'success');
	}, () => {}); // 失败提示由 apiWithDialog 处理
}

async function unmute() {
	if (!channel.value) return;
	const _channel = channel.value;

	os.apiWithDialog('channels/mute/delete', {
		channelId: _channel.id,
	}).then(() => {
		_channel.isMuting = false;
		os.toast(i18n.ts.unmuted, 'success');
	}, () => {}); // 失败提示由 apiWithDialog 处理
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
}] : []), ...(notesSearchAvailable.value ? [{
	key: 'search',
	title: i18n.ts.search,
}] : [])]);

definePage(() => ({
	title: channel.value ? channel.value.name : i18n.ts.channel,
	icon: 'ti ti-broadcast',
}));
</script>

<style lang="scss" module>
@use '../styles/layout.scss' as layout;
@use '../styles/search.scss' as search;

.layout:global(._pageLayoutWithSidebar) {
	// 主列与信息栏各自滚动，列宽在频道资料加载前就确定。
	grid-template-columns: minmax(0, 1fr) layout.$sidebarWidth;

	> .main {
		grid-column: 1;
	}
}

.sidebar {
	grid-column: 2;
	padding: 0;
	background: none;
}

.hero {
	--hero-cover-height: 64px;
	display: flex;
	flex-direction: column;
	overflow: hidden;
	background: var(--MI_THEME-panel);
}

.cover {
	position: relative;
	flex-shrink: 0;
	height: var(--hero-cover-height);
	overflow: hidden;
	background:
		radial-gradient(circle at 90% 10%, color-mix(in srgb, var(--MI_THEME-accent) 22%, transparent), transparent 38%),
		linear-gradient(125deg,
			color-mix(in srgb, var(--MI-channelColor) 72%, var(--MI_THEME-panel)),
			color-mix(in srgb, var(--MI-channelColor) 28%, var(--MI_THEME-panelHighlight)) 58%,
			var(--MI_THEME-panel));
}

.coverMark {
	position: absolute;
	right: clamp(28px, 10%, 88px);
	bottom: -8px;
	color: color-mix(in srgb, var(--MI_THEME-panel) 42%, transparent);
	font-size: 58px;
	line-height: 1;
	transform: rotate(-8deg);
	pointer-events: none;
}

.heroMain {
	position: relative;
	z-index: 1;
	display: flex;
	align-items: flex-start;
	gap: 12px;
	min-width: 0;
	padding: 0 var(--MI-cardPadding) 12px;
}

.thumb {
	position: relative;
	z-index: 2;
	flex-shrink: 0;
	display: grid;
	place-items: center;
	width: 60px;
	height: 60px;
	margin-top: -24px;
	box-sizing: border-box;
	overflow: hidden;
	border: 3px solid var(--MI_THEME-panel);
	border-radius: var(--MI-radius);
	background-image: linear-gradient(135deg,
		color-mix(in srgb, var(--MI-channelColor) 78%, var(--MI_THEME-panel)),
		color-mix(in srgb, var(--MI-channelColor) 22%, var(--MI_THEME-panelHighlight)));
	color: var(--MI_THEME-accent);
	font-size: 22px;
	box-shadow: 0 5px 20px color-mix(in srgb, var(--MI_THEME-shadow) 32%, transparent);

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
	gap: 6px;
	min-width: 0;
	padding-top: 6px;
}

.nameRow {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-width: 0;
}

.name {
	margin: 0;
	min-width: 0;
	font-size: clamp(1.2rem, 2vw, 1.4rem);
	font-weight: 700;
	line-height: 1.25;
	overflow-wrap: anywhere;
}

.statusChip {
	flex-shrink: 0;
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 2px 8px;
	border-radius: 999px;
	background: var(--MI_THEME-panelHighlight);
	color: var(--MI_THEME-fgTransparent);
	font-size: .74em;
	font-weight: 600;
	line-height: 1.5;
}

.statusWarn {
	color: var(--MI_THEME-warn);
	background: color-mix(in srgb, var(--MI_THEME-warn) 12%, var(--MI_THEME-panel));
}

.statusAdmin {
	color: var(--MI_THEME-accent);
	background: color-mix(in srgb, var(--MI_THEME-accent) 12%, var(--MI_THEME-panel));
}

.meta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 4px;
	font-size: .82em;
	color: var(--MI_THEME-fgTransparentWeak);

	> span {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 3px 7px;
	}
}

.metaButton {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 3px 7px;
	border-radius: 999px;
	color: inherit;

	&:hover {
		background: var(--MI_THEME-panelHighlight);
		color: var(--MI_THEME-accent);
	}
}

.heroActions {
	position: absolute;
	top: 8px;
	right: var(--MI-cardPadding);
	z-index: 2;
	display: flex;
	align-items: center;
	gap: 8px;
	max-width: calc(100% - var(--MI-cardPadding) * 2);
}

// 与图标按钮同高；加上全局类提高优先级，避免依赖样式加载顺序。状态配色由 MkChannelFollowButton 统一提供
.follow:global(._button) {
	height: 32px;
}

.iconButton {
	display: grid;
	place-items: center;
	width: 32px;
	height: 32px;
	border-radius: 50%;
	background: var(--MI_THEME-panel);
	color: var(--MI_THEME-fgTransparent);
	box-shadow: 0 2px 10px color-mix(in srgb, var(--MI_THEME-shadow) 24%, transparent);

	&:hover {
		background: var(--MI_THEME-panelHighlight);
		color: var(--MI_THEME-fg);
	}
}

.iconButtonActive {
	color: var(--MI_THEME-warn);

	&:hover {
		color: var(--MI_THEME-warn);
	}
}

.composerArea {
	padding: var(--MI-cardPadding) var(--MI-cardPadding) 0;
	border-top: var(--MI-divider);
	background: color-mix(in srgb, var(--MI_THEME-panelHighlight) 24%, var(--MI_THEME-panel));
}

.composer {
	display: flex;
	align-items: flex-start;
	gap: 12px;
}

.composerAvatar {
	flex-shrink: 0;
	width: 32px;
	height: 32px;
}

.composerInput {
	flex: 1;
	min-width: 0;
	min-height: 56px;
	padding: 10px 14px;
	box-sizing: border-box;
	border-radius: calc(var(--MI-radius) / 2);
	background: var(--MI-inputFill);
	color: var(--MI-inputPlaceholder);
	text-align: left;
	vertical-align: top;
	align-self: stretch;

	// 点击后才打开发帖框，外观按未聚焦的输入框处理。
	&:hover {
		background: var(--MI-inputHoverFill);
	}
}

.heroPostForm {
	--MI-postForm-spacing: var(--MI-cardPadding);
	width: 100%;
	min-width: 0;
	padding: 0;
}

.feedCard {
	overflow: visible;
}

.feed {
	border-radius: 0 0 var(--MI-cardRadius) var(--MI-cardRadius);
	overflow: clip;

	// 外框和标签下的分割线已由卡片和页头提供，列表自身的边框会与之重叠。
	:global(._card) {
		border: none;
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

.searchInput .searchAction {
	@include search.button;
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
	// 标题栏已有下分割线，这里不再画上边框，否则两条线叠在一起。
	padding: 14px var(--MI-cardPadding);
	line-height: 1.7;
	overflow-wrap: anywhere;
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

// 侧栏卡片的内容统一用正文字号。
.ownerName {
	font-size: 1em;
}

// 头像一行、人数另起一行；悬停只播放全局箭头动画，不改变文字颜色。
.memberSummary {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	align-self: flex-start;
	gap: 10px;
	max-width: 100%;
	color: var(--MI_THEME-fgTransparent);

	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: 2px; border-radius: var(--MI-radius); }
}

.memberStack {
	display: flex;
	align-items: center;
	isolation: isolate;
}

.memberAvatarWrap {
	position: relative;
	display: block;
	border-radius: 50%;
	box-shadow: 0 0 0 2px var(--MI_THEME-panel);

	& + & { margin-left: -6px; }
}

// 层叠头像只显示头像图片，避免装饰溢出遮挡相邻头像。
.memberAvatar {
	display: block;
	width: 24px;
	height: 24px;
}

.membersLink {
	display: inline-flex;
	align-items: center;
	gap: 2px;
	font-size: 1em;
	white-space: nowrap;
}

@container (max-width: 500px) {
	.hero {
		--hero-cover-height: 52px;
	}

	.coverMark {
		right: 18px;
		bottom: -7px;
		font-size: 48px;
	}

	.heroMain {
		gap: 10px;
		padding: 0 14px 12px;
	}

	.thumb {
		width: 54px;
		height: 54px;
		margin-top: -22px;
		border-width: 2px;
		font-size: 20px;
	}

	.heroBody {
		padding-top: 4px;
	}

	.name {
		font-size: 1.15rem;
	}

	.heroActions {
		top: 6px;
		right: 8px;
		max-width: calc(100% - 24px);
	}

	.follow:global(._button) {
		height: 30px;
		padding-inline: 12px;
	}

	.iconButton {
		width: 30px;
		height: 30px;
	}

	.composerArea {
		padding: 8px 14px 12px;
	}
}
</style>
