<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-if="!deleted" ref="rootEl" :class="[$style.root, { [$style.isMe]: isMe && !message.systemEvent, [$style.poke]: message.isPoke || message.systemEvent }]" :data-chat-message-id="message.id" tabindex="-1">
	<template v-if="message.systemEvent">
		<span :class="$style.systemMessage">
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
		<span><MkUserName v-if="message.fromUser" :user="message.fromUser"/> {{ i18n.ts._chat.poked }} <MkUserName v-if="message.pokeUser" :user="message.pokeUser"/></span>
		<button v-if="isMe" type="button" class="_textButton" :class="$style.pokeWithdraw" :disabled="deleting" @click="deleteMessage">{{ i18n.ts._chat.withdrawPoke }}</button>
	</template>
	<template v-else>
	<MkAvatar :class="[$style.avatar, prefer.s.useStickyIcons ? $style.useSticky : null]" :user="message.fromUser!" :link="!isMe" :preview="false" @contextmenu.prevent.stop="onAvatarContextmenu"/>
	<div :class="[$style.body, message.file != null ? $style.withMedia : null]">
		<div :class="$style.header">
			<span v-if="prefer.s['chat.showSenderName'] && message.fromUser != null" :class="$style.sender">
				<span v-if="isRoomOwner" :class="$style.ownerTag">{{ i18n.ts._chat.roomOwner }}</span>
				<Mfm v-if="nickname" :text="nickname" :plain="true" :nowrap="true" :author="message.fromUser" :class="$style.senderName"/>
				<MkUserName v-else :user="message.fromUser" :class="$style.senderName"/>
			</span>
			<span v-if="message.editedAt" :class="$style.edited">{{ i18n.ts._chat.edited }}</span>
			<MkTime :class="$style.time" :time="message.createdAt" expandOnHover/>
		</div>
		<MkFukidashi ref="bubbleEl" :class="$style.fukidashi" :tail="isMe ? 'right' : 'left'" :fullWidth="message.file != null" :accented="isMe" data-chat-bubble @contextmenu.stop="onContextmenu" @pointerdown="startLongPress" @pointermove="moveLongPress" @pointerup="cancelLongPress" @pointercancel="cancelLongPress" @click.capture="suppressLongPressClick">
			<button v-if="message.replyType" type="button" class="_button" :class="$style.reply" data-chat-reply :disabled="!message.reply" :aria-label="i18n.ts._chat.originalMessage" @click.stop="showReply">
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
				ref="text"
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
		</MkFukidashi>
		<MkUrlPreview v-for="url in urls" :key="url" :url="url" style="margin: 8px 0;"/>
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
				@toggle="onReactionClick(group.reaction, $event)"
			/>
		</MkReactionList>
	</div>
	</template>
</div>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, provide, ref, useTemplateRef } from 'vue';
import * as mfm from 'mfm-js';
import * as Misskey from 'misskey-js';
import { url } from '@@/js/config.js';
import { isLink } from '@@/js/is-link.js';
import type { MenuItem } from '@/types/menu.js';
import type { NormalizedChatMessage } from './room.vue';
import type { ChatComposeAction } from './composer.js';
import { toSingleLine } from './composer.js';
import MkReactionChip from '@/components/MkReactionChip.vue';
import MkReactionList from '@/components/MkReactionList.vue';
import { extractUrlFromMfm } from '@/utility/extract-url-from-mfm.js';
import MkUrlPreview from '@/components/MkUrlPreview.vue';
import { ensureSignin } from '@/i.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import MkFukidashi from '@/components/MkFukidashi.vue';
import * as os from '@/os.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import MkMediaList from '@/components/MkMediaList.vue';
import MkRedPacket from '@/components/MkRedPacket.vue';
import { reactionPicker } from '@/utility/reaction-picker.js';
import * as sound from '@/utility/sound.js';
import { prefer } from '@/preferences.js';
import { DI } from '@/di.js';
import { getHTMLElementOrNull } from '@/utility/get-dom-node-or-null.js';
import { normalizeReaction, REACTION_KIND_LIMIT } from '@/utility/normalize-reaction.js';
import { animateReactionRemoval, playReactionEffect } from '@/utility/reaction-effect.js';
import { animateChatMessageDisintegration } from '@/utility/chat-message-disintegrate.js';
import { getChatNotificationMode } from '@/utility/chat-conversation-settings.js';
import { userPage } from '@@/js/user.js';

const $i = ensureSignin();

const props = defineProps<{
	message: NormalizedChatMessage | Misskey.entities.ChatMessage;
	nickname?: string;
	memberMenu?: boolean;
	isRoomOwner?: boolean;
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
}>();

const bubbleEl = useTemplateRef('bubbleEl');
const rootEl = useTemplateRef('rootEl');
const reacting = ref(false);
const deleting = ref(false);
const deleted = ref(false);
const deleteAnimationController = new AbortController();
const reactionAnimations = new Set<Animation>();
const isMe = computed(() => props.message.fromUserId === $i.id);
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
	deleteAnimationController.abort();
	for (const animation of reactionAnimations) animation.cancel();
	reactionAnimations.clear();
});

provide(DI.mfmEmojiReactCallback, (reaction) => { void sendReaction(reaction); });

