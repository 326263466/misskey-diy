<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div
	v-if="!isDeleted && !hardMuted && !hideByPlugin && muted === false"
	ref="rootEl"
	v-hotkey="keymap"
	:class="[$style.root, { [$style.showActionsOnlyHover]: prefer.s.showNoteActionsOnlyHover, [$style.skipRender]: prefer.s.skipNoteRender, [$style.cardAnimated]: prefer.s.animation }]"
	data-note-card
	tabindex="0"
	@click="openNote"
>
	<div v-if="showReplyTo && appearNote.replyId && !renoteCollapsed" :class="$style.replyThreadItem">
		<MkNote
			v-if="appearNote.reply"
			:note="appearNote.reply"
			:showReplyTo="false"
			:withThreadLine="true"
			:threadAuthor="threadAuthor"
			:mock="mock"
			:withHardMute="withHardMute"
			:class="$style.replyThreadNote"
		/>
		<div v-else :class="$style.deletedReply">{{ getDeletedText(null) }}</div>
	</div>
	<div v-if="pinned" :class="$style.tip"><i class="ti ti-pin"></i> {{ i18n.ts.pinnedNote }}</div>
	<div v-if="isRenote" :class="$style.renote">
		<div v-if="note.channel" :class="$style.colorBar" :style="{ '--MI-channelColor': channelColor(note.channel.color) }"></div>
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
			<span v-if="note.localOnly && !note.redPacket" style="margin-left: 0.5em;" :title="i18n.ts._visibility['disableFederation']"><i class="ti ti-rocket-off"></i></span>
			<span v-if="note.channel" style="margin-left: 0.5em;" :title="note.channel.name"><i class="ti ti-device-tv"></i></span>
		</div>
	</div>
	<div v-if="isRenoteTargetDeleted" :class="$style.deleted">
		<span>{{ getDeletedText(renoteTargetDeletedBy) }}</span>
		<button v-if="isMyRenote" type="button" class="_button" :class="$style.deletedRenoteAction" @click.stop="deleteRenote()">
			<i class="ti ti-trash"></i>
			<span>{{ i18n.ts.delete }}</span>
		</button>
	</div>
	<div v-else-if="renoteCollapsed" :class="[$style.article, $style.collapsedRenoteTarget]" data-note-interactive>
		<MkAvatar :class="[$style.avatar, withThreadLine ? $style.threadLineAvatar : null]" :user="appearNote.user" :link="!mock" :preview="!mock"/>
		<Mfm :text="getNoteSummary(appearNote)" :plain="true" :nowrap="true" :author="appearNote.user" :nyaize="'respect'" :class="$style.collapsedRenoteTargetText" @click="renoteCollapsed = false"/>
	</div>
	<article v-else ref="viewEl" :class="$style.article" @contextmenu.stop="onContextmenu">
		<div v-if="appearNote.channel" :class="$style.colorBar" :style="{ '--MI-channelColor': channelColor(appearNote.channel.color) }"></div>
		<MkAvatar :class="[$style.avatar, prefer.s.useStickyIcons ? $style.useSticky : null, withThreadLine ? $style.threadLineAvatar : null]" :user="appearNote.user" :link="!mock" :preview="!mock"/>
		<div :class="$style.main">
			<div :class="$style.headerRow">
				<MkNoteHeader :note="appearNote" :mini="true" :class="$style.header"/>
				<button ref="menuButton" :class="$style.headerMenuButton" class="_button" :aria-label="i18n.ts.more" @click.stop="showMenu()">
					<i class="ti ti-dots"></i>
				</button>
			</div>
			<MkInstanceTicker v-if="showTicker" :host="appearNote.user.host" :instance="appearNote.user.instance"/>
			<div style="container-type: inline-size; margin-top: 4px;">
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
				<div v-show="appearNote.cw == null || showContent" :class="[{ [$style.contentCollapsed]: collapsed }]">
					<div :class="$style.text">
						<span v-if="appearNote.isHidden" style="color: var(--MI_THEME-fgTransparentWeak);">({{ i18n.ts.private }})</span>
						<MkA v-if="appearNote.replyId && !showReplyTo" :class="$style.replyIcon" :to="`/notes/${appearNote.replyId}`"><i class="ti ti-message-circle"></i></MkA>
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
						<div v-if="translating || translation" :class="$style.translation">
							<MkLoading v-if="translating" mini/>
							<div v-else-if="translation">
								<b>{{ i18n.tsx.translatedFrom({ x: translation.sourceLang }) }}: </b>
								<Mfm :text="translation.text" :author="appearNote.user" :nyaize="'respect'" :emojiUrls="appearNote.emojis" class="_selectable"/>
							</div>
						</div>
					</div>
					<div v-if="appearNote.files && appearNote.files.length > 0" style="margin-top: 12px;" data-note-interactive>
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
						data-note-interactive
					/>
					<div v-if="isEnabledUrlPreview" data-note-interactive>
						<MkUrlPreview v-for="url in urls" :key="url" :url="url" :compact="true" :detail="false" :class="$style.urlPreview"/>
					</div>
					<div v-if="appearNote.renoteId && !(showReplyTo && appearNote.renoteId === appearNote.replyId)" :class="$style.quote" data-note-interactive><MkNoteSimple :note="appearNote?.renote ?? null" :class="$style.quoteNote"/></div>
					<button v-if="isLong && collapsed" :class="$style.collapsed" class="_button" @click="collapsed = false">
						<span :class="$style.collapsedLabel">{{ i18n.ts.showMore }}</span>
					</button>
					<button v-else-if="isLong && !collapsed" :class="$style.showLess" class="_button" @click="collapsed = true">
						<span :class="$style.showLessLabel">{{ i18n.ts.showLess }}</span>
					</button>
				</div>
			</div>
			<MkReactionsViewer
				v-if="appearNote.reactionAcceptance !== 'likeOnly'"
				data-note-interactive
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
				<template v-if="hasBoosts" #boost>
					<button ref="reactButton" v-tooltip="i18n.ts._boost.title" :class="$style.boostButton" class="_button" :aria-label="i18n.ts._boost.title" aria-haspopup="dialog" :aria-expanded="boostOpen" :disabled="!canBoost || appearNote.reactionAcceptance === 'likeOnly'" @click.stop="handleToggleReact()">
						<i class="ti ti-rocket"></i>
					</button>
				</template>
			</MkReactionsViewer>
			<div :class="$style.tagsAndLikeRow">
				<MkNoteTags v-if="appearNote.cw == null || showContent" :tags="topics.tags" :channel="appearNote.channel"/>
				<MkLikeSummary :noteId="appearNote.id" :count="$appearNote.likeCount" :users="$appearNote.likeUsers"/>
			</div>
			<footer :class="[$style.footer, { [$style.footerAnimated]: prefer.s.animation }]">
				<div :class="$style.footerButtonSlot">
					<button v-tooltip.icon="i18n.ts.reply" :class="$style.footerButton" class="_button" :aria-label="i18n.ts.reply" @click.stop="reply()">
						<i class="ti ti-message-circle"></i>
						<MkRollingNumber v-show="$appearNote.repliesCount > 0" :class="$style.footerButtonCount" :value="$appearNote.repliesCount"/>
					</button>
				</div>
				<div :class="$style.footerButtonSlot">
					<button
						v-if="canRenote || isRenote"
						ref="renoteButton"
						v-tooltip.icon="isRenote ? i18n.ts.more : i18n.ts.renote"
						:class="[$style.footerButton, $style.renoteButton, { [$style.renoted]: isRenotedByMe }]"
						class="_button"
						:aria-label="isRenote ? i18n.ts.more : i18n.ts.renote"
						@click.stop="toggleRenote()"
						@keydown.enter.stop
					>
						<i class="ti ti-repeat"></i>
						<MkRollingNumber v-show="displayedRenoteCount > 0" :class="$style.footerButtonCount" :value="displayedRenoteCount"/>
					</button>
					<button v-else v-tooltip="i18n.ts.renote" :class="$style.footerButton" class="_button" :aria-label="i18n.ts.renote" disabled>
						<i class="ti ti-ban"></i>
					</button>
				</div>
				<div :class="$style.footerButtonSlot">
					<button v-tooltip.icon="$appearNote.isLiked ? i18n.ts.unlike : i18n.ts.like" :class="[$style.footerButton, $style.likeButton, { [$style.liked]: $appearNote.isLiked }]" class="_button" :aria-label="$appearNote.isLiked ? i18n.ts.unlike : i18n.ts.like" :aria-pressed="$appearNote.isLiked" :disabled="liking" @click.stop="toggleLike()">
						<i :class="$appearNote.isLiked ? 'ti ti-heart-filled' : 'ti ti-heart'"></i>
						<MkRollingNumber v-show="$appearNote.likeCount > 0" :class="$style.footerButtonCount" :value="$appearNote.likeCount"/>
					</button>
				</div>
				<div :class="$style.footerButtonSlot">
					<span v-tooltip.icon="i18n.ts.viewsCount" :class="$style.footerButton">
						<i class="ti ti-chart-bar" role="img" :aria-label="i18n.ts.viewsCount"></i>
						<MkRollingNumber v-show="$appearNote.viewsCount > 0" :class="$style.footerButtonCount" :value="$appearNote.viewsCount"/>
					</span>
				</div>
				<div :class="$style.footerIconActions">
					<button v-if="prefer.s.showClipButtonInNoteFooter" ref="clipButton" v-tooltip="i18n.ts.clip" :class="$style.footerButton" class="_button" :aria-label="i18n.ts.clip" @click.stop="clip()">
						<i class="ti ti-paperclip"></i>
					</button>
					<button v-if="!hasBoosts && $reactionNote.myReaction == null" ref="reactButton" v-tooltip="i18n.ts._boost.title" class="_button" :class="$style.footerButton" :aria-label="i18n.ts._boost.title" aria-haspopup="dialog" :aria-expanded="boostOpen" :disabled="!canBoost || appearNote.reactionAcceptance === 'likeOnly'" @click.stop="handleToggleReact()">
						<i class="ti ti-rocket"></i>
					</button>
					<button v-tooltip="i18n.ts.share" :class="$style.footerButton" class="_button" :aria-label="i18n.ts.share" @click.stop="share()">
						<i class="ti ti-share"></i>
					</button>
				</div>
			</footer>
		</div>
	</article>
