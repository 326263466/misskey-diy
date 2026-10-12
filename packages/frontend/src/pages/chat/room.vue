<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div data-popup-boundary data-emoji-picker-boundary :class="[$style.chatPage, $style.room, { [$style.withSidebar]: roomId != null && canParticipate && membersOpen }]">
	<MkPageHeader hideTitle embedded :onScrollToTop="scrollToLatest" :class="$style.pageHeader">
		<template #actions>
			<div :class="$style.chatHeader">
				<button v-if="compactHeader" type="button" class="_button _iconButton" :class="$style.mobileHeaderButton" :aria-label="i18n.ts.goBack" @click="router.push('/chat')"><i class="ti ti-arrow-left" aria-hidden="true"></i></button>
				<button type="button" class="_button" :class="$style.chatTitle" :aria-busy="!titleText" :aria-label="titleText || i18n.ts.chat" @click="scrollToLatest()">
					<MkUserName v-if="titleUser" :class="$style.chatTitleText" :user="titleUser" :nowrap="true"/>
					<Mfm v-else :class="$style.chatTitleText" :text="titleText" :plain="true" :nowrap="true"/>
				</button>
				<button v-if="canParticipate" type="button" class="_button" :class="$style.headerTab" :disabled="!initialized" :aria-label="i18n.ts.search" @click="showPanel('search')"><i class="ti ti-search" aria-hidden="true"></i><span v-if="!compactHeader">{{ i18n.ts.search }}</span></button>
				<button v-if="roomId != null && canParticipate" v-tooltip="i18n.ts._chat.members" type="button" class="_button" :class="$style.mobileHeaderButton" :disabled="!initialized" :aria-label="i18n.ts._chat.members" :aria-expanded="membersOpen" :aria-controls="membersPanelId" @click="membersOpen = !membersOpen"><i :class="membersOpen ? 'ti ti-layout-sidebar-right-collapse' : 'ti ti-layout-sidebar-right-expand'" aria-hidden="true"></i></button>
				<div :class="$style.headerMenu">
					<button v-if="!initialized || canModify || canInvite || (room && canParticipate) || attentionMessages.length" type="button" class="_button _iconButton" :class="$style.mobileHeaderButton" :disabled="!initialized" :aria-label="i18n.ts.more" @click="showMenu"><i class="ti ti-dots" aria-hidden="true"></i></button>
				</div>
			</div>
		</template>
	</MkPageHeader>
	<div data-page-body :class="$style.conversationBody">
		<div ref="conversationEl" data-emoji-picker-boundary class="_scrollbarOnHover" :class="$style.conversation" @scroll.passive="onConversationScroll" @wheel.passive="stopScrollMotion" @touchstart.passive="stopScrollMotion" @pointerdown="stopScrollMotion">
			<div ref="conversationContentEl" :style="{ visibility: initialPositionReady ? undefined : 'hidden' }">
				<div>
					<div v-if="initializing" aria-busy="true"></div>
					<MkError v-else-if="initializationFailed" @retry="initialize"/>
						<div v-else-if="room?.isMember === false" :class="$style.emptyState">
							<div>{{ i18n.ts._chat.notMemberOfRoom }}</div>
						</div>

						<div v-else-if="initialized && messages.length === 0">
							<div :class="$style.emptyState">
								<div>{{ i18n.ts._chat.noMessagesYet }}</div>
							</div>
						</div>

					<div v-else-if="messages.length > 0" ref="timelineEl" :class="$style.timeline">
						<div v-if="canFetchMore && initialPositionReady" :key="messages.at(-1)?.id" v-appear="fetchMore" :class="$style.sentinel" aria-hidden="true"></div>

						<div class="_gaps">
							<template v-for="item in timeline.toReversed()" :key="item.type === 'date' ? getDateDividerKey(item.next) : item.id">
								<div v-if="item.type === 'item'" v-show="!hiddenMembers.includes(item.data.fromUserId) || item.data.systemEvent || item.data.id === readingMarkerId || item.data.id === revealedMessageId" :data-chat-message-row="item.data.id">
									<div v-if="item.data.id === readingMarkerId" data-chat-reading-marker :class="$style.readingMarker"><span>{{ i18n.ts._chat.lastReadPosition }}</span></div>
									<XMessage v-show="!hiddenMembers.includes(item.data.fromUserId) || item.data.systemEvent || item.data.id === revealedMessageId" :message="item.data" :nickname="nicknames.get(item.data.fromUserId)" :isRoomOwner="item.data.fromUserId === room?.ownerId" :memberMenu="room != null" :canEdit="!roomSilenced" :canCompose="true" :silenced="roomSilenced" :liveSync="true" @vue:mounted="animateNewMessage(item.data.id)" @edit="startEdit" @compose="compose" @showReply="jumpToMessage" @poke="poke" @avatarMenu="showAvatarMenu"/>
								</div>
								<div v-else-if="item.type === 'date'" :class="$style.dateDivider" :data-chat-date-divider="getDateDividerKey(item.next)">
									<span><i class="ti ti-chevron-up"></i> {{ item.nextText }}</span>
									<span style="height: 1em; width: var(--MI-dividerWidth); background: var(--MI-dividerColor);"></span>
									<span>{{ item.prevText }} <i class="ti ti-chevron-down"></i></span>
								</div>
							</template>
						</div>
					</div>
				</div>

				<div v-if="user && (!user.canChat || user.host !== null)">
					<MkInfo warn>{{ i18n.ts._chat.chatNotAvailableInOtherAccount }}</MkInfo>
				</div>

				<MkInfo v-if="$i.policies.chatAvailability !== 'available'" warn>{{ $i.policies.chatAvailability === 'readonly' ? i18n.ts._chat.chatIsReadOnlyForThisAccountOrServer : i18n.ts._chat.chatNotAvailableForThisAccountOrServer }}</MkInfo>
			</div>
		</div>

		<button v-if="initialized && initialPositionReady && (!atLatest || unreadCount > 0)" type="button" class="_button _shadow" :class="$style.latestButton" :disabled="loadingLatest" :aria-label="unreadCount > 0 ? `${i18n.ts._chat.latestMessages}，${i18n.tsx._chat.unreadMessages({ count: unreadCount })}` : i18n.ts._chat.latestMessages" @click="showLatest"><span v-if="unreadCount > 0" :class="$style.latestCount">{{ unreadCount > 999 ? '999+' : unreadCount }}</span><i class="ti ti-chevron-down" aria-hidden="true"></i></button>

		<div v-if="roomId != null && canParticipate" v-show="membersOpen" :id="membersPanelId" :class="$style.groupSidebar">
			<XSidebar v-if="room && membersOpen" :room="room" :memberships="roomMemberships" :membersFailed="membersFailed" :class="$style.groupSidebarContent" @retry="refreshRoom" @menu="showMemberMenu"/>
		</div>
	</div>
	<div data-emoji-picker-boundary :class="$style.footer">
		<div class="_gaps">
			<XForm v-if="canParticipate" ref="formEl" :user="user" :room="room" :silenced="roomSilenced" :initializing="!initialized" :conversationId="userId ? `user:${userId}` : `room:${roomId}`" :editing="editingMessage" :class="$style.form" @sent="onSent" @edited="onEdited" @cancelEdit="editingMessage = null"/>
			<div v-else-if="initialized && room?.isMember === false" :class="$style.joinPrompt" class="_gaps_s">
				<MkInfo v-if="room.joinPolicy === 'closed'">{{ i18n.ts._chat.joinPolicyClosed }}</MkInfo>
				<template v-else-if="room.joinPolicy === 'public' || room.invitationExists">
					<MkInfo v-if="room.invitationExists">{{ i18n.ts._chat.youAreNotAMemberOfThisRoomButInvited }}</MkInfo>
					<MkButton primary full :disabled="joiningRoom || $i.policies.chatAvailability !== 'available'" @click="joinRoom">{{ i18n.ts._chat.join }}</MkButton>
				</template>
				<MkButton v-else-if="room.joinPolicy === 'approval'" primary full :disabled="joiningRoom || room.joinRequestPending" @click="requestJoinRoom">{{ room.joinRequestPending ? i18n.ts._chat.joinRequestPending : i18n.ts._chat.requestJoin }}</MkButton>
				<MkInfo v-else>{{ i18n.ts._chat.joinPolicyInvitation }}</MkInfo>
			</div>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { ref, useId, useTemplateRef, computed, defineAsyncComponent, inject, nextTick, onMounted, onBeforeUnmount, onDeactivated, onActivated, watch } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import * as Misskey from 'misskey-js';
import { host } from '@@/js/config.js';
import { getChatAttention } from './composer.js';
import type { MenuItem } from '@/types/menu.js';
import type { ChatComposeAction } from './composer.js';
import { getChatMemberMenu, roomMembers } from './member-menu.js';
import type { ChatMember } from './member-menu.js';
import * as os from '@/os.js';
import { getChatInvitationErrorMessage, misskeyApiWithErrorToast } from '@/utility/misskey-api-with-toast.js';
import { isAccountSessionErrorHandled } from '@/utility/account-session-error.js';
import { useStream } from '@/stream.js';
import * as sound from '@/utility/sound.js';
import { i18n } from '@/i18n.js';
import { ensureSignin } from '@/i.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { definePage } from '@/page.js';
import { prefer } from '@/preferences.js';
import { useRouter } from '@/router.js';
import { globalEvents, useGlobalEvent } from '@/events.js';
import { useUserStatistics } from '@/composables/use-user-statistics.js';
import { useUserStatisticsVisibility } from '@/composables/use-user-statistics-visibility.js';
import MkInfo from '@/components/MkInfo.vue';
import MkButton from '@/components/MkButton.vue';
import XForm from './room.form.vue';
import { isSeparatorNeeded, makeDateSeparatedTimelineComputedRef } from '@/utility/timeline-date-separate.js';
import { normalizeReaction } from '@/utility/normalize-reaction.js';
import { cacheChatConversationTitle, forgetChatRoom, getChatConversationTitle, rememberChatConversation, setChatRoomMuted } from '@/utility/chat-conversations.js';
import { clearChatManualUnread, getChatConversationSetting, getChatNotificationMode, loadChatConversationSettings, updateChatConversation } from '@/utility/chat-conversation-settings.js';
import { miLocalStorage } from '@/local-storage.js';
import { animateChatMessageDisintegration, collapseChatMessageSpace } from '@/utility/chat-message-disintegrate.js';

