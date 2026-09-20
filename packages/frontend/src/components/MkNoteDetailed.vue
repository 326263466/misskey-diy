<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div
	v-if="!muted && !hideByPlugin && !isDeleted"
	ref="rootEl"
	v-hotkey="keymap"
	:class="$style.root"
	tabindex="0"
>
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
			<span v-if="note.localOnly" style="margin-left: 0.5em;" :title="i18n.ts._visibility['disableFederation']"><i class="ti ti-rocket-off"></i></span>
		</div>
	</div>
	<div v-if="isRenoteTargetDeleted" :class="$style.deleted">
		<span>{{ getDeletedText(renoteTargetDeletedBy) }}</span>
		<button v-if="isMyRenote" type="button" class="_button" :class="$style.deletedRenoteAction" @click.stop="deleteRenote()">
			<i class="ti ti-trash"></i>
			<span>{{ i18n.ts.delete }}</span>
		</button>
	</div>
	<template v-else>
		<article ref="viewEl" :class="$style.note" @contextmenu.stop="onContextmenu">
			<MkAvatar :class="$style.noteHeaderAvatar" :user="appearNote.user" indicator link preview/>
			<div :class="$style.main">
				<header :class="$style.noteHeader">
					<div :class="$style.noteHeaderBody">
						<div :class="$style.noteHeaderNameRow">
							<MkA v-user-preview="appearNote.user.id" :class="$style.noteHeaderName" :to="userPage(appearNote.user)">
								<MkUserName :nowrap="false" :user="appearNote.user"/>
							</MkA>
							<span v-if="appearNote.user.isBot" :class="$style.isBot">bot</span>
							<div :class="$style.noteHeaderInfo">
								<span v-if="appearNote.visibility !== 'public'" style="margin-left: 0.5em;" :title="i18n.ts._visibility[appearNote.visibility]">
									<i v-if="appearNote.visibility === 'home'" class="ti ti-home"></i>
									<i v-else-if="appearNote.visibility === 'followers'" class="ti ti-lock"></i>
									<i v-else-if="appearNote.visibility === 'specified'" ref="specified" class="ti ti-mail"></i>
								</span>
								<span v-if="appearNote.localOnly" style="margin-left: 0.5em;" :title="i18n.ts._visibility['disableFederation']"><i class="ti ti-rocket-off"></i></span>
							</div>
						</div>
						<div :class="$style.noteHeaderUsernameAndBadgeRoles">
							<div :class="$style.noteHeaderUsername">
								<MkAcct :user="appearNote.user"/>
							</div>
							<div v-if="appearNote.user.badgeRoles" :class="$style.noteHeaderBadgeRoles">
								<img v-for="(role, i) in appearNote.user.badgeRoles" :key="i" v-tooltip="role.name" :class="$style.noteHeaderBadgeRole" :src="role.iconUrl!"/>
							</div>
						</div>
						<MkInstanceTicker v-if="showTicker" :host="appearNote.user.host" :instance="appearNote.user.instance"/>
					</div>
					<button ref="menuButton" v-tooltip="i18n.ts.more" class="_button" :class="$style.noteHeaderMenuButton" :aria-label="i18n.ts.more" @click.stop="showMenu()">
						<i class="ti ti-dots"></i>
					</button>
				</header>
				<div :class="$style.noteContent">
					<p v-if="appearNote.cw != null" :class="$style.cw">
						<Mfm
							v-if="appearNote.cw != ''"
							:text="appearNote.cw"
							:author="appearNote.user"
							:nyaize="'respect'"
							:enableEmojiMenu="true"
							:enableEmojiMenuReaction="true"
						/>
						<MkCwButton v-model="showContent" :text="appearNote.text" :renote="appearNote.renote" :files="appearNote.files" :poll="appearNote.poll"/>
					</p>
					<div v-show="appearNote.cw == null || showContent">
						<span v-if="appearNote.isHidden" style="opacity: 0.5">({{ i18n.ts.private }})</span>
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
					<MkA v-if="appearNote.channel && !inChannel" :class="$style.channel" :to="`/channels/${appearNote.channel.id}`"><i class="ti ti-device-tv"></i> {{ appearNote.channel.name }}</MkA>
				</div>
				<footer>
					<div :class="$style.noteFooterInfo">
						<MkA :to="notePage(appearNote)">
							<MkTime :time="appearNote.createdAt" mode="detail" colored/>
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
						<template #boost>
							<button v-if="canBoost" ref="reactButton" :class="$style.boostButton" class="_button" :aria-label="i18n.ts._boost.title" aria-haspopup="dialog" :aria-expanded="boostOpen" @click.stop="toggleReact()" @pointerenter="hoverReact" @pointerleave="cancelHoverReact">
								<i class="ti ti-rocket" aria-hidden="true"></i>
							</button>
						</template>
					</MkReactionsViewer>
					<div :class="$style.tagsAndLikeRow">
						<MkNoteTags v-if="appearNote.cw == null || showContent" :tags="topics.tags"/>
						<MkLikeSummary :noteId="appearNote.id" :count="$appearNote.likeCount" :users="$appearNote.likeUsers"/>
					</div>
					<div :class="$style.noteFooterActions">
						<button v-tooltip="i18n.ts.share" class="_button" :class="$style.noteFooterButton" :aria-label="i18n.ts.share" @click.stop="share()">
							<i class="ti ti-share"></i>
						</button>
						<button v-tooltip="i18n.ts.reply" class="_button" :class="$style.noteFooterButton" :aria-label="i18n.ts.reply" @click.stop="reply()">
							<i class="ti ti-message-circle"></i>
							<MkRollingNumber :class="$style.noteFooterButtonCount" :value="$appearNote.repliesCount"/>
						</button>
						<button v-tooltip="i18n.ts.like" class="_button" :class="[$style.noteFooterButton, { [$style.liked]: $appearNote.isLiked }]" :aria-label="i18n.ts.like" :aria-pressed="$appearNote.isLiked" :disabled="liking" @click.stop="toggleLike()">
							<i :class="$appearNote.isLiked ? 'ti ti-thumb-up-filled' : 'ti ti-thumb-up'"></i>
							<MkRollingNumber :class="$style.noteFooterButtonCount" :value="$appearNote.likeCount"/>
						</button>
						<button
							v-if="canRenote || isRenote"
							ref="renoteButton"
							class="_button"
							:class="[$style.noteFooterButton, { [$style.renoted]: isRenotedByMe }]"
							:aria-label="isRenote ? i18n.ts.more : i18n.ts.renote"
							@click.stop="toggleRenote()"
							@keydown.enter.stop
						>
							<i class="ti ti-repeat"></i>
							<MkRollingNumber :class="$style.noteFooterButtonCount" :value="displayedRenoteCount"/>
						</button>
						<button v-else class="_button" :class="$style.noteFooterButton" :aria-label="i18n.ts.renote" disabled>
							<i class="ti ti-ban"></i>
						</button>
						<span v-tooltip="i18n.ts.viewsCount" :class="[$style.noteFooterButton, $style.noteFooterButtonPlaceholder]" :aria-label="i18n.ts.viewsCount">
							<i class="ti ti-chart-bar" aria-hidden="true"></i>
							<MkRollingNumber :class="$style.noteFooterButtonCount" :value="$appearNote.viewsCount"/>
						</span>
						<button v-if="prefer.s.showClipButtonInNoteFooter" ref="clipButton" v-tooltip="i18n.ts.clip" class="_button" :class="$style.noteFooterButton" :aria-label="i18n.ts.clip" @click.stop="clip()">
							<i class="ti ti-paperclip"></i>
						</button>
					</div>
				</footer>
			</div>
		</article>
		<div :class="$style.tabs">
			<button class="_button" :class="[$style.tab, { [$style.tabActive]: tab === 'replies' }]" @click="tab = 'replies'"><i class="ti ti-message-circle"></i> {{ i18n.ts.replies }}</button>
			<button class="_button" :class="[$style.tab, { [$style.tabActive]: tab === 'renotes' }]" @click="tab = 'renotes'"><i class="ti ti-repeat"></i> {{ i18n.ts.renotes }}</button>
			<button class="_button" :class="[$style.tab, { [$style.tabActive]: tab === 'reactions' }]" @click="tab = 'reactions'"><i class="ti ti-rocket"></i> {{ i18n.ts._boost.title }}</button>
		</div>
		<div>
			<div v-if="tab === 'replies'">
				<MkNoteSub v-for="note in replies" :key="note.id" :note="note" :class="$style.reply" :detail="true" :threadAuthor="threadAuthor" :parentComment="appearNote"/>
			</div>
			<div v-else-if="tab === 'renotes'" :class="$style.tab_renotes">
				<MkPagination :paginator="renotesPaginator">
					<template #default="{ items }">
						<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); grid-gap: 12px;">
							<MkA v-for="item in items" :key="item.id" :to="userPage(item.user)">
								<MkUserCardMini :user="item.user" :withChart="false"/>
							</MkA>
						</div>
					</template>
				</MkPagination>
			</div>
			<div v-else-if="tab === 'reactions'" :class="$style.tab_reactions">
				<div :class="$style.reactionTabs">
					<button v-for="reaction in Object.keys($reactionNote.reactions)" :key="reaction" :class="[$style.reactionTab, { [$style.reactionTabActive]: reactionTabType === reaction }]" class="_button" @click="reactionTabType = reaction">
						<MkReactionIcon :allowTextBoost="true" :reaction="reaction"/>
						<span style="margin-left: 4px;">{{ $reactionNote.reactions[reaction] }}</span>
					</button>
				</div>
				<MkPagination v-if="reactionTabType" :key="reactionTabType" :paginator="reactionsPaginator">
					<template #default="{ items }">
						<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); grid-gap: 12px;">
							<MkA v-for="item in items" :key="item.id" :to="userPage(item.user)">
								<MkUserCardMini :user="item.user" :withChart="false"/>
							</MkA>
						</div>
					</template>
				</MkPagination>
			</div>
		</div>
	</template>
