<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div
	v-if="!muted && !hideByPlugin && !isDeleted"
	ref="rootEl"
	v-hotkey="keymap"
	:class="[$style.root, { [$style.separateActivity]: separateActivity }]"
	tabindex="0"
>
	<div :class="separateActivity ? $style.card : undefined">
		<slot name="header"></slot>
		<div v-if="appearNote.replyId" :class="$style.replyThread">
			<div v-for="parentNote in replyThread" :key="parentNote.id" :class="$style.replyThreadItem">
				<MkNote :note="parentNote" :showReplyTo="false" :withThreadLine="true" :threadAuthor="threadAuthor" :class="$style.replyThreadNote"/>
			</div>
			<div v-if="replyThread.length === 0" :class="$style.deletedReply">{{ getDeletedText(appearNote.reply?.deletedBy) }}</div>
		</div>
		<div v-if="isRenote" :class="$style.renote">
			<i class="ti ti-repeat" :class="$style.renoteIcon"></i>{{ ' ' }}
			<MkA v-user-preview="note.userId" :class="$style.renoteText" :to="userPage(note.user)">
				<span :class="$style.renoteName">
					<span v-if="isMyRenote">{{ i18n.ts.you }}</span>
					<MkUserName v-else :user="note.user"/>
				</span>{{ ' ' }}{{ i18n.ts.renoted }}
			</MkA>
			<div v-if="note.visibility !== 'public' || note.localOnly" :class="$style.renoteInfo">
				<span v-if="note.visibility !== 'public'" style="margin-left: 0.5em;" :title="i18n.ts._visibility[note.visibility]">
					<i v-if="note.visibility === 'home'" class="ti ti-home"></i>
					<i v-else-if="note.visibility === 'followers'" class="ti ti-lock"></i>
					<i v-else-if="note.visibility === 'specified'" ref="specified" class="ti ti-mail"></i>
				</span>
				<span v-if="note.localOnly && !note.redPacket" style="margin-left: 0.5em;" :title="i18n.ts._visibility['disableFederation']"><i class="ti ti-rocket-off"></i></span>
			</div>
		</div>
		<div v-if="isRenoteTargetDeleted" :class="$style.deleted">
			<span>{{ getDeletedText(renoteTargetDeletedBy) }}</span>
			<button v-if="isMyRenote" type="button" class="_button" :class="$style.deletedRenoteAction" @click.stop="deleteRenote()">
				<i class="ti ti-trash"></i>
				<span>{{ i18n.ts.delete }}</span>
			</button>
		</div>
		<article v-else ref="viewEl" :class="$style.note" @contextmenu.stop="onContextmenu">
			<MkAvatar :class="$style.noteHeaderAvatar" :user="appearNote.user" indicator link preview/>
			<div :class="$style.main">
				<div :class="$style.noteHeader">
					<div :class="$style.noteHeaderBody">
						<MkNoteHeader :note="appearNote"/>
						<MkInstanceTicker v-if="showTicker" :host="appearNote.user.host" :instance="appearNote.user.instance"/>
					</div>
					<button ref="menuButton" class="_button" :class="$style.noteHeaderMenuButton" :aria-label="i18n.ts.more" @click.stop="showMenu()">
						<i class="ti ti-dots"></i>
					</button>
				</div>
				<div :class="$style.noteContent">
					<MkCwButton v-if="appearNote.cw != null" v-model="showContent" :text="appearNote.text" :renote="appearNote.renote" :files="appearNote.files" :poll="appearNote.poll">
						<Mfm
							v-if="appearNote.cw != ''"
							:text="appearNote.cw"
							:author="appearNote.user"
							:nyaize="'respect'"
							:enableEmojiMenu="true"
							:enableEmojiMenuReaction="true"
						/>
					</MkCwButton>
					<div v-show="appearNote.cw == null || showContent">
						<span v-if="appearNote.isHidden" style="color: var(--MI_THEME-fgTransparentWeak);">({{ i18n.ts.private }})</span>
						<Mfm
							v-if="appearNote.text"
							:parsedNodes="displayNodes"
							:text="appearNote.text"
							:author="appearNote.user"
							:nyaize="'respect'"
							:emojiUrls="appearNote.emojis"
							:enableEmojiMenu="true"
							:enableEmojiMenuReaction="true"
							class="_selectable"
						/>
						<a v-if="appearNote.renote != null" :class="$style.rn">RN:</a>
						<div v-if="translating || translation" :class="$style.translation">
							<MkLoading v-if="translating" mini/>
							<div v-else-if="translation">
								<b>{{ i18n.tsx.translatedFrom({ x: translation.sourceLang }) }}: </b>
								<Mfm :text="translation.text" :author="appearNote.user" :nyaize="'respect'" :emojiUrls="appearNote.emojis" class="_selectable"/>
							</div>
						</div>
						<div v-if="appearNote.files && appearNote.files.length > 0" style="margin-top: 12px;">
							<MkMediaList ref="galleryEl" :mediaList="appearNote.files" :user="appearNote.user"/>
						</div>
						<MkRedPacket v-if="appearNote.redPacket" :redPacketId="appearNote.redPacket.id" :authorId="appearNote.userId" :redPacket="appearNote.redPacket"/>
						<MkPoll
							v-if="appearNote.poll"
							:noteId="appearNote.id"
							:multiple="appearNote.poll.multiple"
							:expiresAt="appearNote.poll.expiresAt"
							:choices="$appearNote.pollChoices"
							:author="appearNote.user"
							:emojiUrls="appearNote.emojis"
							:class="$style.poll"
						/>
						<div v-if="isEnabledUrlPreview">
							<MkUrlPreview v-for="url in urls" :key="url" :url="url" :compact="true" :detail="true" style="margin-top: 6px;"/>
						</div>
						<div v-if="appearNote.renoteId && appearNote.renoteId !== appearNote.replyId" :class="$style.quote"><MkNoteSimple :note="appearNote?.renote ?? null" :class="$style.quoteNote"/></div>
					</div>
				</div>
				<footer>
					<div :class="$style.noteFooterInfo">
						<MkA :to="notePage(appearNote)">
							<MkTime :time="appearNote.createdAt" mode="absolute" colored/>
						</MkA>
						<span style="margin-left: 0.5em;">
							<span style="border: 1px solid var(--MI_THEME-divider); margin-right: 0.5em;"></span>
							<i v-if="appearNote.visibility === 'public'" class="ti ti-world"></i>
							<i v-else-if="appearNote.visibility === 'home'" class="ti ti-home"></i>
							<i v-else-if="appearNote.visibility === 'followers'" class="ti ti-lock"></i>
							<i v-else-if="appearNote.visibility === 'specified'" ref="specified" class="ti ti-mail"></i>
							<span style="margin-left: 0.3em;">{{ i18n.ts._visibility[appearNote.visibility] }}</span>
						</span>
					</div>
					<MkReactionsViewer
						v-if="appearNote.reactionAcceptance !== 'likeOnly'"
						style="margin-top: 6px;"
						:reactions="$reactionNote.reactions"
						:reactionEmojis="$reactionNote.reactionEmojis"
						:myReaction="$reactionNote.myReaction"
						:noteId="reactionNote.id"
					>
						<template v-if="hasBoosts" #boost>
							<button ref="reactButton" v-tooltip="i18n.ts._boost.title" class="_button" :class="$style.boostButton" :aria-label="i18n.ts._boost.title" aria-haspopup="dialog" :aria-expanded="boostOpen" :disabled="!canBoost || appearNote.reactionAcceptance === 'likeOnly'" @click.stop="toggleReact()">
								<i class="ti ti-rocket"></i>
							</button>
						</template>
					</MkReactionsViewer>
					<div :class="$style.tagsAndLikeRow">
						<MkNoteTags v-if="appearNote.cw == null || showContent" :tags="topics.tags" :channel="appearNote.channel"/>
						<MkLikeSummary :noteId="appearNote.id" :count="$appearNote.likeCount" :users="$appearNote.likeUsers"/>
					</div>
					<div :class="[$style.noteFooterActions, { [$style.footerAnimated]: prefer.s.animation }]">
						<div :class="$style.footerButtonSlot">
							<button v-tooltip.icon="i18n.ts.reply" class="_button" :class="$style.noteFooterButton" :aria-label="i18n.ts.reply" @click.stop="reply()">
								<i class="ti ti-message-circle"></i>
								<MkRollingNumber v-show="$appearNote.repliesCount > 0" :class="$style.noteFooterButtonCount" :value="$appearNote.repliesCount"/>
							</button>
						</div>
						<div :class="$style.footerButtonSlot">
							<button
								v-if="canRenote || isRenote"
								ref="renoteButton"
								v-tooltip.icon="isRenote ? i18n.ts.more : i18n.ts.renote"
								class="_button"
								:class="[$style.noteFooterButton, $style.renoteButton, { [$style.renoted]: isRenotedByMe }]"
								:aria-label="isRenote ? i18n.ts.more : i18n.ts.renote"
								@click.stop="toggleRenote()"
								@keydown.enter.stop
							>
								<i class="ti ti-repeat"></i>
								<MkRollingNumber v-show="displayedRenoteCount > 0" :class="$style.noteFooterButtonCount" :value="displayedRenoteCount"/>
							</button>
							<button v-else v-tooltip="i18n.ts.renote" class="_button" :class="$style.noteFooterButton" :aria-label="i18n.ts.renote" disabled>
								<i class="ti ti-ban"></i>
							</button>
						</div>
						<div :class="$style.footerButtonSlot">
							<button v-tooltip.icon="$appearNote.isLiked ? i18n.ts.unlike : i18n.ts.like" class="_button" :class="[$style.noteFooterButton, $style.likeButton, { [$style.liked]: $appearNote.isLiked }]" :aria-label="$appearNote.isLiked ? i18n.ts.unlike : i18n.ts.like" :aria-pressed="$appearNote.isLiked" :disabled="liking" @click.stop="toggleLike()">
								<i :class="$appearNote.isLiked ? 'ti ti-heart-filled' : 'ti ti-heart'"></i>
								<MkRollingNumber v-show="$appearNote.likeCount > 0" :class="$style.noteFooterButtonCount" :value="$appearNote.likeCount"/>
							</button>
						</div>
						<div :class="$style.footerButtonSlot">
							<span v-tooltip.icon="i18n.ts.viewsCount" :class="$style.noteFooterButton">
								<i class="ti ti-chart-bar" role="img" :aria-label="i18n.ts.viewsCount"></i>
								<MkRollingNumber v-show="$appearNote.viewsCount > 0" :class="$style.noteFooterButtonCount" :value="$appearNote.viewsCount"/>
							</span>
						</div>
						<div :class="$style.footerIconActions">
							<button v-if="prefer.s.showClipButtonInNoteFooter" ref="clipButton" v-tooltip="i18n.ts.clip" class="_button" :class="$style.noteFooterButton" :aria-label="i18n.ts.clip" @click.stop="clip()">
								<i class="ti ti-paperclip"></i>
							</button>
							<button v-if="!hasBoosts && $reactionNote.myReaction == null" ref="reactButton" v-tooltip="i18n.ts._boost.title" class="_button" :class="$style.noteFooterButton" :aria-label="i18n.ts._boost.title" aria-haspopup="dialog" :aria-expanded="boostOpen" :disabled="!canBoost || appearNote.reactionAcceptance === 'likeOnly'" @click.stop="toggleReact()">
								<i class="ti ti-rocket"></i>
							</button>
							<button v-tooltip="i18n.ts.share" class="_button" :class="$style.noteFooterButton" :aria-label="i18n.ts.share" @click.stop="share()">
								<i class="ti ti-share"></i>
							</button>
						</div>
					</div>
				</footer>
			</div>
		</article>
	</div>
	<div v-if="!isRenoteTargetDeleted" :class="separateActivity ? [$style.card, $style.activityCard] : undefined">
		<div :class="$style.tabs">
			<button class="_button" :class="[$style.tab, { [$style.tabActive]: tab === 'replies' }]" @click="tab = 'replies'"><i class="ti ti-message-circle"></i> {{ i18n.ts.replies }}</button>
			<button class="_button" :class="[$style.tab, { [$style.tabActive]: tab === 'renotes' }]" @click="tab = 'renotes'"><i class="ti ti-repeat"></i> {{ i18n.ts.renotes }}</button>
			<button class="_button" :class="[$style.tab, { [$style.tabActive]: tab === 'reactions' }]" @click="tab = 'reactions'"><i class="ti ti-rocket"></i> {{ i18n.ts._boost.title }}</button>
		</div>
		<div>
			<div v-if="tab === 'replies'">
				<MkNoteSub v-for="note in replies" :key="note.id" :note="note" :class="$style.reply" :detail="true" :threadAuthor="threadAuthor" :parentComment="appearNote"/>
				<div v-if="replies.length === 0" :class="$style.tabEmpty"><MkResult type="empty"/></div>
			</div>
			<div v-else-if="tab === 'renotes'">
				<MkPagination :paginator="renotesPaginator" :autoLoad="false">
					<template #empty>
						<div :class="$style.tabEmpty"><MkResult type="empty"/></div>
					</template>
					<template #default="{ items }">
						<div :class="$style.tab_renotes">
							<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(min(270px, 100%), 1fr)); grid-gap: 12px;">
								<MkA v-for="item in items" :key="item.id" :to="userPage(item.user)">
									<MkUserCardMini :user="item.user" :withChart="false"/>
								</MkA>
							</div>
						</div>
					</template>
				</MkPagination>
			</div>
			<div v-else-if="tab === 'reactions'">
				<div v-if="Object.keys($reactionNote.reactions).length === 0" :class="$style.tabEmpty"><MkResult type="empty"/></div>
				<div v-else :class="$style.tab_reactions">
					<div :class="$style.reactionTabs">
						<button v-for="reaction in Object.keys($reactionNote.reactions)" :key="reaction" :class="[$style.reactionTab, { [$style.reactionTabActive]: reactionTabType === reaction }]" class="_button" @click="reactionTabType = reaction">
							<MkReactionIcon :allowTextBoost="true" :reaction="reaction"/>
							<span style="margin-left: 4px;">{{ $reactionNote.reactions[reaction] }}</span>
						</button>
					</div>
					<MkPagination v-if="reactionTabType" :key="reactionTabType" :paginator="reactionsPaginator">
						<template #default="{ items }">
							<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(min(270px, 100%), 1fr)); grid-gap: 12px;">
								<MkA v-for="item in items" :key="item.id" :to="userPage(item.user)">
									<MkUserCardMini :user="item.user" :withChart="false"/>
								</MkA>
							</div>
						</template>
					</MkPagination>
				</div>
			</div>
		</div>
	</div>
