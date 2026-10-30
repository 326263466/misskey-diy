<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="chatPageEl" data-popup-boundary data-emoji-picker-boundary :class="[$style.chatPage, { [$style.floating]: floatingLayout === true, [$style.withSidebar]: roomId != null && canParticipate && !compactHeader && membersOpen }]">
	<MkPageHeader hideTitle embedded :onScrollToTop="scrollToLatest" :class="$style.pageHeader">
		<template #actions>
			<div :class="$style.chatHeader">
				<button v-if="compactHeader" type="button" class="_button" :class="$style.mobileHeaderButton" :aria-label="i18n.ts.goBack" @click="router.push('/chat')"><i class="ti ti-arrow-left" aria-hidden="true"></i></button>
				<span v-if="titleUser" :class="$style.titleAvatar">
					<MkAvatar :class="$style.avatarImage" :user="titleUser" :link="false" :preview="false" indicator/>
				</span>
				<button type="button" class="_button" :class="$style.chatTitle" :aria-busy="!titleText" :aria-label="room ? `${titleText} (${room.memberCount})` : titleText || i18n.ts.chat" @click="scrollToLatest()">
					<span :class="[$style.titleTexts, { [$style.groupTitleTexts]: room != null }]">
						<MkUserName v-if="titleUser" :class="$style.chatTitleText" :user="titleUser" :nowrap="true"/>
						<Mfm v-else :class="$style.chatTitleText" :text="titleText" :plain="true" :nowrap="true"/>
						<span v-if="titleUser" :class="$style.chatSubtitle"><MkAcct :user="titleUser"/></span>
						<span v-else-if="room" :class="$style.memberCount">({{ room.memberCount }})</span>
					</span>
				</button>
				<template v-if="room?.isMember && compactHeader">
					<MkA v-tooltip="i18n.ts._chat.announcement" :to="`/chat/room/${room.id}/announcement`" class="_button" :class="$style.plainHeaderButton" :aria-label="i18n.ts._chat.announcement"><i class="ti ti-speakerphone" aria-hidden="true"></i></MkA>
					<MkA v-tooltip="i18n.ts._chat.members" :to="`/chat/room/${room.id}/members`" class="_button" :class="$style.plainHeaderButton" :aria-label="i18n.ts._chat.members"><i class="ti ti-users" aria-hidden="true"></i></MkA>
				</template>
				<button v-else-if="roomId != null && canParticipate && !compactHeader" ref="membersButtonEl" v-tooltip="i18n.ts._chat.members" type="button" class="_button" :class="$style.plainHeaderButton" :disabled="!initialized" :aria-label="i18n.ts._chat.members" :aria-expanded="membersOpen" :aria-controls="membersPanelId" @click="membersOpen = !membersOpen"><i :class="membersOpen ? 'ti ti-layout-sidebar-right-collapse' : 'ti ti-layout-sidebar-right-expand'" aria-hidden="true"></i></button>
				<template v-if="showFullPageWindowControls">
					<button v-tooltip="i18n.ts.windowMinimize" type="button" class="_button" :class="$style.plainHeaderButton" :aria-label="i18n.ts.windowMinimize" @click="minimizeChatPage"><i class="ti ti-minus" aria-hidden="true"></i></button>
					<button v-tooltip="i18n.ts._chat.openChatWindow" type="button" class="_button" :class="$style.plainHeaderButton" :aria-label="i18n.ts._chat.openChatWindow" @click="restoreChatPopup"><i class="ti ti-arrows-minimize" aria-hidden="true"></i></button>
				</template>
				<div :class="$style.headerMenu">
					<button v-if="!initialized || canParticipate || canModify || canInvite || attentionMessages.length" type="button" class="_button" :class="$style.plainHeaderButton" :disabled="!initialized" :aria-label="i18n.ts.more" aria-haspopup="menu" @click="showMenu"><i class="ti ti-dots" aria-hidden="true"></i></button>
				</div>
			</div>
		</template>
	</MkPageHeader>
	<div ref="conversationBodyEl" data-page-body :class="$style.conversationBody">
		<div v-if="pokeFlashing" :class="[$style.pokeFlash, { [$style.pokeFlashAnimated]: prefer.s.animation }]" aria-hidden="true"></div>
		<div ref="conversationEl" data-chat-scroll data-emoji-picker-boundary :class="$style.conversation" @scroll.passive="onConversationScroll" @wheel.passive="onConversationWheel" @touchstart.passive="onConversationTouchStart" @touchmove.passive="onConversationTouchMove" @keydown="onConversationKeydown">
			<div ref="conversationContentEl" :class="$style.conversationContent" :style="{ visibility: initialPositionReady ? undefined : 'hidden' }">
				<div>
					<div v-if="initializing" aria-busy="true"></div>
					<MkError v-else-if="initializationFailed" @retry="initialize"/>
					<div v-else-if="room?.isMember === false" :class="$style.emptyState">
						<div>{{ i18n.ts._chat.notMemberOfRoom }}</div>
					</div>
					<div v-else-if="initialized" ref="timelineEl" :class="$style.timeline">
						<button v-if="historyLoadFailed" type="button" class="_textButton" :class="$style.historyRetry" :disabled="moreFetching" @click="fetchMore">{{ i18n.ts.retry }}</button>
						<div v-if="messages.length === 0 && !canFetchMore && messageAnimations.size === 0" :class="$style.emptyState">{{ i18n.ts._chat.noMessagesYet }}</div>
						<TransitionGroup tag="div" :class="$style.messageList" :css="false" @enter="enterMessage" @leave="leaveMessage">
							<div v-for="item in timeline.toReversed()" v-show="item.type === 'date' || ((!roomId || !isUserBlocked(item.data.fromUserId) || item.data.systemEvent) && (!hiddenMembers.includes(item.data.fromUserId) || item.data.systemEvent || item.data.id === readingMarkerId || item.data.id === revealedMessageId))" :key="item.type === 'date' ? getDateDividerKey(item.next) : item.id" :class="$style.timelineItem" :data-chat-message-row="item.type === 'item' ? item.data.id : undefined">
								<template v-if="item.type === 'item'">
									<div v-if="item.data.id === readingMarkerId" data-chat-reading-marker :class="$style.readingMarker"><span>{{ i18n.ts._chat.lastReadPosition }}</span></div>
									<XMessage v-show="!hiddenMembers.includes(item.data.fromUserId) || item.data.systemEvent || item.data.id === revealedMessageId" :message="item.data" :nickname="nicknames.get(item.data.fromUserId)" :roomRole="memberRoles.get(item.data.fromUserId)" :memberMenu="room != null" :canEdit="!roomSilenced && canSendMessage" :canCompose="canSendMessage" :silenced="roomSilenced" :liveSync="true" @edit="startEdit" @compose="compose" @showReply="jumpToMessage" @poke="poke" @avatarMenu="showAvatarMenu" @deleted="onDeleted"/>
								</template>
								<div v-else :class="$style.dateDivider" :data-chat-date-divider="getDateDividerKey(item.next)"><span>{{ item.prevText }}</span></div>
								</div>
						</TransitionGroup>
					</div>
				</div>

				<div v-if="user && (!user.canChat || user.host !== null)">
					<MkInfo warn>{{ i18n.ts._chat.chatNotAvailableInOtherAccount }}</MkInfo>
				</div>

				<MkInfo v-if="$i.policies.chatAvailability !== 'available'" warn>{{ $i.policies.chatAvailability === 'readonly' ? i18n.ts._chat.chatIsReadOnlyForThisAccountOrServer : i18n.ts._chat.chatNotAvailableForThisAccountOrServer }}</MkInfo>
			</div>
		</div>

		<button v-if="initialized && initialPositionReady && attentionAbove.length" type="button" class="_button" :class="[$style.messagePrompt, $style.attentionAbove]" :disabled="jumpingToMessage || refreshingAttention" :aria-label="i18n.tsx._chat.attentionAbove({ message: attentionLabel(attentionAbove[0]) })" data-chat-attention="above" @click="showAttention(attentionAbove[0])"><i class="ti ti-arrow-up" aria-hidden="true"></i><span>{{ attentionLabel(attentionAbove[0]) }}</span><span v-if="attentionAbove.length > 1" :class="$style.promptCount">{{ attentionAbove.length }}</span></button>
		<div v-if="initialized && initialPositionReady" :class="$style.messagePrompts">
			<button v-if="attentionBelow.length" type="button" class="_button" :class="$style.messagePrompt" :disabled="jumpingToMessage || refreshingAttention" :aria-label="i18n.tsx._chat.attentionBelow({ message: attentionLabel(attentionBelow[0]) })" data-chat-attention="below" @click="showAttention(attentionBelow[0])"><i class="ti ti-at" aria-hidden="true"></i><span>{{ attentionLabel(attentionBelow[0]) }}</span><span v-if="attentionBelow.length > 1" :class="$style.promptCount">{{ attentionBelow.length }}</span></button>
			<button v-if="!atLatest || unreadCount > 0" type="button" class="_button" :class="$style.messagePrompt" :disabled="loadingLatest" data-chat-latest @click="showLatest"><i class="ti ti-arrow-down" aria-hidden="true"></i><span>{{ unreadCount > 0 ? i18n.tsx._chat.unreadMessages({ count: unreadCount }) : i18n.ts._chat.latestMessages }}</span></button>
		</div>

	</div>
	<XForm v-if="!directBlocked && canParticipate" ref="formEl" :user="user" :room="room" :silenced="roomSilenced" :silenceUntil="roomSilenceUntil" :initializing="!initialized" :conversationId="userId ? `user:${userId}` : `room:${roomId}`" :editing="editingMessage" @sent="onSent" @edited="onEdited" @cancelEdit="editingMessage = null"/>
	<div v-else :class="$style.footer">
		<div class="_gaps">
			<MkInfo v-if="directBlocked">{{ i18n.ts._chat.blockedByRecipient }}</MkInfo>
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
	<aside v-if="roomId != null && canParticipate && !compactHeader" v-show="membersOpen" :id="membersPanelId" :class="$style.groupSidebar" :aria-label="i18n.ts._chat.members" @keydown.esc.stop="closeMembers">
		<XSidebar v-if="room && membersOpen" :room="room" :memberships="roomMemberships" :membersFailed="membersFailed" :class="$style.groupSidebarContent" @announcement="showAnnouncement" @retry="refreshRoom" @menu="showMemberMenu" @close="closeMembers"/>
	</aside>