function showReply() {
	if (!props.message.reply) return;
	if (props.canCompose) emit('showReply', props.message.reply.id);
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
		if (deleteAnimationController.signal.aborted || props.message.id !== message.id) return;
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

	const targetEl = getHTMLElementOrNull(ev?.currentTarget ?? ev?.target) ?? getHTMLElementOrNull(bubbleEl.value?.$el);
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
		if (!props.liveSync) {
			if (rootEl.value && prefer.s.animation) await animateChatMessageDisintegration(rootEl.value, deleteAnimationController.signal, () => {
				const message = props.message;
				const key = message.toRoomId ? `room:${message.toRoomId}` : `user:${isMe.value ? message.toUserId : message.fromUserId}`;
				if ($i.onlineStatusOverride !== 'doNotDisturb' && getChatNotificationMode(key, 'toRoom' in message ? message.toRoom : null) === 'all') sound.playChatMessageDeleteSfx(message.id, deleteAnimationController.signal);
			}).catch(() => {});
			deleted.value = true;
		}
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

function showMenu(ev: PointerEvent, contextmenu = false) {
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
		menu.push({
			text: i18n.ts.reportAbuse,
			icon: 'ti ti-exclamation-circle',
			action: async () => {
				const localUrl = `${url}/chat/messages/${props.message.id}`;
				const { dispose } = await os.popupAsyncWithDialog(import('@/components/MkAbuseReportWindow.vue').then(x => x.default), {
					user: props.message.fromUser!,
					reportTarget: { reportType: 'chat', targetId: props.message.id },
					context: { label: i18n.ts._chat.messages, text: props.message.text, url: localUrl },
				}, {
					closed: () => dispose(),
				});
			},
		});
	}

	if (contextmenu) {
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
	position: relative;
	display: flex;
	align-items: flex-start;
	gap: 12px;

	&:focus {
		// 跳转定位使用外侧阴影，避免和全局焦点轮廓叠加或压住消息内容。
		outline: none;
	}

	&.isMe {
		flex-direction: row-reverse;
		text-align: right;

		.header, .footer {
			flex-direction: row-reverse;
		}

		.body {
			align-items: flex-end;
		}
	}
}

.avatar {
	display: block;
	flex-shrink: 0;
	width: 40px;
	height: 40px;

	&.useSticky {
		position: sticky;
		top: calc(var(--MI-chatAvatarStickyOffset, 16px) + var(--MI-stickyTop, 0px));
	}
}

.root.poke {
	justify-content: center;
	align-items: center;
	flex-direction: row;
	text-align: center;
	font-size: 12px;
	color: var(--MI_THEME-fgTransparentWeak);
	.pokeWithdraw { opacity: 0; }
	&:hover .pokeWithdraw, &:focus-within .pokeWithdraw { opacity: 1; }
	@media (hover: none) { .pokeWithdraw { opacity: 1; } }
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
	--MI-userNameUnderline: 0 !important;
}

.systemUserName {
	padding-block: 0;
	line-height: inherit;
}

@container (max-width: 450px) {
	.avatar {
		width: 36px;
		height: 36px;
	}

	.fukidashi {
		font-size: 90%;
	}
}

.body {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	min-width: 0;
	// 长消息保留另一侧的空白，短消息仍按实际内容收缩。
	max-width: min(75%, calc(100% - 52px));

	&.withMedia {
		width: 100%;
		max-width: none;
	}
}

.header {
	display: flex;
	align-items: center;
	gap: 6px;
	max-width: 100%;
	margin-bottom: 4px;
	line-height: 1.5;
	font-size: 0.9em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.sender {
	display: flex;
	align-items: center;
	gap: 4px;
	min-width: 0;
	overflow: hidden;
}

.ownerTag {
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
}

.time {
	flex-shrink: 0;
	color: var(--MI_THEME-fgTransparentWeak);
}

.edited {
	flex-shrink: 0;
	color: var(--MI_THEME-fgTransparentWeak);
}

.fukidashi {
	max-width: 100%;
	box-sizing: border-box;
	overflow-wrap: anywhere;
	text-align: left;
}

// 左侧强调线 + 浅底色，上行用户名、下行原文，各自单行省略。
// 内容比正文小一号；气泡对整体保持与纯文字一致的四边内边距，引用块嵌在其中。
.reply {
	display: flex;
	flex-direction: column;
	align-items: stretch;
	box-sizing: border-box;
	width: 100%;
	max-width: 320px;
	min-width: 0;
	// 引用块保留上下内边距；左内边距 11px + 3px 强调线 = 14px，与正文左缘对齐
	margin: 4px 0;
	padding: 6px 8px 6px 11px;
	border-left: 3px solid var(--MI_THEME-accent);
	border-radius: 4px;
	background: color-mix(in srgb, var(--MI_THEME-accent) 12%, transparent);
	text-align: left;
	font-size: .85em;
	line-height: inherit;
	color: var(--MI_THEME-fg);
	&:hover:not(:disabled) { background: color-mix(in srgb, var(--MI_THEME-accent) 20%, transparent); }
	&:focus-visible { outline: 2px solid var(--MI_THEME-accent); }
}

.replyHeader {
	display: flex;
	align-items: center;
	gap: 4px;
	min-width: 0;
	color: var(--MI_THEME-accent);
	font-weight: 700;
}

.replyIcon {
	flex-shrink: 0;
	font-size: .9em;
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
}

.text {
	// 间距挂在正文下边距，红包/图片单独成消息时上下留白才对称
	display: block;

	&:not(:last-child) {
		margin-bottom: 4px;
	}
}

.root:not(.isMe) .fukidashi {
	--fukidashi-bg: var(--MI_THEME-panel);
}

.claimNotice {
	margin: 6px 0 0;
	font-size: 12px;
	color: var(--MI_THEME-fgTransparentWeak);
}

.content {
	overflow: clip;
	overflow-wrap: break-word;
	word-break: break-word;
}

.footer {
	display: flex;
	flex-direction: row;
	flex-wrap: wrap;
	gap: 0.5em;
	margin-top: 4px;
	font-size: 75%;
}

.autoReply {
	color: var(--MI_THEME-accent);
}

</style>
