<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.root, { [$style.contentVisibilityAuto]: contentVisibilityAuto, [$style.chatRoomNotification]: notification.type === 'chatRoomInvitationReceived' || notification.type === 'chatRoomMemberRemoved' }]">
	<div :class="[$style.head, prefer.s.useStickyIcons ? $style.useSticky : null]">
		<div v-if="notification.type === 'system'" :class="[$style.icon, $style.systemIcon]"><i class="ti ti-shield-check" aria-hidden="true"></i></div>
		<MkAvatar v-else-if="['pollEnded', 'note'].includes(notification.type) && 'note' in notification" :class="[$style.icon, $style.avatarIcon]" :user="notification.note.user" link preview imageOnly/>
		<MkAvatar v-else-if="notification.type === 'achievementEarned'" :class="$style.icon" :user="$i" link preview/>
		<MkAvatar v-else-if="['roleAssigned', 'exportCompleted', 'login', 'createToken', 'scheduledNotePosted', 'scheduledNotePostFailed'].includes(notification.type)" :class="[$style.icon, $style.avatarIcon]" :user="$i" link preview imageOnly/>
		<div v-else-if="notification.type === 'reaction:grouped' && notification.note.reactionAcceptance === 'likeOnly'" :class="[$style.icon, $style.icon_reactionGroupHeart]"><i class="ti ti-heart" style="line-height: 1;"></i></div>
		<div v-else-if="notification.type === 'reaction:grouped'" :class="[$style.icon, $style.icon_reactionGroup]"><i class="ti ti-mood-happy" style="line-height: 1;"></i></div>
		<div v-else-if="notification.type === 'renote:grouped'" :class="[$style.icon, $style.icon_renoteGroup]"><i class="ti ti-repeat" style="line-height: 1;"></i></div>
		<MkAvatar v-else-if="'user' in notification" :class="[$style.icon, $style.avatarIcon]" :user="notification.user" link preview imageOnly/>
		<img v-else-if="'icon' in notification && notification.icon != null" :class="[$style.icon, $style.icon_app]" :src="notification.icon" alt=""/>
		<div
			:class="[$style.subIcon, {
				[$style.t_follow]: notification.type === 'follow',
				[$style.t_followRequestAccepted]: notification.type === 'followRequestAccepted',
				[$style.t_receiveFollowRequest]: notification.type === 'receiveFollowRequest',
				[$style.t_renote]: notification.type === 'renote',
				[$style.t_reply]: notification.type === 'reply',
				[$style.t_mention]: notification.type === 'mention',
				[$style.t_quote]: notification.type === 'quote',
				[$style.t_pollEnded]: notification.type === 'pollEnded',
				[$style.t_scheduledNotePosted]: notification.type === 'scheduledNotePosted',
				[$style.t_scheduledNotePostFailed]: notification.type === 'scheduledNotePostFailed',
				[$style.t_achievementEarned]: notification.type === 'achievementEarned',
				[$style.t_exportCompleted]: notification.type === 'exportCompleted',
				[$style.t_login]: notification.type === 'login',
				[$style.t_createToken]: notification.type === 'createToken',
				[$style.t_chatRoomInvitationReceived]: notification.type === 'chatRoomInvitationReceived',
				[$style.t_chatRoomMemberRemoved]: notification.type === 'chatRoomMemberRemoved',
				[$style.t_roleAssigned]: notification.type === 'roleAssigned' && notification.role.iconUrl == null,
			}]"
		>
			<i v-if="notification.type === 'follow'" class="ti ti-plus"></i>
			<i v-else-if="notification.type === 'receiveFollowRequest'" class="ti ti-clock"></i>
			<i v-else-if="notification.type === 'followRequestAccepted'" class="ti ti-check"></i>
			<i v-else-if="notification.type === 'renote'" class="ti ti-repeat"></i>
			<i v-else-if="notification.type === 'reply'" class="ti ti-message-circle"></i>
			<i v-else-if="notification.type === 'mention'" class="ti ti-at"></i>
			<i v-else-if="notification.type === 'quote'" class="ti ti-quote"></i>
			<i v-else-if="notification.type === 'pollEnded'" class="ti ti-chart-arrows"></i>
			<i v-else-if="notification.type === 'scheduledNotePosted'" class="ti ti-send"></i>
			<i v-else-if="notification.type === 'scheduledNotePostFailed'" class="ti ti-alert-triangle"></i>
			<i v-else-if="notification.type === 'achievementEarned'" class="ti ti-medal"></i>
			<i v-else-if="notification.type === 'exportCompleted'" class="ti ti-archive"></i>
			<i v-else-if="notification.type === 'login'" class="ti ti-login-2"></i>
			<i v-else-if="notification.type === 'createToken'" class="ti ti-key"></i>
			<i v-else-if="notification.type === 'chatRoomInvitationReceived'" class="ti ti-message-circle"></i>
			<i v-else-if="notification.type === 'chatRoomMemberRemoved'" class="ti ti-user-minus"></i>
			<template v-else-if="notification.type === 'roleAssigned'">
				<img v-if="notification.role.iconUrl" style="height: 1.3em; vertical-align: -0.275em;" :src="notification.role.iconUrl" alt=""/>
				<i v-else class="ti ti-badges"></i>
			</template>
			<MkReactionIcon
				v-else-if="notification.type === 'reaction'"
				:withTooltip="true"
				:reaction="notification.reaction.replace(/^:(\w+):$/, ':$1@.:')"
				:noStyle="true"
				style="width: 100%; height: 100% !important; object-fit: contain;"
			/>
		</div>
	</div>
	<div :class="$style.tail">
		<header :class="$style.header">
			<span v-if="notification.type === 'system'" :class="$style.systemLabel">{{ i18n.ts.system }}</span>
			<span v-else-if="notification.type === 'pollEnded'">{{ i18n.ts._notification.pollEnded }}</span>
			<span v-else-if="notification.type === 'scheduledNotePosted'">{{ i18n.ts._notification.scheduledNotePosted }}</span>
			<span v-else-if="notification.type === 'scheduledNotePostFailed'">{{ i18n.ts._notification.scheduledNotePostFailed }}</span>
			<span v-else-if="notification.type === 'note'">{{ i18n.ts._notification.newNote }}: <MkUserName :user="notification.note.user"/></span>
			<span v-else-if="notification.type === 'roleAssigned'">{{ i18n.ts._notification.roleAssigned }}</span>
			<span v-else-if="notification.type === 'chatRoomInvitationReceived'" :class="$style.chatNotificationLabel">{{ i18n.ts._notification.chatRoomInvitationReceived }}</span>
			<span v-else-if="notification.type === 'achievementEarned'">{{ i18n.ts._notification.achievementEarned }}</span>
			<span v-else-if="notification.type === 'login'">{{ i18n.ts._notification.login }}</span>
			<span v-else-if="notification.type === 'createToken'">{{ i18n.ts._notification.createToken }}</span>
			<span v-else-if="notification.type === 'test'">{{ i18n.ts._notification.testNotification }}</span>
			<span v-else-if="notification.type === 'exportCompleted'">{{ i18n.tsx._notification.exportOfXCompleted({ x: exportEntityName[notification.exportedEntity] }) }}</span>
			<span v-else-if="notification.type === 'chatRoomMemberRemoved'" :class="$style.chatNotificationLabel">{{ i18n.ts._notification.chatRoomMemberRemoved }}</span>
			<MkA v-else-if="notification.type === 'follow' || notification.type === 'mention' || notification.type === 'reply' || notification.type === 'renote' || notification.type === 'quote' || notification.type === 'reaction' || notification.type === 'receiveFollowRequest' || notification.type === 'followRequestAccepted'" v-user-preview="notification.user.id" :class="$style.headerName" :to="userPage(notification.user)"><MkUserName :user="notification.user"/></MkA>
			<span v-if="notificationAction" :class="$style.headerAction">{{ notificationAction }}</span>
			<span v-else-if="notification.type === 'reaction:grouped' && notification.note.reactionAcceptance === 'likeOnly'">{{ i18n.tsx._notification.likedBySomeUsers({ n: getActualReactedUsersCount(notification) }) }}</span>
			<span v-else-if="notification.type === 'reaction:grouped'">{{ i18n.tsx._notification.reactedBySomeUsers({ n: getActualReactedUsersCount(notification) }) }}</span>
			<span v-else-if="notification.type === 'renote:grouped'">{{ i18n.tsx._notification.renotedBySomeUsers({ n: notification.users.length }) }}</span>
			<span v-else-if="notification.type === 'app'">{{ notification.header }}</span>
			<MkTime v-if="withTime" :time="notification.createdAt" :class="$style.headerTime"/>
		</header>
		<div>
			<div v-if="notification.type === 'system' && notification.message === 'welcome'" :class="$style.welcome">
				<strong>{{ i18n.ts._welcome.title }}</strong>
				<template v-if="full">
					<p>{{ i18n.tsx._welcome.greeting({ name: instance.name ?? host }) }}</p>
					<p style="color: var(--MI_THEME-fgTransparentWeak);">{{ i18n.ts._welcome.introduction }}</p>
					<div class="_gaps_s" :class="$style.welcomeLinks">
						<MkA class="_link" to="/about"><i class="ti ti-checkup-list" aria-hidden="true"></i> {{ i18n.ts.serverRules }}</MkA>
						<a class="_link" href="https://misskey-hub.net/docs/for-users/" target="_blank" rel="noopener noreferrer"><i class="ti ti-book" aria-hidden="true"></i> {{ i18n.ts._welcome.userGuide }}</a>
						<MkA class="_link" to="/contact"><i class="ti ti-help-circle" aria-hidden="true"></i> {{ i18n.ts.help }}</MkA>
					</div>
					<footer :class="$style.systemNote">
						<div>{{ i18n.ts.system }}</div>
						<small>{{ i18n.ts._welcome.systemNote }}</small>
					</footer>
				</template>
				<template v-else>
					<p>{{ i18n.ts._welcome.notificationBody }}</p>
					<MkA class="_link" to="/my/notifications/system">{{ i18n.ts._welcome.readGuide }} <i class="ti ti-arrow-right" aria-hidden="true"></i></MkA>
				</template>
			</div>
			<div v-else-if="notification.type === 'reaction' || notification.type === 'reaction:grouped'" :class="$style.messageQuote" :title="getNoteSummary(notification.note)">
				<i class="ti ti-quote" :class="$style.messageQuoteIcon" aria-hidden="true"></i>
				<div :class="$style.messageQuoteText"><Mfm :text="getNoteSummary(notification.note)" :plain="true" :nowrap="true" :author="notification.note.user"/></div>
			</div>
			<div v-else-if="notification.type === 'renote' || notification.type === 'renote:grouped'" :class="$style.messageQuote" :title="getNoteSummary(notification.note.renote)">
				<i class="ti ti-quote" :class="$style.messageQuoteIcon" aria-hidden="true"></i>
				<div :class="$style.messageQuoteText"><Mfm :text="getNoteSummary(notification.note.renote)" :plain="true" :nowrap="true" :author="notification.note.renote?.user"/></div>
			</div>
			<template v-else-if="notification.type === 'reply'">
				<div v-if="notification.note.reply" :class="$style.replyQuote">
					<i class="ti ti-quote" :class="$style.messageQuoteIcon" aria-hidden="true"></i>
					<span :class="$style.replyQuoteAuthor"><MkUserName :user="notification.note.reply.user"/>：</span>
					<span :class="$style.replyQuoteText"><Mfm :text="getReplyQuoteText(notification.note.reply)" :plain="true" :nowrap="true" :author="notification.note.reply.user"/></span>
				</div>
				<div :class="[$style.text, $style.replyContent]" :title="getNoteSummary(notification.note, { showReply: false })">
					<Mfm :text="getNoteSummary(notification.note, { showReply: false })" :plain="true" :nowrap="true" :author="notification.note.user"/>
				</div>
			</template>
			<template v-else-if="notification.type === 'mention' || notification.type === 'quote' || notification.type === 'note'">
				<div :class="$style.contentCard" :title="getNoteSummary(notification.note)">
					<div :class="$style.contentText"><Mfm :text="getNoteSummary(notification.note, { showRenote: notification.type !== 'quote' })" :plain="true" :nowrap="false" :author="notification.note.user"/></div>
				</div>
				<div v-if="notification.type === 'quote' && notification.note.renote" :class="$style.messageQuote" :title="getNoteSummary(notification.note.renote)">
					<i class="ti ti-quote" :class="$style.messageQuoteIcon" aria-hidden="true"></i>
					<div :class="$style.messageQuoteText"><Mfm :text="getNoteSummary(notification.note.renote, { showReply: false, showRenote: false })" :plain="true" :nowrap="true" :author="notification.note.renote.user"/></div>
				</div>
			</template>
			<div v-else-if="notification.type === 'pollEnded' || notification.type === 'scheduledNotePosted'" :class="$style.messageQuote" :title="getNoteSummary(notification.note)">
				<i class="ti ti-quote" :class="$style.messageQuoteIcon" aria-hidden="true"></i>
				<div :class="$style.messageQuoteText"><Mfm :text="getNoteSummary(notification.note)" :plain="true" :nowrap="true" :author="notification.note.user"/></div>
			</div>
			<div v-else-if="notification.type === 'roleAssigned'" :class="[$style.text, $style.result]">
				<Mfm :text="notification.role.name" :plain="true" :nowrap="true"/>
			</div>
			<div v-else-if="notification.type === 'chatRoomInvitationReceived'" :class="$style.chatInvitation">
				<div :class="$style.chatRoomContext">
					<div :class="$style.chatRoomSymbol" aria-hidden="true"><i class="ti ti-users-group"></i></div>
					<div :class="$style.chatRoomDetails">
						<span :class="$style.chatRoomEyebrow">{{ i18n.ts._chat.roomChat }}</span>
						<Mfm :class="$style.chatRoomName" :text="notification.invitation.room.name" :plain="true" :nowrap="true"/>
						<Mfm v-if="notification.invitation.room.description" :class="$style.chatRoomDescription" :text="notification.invitation.room.description" :plain="true" :author="notification.invitation.room.owner"/>
					</div>
				</div>
				<div v-if="full" :class="$style.invitationFooter">
					<div v-if="invitationActionState === 'idle'" :class="$style.invitationCommands">
						<MkButton small rounded primary :wait="invitationActionPending === 'accept'" :disabled="invitationActionPending != null" @click="handleChatRoomInvitation('accept')">
							<i class="ti ti-check" aria-hidden="true"></i> {{ i18n.ts._chat.join }}
						</MkButton>
						<MkButton small rounded :wait="invitationActionPending === 'ignore'" :disabled="invitationActionPending != null" @click="handleChatRoomInvitation('ignore')">
							<i class="ti ti-x" aria-hidden="true"></i> {{ i18n.ts._chat.ignore }}
						</MkButton>
					</div>
					<div :class="$style.invitationResult">
						<!-- 状态区常驻，处理结果变化时读屏才能播报 -->
						<span role="status" aria-live="polite" :class="$style.invitationStatus">{{ invitationStatusText }}</span>
						<MkA v-if="invitationActionState === 'joined'" :class="$style.notificationAction" :to="`/chat/room/${notification.invitation.room.id}`">
							{{ i18n.ts._chat.enterRoom }}
							<i class="ti ti-arrow-right" aria-hidden="true"></i>
						</MkA>
					</div>
				</div>
				<MkA v-else :class="$style.notificationAction" to="/chat/invitations">
					{{ i18n.ts._chat.invitations }}
					<i class="ti ti-arrow-right" aria-hidden="true"></i>
				</MkA>
			</div>
			<div v-else-if="notification.type === 'chatRoomMemberRemoved'" :class="$style.text">
				<div :class="$style.chatRoomContext">
					<div :class="$style.chatRoomSymbol" aria-hidden="true"><i class="ti ti-users-group"></i></div>
					<Mfm :class="$style.chatRoomName" :text="notification.roomName" :plain="true" :nowrap="true"/>
				</div>
			</div>
			<MkA v-else-if="notification.type === 'achievementEarned'" :class="$style.text" to="/my/achievements">
				{{ i18n.ts._achievements._types[`_${notification.achievement}`].title }}
			</MkA>
			<MkA v-else-if="notification.type === 'exportCompleted'" :class="[$style.text, $style.result]" :to="`/my/drive/file/${notification.fileId}`">
				{{ i18n.ts.showFile }}
			</MkA>
			<MkA v-else-if="isSigninAlert(notification)" :class="[$style.text, $style.result]" to="/settings/security">
				{{ formatSigninAlertSummary(notification) }}
			</MkA>
			<MkA v-else-if="notification.type === 'createToken'" :class="$style.text" to="/settings/apps">
				<Mfm :text="i18n.tsx._notification.createTokenDescription({ text: i18n.ts.manageAccessTokens })"/>
			</MkA>
			<template v-else-if="notification.type === 'followRequestAccepted'">
				<div :class="$style.status">{{ i18n.ts.followRequestAccepted }}</div>
				<div v-if="notification.message" :class="$style.messageQuote">
					<i class="ti ti-quote" :class="$style.messageQuoteIcon" aria-hidden="true"></i>
					<div :class="$style.messageQuoteText"><Mfm :text="notification.message" :author="notification.user" :plain="true" :nowrap="true"/></div>
				</div>
			</template>
			<template v-else-if="notification.type === 'receiveFollowRequest'">
				<span :class="$style.status">{{ i18n.ts.receiveFollowRequest }}</span>
				<div v-if="full && !followRequestDone" :class="$style.followRequestCommands">
					<MkButton :class="$style.followRequestCommandButton" rounded primary @click="acceptFollowRequest()"><i class="ti ti-check"></i> {{ i18n.ts.accept }}</MkButton>
					<MkButton :class="$style.followRequestCommandButton" rounded danger @click="rejectFollowRequest()"><i class="ti ti-x"></i> {{ i18n.ts.reject }}</MkButton>
				</div>
			</template>
			<span v-else-if="notification.type === 'test'" :class="$style.text">{{ i18n.ts._notification.notificationWillBeDisplayedLikeThis }}</span>
			<span v-else-if="notification.type === 'app'" :class="$style.text">
				<Mfm :text="notification.body" :nowrap="false"/>
			</span>

			<div v-if="notification.type === 'reaction:grouped'">
				<div v-for="reaction of notification.reactions" :key="reaction.user.id + reaction.reaction" :class="[$style.reactionsItem, $style.reactionResponseItem]">
					<MkAvatar :class="$style.reactionsItemAvatar" :user="reaction.user" link preview imageOnly/>
					<div :class="$style.reactionsItemReaction">
						<MkReactionIcon
							:withTooltip="true"
							:reaction="reaction.reaction.replace(/^:(\w+):$/, ':$1@.:')"
							:noStyle="true"
							style="width: 100%; height: 100% !important; object-fit: contain;"
						/>
					</div>
				</div>
			</div>
			<div v-else-if="notification.type === 'renote:grouped'">
				<div v-for="user of notification.users" :key="user.id" :class="$style.reactionsItem">
					<MkAvatar :class="$style.reactionsItemAvatar" :user="user" link preview imageOnly/>
				</div>
			</div>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { host } from '@@/js/config.js';