</div>
</template>

<script lang="ts" setup>
import { ref, shallowReactive, useId, useTemplateRef, computed, defineAsyncComponent, inject, nextTick, onMounted, onBeforeUnmount, onDeactivated, onActivated, onUpdated, watch } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import * as Misskey from 'misskey-js';
import { host } from '@@/js/config.js';
import { getChatAttention, getChatSilenceUntil } from './composer.js';
import type { MenuItem } from '@/types/menu.js';
import type { ChatComposeAction } from './composer.js';
import { getChatMemberMenu, getChatRoomSilenceMenu, roomMembers } from './member-menu.js';
import type { ChatMember } from './member-menu.js';
import * as os from '@/os.js';
import { getChatInvitationErrorMessage, misskeyApiWithErrorToast } from '@/utility/misskey-api-with-toast.js';
import { isAccountSessionErrorHandled } from '@/utility/account-session-error.js';
import { highlightTarget } from '@/utility/highlight-target.js';
import { useStream } from '@/stream.js';
import * as sound from '@/utility/sound.js';
import { i18n } from '@/i18n.js';
import { ensureSignin } from '@/i.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { definePage } from '@/page.js';
import { prefer } from '@/preferences.js';
import { useRouter } from '@/router.js';
import { globalEvents, useGlobalEvent } from '@/events.js';
import { getUserBlockingState, isUserBlocked } from '@/utility/user-blocking.js';
import { useUserStatistics } from '@/composables/use-user-statistics.js';
import { useUserStatisticsVisibility } from '@/composables/use-user-statistics-visibility.js';
import MkInfo from '@/components/MkInfo.vue';
import MkButton from '@/components/MkButton.vue';
import XForm from './room.form.vue';
import XMessage from './XMessage.vue';
import { makeDateSeparatedTimelineComputedRef } from '@/utility/timeline-date-separate.js';
import { normalizeReaction } from '@/utility/normalize-reaction.js';
import { cacheChatConversationTitle, forgetChatRoom, getChatConversationTitle, markChatConversationViewing, rememberChatConversation, setChatRoomMuted } from '@/utility/chat-conversations.js';
import { clearChatManualUnread, getChatConversationSetting, getChatNotificationMode, loadChatConversationSettings, updateChatConversation } from '@/utility/chat-conversation-settings.js';
import { miLocalStorage } from '@/local-storage.js';
import { DI } from '@/di.js';
import { deviceKind } from '@/utility/device-kind.js';

const $i = ensureSignin();
// 群成员按需加载，不参与消息区的首屏尺寸计算。
const XSidebar = defineAsyncComponent({ loader: () => import('./room.sidebar.vue').then(module => module.default), suspensible: false });
const router = useRouter();
const pageActive = inject(DI.pageActive, ref(true));
router.useListener('same', () => scrollToLatest());
const compactViewport = window.matchMedia('(max-width: 800px)');
const compactViewportMatches = ref(compactViewport.matches);
const floatingLayout = inject<ComputedRef<boolean> | null>('chatFloatingLayout', null);
const fullPageChatControls = inject<{
	minimize: () => void;
	restoreWindow: () => void;
} | null>('chatFullPageControls', null);
const compactLayout = inject<Readonly<Ref<boolean>> | null>('chatCompactLayout', null);
const mobileLayout = inject<Readonly<Ref<boolean>>>('chatMobileLayout', computed(() => deviceKind === 'smartphone' || window.innerWidth <= 500));
const compactHeader = computed(() => mobileLayout.value || (compactLayout?.value ?? (compactViewportMatches.value || floatingLayout?.value === true)));
const showFullPageWindowControls = computed(() => fullPageChatControls != null && floatingLayout?.value !== true && !mobileLayout.value && !compactHeader.value);
const props = defineProps<{
	userId?: string;
	roomId?: string;
}>();
const membersOpen = ref(!compactHeader.value && floatingLayout?.value !== true);
const membersPanelId = useId();
const membersButtonEl = useTemplateRef('membersButtonEl');

function closeMembers() {
	membersOpen.value = false;
	membersButtonEl.value?.focus({ preventScroll: true });
}

function onCompactViewportChange(event: MediaQueryListEvent) {
	compactViewportMatches.value = event.matches;
}

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
const historyLoadFailed = ref(false);
let oldestLoadedId: string | null = null;
const messages = ref<NormalizedChatMessage[]>([]);
const attentionMessages = ref<string[]>([]);
const attentionAbove = ref<string[]>([]);
const attentionBelow = ref<string[]>([]);
const refreshingAttention = ref(false);
let attentionRefreshNeeded = false;
let attentionRequest = 0;
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
let cancelMessageHighlight: (() => void) | null = null;
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
const memberList = computed(() => room.value ? roomMembers(room.value, roomMemberships.value) : []);
const nicknames = computed(() => new Map(memberList.value.map(member => [member.user.id, member.nickname])));
const memberRoles = computed(() => new Map(memberList.value.map(member => [member.user.id, member.role])));

function getMessageAttention(message: Pick<Misskey.entities.ChatMessageLite, 'fromUserId' | 'text' | 'reply' | 'replyType'>): ReturnType<typeof getChatAttention> {
	return getChatAttention(message, $i, host, {
		isRoom: props.roomId != null,
		senderRole: memberRoles.value.get(message.fromUserId),
	});
}

function attentionLabel(id: string) {
	const message = messages.value.find(message => message.id === id) ?? deferredMessages.get(id);
	const kind = message && getMessageAttention(message);
	return kind ? i18n.ts._chat[kind] : i18n.ts._chat.unreadMentions;
}

function updateAttentionCursors() {
	if (!initialPositionReady.value || !isActivated || !pageActive.value) return;
	const bounds = getReadingBounds();
	if (!bounds) return;
	const firstVisibleId = Array.from(timelineEl.value?.querySelectorAll<HTMLElement>('[data-chat-message-row]') ?? [])
		.find(row => { const rect = row.getBoundingClientRect(); return rect.height > 0 && rect.bottom > bounds.top && rect.top < bounds.bottom; })?.dataset.chatMessageRow;
	const above: string[] = [];
	const below: string[] = [];
	for (const id of attentionMessages.value.toSorted((a, b) => a.localeCompare(b))) {
		const row = timelineEl.value?.querySelector<HTMLElement>(`[data-chat-message-row="${CSS.escape(id)}"]`);
		const rect = row?.getBoundingClientRect();
		if (rect && rect.height > 0) {
			if (rect.bottom <= bounds.top) above.push(id);
			else if (rect.top >= bounds.bottom) below.push(id);
		} else if (id < (firstVisibleId ?? messages.value.at(-1)?.id ?? id)) above.push(id);
		else below.push(id);
	}
	if (attentionAbove.value.join(',') !== above.join(',')) attentionAbove.value = above;
	if (attentionBelow.value.join(',') !== below.join(',')) attentionBelow.value = below;
}