const $i = ensureSignin();
// 聊天外框先显示，消息内容和群成员按需加载。
const XMessage = defineAsyncComponent({ loader: () => import('./XMessage.vue').then(module => module.default), suspensible: false });
const XSidebar = defineAsyncComponent({ loader: () => import('./room.sidebar.vue').then(module => module.default), suspensible: false });
const router = useRouter();
router.useListener('same', () => scrollToLatest());
const compactViewport = window.matchMedia('(max-width: 800px)');
const compactViewportMatches = ref(compactViewport.matches);
const floatingLayout = inject<ComputedRef<boolean> | null>('chatFloatingLayout', null);
const compactLayout = inject<Readonly<Ref<boolean>> | null>('chatCompactLayout', null);
const compactHeader = computed(() => compactLayout?.value ?? (compactViewportMatches.value || floatingLayout?.value === true));
const membersOpen = ref(false);
const membersPanelId = useId();

function onCompactViewportChange(event: MediaQueryListEvent) {
	compactViewportMatches.value = event.matches;
}

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
const initialPositionReady = ref(false);
const initializationFailed = ref(false);
const initialized = ref(false);
const moreFetching = ref(false);
const messages = ref<NormalizedChatMessage[]>([]);
const attentionMessages = ref<string[]>([]);
const unreadCount = ref(0);
const readingMarkerId = ref<string | null>(null);
let firstUnreadId: string | null = null;
let unreadSnapshotLastId: string | null = null;
const locallyReadIds = new Set<string>();
let readTimer: number | undefined;
let pendingReadId: string | null = null;
const jumpingToMessage = ref(false);
const revealedMessageId = ref<string | null>(null);
let messageJumpController: AbortController | null = null;
let messageHighlight: Animation | null = null;
let unreadLiveIds: string[] = [];
const atLatest = ref(false);
const hasNewerMessages = ref(false);
const loadingLatest = ref(false);
const fetchingNewer = ref(false);
const deferredMessages = new Map<string, Misskey.entities.ChatMessageLite>();
const deletedMessageIds = new Set<string>();
type ScrollPosition = { anchorId: string; beforeId: string | null; sinceDate: number; offset: number; atLatest?: boolean };
const scrollStorageKey = `chat-scroll:${$i.id}:${props.userId ? `user:${props.userId}` : `room:${props.roomId}`}` as const;
let storedPosition: ScrollPosition | null = null;
let roomLeft = false;
try {
	const saved = JSON.parse(miLocalStorage.getItem(scrollStorageKey) ?? 'null');
	if (typeof saved?.anchorId === 'string' && (saved.beforeId === null || typeof saved.beforeId === 'string') && Number.isFinite(saved.sinceDate) && saved.sinceDate >= 0 && Number.isFinite(saved.offset)) storedPosition = saved;
} catch { /* 损坏的位置记录不影响打开会话。 */ }
let pendingPosition: ScrollPosition | null = null;
let scrollSaveTimer: number | undefined;
let timelineVersion = 0;
const canFetchMore = ref(false);
const user = ref<Misskey.entities.UserDetailed | null>(null);
useUserStatistics(user, { active: useUserStatisticsVisibility() });
const room = ref<Misskey.entities.ChatRoom | null>(null);
const cachedTitle = getChatConversationTitle($i.id, props.roomId ? `room:${props.roomId}` : `user:${props.userId}`);
const titleUser = computed(() => user.value ?? cachedTitle?.user);
const titleText = computed(() => room.value?.name ?? user.value?.name ?? user.value?.username ?? cachedTitle?.name ?? '');
watch(room, updated => { if (updated) cacheChatConversationTitle($i.id, { room: updated }); }, { flush: 'sync' });
const roomMemberships = ref<Misskey.entities.ChatRoomMembership[]>([]);
const membersFailed = ref(false);
const nicknames = computed(() => new Map(room.value ? roomMembers(room.value, roomMemberships.value).map(member => [member.user.id, member.nickname]) : []));
const hiddenMembers = ref<string[]>([]);
const hiddenMembersKey = `chat-hidden-members:${$i.id}:${props.roomId ?? ''}` as const;
try {
	const stored = JSON.parse(miLocalStorage.getItem(hiddenMembersKey) ?? '[]');
	if (Array.isArray(stored)) hiddenMembers.value = stored.filter(id => typeof id === 'string' && id !== $i.id);
} catch { /* 损坏的本地设置不影响打开聊天。 */ }
const silenceNow = ref(Date.now());
let silenceTimer: number | undefined;
const roomSilenced = computed(() => (room.value?.myIsSilenced === true && (room.value.mySilenceUntil == null || Date.parse(room.value.mySilenceUntil) > silenceNow.value)) || (room.value?.ownerId !== $i.id && room.value?.myRole !== 'administrator' && room.value?.isSilenced === true && (room.value.silenceUntil == null || Date.parse(room.value.silenceUntil) > silenceNow.value)));
const roomMuted = computed(() => { void silenceNow.value; return getChatNotificationMode(props.roomId ? `room:${props.roomId}` : `user:${props.userId}`, room.value) !== 'all'; });

function updateSilenceTime() {
	window.clearTimeout(silenceTimer);
	silenceNow.value = Date.now();
	const remaining = Math.min(...[room.value?.silenceUntil, room.value?.mySilenceUntil, room.value?.mutedUntil].filter((date): date is string => date != null).map(date => Date.parse(date) - silenceNow.value).filter(duration => duration > 0));
	if (Number.isFinite(remaining)) silenceTimer = window.setTimeout(updateSilenceTime, Math.min(remaining + 10, 2147483647));
}

watch(() => [room.value?.isSilenced, room.value?.silenceUntil, room.value?.myIsSilenced, room.value?.mySilenceUntil, room.value?.isMuted, room.value?.mutedUntil], updateSilenceTime);
useGlobalEvent('chatRoomUpdated', updated => {
	if (room.value?.id === updated.id) room.value = updated;
});
const canParticipate = computed(() => room.value?.isMember !== false);
const canModify = computed(() => initialized.value && $i.policies.chatAvailability === 'available' && (room.value?.ownerId === $i.id || room.value?.myRole === 'administrator'));
const canInvite = computed(() => initialized.value && $i.policies.chatAvailability === 'available' && (props.roomId
	? (room.value?.ownerId === $i.id || room.value?.myRole === 'administrator') && room.value?.joinPolicy !== 'closed'
	: user.value?.host === null && user.value.id !== $i.id));
const joiningRoom = ref(false);
let disposed = false;
const connection = ref<Misskey.IChannelConnection<Misskey.Channels['chatUser']> | Misskey.IChannelConnection<Misskey.Channels['chatRoom']> | null>(null);
const editingMessage = ref<Misskey.entities.ChatMessageLite | null>(null);
const deletingMessages = new Map<string, AbortController>();
const pendingMessageAnimations = new Set<string>();
const enteringMessages = new Map<string, Animation>();
const movingMessages = new Map<string, Animation>();
const pendingFollowFades = new Set<string>();
const movementObservers = new Set<() => void>();
const formEl = useTemplateRef('formEl');
const timelineEl = useTemplateRef('timelineEl');
const conversationEl = useTemplateRef('conversationEl');
const conversationContentEl = useTemplateRef('conversationContentEl');
const timeline = makeDateSeparatedTimelineComputedRef(messages);
let followBottom = false;
let savedChatScrollTop = 0;
let bottomScrollFrame: number | null = null;
let scrollMotionFrame: number | null = null;
let smoothNextBottomScroll = false;
let lastAcknowledgedId: string | null = null;

function publishUnreadCount() {
	if (initialized.value && !roomLeft) globalEvents.emit('chatUnreadChanged', { id: props.roomId ? `room:${props.roomId}` : `user:${props.userId}`, count: unreadCount.value, throughId: lastAcknowledgedId });
}

watch([unreadCount, initialized], publishUnreadCount);

function isReading() {
	return isActivated && !window.document.hidden && window.document.hasFocus();
}

function acknowledgeNewest() {
	if (!initialized.value || hasNewerMessages.value || !followBottom || !isReading()) return;
	const scroller = conversationEl.value;
	if (!scroller || scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop >= 2) return;
	const id = messages.value[0]?.id;
	if (id) {
		if (id !== lastAcknowledgedId) { connection.value?.send('read', { id }); lastAcknowledgedId = id; }
		clearReadPrompts(id);
	}
}

function clearReadPrompts(id: string) {
	unreadLiveIds = unreadLiveIds.filter(messageId => messageId > id);
	attentionMessages.value = attentionMessages.value.filter(messageId => messageId > id);
	unreadCount.value = unreadLiveIds.length;
	firstUnreadId = null;
	// 正在末尾阅读时计数一直为零，仍需同步前进后的已读游标。
	publishUnreadCount();
}

function flushRead() {
	window.clearTimeout(readTimer);
	if (pendingReadId) connection.value?.send('read', { id: pendingReadId, count: true });
	pendingReadId = null;
}

function syncUnreadCount(unread: { count: number; firstMessageId: string | null; lastMessageId: string | null; throughId: string }) {
	if (lastAcknowledgedId && unread.throughId < lastAcknowledgedId) return;
	unreadLiveIds = unreadLiveIds.filter(id => id > unread.throughId);
	attentionMessages.value = attentionMessages.value.filter(id => id > unread.throughId);
	firstUnreadId = unread.firstMessageId;
	unreadSnapshotLastId = unread.lastMessageId;
	unreadCount.value = unread.count + unreadLiveIds.filter(id => id > (unread.lastMessageId ?? unread.throughId)).length;
	locallyReadIds.clear();
}