import MkReactionIcon from '@/components/MkReactionIcon.vue';
import MkButton from '@/components/MkButton.vue';
import { getNoteSummary } from '@/utility/get-note-summary.js';
import { formatSigninAlertSummary, isSigninAlert } from '@/utility/signin-alert.js';
import { userPage } from '@@/js/user.js';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { isAccountSessionErrorHandled } from '@/utility/account-session-error.js';
import { getChatRoomJoinErrorMessage, isChatInvitationGoneError } from '@/utility/misskey-api-with-toast.js';
import * as os from '@/os.js';
import { useRouter } from '@/router.js';
import { ensureSignin } from '@/i.js';
import { instance } from '@/instance.js';
import { prefer } from '@/preferences.js';

const $i = ensureSignin();

const props = withDefaults(defineProps<{
	notification: Misskey.entities.Notification;
	withTime?: boolean;
	full?: boolean;
	contentVisibilityAuto?: boolean;
}>(), {
	withTime: false,
	full: false,
	contentVisibilityAuto: true,
});

const router = useRouter();

type ExportCompletedNotification = Misskey.entities.Notification & { type: 'exportCompleted' };

const notificationAction = computed<string | null>(() => {
	switch (props.notification.type) {
		case 'follow': return i18n.ts._notification.youWereFollowed;
		case 'reply': return i18n.ts._notification.repliedToYou;
		case 'mention': return i18n.ts._notification.mentionedYou;
		case 'quote': return i18n.ts._notification.quotedYou;
		case 'renote': return i18n.ts._notification.renotedYou;
		case 'reaction': return i18n.ts._notification.reactedToYou;
		default: return null;
	}
});