</div>
<div v-else-if="isDeleted" class="_panel" :class="separateActivity ? $style.card : undefined">
	<slot name="header"></slot>
	<div :class="$style.deleted"><span>{{ getDeletedText(deletedBy) }}</span></div>
</div>
<div v-else-if="muted" class="_panel" :class="separateActivity ? $style.card : undefined">
	<slot name="header"></slot>
	<div :class="$style.muted" @click="muted = false">
		<I18n :src="i18n.ts.userSaysSomething" tag="small">
			<template #name>
				<MkA v-user-preview="appearNote.userId" :to="userPage(appearNote.user)">
					<MkUserName :user="appearNote.user"/>
				</MkA>
			</template>
		</I18n>
	</div>
</div>
<div v-else-if="hideByPlugin && $slots.header" :class="separateActivity ? $style.card : undefined">
	<slot name="header"></slot>
</div>
</template>

<script lang="ts" setup>
import { inject, provide, ref, useTemplateRef, markRaw, computed, onBeforeUnmount } from 'vue';
import * as Misskey from 'misskey-js';
import { useNote } from '@/composables/use-note.js';
import { prefer } from '@/preferences.js';
import { i18n } from '@/i18n.js';
import { userPage } from '@/filters/user.js';
import { notePage } from '@/filters/note.js';
import { isEnabledUrlPreview } from '@/utility/url-preview.js';
import { Paginator } from '@/utility/paginator.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { getNoteDisplayNodes, getNoteThreadAuthor } from '@/utility/note-display.js';
import { DI } from '@/di.js';
import { useGlobalEvent } from '@/events.js';
import { getDeletedText, toDeletedNote } from '@/utility/deleted-note.js';
import MkLikeSummary from '@/components/MkLikeSummary.vue';
import MkNoteTags from '@/components/MkNoteTags.vue';
import { getNoteTopics } from '@/utility/note-topics.js';
import type { Keymap } from '@/utility/hotkey.js';

