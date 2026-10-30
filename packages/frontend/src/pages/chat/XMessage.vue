<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-if="!deleted" ref="rootEl" :class="[$style.root, { [$style.isMe]: isMe && !message.systemEvent, [$style.poke]: message.isPoke || message.systemEvent }]" :data-chat-message-id="message.id" tabindex="-1">
	<template v-if="message.systemEvent">
		<span :class="$style.systemMessage" data-target-highlight-surface>
			<template v-if="message.systemEvent.invited">
				<span v-if="isMe">{{ i18n.ts.you }}</span>
				<MkA v-else :to="userPage(message.fromUser!)" :class="$style.systemUserLink"><MkUserName :user="message.fromUser!" :class="$style.systemUserName"/></MkA>
				<span>{{ i18n.ts._chat.invitedMembers }}</span>
			</template>
			<template v-for="joinedUser in message.systemEvent.users" :key="joinedUser.id">
				<MkA :to="userPage(joinedUser)" :class="$style.systemUserLink"><MkUserName :user="joinedUser" :class="$style.systemUserName"/></MkA>
			</template>
			<span>{{ i18n.ts._chat.membersJoined }}</span>
		</span>
	</template>
	<template v-else-if="message.isPoke">
		<span :class="[$style.pokeMessage, { [$style.pokeOwn]: isMe }]">
			<span :class="$style.pokeContent" data-target-highlight-surface>
				<span v-if="isMe" :class="$style.pokeSender">{{ i18n.ts.you }}</span>
				<MkUserName v-else-if="message.fromUser" :user="message.fromUser" :class="$style.pokeSender" :nowrap="false"/>
				<span :class="[$style.pokeHand, { [$style.pokeAnimated]: prefer.s.animation }]" aria-hidden="true"><MkEmoji :emoji="'\u{1f449}\u{1f3fb}'" noTooltip ignoreMuted/></span>
				<span :class="$style.pokeAction">{{ i18n.ts._chat.poked }}</span>
				<MkA v-if="message.pokeUser" :to="userPage(message.pokeUser)" :class="$style.pokeTarget" :title="message.pokeUser.name || message.pokeUser.username"><span v-if="message.pokeUser.id === $i.id">{{ i18n.ts.you }}</span><MkUserName v-else :user="message.pokeUser" :nowrap="false"/></MkA>
			</span>
			<button v-if="isMe" type="button" class="_textButton" :class="$style.pokeWithdraw" :disabled="deleting" @click="deleteMessage">{{ i18n.ts._chat.withdrawPoke }}</button>
		</span>
	</template>
	<template v-else>
	<MkAvatar :class="$style.avatar" :user="message.fromUser!" :link="!isMe" :preview="false" @contextmenu.prevent.stop="onAvatarContextmenu"/>
	<div :class="[$style.body, { [$style.withMedia]: message.file != null }]">
		<div :class="$style.header">
			<span v-if="prefer.s['chat.showSenderName'] && message.fromUser != null" :class="$style.sender">
				<span v-if="roomRole === 'owner'" :class="$style.roleTag">{{ i18n.ts._chat.roomOwner }}</span>
				<span v-else-if="roomRole === 'administrator'" :class="$style.roleTag">{{ i18n.ts._chat.roomAdministrator }}</span>
				<Mfm v-if="nickname" :text="nickname" :plain="true" :nowrap="true" :author="message.fromUser" :class="$style.senderName"/>
				<MkUserName v-else :user="message.fromUser" :class="$style.senderName"/>
			</span>
			<span v-if="message.editedAt" :class="$style.edited">{{ i18n.ts._chat.edited }}</span>
			<time :class="$style.time" :datetime="message.createdAt" :title="messageDate">{{ messageTime }}</time>
		</div>
		<div ref="bubbleEl" :class="$style.bubble" data-chat-bubble data-target-highlight-surface tabindex="0" :aria-label="i18n.ts.more" @contextmenu.stop="onContextmenu" @keydown="onBubbleKeydown" @pointerdown="startLongPress" @pointermove="moveLongPress" @pointerup="cancelLongPress" @pointercancel="cancelLongPress" @click.capture="suppressLongPressClick">
			<button v-if="message.replyType" type="button" class="_button" :class="[$style.reply, { [$style.quote]: message.replyType === 'quote' }]" data-chat-reply :disabled="!message.reply" :aria-label="i18n.ts._chat.originalMessage" @click.stop="showReply">
				<template v-if="message.reply">
					<span :class="$style.replyHeader">
						<i :class="[message.replyType === 'quote' ? 'ti ti-quote' : 'ti ti-arrow-back-up', $style.replyIcon]" aria-hidden="true"></i>
						<MkUserName :user="message.reply.fromUser" :class="$style.replyName"/>
					</span>
					<span :class="$style.replyContent"><Mfm :text="replyPreviewText" :plain="true" :nowrap="true" :author="message.reply.fromUser"/></span>
				</template>
				<span v-else :class="$style.replyContent">{{ i18n.ts._chat.messageUnavailable }}</span>
			</button>
			<Mfm
				v-if="message.text"
				:class="$style.text"
				class="_selectable"
				:text="message.text"
				:author="message.fromUser"
				:nyaize="'respect'"
				:enableEmojiMenu="true"
				:enableEmojiMenuReaction="true"
			/>
			<MkMediaList v-if="message.file" :mediaList="[message.file]" :user="message.fromUser"/>
			<MkRedPacket v-if="message.redPacket" :redPacketId="message.redPacket.id" :authorId="message.fromUserId" :redPacket="message.redPacket" :author="message.fromUser"/>
		</div>
		<div v-for="url in urls" :key="url" :class="$style.urlPreview"><MkUrlPreview :url="url"/></div>
		<p v-for="claim in message.redPacketClaims" :key="claim.redPacketId" :class="$style.claimNotice" role="status"><i class="mi-red-packet" aria-hidden="true"></i> {{ i18n.tsx._redPacket.passwordReceived({ coins: claim.coins.toFixed(2) }) }}</p>
		<div v-if="('isAutoReply' in message && message.isAutoReply) || isSearchResult" :class="$style.footer">
			<span v-if="'isAutoReply' in message && message.isAutoReply" :class="$style.autoReply">{{ i18n.ts._onlineStatus.autoReply }}</span>
			<MkA v-if="isSearchResult && 'toRoom' in message && message.toRoom != null" :to="`/chat/room/${message.toRoomId}`"><Mfm :text="message.toRoom.name" :plain="true" :nowrap="true"/></MkA>
			<MkA v-if="isSearchResult && 'toUser' in message && message.toUser != null && isMe" :to="`/chat/user/${message.toUserId}`">@{{ message.toUser.username }}</MkA>
		</div>
		<MkReactionList v-if="reactionGroups.length > 0" :canAdd="!isMe && $i.policies.chatAvailability === 'available'" :addDisabled="reacting" @add="react">
			<MkReactionChip
				v-for="group in reactionGroups"
				:key="group.reaction"
				:reaction="group.reaction"
				:users="group.users"
				:count="group.users.length"
				:isMine="group.users.some(user => user.id === $i.id)"
				:disabled="isMe || reacting || $i.policies.chatAvailability !== 'available'"
				:displaySize="prefer.s.reactionsDisplaySize"
				:limitWidth="prefer.s.limitWidthOfReaction"
				@toggle="onReactionClick(group.reaction, $event)"
			/>
		</MkReactionList>
	</div>
	</template>