watch([() => attentionMessages.value.join(','), () => messages.value.map(message => message.id).join(','), initialPositionReady, membersOpen], updateAttentionCursors, { flush: 'post' });

function collectLoadedAttentionMessages() {
	if (firstUnreadId == null) return;
	const unreadStartId = firstUnreadId;
	const loadedAttention = messages.value
		.filter(message => message.fromUserId !== $i.id && message.id >= unreadStartId && (lastAcknowledgedId == null || message.id > lastAcknowledgedId) && (unreadSnapshotLastId == null || message.id <= unreadSnapshotLastId))
		.filter(message => getMessageAttention(message) != null)
		.map(message => message.id);
	attentionMessages.value = [...new Set([...attentionMessages.value, ...loadedAttention])].toSorted((a, b) => a.localeCompare(b));
}

function clearReadAttention(id: string, exact = false) {
	if (!initialPositionReady.value || !isReading()) return;
	const bounds = getReadingBounds();
	const remaining = attentionMessages.value.filter(messageId => {
		if (messageId > id || (exact && messageId !== id)) return true;
		const rect = timelineEl.value?.querySelector<HTMLElement>(`[data-chat-message-row="${CSS.escape(messageId)}"]`)?.getBoundingClientRect();
		// 普通消息的线性已读游标不能清掉视口外尚未查看的相关提示。
		if (!bounds || !rect || rect.height <= 0 || rect.width <= 0 || rect.bottom <= bounds.top || rect.top >= bounds.bottom
			|| (!exact && (rect.top < bounds.top || rect.bottom > bounds.bottom + 1))) return true;
		attentionRefreshNeeded = true;
		return false;
	});
	if (remaining.length !== attentionMessages.value.length) attentionMessages.value = remaining;
}

async function refreshAttention(throughId: string) {
	const request = ++attentionRequest;
	refreshingAttention.value = true;
	try {
		// 已读游标确认后再查询下一条，不能只扫描当前 30 条消息窗口。
		const unread = await misskeyApi('chat/unread', props.userId ? { userId: props.userId } : { roomId: props.roomId! });
		if (disposed || roomLeft || request !== attentionRequest || (lastAcknowledgedId != null && throughId < lastAcknowledgedId)) return;
		attentionRefreshNeeded = false;
		const id = unread.firstMentionId;
		if (id && id > throughId && !deletedMessageIds.has(id)) attentionMessages.value = [...new Set([id, ...attentionMessages.value])].toSorted((a, b) => a.localeCompare(b));
	} catch { /* 保留已知提示，下次确认已读时重试。 */ } finally {
		if (request === attentionRequest) refreshingAttention.value = false;
	}
}

const hiddenMembers = ref<string[]>([]);
const hiddenMembersKey = `chat-hidden-members:${$i.id}:${props.roomId ?? ''}` as const;

function loadHiddenMembers() {
	try {
		const stored = JSON.parse(miLocalStorage.getItem(hiddenMembersKey) ?? '[]');
		hiddenMembers.value = Array.isArray(stored) ? stored.filter(id => typeof id === 'string' && id !== $i.id) : [];
	} catch { /* 损坏的本地设置不影响打开聊天。 */ }
}

loadHiddenMembers();
const silenceNow = ref(Date.now());
let silenceTimer: number | undefined;
const roomSilenceUntil = computed(() => getChatSilenceUntil(room.value, $i.id, silenceNow.value));
const roomSilenced = computed(() => roomSilenceUntil.value !== undefined);
const roomMuted = computed(() => { void silenceNow.value; return getChatNotificationMode(props.roomId ? `room:${props.roomId}` : `user:${props.userId}`, room.value) !== 'all'; });

function updateSilenceTime() {
	window.clearTimeout(silenceTimer);
	silenceNow.value = Date.now();
	const remaining = Math.min(...[room.value?.silenceUntil, room.value?.mySilenceUntil, room.value?.mutedUntil, ...roomMemberships.value.map(member => member.silenceUntil)].filter((date): date is string => date != null).map(date => Date.parse(date) - silenceNow.value).filter(duration => duration > 0));
	if (Number.isFinite(remaining)) silenceTimer = window.setTimeout(updateSilenceTime, Math.min(remaining + 10, 2147483647));
}

watch(() => [room.value?.isSilenced, room.value?.silenceUntil, room.value?.myIsSilenced, room.value?.mySilenceUntil, room.value?.isMuted, room.value?.mutedUntil, ...roomMemberships.value.map(member => member.silenceUntil)], updateSilenceTime);
useGlobalEvent('chatRoomUpdated', updated => {
	if (room.value?.id === updated.id) room.value = updated;
});
const canParticipate = computed(() => room.value?.isMember !== false);
const directBlocked = computed(() => user.value != null && user.value.id !== $i.id && ((getUserBlockingState(user.value.id) ?? user.value.isBlocking) || user.value.isBlocked));
const canSendMessage = computed(() => canParticipate.value && !directBlocked.value);
const canModify = computed(() => initialized.value && $i.policies.chatAvailability === 'available' && (room.value?.ownerId === $i.id || room.value?.myRole === 'administrator'));
const canInvite = computed(() => initialized.value && $i.policies.chatAvailability === 'available' && (props.roomId
	? (room.value?.ownerId === $i.id || room.value?.myRole === 'administrator') && room.value?.joinPolicy !== 'closed'
	: user.value?.host === null && user.value.id !== $i.id));
const joiningRoom = ref(false);
let disposed = false;
const connection = ref<Misskey.IChannelConnection<Misskey.Channels['chatUser']> | Misskey.IChannelConnection<Misskey.Channels['chatRoom']> | null>(null);
const editingMessage = ref<Misskey.entities.ChatMessageLite | null>(null);
const seenPokes = new Set<string>();
const pokeAvatarAnimations = new Set<Animation>();
let pokeAvatarVersion = 0;
const formEl = useTemplateRef('formEl');
const chatPageEl = useTemplateRef<HTMLElement>('chatPageEl');
const timelineEl = useTemplateRef('timelineEl');
const conversationEl = useTemplateRef('conversationEl');
const conversationContentEl = useTemplateRef('conversationContentEl');
const timeline = makeDateSeparatedTimelineComputedRef(messages);
let followBottom = false;
let savedChatScrollTop = 0;
let lastAcknowledgedId: string | null = null;

function publishUnreadCount() {
	if (initialized.value && !roomLeft) globalEvents.emit('chatUnreadChanged', { id: props.roomId ? `room:${props.roomId}` : `user:${props.userId}`, count: unreadCount.value, throughId: lastAcknowledgedId });
}

watch([unreadCount, initialized], publishUnreadCount);

function isReading() {
	return !disposed && isActivated && pageActive.value && !window.document.hidden && window.document.hasFocus();
}

function getReadingBounds() {
	const scroller = conversationEl.value;
	if (!scroller?.isConnected) return null;
	const bounds = scroller.getBoundingClientRect();
	if (bounds.height <= 0 || bounds.width <= 0) return null;
	const top = Math.max(0, bounds.top);
	const bottom = Math.min(window.innerHeight, bounds.bottom);
	return bottom > top ? { top, bottom } : null;
}

function isMessageRowReadVisible(row: HTMLElement, bounds: { top: number; bottom: number }) {
	if (deletedMessageIds.has(row.dataset.chatMessageRow!)) return false;
	const rect = row.getBoundingClientRect();
	return rect.height > 0 && rect.width > 0 && rect.bottom > bounds.top && rect.top < bounds.bottom && rect.bottom <= bounds.bottom + 1;
}

function acknowledgeNewest() {
	if (!initialized.value || !initialPositionReady.value || pendingPosition || hasNewerMessages.value || !followBottom || !isReading()) return;
	const scroller = conversationEl.value;
	if (!scroller || -scroller.scrollTop >= 2) return;
	const id = messages.value[0]?.id;
	if (id) {
		const bounds = getReadingBounds();
		const row = timelineEl.value?.querySelector<HTMLElement>(`[data-chat-message-row="${CSS.escape(id)}"]`);
		if (!bounds || !row || !isMessageRowReadVisible(row, bounds)) { acknowledgeVisible(); return; }
		if (id !== lastAcknowledgedId) { connection.value?.send('read', { id }); lastAcknowledgedId = id; }
		clearReadPrompts(id);
	}
}