function acknowledgeVisible() {
	const scroller = conversationEl.value;
	if (!scroller || !initialized.value || pendingPosition || !isReading() || unreadCount.value === 0) return;
	const bounds = scroller.getBoundingClientRect();
	const rows = Array.from(timelineEl.value?.querySelectorAll<HTMLElement>('[data-chat-message-row]') ?? []);
	const lastVisible = rows.findLast(row => { const rect = row.getBoundingClientRect(); return rect.top < bounds.bottom && rect.bottom <= bounds.bottom + 1; });
	const id = lastVisible?.dataset.chatMessageRow;
	if (!id || (lastAcknowledgedId != null && id <= lastAcknowledgedId)) return;
	let readCount = 0;
	for (const message of messages.value) {
		if (message.id > id || message.fromUserId === $i.id || locallyReadIds.has(message.id)) continue;
		if (unreadLiveIds.includes(message.id) || (firstUnreadId != null && message.id >= firstUnreadId && unreadSnapshotLastId != null && message.id <= unreadSnapshotLastId)) {
			locallyReadIds.add(message.id);
			readCount++;
		}
	}
	if (!readCount) return;
	unreadCount.value = Math.max(0, unreadCount.value - readCount);
	unreadLiveIds = unreadLiveIds.filter(messageId => messageId > id);
	attentionMessages.value = attentionMessages.value.filter(messageId => messageId > id);
	lastAcknowledgedId = id;
	pendingReadId = id;
	window.clearTimeout(readTimer);
	readTimer = window.setTimeout(flushRead, 200);
}

function stopScrollMotion() {
	clearMessageMovementAnimations();
	if (scrollMotionFrame == null) return;
	cancelAnimationFrame(scrollMotionFrame);
	scrollMotionFrame = null;
	followBottom = false;
}