</div>
</template>

<script lang="ts" setup>
import { computed, inject, nextTick, onBeforeUnmount, provide, ref, useTemplateRef } from 'vue';
import type { Ref } from 'vue';
import * as mfm from 'mfm-js';
import * as Misskey from 'misskey-js';
import { isLink } from '@@/js/is-link.js';
import { dateTimeFormat } from '@@/js/intl-const.js';
import type { MenuItem } from '@/types/menu.js';
import type { NormalizedChatMessage } from './room.vue';
import type { ChatComposeAction } from './composer.js';
import type { ChatMember } from './member-menu.js';
import { toSingleLine } from './composer.js';
import MkReactionChip from '@/components/MkReactionChip.vue';
import MkReactionList from '@/components/MkReactionList.vue';
import { extractUrlFromMfm } from '@/utility/extract-url-from-mfm.js';
import MkUrlPreview from '@/components/MkUrlPreview.vue';
import { ensureSignin } from '@/i.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import MkMediaList from '@/components/MkMediaList.vue';
import MkRedPacket from '@/components/MkRedPacket.vue';
import MkEmoji from '@/components/global/MkEmoji.vue';
import { reactionPicker } from '@/utility/reaction-picker.js';
import * as sound from '@/utility/sound.js';
import { prefer } from '@/preferences.js';
import { DI } from '@/di.js';
import { getHTMLElementOrNull } from '@/utility/get-dom-node-or-null.js';
import { normalizeReaction, REACTION_KIND_LIMIT } from '@/utility/normalize-reaction.js';
import { animateReactionRemoval, playReactionEffect } from '@/utility/reaction-effect.js';
import { getAbuseReportMenu } from '@/utility/abuse-report.js';
import { userPage } from '@@/js/user.js';
import { useRouter } from '@/router.js';
import { deviceKind } from '@/utility/device-kind.js';