</div>
<div v-else-if="isDeleted && !hideByPlugin" :class="$style.deleted">
	<span>{{ getDeletedText(deletedBy) }}</span>
</div>
<div v-else-if="!isDeleted && !hardMuted && !hideByPlugin" :class="$style.muted" @click="muted = false">
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
import { notePage } from '@/filters/note.js';
import { useRouter } from '@/router.js';
import { shouldOpenNote } from '@/utility/note-card-click.js';
import { getNoteSummary } from '@/utility/get-note-summary.js';
import { getNoteDisplayNodes, getNoteThreadAuthor } from '@/utility/note-display.js';
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
import MkRedPacket from '@/components/MkRedPacket.vue';
import MkUrlPreview from '@/components/MkUrlPreview.vue';
import MkInstanceTicker from '@/components/MkInstanceTicker.vue';
import MkRollingNumber from '@/components/MkRollingNumber.vue';
import MkLikeSummary from '@/components/MkLikeSummary.vue';
import MkNoteTags from '@/components/MkNoteTags.vue';
import { getNoteTopics } from '@/utility/note-topics.js';
import { getDeletedText } from '@/utility/deleted-note.js';
import { channelColor } from '@/utility/channel-color.js';

const props = withDefaults(defineProps<{
	note: Misskey.entities.Note;
	pinned?: boolean;
	mock?: boolean;
	withHardMute?: boolean;
	showReplyTo?: boolean;
	withThreadLine?: boolean;
	threadAuthor?: Misskey.entities.UserLite | null;
}>(), {
	mock: false,
	showReplyTo: true,
	withThreadLine: false,
	threadAuthor: null,
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
const router = useRouter();
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
	isDeleted,
	deletedBy,
	showContent,
	translating,
	translation,
	muted,
	hardMuted,
	isMyRenote,
	isRenotedByMe,
	isRenoteTargetDeleted,
	renoteTargetDeletedBy,
	displayedRenoteCount,
	collapsed,
	renoteCollapsed,
	parsed,
	urls,
	isLong,
	showTicker,
	canRenote,
	canBoost,

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
	liking,
	toggleLike,
	boostOpen,
	blur,
} = useNote(props, {
	rootEl,
	viewEl,
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

const hasBoosts = computed(() => Object.values($reactionNote.reactions).some(count => count > 0));

// provide
provide(DI.mfmEmojiReactCallback, reactViaMfmEmoji);

// MkNote固有
const threadAuthor = computed(() => props.threadAuthor ?? getNoteThreadAuthor(appearNote));
const topics = computed(() => getNoteTopics(appearNote, getNoteDisplayNodes(appearNote, threadAuthor.value, parsed.value)));
const displayNodes = computed(() => topics.value.nodes);
const showSoftWordMutedWord = computed(() => prefer.s.showSoftWordMutedWord);

function openNote(event: MouseEvent): void {
	if (props.mock || isDeleted.value || isRenoteTargetDeleted.value || renoteCollapsed.value || !shouldOpenNote(event, rootEl.value)) return;
	router.pushByPath(notePage(appearNote));
}

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
		} else if (isLong.value) {
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
@use "../styles/channel-accent.scss";

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

.footerButton.liked { color: var(--MI_THEME-love); }
.root {
	position: relative;
	cursor: pointer;
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
			width: auto;
			justify-content: flex-start;
			padding: 0 4px;
			margin-bottom: 0 !important;
			background: var(--MI_THEME-popup);
			border-radius: 8px;
			box-shadow: 0px 4px 32px var(--MI_THEME-shadow);
		}

		.footerButtonSlot {
			flex: 0 0 auto;
		}

		.footerButton {
			font-size: 90%;
		}
	}

	&.showActionsOnlyHover:is(:hover, :focus-within) {
		.footer {
			visibility: visible;
		}
	}
}

.cardAnimated {
	transition: background-color 150ms ease;

	@media (prefers-reduced-motion: reduce) {
		transition: none;
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
	padding: var(--MI-note-padding-top, var(--MI-cardPadding)) var(--MI-cardPadding) 8px;
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
		top: 100%;
		left: calc(var(--MI-cardPadding) + 20px);
		width: 1px;
		height: 4px;
		border-radius: 999px;
		background: var(--MI_THEME-divider);
		transform: translateX(-50%);
		pointer-events: none;
	}

	~ .article {
		padding-top: 10px;
	}

	~ .tip,
	~ .renote {
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
	position: relative;
	z-index: 2;
	padding: var(--MI-cardPadding) var(--MI-cardPadding) 10px;
	text-align: center;
	color: var(--MI_THEME-fgTransparentWeak);
}

.renote {
	position: relative;
	display: flex;
	align-items: center;
	padding: var(--MI-note-padding-top, var(--MI-cardPadding)) var(--MI-cardPadding) 0;
	line-height: 20px;
	font-size: 0.9em;
	white-space: pre;
	color: var(--MI_THEME-fgTransparentWeak);

	& + .article {
		padding-top: 4px;
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
	font-size: calc(1em - 1px);
}

.collapsedRenoteTarget {
	align-items: center;
}

.collapsedRenoteTargetText {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 90%;
	color: var(--MI_THEME-fgTransparentWeak);
	cursor: pointer;

	&:hover {
		text-decoration: underline;
	}
}

.article {
	position: relative;
	display: grid;
	grid-template-columns: auto minmax(0, 1fr);
	column-gap: 8px;
	padding: var(--MI-note-padding-top, var(--MI-cardPadding)) var(--MI-cardPadding) var(--MI-note-padding-bottom, var(--MI-cardPadding));
}

.colorBar {
	@include channel-accent.bar;
	position: absolute;
	top: 0;
	bottom: 0;
	left: 0;
	width: 3px;
	pointer-events: none;
}

.avatar {
	display: block !important;
	width: 40px;
	height: 40px;

	&.useSticky {
		position: sticky !important;
		top: calc(var(--MI-note-padding-top, var(--MI-cardPadding)) + var(--MI-stickyTop, 0px));
		left: 0;
	}
}

.threadLineAvatar::after {
	content: "";
	position: absolute;
	top: calc(100% + 6px);
	left: 50%;
	width: 1px;
	height: 100vh;
	border-radius: 999px;
	background: var(--MI_THEME-divider);
	transform: translateX(-50%);
	pointer-events: none;
}

.main {
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
	color: var(--MI_THEME-fgTransparentWeak);

	&:hover {
		color: var(--MI_THEME-fgHighlighted);
	}
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
	cursor: default;
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

.footer {
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

.footerButton {
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
	.footerButton {
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

.footerButtonCount {
	margin: 0;
	font-size: 12px;
	white-space: nowrap;
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

@container (max-width: 250px) {
	.quoteNote {
		padding: 12px;
	}
}

.muted {
	padding: 8px;
	text-align: center;
	color: var(--MI_THEME-fgTransparentWeak);
}

.reactionOmitted {
	display: inline-block;
	margin-left: 8px;
	color: var(--MI_THEME-fgTransparentWeak);
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