function glideToLatest() {
	const scroller = conversationEl.value;
	if (!scroller || !isReading()) return;
	if (!prefer.s.animation || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { scrollToLatest('instant'); return; }
	if (scrollMotionFrame != null) cancelAnimationFrame(scrollMotionFrame);
	const startTop = scroller.scrollTop;
	if (scroller.scrollHeight - scroller.clientHeight > startTop + 1) {
		fadeMovingMessages(getVisibleMessageRows().filter(row => pendingFollowFades.has(row.dataset.chatMessageRow!)), 180);
	}
	pendingFollowFades.clear();
	const started = performance.now();
	const frame = (now: number) => {
		if (disposed || !isReading() || !followBottom) { scrollMotionFrame = null; return; }
		const progress = Math.min(1, (now - started) / 180);
		const target = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
		scroller.scrollTop = startTop + (target - startTop) * (1 - (1 - progress) ** 3);
		if (progress < 1) scrollMotionFrame = requestAnimationFrame(frame);
		else {
			scrollMotionFrame = null;
			atLatest.value = !hasNewerMessages.value && scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop < 2;
			acknowledgeNewest();
		}
	};
	scrollMotionFrame = requestAnimationFrame(frame);
}

function scheduleScrollToLatest() {
	if (bottomScrollFrame != null || !followBottom || !isReading()) return;
	bottomScrollFrame = requestAnimationFrame(() => {
		bottomScrollFrame = null;
		if (followBottom && isReading() && !disposed) {
			if (smoothNextBottomScroll && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) glideToLatest();
			else scrollToLatest('instant');
		}
		smoothNextBottomScroll = false;
	});
}

function cancelScheduledBottomScroll() {
	pendingFollowFades.clear();
	if (bottomScrollFrame != null) cancelAnimationFrame(bottomScrollFrame);
	bottomScrollFrame = null;
	if (scrollMotionFrame != null) cancelAnimationFrame(scrollMotionFrame);
	scrollMotionFrame = null;
}

function scrollToLatest(behavior: ScrollBehavior = 'smooth') {
	if (!isReading()) return;
	if (hasNewerMessages.value) { void showLatest(); return; }
	const scroller = conversationEl.value;
	if (!scroller) return;
	cancelScheduledBottomScroll();
	followBottom = true;
	scroller.scrollTo({ top: scroller.scrollHeight, behavior });
	if (behavior === 'instant') { atLatest.value = true; acknowledgeNewest(); }
}

function onConversationScroll(event: Event) {
	const scroller = conversationEl.value;
	// 旧滚动区仍可能派发事件，不能用它覆盖当前会话的阅读位置。
	if (!scroller || event.target !== scroller || !isReading() || initializing.value || !initialPositionReady.value || pendingPosition) return;
	// 视口增高或消息收拢时，浏览器会夹紧旧位置；这不是用户向下阅读。
	if (!followBottom && savedChatScrollTop > Math.max(0, scroller.scrollHeight - scroller.clientHeight) + 0.5) {
		savedChatScrollTop = scroller.scrollTop;
		captureScrollPosition();
		return;
	}
	// 恢复锚点和尺寸校正产生的滚动事件不代表用户继续阅读。
	if (!followBottom && Math.abs(scroller.scrollTop - savedChatScrollTop) < 0.5) return;
	savedChatScrollTop = scroller.scrollTop;
	// 新增消息后的滚动请求还未执行，内容高度变化不能提前取消末尾跟随。
	if (bottomScrollFrame != null || scrollMotionFrame != null) return;
	const distance = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
	followBottom = !hasNewerMessages.value && distance < 2;
	atLatest.value = followBottom;
	if (followBottom) acknowledgeNewest();
	else acknowledgeVisible();
	captureScrollPosition();
	window.clearTimeout(scrollSaveTimer);
	scrollSaveTimer = window.setTimeout(saveScrollPosition, 200);
	if (distance < 80 && hasNewerMessages.value) void fetchNewer();
}

function captureScrollPosition() {
	const scroller = conversationEl.value;
	if (!scroller?.isConnected || !initialized.value || pendingPosition) return;
	const top = scroller.getBoundingClientRect().top;
	const bottom = scroller.getBoundingClientRect().bottom;
	const anchor = Array.from(timelineEl.value?.querySelectorAll<HTMLElement>('[data-chat-message-row]') ?? []).find(row => {
		const bounds = row.getBoundingClientRect();
		return bounds.bottom > top && bounds.top < bottom;
	});
	const index = messages.value.findIndex(message => message.id === anchor?.dataset.chatMessageRow);
	if (!anchor || index < 0) return;
	storedPosition = { anchorId: messages.value[index].id, beforeId: messages.value[index + 1]?.id ?? null, sinceDate: Date.parse(messages.value[index].createdAt) - 1, offset: anchor.getBoundingClientRect().top - top, atLatest: unreadCount.value === 0 && !hasNewerMessages.value && scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop < 2 };
}

function getRestorablePosition(position: ScrollPosition): ScrollPosition | null {
	const anchor = messages.value.find(message => message.id === position.anchorId)
		?? messages.value.findLast(message => message.id > position.anchorId)
		?? messages.value.find(message => message.id < position.anchorId);
	if (!anchor) return null;
	const index = messages.value.indexOf(anchor);
	return { ...position, anchorId: anchor.id, beforeId: messages.value[index + 1]?.id ?? null, sinceDate: Date.parse(anchor.createdAt) - 1 };
}

function saveScrollPosition() {
	if (roomLeft) return;
	captureScrollPosition();
	if (!storedPosition) return;
	try { miLocalStorage.setItem(scrollStorageKey, JSON.stringify(storedPosition)); } catch { /* 存储不可用时仍保留本次页面内的位置。 */ }
}

let initialLayoutFrame: number | null = null;
let initialLayoutSettled = false;

function cancelInitialLayout() {
	if (initialLayoutFrame != null) cancelAnimationFrame(initialLayoutFrame);
	initialLayoutFrame = null;
	initialLayoutSettled = false;
}

function restoreScrollPosition() {
	const scroller = conversationEl.value;
	if (!scroller || initializing.value || disposed || !isActivated) return;
	if (!initialPositionReady.value && messages.value.length && (timelineEl.value?.querySelectorAll('[data-chat-message-id]').length ?? 0) < messages.value.length) return;
	if (!initialPositionReady.value && !initialLayoutSettled) {
		if (initialLayoutFrame == null) {
			// 整体位置也要稳定；只看尺寸会在外层仍移动时提前显示消息。
			const measureLayout = () => {
				const bounds = scroller.getBoundingClientRect();
				const timeline = timelineEl.value?.getBoundingClientRect();
				return [bounds.x, bounds.y, bounds.width, bounds.height, scroller.scrollHeight, timeline?.y, timeline?.width, timeline?.height].join(':');
			};
			let previousSize = measureLayout();
			let stableFrames = 0;
			const settleLayout = () => {
				initialLayoutFrame = null;
				if (conversationEl.value !== scroller || disposed || !isActivated || scroller.clientHeight === 0) return;
				const size = measureLayout();
				stableFrames = size === previousSize ? stableFrames + 1 : 0;
				previousSize = size;
				if (stableFrames < 2) {
					initialLayoutFrame = requestAnimationFrame(settleLayout);
					return;
				}
				initialLayoutSettled = true;
				restoreScrollPosition();
			};
			initialLayoutFrame = requestAnimationFrame(settleLayout);
		}
		return;
	}
	if (followBottom && !hasNewerMessages.value) {
		scroller.scrollTop = scroller.scrollHeight - scroller.clientHeight;
		pendingPosition = null;
	} else if (!initialPositionReady.value && !pendingPosition) {
		scroller.scrollTop = savedChatScrollTop;
	}
	if (pendingPosition) {
		const anchor = timelineEl.value?.querySelector<HTMLElement>(`[data-chat-message-row="${CSS.escape(pendingPosition.anchorId)}"]`);
		if (!anchor?.querySelector('[data-chat-message-id]')) return;
		scroller.scrollTop += anchor.getBoundingClientRect().top - scroller.getBoundingClientRect().top - pendingPosition.offset;
		pendingPosition = null;
	}
	savedChatScrollTop = scroller.scrollTop;
	atLatest.value = !hasNewerMessages.value && scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop < 2;
	followBottom = (followBottom || (!initialPositionReady.value && unreadCount.value === 0)) && atLatest.value && isReading();
	initialPositionReady.value = true;
	captureScrollPosition();
	if (atLatest.value) acknowledgeNewest();
}

function requestTimeline(params: { limit: number; sinceId?: string; untilId?: string; sinceDate?: number }) {
	return props.userId
		? misskeyApi('chat/messages/user-timeline', { userId: props.userId, ...params, markAsRead: false })
		: misskeyApi('chat/messages/room-timeline', { roomId: props.roomId!, ...params, markAsRead: false });
}

async function loadInitialTimeline(firstUnreadId: string | null | undefined, version: number) {
	const position = storedPosition;
	let batch = await requestTimeline({ limit: 30, ...(position ? position.beforeId ? { sinceId: position.beforeId } : { sinceDate: position.sinceDate } : {}) });
	if (disposed || version !== timelineVersion) return;
	const useOlderWindow = position != null && batch.length === 0;
	if (useOlderWindow) {
		// 锚点恰好是已删除的最后一条消息时，回退到它前面的历史窗口。
		batch = await requestTimeline({ limit: 30, untilId: position.anchorId });
		if (disposed || version !== timelineVersion) return;
	}
	const ordered = position && !useOlderWindow ? batch.toReversed() : batch;
	const incoming = (!position || batch.length < 30) ? [...deferredMessages.values()].filter(message => ordered[0] == null || message.id > ordered[0].id) : [];
	const initial = new Map([...incoming.sort((a, b) => b.id.localeCompare(a.id)), ...ordered].map(message => [message.id, message]));
	messages.value = [...initial.values()].filter(message => !deletedMessageIds.has(message.id)).map(normalizeMessage);
	if (!position || batch.length < 30) deferredMessages.clear();
	readingMarkerId.value = firstUnreadId ?? null;
	hasNewerMessages.value = position != null && !useOlderWindow && (batch.length === 30 || [...deferredMessages.keys()].some(id => id > (messages.value[0]?.id ?? '')));
	canFetchMore.value = position && !useOlderWindow ? position.beforeId != null || position.sinceDate > 1 : batch.length === 30;
	pendingPosition = position ? getRestorablePosition(position) : null;
	if (position) storedPosition = pendingPosition;
	followBottom = position == null || (position.atLatest === true && unreadCount.value === 0 && !hasNewerMessages.value);
}

async function fetchNewer() {
	if (fetchingNewer.value || loadingLatest.value || initializing.value || !hasNewerMessages.value) return;
	const sinceId = messages.value[0]?.id;
	if (!sinceId) return;
	fetchingNewer.value = true;
	const version = timelineVersion;
	try {
		const batch = await requestTimeline({ sinceId, limit: 30 });
		if (disposed || loadingLatest.value || version !== timelineVersion) return;
		const ids = new Set(messages.value.map(message => message.id));
		messages.value.unshift(...batch.filter(message => !ids.has(message.id) && !deletedMessageIds.has(message.id)).toReversed().map(normalizeMessage));
		hasNewerMessages.value = batch.length === 30 && batch.some(message => message.id > sinceId);
		for (const message of batch) deferredMessages.delete(message.id);
		if (!hasNewerMessages.value && deferredMessages.size) {
			messages.value.unshift(...[...deferredMessages.values()].filter(message => !ids.has(message.id)).map(normalizeMessage).sort((a, b) => b.id.localeCompare(a.id)));
			deferredMessages.clear();
		}
	} catch { /* 保留当前位置，滚动或点击最新消息时可重试。 */ } finally { fetchingNewer.value = false; }
}

async function showLatest() {
	if (loadingLatest.value || disposed || !isReading() || roomLeft) return;
	cancelMessageJump();
	if (!hasNewerMessages.value) { followBottom = true; glideToLatest(); return; }
	loadingLatest.value = true;
	const version = ++timelineVersion;
	try {
		const batch = await requestTimeline({ limit: 30 });
		if (disposed || version !== timelineVersion) return;
		// 最新窗口以请求结果为准，只补请求期间新到达的消息，避免拼入旧缓存造成历史断层。
		const newestId = batch[0]?.id;
		const incoming = [...deferredMessages.values()].filter(message => newestId == null || message.id > newestId);
		const all = new Map([...batch, ...incoming].map(message => [message.id, message]));
		messages.value = [...all.values()].filter(message => !deletedMessageIds.has(message.id)).map(normalizeMessage).sort((a, b) => b.id.localeCompare(a.id));
		deferredMessages.clear();
		hasNewerMessages.value = false;
		canFetchMore.value = batch.length === 30;
		pendingPosition = null;
		await nextTick();
		if (disposed || version !== timelineVersion || !isReading()) return;
		followBottom = true;
		glideToLatest();
	} catch {
		if (!disposed && version === timelineVersion) os.toast(i18n.ts.somethingHappened, 'error');
	} finally { loadingLatest.value = false; }
}

// 普通文档流保持消息的布局原点不变；只在跟随末尾时响应异步消息、媒体和输入框的高度变化。
const conversationResizeObserver = new ResizeObserver(() => {
	if (!initialPositionReady.value || pendingPosition) { restoreScrollPosition(); return; }
	if (scrollMotionFrame != null) return;
	if (!followBottom && isActivated && storedPosition && conversationEl.value) {
		// 滚动事件尚未派发时，不能把用户刚滚到的位置纠正回旧锚点。
		if (Math.abs(conversationEl.value.scrollTop - savedChatScrollTop) > 1) return;
		const anchor = timelineEl.value?.querySelector<HTMLElement>(`[data-chat-message-row="${CSS.escape(storedPosition.anchorId)}"]`);
		if (anchor) {
			const difference = anchor.getBoundingClientRect().top - conversationEl.value.getBoundingClientRect().top - storedPosition.offset;
			if (Math.abs(difference) > 0.5) {
				conversationEl.value.scrollTop += difference;
				savedChatScrollTop = conversationEl.value.scrollTop;
			}
		}
	}
	scheduleScrollToLatest();
});

watch([conversationEl, conversationContentEl], ([scroller, content]) => {
	conversationResizeObserver.disconnect();
	cancelInitialLayout();
	initialPositionReady.value = false;
	if (!scroller || !content) {
		clearMessageMovementAnimations();
		return;
	}
	restoreScrollPosition();
	conversationResizeObserver.observe(scroller);
	conversationResizeObserver.observe(content);
}, { flush: 'post' });

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
	if (disposed || initializing.value) return;

	initializing.value = true;
	cancelInitialLayout();
	initialPositionReady.value = false;
	initializationFailed.value = false;
	const version = ++timelineVersion;
	initialized.value = false;
	canFetchMore.value = false;
	followBottom = false;
	connection.value?.dispose();
	connection.value = null;
	deferredMessages.clear();
	deletedMessageIds.clear();
	unreadLiveIds = [];
	lastAcknowledgedId = null;

	try {
		const settingsReady = loadChatConversationSettings().catch(() => {});
		if (props.userId) {
			const [u, unread] = await Promise.all([
				misskeyApi('users/show', { userId: props.userId }),
				readUnread(version),
			]);
			if (disposed || version !== timelineVersion) return;

			user.value = u;
			try { rememberChatConversation($i.id, u); } catch { /* 本地存储不可用时仍保留当前会话。 */ }
			connection.value = useStream().useChannel('chatUser', {
				otherId: user.value.id,
			});
			connection.value.on('message', onMessage);
			connection.value.on('deleted', onDeleted);
			connection.value.on('edited', applyMessageEdit);
			connection.value.on('react', onReact);
			connection.value.on('unreact', onUnreact);
			connection.value.on('unreadCount', syncUnreadCount);
			await loadInitialTimeline(unread?.firstMessageId, version);
		} else if (props.roomId) {
			const r = await misskeyApi('chat/rooms/show', { roomId: props.roomId }).catch(() => null);
			if (disposed || version !== timelineVersion) return;

			if (r == null) {
				initialPositionReady.value = true;
				initializationFailed.value = true;
				os.toast(i18n.ts.somethingHappened, 'error');
				initializing.value = false;
				return;
			}

			room.value = r;
			// 公开群直链只展示群信息，加入后才读取消息和订阅群频道。
			if (r.isMember !== false) {
				roomLeft = false;
				globalEvents.emit('chatRoomUpdated', r);
				const [unread, members] = await Promise.all([readUnread(version), misskeyApi('chat/rooms/members', { roomId: r.id, limit: 50 }).catch(() => null)]);
				if (disposed || version !== timelineVersion) return;
				membersFailed.value = members == null;
				if (members) roomMemberships.value = members;
				connection.value = useStream().useChannel('chatRoom', {
					roomId: room.value.id,
				});
				connection.value.on('membersChanged', refreshRoom);
				connection.value.on('roomUpdated', refreshRoom);
				connection.value.on('accessRevoked', () => {
					forgetChatRoom($i.id, r.id);
					connection.value?.dispose();
					connection.value = null;
					messages.value = [];
					deferredMessages.clear();
					os.toast(i18n.ts._chat.notMemberOfRoom, 'error');
					router.push('/chat');
				});
				connection.value.on('message', onMessage);
				connection.value.on('deleted', onDeleted);
				connection.value.on('edited', applyMessageEdit);
				connection.value.on('react', onReact);
				connection.value.on('unreact', onUnreact);
				connection.value.on('unreadCount', syncUnreadCount);
				await loadInitialTimeline(unread?.firstMessageId, version);
			}
		}

		await settingsReady;
		if (disposed || version !== timelineVersion) return;
		const setting = getChatConversationSetting(props.roomId ? `room:${props.roomId}` : `user:${props.userId}`);
		if (setting?.hidden) {
			await updateChatConversation(props.roomId ? { roomId: props.roomId } : { userId: props.userId! }, { hidden: false }).catch(() => {});
		}
		if (disposed || version !== timelineVersion) return;
		// 时间线已清人工标记；打开历史不能顺带确认尚未看到的真实未读。
		clearChatManualUnread(props.roomId ? `room:${props.roomId}` : `user:${props.userId}`);
		initialized.value = true;
		initializing.value = false;
		await nextTick();
		restoreScrollPosition();
	} catch {
		if (!disposed && version === timelineVersion) {
			initialPositionReady.value = true;
			initializationFailed.value = true;
			initializing.value = false;
			os.toast(i18n.ts.somethingHappened, 'error');
		}
	}
}

async function readUnread(version: number) {
	const unread = await misskeyApi('chat/unread', props.userId ? { userId: props.userId } : { roomId: props.roomId! }).catch(() => null);
	if (disposed || version !== timelineVersion) return null;
	unreadCount.value = unread?.count ?? 0;
	firstUnreadId = unread?.firstMessageId ?? null;
	unreadSnapshotLastId = unread?.lastMessageId ?? null;
	locallyReadIds.clear();
	attentionMessages.value = unread?.firstMentionId ? [unread.firstMentionId] : [];
	return unread;
}