const $i = ensureSignin();
const router = useRouter();
const mobileLayout = inject<Readonly<Ref<boolean>>>('chatMobileLayout', computed(() => deviceKind === 'smartphone' || window.innerWidth <= 500));

const props = defineProps<{
	message: NormalizedChatMessage | Misskey.entities.ChatMessage;
	nickname?: string;
	memberMenu?: boolean;
	roomRole?: ChatMember['role'];
	isSearchResult?: boolean;
	canEdit?: boolean;
	canCompose?: boolean;
	silenced?: boolean;
	liveSync?: boolean;
}>();

const emit = defineEmits<{
	(ev: 'edit', message: NormalizedChatMessage | Misskey.entities.ChatMessage): void;
	(ev: 'compose', action: ChatComposeAction, message: NormalizedChatMessage | Misskey.entities.ChatMessage): void;
	(ev: 'showReply', id: string): void;
	(ev: 'poke', userId: string): void;
	(ev: 'avatarMenu', event: PointerEvent, userId: string): void;
	(ev: 'deleted', id: string): void;
}>();

const bubbleEl = useTemplateRef('bubbleEl');
const rootEl = useTemplateRef('rootEl');
const reacting = ref(false);
const deleting = ref(false);
const deleted = ref(false);
const lifecycleController = new AbortController();
const reactionAnimations = new Set<Animation>();
const isMe = computed(() => props.message.fromUserId === $i.id);
const messageDate = computed(() => dateTimeFormat.format(new Date(props.message.createdAt)));
const messageTime = computed(() => {
	const date = new Date(props.message.createdAt);
	return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
});
const urls = computed(() => props.message.text ? extractUrlFromMfm(mfm.parse(props.message.text)) : []);
// 引用/回复预览固定单行：换行压成空格，超长交给省略号
const replyPreviewText = computed(() => {
	const reply = props.message.reply;
	if (!reply) return i18n.ts._chat.messageUnavailable;
	return toSingleLine(reply.text || reply.fileName || (reply.hasRedPacket ? i18n.ts._redPacket.title : i18n.ts._chat.messageUnavailable));
});
const reactionGroups = computed(() => {
	const groups = new Map<string, { reaction: string; users: Misskey.entities.UserLite[] }>();
	for (const record of props.message.reactions) {
		const reaction = reactionKey(record.reaction);
		const group = groups.get(reaction) ?? { reaction, users: [] };
		if (!group.users.some(user => user.id === record.user.id)) group.users.push(record.user);
		groups.set(reaction, group);
	}
	return [...groups.values()];
});

function reactionKey(reaction: string): string {
	return normalizeReaction(reaction).replace('@.', '');
}

onBeforeUnmount(() => {
	cancelLongPress();
	lifecycleController.abort();
	for (const animation of reactionAnimations) animation.cancel();
	reactionAnimations.clear();
});

provide(DI.mfmEmojiReactCallback, (reaction) => { void sendReaction(reaction); });