</div>
<div v-else-if="isDeleted" class="_panel" :class="$style.deleted">
	<span>{{ getDeletedText(deletedBy) }}</span>
</div>
<div v-else-if="muted" class="_panel" :class="$style.muted" @click="muted = false">
	<I18n :src="i18n.ts.userSaysSomething" tag="small">
		<template #name>
			<MkA v-user-preview="appearNote.userId" :to="userPage(appearNote.user)">
				<MkUserName :user="appearNote.user"/>
			</MkA>
		</template>
	</I18n>
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
import MkReactionsViewer from '@/components/MkReactionsViewer.vue';
import MkMediaList from '@/components/MkMediaList.vue';
import MkCwButton from '@/components/MkCwButton.vue';
import MkPoll from '@/components/MkPoll.vue';
import MkUrlPreview from '@/components/MkUrlPreview.vue';
import MkInstanceTicker from '@/components/MkInstanceTicker.vue';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import MkPagination from '@/components/MkPagination.vue';
import MkReactionIcon from '@/components/MkReactionIcon.vue';

const props = withDefaults(defineProps<{
	note: Misskey.entities.Note;
	initialTab?: 'replies' | 'renotes' | 'reactions';
}>(), {
	initialTab: 'replies',
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
	hoverReact,
	cancelHoverReact,
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
.noteFooterButton.liked { color: var(--MI_THEME-accent); }
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

.replyThread {
	position: relative;
}

.replyThreadItem {
	position: relative;

	&::after {
		content: "";
		position: absolute;
		z-index: 1;
		top: 100%;
		// 上文渲染的是 MkNote，40px = 它的卡片内边距 20px + 头像半径 20px。
		// MkNote 的任何断点都不改这两个值，所以这里可以写死
		left: 40px;
		width: 1px;
		height: 14px;
		border-radius: 999px;
		background: var(--MI_THEME-divider);
		transform: translateX(-50%);
		pointer-events: none;
	}

	&:last-child::after {
		height: 6px;
	}
}

.replyThreadNote {
	position: relative;
	z-index: 2;
	font-size: 1em;
}

.deletedReply {
	padding: 12px 20px;
	text-align: center;
	opacity: 0.7;
}

.renote {
	display: flex;
	align-items: center;
	padding: 12px 20px 0;
	line-height: 20px;
	font-size: 0.9em;
	white-space: pre;
	color: var(--MI_THEME-fg);
	opacity: 0.7;
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
	padding: 12px 20px;

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
	opacity: 0.7;

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

.noteHeaderName {
	min-width: 0;
	font-weight: bold;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.noteHeaderNameRow {
	display: flex;
	align-items: center;
	min-width: 0;
}

.isBot {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	box-sizing: border-box;
	margin: 0 0.5em;
	padding: 0 4px;
	height: calc(1em + 1px);
	font-size: calc(1em - 1px);
	line-height: 1;
	border: solid 0.5px var(--MI_THEME-divider);
	border-radius: 4px;
}

.noteHeaderInfo {
	flex-shrink: 0;
	margin-left: auto;
	font-size: calc(1em - 1px);
}

.noteHeaderUsernameAndBadgeRoles {
	display: flex;
}

.noteHeaderUsername {
	min-width: 0;
	margin-bottom: 2px;
	margin-right: 0.5em;
	font-size: calc(1em - 1px);
	line-height: 1.3;
	word-wrap: anywhere;
}

.noteHeaderBadgeRoles {
	flex-shrink: 0;
	margin: 0 .5em 0 0;
	font-size: calc(1em - 1px);
}

.noteHeaderBadgeRole {
	height: 1.3em;
	vertical-align: -20%;

	& + .noteHeaderBadgeRole {
		margin-left: 0.2em;
	}
}

.noteContent {
	container-type: inline-size;
	overflow-wrap: break-word;
}

.cw {
	cursor: default;
	display: block;
	margin: 0;
	padding: 0;
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

.channel {
	opacity: 0.7;
	font-size: 80%;
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
	opacity: 0.7;
	font-size: 0.9em;
}

.noteFooterActions {
	display: flex;
	flex-wrap: wrap;
	// 首尾贴齐两端，中间等距分布
	justify-content: space-between;
	gap: 8px 4px;
	align-items: center;
	min-height: 20px;
	margin-top: 12px;
}

.noteFooterButton {
	position: relative;
	// 只占内容宽度，避免图标旁的空白也命中 hover
	flex: 0 0 auto;
	display: flex;
	align-items: center;
	justify-content: flex-start;
	gap: 3px;
	min-width: 0;
	box-sizing: border-box;
	height: 20px;
	margin: 0;
	padding: 0;
	opacity: 0.7;

	&:hover {
		color: var(--MI_THEME-fgHighlighted);
	}
}

.noteFooterButtonPlaceholder {
	cursor: default;
}

// リアクション行の末尾に並ぶBoost追加ボタン。バブルと同じ丸さで揃える
.boostButton {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 32px;
	height: 32px;
	color: color-mix(in srgb, var(--MI_THEME-panel), var(--MI_THEME-fg) 70%);

	&:hover {
		color: var(--MI_THEME-fgHighlighted);
	}
}

.renoted {
	color: var(--MI_THEME-renote);
}

.noteFooterButtonCount {
	margin: 0;
	font-size: 12px;
	white-space: nowrap;
	pointer-events: none;
	opacity: 0.7;

	&.reacted {
		color: var(--MI_THEME-accent);
	}
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
	padding: 12px 0;
	border-top: solid 2px transparent;
	border-bottom: solid 2px transparent;
}

.tabActive {
	border-bottom: solid 2px var(--MI_THEME-accent);
}

.tab_renotes {
	padding: 16px;
}

.tab_reactions {
	padding: 16px;
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
	border-color: var(--MI_THEME-accent);
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
	opacity: 0.7;
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