let isActivated = true;

onActivated(() => {
	const returning = !isActivated;
	if (returning && unreadCount.value > 0) followBottom = false;
	isActivated = true;
	if (returning && storedPosition) pendingPosition = getRestorablePosition(storedPosition);
	const scrollTop = savedChatScrollTop;
	void nextTick(() => {
		if (disposed || !isActivated) return;
		if (!initialPositionReady.value || pendingPosition) { restoreScrollPosition(); return; }
		if (followBottom) scheduleScrollToLatest();
		else if (conversationEl.value) {
			conversationEl.value.scrollTop = scrollTop;
			atLatest.value = !hasNewerMessages.value && conversationEl.value.scrollHeight - conversationEl.value.clientHeight - scrollTop < 2;
		}
	});
});

onDeactivated(() => {
	flushRead();
	saveScrollPosition();
	isActivated = false;
	// 缓存页面再次插入时，先恢复阅读位置，再显示消息。
	initialPositionReady.value = false;
	if (initialized.value) timelineVersion++;
	cancelInitialLayout();
	cancelScheduledBottomScroll();
	clearMessageMovementAnimations();
	pendingMessageAnimations.clear();
	for (const animation of enteringMessages.values()) animation.cancel();
	enteringMessages.clear();
	for (const controller of deletingMessages.values()) controller.abort();
});

async function fetchMore() {
	const LIMIT = 30;
	// 隐藏消息仍会触发 IntersectionObserver，不能在初始定位前加载旧历史。
	if (!canFetchMore.value || moreFetching.value || initializing.value || !initialPositionReady.value || !isActivated) return;
	const untilId = messages.value.at(-1)?.id;
	if (untilId == null) return;

	moreFetching.value = true;
	const version = timelineVersion;
	try {
		const newMessages = props.userId ? await misskeyApi('chat/messages/user-timeline', {
			userId: user.value!.id,
			limit: LIMIT,
			untilId,
			markAsRead: false,
		}) : await misskeyApi('chat/messages/room-timeline', {
			roomId: room.value!.id,
			limit: LIMIT,
			untilId,
			markAsRead: false,
		});

		if (disposed || version !== timelineVersion) return;
		const scroller = conversationEl.value;
		const scrollerTop = scroller?.getBoundingClientRect().top ?? 0;
		const anchor = !followBottom && timelineEl.value
			? Array.from(timelineEl.value.querySelectorAll<HTMLElement>('[data-chat-message-id]')).find(element => element.getBoundingClientRect().bottom > scrollerTop)
			: undefined;
		const anchorTop = anchor?.getBoundingClientRect().top;
		messages.value.push(...newMessages.filter(x => !deletedMessageIds.has(x.id) && !messages.value.some(message => message.id === x.id)).map(x => normalizeMessage(x)));
		canFetchMore.value = newMessages.length === LIMIT && messages.value.at(-1)?.id !== untilId;
		moreFetching.value = false;
		await nextTick();
		if (scroller?.isConnected && anchor?.isConnected && anchorTop != null) {
			// 在顶部加载历史时保留原消息位置，只补浏览器原生锚定未处理的位移。
			const scale = scroller.getBoundingClientRect().height / parseFloat(getComputedStyle(scroller).height);
			scroller.scrollTop += (anchor.getBoundingClientRect().top - anchorTop) / scale;
		}
	} catch {
		if (!disposed && version === timelineVersion) os.toast(i18n.ts.somethingHappened, 'error');
	} finally {
		moreFetching.value = false;
	}
}

function onMessage(message: Misskey.entities.ChatMessageLite) {
	if (disposed || roomLeft) return;
	if (deferredMessages.has(message.id) || messages.value.some(existing => existing.id === message.id)) return;
	const beyondReadCursor = lastAcknowledgedId == null || message.id > lastAcknowledgedId;
	const addsUnread = message.fromUserId !== $i.id && beyondReadCursor && (unreadSnapshotLastId == null || message.id > unreadSnapshotLastId);
	if (hasNewerMessages.value || initializing.value || loadingLatest.value || jumpingToMessage.value) {
		deferredMessages.set(message.id, message);
		if (addsUnread) { unreadLiveIds.push(message.id); unreadCount.value++; }
		if (beyondReadCursor && getChatAttention(message, $i, host)) attentionMessages.value.push(message.id);
		if (!initializing.value && message.fromUserId === $i.id) void showLatest();
		return;
	}
	const scroller = conversationEl.value;
	const followNewMessage = isReading() && (message.fromUserId === $i.id || (followBottom && (scrollMotionFrame != null || !scroller || scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop < 2)));
	if (!roomMuted.value && $i.onlineStatusOverride !== 'doNotDisturb') sound.playMisskeySfx('chatMessage');

	if (isReading() && prefer.s.animation) pendingMessageAnimations.add(message.id);
	if (followNewMessage) {
		for (const row of getVisibleMessageRows()) pendingFollowFades.add(row.dataset.chatMessageRow!);
	}
	if (followNewMessage) followBottom = true;
	messages.value.unshift(normalizeMessage(message));
	if (!followNewMessage && beyondReadCursor && getChatAttention(message, $i, host)) attentionMessages.value.push(message.id);
	if (addsUnread) {
		// 跟随动画结束前仍未读，失焦中断时不能丢失这条消息的计数。
		if (!followNewMessage && unreadCount.value === 0) readingMarkerId.value = message.id;
		unreadLiveIds.push(message.id);
		unreadCount.value++;
	}
	// 只跟随新消息，回应、菜单与媒体渲染不能把正在阅读的位置拉到底部。
	if (followNewMessage) {
		smoothNextBottomScroll = prefer.s.animation;
		scheduleScrollToLatest();
	}
	void nextTick(() => animateNewMessage(message.id));

	if (message.fromUserId !== $i.id && followNewMessage && !smoothNextBottomScroll) {
		connection.value?.send('read', {
			id: message.id,
		});
		lastAcknowledgedId = message.id;
		clearReadPrompts(message.id);
	}
}

function onSent(message: Misskey.entities.ChatMessageLite) {
	const existing = messages.value.find(item => item.id === message.id);
	if (existing) existing.redPacketClaims = message.redPacketClaims;
	else onMessage(message);
	for (const claim of message.redPacketClaims ?? []) globalEvents.emit('redPacketClaimed', claim.redPacketId);
}

async function showAttention() {
	const id = attentionMessages.value[0];
	if (id && await jumpToMessage(id)) attentionMessages.value = attentionMessages.value.filter(messageId => messageId !== id);
}

async function jumpToMessage(id: string) {
	if (disposed || !isActivated) return false;
	cancelMessageJump();
	const controller = new AbortController();
	messageJumpController = controller;
	const version = ++timelineVersion;
	jumpingToMessage.value = true;
	followBottom = false;
	cancelScheduledBottomScroll();
	try {
		if (!messages.value.some(message => message.id === id)) {
			const previous = await requestTimeline({ untilId: id, limit: 1 });
			if (controller.signal.aborted || disposed || version !== timelineVersion) return false;
			const batch = await requestTimeline({ limit: 30, ...(previous[0] ? { sinceId: previous[0].id } : { sinceDate: 1 }) });
			if (controller.signal.aborted || disposed || version !== timelineVersion) return false;
			if (deletedMessageIds.has(id) || !batch.some(message => message.id === id)) { os.toast(i18n.ts._chat.messageUnavailable, 'error'); return false; }
			messages.value = batch.filter(message => !deletedMessageIds.has(message.id)).toReversed().map(normalizeMessage);
			canFetchMore.value = previous.length > 0;
			hasNewerMessages.value = batch.length === 30 || [...deferredMessages.keys()].some(messageId => messageId > (messages.value[0]?.id ?? ''));
		}
		pendingPosition = null;
		revealedMessageId.value = id;
		await nextTick();
		if (controller.signal.aborted || disposed || !isActivated || version !== timelineVersion) return false;
		const exists = timelineEl.value?.querySelector(`[data-chat-message-id="${CSS.escape(id)}"]`);
		if (exists) {
			focusMessage(id);
			lastAcknowledgedId = id;
			pendingReadId = id;
			flushRead();
		}
		return exists != null;
	} catch {
		if (!controller.signal.aborted && !disposed) os.toast(i18n.ts.somethingHappened, 'error');
		return false;
	} finally {
		if (messageJumpController === controller) {
			messageJumpController = null;
			jumpingToMessage.value = false;
		}
	}
}

const poking = ref(false);

async function poke(pokeUserId: string) {
	if (poking.value || roomSilenced.value || !canParticipate.value) return;
	poking.value = true;
	try {
		const message = props.userId
			? await misskeyApi('chat/messages/create-to-user', { toUserId: props.userId, pokeUserId })
			: await misskeyApi('chat/messages/create-to-room', { toRoomId: props.roomId!, pokeUserId });
		onSent(message);
	} catch {
		os.toast(i18n.ts.somethingHappened, 'error');
	} finally {
		poking.value = false;
	}
}