function showReply() {
	if (!props.message.reply) return;
	if (props.liveSync) emit('showReply', props.message.reply.id);
	else if (mobileLayout.value) router.pushByPath(`/chat/messages/${props.message.reply.id}`);
	else os.pageWindow(`/chat/messages/${props.message.reply.id}`);
}

async function sendReaction(reaction: string, remove = false, element?: HTMLButtonElement) {
	if (isMe.value || reacting.value || $i.policies.chatAvailability !== 'available') return;
	reaction = reactionKey(reaction);
	const group = reactionGroups.value.find(group => group.reaction === reaction);
	if (!remove && group?.users.some(user => user.id === $i.id)) return;
	if (!remove && !group && reactionGroups.value.length >= REACTION_KIND_LIMIT) {
		os.toast(i18n.ts._chat.reactionLimit, 'warning');
		return;
	}
	reacting.value = true;
	const message = props.message;
	let withdrawalAnimation: Animation | undefined;
	try {
		// 最后一人撤回才离场；合并项保留 chip，只更新人数和选中状态。
		if (remove && group?.users.length === 1) {
			withdrawalAnimation = animateReactionRemoval(element);
			if (withdrawalAnimation) {
				reactionAnimations.add(withdrawalAnimation);
				await withdrawalAnimation.finished.catch(() => {});
			}
		}
		if (lifecycleController.signal.aborted || props.message.id !== message.id) return;
		await misskeyApi(remove ? 'chat/messages/unreact' : 'chat/messages/react', { messageId: message.id, reaction });
		// 撤回成功后立即同步自身回应；流事件再次到达时仍按用户和表情幂等处理。
		if (remove) {
			for (let index = message.reactions.length - 1; index >= 0; index--) {
				const record = message.reactions[index];
				if (record.user.id === $i.id && reactionKey(record.reaction) === reaction) message.reactions.splice(index, 1);
			}
		} else if (!message.reactions.some(record => record.user.id === $i.id && reactionKey(record.reaction) === reaction)) {
			message.reactions.push({ reaction, user: $i });
		}
		if (!remove) {
			sound.playMisskeySfx('reaction');
			await nextTick();
			const target = element ?? rootEl.value?.querySelector<HTMLButtonElement>(`[data-reaction="${CSS.escape(reaction)}"]`);
			playReactionEffect(reaction, target);
		}
	} catch {
		os.toast(i18n.ts.somethingHappened, 'error');
	} finally {
		withdrawalAnimation?.cancel();
		if (withdrawalAnimation) reactionAnimations.delete(withdrawalAnimation);
		reacting.value = false;
	}
}

function react(ev?: MouseEvent) {
	if (isMe.value || reacting.value || $i.policies.chatAvailability !== 'available') return;

	const targetEl = getHTMLElementOrNull(ev?.currentTarget ?? ev?.target) ?? bubbleEl.value;
	if (!targetEl) return;

	reactionPicker.show(targetEl, null, (reaction) => { void sendReaction(reaction); });
}

function onReactionClick(reaction: string, element: HTMLButtonElement) {
	const group = reactionGroups.value.find(group => group.reaction === reaction);
	const remove = group?.users.some(user => user.id === $i.id) ?? false;
	void sendReaction(reaction, remove, element);
}

async function deleteMessage() {
	if (deleting.value) return;
	deleting.value = true;
	try {
		await misskeyApi('chat/messages/delete', { messageId: props.message.id });
		emit('deleted', props.message.id);
		if (!props.liveSync) deleted.value = true;
	} catch {
		os.toast(i18n.ts.somethingHappened, 'error');
	} finally {
		deleting.value = false;
	}
}

let longPressTimer: number | undefined;
let longPressX = 0;
let longPressY = 0;
let ignoreContextUntil = 0;

function cancelLongPress() {
	window.clearTimeout(longPressTimer);
	longPressTimer = undefined;
}

function startLongPress(ev: PointerEvent) {
	if (ev.pointerType !== 'touch' || !(ev.target instanceof HTMLElement) || ev.target.closest('a, button, input, textarea, video, audio')) return;
	cancelLongPress();
	longPressX = ev.clientX;
	longPressY = ev.clientY;
	longPressTimer = window.setTimeout(() => {
		ignoreContextUntil = Date.now() + 800;
		showMenu(ev);
	}, 420);
}