// コンポーネント外部の依存関係
import MkNoteSub from '@/components/MkNoteSub.vue';
import MkNote from '@/components/MkNote.vue';
import MkRollingNumber from '@/components/MkRollingNumber.vue';
import MkNoteSimple from '@/components/MkNoteSimple.vue';
import MkNoteHeader from '@/components/MkNoteHeader.vue';
import MkReactionsViewer from '@/components/MkReactionsViewer.vue';
import MkMediaList from '@/components/MkMediaList.vue';
import MkCwButton from '@/components/MkCwButton.vue';
import MkPoll from '@/components/MkPoll.vue';
import MkRedPacket from '@/components/MkRedPacket.vue';
import MkUrlPreview from '@/components/MkUrlPreview.vue';
import MkInstanceTicker from '@/components/MkInstanceTicker.vue';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import MkPagination from '@/components/MkPagination.vue';
import MkReactionIcon from '@/components/MkReactionIcon.vue';

const props = withDefaults(defineProps<{
	note: Misskey.entities.Note;
	initialTab?: 'replies' | 'renotes' | 'reactions';
	separateActivity?: boolean;
}>(), {
	initialTab: 'replies',
	separateActivity: false,
});

// 周辺コンテキストのインジェクト
const inChannel = inject(DI.inChannel, null);