function canAnimateMessageMovement() {
	return !disposed && isActivated && prefer.s.animation && !window.document.hidden && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getVisibleMessageRows(): HTMLElement[] {
	if (!canAnimateMessageMovement() || !conversationEl.value || !timelineEl.value) return [];
	const bounds = conversationEl.value.getBoundingClientRect();
	const top = Math.max(0, bounds.top);
	const bottom = Math.min(window.innerHeight, bounds.bottom);
	if (bottom <= top) return [];
	const visible: HTMLElement[] = [];
	for (const row of Array.from(timelineEl.value.querySelectorAll<HTMLElement>('[data-chat-message-row]')).reverse()) {
		const rect = row.getBoundingClientRect();
		if (rect.bottom <= top) break;
		if (rect.top >= bottom || deletingMessages.has(row.dataset.chatMessageRow!)) continue;
		visible.push(row);
	}
	return visible;
}

function fadeMovingMessages(rows: HTMLElement[], duration: number) {
	if (!canAnimateMessageMovement()) return;
	let sequence = 0;
	for (const row of rows) {
		const id = row.dataset.chatMessageRow!;
		// 连续收消息或同时删除只延续正在播放的淡入，避免同一行反复闪暗。
		if (!row.isConnected || movingMessages.has(id) || enteringMessages.has(id) || deletingMessages.has(id) || typeof row.animate !== 'function') continue;
		const delay = Math.min(sequence++ * 10, 40);
		// 位移仍由滚动与占位收拢承担，透明度动画不改变消息或滚动区高度。
		const animation = row.animate([{ opacity: 0.65 }, { opacity: 1 }], { duration: duration - delay, delay, fill: 'backwards', easing: 'ease-out' });
		movingMessages.set(id, animation);
		void animation.finished.catch(() => {}).finally(() => {
			if (movingMessages.get(id) === animation) movingMessages.delete(id);
		});
	}
}

function watchCollapsingMessageMovement(): () => void {
	const positions = new Map(getVisibleMessageRows().map(row => [row, row.getBoundingClientRect().top]));
	let frame: number | null = null;
	const stop = () => {
		if (frame != null) cancelAnimationFrame(frame);
		frame = null;
		movementObservers.delete(stop);
	};
	const observe = () => {
		frame = null;
		if (!canAnimateMessageMovement()) { stop(); return; }
		const moved: HTMLElement[] = [];
		for (const [row, top] of positions) {
			if (!row.isConnected || deletingMessages.has(row.dataset.chatMessageRow!)) { positions.delete(row); continue; }
			if (Math.abs(row.getBoundingClientRect().top - top) > 0.1) {
				moved.push(row);
				positions.delete(row);
			}
		}
		fadeMovingMessages(moved, 140);
		if (positions.size > 0) frame = requestAnimationFrame(observe);
		else stop();
	};
	if (positions.size > 0) {
		movementObservers.add(stop);
		frame = requestAnimationFrame(observe);
	}
	return stop;
}

function clearMessageMovementAnimations() {
	pendingFollowFades.clear();
	for (const stop of movementObservers) stop();
	for (const animation of movingMessages.values()) animation.cancel();
	movingMessages.clear();
}

function animateNewMessage(id: string) {
	if (pendingPosition || !initialPositionReady.value) restoreScrollPosition();
	if (!pendingMessageAnimations.has(id) || disposed || !isActivated) return;
	const element = timelineEl.value?.querySelector<HTMLElement>(`[data-chat-message-row="${CSS.escape(id)}"]`);
	// 异步消息组件尚未挂载时，由它的 mounted 钩子补上入场动画。
	const messageElement = element?.querySelector<HTMLElement>('[data-chat-message-id]');
	if (!element || !messageElement) return;
	pendingMessageAnimations.delete(id);
	if (!prefer.s.animation || window.document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches || typeof element.animate !== 'function') return;
	// 行保留最终高度，只在内部向上入场，避免位移撑高滚动区触发整列抖动。
	const previousOverflow = element.style.overflow;
	element.style.overflow = 'clip';
	const animation = messageElement.animate([
		{ opacity: 0, transform: 'translateY(8px)' },
		{ opacity: 1, transform: 'translateY(0)' },
	], { duration: 180, easing: 'cubic-bezier(0.2, 0.7, 0.25, 1)' });
	enteringMessages.set(id, animation);
	void animation.finished.catch(() => {}).finally(() => {
		element.style.overflow = previousOverflow;
		if (enteringMessages.get(id) === animation) enteringMessages.delete(id);
	});
}

function getDateDividerKey(date: Date | string) {
	const value = typeof date === 'string' ? new Date(date) : date;
	// 使用较早一天作为边界标识；删掉边界消息时保留仍存在的日期行。
	return `date-${value.getFullYear()}-${value.getMonth() + 1}-${value.getDate()}`;
}

function getDisappearingDateDividers(id: string): HTMLElement[] {
	const remaining = messages.value.filter(message => message.id !== id);
	const remainingDividers = new Set<string>();
	for (let index = 0; index < remaining.length - 1; index++) {
		if (isSeparatorNeeded(remaining[index].createdAt, remaining[index + 1].createdAt)) {
			remainingDividers.add(getDateDividerKey(remaining[index + 1].createdAt));
		}
	}
	return Array.from(timelineEl.value?.querySelectorAll<HTMLElement>('[data-chat-date-divider]') ?? [])
		.filter(element => !remainingDividers.has(element.dataset.chatDateDivider!));
}

async function onDeleted(id: string) {
	deletedMessageIds.add(id);
	deferredMessages.delete(id);
	const deleted = messages.value.find(message => message.id === id);
	const wasUnread = unreadLiveIds.includes(id) || (deleted != null && deleted.fromUserId !== $i.id && !locallyReadIds.has(id)
		&& firstUnreadId != null && id >= firstUnreadId && unreadSnapshotLastId != null && id <= unreadSnapshotLastId);
	if (wasUnread) {
		unreadLiveIds = unreadLiveIds.filter(messageId => messageId !== id);
		locallyReadIds.add(id);
		unreadCount.value = Math.max(0, unreadCount.value - 1);
	}
	attentionMessages.value = attentionMessages.value.filter(messageId => messageId !== id);
	if (deletingMessages.has(id)) return;
	const controller = new AbortController();
	deletingMessages.set(id, controller);
	pendingMessageAnimations.delete(id);
	enteringMessages.get(id)?.cancel();
	enteringMessages.delete(id);
	movingMessages.get(id)?.cancel();
	movingMessages.delete(id);
	pendingFollowFades.delete(id);
	const element = timelineEl.value?.querySelector<HTMLElement>(`[data-chat-message-row="${CSS.escape(id)}"]`);
	try {
		// 先保留消息行播放碎片消散，最后一条消息也不会因切换空状态跳过动画。
		if (element && isActivated && prefer.s.animation) {
			await animateChatMessageDisintegration(element, controller.signal, () => {
				if (!roomMuted.value && $i.onlineStatusOverride !== 'doNotDisturb') sound.playChatMessageDeleteSfx(id, controller.signal);
			});
			if (!disposed && isActivated && !controller.signal.aborted) {
				// 消失的日期行同时收拢，splice 时不能再突然减少一段高度和间距。
				const stopObserving = watchCollapsingMessageMovement();
				try {
					await Promise.all([element, ...getDisappearingDateDividers(id)].map(row => collapseChatMessageSpace(row, controller.signal)));
				} finally {
					stopObserving();
				}
			}
		}
	} catch {
		// 动画失败也必须同步已删除的消息。
	} finally {
		deletingMessages.delete(id);
	}
	if (disposed) return;
	if (element) element.style.visibility = 'hidden';
	for (const message of messages.value) {
		if (message.replyId === id) {
			message.replyId = null;
			message.reply = null;
		}
	}
	const index = messages.value.findIndex(m => m.id === id);
	if (index !== -1) {
		messages.value.splice(index, 1);
	}
	if (pendingPosition?.anchorId === id) pendingPosition = getRestorablePosition(pendingPosition);
	if (storedPosition?.anchorId === id) storedPosition = getRestorablePosition(storedPosition);
	if (readingMarkerId.value === id) {
		readingMarkerId.value = null;
	}
	if (!initialPositionReady.value) { await nextTick(); restoreScrollPosition(); }
}

function startEdit(message: NormalizedChatMessage | Misskey.entities.ChatMessage) {
	if (formEl.value?.isLocked()) return;
	editingMessage.value = message;
}

function compose(action: ChatComposeAction, message: NormalizedChatMessage | Misskey.entities.ChatMessage) {
	void formEl.value?.compose(action, message);
}

function cancelMessageJump() {
	messageJumpController?.abort();
	messageJumpController = null;
	jumpingToMessage.value = false;
	messageHighlight?.cancel();
	messageHighlight = null;
}

function focusMessage(id: string) {
	const element = timelineEl.value?.querySelector<HTMLElement>(`[data-chat-message-id="${CSS.escape(id)}"]`);
	const scroller = conversationEl.value;
	if (!element || !scroller) return;
	const animate = prefer.s.animation && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	const highlight = () => {
		element.focus({ preventScroll: true });
		// 抵达消息后再计时，外侧方形线条在两秒内连续渐显、渐隐，不改变消息布局。
		const line = '0 0 0 2px var(--MI_THEME-accent)';
		const transparentLine = '0 0 0 2px transparent';
		messageHighlight = element.animate([
			{ boxShadow: animate ? transparentLine : line, offset: 0 },
			{ boxShadow: line, offset: 0.5 },
			{ boxShadow: animate ? transparentLine : line, offset: 1 },
		], { duration: 2000, easing: 'ease-in-out' });
	};
	const startTop = scroller.scrollTop;
	const target = Math.max(0, Math.min(scroller.scrollHeight - scroller.clientHeight,
		startTop + element.getBoundingClientRect().top - scroller.getBoundingClientRect().top + (element.offsetHeight / 2 - scroller.clientHeight / 2)));
	if (!animate || Math.abs(target - startTop) < 1) {
		scroller.scrollTop = target;
		highlight();
		return;
	}
	const started = performance.now();
	const frame = (now: number) => {
		if (disposed || !isActivated || !element.isConnected) { scrollMotionFrame = null; return; }
		const progress = Math.min(1, (now - started) / 180);
		scroller.scrollTop = startTop + (target - startTop) * (1 - (1 - progress) ** 3);
		if (progress < 1) scrollMotionFrame = requestAnimationFrame(frame);
		else { scrollMotionFrame = null; highlight(); }
	};
	scrollMotionFrame = requestAnimationFrame(frame);
}

onDeactivated(cancelMessageJump);
onBeforeUnmount(cancelMessageJump);

function applyMessageEdit(message: Misskey.entities.ChatMessageLite) {
	for (const item of messages.value) {
		if (item.reply?.id === message.id) item.reply.text = message.text?.slice(0, 200) ?? null;
	}
	const existing = messages.value.find(m => m.id === message.id);
	if (existing) {
		existing.text = message.text;
		existing.editedAt = message.editedAt;
	}
}

function onEdited(message: Misskey.entities.ChatMessageLite) {
	applyMessageEdit(message);
	editingMessage.value = null;
}

function onReact(ctx: Parameters<Misskey.Channels['chatUser']['events']['react']>[0] | Parameters<Misskey.Channels['chatRoom']['events']['react']>[0]) {
	const message = messages.value.find(m => m.id === ctx.messageId);
	if (!message) return;
	const actor = room.value ? ctx.user : (message.fromUserId === $i.id ? user.value : $i);
	if (!actor || message.reactions.some(record => record.user.id === actor.id && normalizeReaction(record.reaction).replace('@.', '') === normalizeReaction(ctx.reaction).replace('@.', ''))) return;
	message.reactions.push({ reaction: ctx.reaction, user: actor });
}

function onUnreact(ctx: Parameters<Misskey.Channels['chatUser']['events']['unreact']>[0] | Parameters<Misskey.Channels['chatRoom']['events']['unreact']>[0]) {
	const message = messages.value.find(m => m.id === ctx.messageId);
	if (!message) return;
	const actor = room.value ? ctx.user : (message.fromUserId === $i.id ? user.value : $i);
	if (!actor) return;
	const reaction = normalizeReaction(ctx.reaction).replace('@.', '');
	for (let index = message.reactions.length - 1; index >= 0; index--) {
		const record = message.reactions[index];
		if (record.user.id === actor.id && normalizeReaction(record.reaction).replace('@.', '') === reaction) message.reactions.splice(index, 1);
	}
}

function pauseReading() {
	if (!isActivated) return;
	flushRead();
	if (initialized.value) timelineVersion++;
	cancelMessageJump();
	followBottom = false;
	clearMessageMovementAnimations();
	cancelScheduledBottomScroll();
	saveScrollPosition();
	savedChatScrollTop = conversationEl.value?.scrollTop ?? savedChatScrollTop;
}

function resumeReading() {
	if (!isReading() || !initialized.value) return;
	if (storedPosition) pendingPosition = getRestorablePosition(storedPosition);
	restoreScrollPosition();
	if (initialPositionReady.value && unreadCount.value === 0) followBottom = atLatest.value;
}

function onWindowBlur(event: FocusEvent) {
	if (event.target === window) pauseReading();
}

function onWindowFocus(event: FocusEvent) {
	if (event.target === window) resumeReading();
}

function onVisibilitychange() {
	if (window.document.hidden) pauseReading();
	else resumeReading();
}

onMounted(() => {
	window.addEventListener('pagehide', saveScrollPosition);
	window.addEventListener('blur', onWindowBlur);
	window.addEventListener('focus', onWindowFocus);
	window.document.addEventListener('visibilitychange', onVisibilitychange);
	compactViewport.addEventListener('change', onCompactViewportChange);
	initialize();
});

onActivated(() => {
	if (!initialized.value) {
		initialize();
	}
});

onBeforeUnmount(() => {
	closePanel();
	flushRead();
	window.removeEventListener('pagehide', saveScrollPosition);
	window.removeEventListener('blur', onWindowBlur);
	window.removeEventListener('focus', onWindowFocus);
	saveScrollPosition();
	window.clearTimeout(scrollSaveTimer);
	window.clearTimeout(silenceTimer);
	disposed = true;
	cancelInitialLayout();
	compactViewport.removeEventListener('change', onCompactViewportChange);
	cancelScheduledBottomScroll();
	clearMessageMovementAnimations();
	pendingMessageAnimations.clear();
	for (const animation of enteringMessages.values()) animation.cancel();
	enteringMessages.clear();
	for (const controller of deletingMessages.values()) controller.abort();
	deletingMessages.clear();
	conversationResizeObserver.disconnect();
	roomRefreshPending = false;
	connection.value?.dispose();
	window.document.removeEventListener('visibilitychange', onVisibilitychange);
});

const invitingUsers = ref(false);
let inviteSelectionController: AbortController | null = null;
onBeforeUnmount(() => inviteSelectionController?.abort());
onDeactivated(() => inviteSelectionController?.abort());

function requestInvite() {
	if (invitingUsers.value || !initialized.value) { os.toast(i18n.ts.loading); return; }
	if (!canInvite.value) {
		showInviteUnavailable();
		return;
	}
	if (props.roomId) void inviteUser();
	else void upgradeToGroup();
}

function showInviteUnavailable() {
	os.toast(room.value?.joinPolicy === 'closed' ? i18n.ts._chat.invitationDisabled : i18n.ts.permissionDeniedErrorDescription, 'error');
}

async function inviteUser() {
	if (!canInvite.value || invitingUsers.value || !room.value) return;
	const roomId = room.value.id;
	const controller = new AbortController();
	inviteSelectionController = controller;
	invitingUsers.value = true;
	try {
		const invitee = await os.selectUser({ title: i18n.ts._chat.inviteUser, includeSelf: false, localOnly: true, signal: controller.signal });
		if (disposed || controller.signal.aborted || room.value?.id !== roomId) return;
		if (!invitee) return;
		if (!canInvite.value) { showInviteUnavailable(); return; }
		await misskeyApi('chat/rooms/invitations/create', { roomId, userId: invitee.id });
		if (!disposed) {
			os.toast(i18n.ts._chat.invitationSent, 'success');
		}
	} catch (error) {
		if (!disposed && !controller.signal.aborted && !isAccountSessionErrorHandled(error)) os.toast(getChatInvitationErrorMessage(error), 'error');
	} finally {
		invitingUsers.value = false;
		if (inviteSelectionController === controller) inviteSelectionController = null;
	}
}

async function upgradeToGroup() {
	if (!canInvite.value || invitingUsers.value || !user.value) return;
	const target = user.value;
	const controller = new AbortController();
	inviteSelectionController = controller;
	invitingUsers.value = true;
	try {
		const invitee = await os.selectUser({
			title: i18n.ts._chat.inviteUser, includeSelf: false, localOnly: true,
			excludeUserIds: [$i.id, target.id], signal: controller.signal,
		});
		if (disposed || controller.signal.aborted || user.value?.id !== target.id || !invitee) return;
		if (!canInvite.value) { showInviteUnavailable(); return; }
		if (invitee.id === $i.id || invitee.id === target.id || invitee.host != null) return;
		const created = await misskeyApi('chat/rooms/create', { initialUserIds: [target.id, invitee.id] });
		os.toast(i18n.ts._chat.roomCreated, 'success');
		globalEvents.emit('chatRoomUpdated', created);
		if (!disposed && !controller.signal.aborted) router.push('/chat/room/:roomId', { params: { roomId: created.id } });
	} catch (error) {
		if (!disposed && !controller.signal.aborted && !isAccountSessionErrorHandled(error)) {
			os.toast(getChatInvitationErrorMessage(error), 'error');
		}
	} finally {
		invitingUsers.value = false;
		if (inviteSelectionController === controller) inviteSelectionController = null;
	}
}

async function leaveRoom() {
	if (room.value == null || room.value.isMember === false) return;

	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts.areYouSure,
	});
	if (canceled) return;

	try {
		await misskeyApiWithErrorToast('chat/rooms/leave', { roomId: room.value.id });
		forgetChatRoom($i.id, room.value.id);
		router.push('/chat');
	} catch { /* 保留会话以便重试。 */ }
}

