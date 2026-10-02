<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.root, { [$style.isMe]: isMe }]">
	<MkAvatar :class="[$style.avatar, prefer.s.useStickyIcons ? $style.useSticky : null]" :user="message.fromUser!" :link="!isMe" :preview="false"/>
	<div :class="[$style.body, message.file != null || message.redPacket != null ? $style.fullWidth : null]">
		<div :class="$style.header">
			<span v-if="prefer.s['chat.showSenderName'] && message.fromUser != null" :class="$style.sender">
				<MkUserName :user="message.fromUser" :class="$style.senderName"/>
			</span>
			<MkTime :class="$style.time" :time="message.createdAt"/>
		</div>
		<MkFukidashi ref="bubbleEl" :class="$style.fukidashi" :tail="isMe ? 'right' : 'left'" :fullWidth="message.file != null" :accented="isMe" data-chat-bubble @contextmenu.stop="onContextmenu">
			<Mfm
				v-if="message.text"
				ref="text"
				class="_selectable"
				:text="message.text"
				:i="$i"
				:nyaize="'respect'"
				:enableEmojiMenu="true"
				:enableEmojiMenuReaction="true"
			/>
			<MkMediaList v-if="message.file" :mediaList="[message.file]" :user="message.fromUser"/>
			<MkRedPacket v-if="message.redPacket" :redPacketId="message.redPacket.id" :authorId="message.fromUserId" :redPacket="message.redPacket"/>
		</MkFukidashi>
		<MkUrlPreview v-for="url in urls" :key="url" :url="url" style="margin: 8px 0;"/>
		<div v-if="('isAutoReply' in message && message.isAutoReply) || isSearchResult" :class="$style.footer">
			<span v-if="'isAutoReply' in message && message.isAutoReply" :class="$style.autoReply">{{ i18n.ts._onlineStatus.autoReply }}</span>
			<MkA v-if="isSearchResult && 'toRoom' in message && message.toRoom != null" :to="`/chat/room/${message.toRoomId}`">{{ message.toRoom.name }}</MkA>
			<MkA v-if="isSearchResult && 'toUser' in message && message.toUser != null && isMe" :to="`/chat/user/${message.toUserId}`">@{{ message.toUser.username }}</MkA>
		</div>
		<TransitionGroup
			:enterActiveClass="prefer.s.animation ? $style.transition_reaction_enterActive : ''"
			:leaveActiveClass="prefer.s.animation ? $style.transition_reaction_leaveActive : ''"
			:enterFromClass="prefer.s.animation ? $style.transition_reaction_enterFrom : ''"
			:leaveToClass="prefer.s.animation ? $style.transition_reaction_leaveTo : ''"
			:moveClass="prefer.s.animation ? $style.transition_reaction_move : ''"
			tag="div" :class="$style.reactions"
		>
			<button v-for="record in message.reactions" :key="record.reaction + record.user.id" type="button" class="_button" :class="[$style.reaction, record.user.id === $i.id ? $style.reactionMy : null]" :disabled="reacting || $i.policies.chatAvailability !== 'available'" :aria-label="`${i18n.ts.reaction}: ${record.reaction}`" @click.stop="onReactionClick(record)">
				<MkAvatar :user="record.user" :link="false" :class="$style.reactionAvatar"/>
				<MkReactionIcon
					:withTooltip="true"
					:reaction="record.reaction.replace(/^:(\w+):$/, ':$1@.:')"
					:noStyle="true"
					:class="$style.reactionIcon"
				/>
			</button>
		</TransitionGroup>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, provide, ref, useTemplateRef } from 'vue';
import * as mfm from 'mfm-js';
import * as Misskey from 'misskey-js';
import { url } from '@@/js/config.js';
import { isLink } from '@@/js/is-link.js';
import type { MenuItem } from '@/types/menu.js';
import type { NormalizedChatMessage } from './room.vue';
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
import MkReactionIcon from '@/components/MkReactionIcon.vue';
import { prefer } from '@/preferences.js';
import { DI } from '@/di.js';
import { getHTMLElementOrNull } from '@/utility/get-dom-node-or-null.js';

const $i = ensureSignin();

const props = defineProps<{
	message: NormalizedChatMessage | Misskey.entities.ChatMessage;
	isSearchResult?: boolean;
}>();

