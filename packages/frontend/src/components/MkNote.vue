<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div
	v-if="!hardMuted && !hideByPlugin && muted === false"
	ref="rootEl"
	v-hotkey="keymap"
	:class="[$style.root, { [$style.showActionsOnlyHover]: prefer.s.showNoteActionsOnlyHover, [$style.skipRender]: prefer.s.skipNoteRender }]"
	tabindex="0"
>
	<div v-if="showReplyTo && appearNote.replyId && !renoteCollapsed" :class="$style.replyThreadItem">
		<MkNote
			v-if="appearNote.reply"
			:note="appearNote.reply"
			:showReplyTo="false"
			:mock="mock"
			:withHardMute="withHardMute"
			:class="$style.replyThreadNote"
		/>
		<div v-else :class="$style.deletedReply">{{ i18n.ts.deletedNote }}</div>
	</div>
	<div v-if="pinned" :class="$style.tip"><i class="ti ti-pin"></i> {{ i18n.ts.pinnedNote }}</div>
	<div v-if="isRenote" :class="$style.renote">
		<div v-if="note.channel" :class="$style.colorBar" :style="{ background: note.channel.color }"></div>
		<i class="ti ti-repeat" :class="$style.renoteIcon"></i>{{ ' ' }}
		<MkA v-user-preview="note.userId" :class="$style.renoteText" :to="userPage(note.user)">
			<span :class="$style.renoteUserName">
				<span v-if="isMyRenote">{{ i18n.ts.you }}</span>
				<MkUserName v-else :user="note.user"/>
			</span>{{ ' ' }}{{ i18n.ts.renoted }}
		</MkA>
		<div v-if="note.visibility !== 'public' || note.localOnly || note.channel" :class="$style.renoteInfo">
			<span v-if="note.visibility !== 'public'" style="margin-left: 0.5em;" :title="i18n.ts._visibility[note.visibility]">
				<i v-if="note.visibility === 'home'" class="ti ti-home"></i>
				<i v-else-if="note.visibility === 'followers'" class="ti ti-lock"></i>
				<i v-else-if="note.visibility === 'specified'" ref="specified" class="ti ti-mail"></i>
			</span>
			<span v-if="note.localOnly" style="margin-left: 0.5em;" :title="i18n.ts._visibility['disableFederation']"><i class="ti ti-rocket-off"></i></span>
			<span v-if="note.channel" style="margin-left: 0.5em;" :title="note.channel.name"><i class="ti ti-device-tv"></i></span>
		</div>
	</div>
	<div v-if="isRenoteTargetDeleted" :class="$style.deleted">
		<span>{{ i18n.ts.deletedNote }}</span>
		<button v-if="isMyRenote" type="button" class="_button" :class="$style.deletedRenoteAction" @click.stop="deleteRenote()">
			<i class="ti ti-trash"></i>
			<span>{{ i18n.ts.delete }}</span>
		</button>
	</div>
	<div v-else-if="renoteCollapsed" :class="[$style.article, $style.collapsedRenoteTarget]">
		<MkAvatar :class="$style.avatar" :user="appearNote.user" :link="!mock" :preview="!mock"/>
		<Mfm :text="getNoteSummary(appearNote)" :plain="true" :nowrap="true" :author="appearNote.user" :nyaize="'respect'" :class="$style.collapsedRenoteTargetText" @click="renoteCollapsed = false"/>
	</div>
	<article v-else :class="$style.article" @contextmenu.stop="onContextmenu">
		<div v-if="appearNote.channel" :class="$style.colorBar" :style="{ background: appearNote.channel.color }"></div>
		<MkAvatar :class="[$style.avatar, prefer.s.useStickyIcons ? $style.useSticky : null]" :user="appearNote.user" :link="!mock" :preview="!mock"/>
		<div :class="$style.main">
			<div :class="$style.headerRow">
				<MkNoteHeader :note="appearNote" :mini="true" :class="$style.header"/>
				<button ref="menuButton" :class="$style.headerMenuButton" class="_button" @mousedown.prevent="showMenu()">
					<i class="ti ti-dots"></i>
				</button>
			</div>
			<MkInstanceTicker v-if="showTicker" :host="appearNote.user.host" :instance="appearNote.user.instance"/>
			<div style="container-type: inline-size;">
				<p v-if="appearNote.cw != null" :class="$style.cw">
					<Mfm
						v-if="appearNote.cw != ''"
						:text="appearNote.cw"
						:author="appearNote.user"
						:nyaize="'respect'"
						:enableEmojiMenu="true"
						:enableEmojiMenuReaction="true"
					/>
					<MkCwButton v-model="showContent" :text="appearNote.text" :renote="appearNote.renote" :files="appearNote.files" :poll="appearNote.poll" style="margin: 4px 0;"/>
				</p>
				<div v-show="appearNote.cw == null || showContent" :class="[{ [$style.contentCollapsed]: collapsed }]">
					<div :class="$style.text">
						<span v-if="appearNote.isHidden" style="opacity: 0.5">({{ i18n.ts.private }})</span>
						<MkA v-if="appearNote.replyId && !showReplyTo" :class="$style.replyIcon" :to="`/notes/${appearNote.replyId}`"><i class="ti ti-message-circle"></i></MkA>
						<Mfm
							v-if="appearNote.text"
							:parsedNodes="parsed"
							:text="appearNote.text"
							:author="appearNote.user"
							:nyaize="'respect'"
							:emojiUrls="appearNote.emojis"
							:enableEmojiMenu="true"
							:enableEmojiMenuReaction="true"
							class="_selectable"
						/>
						<div v-if="translating || translation" :class="$style.translation">
							<MkLoading v-if="translating" mini/>
							<div v-else-if="translation">
								<b>{{ i18n.tsx.translatedFrom({ x: translation.sourceLang }) }}: </b>
								<Mfm :text="translation.text" :author="appearNote.user" :nyaize="'respect'" :emojiUrls="appearNote.emojis" class="_selectable"/>
							</div>
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
						<MkUrlPreview v-for="url in urls" :key="url" :url="url" :compact="true" :detail="false" :class="$style.urlPreview"/>
					</div>
					<div v-if="appearNote.renoteId" :class="$style.quote"><MkNoteSimple :note="appearNote?.renote ?? null" :class="$style.quoteNote"/></div>
					<button v-if="isLong && collapsed" :class="$style.collapsed" class="_button" @click="collapsed = false">
						<span :class="$style.collapsedLabel">{{ i18n.ts.showMore }}</span>
					</button>
					<button v-else-if="isLong && !collapsed" :class="$style.showLess" class="_button" @click="collapsed = true">
						<span :class="$style.showLessLabel">{{ i18n.ts.showLess }}</span>
					</button>
				</div>
				<MkA v-if="appearNote.channel && !inChannel" :class="$style.channel" :to="`/channels/${appearNote.channel.id}`"><i class="ti ti-device-tv"></i> {{ appearNote.channel.name }}</MkA>
			</div>
			<MkReactionsViewer
				v-if="appearNote.reactionAcceptance !== 'likeOnly'"
				style="margin-top: 6px;"
				:reactions="$reactionNote.reactions"
				:reactionEmojis="$reactionNote.reactionEmojis"
				:myReaction="$reactionNote.myReaction"
				:noteId="reactionNote.id"
				:maxNumber="16"
				@mockUpdateMyReaction="emitUpdReaction"
			>
				<template #more>
					<MkA :to="`/notes/${reactionNote.id}/reactions`" :class="[$style.reactionOmitted]">{{ i18n.ts.more }}</MkA>
				</template>
			</MkReactionsViewer>
			<footer :class="$style.footer">
				<button :class="$style.footerButton" class="_button" @click="reply()">
					<i class="ti ti-message-circle"></i>
					<MkRollingNumber :class="$style.footerButtonCount" :value="$appearNote.repliesCount"/>
				</button>
				<button
					v-if="canRenote || isRenotedByMe"
					ref="renoteButton"
					:class="[$style.footerButton, { [$style.renoted]: isRenotedByMe }]"
					class="_button"
					:aria-label="isRenotedByMe ? i18n.ts.more : i18n.ts.renote"
					@click.stop="toggleRenote()"
					@keydown.enter.stop
				>
					<i class="ti ti-repeat"></i>
					<MkRollingNumber :class="$style.footerButtonCount" :value="displayedRenoteCount"/>
				</button>
				<button v-else :class="$style.footerButton" class="_button" disabled>
					<i class="ti ti-ban"></i>
				</button>
				<button ref="reactButton" :class="$style.footerButton" class="_button" @click="handleToggleReact()">
					<i v-if="appearNote.reactionAcceptance === 'likeOnly' && $reactionNote.myReaction != null" class="ti ti-heart-filled" style="color: var(--MI_THEME-love);"></i>
					<i v-else-if="$reactionNote.myReaction != null" class="ti ti-minus" style="color: var(--MI_THEME-accent);"></i>
					<i v-else-if="appearNote.reactionAcceptance === 'likeOnly'" class="ti ti-heart"></i>
					<i v-else class="ti ti-plus"></i>
					<MkRollingNumber
						v-if="appearNote.reactionAcceptance === 'likeOnly' || prefer.s.showReactionsCount"
						:class="$style.footerButtonCount"
						:value="$reactionNote.reactionCount"
					/>
				</button>
				<span :class="[$style.footerButton, $style.footerButtonPlaceholder]" aria-hidden="true"><i class="ti ti-chart-bar"></i></span>
				<button v-if="prefer.s.showClipButtonInNoteFooter" ref="clipButton" :class="$style.footerButton" class="_button" @mousedown.prevent="clip()">
					<i class="ti ti-paperclip"></i>
				</button>
				<button :class="$style.footerButton" class="_button" @mousedown.prevent="toggleFavorite()">
					<i v-if="isFavorited" class="ti ti-star-off"></i>
					<i v-else class="ti ti-star"></i>
				</button>
				<button v-if="canShare" :class="$style.footerButton" class="_button" @mousedown.prevent="share()">
					<i class="ti ti-share"></i>
				</button>
			</footer>
		</div>
	</article>