useGlobalEvent('chatRoomLeft', roomId => {
	if (roomId !== props.roomId) return;
	roomLeft = true;
	timelineVersion++;
	initializing.value = false;
	initialized.value = false;
	initialPositionReady.value = true;
	if (room.value) room.value = { ...room.value, isMember: false };
	storedPosition = null;
	pendingPosition = null;
	cancelMessageJump();
	cancelScheduledBottomScroll();
	connection.value?.dispose();
	connection.value = null;
	messages.value = [];
	deferredMessages.clear();
	if (isActivated) router.push('/chat');
});

async function joinRoom() {
	const target = room.value;
	if (!target || target.isMember !== false || joiningRoom.value || $i.policies.chatAvailability !== 'available' || target.joinPolicy === 'closed' || (target.joinPolicy !== 'public' && !target.invitationExists)) return;
	joiningRoom.value = true;
	try {
		await misskeyApiWithErrorToast('chat/rooms/join', { roomId: target.id });
		if (!disposed) await initialize();
	} catch {
		// 权限或人数变化由toast提示，保留群信息供用户重试。
	} finally {
		joiningRoom.value = false;
	}
}

async function requestJoinRoom() {
	const target = room.value;
	if (!target || target.joinPolicy !== 'approval' || target.isMember !== false || target.joinRequestPending || joiningRoom.value) return;
	joiningRoom.value = true;
	try {
		const { canceled, result } = await os.inputText({ title: i18n.ts._chat.requestJoin, text: i18n.ts._chat.joinRequestDescription, placeholder: i18n.ts._chat.joinRequestMessage, default: '', maxLength: 500 });
		if (canceled || disposed) return;
		const updated = await misskeyApiWithErrorToast('chat/rooms/requests/create', { roomId: target.id, requestMessage: result.trim() });
		if (disposed) return;
		room.value = updated;
		if (updated.isMember) await initialize();
		else os.toast(i18n.ts._chat.joinRequestSent, 'success');
	} catch { /* 错误由请求工具提示，允许再次申请。 */ } finally { joiningRoom.value = false; }
}

const mutingRoom = ref(false);

function showAnnouncement() {
	if (!room.value) return;
	const { dispose } = os.popup(defineAsyncComponent(() => import('./room.announcement.vue')), { room: room.value }, {
		updated: (updated: Misskey.entities.ChatRoom) => { room.value = updated; globalEvents.emit('chatRoomUpdated', updated); },
		closed: () => dispose(),
	});
}

function showMemberMenu(event: MouseEvent | KeyboardEvent, member: ChatMember) {
	if (!room.value) return;
	const menu = getChatMemberMenu(room.value, member, {
		mention: user => { void nextTick(() => formEl.value?.mentionUser(user)); },
		poke: userId => { void poke(userId); },
		updated: () => { void refreshRoom(); },
		isHidden: hiddenMembers.value.includes(member.user.id),
		canCompose: !roomSilenced.value && canParticipate.value && $i.policies.chatAvailability === 'available',
		toggleHidden: () => {
			hiddenMembers.value = hiddenMembers.value.includes(member.user.id) ? hiddenMembers.value.filter(id => id !== member.user.id) : [...hiddenMembers.value, member.user.id];
			try { miLocalStorage.setItem(hiddenMembersKey, JSON.stringify(hiddenMembers.value)); } catch { os.toast(i18n.ts.somethingHappened, 'error'); }
		},
	});
	if (event.type === 'contextmenu') os.contextMenu(menu, event as PointerEvent);
	else os.popupMenu(menu, event.currentTarget as HTMLElement);
}

