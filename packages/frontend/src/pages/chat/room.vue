<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :contentCard="tab === 'chat'" :class="[$style.chatPage, { [$style.room]: tab === 'chat' }]" :reversed="tab === 'chat'" :tabs="headerTabs" :actions="headerActions">
	<div v-if="tab === 'chat'" :class="$style.conversation">
		<div>
			<div>
				<div v-if="initializing">
					<MkLoading/>
				</div>

				<div v-else-if="messages.length === 0">
					<div :class="$style.emptyState">
						<div>{{ i18n.ts._chat.noMessagesYet }}</div>
						<template v-if="user">
							<div v-if="user.chatScope === 'followers'">{{ i18n.ts._chat.thisUserAllowsChatOnlyFromFollowers }}</div>
							<div v-else-if="user.chatScope === 'following'">{{ i18n.ts._chat.thisUserAllowsChatOnlyFromFollowing }}</div>
							<div v-else-if="user.chatScope === 'mutual'">{{ i18n.ts._chat.thisUserAllowsChatOnlyFromMutualFollowing }}</div>
							<div v-else-if="user.chatScope === 'none'">{{ i18n.ts._chat.thisUserNotAllowedChatAnyone }}</div>
						</template>
						<template v-else-if="room">
							<div>{{ i18n.ts._chat.inviteUserToChat }}</div>
						</template>
					</div>
				</div>

				<div v-else ref="timelineEl" class="_gaps">
					<div v-if="canFetchMore">
						<div :key="messages.at(-1)?.id" v-appear="fetchMore" :class="$style.sentinel" aria-hidden="true"></div>
						<MkLoading v-if="moreFetching"/>
					</div>

					<TransitionGroup
						:enterActiveClass="prefer.s.animation ? $style.transition_x_enterActive : ''"
						:leaveActiveClass="prefer.s.animation ? $style.transition_x_leaveActive : ''"
						:enterFromClass="prefer.s.animation ? $style.transition_x_enterFrom : ''"
						:leaveToClass="prefer.s.animation ? $style.transition_x_leaveTo : ''"
						:moveClass="prefer.s.animation ? $style.transition_x_move : ''"
						tag="div" class="_gaps"
					>
						<template v-for="item in timeline.toReversed()" :key="item.id">
							<XMessage v-if="item.type === 'item'" :message="item.data"/>
							<div v-else-if="item.type === 'date'" :class="$style.dateDivider">
								<span><i class="ti ti-chevron-up"></i> {{ item.nextText }}</span>
								<span style="height: 1em; width: 1px; background: var(--MI_THEME-divider);"></span>
								<span>{{ item.prevText }} <i class="ti ti-chevron-down"></i></span>
							</div>
						</template>
					</TransitionGroup>
				</div>
			</div>

			<div v-if="user && (!user.canChat || user.host !== null)">
				<MkInfo warn>{{ i18n.ts._chat.chatNotAvailableInOtherAccount }}</MkInfo>
			</div>

			<MkInfo v-if="$i.policies.chatAvailability !== 'available'" warn>{{ $i.policies.chatAvailability === 'readonly' ? i18n.ts._chat.chatIsReadOnlyForThisAccountOrServer : i18n.ts._chat.chatNotAvailableForThisAccountOrServer }}</MkInfo>
		</div>
	</div>

	<div v-else-if="tab === 'search'" class="_pageBody">
		<XSearch :userId="userId" :roomId="roomId"/>
	</div>

	<div v-else-if="tab === 'members'" class="_pageBody">
		<XMembers v-if="room != null" :key="`${membersVersion}:${invitationsRevision}`" :room="room" @inviteUser="inviteUser"/>
	</div>

	<div v-else-if="tab === 'info'" class="_pageBody">
		<XInfo v-if="room != null" :room="room" @updated="room = $event"/>
	</div>

	<template #footer>
		<div v-if="tab === 'chat'" :class="$style.footer">
			<div class="_gaps">
				<Transition name="fade">
					<div v-show="showIndicator" :class="$style.new">
						<button class="_buttonPrimary" :class="$style.newButton" @click="onIndicatorClick">
							<i class="fas ti-fw fa-arrow-circle-down" :class="$style.newIcon"></i>{{ i18n.ts._chat.newMessage }}
						</button>
					</div>
				</Transition>
				<XForm v-if="initialized" :user="user" :room="room" :class="$style.form"/>
			</div>
		</div>
	</template>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, useTemplateRef, computed, defineAsyncComponent, nextTick, onMounted, onBeforeUnmount, onDeactivated, onActivated } from 'vue';