const exportEntityName = {
	antenna: i18n.ts.antennas,
	blocking: i18n.ts.blockedUsers,
	clip: i18n.ts.clips,
	customEmoji: i18n.ts.customEmojis,
	favorite: i18n.ts.favorites,
	following: i18n.ts.following,
	muting: i18n.ts.mutedUsers,
	note: i18n.ts.notes,
	userList: i18n.ts.lists,
} as const satisfies Record<ExportCompletedNotification['exportedEntity'], string>;

const followRequestDone = ref(false);
const invitationActionState = ref<'idle' | 'joined' | 'ignored' | 'expired'>('idle');
const invitationActionPending = ref<'accept' | 'ignore' | null>(null);
let invitationRevision = 0;
const invitationStatusText = computed(() => {
	switch (invitationActionState.value) {
		case 'joined': return i18n.ts._chat.roomJoined;
		case 'ignored': return i18n.ts._chat.invitationIgnored;
		case 'expired': return i18n.ts._chat.invitationExpired;
		default: return '';
	}
});

watch(() => props.notification.id, () => {
	invitationRevision++;
	invitationActionState.value = 'idle';
	invitationActionPending.value = null;
});
onBeforeUnmount(() => { invitationRevision++; });

// 按钮隐藏即为成功反馈；失败时恢复按钮并提示
function onFollowRequestError(error: unknown) {
	followRequestDone.value = false;
	if (!isAccountSessionErrorHandled(error)) os.toast(i18n.ts.somethingHappened, 'error');
}