</div>
<div v-else-if="!hardMuted && !hideByPlugin" :class="$style.muted" @click="muted = false">
	<I18n v-if="muted === 'sensitiveMute'" :src="i18n.ts.userSaysSomethingSensitive" tag="small">
		<template #name>
			<MkA v-user-preview="appearNote.userId" :to="userPage(appearNote.user)">
				<MkUserName :user="appearNote.user"/>
			</MkA>
		</template>
	</I18n>
	<I18n v-else-if="showSoftWordMutedWord !== true" :src="i18n.ts.userSaysSomething" tag="small">
		<template #name>
			<MkA v-user-preview="appearNote.userId" :to="userPage(appearNote.user)">
				<MkUserName :user="appearNote.user"/>
			</MkA>
		</template>
	</I18n>
	<I18n v-else :src="i18n.ts.userSaysSomethingAbout" tag="small">
		<template #name>
			<MkA v-user-preview="appearNote.userId" :to="userPage(appearNote.user)">
				<MkUserName :user="appearNote.user"/>
			</MkA>
		</template>
		<template #word>
			{{ Array.isArray(muted) ? muted.map(words => Array.isArray(words) ? words.join() : words).slice(0, 3).join(' ') : muted }}
		</template>
	</I18n>
</div>
<div v-else>
	<!--
		MkDateSeparatedList uses TransitionGroup which requires single element in the child elements
		so MkNote create empty div instead of no elements
	-->