import * as Misskey from 'misskey-js';
import { getScrollContainer } from '@@/js/scroll.js';
import type { MenuItem } from '@/types/menu.js';
import type { PageHeaderItem } from '@/types/page-header.js';
import * as os from '@/os.js';
import { useStream } from '@/stream.js';
import * as sound from '@/utility/sound.js';
import { i18n } from '@/i18n.js';
import { ensureSignin } from '@/i.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { definePage } from '@/page.js';
import { prefer } from '@/preferences.js';
import { useRouter } from '@/router.js';
import { useUserStatistics } from '@/composables/use-user-statistics.js';
import { useUserStatisticsVisibility } from '@/composables/use-user-statistics-visibility.js';
import MkInfo from '@/components/MkInfo.vue';
import { makeDateSeparatedTimelineComputedRef } from '@/utility/timeline-date-separate.js';

const $i = ensureSignin();
// 聊天外框先显示，消息附件和非当前标签按需加载。
const XMessage = defineAsyncComponent({ loader: () => import('./XMessage.vue').then(module => module.default), suspensible: false });
const XForm = defineAsyncComponent({ loader: () => import('./room.form.vue').then(module => module.default), suspensible: false });
const XSearch = defineAsyncComponent({ loader: () => import('./room.search.vue').then(module => module.default), suspensible: false });
const XMembers = defineAsyncComponent({ loader: () => import('./room.members.vue').then(module => module.default), suspensible: false });
const XInfo = defineAsyncComponent({ loader: () => import('./room.info.vue').then(module => module.default), suspensible: false });
const router = useRouter();

const props = defineProps<{
	userId?: string;
	roomId?: string;
}>();

export type NormalizedChatMessage = Omit<Misskey.entities.ChatMessageLite, 'fromUser' | 'reactions'> & {
	fromUser: Misskey.entities.UserLite;
	reactions: (Misskey.entities.ChatMessageLite['reactions'][number] & {
		user: Misskey.entities.UserLite;
	})[];
};

const initializing = ref(false);
const initialized = ref(false);
const moreFetching = ref(false);
const messages = ref<NormalizedChatMessage[]>([]);
const canFetchMore = ref(false);
const user = ref<Misskey.entities.UserDetailed | null>(null);
useUserStatistics(user, { active: useUserStatisticsVisibility() });
const room = ref<Misskey.entities.ChatRoom | null>(null);
const invitationsRevision = ref(0);
let disposed = false;
const connection = ref<Misskey.IChannelConnection<Misskey.Channels['chatUser']> | Misskey.IChannelConnection<Misskey.Channels['chatRoom']> | null>(null);
const showIndicator = ref(false);
const timelineEl = useTemplateRef('timelineEl');
const timeline = makeDateSeparatedTimelineComputedRef(messages);

function normalizeMessage(message: Misskey.entities.ChatMessageLite | Misskey.entities.ChatMessage): NormalizedChatMessage {
	return {
		...message,
		fromUser: message.fromUser ?? (message.fromUserId === $i.id ? $i : user.value!),
		reactions: message.reactions.map(record => ({
			...record,
			user: record.user ?? (message.fromUserId === $i.id ? user.value! : $i),
		})),
	};
}