const acceptFollowRequest = () => {
	if (!('user' in props.notification)) return;
	followRequestDone.value = true;
	misskeyApi('following/requests/accept', { userId: props.notification.user.id }).catch(onFollowRequestError);
};

const rejectFollowRequest = () => {
	if (!('user' in props.notification)) return;
	followRequestDone.value = true;
	misskeyApi('following/requests/reject', { userId: props.notification.user.id }).catch(onFollowRequestError);
};

async function handleChatRoomInvitation(action: 'accept' | 'ignore') {
	if (props.notification.type !== 'chatRoomInvitationReceived' || invitationActionPending.value != null || invitationActionState.value !== 'idle') return;
	const roomId = props.notification.invitation.room.id;
	const revision = invitationRevision;
	const originPath = router.currentRef.value._parsedRoute.fullPath;
	invitationActionPending.value = action;
	try {
		await misskeyApi(action === 'accept' ? 'chat/rooms/join' : 'chat/rooms/invitations/ignore', { roomId });
		if (revision !== invitationRevision) return;
		invitationActionState.value = action === 'accept' ? 'joined' : 'ignored';
	} catch (error) {
		if (revision === invitationRevision) onChatRoomInvitationError(error);
		return;
	} finally {
		if (revision === invitationRevision) invitationActionPending.value = null;
	}
	// 用户已切换页面时只更新处理结果，不用迟到的请求抢回导航。
	if (action === 'accept' && router.currentRef.value._parsedRoute.fullPath === originPath) {
		router.push('/chat/room/:roomId', { params: { roomId } });
	}
}