</div>
</template>

<script lang="ts" setup>
import { inject, ref, useTemplateRef, provide, computed } from 'vue';
import type { Ref } from 'vue';
import * as Misskey from 'misskey-js';
import { useNote } from '@/composables/use-note.js';
import { prefer } from '@/preferences.js';
import { i18n } from '@/i18n.js';
import { userPage } from '@/filters/user.js';
import { getNoteSummary } from '@/utility/get-note-summary.js';
import { isEnabledUrlPreview } from '@/utility/url-preview.js';
import { focusPrev, focusNext } from '@/utility/focus.js';
import { DI } from '@/di.js';
import type { Keymap } from '@/utility/hotkey.js';

// コンポーネント外部の依存関係
import MkNoteHeader from '@/components/MkNoteHeader.vue';
import MkNoteSimple from '@/components/MkNoteSimple.vue';
import MkReactionsViewer from '@/components/MkReactionsViewer.vue';
import MkMediaList from '@/components/MkMediaList.vue';
import MkCwButton from '@/components/MkCwButton.vue';
import MkPoll from '@/components/MkPoll.vue';
import MkUrlPreview from '@/components/MkUrlPreview.vue';
import MkInstanceTicker from '@/components/MkInstanceTicker.vue';
import MkRollingNumber from '@/components/MkRollingNumber.vue';