const bubbleEl = useTemplateRef('bubbleEl');
const reacting = ref(false);
const isMe = computed(() => props.message.fromUserId === $i.id);
const urls = computed(() => props.message.text ? extractUrlFromMfm(mfm.parse(props.message.text)) : []);

provide(DI.mfmEmojiReactCallback, (reaction) => { void sendReaction(reaction); });

async function sendReaction(reaction: string, remove = false) {
	if (reacting.value || $i.policies.chatAvailability !== 'available') return;
	if (!remove && props.message.reactions.some(record => record.user.id === $i.id && record.reaction === reaction)) return;
	reacting.value = true;
	try {
		await misskeyApi(remove ? 'chat/messages/unreact' : 'chat/messages/react', { messageId: props.message.id, reaction });
		if (!remove) sound.playMisskeySfx('reaction');
	} catch {
		void os.alert({ type: 'error', text: i18n.ts.somethingHappened });
	} finally {
		reacting.value = false;
	}
}

function react(ev: PointerEvent) {
	if ($i.policies.chatAvailability !== 'available') return;

	const targetEl = getHTMLElementOrNull(bubbleEl.value?.$el) ?? getHTMLElementOrNull(ev.currentTarget ?? ev.target);
	if (!targetEl) return;

	reactionPicker.show(targetEl, null, (reaction) => { void sendReaction(reaction); });
}

function onReactionClick(record: Misskey.entities.ChatMessage['reactions'][0]) {
	if ($i.policies.chatAvailability !== 'available') return;

	void sendReaction(record.reaction, record.user.id === $i.id);
}

function onContextmenu(ev: PointerEvent) {
	if (ev.target && isLink(ev.target as HTMLElement)) return;
	if (window.getSelection()?.toString() !== '') return;

	showMenu(ev, true);
}

function showMenu(ev: PointerEvent, contextmenu = false) {
	const menu: MenuItem[] = [];

	if (!isMe.value && $i.policies.chatAvailability === 'available') {
		menu.push({
			text: i18n.ts.reaction,
			icon: 'ti ti-mood-plus',
			action: (ev) => {
				react(ev);
			},
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
		menu.push({
			text: i18n.ts.delete,
			icon: 'ti ti-trash',
			danger: true,
			action: () => {
				misskeyApi('chat/messages/delete', {
					messageId: props.message.id,
				});
			},
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
</script>

<style lang="scss" module>
.transition_reaction_move,
.transition_reaction_enterActive,
.transition_reaction_leaveActive {
	transition: opacity 0.2s cubic-bezier(0,.5,.5,1), transform 0.2s cubic-bezier(0,.5,.5,1) !important;
}
.transition_reaction_enterFrom,
.transition_reaction_leaveTo {
	opacity: 0;
	transform: scale(0.7);
}
.transition_reaction_leaveActive {
	position: absolute;
}

.root {
	position: relative;
	display: flex;
	align-items: flex-start;
	gap: 12px;

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
		top: calc(16px + var(--MI-stickyTop, 0px));
	}
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
	max-width: calc(100% - 52px);

	&.fullWidth {
		width: 100%;
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
	align-items: baseline;
	gap: 4px;
	min-width: 0;
	overflow: hidden;
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

.fukidashi {
	max-width: 100%;
	box-sizing: border-box;
	overflow-wrap: anywhere;
	text-align: left;
}

.root:not(.isMe) .fukidashi {
	// 用主题前景色拉开明暗差，避免深色主题下气泡与聊天背景融为一体。
	--fukidashi-bg: color-mix(in srgb, var(--MI_THEME-fg) 16%, var(--MI_THEME-panel));
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

.reactions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	margin-top: 8px;

	&:empty {
		display: none;
	}
}

.reaction {
	display: flex;
	align-items: center;
	box-sizing: border-box;
	// 与帖子里的回应气泡同高，内容靠 align-items 在高度内垂直居中
	height: 28px;
	gap: 3px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 999px;
	padding: 0 7px 0 2px;
	font-size: 0.85em;
	line-height: 1;

	&.reactionMy {
		border-color: color-mix(in srgb, var(--MI_THEME-accent) 45%, var(--MI_THEME-divider));
		background: var(--MI_THEME-accentedBg);
	}
}

.reactionAvatar {
	flex-shrink: 0;
	width: 24px;
	height: 24px;
}

.reactionIcon {
	width: 1.5em;
	height: 1.5em;
}
</style>