function clearReadPrompts(id: string) {
	unreadLiveIds = unreadLiveIds.filter(messageId => messageId > id);
	clearReadAttention(id);
	unreadCount.value = unreadLiveIds.length;
	firstUnreadId = null;
	attentionRefreshNeeded = false;
	attentionRequest++;
	refreshingAttention.value = false;
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
	clearReadAttention(unread.throughId);
	firstUnreadId = unread.firstMessageId;
	unreadSnapshotLastId = unread.lastMessageId;
	unreadCount.value = unread.count + unreadLiveIds.filter(id => id > (unread.lastMessageId ?? unread.throughId)).length;
	locallyReadIds.clear();
	if (attentionRefreshNeeded) void refreshAttention(unread.throughId);
}

function acknowledgeVisible() {
	if (!initialized.value || !initialPositionReady.value || pendingPosition || !isReading()) return;
	if (lastAcknowledgedId) clearReadAttention(lastAcknowledgedId);
	if (unreadCount.value === 0) return;
	const bounds = getReadingBounds();
	if (!bounds) return;
	const rows = Array.from(timelineEl.value?.querySelectorAll<HTMLElement>('[data-chat-message-row]') ?? []);
	const lastVisible = rows.findLast(row => isMessageRowReadVisible(row, bounds));
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
	clearReadAttention(id);
	lastAcknowledgedId = id;
	pendingReadId = id;
	window.clearTimeout(readTimer);
	readTimer = window.setTimeout(flushRead, 200);
}

function requestOlderMessages() {
	if (!initialized.value || !initialPositionReady.value || !isReading()) return;
	followBottom = false;
	const scroller = conversationEl.value;
	if (scroller && scroller.scrollHeight - scroller.clientHeight + scroller.scrollTop < 100) void fetchMore();
}

function onConversationWheel(event: WheelEvent) {
	// 恢复在顶部时上滚不会产生 scroll 事件，仍要允许继续加载历史。
	if (event.deltaY < 0 && !event.ctrlKey) requestOlderMessages();
}

let touchStartY = 0;

function onConversationTouchStart(event: TouchEvent) {
	touchStartY = event.touches[0]?.clientY ?? 0;
}

function onConversationTouchMove(event: TouchEvent) {
	if (event.touches.length === 1 && event.touches[0].clientY > touchStartY + 4) requestOlderMessages();
}

function onConversationKeydown(event: KeyboardEvent) {
	if (event.target instanceof HTMLElement && event.target.closest('input, textarea, [contenteditable="true"]')) return;
	if (['ArrowUp', 'PageUp', 'Home'].includes(event.key) || (event.key === ' ' && event.shiftKey)) {
		requestOlderMessages();
	}
}

function scrollToLatest() {
	if (!isReading()) return;
	if (hasNewerMessages.value) { void showLatest(); return; }
	followBottom = true;
	savedChatScrollTop = conversationEl.value?.scrollTop ?? savedChatScrollTop;
	pendingPosition = null;
	reconcileConversationLayout();
}

function onConversationScroll(event: Event) {
	const scroller = conversationEl.value;
	if (event.target === scroller) updateAttentionCursors();
	// 旧滚动区仍可能派发事件，不能用它覆盖当前会话的阅读位置。
	if (!scroller || event.target !== scroller || !isReading() || initializing.value || !initialPositionReady.value || pendingPosition) return;
	// 视口增高或消息收拢时，浏览器会夹紧旧位置；这不是用户向下阅读。
	if (!followBottom && savedChatScrollTop < Math.min(0, scroller.clientHeight - scroller.scrollHeight) - 0.5) {
		savedChatScrollTop = scroller.scrollTop;
		captureScrollPosition();
		return;
	}
	// 恢复锚点和尺寸校正产生的滚动事件不代表用户继续阅读。
	if (Math.abs(scroller.scrollTop - savedChatScrollTop) < 0.5) return;
	savedChatScrollTop = scroller.scrollTop;
	const distance = -scroller.scrollTop;
	followBottom = !hasNewerMessages.value && distance < 2;
	atLatest.value = followBottom;
	if (followBottom) acknowledgeNewest();
	else acknowledgeVisible();
	captureScrollPosition();
	window.clearTimeout(scrollSaveTimer);
	scrollSaveTimer = window.setTimeout(saveScrollPosition, 200);
	if (scroller.scrollHeight - scroller.clientHeight + scroller.scrollTop < 100 && !historyLoadFailed.value) void fetchMore();
	if (distance < 80 && hasNewerMessages.value) void fetchNewer();
}

function messageOffset(row: HTMLElement) {
	const scroller = conversationEl.value!;
	const bounds = scroller.getBoundingClientRect();
	const scale = bounds.height / parseFloat(getComputedStyle(scroller).height);
	return (row.getBoundingClientRect().top - bounds.top) / scale;
}

function captureScrollPosition() {
	const scroller = conversationEl.value;
	if (!scroller?.isConnected || !initialized.value || pendingPosition) return;
	const readingBounds = getReadingBounds();
	if (!readingBounds) return;
	savedChatScrollTop = scroller.scrollTop;
	const { top, bottom } = readingBounds;
	const visibleRows = Array.from(timelineEl.value?.querySelectorAll<HTMLElement>('[data-chat-message-row]') ?? []).filter(row => {
		if (deletedMessageIds.has(row.dataset.chatMessageRow!)) return false;
		const bounds = row.getBoundingClientRect();
		return bounds.height > 0 && bounds.width > 0 && bounds.bottom > top && bounds.top < bottom;
	});
	// 布局变化中继续使用存活锚点，不能把刚补进视口的上一条换成新锚点。
	const anchor = visibleRows.find(row => row.dataset.chatMessageRow === storedPosition?.anchorId) ?? visibleRows[0];
	const index = messages.value.findIndex(message => message.id === anchor?.dataset.chatMessageRow);
	if (!anchor || index < 0) return;
	storedPosition = { anchorId: messages.value[index].id, beforeId: messages.value[index + 1]?.id ?? null, sinceDate: Date.parse(messages.value[index].createdAt) - 1, offset: messageOffset(anchor), atLatest: unreadCount.value === 0 && !hasNewerMessages.value && -scroller.scrollTop < 2 };
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

function restoreScrollPosition() {
	const scroller = conversationEl.value;
	if (!scroller?.clientHeight || initializing.value || !initialized.value || disposed || !isActivated || !pageActive.value) return;
	if (followBottom && !hasNewerMessages.value) {
		scroller.scrollTop = 0;
		pendingPosition = null;
	} else if (!initialPositionReady.value && !pendingPosition) {
		scroller.scrollTop = savedChatScrollTop;
	}
	if (pendingPosition) {
		const anchor = timelineEl.value?.querySelector<HTMLElement>(`[data-chat-message-row="${CSS.escape(pendingPosition.anchorId)}"]`);
		if (anchor?.getClientRects().length) scroller.scrollTop += messageOffset(anchor) - pendingPosition.offset;
		pendingPosition = null;
	}
	savedChatScrollTop = scroller.scrollTop;
	atLatest.value = !hasNewerMessages.value && -scroller.scrollTop < 2;
	followBottom = (followBottom || (!initialPositionReady.value && unreadCount.value === 0)) && atLatest.value && isReading();
	initialPositionReady.value = true;
	captureScrollPosition();
	if (atLatest.value) acknowledgeNewest();
	updateAttentionCursors();
}

function requestTimeline(params: { limit: number; sinceId?: string; untilId?: string; sinceDate?: number }) {
	return props.userId
		? misskeyApi('chat/messages/user-timeline', { userId: props.userId, ...params, markAsRead: false })
		: misskeyApi('chat/messages/room-timeline', { roomId: props.roomId!, ...params, markAsRead: false });
}

async function loadInitialTimeline(firstUnreadMessageId: string | null | undefined, version: number) {
	const position = storedPosition?.atLatest && unreadCount.value === 0 ? null : storedPosition;
	// 阅读位置需要前后两侧的消息，不能只加载锚点之后的内容再让浏览器夹紧位置。
	const [batch, older] = await Promise.all([
		requestTimeline({ limit: 30, ...(position ? position.beforeId ? { sinceId: position.beforeId } : { sinceDate: position.sinceDate } : {}) }),
		position ? requestTimeline({ limit: 30, untilId: position.anchorId }) : Promise.resolve([]),
	]);
	if (disposed || version !== timelineVersion) return;
	const ordered = [...(position ? batch.toReversed() : batch), ...older];
	oldestLoadedId = ordered.at(-1)?.id ?? position?.anchorId ?? null;
	const incoming = (!position || batch.length < 30) ? [...deferredMessages.values()].filter(message => ordered[0] == null || message.id > ordered[0].id) : [];
	const initial = new Map([...incoming.sort((a, b) => b.id.localeCompare(a.id)), ...ordered].map(message => [message.id, message]));
	messages.value = [...initial.values()].filter(message => !deletedMessageIds.has(message.id)).map(normalizeMessage);
	if (!position || batch.length < 30) deferredMessages.clear();
	readingMarkerId.value = firstUnreadMessageId ?? null;
	// 首屏只查询第一条相关未读消息，加载窗口后补充其中的其他提示。
	collectLoadedAttentionMessages();
	hasNewerMessages.value = position != null && (batch.length === 30 || [...deferredMessages.keys()].some(id => id > (messages.value[0]?.id ?? '')));
	canFetchMore.value = (position ? older : batch).length === 30;
	pendingPosition = position ? getRestorablePosition(position) : null;
	storedPosition = pendingPosition;
	followBottom = position == null;
}

async function fetchNewer() {
	if (fetchingNewer.value || loadingLatest.value || initializing.value || jumpingToMessage.value || !hasNewerMessages.value) return;
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
	if (!hasNewerMessages.value) { scrollToLatest(); return; }
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
		oldestLoadedId = batch.at(-1)?.id ?? null;
		historyLoadFailed.value = false;
		pendingPosition = null;
		followBottom = true;
		await nextTick();
		if (disposed || version !== timelineVersion || !isReading()) return;
		reconcileConversationLayout();
	} catch {
		if (!disposed && version === timelineVersion) os.toast(i18n.ts.somethingHappened, 'error');
	} finally { loadingLatest.value = false; }
}