// 邀请已失效时收起按钮，避免反复点击；其他错误保留按钮以便重试
function onChatRoomInvitationError(error: unknown) {
	if (isChatInvitationGoneError(error)) invitationActionState.value = 'expired';
	if (!isAccountSessionErrorHandled(error)) os.toast(getChatRoomJoinErrorMessage(error), 'error');
}

function getActualReactedUsersCount(notification: Misskey.entities.Notification) {
	if (notification.type !== 'reaction:grouped') return 0;
	return new Set(notification.reactions.map((reaction) => reaction.user.id)).size;
}

function getReplyQuoteText(note: Misskey.entities.Note): string {
	if (note.isDeleted) return i18n.ts.deletedComment;
	if (note.isHidden) return i18n.ts.invisibleNote;
	return note.cw ?? note.text ?? '';
}
</script>

<style lang="scss" module>
.root {
	position: relative;
	box-sizing: border-box;
	padding: var(--MI-cardPadding);
	font-size: 0.9em;
	overflow-wrap: break-word;
	display: flex;
	contain: content;

	&.contentVisibilityAuto {
		content-visibility: auto;
		contain-intrinsic-size: 0 100px;
	}

	--eventFollow: #36aed2;
	--eventRenote: #36d298;
	--eventReply: #007aff;
	--eventReactionHeart: var(--MI_THEME-love);
	--eventReaction: #e99a0b;
	--eventAchievement: #cb9a11;
	--eventLogin: #007aff;
	--eventOther: #88a6b7;
}