function showAvatarMenu(event: PointerEvent, userId: string) {
	if (!room.value) return;
	const member = roomMembers(room.value, roomMemberships.value).find(member => member.user.id === userId);
	if (member) showMemberMenu(event, member);
}

function showMenu(ev: MouseEvent) {
	const menuItems: MenuItem[] = [];
	if (canModify.value) menuItems.push({ text: i18n.ts._chat.modify, icon: 'ti ti-edit', action: () => showPanel('info') });
	if (canInvite.value) menuItems.push({ text: i18n.ts._chat.inviteUser, icon: 'ti ti-user-plus', action: requestInvite });
	if (attentionMessages.value.length) menuItems.push({ text: i18n.ts._chat.unreadMentions, icon: 'ti ti-at', action: showAttention });

	if (room.value) {
		if (canParticipate.value) menuItems.push({ text: i18n.ts._chat.announcement, icon: 'ti ti-speakerphone', action: showAnnouncement });
		if (canModify.value) menuItems.push({ text: i18n.ts._chat.joinRequests, icon: 'ti ti-user-check', action: () => showPanel('members') });
		if (canParticipate.value && !mutingRoom.value) menuItems.push({
			text: roomMuted.value ? i18n.ts.unmute : i18n.ts._chat.muteThisRoom,
			icon: roomMuted.value ? 'ti ti-bell' : 'ti ti-bell-off',
			action: async () => {
				if (mutingRoom.value || !room.value) return;
				mutingRoom.value = true;
				try {
					const updated = await setChatRoomMuted(room.value, !roomMuted.value);
					if (updated) room.value = updated;
				} finally { mutingRoom.value = false; }
			},
		});
		if (room.value.ownerId !== $i.id && canParticipate.value) {
			if (menuItems.length > 0) menuItems.push({ type: 'divider' });
			menuItems.push({
				text: i18n.ts._chat.leave,
				icon: 'ti ti-logout',
				action: () => {
					leaveRoom();
				},
			});
		}
	}

	os.popupMenu(menuItems, ev.currentTarget ?? ev.target);
}

let panelDispose: (() => void) | null = null;

function closePanel() {
	panelDispose?.();
	panelDispose = null;
}

onDeactivated(closePanel);

function showPanel(panel: 'search' | 'info' | 'members') {
	if (!initialized.value || panelDispose || (panel === 'search' ? !canParticipate.value : !canModify.value)) return;
	const { dispose } = os.popup(defineAsyncComponent(() => import('./room.panel.vue')), {
		panel,
		userId: props.userId,
		roomId: props.roomId,
		room,
	}, {
		updated: updated => { room.value = updated; },
		select: (id: string) => { void jumpToMessage(id); },
		menu: showMemberMenu,
		announcement: showAnnouncement,
		retry: refreshRoom,
		closed: closePanel,
	});
	panelDispose = dispose;
}

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
	const [updated, members] = await Promise.all([
		misskeyApi('chat/rooms/show', { roomId }).catch(() => null),
		misskeyApi('chat/rooms/members', { roomId, limit: 50 }).catch(() => null),
	]);
	if (!disposed && updated && !roomRefreshPending && requestId === roomRefreshId && room.value?.id === roomId) {
		room.value = updated;
		membersFailed.value = members == null;
		if (members) roomMemberships.value = members;
		globalEvents.emit('chatRoomUpdated', updated);
	}
	roomRefreshRunning = false;
	if (roomRefreshPending) {
		roomRefreshPending = false;
		void refreshRoom();
	}
}

definePage(computed(() => ({
	title: titleText.value,
	...(titleUser.value ? { userName: titleUser.value, avatar: titleUser.value } : {}),
})));
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

.chatPage {
	--MI-tabUnderlineHeight: 0px;
	--MI-formGroupInset: 0px;
	--MI-formGroupRadius: initial;
	position: relative;
	display: grid;
	grid-template-rows: auto minmax(0, 1fr) auto;
	height: 100%;
	min-width: 0;
	min-height: 0;
	border-radius: var(--MI-cardRadius);
	isolation: isolate;
	container-type: size;
	container-name: chatRoom;
}

.pageHeader {
	flex: none;
}

.conversationBody {
	position: relative;
	display: flex;
	flex: 1;
	flex-direction: column;
	min-width: 0;
	min-height: 0;
}

@container chatRoom (min-width: 600px) {
	.withSidebar .conversation,
	.withSidebar .footer {
		width: calc(100% - 208px);
	}

	.withSidebar .latestButton { right: 224px; }
}

.groupSidebar {
	display: flex;
	flex-direction: column;
	position: absolute;
	top: 0;
	right: 0;
	bottom: 0;
	z-index: 2;
	width: 208px;
	box-sizing: border-box;
	border-left: var(--MI-divider);
	background: var(--MI_THEME-panel);
}

@container chatRoom (max-width: 599px) {
	.groupSidebar {
		box-shadow: -8px 0 24px var(--MI_THEME-shadow);
	}
}

.groupSidebar > .groupSidebarContent {
	flex: 1;
	min-width: 0;
	border-left: 0;
}

.headerTab {
	display: flex;
	flex-shrink: 0;
	align-items: center;
	justify-content: center;
	gap: 5px;
	min-width: 28px;
	height: 28px;
	padding: 0 6px;
	box-sizing: border-box;
	border-radius: 8px;
	white-space: nowrap;
	font-size: 1em;
	font-weight: normal;
	color: var(--MI_THEME-fgTransparentWeak);
	> i { font-size: 1.1em; }
	&:hover:not(:disabled) { background: var(--MI_THEME-buttonHoverBg); color: var(--MI_THEME-fg); }
	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -2px; }
}

.headerMenu {
	flex: 0 0 28px;
	width: 28px;
}

.latestButton {
	position: absolute;
	right: 16px;
	bottom: 16px;
	z-index: 4;
	display: grid;
	place-items: center;
	width: 44px;
	height: 44px;
	border-radius: 50%;
	background: var(--MI_THEME-panel);
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 1em;
}
.latestCount {
	position: absolute;
	bottom: calc(100% - 4px);
	min-width: 2ch;
	padding: 2px 6px;
	border-radius: 999px;
	background: var(--MI_THEME-accent);
	color: var(--MI_THEME-fgOnAccent);
	font-size: 12px;
	font-variant-numeric: tabular-nums;
	text-align: center;
}
.readingMarker {
	display: flex;
	align-items: center;
	gap: 12px;
	margin: 8px 0 16px;
	color: var(--MI_THEME-accent);
	font-size: 12px;
	&::before, &::after { content: ''; flex: 1; height: 1px; background: color-mix(in srgb, var(--MI_THEME-accent) 35%, transparent); }
}

.chatPage :global([data-page-header]) > div > div {
	flex: 1;
	min-width: 0;
	max-width: none;
	margin: 0;
	padding: 0;
}

.chatHeader {
	display: flex;
	align-items: center;
	width: 100%;
	height: 52px;
	flex: 0 0 auto;
	gap: 4px;
	padding: 0 calc(12px + var(--MI-chatWindowControlsWidth, 0px)) 0 16px;
	box-sizing: border-box;
	font-weight: normal;
	line-height: 1.5;

	button:not(:disabled) { cursor: pointer; }
}

// 与聊天窗口的最小化、最大化、关闭按钮同一尺寸和悬停效果。
.mobileHeaderButton {
	display: grid;
	flex: 0 0 28px;
	place-items: center;
	width: 28px;
	height: 28px;
	border-radius: 8px;
	font-size: 1em;
	font-weight: normal;
	color: var(--MI_THEME-fgTransparentWeak);
	> i { font-size: 1.1em; }
	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -2px; }

	&:hover:not(:disabled) {
		background: var(--MI_THEME-buttonHoverBg);
		color: var(--MI_THEME-fg);
	}
}

.chatTitle {
	display: flex;
	align-items: center;
	flex: 1;
	min-width: 0;
	height: 32px;
	overflow: hidden;
	text-align: left;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-weight: normal;
}

.chatTitleText {
	min-width: 0;
	max-width: 100%;
	padding: 0;
	line-height: 1.5;
	font-size: 1.15em;
	font-weight: 700;
}

.chatPage.room {
	--MI-chatBackground: var(--MI_THEME-buttonBg);
	background: var(--MI-chatBackground);
	overflow: clip;
}

.conversation {
	flex: 1;
	min-width: 0;
	min-height: 0;
	width: 100%;
	padding: var(--MI-cardPadding);
	box-sizing: border-box;
	overflow-x: hidden;
	overflow-y: auto;
	overflow-anchor: none;
	overscroll-behavior: contain;
	// 始终预留槽位，避免消息宽度随滚动条出现而变化。
	scrollbar-gutter: stable;
	background-color: var(--MI-chatBackground);
	background-image: radial-gradient(circle, color-mix(in srgb, var(--MI_THEME-fg) 12%, transparent) 1px, transparent 1px);
	background-size: 24px 24px;

	> div {
		// 页头和输入区在滚动区域外，消息内的 sticky 元素不再为它们留位。
		--MI-stickyTop: 0px;
		--MI-stickyBottom: 0px;
		// sticky 从滚动容器的内边距内侧计算，抵消它才能贴住可见区域顶部。
		--MI-chatAvatarStickyOffset: calc(0px - var(--MI-cardPadding));
		min-height: 100%;
	}
}

.timeline {
	position: relative;
}

.sentinel {
	// 历史加载检测点不占位，移除时不会连同间距把短会话整体上推。
	position: absolute;
	inset: 0 0 auto;
	height: 1px;
	pointer-events: none;
}

.footer {
	flex: none;
	width: 100%;
}

.joinPrompt {
	padding: var(--MI-cardPadding);
}

// The composer is the footer of the same conversation surface.
.form {
	width: 100%;
}

.dateDivider {
	display: flex;
	font-size: 85%;
	align-items: center;
	justify-content: center;
	gap: 0.5em;
	color: var(--MI_THEME-fgTransparentWeak);
	border: var(--MI-divider);
	border-radius: 999px;
	width: fit-content;
	padding: 0.5em 1em;
	margin: 0 auto;
}
</style>