// Template Refsの定義
const rootEl = useTemplateRef('rootEl');
const viewEl = useTemplateRef('viewEl');
const menuButton = useTemplateRef('menuButton');
const renoteButton = useTemplateRef('renoteButton');
const reactButton = useTemplateRef('reactButton');
const clipButton = useTemplateRef('clipButton');
const galleryEl = useTemplateRef('galleryEl');

// コンポーサブルの呼び出し
const {
	note,
	appearNote,
	$appearNote,
	reactionNote,
	$reactionNote,
	hideByPlugin,
	isRenote,
	showContent,
	isDeleted,
	deletedBy,
	translating,
	translation,
	muted,
	canRenote,
	canBoost,
	isMyRenote,
	isRenotedByMe,
	isRenoteTargetDeleted,
	renoteTargetDeletedBy,
	displayedRenoteCount,
	parsed,
	urls,
	showTicker,

	// 関数群
	renote,
	toggleRenote,
	deleteRenote,
	reply,
	react,
	reactViaMfmEmoji,
	toggleReact,
	boostOpen,
	onContextmenu,
	showMenu,
	clip,
	share,
	liking,
	toggleLike,
	blur,
} = useNote(props, {
	rootEl,
	viewEl,
	menuButton,
	renoteButton,
	reactButton,
	clipButton,
}, {
	inChannel,
});