.head {
	position: relative;
	flex-shrink: 0;
	width: 42px;
	height: 42px;
	margin-right: 8px;

	&.useSticky {
		position: sticky;
		top: 0;
	}
}

.icon {
	display: block;
	width: 100%;
	height: 100%;
}

.avatarIcon {
	width: 40px;
	height: 40px;
}

.icon_reactionGroup,
.icon_reactionGroupHeart,
.icon_renoteGroup {
	display: grid;
	align-items: center;
	justify-items: center;
	width: 40px;
	height: 40px;
	font-size: 15px;
	border-radius: 100%;
	color: #fff;
}

.icon_reactionGroup {
	background: var(--eventReaction);
}

.icon_reactionGroupHeart {
	background: var(--eventReactionHeart);
}

.icon_renoteGroup {
	background: var(--eventRenote);
}

.icon_app {
	border-radius: 6px;
}

.systemIcon {
	display: grid;
	place-items: center;
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	font-size: 24px;
}

.systemLabel {
	color: var(--MI_THEME-accent);
	font-weight: bold;
}

.welcome {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: var(--MI-marginHalf);
	margin-top: var(--MI-marginHalf);
	line-height: 1.6;

	> p {
		margin: 0;
	}
}

.systemNote {
	width: 100%;
	padding-top: var(--MI-marginHalf);
	border-top: var(--MI-divider);
	color: var(--MI_THEME-fgTransparent);
}