function moveLongPress(ev: PointerEvent) {
	if (Math.hypot(ev.clientX - longPressX, ev.clientY - longPressY) > 10) cancelLongPress();
}

function suppressLongPressClick(ev: MouseEvent) {
	if (Date.now() >= ignoreContextUntil) return;
	ev.preventDefault();
	ev.stopPropagation();
}

function onContextmenu(ev: PointerEvent) {
	cancelLongPress();
	if (Date.now() < ignoreContextUntil) {
		ev.preventDefault();
		return;
	}
	if (ev.target && isLink(ev.target as HTMLElement)) return;
	if (window.getSelection()?.toString() !== '') return;

	showMenu(ev, true);
}

function onBubbleKeydown(event: KeyboardEvent) {
	if (event.target !== event.currentTarget || (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10'))) return;
	event.preventDefault();
	showMenu(event);
}

function showMenu(ev: PointerEvent | KeyboardEvent, contextmenu = false) {
	const menu: MenuItem[] = [];

	if (props.canCompose && !props.silenced && props.message.fromUser != null && $i.policies.chatAvailability === 'available') {
		menu.push({ text: i18n.ts.reply, icon: 'ti ti-arrow-back-up', action: () => emit('compose', 'reply', props.message) });
		menu.push({ text: i18n.ts.quote, icon: 'ti ti-quote', action: () => emit('compose', 'quote', props.message) });
		if (!isMe.value) menu.push({ text: i18n.ts._chat.mentionSender, icon: 'ti ti-at', action: () => emit('compose', 'mention', props.message) });
		menu.push({ type: 'divider' });
	}

	if (!isMe.value && $i.policies.chatAvailability === 'available') {
		menu.push({
			text: i18n.ts._chat.addReaction,
			icon: 'ti ti-mood-happy',
			action: () => react(),
		});

		menu.push({
			type: 'divider',
		});
	}

	menu.push({
		text: i18n.ts.copyContent,
		icon: 'ti ti-copy',
		action: () => {
			copyToClipboard(props.message.text ?? '');
		},
	});

	menu.push({
		type: 'divider',
	});

	if (isMe.value && $i.policies.chatAvailability === 'available') {
		if (props.canEdit && !props.message.redPacketId) {
			menu.push({
				text: i18n.ts._chat.editMessage,
				icon: 'ti ti-pencil',
				action: () => {
					emit('edit', props.message);
				},
			});
		}

		menu.push({
			text: i18n.ts.delete,
			icon: 'ti ti-trash',
			danger: true,
			action: () => { void deleteMessage(); },
		});
	}

	if (!isMe.value && props.message.fromUser != null) {
		menu.push(getAbuseReportMenu({ type: 'chat', message: { id: props.message.id, text: props.message.text, user: props.message.fromUser } }));
	}

	if (contextmenu && !(ev instanceof KeyboardEvent)) {
		os.contextMenu(menu, ev);
	} else {
		os.popupMenu(menu, ev.currentTarget ?? ev.target);
	}
}

function onAvatarContextmenu(ev: PointerEvent) {
	if (props.memberMenu) {
		emit('avatarMenu', ev, props.message.fromUserId);
		return;
	}
	if (!props.canCompose || props.silenced || isMe.value || props.message.fromUser?.host != null || $i.policies.chatAvailability !== 'available') return;
	os.contextMenu([
		{ text: i18n.ts._chat.mentionSender, icon: 'ti ti-at', action: () => emit('compose', 'mention', props.message) },
		{ text: i18n.ts._chat.poke, icon: 'ti ti-hand-finger', action: () => emit('poke', props.message.fromUserId) },
	], ev);
}
</script>

<style lang="scss" module>

.root {
	--chat-avatar-size: 40px;
	--chat-avatar-gap: 10px;
	--chat-bubble-radius: 6px;
	--chat-bubble-received: var(--MI_THEME-panel);
	--chat-bubble-sent: color-mix(in srgb, var(--MI_THEME-success) 26%, var(--MI_THEME-panel));

	position: relative;
	isolation: isolate;
	display: flex;
	align-items: flex-start;
	gap: var(--chat-avatar-gap);

	&.isMe {
		flex-direction: row-reverse;
		text-align: right;

		.header, .footer {
			flex-direction: row-reverse;
		}

		.sender {
			flex-direction: row;
		}

		.body {
			align-items: flex-end;
		}
	}
}

.avatar {
	position: relative;
	z-index: 1;
	display: block;
	flex-shrink: 0;
	width: var(--chat-avatar-size);
	height: var(--chat-avatar-size);
}

.root.poke {
	justify-content: center;
	align-items: center;
	flex-direction: row;
	text-align: center;
	font-size: 12px;
	color: var(--MI_THEME-fgTransparentWeak);

	// 撤回不参与居中布局，显示和隐藏都不挤动消息。
	.pokeWithdraw {
		position: absolute;
		inset-inline-start: calc(100% + 6px);
		top: 50%;
		transform: translateY(-50%);
		z-index: 1;
		padding: 4px 8px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--MI_THEME-panel) 65%, transparent);
		white-space: nowrap;
		opacity: 0;
		pointer-events: none;

		&:focus-visible { outline: 2px solid var(--MI_THEME-focus); }
	}

	.pokeMessage:hover .pokeWithdraw,
	.pokeWithdraw:focus-visible {
		opacity: 1;
		pointer-events: auto;
	}
}