const hasBoosts = computed(() => Object.values($reactionNote.reactions).some(count => count > 0));

// provide
provide(DI.mfmEmojiReactCallback, reactViaMfmEmoji);

// MkNoteDetailed固有
const tab = ref(props.initialTab);
const reactionTabType = ref<string | null>(null);

const renotesPaginator = markRaw(new Paginator('notes/renotes', {
	limit: 10,
	params: {
		noteId: appearNote.id,
	},
}));

const reactionsPaginator = markRaw(new Paginator('notes/reactions', {
	limit: 10,
	computedParams: computed(() => ({
		noteId: reactionNote.id,
		type: reactionTabType.value,
	})),
}));

const replies = ref<Misskey.entities.Note[]>([]);
const deletedReplySources = new Map<string, Misskey.entities.Note['deletedBy']>();
const repliesAbortController = new AbortController();
let disposed = false;

useGlobalEvent('notePosted', note => {
	if (disposed || isDeleted.value || deletedReplySources.has(note.id) || note.replyId !== appearNote.id || replies.value.some(reply => reply.id === note.id)) return;
	replies.value.unshift(note);
});

useGlobalEvent('noteDeleted', (noteId, _replyId, _renoteId, eventDeletedBy) => {
	deletedReplySources.set(noteId, eventDeletedBy ?? deletedReplySources.get(noteId));
	if (noteId === appearNote.id) {
		if (!isRenote) isDeleted.value = true;
		repliesAbortController.abort();
		replies.value = [];
	}
	replies.value = replies.value.map(note => note.id === noteId ? toDeletedNote(note, eventDeletedBy) : note);
});