async function initialize() {
	const LIMIT = 20;

	if (initializing.value) return;

	initializing.value = true;
	initialized.value = false;
	canFetchMore.value = false;

	if (props.userId) {
		const [u, m] = await Promise.all([
			misskeyApi('users/show', { userId: props.userId }),
			misskeyApi('chat/messages/user-timeline', { userId: props.userId, limit: LIMIT }),
		]);

		user.value = u;
		messages.value = m.map(x => normalizeMessage(x));

		if (messages.value.length === LIMIT) {
			canFetchMore.value = true;
		}

		connection.value = useStream().useChannel('chatUser', {
			otherId: user.value.id,
		});
		connection.value.on('message', onMessage);
		connection.value.on('deleted', onDeleted);
		connection.value.on('react', onReact);
		connection.value.on('unreact', onUnreact);
	} else if (props.roomId) {
		const [rResult, mResult] = await Promise.allSettled([
			misskeyApi('chat/rooms/show', { roomId: props.roomId }),
			misskeyApi('chat/messages/room-timeline', { roomId: props.roomId, limit: LIMIT }),
		]);

		if (rResult.status === 'rejected') {
			os.alert({
				type: 'error',
				text: i18n.ts.somethingHappened,
			});
			initializing.value = false;
			return;
		}

		const r = rResult.value as Misskey.entities.ChatRoomsShowResponse;

		if (r.invitationExists) {
			const confirm = await os.confirm({
				type: 'question',
				title: r.name,
				text: i18n.ts._chat.youAreNotAMemberOfThisRoomButInvited + '\n' + i18n.ts._chat.doYouAcceptInvitation,
			});
			if (confirm.canceled) {
				initializing.value = false;
				router.push('/chat');
				return;
			} else {
				try {
					await os.apiWithDialog('chat/rooms/join', { roomId: r.id });
				} catch {
					router.push('/chat');
					return;
				} finally { initializing.value = false; }
				void initialize();
				return;
			}
		}

		const m = mResult.status === 'fulfilled' ? mResult.value as Misskey.entities.ChatMessagesRoomTimelineResponse : [];

		room.value = r;
		messages.value = m.map(x => normalizeMessage(x));

		if (messages.value.length === LIMIT) {
			canFetchMore.value = true;
		}

		connection.value = useStream().useChannel('chatRoom', {
			roomId: room.value.id,
		});
		connection.value.on('membersChanged', refreshRoom);
		connection.value.on('message', onMessage);
		connection.value.on('deleted', onDeleted);
		connection.value.on('react', onReact);
		connection.value.on('unreact', onUnreact);
	}

	window.document.addEventListener('visibilitychange', onVisibilitychange);

	initialized.value = true;
	initializing.value = false;
}

let isActivated = true;

onActivated(() => {
	isActivated = true;
});

onDeactivated(() => {
	isActivated = false;
});

async function fetchMore() {
	const LIMIT = 30;
	if (!canFetchMore.value || moreFetching.value || initializing.value) return;
	const untilId = messages.value.at(-1)?.id;
	if (untilId == null) return;

	moreFetching.value = true;
	try {
		const newMessages = props.userId ? await misskeyApi('chat/messages/user-timeline', {
			userId: user.value!.id,
			limit: LIMIT,
			untilId,
		}) : await misskeyApi('chat/messages/room-timeline', {
			roomId: room.value!.id,
			limit: LIMIT,
			untilId,
		});

		messages.value.push(...newMessages.filter(x => !messages.value.some(message => message.id === x.id)).map(x => normalizeMessage(x)));
		canFetchMore.value = newMessages.length === LIMIT && messages.value.at(-1)?.id !== untilId;
	} catch (err) {
		os.alert({ type: 'error', text: i18n.ts.somethingHappened });
	} finally {
		moreFetching.value = false;
	}
}

function onMessage(message: Misskey.entities.ChatMessageLite) {
	if (messages.value.some(existing => existing.id === message.id)) return;
	const scroller = getScrollContainer(timelineEl.value);
	const followNewMessage = isActivated && (message.fromUserId === $i.id || !scroller || Math.abs(scroller.scrollTop) < 2);
	if ($i.onlineStatusOverride !== 'doNotDisturb') sound.playMisskeySfx('chatMessage');

	messages.value.unshift(normalizeMessage(message));
	// 只跟随新消息，回应、菜单与媒体渲染不能把正在阅读的位置拉到底部。
	if (followNewMessage) void nextTick(() => {
		if (isActivated && timelineEl.value) getScrollContainer(timelineEl.value)?.scrollTo({ top: 0, behavior: 'instant' });
	});

	// TODO: DOM的にバックグラウンドになっていないかどうかも考慮する
	if (message.fromUserId !== $i.id && !window.document.hidden && isActivated) {
		connection.value?.send('read', {
			id: message.id,
		});
	}

	if (message.fromUserId !== $i.id) {
		//notifyNewMessage();
	}
}