const props = withDefaults(defineProps<{
	note: Misskey.entities.Note;
	pinned?: boolean;
	mock?: boolean;
	withHardMute?: boolean;
	showReplyTo?: boolean;
}>(), {
	mock: false,
	showReplyTo: true,
});

const emit = defineEmits<{
	(ev: 'reaction', emoji: string): void;
	(ev: 'removeReaction', emoji: string): void;
}>();

provide(DI.mock, props.mock);

// 周辺コンテキストのインジェクト
const inTimeline = inject<boolean>('inTimeline', false);
const tl_withSensitive = inject<Ref<boolean>>('tl_withSensitive', ref(true));
const inChannel = inject(DI.inChannel, null);
const currentClip = inject<Ref<Misskey.entities.Clip> | null>('currentClip', null);
const currentAntenna = inject<Ref<Misskey.entities.Antenna | null> | null>('currentAntenna', null);

// Template Refsの定義
const rootEl = useTemplateRef('rootEl');
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
	translating,
	translation,
	muted,
	hardMuted,
	isMyRenote,
	isRenotedByMe,
	isRenoteTargetDeleted,
	displayedRenoteCount,
	collapsed,
	renoteCollapsed,
	parsed,
	urls,
	isLong,
	showTicker,
	canRenote,
	isFavorited,
	canShare,

	renote,
	toggleRenote,
	deleteRenote,
	reply,
	react,
	reactViaMfmEmoji,
	toggleReact,
	onContextmenu,
	showMenu,
	clip,
	share,
	toggleFavorite,
	blur,
} = useNote(props, {
	rootEl,
	menuButton,
	renoteButton,
	reactButton,
	clipButton,
}, {
	inTimeline,
	tl_withSensitive,
	inChannel,
	currentClip,
	currentAntenna,
});

// provide
provide(DI.mfmEmojiReactCallback, reactViaMfmEmoji);

// MkNote固有
const showSoftWordMutedWord = computed(() => prefer.s.showSoftWordMutedWord);

function handleToggleReact() {
	toggleReact((reaction) => {
		if ($reactionNote.myReaction === reaction) {
			emit('removeReaction', reaction);
		} else {
			emit('reaction', reaction);
			$reactionNote.reactions[reaction] = 1;
			$reactionNote.reactionCount++;
			$reactionNote.myReaction = reaction;
		}
	});
}

function emitUpdReaction(emoji: string, delta: number) {
	if (delta < 0) {
		emit('removeReaction', emoji);
	} else if (delta > 0) {
		emit('reaction', emoji);
	}
}

// キーボードショートカットマップ
const keymap = {
	'r': () => {
		if (renoteCollapsed.value) return;
		reply();
	},
	'e|a|plus': () => {
		if (renoteCollapsed.value) return;
		react();
	},
	'q': () => {
		if (renoteCollapsed.value) return;
		renote();
	},
	'm': () => {
		if (renoteCollapsed.value) return;
		showMenu();
	},
	'c': () => {
		if (renoteCollapsed.value) return;
		if (!prefer.s.showClipButtonInNoteFooter) return;
		clip();
	},
	'o': () => {
		if (renoteCollapsed.value) return;
		galleryEl.value?.openGallery();
	},
	'v|enter': () => {
		if (renoteCollapsed.value) {
			renoteCollapsed.value = false;
		} else if (appearNote.cw != null) {
			showContent.value = !showContent.value;
		} else if (isLong) {
			collapsed.value = !collapsed.value;
		}
	},
	'esc': {
		allowRepeat: true,
		callback: () => blur(),
	},
	'up|k|shift+tab': {
		allowRepeat: true,
		callback: () => focusPrev(rootEl.value),
	},
	'down|j|tab': {
		allowRepeat: true,
		callback: () => focusNext(rootEl.value),
	},
} as const satisfies Keymap;
</script>