onBeforeUnmount(() => {
	disposed = true;
	repliesAbortController.abort();
});

function loadReplies() {
	misskeyApi('notes/children', {
		noteId: appearNote.id,
		limit: 30,
	}, undefined, repliesAbortController.signal).then(res => {
		if (disposed || repliesAbortController.signal.aborted) return;
		replies.value = [...replies.value, ...res.filter(note => !replies.value.some(reply => reply.id === note.id)).map(note => deletedReplySources.has(note.id) ? toDeletedNote(note, deletedReplySources.get(note.id)) : note)];
	}).catch(() => undefined);
}

const conversation = ref<Misskey.entities.Note[]>([]);
const replyThread = computed(() => {
	const notes = [...conversation.value];
	if (appearNote.reply != null && !notes.some(note => note.id === appearNote.reply!.id)) {
		notes.push(appearNote.reply);
	}
	return notes;
});
const threadAuthor = computed(() => getNoteThreadAuthor(appearNote) ?? replyThread.value.find(note => note.replyId == null)?.user ?? null);
const topics = computed(() => getNoteTopics(appearNote, getNoteDisplayNodes(appearNote, appearNote.reply?.user ?? threadAuthor.value, parsed.value)));
const displayNodes = computed(() => topics.value.nodes);

function loadConversation() {
	if (appearNote.replyId == null) return;
	misskeyApi('notes/conversation', {
		noteId: appearNote.replyId,
	}, undefined, repliesAbortController.signal).then(res => {
		if (disposed || repliesAbortController.signal.aborted) return;
		conversation.value = res.reverse();
		if (res.some(note => deletedReplySources.has(note.id))) {
			isDeleted.value = true;
			repliesAbortController.abort();
			replies.value = [];
		}
	}).catch(() => undefined);
}

// 回复和上文会话在打开详情页时直接加载，无需用户手动点击
loadReplies();
loadConversation();

// 转发列表同样提前取好：MkPagination 关掉了 autoLoad，切到转发时才开始请求的话，
// 加载态和空占位的高度不同，第一次切换会跳一下
renotesPaginator.init();

// キーボードショートカットマップ
const keymap = {
	'r': () => reply(),
	'e|a|plus': () => react(),
	'q': () => renote(),
	'm': () => showMenu(),
	'c': () => {
		if (!prefer.s.showClipButtonInNoteFooter) return;
		clip();
	},
	'o': () => {
		galleryEl.value?.openGallery();
	},
	'v|enter': () => {
		if (appearNote.cw != null) {
			showContent.value = !showContent.value;
		}
	},
	'esc': {
		allowRepeat: true,
		callback: () => blur(),
	},
} as const satisfies Keymap;
</script>

<style lang="scss" module>
.boostButton {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
	color: var(--MI_THEME-fgTransparentWeak);

	&:hover:not(:disabled) {
		color: var(--MI_THEME-accent);
	}
}

.noteFooterButton.liked { color: var(--MI_THEME-love); }
.root {
	position: relative;
	transition: box-shadow 0.1s ease;
	overflow: clip;
	contain: content;

	&:focus-visible {
		outline: none;

		&::after {
			content: "";
			pointer-events: none;
			display: block;
			position: absolute;
			z-index: 10;
			top: 0;
			left: 0;
			right: 0;
			bottom: 0;
			margin: auto;
			width: calc(100% - 8px);
			height: calc(100% - 8px);
			border: dashed 2px var(--MI_THEME-focus);
			border-radius: var(--MI-radius);
			box-sizing: border-box;
		}
	}
}