.welcomeLinks {
	margin-block: var(--MI-marginHalf);
}

.subIcon {
	position: absolute;
	z-index: 1;
	bottom: -2px;
	right: -2px;
	width: 20px;
	height: 20px;
	line-height: 20px;
	box-sizing: border-box;
	border-radius: 100%;
	background: var(--MI_THEME-panel);
	box-shadow: 0 0 0 2px var(--MI_THEME-panel);
	font-size: 11px;
	text-align: center;
	color: #fff;

	&:empty {
		display: none;
	}
}

.t_follow, .t_followRequestAccepted, .t_receiveFollowRequest {
	background: var(--eventFollow);
	pointer-events: none;
}

.t_renote {
	background: var(--eventRenote);
	pointer-events: none;
}

.t_quote {
	background: var(--eventRenote);
	pointer-events: none;
}

.t_reply {
	background: var(--eventReply);
	pointer-events: none;
}

.t_mention {
	background: var(--eventOther);
	pointer-events: none;
}

.t_pollEnded {
	background: var(--eventOther);
	pointer-events: none;
}

.t_scheduledNotePosted {
	background: var(--eventOther);
	pointer-events: none;
}

.t_scheduledNotePostFailed {
	background: var(--eventOther);
	pointer-events: none;
}

.t_achievementEarned {
	background: var(--eventAchievement);
	pointer-events: none;
}

.t_exportCompleted {
	background: var(--eventOther);
	pointer-events: none;
}

.t_roleAssigned {
	background: var(--eventOther);
	pointer-events: none;
}

.t_login {
	background: var(--eventLogin);
	pointer-events: none;
}

.t_createToken {
	background: var(--eventOther);
	pointer-events: none;
}

.t_chatRoomInvitationReceived {
	background: var(--eventOther);
	pointer-events: none;
}

.t_chatRoomMemberRemoved {
	background: var(--eventOther);
	pointer-events: none;
}

.tail {
	flex: 1;
	min-width: 0;
}

.header {
	display: flex;
	align-items: baseline;
	white-space: nowrap;
}

.headerName {
	text-overflow: ellipsis;
	white-space: nowrap;
	min-width: 0;
	overflow: hidden;
}

.headerAction {
	flex-shrink: 0;
	margin-left: 4px;
	color: var(--MI_THEME-accent);
	font-weight: 600;
}