// 所有内容和视口变化共用这一处定位：跟随末尾，或保留当前阅读锚点。
function reconcileConversationLayout() {
	if (disposed || !isActivated || !pageActive.value) return;
	if (!initialPositionReady.value || pendingPosition) { restoreScrollPosition(); return; }
	const scroller = conversationEl.value;
	if (!scroller?.clientHeight) return;
	const clampedScrollTop = Math.max(savedChatScrollTop, Math.min(0, scroller.clientHeight - scroller.scrollHeight));
	// 用户滚动尚未派发事件时，先接纳新位置，不把它拉回旧锚点。
	if (Math.abs(scroller.scrollTop - clampedScrollTop) > 1) {
		savedChatScrollTop = scroller.scrollTop;
		followBottom = !hasNewerMessages.value && -scroller.scrollTop < 2;
		captureScrollPosition();
	}
	if (followBottom) {
		if (scroller.scrollTop !== 0) scroller.scrollTop = 0;
	} else if (storedPosition) {
		const anchor = timelineEl.value?.querySelector<HTMLElement>(`[data-chat-message-row="${CSS.escape(storedPosition.anchorId)}"]`);
		if (anchor?.getClientRects().length) {
			const offset = messageOffset(anchor) - storedPosition.offset;
			if (Math.abs(offset) > 0.5) scroller.scrollTop += offset;
		}
	}
	savedChatScrollTop = scroller.scrollTop;
	atLatest.value = !hasNewerMessages.value && -scroller.scrollTop < 2;
	captureScrollPosition();
	if (followBottom) acknowledgeNewest();
	updateAttentionCursors();
	// 恢复窗口或删除后不足一屏，继续分页补齐；游标独立于可见消息，不被删除打断。
	if (scroller.scrollHeight <= scroller.clientHeight + 1 && !historyLoadFailed.value) void fetchMore();
}

const conversationResizeObserver = new ResizeObserver(reconcileConversationLayout);
onUpdated(reconcileConversationLayout);

watch([conversationEl, conversationContentEl], ([scroller, content]) => {
	conversationResizeObserver.disconnect();
	initialPositionReady.value = false;
	if (!scroller || !content) return;
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
	initialPositionReady.value = false;
	initializationFailed.value = false;
	historyLoadFailed.value = false;
	oldestLoadedId = null;
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
	attentionRequest++;
	attentionRefreshNeeded = false;
	refreshingAttention.value = false;

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
					if (isActivated && pageActive.value) os.toast(i18n.ts._chat.notMemberOfRoom, 'error');
					// 退群事件统一清理和跳转，缓存会话不打断当前页面。
					forgetChatRoom($i.id, r.id);
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
	updateSilenceTime();
	if (returning && storedPosition) pendingPosition = getRestorablePosition(storedPosition);
	void nextTick(reconcileConversationLayout);
});

onDeactivated(() => {
	flushRead();
	// 离开前读取真实位置，最后一条滚动事件可能还没派发。
	savedChatScrollTop = conversationEl.value?.scrollTop ?? savedChatScrollTop;
	saveScrollPosition();
	isActivated = false;
	// 缓存页面再次插入时，先恢复阅读位置，再显示消息。
	initialPositionReady.value = false;
	if (initialized.value) timelineVersion++;
});

async function fetchMore() {
	const LIMIT = 30;
	if (!canFetchMore.value || moreFetching.value || initializing.value || loadingLatest.value || jumpingToMessage.value || !initialPositionReady.value || !isActivated || !pageActive.value) return;
	const untilId = oldestLoadedId;
	if (untilId == null) return;

	moreFetching.value = true;
	historyLoadFailed.value = false;
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
		captureScrollPosition();
		messages.value.push(...newMessages.filter(x => !deletedMessageIds.has(x.id) && !messages.value.some(message => message.id === x.id)).map(x => normalizeMessage(x)));
		oldestLoadedId = newMessages.at(-1)?.id ?? untilId;
		canFetchMore.value = newMessages.length === LIMIT && oldestLoadedId !== untilId;
	} catch {
		if (!disposed && version === timelineVersion) historyLoadFailed.value = true;
	} finally {
		moreFetching.value = false;
		await nextTick(reconcileConversationLayout);
	}
}

function onMessage(message: Misskey.entities.ChatMessageLite) {
	if (disposed || roomLeft) return;
	if (deletedMessageIds.has(message.id) || deferredMessages.has(message.id) || messages.value.some(existing => existing.id === message.id)) return;
	schedulePokeAvatar(message);
	const beyondReadCursor = lastAcknowledgedId == null || message.id > lastAcknowledgedId;
	const addsUnread = message.fromUserId !== $i.id && beyondReadCursor && (unreadSnapshotLastId == null || message.id > unreadSnapshotLastId);
	if (hasNewerMessages.value || initializing.value || loadingLatest.value || jumpingToMessage.value) {
		deferredMessages.set(message.id, message);
		if (addsUnread) { unreadLiveIds.push(message.id); unreadCount.value++; }
		if (beyondReadCursor && getMessageAttention(message)) attentionMessages.value.push(message.id);
		if (!initializing.value && message.fromUserId === $i.id) void showLatest();
		return;
	}
	const scroller = conversationEl.value;
	const followNewMessage = isReading() && (message.fromUserId === $i.id || (followBottom && (!scroller || -scroller.scrollTop < 2)));
	if (message.fromUserId !== $i.id && !roomMuted.value && $i.onlineStatusOverride !== 'doNotDisturb') sound.playMisskeySfx('chatMessage');
	captureScrollPosition();
	followBottom = followNewMessage;
	messages.value.unshift(normalizeMessage(message));
	if (!followNewMessage && beyondReadCursor && getMessageAttention(message)) attentionMessages.value.push(message.id);
	if (addsUnread) {
		// 实际显示并确认已读后才清计数，后台收到的消息仍保持未读。
		if (!followNewMessage && unreadCount.value === 0) readingMarkerId.value = message.id;
		unreadLiveIds.push(message.id);
		unreadCount.value++;
	}
}

function onSent(message: Misskey.entities.ChatMessageLite) {
	const existing = messages.value.find(item => item.id === message.id);
	if (existing) existing.redPacketClaims = message.redPacketClaims;
	else onMessage(message);
	void nextTick(scrollToLatest);
	for (const claim of message.redPacketClaims ?? []) globalEvents.emit('redPacketClaimed', claim.redPacketId);
}

async function showAttention(id = attentionMessages.value[0]) {
	if (jumpingToMessage.value || refreshingAttention.value) return;
	if (id && await jumpToMessage(id)) {
		clearReadAttention(id, true);
		collectLoadedAttentionMessages();
	}
}