.separateActivity {
	display: flex;
	flex-direction: column;
	gap: var(--MI-margin);
}

.card {
	background: var(--MI_THEME-panel);
	border-radius: var(--MI-cardRadius);
	overflow: clip;
}

.activityCard > .tabs {
	border-top: none;
}

.replyThread {
	position: relative;

	~ .note {
		padding-top: 10px;
	}

	~ .renote {
		padding-top: 10px;
	}
}

.replyThreadItem {
	position: relative;

	&::after {
		content: "";
		position: absolute;
		z-index: 1;
		top: 100%;
		// Align the connector with the preceding MkNote avatar center.
		// MkNote 的任何断点都不改这两个值，所以这里可以写死
		left: calc(var(--MI-cardPadding) + 20px);
		width: 1px;
		height: 4px;
		border-radius: 999px;
		background: var(--MI_THEME-divider);
		transform: translateX(-50%);
		pointer-events: none;
	}

	+ .replyThreadItem > .replyThreadNote {
		--MI-note-padding-top: 10px;
	}
}

.replyThreadNote {
	--MI-note-padding-bottom: 10px;
	position: relative;
	z-index: 2;
	font-size: 1em;
}

.deletedReply {
	padding: var(--MI-cardPadding) var(--MI-cardPadding) 10px;
	text-align: center;
	color: var(--MI_THEME-fgTransparentWeak);
}

.renote {
	display: flex;
	align-items: center;
	padding: var(--MI-cardPadding) var(--MI-cardPadding) 0;
	line-height: 20px;
	font-size: 0.9em;
	white-space: pre;
	color: var(--MI_THEME-fgTransparentWeak);
}

.renoteText {
	overflow: hidden;
	flex-shrink: 1;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: inherit;

	&:hover {
		text-decoration: underline;
	}
}

.renoteIcon {
	flex-shrink: 0;
}

.renoteName {
	color: inherit;
}

.renoteInfo {
	margin-left: auto;
	font-size: calc(1em - 1px);
}

.renote + .note {
	padding-top: 4px;
}

.note {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr);
	column-gap: 8px;
	padding: var(--MI-cardPadding);

	&:hover > .main > .footer > .button {
		opacity: 1;
	}
}

// 头像与右侧一列并排，右列内的用户名/正文/操作栏因此自动共享同一条左边缘
.main {
	min-width: 0;
}

.noteHeader {
	display: flex;
	position: relative;
	margin-bottom: 2px;
	align-items: center;
}

.noteHeaderAvatar {
	display: block;
	width: 40px;
	height: 40px;
}

.noteHeaderMenuButton {
	flex-shrink: 0;
	align-self: flex-start;
	display: flex;
	align-items: center;
	justify-content: center;
	height: 20px;
	margin-left: 8px;
	color: var(--MI_THEME-fgTransparentWeak);

	&:hover {
		color: var(--MI_THEME-fgHighlighted);
	}
}

.noteHeaderBody {
	flex: 1;
	display: flex;
	flex-direction: column;
	justify-content: center;
	min-width: 0;
}

.noteContent {
	container-type: inline-size;
	overflow-wrap: break-word;
}

.rn {
	margin-left: 4px;
	font-style: oblique;
	color: var(--MI_THEME-renote);
}

.translation {
	border: solid 0.5px var(--MI_THEME-divider);
	border-radius: var(--MI-radius);
	padding: 12px;
	margin-top: 8px;
}

.poll {
	font-size: 80%;
}

.quote {
	padding: 8px 0;
}

.quoteNote {
	padding: 16px;
	border: dashed 1px var(--MI_THEME-renote);
	border-radius: 8px;
	overflow: clip;
}

// 话题标签与点赞者同行，行高锁定 24px，点赞出现/消失不改变卡片高度
.tagsAndLikeRow {
	display: flex;
	align-items: center;
	gap: 8px;
	min-height: 24px;
	margin-top: 12px;

	&:empty {
		display: none;
	}
}

.noteFooterInfo {
	margin: 16px 0;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.9em;
}

.noteFooterActions {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
	gap: 12px;
	align-items: center;
	min-height: 20px;
	margin-top: 12px;
}