<style lang="scss" module>
.root {
	position: relative;
	font-size: 1.05em;
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

	.footer {
		position: relative;
		z-index: 1;
	}

	&.showActionsOnlyHover {
		.footer {
			visibility: hidden;
			position: absolute;
			top: 12px;
			right: 12px;
			justify-content: flex-start;
			padding: 0 4px;
			margin-bottom: 0 !important;
			background: var(--MI_THEME-popup);
			border-radius: 8px;
			box-shadow: 0px 4px 32px var(--MI_THEME-shadow);
		}

		.footerButton {
			font-size: 90%;
		}
	}

	&.showActionsOnlyHover:hover {
		.footer {
			visibility: visible;
		}
	}
}

.skipRender {
	// TODO: これが有効だとTransitionGroupでnoteを追加するときに一瞬がくっとなってしまうのをどうにかしたい
	// Transitionが完了するのを待ってからskipRenderを付与すれば解決しそうだけどパフォーマンス的な影響が不明
	content-visibility: auto;
	contain-intrinsic-size: 0 150px;
}

.tip {
	display: flex;
	align-items: center;
	padding: 16px 32px 8px 32px;
	line-height: 24px;
	font-size: 90%;
	white-space: pre;
	color: #d28a3f;
}

.tip + .article {
	padding-top: 8px;
}

.replyThreadItem {
	position: relative;

	&::after {
		content: "";
		position: absolute;
		z-index: 1;
		// 随卡片内边距 20px 调整：纵向接在头像下方，横向对齐头像中心
		top: 66px;
		bottom: -6px;
		left: 39px;
		width: 2px;
		border-radius: 999px;
		background: var(--MI_THEME-divider);
		pointer-events: none;
	}
}

.replyThreadNote {
	position: relative;
	z-index: 2;
	font-size: 1em;
}

.deletedReply {
	position: relative;
	z-index: 2;
	padding: 12px 20px;
	text-align: center;
	opacity: 0.7;
}