async function jumpToMessage(id: string) {
	if (!isReading()) return false;
	cancelMessageJump();
	const controller = new AbortController();
	messageJumpController = controller;
	const version = ++timelineVersion;
	jumpingToMessage.value = true;
	followBottom = false;
	try {
		if (!messages.value.some(message => message.id === id)) {
			const previous = await requestTimeline({ untilId: id, limit: 1 });
			if (controller.signal.aborted || disposed || version !== timelineVersion) return false;
			const batch = await requestTimeline({ limit: 30, ...(previous[0] ? { sinceId: previous[0].id } : { sinceDate: 1 }) });
			if (controller.signal.aborted || disposed || version !== timelineVersion) return false;
			if (deletedMessageIds.has(id) || !batch.some(message => message.id === id)) { os.toast(i18n.ts._chat.messageUnavailable, 'error'); return false; }
			messages.value = batch.filter(message => !deletedMessageIds.has(message.id)).toReversed().map(normalizeMessage);
			oldestLoadedId = batch[0]?.id ?? id;
			historyLoadFailed.value = false;
			canFetchMore.value = previous.length > 0;
			hasNewerMessages.value = batch.length === 30 || [...deferredMessages.keys()].some(messageId => messageId > (messages.value[0]?.id ?? ''));
		}
		pendingPosition = null;
		revealedMessageId.value = id;
		await nextTick();
		if (controller.signal.aborted || !isReading() || version !== timelineVersion) return false;
		const exists = timelineEl.value?.querySelector(`[data-chat-message-id="${CSS.escape(id)}"]`);
		if (exists) {
			focusMessage(id);
			const bounds = getReadingBounds();
			const rect = exists.getBoundingClientRect();
			if (!bounds || rect.height <= 0 || rect.width <= 0 || rect.bottom <= bounds.top || rect.top >= bounds.bottom) return false;
			// 查阅旧引用不能让本地已读游标倒退。
			lastAcknowledgedId = lastAcknowledgedId && lastAcknowledgedId > id ? lastAcknowledgedId : id;
			clearReadAttention(id, true);
			pendingReadId = lastAcknowledgedId;
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
			syncDeferredMessages();
		}
	}
}

const poking = ref(false);