.footerButtonSlot {
	flex: 1 1 0;
	min-width: max-content;
}

.footerIconActions {
	display: flex;
	flex: 0 0 auto;
	align-items: center;
	gap: 12px;
}

.noteFooterButton {
	--MI-noteActionColor: var(--MI_THEME-accent);
	position: relative;
	flex: 0 0 auto;
	display: flex;
	align-items: center;
	justify-content: flex-start;
	gap: 10px;
	width: max-content;
	min-width: max-content;
	box-sizing: border-box;
	min-height: 20px;
	margin: 0;
	padding: 0;
	color: var(--MI_THEME-fgTransparentWeak);

	&,
	&:disabled {
		cursor: pointer;
	}

	> i {
		flex: 0 0 auto;
		position: relative;
		isolation: isolate;
		width: 1.28em;
		height: 1.28em;
		line-height: 1.28em;
		text-align: center;

		&::after {
			content: '';
			position: absolute;
			top: 50%;
			left: 50%;
			width: calc(100% + 16px);
			height: calc(100% + 16px);
			transform: translate(-50%, -50%);
			z-index: -1;
			border-radius: 9999px;
			background: transparent;
		}
	}

	&:is(:hover, :focus-visible) {
		color: var(--MI-noteActionColor);

		> i::after {
			background: color-mix(in srgb, var(--MI-noteActionColor) 10%, transparent);
		}
	}

	&:focus-visible {
		outline: none;

		> i::after {
			box-shadow: 0 0 0 2px var(--MI_THEME-focus);
		}
	}
}

.footerAnimated {
	.noteFooterButton {
		transition: color 200ms ease;

		> i::after {
			transition: background-color 200ms ease, box-shadow 200ms ease;
		}
	}
}

.renoteButton {
	--MI-noteActionColor: var(--MI_THEME-renote);
}

.likeButton {
	--MI-noteActionColor: var(--MI_THEME-love);
}

.renoted {
	color: var(--MI_THEME-renote);
}

.noteFooterButtonCount {
	margin: 0;
	font-size: 12px;
	white-space: nowrap;
	pointer-events: none;
}

.reply:not(:first-child) {
	border-top: solid 0.5px var(--MI_THEME-divider);
}

.tabs {
	border-top: solid 0.5px var(--MI_THEME-divider);
	border-bottom: solid 0.5px var(--MI_THEME-divider);
	display: flex;
	justify-content: space-around;
}

.tab {
	padding: 14px 0;
	color: var(--MI_THEME-fgTransparentWeak);
	transition: color 0.15s ease;
}

.tabActive {
	color: var(--MI_THEME-accent);
}

.tab_renotes {
	padding: var(--MI-cardPadding);
}

.tab_reactions {
	padding: var(--MI-cardPadding);
}

.tabEmpty {
	padding: var(--MI-cardPadding);
}

.reactionTabs {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
	margin-bottom: 8px;
}

.reactionTab {
	padding: 4px 6px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 6px;
}

.reactionTabActive {
	border-color: color-mix(in srgb, var(--MI_THEME-accent) 45%, var(--MI_THEME-divider));
	background: var(--MI_THEME-accentedBg);
}

@container (max-width: 500px) {
	.root {
		font-size: 0.9em;
	}
}

@container (max-width: 300px) {
	.root {
		font-size: 0.825em;
	}

}

.muted {
	padding: 8px;
	text-align: center;
	color: var(--MI_THEME-fgTransparentWeak);
}

.deleted {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 12px;
	text-align: center;
	padding: 32px;
	margin: 6px 32px 32px;
	--color: light-dark(rgba(0, 0, 0, 0.05), rgba(0, 0, 0, 0.15));
	background-size: auto auto;
	background-image: repeating-linear-gradient(135deg, transparent, transparent 10px, var(--color) 4px, var(--color) 14px);
	border-radius: 8px;
}

.deletedRenoteAction {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 4px 8px;
	color: var(--MI_THEME-fg);

	&:hover {
		color: var(--MI_THEME-danger);
		text-decoration: underline;
	}
}
</style>