.pokeMessage {
	position: relative;
	display: inline-flex;
	flex: 0 1 auto;
	width: fit-content;
	min-width: 0;
	max-width: 100%;
	line-height: 1.6;

	&.pokeOwn {
		// 两侧安全区相同，撤回出现时不偏移胶囊，也不遮住长昵称。
		max-width: calc(100% - 8em);

		// 鼠标移向撤回时保持悬停，避免经过间隙让按钮消失。
		&::after {
			content: '';
			position: absolute;
			inset-inline-start: 100%;
			top: 0;
			bottom: 0;
			width: 6px;
		}
	}
}

.pokeContent {
	box-sizing: border-box;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 2px;
	min-width: 0;
	max-width: 100%;
	padding: 4px 10px;
	border-radius: 999px;
	background: color-mix(in srgb, var(--MI_THEME-panel) 65%, transparent);

	:global(._userName) { padding-block: 0; }
}

.pokeSender {
	max-width: 12em;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.pokeAction {
	flex-shrink: 0;
}

.pokeTarget {
	display: block;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: var(--MI_THEME-accent);
	text-decoration: none !important;
}

.pokeHand {
	--MI-emojiHeight: 1em;
	--MI-emojiVerticalAlign: 0;
	display: inline-flex;
	align-items: center;
	flex-shrink: 0;
	margin-inline: 1px 5px;
	font-size: 1.25em;
	pointer-events: none;

	&.pokeAnimated { animation: pokeHandNudge 300ms ease-in-out 2; }

	@media (prefers-reduced-motion: reduce) {
		&.pokeAnimated { animation: none; }
	}
}

@keyframes pokeHandNudge {
	0%, 100% { transform: translateX(0); }
	25% { transform: translateX(4px); }
	65% { transform: translateX(-1px); }
}

.systemMessage {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	flex-wrap: wrap;
	gap: 0 4px;
	max-width: 100%;
	padding: 6px 10px;
	border-radius: 12px;
	line-height: 1.6;
	background: color-mix(in srgb, var(--MI_THEME-panel) 65%, transparent);
}

.systemUserLink {
	display: inline-flex;
	align-items: center;
	color: var(--MI_THEME-accent);
	text-decoration: none !important;
}

.systemUserName {
	padding-block: 0;
	line-height: inherit;
}

@container (max-width: 450px) {
	.root {
		--chat-avatar-size: 36px;
	}
}

.body {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	min-width: 0;
	// 两侧都预留头像栏，长消息不延伸到对方头像下方，短消息按内容收缩。
	max-width: min(560px, 78%, calc(100% - 2 * (var(--chat-avatar-size) + var(--chat-avatar-gap))));

	&.withMedia { width: 100%; }
}

.header {
	display: flex;
	align-items: center;
	gap: 7px;
	max-width: 100%;
	margin-bottom: 5px;
	line-height: 18px;
	font-size: 12px;
	color: var(--MI_THEME-fgTransparentWeak);
}

.sender {
	display: flex;
	flex-direction: row-reverse;
	align-items: center;
	gap: 4px;
	min-width: 0;
	overflow: hidden;
}

.roleTag {
	flex-shrink: 0;
	padding: 1px 4px;
	border-radius: 4px;
	color: var(--MI_THEME-accent);
	background: var(--MI_THEME-accentedBg);
	font-size: 0.8em;
	line-height: 1.3;
}

.senderName {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: var(--MI_THEME-fg);
	font-weight: 600;
}

.time {
	flex-shrink: 0;
	font-variant-numeric: tabular-nums;
	color: var(--MI_THEME-fgTransparentWeak);
}

.edited {
	flex-shrink: 0;
	color: var(--MI_THEME-fgTransparentWeak);
}

.bubble {
	position: relative;
	min-width: 0;
	max-width: 100%;
	padding: 10px 12px;
	box-sizing: border-box;
	border-radius: var(--chat-bubble-radius);
	background: var(--chat-bubble-received);
	overflow-wrap: anywhere;
	text-align: left;
	font-size: 1em;
	line-height: 1.5;

	&::before {
		content: '';
		position: absolute;
		top: 12px;
		left: -6px;
		width: 8px;
		height: 12px;
		background: inherit;
		// 箭头伸进主体，缩放到小数像素时也不会露出接缝。
		clip-path: polygon(100% 0, 0 50%, 100% 100%);
		pointer-events: none;
	}

	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: 2px; }
}