.headerTime {
	margin-left: auto;
	padding-left: 8px;
	font-size: 0.9em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.text {
	display: flex;
	width: 100%;
	overflow: clip;
}

.status {
	display: block;
	margin-top: 2px;
	color: var(--MI_THEME-fgTransparentWeak);
	line-height: 1.55;
}

.result {
	margin-top: 2px;
	color: var(--MI_THEME-accent);
	font-weight: 600;
	line-height: 1.5;
}

.contentCard {
	margin-top: 6px;
	padding: 9px 12px;
	border-radius: 8px;
	background: var(--MI_THEME-panelHighlight);
	color: var(--MI_THEME-fg);
	line-height: 1.65;
	overflow-wrap: anywhere;
}

.contentText {
	display: -webkit-box;
	overflow: hidden;
	white-space: pre-wrap;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 3;
}

.messageQuote {
	display: flex;
	align-items: flex-start;
	gap: 8px;
	min-width: 0;
	margin-top: 6px;
	padding: 8px 10px;
	border-left: 2px solid color-mix(in srgb, var(--MI_THEME-accent) 45%, transparent);
	border-radius: 0 6px 6px 0;
	background: var(--MI_THEME-panelHighlight);
	color: var(--MI_THEME-fgTransparentWeak);
	line-height: 1.55;
	overflow-wrap: anywhere;
}

.messageQuoteIcon {
	flex-shrink: 0;
	margin-top: 2px;
	color: var(--MI_THEME-accent);
	font-size: 12px;
}

.messageQuoteText {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.replyQuote {
	display: flex;
	align-items: center;
	gap: 6px;
	min-width: 0;
	margin-top: 4px;
	padding: 6px 10px;
	border-left: 2px solid color-mix(in srgb, var(--MI_THEME-accent) 45%, transparent);
	border-radius: 0 6px 6px 0;
	background: var(--MI_THEME-panelHighlight);
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.95em;
}

.replyQuoteAuthor {
	flex-shrink: 0;
	white-space: nowrap;
}

.replyQuoteText {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.replyContent {
	margin-top: 6px;
	line-height: 1.6;
}

.chatRoomNotification {
	align-items: flex-start;

	.head {
		margin-top: 2px;
	}

	.header {
		align-items: center;
		min-height: 22px;
	}

	.text {
		display: block;
		overflow: visible;
	}
}

.chatInvitation {
	display: flex;
	flex-direction: column;
	gap: 12px;
	width: 100%;
	min-width: 0;
}

.chatNotificationLabel {
	color: var(--MI_THEME-accent);
	font-weight: 600;
}

.chatRoomContext {
	display: flex;
	align-items: center;
	gap: 10px;
	width: 100%;
	max-width: 100%;
	min-width: 0;
	box-sizing: border-box;
	padding: 10px 12px;
	border: var(--MI-divider);
	border-radius: var(--MI-radius);
	background: color-mix(in srgb, var(--MI_THEME-accentedBg) 45%, var(--MI_THEME-panel));
	color: var(--MI_THEME-fg);
}

.chatRoomSymbol {
	display: grid;
	flex: 0 0 36px;
	place-items: center;
	width: 36px;
	height: 36px;
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	font-size: 18px;
}

.chatRoomDetails {
	display: flex;
	flex: 1;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
}

.chatRoomEyebrow {
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.78em;
	line-height: 1.2;
}

.chatRoomName {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	font-size: 1.05em;
	font-weight: 600;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.chatRoomDescription {
	display: -webkit-box;
	max-height: 2.9em;
	overflow: hidden;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.88em;
	line-height: 1.45;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
}

.invitationFooter {
	display: flex;
	flex-direction: column;
	width: 100%;
	min-width: 0;
}

.invitationCommands {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
	width: 100%;

	> * {
		min-width: 0;
		width: 100%;
	}
}

.invitationResult {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 4px 12px;
	min-width: 0;
}

.invitationStatus {
	color: var(--MI_THEME-fgTransparentWeak);
}

.notificationAction {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	align-self: flex-start;
	padding: 6px 0;
	color: var(--MI_THEME-accent);
	font-size: 0.9em;
}

.followRequestCommands {
	display: flex;
	gap: 8px;
	max-width: 300px;
	margin-top: 8px;
}
.followRequestCommandButton {
	flex: 1;
}

.reactionsItem {
	display: inline-block;
	position: relative;
	width: 38px;
	height: 38px;
	margin-top: 8px;
	margin-right: 8px;
}

.reactionsItemAvatar {
	width: 100%;
	height: 100%;
}

.reactionResponseItem {
	width: 28px;
	height: 28px;
}

.reactionResponseItem .reactionsItemReaction {
	width: 16px;
	height: 16px;
	background: transparent;
	box-shadow: none;
	font-size: 9px;
}

.reactionsItemReaction {
	position: absolute;
	z-index: 1;
	bottom: -2px;
	right: -2px;
	width: 20px;
	height: 20px;
	box-sizing: border-box;
	border-radius: 100%;
	background: var(--MI_THEME-panel);
	box-shadow: 0 0 0 2px var(--MI_THEME-panel);
	font-size: 11px;
	text-align: center;
	color: #fff;
}

@container (max-width: 600px) {
	.root {
		font-size: 0.9em;
	}
}

@container (max-width: 500px) {
	.root {
		font-size: 0.85em;
	}
}
</style>