async function poke(pokeUserId: string) {
	if (poking.value || roomSilenced.value || !canSendMessage.value) return;
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
	return !disposed && isActivated && pageActive.value && prefer.s.animation && !window.document.hidden && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const messageAnimations = shallowReactive(new Map<Element, { finish: () => void }>());

function animateMessage(element: HTMLElement, frames: Keyframe[], duration: number, done: () => void) {
	messageAnimations.get(element)?.finish();
	const animation = element.animate(frames, { duration, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' });
	const finish = () => {
		if (messageAnimations.get(element)?.finish !== finish) return;
		messageAnimations.delete(element);
		animation.cancel();
		done();
		reconcileConversationLayout();
	};
	messageAnimations.set(element, { finish });
	void animation.finished.then(finish, finish);
}

function enterMessage(element: Element, done: () => void) {
	if (!(element instanceof HTMLElement) || !initialPositionReady.value || loadingLatest.value || jumpingToMessage.value || !canAnimateMessageMovement()) { done(); return; }
	animateMessage(element, [{ opacity: 0 }, { opacity: 1 }], 160, done);
}

function leaveMessage(element: Element, done: () => void) {
	if (!(element instanceof HTMLElement) || initializing.value || loadingLatest.value || jumpingToMessage.value || (element.dataset.chatMessageRow && !deletedMessageIds.has(element.dataset.chatMessageRow)) || !canAnimateMessageMovement() || element.getClientRects().length === 0) { done(); return; }
	const style = getComputedStyle(element);
	element.style.overflow = 'clip';
	element.style.pointerEvents = 'none';
	element.style.visibility = 'hidden';
	element.inert = true;
	// 只收拢离场行的高度，存活气泡不缩放、不重新挂载，也不反复淡入。
	animateMessage(element, [
		{ height: style.height, paddingTop: style.paddingTop, paddingBottom: style.paddingBottom },
		{ height: '0px', paddingTop: '0px', paddingBottom: '0px' },
	], 220, done);
}

function finishMessageAnimations() {
	for (const transition of messageAnimations.values()) transition.finish();
}

watch([() => prefer.s.animation, pageActive], ([animation, active]) => {
	if (!animation || !active) finishMessageAnimations();
}, { flush: 'sync' });
onDeactivated(finishMessageAnimations);
onBeforeUnmount(finishMessageAnimations);

function cancelPokeAvatarAnimations() {
	pokeAvatarVersion++;
	for (const animation of pokeAvatarAnimations) animation.cancel();
	pokeAvatarAnimations.clear();
}

function schedulePokeAvatar(message: Misskey.entities.ChatMessageLite) {
	if (!message.isPoke || seenPokes.has(message.id) || deletedMessageIds.has(message.id)) return;
	// 暂存的新事件也只处理一次，加载历史或跳转后不重播。
	seenPokes.add(message.id);
	cancelPokeAvatarAnimations();
	const targetId = message.pokeUserId ?? message.pokeUser?.id;
	if (targetId === $i.id && message.fromUserId !== $i.id) notifyPokedHere();
	const page = chatPageEl.value;
	if (!targetId || !page || !canAnimateMessageMovement()) return;
	const sequence = pokeAvatarVersion;
	const version = timelineVersion;
	void nextTick(() => {
		if (sequence !== pokeAvatarVersion || version !== timelineVersion || page !== chatPageEl.value || !canAnimateMessageMovement()) return;
		const pageBounds = page.getBoundingClientRect();
		const left = Math.max(0, pageBounds.left);
		const right = Math.min(window.innerWidth, pageBounds.right);
		const top = Math.max(0, pageBounds.top);
		const bottom = Math.min(window.innerHeight, pageBounds.bottom);
		for (const avatar of page.querySelectorAll<HTMLElement>(`[data-avatar-user-id="${CSS.escape(targetId)}"]`)) {
			if (!avatar.isConnected || typeof avatar.animate !== 'function' || avatar.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) === false) continue;
			const bounds = avatar.getBoundingClientRect();
			if (bounds.width <= 0 || bounds.height <= 0 || bounds.right <= left || bounds.left >= right || bounds.bottom <= top || bounds.top >= bottom) continue;
			const readingBounds = conversationEl.value?.contains(avatar) ? getReadingBounds() : null;
			if (readingBounds && (bounds.bottom <= readingBounds.top || bounds.top >= readingBounds.bottom)) continue;
			const animation = avatar.animate([
				{ translate: '0 0', rotate: '0deg' },
				{ translate: '4px 0', rotate: '6deg', offset: 0.25 },
				{ translate: '-1px 0', rotate: '-2deg', offset: 0.65 },
				{ translate: '0 0', rotate: '0deg' },
			], { duration: 300, iterations: 2, easing: 'ease-in-out' });
			pokeAvatarAnimations.add(animation);
			void animation.finished.then(() => pokeAvatarAnimations.delete(animation), () => pokeAvatarAnimations.delete(animation));
		}
	});
}

watch([() => prefer.s.animation, pageActive], ([animation, active]) => {
	if (!animation || !active) cancelPokeAvatarAnimations();
}, { flush: 'sync' });
onDeactivated(cancelPokeAvatarAnimations);
onBeforeUnmount(cancelPokeAvatarAnimations);

const conversationBodyEl = useTemplateRef('conversationBodyEl');
const pokeFlashing = ref(false);
let pokeFlashTimer: number | null = null;
let pokeNudge: Animation | null = null;

function notifyPokedHere() {
	if (disposed || !isActivated || !pageActive.value || window.document.hidden) return;
	if (pokeFlashTimer != null) window.clearTimeout(pokeFlashTimer);
	pokeFlashing.value = false;
	void nextTick(() => {
		if (disposed) return;
		pokeFlashing.value = true;
		pokeFlashTimer = window.setTimeout(stopPokedHere, 1200);
	});
	const body = conversationBodyEl.value;
	// 只位移外层，不改滚动容器，阅读位置保持不变。
	if (!body || typeof body.animate !== 'function' || !canAnimateMessageMovement()) return;
	pokeNudge?.cancel();
	pokeNudge = body.animate([
		{ translate: '0 0' },
		{ translate: '3px 0', offset: 0.25 },
		{ translate: '-2px 0', offset: 0.6 },
		{ translate: '0 0' },
	], { duration: 280, easing: 'ease-in-out' });
}

function stopPokedHere() {
	if (pokeFlashTimer != null) window.clearTimeout(pokeFlashTimer);
	pokeFlashTimer = null;
	pokeFlashing.value = false;
	pokeNudge?.cancel();
	pokeNudge = null;
}

onDeactivated(stopPokedHere);
onBeforeUnmount(stopPokedHere);

const conversationKey = props.roomId ? `room:${props.roomId}` : `user:${props.userId}`;
let releaseViewing: (() => void) | null = null;

function updateViewing() {
	const viewing = !disposed && isActivated && pageActive.value;
	if (viewing && releaseViewing == null) releaseViewing = markChatConversationViewing(conversationKey);
	else if (!viewing && releaseViewing != null) {
		releaseViewing();
		releaseViewing = null;
	}
}

watch(pageActive, updateViewing);
onMounted(updateViewing);
onActivated(updateViewing);
onDeactivated(updateViewing);
onBeforeUnmount(() => {
	releaseViewing?.();
	releaseViewing = null;
});

function getDateDividerKey(date: Date | string) {
	const value = typeof date === 'string' ? new Date(date) : date;
	// 使用较早一天作为边界标识；删掉边界消息时保留仍存在的日期行。
	return `date-${value.getFullYear()}-${value.getMonth() + 1}-${value.getDate()}`;
}

function onDeleted(id: string) {
	if (disposed || deletedMessageIds.has(id)) return;
	deletedMessageIds.add(id);
	deferredMessages.delete(id);
	const scroller = conversationEl.value;
	// 删除按此刻的视口决定贴底或保留锚点，不沿用刷新阶段的阅读状态。
	if (scroller?.clientHeight) followBottom = !hasNewerMessages.value && Math.abs(scroller.scrollTop) < 2;
	// 离场前选存活消息作锚点，收拢期间也保留阅读位置。
	captureScrollPosition();
	const deleted = messages.value.find(message => message.id === id);
	const wasUnread = unreadLiveIds.includes(id) || (deleted != null && deleted.fromUserId !== $i.id && !locallyReadIds.has(id)
		&& firstUnreadId != null && id >= firstUnreadId && unreadSnapshotLastId != null && id <= unreadSnapshotLastId);
	if (wasUnread) {
		unreadLiveIds = unreadLiveIds.filter(messageId => messageId !== id);
		locallyReadIds.add(id);
		unreadCount.value = Math.max(0, unreadCount.value - 1);
	}
	if (attentionMessages.value.includes(id)) {
		attentionMessages.value = attentionMessages.value.filter(messageId => messageId !== id);
		attentionRefreshNeeded = true;
		void refreshAttention(lastAcknowledgedId ?? '');
	}
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
	if (editingMessage.value?.id === id) editingMessage.value = null;
	window.clearTimeout(scrollSaveTimer);
	scrollSaveTimer = window.setTimeout(saveScrollPosition, 200);
}

function startEdit(message: NormalizedChatMessage | Misskey.entities.ChatMessage) {
	if (!canSendMessage.value || roomSilenced.value) return;
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
	syncDeferredMessages();
	cancelMessageHighlight?.();
	cancelMessageHighlight = null;
}

function syncDeferredMessages() {
	if ([...deferredMessages.keys()].some(id => id > (messages.value[0]?.id ?? ''))) hasNewerMessages.value = true;
}

function focusMessage(id: string) {
	const element = timelineEl.value?.querySelector<HTMLElement>(`[data-chat-message-id="${CSS.escape(id)}"]`);
	const scroller = conversationEl.value;
	const bounds = getReadingBounds();
	if (!element || !scroller || !bounds) return;
	const startTop = scroller.scrollTop;
	const rect = element.getBoundingClientRect();
	const target = Math.min(0, Math.max(scroller.clientHeight - scroller.scrollHeight,
		startTop + (rect.top + rect.height / 2 - (bounds.top + bounds.bottom) / 2) / (scroller.getBoundingClientRect().height / parseFloat(getComputedStyle(scroller).height))));
	scroller.scrollTop = target;
	savedChatScrollTop = scroller.scrollTop;
	captureScrollPosition();
	element.focus({ preventScroll: true });
	const surface = element.querySelector<HTMLElement>('[data-target-highlight-surface]');
	if (surface) cancelMessageHighlight = highlightTarget(surface);
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
	cancelPokeAvatarAnimations();
	finishMessageAnimations();
	flushRead();
	if (initialized.value) timelineVersion++;
	cancelMessageJump();
	savedChatScrollTop = conversationEl.value?.scrollTop ?? savedChatScrollTop;
	saveScrollPosition();
}

function resumeReading() {
	if (!isReading() || !initialized.value) return;
	loadHiddenMembers();
	updateSilenceTime();
	if (unreadCount.value > 0) followBottom = false;
	if (storedPosition) pendingPosition = getRestorablePosition(storedPosition);
	restoreScrollPosition();
	if (initialPositionReady.value && unreadCount.value === 0) followBottom = atLatest.value;
}

watch(pageActive, active => {
	if (!active) pauseReading();
	else void nextTick(resumeReading);
}, { flush: 'sync' });

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
	loadHiddenMembers();
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
	compactViewport.removeEventListener('change', onCompactViewportChange);
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
	connection.value?.dispose();
	connection.value = null;
	messages.value = [];
	deferredMessages.clear();
	if (isActivated && pageActive.value) router.push('/chat');
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
		const question = target.joinQuestion?.trim() ?? '';
		const { canceled, result } = await os.inputText({
			title: i18n.ts._chat.requestJoin,
			text: question ? `${question}\n\n${i18n.ts._chat.joinRequestDescription}` : i18n.ts._chat.joinRequestDescription,
			placeholder: question ? i18n.ts._chat.joinQuestionAnswer : i18n.ts._chat.joinRequestMessage,
			default: '',
			minLength: question ? 1 : undefined,
			maxLength: 500,
		});
		if (canceled || disposed) return;
		if (question && !result.trim()) {
			os.toast(i18n.ts._chat.joinQuestionRequired, 'error');
			return;
		}
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
	if (compactHeader.value) {
		router.push('/chat/room/:roomId/announcement', { params: { roomId: room.value.id } });
		return;
	}
	const { dispose } = os.popup(defineAsyncComponent(() => import('./room.announcement.vue')), { room: room.value }, {
		updated: (updated: Misskey.entities.ChatRoom) => { room.value = updated; globalEvents.emit('chatRoomUpdated', updated); },
		closed: () => dispose(),
	});
}

function showMemberMenu(event: MouseEvent | KeyboardEvent, member: ChatMember) {
	if (!room.value) return;
	const roomId = room.value.id;
	const menu = getChatMemberMenu(room.value, member, {
		mention: user => { void nextTick(() => formEl.value?.mentionUser(user)); },
		poke: userId => { void poke(userId); },
		updated: membership => {
			if (room.value?.id !== roomId) return;
			if (membership) {
				const index = roomMemberships.value.findIndex(item => item.userId === membership.userId);
				if (index !== -1) {
					const previous = roomMemberships.value[index];
					roomMemberships.value[index] = { ...previous, ...membership, user: membership.user ?? previous.user };
				}
			}
			void refreshRoom();
		},
		getMember: () => room.value?.id === roomId ? memberList.value.find(item => item.user.id === member.user.id) : undefined,
		getNow: () => silenceNow.value,
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

function minimizeChatPage() {
	fullPageChatControls?.minimize();
}

function restoreChatPopup() {
	fullPageChatControls?.restoreWindow();
}

function showMenu(ev: MouseEvent) {
	const menuItems: MenuItem[] = [];
	if (fullPageChatControls != null && floatingLayout?.value !== true && !mobileLayout.value && compactHeader.value) {
		menuItems.push({ text: i18n.ts.windowMinimize, icon: 'ti ti-minus', action: minimizeChatPage });
		menuItems.push({ text: i18n.ts._chat.openChatWindow, icon: 'ti ti-arrows-minimize', action: restoreChatPopup });
		menuItems.push({ type: 'divider' });
	}
	if (canParticipate.value) menuItems.push({ text: i18n.ts._chat.searchMessages, icon: 'ti ti-search', action: () => showPanel('search') });
	if (canModify.value) menuItems.push({ text: i18n.ts._chat.modify, icon: 'ti ti-edit', action: () => showPanel('info') });
	if (canInvite.value) menuItems.push({ text: i18n.ts._chat.inviteUser, icon: 'ti ti-user-plus', action: requestInvite });
	if (attentionMessages.value.length) menuItems.push({ text: i18n.ts._chat.unreadMentions, icon: 'ti ti-at', action: () => showAttention() });

	if (room.value) {
		if (canModify.value) menuItems.push({ text: i18n.ts._chat.joinRequests, icon: 'ti ti-user-check', action: () => showPanel('members') });
		if (canModify.value) {
			const roomId = room.value.id;
			const silenceMenu = getChatRoomSilenceMenu(room.value, {
				getRoom: () => room.value?.id === roomId ? room.value : null,
				getNow: () => silenceNow.value,
				updated: updated => {
					if (room.value?.id !== roomId) return;
					room.value = updated;
					globalEvents.emit('chatRoomUpdated', updated);
				},
			});
			if (silenceMenu) menuItems.push(silenceMenu);
		}
		if (canParticipate.value && !mutingRoom.value) menuItems.push({
			text: roomMuted.value ? i18n.ts._chat.disableDoNotDisturb : i18n.ts._chat.muteThisRoom,
			icon: roomMuted.value ? 'ti ti-bell' : 'ti ti-bell-off',
			action: async () => {
				if (mutingRoom.value || !room.value) return;
				mutingRoom.value = true;
				try {
					// 菜单关闭后看不到状态变化，需要成功提示；失败提示由 setChatRoomMuted 处理
					const updated = await setChatRoomMuted(room.value, !roomMuted.value);
					if (updated) {
						room.value = updated;
						os.toast(updated.isMuted ? i18n.ts._chat.doNotDisturbEnabled : i18n.ts._chat.doNotDisturbDisabled, 'success');
					}
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
@use '../../styles/chat-header.scss';

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
	--MI-chatBackground: color-mix(in srgb, var(--MI_THEME-fg) 4%, var(--MI_THEME-panel));
	--MI-chatGutter: 24px;
	--MI-chatContentWidth: 920px;
	position: relative;
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	grid-template-rows: auto minmax(0, 1fr) auto auto;
	grid-template-areas: 'header' 'messages' 'previews' 'composer';
	height: 100%;
	min-width: 0;
	min-height: 0;
	border-radius: var(--MI-cardRadius);
	background: var(--MI-chatBackground);
	overflow: clip;
	isolation: isolate;
	container-type: size;
	container-name: chatRoom;
}

.chatPage:not(.floating) {
	border-radius: 0;
}

.chatPage.floating {
	border-radius: var(--MI-cardRadius);
}

.chatPage.withSidebar {
	grid-template-columns: minmax(0, 1fr) clamp(112px, 28%, 248px);
	grid-template-areas: 'header header' 'messages members' 'previews members' 'composer members';
}

.pageHeader :global([data-page-header]) {
	border-radius: 0;
}

.pageHeader {
	grid-area: header;
	flex: none;
	background: var(--MI_THEME-panel);
}

.conversationBody {
	grid-area: messages;
	position: relative;
	display: flex;
	flex: 1;
	flex-direction: column;
	min-width: 0;
	min-height: 0;
	container-type: inline-size;
}

.pokeFlash {
	position: absolute;
	inset: 0;
	z-index: 2;
	border-radius: inherit;
	box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--MI_THEME-accent) 55%, transparent), inset 0 0 28px color-mix(in srgb, var(--MI_THEME-accent) 22%, transparent);
	pointer-events: none;

	&.pokeFlashAnimated { animation: pokeFlash 1200ms ease-out forwards; }
}

@keyframes pokeFlash {
	0% { opacity: 0; }
	15% { opacity: 1; }
	100% { opacity: 0; }
}

.groupSidebar {
	grid-area: members;
	display: flex;
	flex-direction: column;
	min-width: 0;
	min-height: 0;
	box-sizing: border-box;
	border-left: var(--MI-divider);
	background: var(--MI_THEME-panel);
}

.groupSidebar > .groupSidebarContent {
	flex: 1;
	min-width: 0;
	min-height: 0;
	border-left: 0;
}

.headerMenu {
	flex: 0 0 var(--MI-chatPlainActionSize);
	width: var(--MI-chatPlainActionSize);
}

.messagePrompts {
	position: absolute;
	right: 16px;
	bottom: 16px;
	z-index: 4;
	display: flex;
	flex-direction: column;
	align-items: flex-end;
	gap: 8px;
	max-width: calc(100% - 32px);
}

.promptCount {
	min-width: 2ch;
	padding: 0 5px;
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
	&::before, &::after { content: ''; flex: 1; height: var(--MI-dividerWidth); background: color-mix(in srgb, var(--MI_THEME-accent) 35%, transparent); }
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
	height: var(--MI-chatHeaderHeight);
	flex: 0 0 auto;
	gap: 6px;
	// 与右侧窗口控制按钮留出间距。
	padding: 0 calc(16px + var(--MI-chatWindowControlsWidth, 0px)) 0 16px;
	box-sizing: border-box;
	font-weight: normal;
	line-height: 1.5;

	button:not(:disabled) { cursor: pointer; }
}

// 返回按钮保留悬停背景，成员和更多按钮只改变图标颜色。
.mobileHeaderButton {
	@include chat-header.action;
}

.plainHeaderButton {
	@include chat-header.plainAction;
}

.messagePrompt {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	max-width: 100%;
	min-height: 36px;
	padding: 7px 12px;
	box-sizing: border-box;
	border: var(--MI-divider);
	border-radius: 8px;
	background: var(--MI_THEME-panel);
	box-shadow: 0 2px 8px var(--MI_THEME-shadow);
	color: var(--MI_THEME-accent);
	font-size: 12px;
	line-height: 1.5;

	> span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	> i { flex: none; font-size: 16px; }
	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: 2px; }
}

.attentionAbove {
	position: absolute;
	top: 16px;
	right: 16px;
	z-index: 4;
	max-width: calc(100% - 32px);
}

.chatTitle {
	display: flex;
	align-items: center;
	flex: 1;
	min-width: 0;
	height: 48px;
	padding: 0 4px;
	box-sizing: border-box;
	border-radius: 10px;
	overflow: hidden;
	text-align: left;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-weight: normal;
	color: var(--MI_THEME-fg);

	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -2px; }
}

.titleAvatar {
	display: block;
	flex: 0 0 40px;
	width: 40px;
	height: 40px;
	box-sizing: border-box;
	border-radius: 50%;
	overflow: visible;
}

.avatarImage {
	display: block;
	width: 100%;
	height: 100%;
}

.titleTexts {
	display: flex;
	flex: 1;
	flex-direction: column;
	min-width: 0;
	gap: 1px;
}

.groupTitleTexts {
	flex-direction: row;
	align-items: center;
	gap: 4px;
}

.memberCount {
	flex: none;
	font-size: 15px;
	font-weight: 600;
	line-height: 1.35;
}

.chatTitleText {
	min-width: 0;
	max-width: 100%;
	padding: 0;
	overflow: hidden;
	line-height: 1.35;
	font-size: 15px;
	font-weight: 600;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.chatSubtitle {
	overflow: hidden;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 12px;
	font-weight: 400;
	line-height: 1.35;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.conversation {
	display: flex;
	flex-direction: column-reverse;
	flex: 1;
	min-width: 0;
	min-height: 0;
	width: 100%;
	padding: 14px max(var(--MI-chatGutter), calc((100% - var(--MI-chatContentWidth)) / 2));
	box-sizing: border-box;
	overflow-x: hidden;
	overflow-y: auto;
	// 底部由反向滚动布局保持，历史阅读只由统一锚点定位，避免浏览器二次补偿。
	overflow-anchor: none;
	overscroll-behavior: contain;
	scroll-behavior: auto;
	scroll-padding-block: 16px;
	// 始终预留槽位，避免消息宽度随滚动条出现而变化。
	scrollbar-gutter: stable;
	background-color: var(--MI-chatBackground);
	background-image: radial-gradient(circle, color-mix(in srgb, var(--MI_THEME-fg) 12%, transparent) 1px, transparent 1px);
	background-size: 24px 24px;

}

.conversationContent {
	--MI-stickyTop: 0px;
	--MI-stickyBottom: 0px;
	flex: none;
	display: flex;
	flex-direction: column;
	justify-content: flex-end;
	min-height: 100%;
}

.timeline {
	position: relative;
}

.messageList {
	display: flex;
	flex-direction: column;
}

.timelineItem {
	flex: none;
	box-sizing: border-box;
	padding-block: 10px;
}

.historyRetry {
	display: block;
	margin: 0 auto 12px;
}

.footer {
	grid-area: composer;
	min-width: 0;
	border-top: var(--MI-divider);
	background: var(--MI_THEME-panel);
	container-type: inline-size;
}

.joinPrompt {
	padding: var(--MI-cardPadding);
}

.dateDivider {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 12px;
	width: fit-content;
	margin: 4px auto;
}

@container chatRoom (max-width: 600px) {
	.conversation {
		--MI-chatGutter: 14px;
		padding-block: 16px;
	}

	.timelineItem {
		padding-block: 8px;
	}

	.chatHeader {
		padding-left: 12px;
	}
}
</style>