function onDeleted(id: string) {
	const index = messages.value.findIndex(m => m.id === id);
	if (index !== -1) {
		messages.value.splice(index, 1);
	}
}

function onReact(ctx: Parameters<Misskey.Channels['chatUser']['events']['react']>[0] | Parameters<Misskey.Channels['chatRoom']['events']['react']>[0]) {
	const message = messages.value.find(m => m.id === ctx.messageId);
	if (!message) return;
	const actor = room.value ? ctx.user : (message.fromUserId === $i.id ? user.value : $i);
	if (!actor || message.reactions.some(record => record.reaction === ctx.reaction && record.user.id === actor.id)) return;
	message.reactions.push({ reaction: ctx.reaction, user: actor });
}

function onUnreact(ctx: Parameters<Misskey.Channels['chatUser']['events']['unreact']>[0] | Parameters<Misskey.Channels['chatRoom']['events']['unreact']>[0]) {
	const message = messages.value.find(m => m.id === ctx.messageId);
	if (!message) return;
	const actor = room.value ? ctx.user : (message.fromUserId === $i.id ? user.value : $i);
	if (!actor) return;
	const index = message.reactions.findIndex(record => record.reaction === ctx.reaction && record.user.id === actor.id);
	if (index !== -1) message.reactions.splice(index, 1);
}

function onIndicatorClick() {
	showIndicator.value = false;
}

function notifyNewMessage() {
	showIndicator.value = true;
}

function onVisibilitychange() {
	if (window.document.hidden) return;
	// TODO
}

onMounted(() => {
	initialize();
});

onActivated(() => {
	if (!initialized.value) {
		initialize();
	}
});

onBeforeUnmount(() => {
	disposed = true;
	roomRefreshPending = false;
	connection.value?.dispose();
	window.document.removeEventListener('visibilitychange', onVisibilitychange);
});

async function inviteUser() {
	if (room.value == null) return;

	const invitee = await os.selectUser({ includeSelf: false, localOnly: true });
	try {
		await os.apiWithDialog('chat/rooms/invitations/create', {
			roomId: room.value.id,
			userId: invitee.id,
		});
		invitationsRevision.value++;
		os.success();
	} catch {
		// 请求弹窗已显示错误。
	}
}

async function leaveRoom() {
	if (room.value == null) return;

	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts.areYouSure,
	});
	if (canceled) return;

	await os.apiWithDialog('chat/rooms/leave', {
		roomId: room.value.id,
	});
	router.push('/chat');
}

function showMenu(ev: PointerEvent) {
	const menuItems: MenuItem[] = [];

	if (room.value) {
		if (room.value.ownerId === $i.id) {
			menuItems.push({
				text: i18n.ts._chat.inviteUser,
				icon: 'ti ti-user-plus',
				action: () => {
					inviteUser();
				},
			});
		} else {
			menuItems.push({
				text: i18n.ts._chat.leave,
				icon: 'ti ti-x',
				action: () => {
					leaveRoom();
				},
			});
		}
	}

	os.popupMenu(menuItems, ev.currentTarget ?? ev.target);
}

const tab = ref('chat');
const membersVersion = ref(0);
let roomRefreshId = 0;
let roomRefreshPending = false;
let roomRefreshRunning = false;