.isMe .bubble {
	background: var(--chat-bubble-sent);

	&::before {
		left: auto;
		right: -6px;
		clip-path: polygon(0 0, 100% 50%, 0 100%);
	}
}

.withMedia .bubble {
	width: 100%;
}

.reply {
	--chat-reference-color: var(--MI_THEME-accent);
	display: flex;
	flex-direction: column;
	align-items: stretch;
	box-sizing: border-box;
	width: 100%;
	max-width: 320px;
	min-width: 0;
	margin: 2px 0 6px;
	padding: 6px 8px;
	border-left: 3px solid var(--chat-reference-color);
	border-radius: var(--MI-radius);
	background: color-mix(in srgb, var(--MI_THEME-fg) 8%, var(--MI_THEME-panel));
	text-align: left;
	font-size: .9em;
	line-height: 1.4;
	color: var(--MI_THEME-fgTransparent);
	&:hover:not(:disabled) { background: color-mix(in srgb, var(--MI_THEME-fg) 12%, var(--MI_THEME-panel)); }
	&:focus-visible { outline: 2px solid var(--chat-reference-color); }
}

.quote {
	--chat-reference-color: var(--MI_THEME-renote);
}

.urlPreview {
	--MI-urlPreviewMarginBlock: 0px;
	margin: 8px 0 0;
	max-width: 100%;
}

.replyHeader {
	display: flex;
	align-items: center;
	gap: 4px;
	min-width: 0;
	margin-bottom: 2px;
	color: var(--chat-reference-color);
	font-weight: 600;
}

.replyIcon {
	flex-shrink: 0;
	font-size: .95em;
}

.replyName {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.replyContent {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: var(--MI_THEME-fgTransparent);
}

.text {
	// 间距挂在正文下边距，红包/图片单独成消息时上下留白才对称
	display: block;
	line-height: inherit;

	&:not(:last-child) {
		margin-bottom: 4px;
	}
}

.claimNotice {
	margin: 6px 0 0;
	font-size: 12px;
	color: var(--MI_THEME-fgTransparentWeak);
}

.footer {
	display: flex;
	flex-direction: row;
	flex-wrap: wrap;
	gap: 0.5em;
	margin-top: 4px;
	font-size: 85%;
}

.autoReply {
	color: var(--MI_THEME-accent);
}

</style>