.renote {
	position: relative;
	display: flex;
	align-items: center;
	padding: 12px 20px 0;
	line-height: 20px;
	font-size: 0.9em;
	white-space: pre;
	color: var(--MI_THEME-fg);
	opacity: 0.7;

	& + .article {
		padding-top: 4px;
	}

	> .colorBar {
		height: calc(100% - 6px);
	}
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

.renoteUserName {
	color: inherit;
}

.renoteInfo {
	margin-left: auto;
	font-size: 1em;
}

.collapsedRenoteTarget {
	align-items: center;
}

.collapsedRenoteTargetText {
	overflow: hidden;
	flex-shrink: 1;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 90%;
	opacity: 0.7;
	cursor: pointer;

	&:hover {
		text-decoration: underline;
	}
}

// 内边距对齐掘金沸点卡片 (juejin.cn/pins 的 .pin 实测 20px)
.article {
	position: relative;
	display: flex;
	padding: 20px;
}

.colorBar {
	position: absolute;
	top: 8px;
	left: 8px;
	width: 5px;
	height: calc(100% - 16px);
	border-radius: 999px;
	pointer-events: none;
}

.avatar {
	flex-shrink: 0;
	display: block !important;
	margin: 0 8px 0 0;
	width: 40px;
	height: 40px;

	&.useSticky {
		position: sticky !important;
		top: calc(30px + var(--MI-stickyTop, 0px));
		left: 0;
	}
}

.main {
	flex: 1;
	min-width: 0;
}

.headerRow {
	display: flex;
	align-items: center;
}

.header {
	flex: 1;
	min-width: 0;
}

.headerMenuButton {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	margin: 0 0 0 8px;
	padding: 0 4px;
	color: color-mix(in srgb, var(--MI_THEME-panel), var(--MI_THEME-fg) 70%); // opacityなど不透明度で表現するとレンダリングパフォーマンスに影響するので通常の色の混合で代用

	&:hover {
		color: var(--MI_THEME-fgHighlighted);
	}
}

.cw {
	cursor: default;
	display: block;
	margin: 0;
	padding: 0;
	overflow-wrap: break-word;
}

.showLess {
	width: 100%;
	margin-top: 14px;
	position: sticky;
	bottom: calc(var(--MI-stickyBottom, 0px) + 14px);
}

.showLessLabel {
	display: inline-block;
	background: var(--MI_THEME-popup);
	padding: 6px 10px;
	font-size: 0.8em;
	border-radius: 999px;
	box-shadow: 0 2px 6px rgb(0 0 0 / 20%);
}

.contentCollapsed {
	position: relative;
	max-height: 9em;
	overflow: clip;
}

.collapsed {
	display: block;
	position: absolute;
	bottom: 0;
	left: 0;
	z-index: 2;
	width: 100%;
	height: 64px;
	background: linear-gradient(0deg, var(--MI_THEME-panel), color(from var(--MI_THEME-panel) srgb r g b / 0));

	&:hover > .collapsedLabel {
		background: var(--MI_THEME-panelHighlight);
	}
}

.collapsedLabel {
	display: inline-block;
	background: var(--MI_THEME-panel);
	padding: 6px 10px;
	font-size: 0.8em;
	border-radius: 999px;
	box-shadow: 0 2px 6px rgb(0 0 0 / 20%);
}

.text {
	margin-top: 2px;
	overflow-wrap: break-word;
}

.replyIcon {
	color: var(--MI_THEME-accent);
	margin-right: 0.5em;
}

.translation {
	border: solid 0.5px var(--MI_THEME-divider);
	border-radius: var(--MI-radius);
	padding: 12px;
	margin-top: 8px;
}

.urlPreview {
	margin-top: 12px;
}

.poll {
	font-size: 80%;
}

.quote {
	margin-top: 12px;
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

.footer {
	display: flex;
	justify-content: space-between;
	align-items: center;
	height: 20px;
	margin-top: 12px;
	padding-right: 8px;
}

.footerButton {
	position: relative;
	flex: 0 0 40px;
	display: flex;
	align-items: center;
	justify-content: center;
	box-sizing: border-box;
	width: 40px;
	height: 20px;
	margin: 0;
	padding: 0;
	color: color-mix(in srgb, var(--MI_THEME-panel), var(--MI_THEME-fg) 70%); // opacityなど不透明度で表現するとレンダリングパフォーマンスに影響するので通常の色の混合で代用

	&:hover {
		color: var(--MI_THEME-fgHighlighted);
	}
}

.footerButtonPlaceholder {
	cursor: default;
}

.renoted {
	color: var(--MI_THEME-renote);
}

.footerButtonCount {
	position: absolute;
	top: 50%;
	inset-inline-start: calc(50% + 10px);
	margin: 0;
	line-height: 1;
	white-space: nowrap;
	transform: translateY(-50%);
	pointer-events: none;
}

@container (max-width: 580px) {
	.root {
		font-size: 0.95em;
	}

}

@container (max-width: 500px) {
	.root {
		font-size: 0.9em;
	}

}

@container (max-width: 480px) {
	.tip {
		padding: 8px 16px 0 16px;
	}
}

@container (max-width: 450px) {
	.avatar {
		&.useSticky {
			top: calc(22px + var(--MI-stickyTop, 0px));
		}
	}
}

@container (max-width: 350px) {
	.colorBar {
		top: 6px;
		left: 6px;
		width: 4px;
		height: calc(100% - 12px);
	}
}

@container (max-width: 250px) {
	.quoteNote {
		padding: 12px;
	}
}

.muted {
	padding: 8px;
	text-align: center;
	opacity: 0.7;
}

.reactionOmitted {
	display: inline-block;
	margin-left: 8px;
	opacity: .8;
	font-size: 95%;
}

.deleted {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 12px;
	text-align: center;
	padding: 32px;
	margin: 6px 32px 28px;
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