async function refreshRoom() {
	if (disposed || !room.value) return;
	if (roomRefreshRunning) {
		roomRefreshPending = true;
		return;
	}
	roomRefreshRunning = true;
	const requestId = ++roomRefreshId;
	const roomId = room.value.id;
	const updated = await misskeyApi('chat/rooms/show', { roomId }).catch(() => null);
	if (!disposed && updated && !roomRefreshPending && requestId === roomRefreshId && room.value?.id === roomId) {
		room.value.memberCount = updated.memberCount;
		membersVersion.value++;
	}
	roomRefreshRunning = false;
	if (roomRefreshPending) {
		roomRefreshPending = false;
		void refreshRoom();
	}
}

const headerTabs = computed(() => room.value ? [{
	key: 'chat',
	title: i18n.ts.chat,
	icon: 'ti ti-message-dots',
}, {
	key: 'members',
	title: `${i18n.ts._chat.members} (${room.value.memberCount})`,
	icon: 'ti ti-users',
}, {
	key: 'search',
	title: i18n.ts.search,
	icon: 'ti ti-search',
}, {
	key: 'info',
	title: i18n.ts.info,
	icon: 'ti ti-info-circle',
}] : [{
	key: 'chat',
	title: i18n.ts.chat,
	icon: 'ti ti-message-dots',
}, {
	key: 'search',
	title: i18n.ts.search,
	icon: 'ti ti-search',
}]);

const headerActions = computed<PageHeaderItem[]>(() => [{
	icon: 'ti ti-dots',
	handler: showMenu,
}]);

definePage(computed(() => {
	if (initialized.value) {
		if (user.value) {
			return {
				userName: user.value,
				title: user.value.name ?? user.value.username,
				avatar: user.value,
			};
		} else if (room.value) {
			return {
				title: room.value.name,
				icon: 'ti ti-users',
			};
		} else {
			return {
				title: i18n.ts.chat,
			};
		}
	} else {
		return {
			title: i18n.ts.chat,
		};
	}
}));
</script>

<style lang="scss" module>
.emptyState {
	display: flex;
	flex-direction: column;
	gap: 0;
	text-align: center;
	color: var(--MI_THEME-fgTransparentWeak);
	line-height: 1.5;
}

.transition_x_move,
.transition_x_enterActive,
.transition_x_leaveActive {
	transition: opacity 0.2s cubic-bezier(0,.5,.5,1), transform 0.2s cubic-bezier(0,.5,.5,1) !important;
}
.transition_x_enterFrom,
.transition_x_leaveTo {
	opacity: 0;
	transform: translateY(80px);
}
.transition_x_leaveActive {
	position: absolute;
}

.chatPage {
	--MI-tabUnderlineHeight: 0px;
}

.room {
	--MI-pageContentPadding: 0px;
	--MI-pageCardBg: var(--MI_THEME-panelHighlight);
	--MI-pageFooterBg: transparent;
}

.conversation {
	flex: 1 0 auto;
	min-width: 0;
	padding: var(--MI-cardPadding);
	box-sizing: border-box;
	background-color: var(--MI_THEME-panelHighlight);
	background-image: radial-gradient(circle, color-mix(in srgb, var(--MI_THEME-accent) 12%, transparent) 1px, transparent 1px);
	background-size: 24px 24px;
}

.sentinel {
	height: 1px;
}

.footer {
	width: 100%;
}

.new {
	width: 100%;
	padding-bottom: 8px;
	text-align: center;
}

.newButton {
	display: inline-block;
	margin: 0;
	padding: 0 12px;
	line-height: 32px;
	font-size: 12px;
	border-radius: 16px;
}

.newIcon {
	display: inline-block;
	margin-right: 8px;
}

// The composer is the footer of the same conversation surface.
.form {
	width: 100%;
}

.fade-enter-active, .fade-leave-active {
	transition: opacity 0.1s;
}

.fade-enter-from, .fade-leave-to {
	transition: opacity 0.5s;
	opacity: 0;
}

.dateDivider {
	display: flex;
	font-size: 85%;
	align-items: center;
	justify-content: center;
	gap: 0.5em;
	color: var(--MI_THEME-fgTransparentWeak);
	border: solid 0.5px var(--MI_THEME-divider);
	border-radius: 999px;
	width: fit-content;
	padding: 0.5em 1em;
	margin: 0 auto;
}
</style>
