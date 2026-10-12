<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div
	v-if="!muted && !hideByPlugin && !isDeleted"
	ref="rootEl"
	v-hotkey="keymap"
	:class="[$style.root, { [$style.separateActivity]: separateActivity, [$style.articleLayout]: sideActions }]"
	tabindex="0"
	@keydown.enter.self.exact.prevent="toggleContent"
>
	<aside v-if="sideActions && !isRenoteTargetDeleted" :class="$style.sideActions" :aria-label="i18n.ts.note" :data-detail-actions="pageActive ? 'true' : undefined">
		<button v-tooltip.icon="$appearNote.isLiked ? i18n.ts.unlike : i18n.ts.like" type="button" class="_button" :class="[$style.sideAction, { [$style.liked]: $appearNote.isLiked }]" :aria-label="$appearNote.isLiked ? i18n.ts.unlike : i18n.ts.like" :aria-pressed="$appearNote.isLiked" :disabled="liking" @click.stop="toggleLike()">
			<i :class="$appearNote.isLiked ? 'ti ti-heart-filled' : 'ti ti-heart'" aria-hidden="true"></i>
			<span v-if="$appearNote.likeCount > 0" :class="$style.sideCount" aria-hidden="true">{{ $appearNote.likeCount }}</span>
		</button>
		<button v-tooltip.icon="i18n.ts.replies" type="button" class="_button" :class="$style.sideAction" :aria-label="i18n.ts.replies" @click="showReplies">
			<i class="ti ti-message-circle" aria-hidden="true"></i>
			<span v-if="$appearNote.repliesCount > 0" :class="$style.sideCount" aria-hidden="true">{{ $appearNote.repliesCount }}</span>
		</button>
		<button ref="renoteButton" v-tooltip.icon="isRenote ? i18n.ts.more : i18n.ts.renote" type="button" class="_button" :class="[$style.sideAction, { [$style.renoted]: isRenotedByMe }]" :aria-label="isRenote ? i18n.ts.more : i18n.ts.renote" :disabled="!canRenote && !isRenote" @click.stop="toggleRenote()" @keydown.enter.stop>
			<i :class="canRenote || isRenote ? 'ti ti-repeat' : 'ti ti-ban'" aria-hidden="true"></i>
			<span v-if="displayedRenoteCount > 0" :class="$style.sideCount" aria-hidden="true">{{ displayedRenoteCount }}</span>
		</button>
		<button ref="reactButton" v-tooltip.icon="appearNote.reactionAcceptance === 'likeOnly' && myEmojiReaction ? i18n.ts.cancel : i18n.ts._chat.addReaction" type="button" class="_button" :class="$style.sideAction" :aria-label="appearNote.reactionAcceptance === 'likeOnly' && myEmojiReaction ? i18n.ts.cancel : i18n.ts._chat.addReaction" @click.stop="toggleReact()">
			<i :class="appearNote.reactionAcceptance === 'likeOnly' ? (myEmojiReaction ? 'ti ti-heart-filled' : 'ti ti-heart') : 'ti ti-mood-happy'" aria-hidden="true"></i>
		</button>
		<button v-tooltip.icon="isFavorited ? i18n.ts.unfavorite : i18n.ts.favorite" type="button" class="_button" :class="[$style.sideAction, { [$style.favorited]: isFavorited }]" :aria-label="isFavorited ? i18n.ts.unfavorite : i18n.ts.favorite" :aria-pressed="isFavorited" :disabled="favoriting" @click.stop="toggleFavorite()">
			<i :class="isFavorited ? 'ti ti-star-filled' : 'ti ti-star'" aria-hidden="true"></i>
		</button>
		<button v-tooltip.icon="i18n.ts.share" type="button" class="_button" :class="$style.sideAction" :aria-label="i18n.ts.share" @click.stop="share()">
			<i class="ti ti-share" aria-hidden="true"></i>
		</button>
		<button v-if="$i && $i.id !== appearNote.userId" v-tooltip.icon="i18n.ts.reportAbuse" type="button" class="_button" :class="$style.sideAction" :aria-label="i18n.ts.reportAbuse" @click.stop="getAbuseNoteMenu(appearNote, i18n.ts.reportAbuse).action($event)">
			<i class="ti ti-alert-triangle" aria-hidden="true"></i>
		</button>
	</aside>
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
			<div v-if="note.visibility !== 'public'" :class="$style.renoteInfo">
				<span style="margin-left: 0.5em;" :title="i18n.ts._visibility[note.visibility]">
					<i v-if="note.visibility === 'home'" class="ti ti-home"></i>
					<i v-else-if="note.visibility === 'followers'" class="ti ti-lock"></i>
					<i v-else-if="note.visibility === 'specified'" ref="specified" class="ti ti-mail"></i>
				</span>
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
			<div :class="$style.noteHeader">
				<MkAvatar :class="$style.noteHeaderAvatar" :user="appearNote.user" indicator link preview/>
				<div :class="$style.noteHeaderBody">
					<MkNoteHeader :note="appearNote" :viewsCount="$appearNote.viewsCount" detailLayout/>
					<MkInstanceTicker v-if="showTicker" :host="appearNote.user.host" :instance="appearNote.user.instance"/>
				</div>
				<div :class="$style.noteVisibility" :title="i18n.ts._visibility[appearNote.visibility]">
					<i v-if="appearNote.visibility === 'public'" class="ti ti-world"></i>
					<i v-else-if="appearNote.visibility === 'home'" class="ti ti-home"></i>
					<i v-else-if="appearNote.visibility === 'followers'" class="ti ti-lock"></i>
					<i v-else-if="appearNote.visibility === 'specified'" class="ti ti-mail"></i>
				</div>
				<button ref="menuButton" class="_button" :class="$style.noteHeaderMenuButton" :aria-label="i18n.ts.more" @click.stop="showMenu()">
					<i class="ti ti-dots"></i>
				</button>
			</div>
			<div :class="$style.main">
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
					<div v-show="appearNote.cw == null || showContent" :class="$style.content">
						<span v-if="appearNote.isHidden" :class="$style.hiddenContent">
							<span :class="$style.hiddenContentTitle"><i class="ti ti-lock" aria-hidden="true"></i>{{ i18n.ts.invisibleNote }}</span>
							<span :class="$style.hiddenContentDivider" aria-hidden="true"></span>
						</span>
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
						<div v-if="appearNote.files && appearNote.files.length > 0">
							<MkMediaList ref="galleryEl" :mediaList="appearNote.files" :user="appearNote.user"/>
						</div>
						<MkRedPacket v-if="appearNote.redPacket" :redPacketId="appearNote.redPacket.id" :authorId="appearNote.userId" :redPacket="appearNote.redPacket" :author="appearNote.user"/>
						<MkPoll
							v-if="appearNote.poll"
							:noteId="appearNote.id"
							:multiple="appearNote.poll.multiple"
							:expiresAt="appearNote.poll.expiresAt"
							:choices="$appearNote.pollChoices"
							:author="appearNote.user"
							:emojiUrls="appearNote.emojis"
						/>
						<div v-if="isEnabledUrlPreview">
							<MkUrlPreview v-for="url in urls" :key="url" :url="url" :compact="true" :detail="false" :class="$style.urlPreview"/>
						</div>
						<div v-if="appearNote.renoteId && appearNote.renoteId !== appearNote.replyId" :class="$style.quote"><MkNoteSimple :note="appearNote?.renote ?? null" :class="$style.quoteNote"/></div>
					</div>
				</div>
				<MkTipSection v-if="!appearNote.isHidden && appearNote.user.host == null && (appearNote.cw == null || showContent)" :key="appearNote.id" :recipient="appearNote.user" targetType="note" :targetId="appearNote.id"/>
				<MkReactionsViewer
					v-if="appearNote.reactionAcceptance !== 'likeOnly'"
					:reactions="emojiReactions"
					:reactionEmojis="$reactionNote.reactionEmojis"
					:myReactions="myEmojiReactions"
					:noteId="reactionNote.id"
					canAdd
					@add="react(undefined, $event.currentTarget as HTMLElement)"
				>
				</MkReactionsViewer>

				<div :class="$style.tagsAndLikeRow">
					<MkNoteTags v-if="appearNote.cw == null || showContent" :tags="topics.tags" :channel="appearNote.channel"/>
					<MkLikeSummary :noteId="appearNote.id" :count="$appearNote.likeCount" :users="$appearNote.likeUsers"/>
				</div>

				<div v-if="!sideActions" :class="[$style.footer, { [$style.footerAnimated]: prefer.s.animation }]">
					<div :class="$style.footerButtonSlot">
						<button v-tooltip.icon="i18n.ts.reply" class="_button" :class="[$style.footerButton, { [$style.footerButtonWithCount]: $appearNote.repliesCount > 0 }]" :aria-label="i18n.ts.reply" @click.stop="showReplies()">
							<i class="ti ti-message-circle"></i>
							<MkRollingNumber v-show="$appearNote.repliesCount > 0" :class="$style.footerButtonCount" :value="$appearNote.repliesCount"/>
						</button>
					</div>
					<div :class="$style.footerButtonSlot">
						<button
							v-if="canRenote || isRenote"
							ref="renoteButton"
							v-tooltip.icon="isRenote ? i18n.ts.more : i18n.ts.renote"
							class="_button"
							:class="[$style.footerButton, $style.renoteButton, { [$style.renoted]: isRenotedByMe, [$style.footerButtonWithCount]: displayedRenoteCount > 0 }]"
							:aria-label="isRenote ? i18n.ts.more : i18n.ts.renote"
							@click.stop="toggleRenote()"
							@keydown.enter.stop
						>
							<i class="ti ti-repeat"></i>
							<MkRollingNumber v-show="displayedRenoteCount > 0" :class="$style.footerButtonCount" :value="displayedRenoteCount"/>
						</button>
						<button v-else v-tooltip="i18n.ts.renote" class="_button" :class="$style.footerButton" :aria-label="i18n.ts.renote" disabled>
							<i class="ti ti-ban"></i>
						</button>
					</div>
					<div :class="$style.footerButtonSlot">
						<button v-tooltip.icon="$appearNote.isLiked ? i18n.ts.unlike : i18n.ts.like" class="_button" :class="[$style.footerButton, $style.likeButton, { [$style.liked]: $appearNote.isLiked, [$style.footerButtonWithCount]: $appearNote.likeCount > 0 }]" :aria-label="$appearNote.isLiked ? i18n.ts.unlike : i18n.ts.like" :aria-pressed="$appearNote.isLiked" :disabled="liking" @click.stop="toggleLike()">
							<i :class="$appearNote.isLiked ? 'ti ti-heart-filled' : 'ti ti-heart'"></i>
							<MkRollingNumber v-show="$appearNote.likeCount > 0" :class="$style.footerButtonCount" :value="$appearNote.likeCount"/>
						</button>
					</div>
					<div :class="$style.footerIconActions">
						<button v-if="prefer.s.showClipButtonInNoteFooter" ref="clipButton" v-tooltip="i18n.ts.clip" class="_button" :class="$style.footerButton" :aria-label="i18n.ts.clip" @click.stop="clip()">
							<i class="ti ti-paperclip"></i>
						</button>
						<button ref="reactButton" v-tooltip="appearNote.reactionAcceptance === 'likeOnly' && myEmojiReaction ? i18n.ts.cancel : i18n.ts._chat.addReaction" class="_button" :class="[$style.footerButton, { [$style.footerButtonWithCount]: (appearNote.reactionAcceptance === 'likeOnly' || prefer.s.showReactionsCount) && emojiReactionCount > 0 }]" :aria-label="appearNote.reactionAcceptance === 'likeOnly' && myEmojiReaction ? i18n.ts.cancel : i18n.ts._chat.addReaction" @click.stop="toggleReact()">
						<i v-if="appearNote.reactionAcceptance === 'likeOnly' && myEmojiReaction != null" class="ti ti-heart-filled" style="color: var(--MI_THEME-love);"></i>
						<i v-else-if="appearNote.reactionAcceptance === 'likeOnly'" class="ti ti-heart"></i>
						<i v-else class="ti ti-mood-happy"></i>
						<MkRollingNumber v-if="(appearNote.reactionAcceptance === 'likeOnly' || prefer.s.showReactionsCount) && emojiReactionCount > 0" :class="$style.footerButtonCount" :value="emojiReactionCount"/>
					</button>
						<button v-tooltip="i18n.ts.share" class="_button" :class="$style.footerButton" :aria-label="i18n.ts.share" @click.stop="share()">
							<i class="ti ti-share"></i>
						</button>
					</div>
				</div>
			</div>

		</article>
	</div>
	<div v-if="!isRenoteTargetDeleted" ref="activityEl" :class="separateActivity ? [$style.card, $style.activityCard] : undefined">
		<div v-if="sideActions" :class="$style.commentHeader">
			<h2><button type="button" class="_button" :aria-pressed="tab === 'replies'" @click="showReplies">{{ i18n.ts._article.comment }} <span>{{ $appearNote.repliesCount }}</span></button></h2>
			<div :class="$style.activityLinks">
				<button type="button" class="_button" :class="{ [$style.tabActive]: tab === 'renotes' }" :aria-pressed="tab === 'renotes'" @click="tab = tab === 'renotes' ? 'replies' : 'renotes'">{{ i18n.ts.renotes }}</button>
				<button type="button" class="_button" :class="{ [$style.tabActive]: tab === 'reactions' }" :aria-pressed="tab === 'reactions'" @click="tab = tab === 'reactions' ? 'replies' : 'reactions'">{{ i18n.ts.reactions }}</button>
			</div>
		</div>
		<div v-else :class="$style.tabs">
			<button class="_button" :class="[$style.tab, { [$style.tabActive]: tab === 'replies' }]" @click="tab = 'replies'"><i class="ti ti-message-circle"></i> {{ i18n.ts.replies }}</button>
			<button class="_button" :class="[$style.tab, { [$style.tabActive]: tab === 'renotes' }]" @click="tab = 'renotes'"><i class="ti ti-repeat"></i> {{ i18n.ts.renotes }}</button>
			<button class="_button" :class="[$style.tab, { [$style.tabActive]: tab === 'reactions' }]" @click="tab = 'reactions'"><i class="ti ti-mood-happy"></i> {{ i18n.ts.reactions }}</button>
		</div>
		<div>
			<div :class="$style.replyComposer">
				<MkPostForm v-if="$i && !appearNote.isHidden" ref="commentForm" :reply="appearNote" commentMode fixed :autofocus="false"/>
				<MkCommentGuest v-else-if="!$i && !appearNote.isHidden"/>
			</div>
			<div v-show="tab === 'replies'">
				<MkNoteSub v-for="note in replies" :key="note.id" :note="note" :class="$style.reply" :detail="true" :threadAuthor="threadAuthor" :parentComment="appearNote"/>
				<MkLoading v-if="repliesFetching" :class="$style.repliesLoading"/>
				<div v-else-if="repliesError" :class="$style.replyComposer"><MkButton @click="loadReplies">{{ i18n.ts.retry }}</MkButton></div>
				<MkCommentEmpty v-else-if="replies.length === 0"/>
			</div>
			<div v-if="tab === 'renotes'">
				<MkPagination pageEmpty :paginator="renotesPaginator" :autoLoad="false">
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
				<MkResult v-if="Object.keys(emojiReactions).length === 0" type="empty" page/>
				<div v-else :class="$style.tab_reactions">
					<div :class="$style.reactionTabs">
						<button v-for="reaction in Object.keys(emojiReactions)" :key="reaction" :class="[$style.reactionTab, { [$style.reactionTabActive]: reactionTabType === reaction }]" class="_button" @click="reactionTabType = reaction">
							<MkReactionIcon :reaction="reaction"/>
							<span style="margin-left: 4px;">{{ emojiReactions[reaction] }}</span>
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
import { inject, provide, ref, useTemplateRef, markRaw, computed, onBeforeUnmount, watch, nextTick } from 'vue';
import * as Misskey from 'misskey-js';
import { useNote } from '@/composables/use-note.js';
import { prefer } from '@/preferences.js';
import { i18n } from '@/i18n.js';
import { getMyReactions, isEmojiReaction } from '@/utility/normalize-reaction.js';
import { userPage } from '@@/js/user.js';
import { isEnabledUrlPreview } from '@/utility/url-preview.js';
import { Paginator } from '@/utility/paginator.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { getNoteDisplayNodes, getNoteThreadAuthor } from '@/utility/note-display.js';
import { DI } from '@/di.js';
import { useGlobalEvent } from '@/events.js';
import { getDeletedText, toDeletedNote } from '@/utility/deleted-note.js';
import { getAbuseNoteMenu } from '@/utility/get-note-menu.js';
import { $i } from '@/i.js';
import MkLikeSummary from '@/components/MkLikeSummary.vue';
import MkNoteTags from '@/components/MkNoteTags.vue';
import { getNoteTopics } from '@/utility/note-topics.js';
import type { Keymap } from '@/utility/hotkey.js';

// コンポーネント外部の依存関係
import MkNoteSub from '@/components/MkNoteSub.vue';
import MkButton from '@/components/MkButton.vue';
import MkNote from '@/components/MkNote.vue';
import MkRollingNumber from '@/components/MkRollingNumber.vue';
import MkNoteSimple from '@/components/MkNoteSimple.vue';
import MkNoteHeader from '@/components/MkNoteHeader.vue';
import MkReactionsViewer from '@/components/MkReactionsViewer.vue';
import MkMediaList from '@/components/MkMediaList.vue';
import MkCwButton from '@/components/MkCwButton.vue';
import MkPoll from '@/components/MkPoll.vue';
import MkRedPacket from '@/components/MkRedPacket.vue';
import MkTipSection from '@/components/MkTipSection.vue';
import MkPostForm from '@/components/MkPostForm.vue';
import MkCommentEmpty from '@/components/MkCommentEmpty.vue';
import MkCommentGuest from '@/components/MkCommentGuest.vue';
import MkUrlPreview from '@/components/MkUrlPreview.vue';
import MkInstanceTicker from '@/components/MkInstanceTicker.vue';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import MkPagination from '@/components/MkPagination.vue';
import MkReactionIcon from '@/components/MkReactionIcon.vue';

const props = withDefaults(defineProps<{
	note: Misskey.entities.Note;
	initialTab?: 'replies' | 'renotes' | 'reactions';
	separateActivity?: boolean;
	sideActions?: boolean;
	menuContext?: 'list' | 'detail';
}>(), {
	initialTab: 'replies',
	separateActivity: false,
	sideActions: false,
	menuContext: 'list',
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
const activityEl = useTemplateRef('activityEl');

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
	onContextmenu,
	showMenu,
	clip,
	share,
	liking,
	toggleLike,
	isFavorited,
	favoriting,
	toggleFavorite,
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
	menuContext: props.menuContext,
});

// provide
const pageActive = inject(DI.pageActive, ref(true));
provide(DI.mfmEmojiReactCallback, reactViaMfmEmoji);

// MkNoteDetailed固有
const tab = ref(props.initialTab);
watch(() => props.initialTab, value => {
	tab.value = value;
});
const reactionTabType = ref<string | null>(null);
const commentForm = useTemplateRef('commentForm');

async function showReplies() {
	tab.value = 'replies';
	await nextTick();
	activityEl.value?.scrollIntoView({ behavior: prefer.s.animation ? 'smooth' : 'instant', block: 'start' });
	commentForm.value?.focus();
}

function toggleContent(event?: KeyboardEvent) {
	if (appearNote.cw != null && !event?.repeat) showContent.value = !showContent.value;
}

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
const repliesFetching = ref(false);
const repliesError = ref(false);
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
	if (repliesFetching.value || disposed) return;
	repliesFetching.value = true;
	repliesError.value = false;
	misskeyApi('notes/children', {
		noteId: appearNote.id,
		limit: 30,
	}, undefined, repliesAbortController.signal).then(res => {
		if (disposed || repliesAbortController.signal.aborted) return;
		replies.value = [...replies.value, ...res.filter(note => !replies.value.some(reply => reply.id === note.id)).map(note => deletedReplySources.has(note.id) ? toDeletedNote(note, deletedReplySources.get(note.id)) : note)];
	}).catch(() => {
		if (!disposed && !repliesAbortController.signal.aborted) repliesError.value = true;
	}).finally(() => {
		repliesFetching.value = false;
	});
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
	'r': () => showReplies(),
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
	'v': toggleContent,
	'esc': {
		allowRepeat: true,
		callback: () => blur(),
	},
} as const satisfies Keymap;
const emojiReactions = computed(() => Object.fromEntries(Object.entries($reactionNote.reactions).filter(([reaction]) => isEmojiReaction(reaction))));
const emojiReactionCount = computed(() => Object.values(emojiReactions.value).reduce((sum, count) => sum + count, 0));
const myEmojiReactions = computed(() => getMyReactions($reactionNote));
const myEmojiReaction = computed(() => myEmojiReactions.value.at(-1) ?? null);
</script>

<style lang="scss" module>
@use '@/styles/card-header.scss';

@use "../styles/community.scss";

.footerButton.liked { color: var(--MI_THEME-love); }
.root {
	position: relative;
	font-size: 1.05em;
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

.sideActions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.sideAction {
	position: relative;
	display: grid;
	place-items: center;
	width: 48px;
	height: 48px;
	border-radius: 50%;
	background: var(--MI_THEME-panel);
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 20px;
	line-height: 1;

	&:hover:not(:disabled), &:focus-visible {
		color: var(--MI_THEME-accent);
	}

	&.liked {
		color: var(--MI_THEME-love);
	}

	&.favorited, &.renoted {
		color: var(--MI_THEME-accent);
	}

	&:disabled {
		cursor: wait;
		opacity: 0.6;
	}
}

.sideCount {
	position: absolute;
	top: 0;
	right: -6px;
	padding: 2px 5px;
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-fgTransparentWeak);
	color: var(--MI_THEME-panel);
	font-size: 11px;
	line-height: 1;
}

@container (min-width: 700px) {
	.articleLayout {
		display: grid;
		grid-template-columns: 64px minmax(0, 1fr);
		column-gap: var(--MI-margin);
		row-gap: var(--MI-margin);

		> .card {
			grid-column: 2;
			min-width: 0;
		}

		> .sideActions {
			position: sticky;
			top: calc(var(--MI-stickyTop, 0px) + 48px);
			grid-column: 1;
			grid-row: 1 / span 2;
			align-self: start;
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 12px;
			margin-top: 48px;

			@media (max-height: 600px) {
				top: calc(var(--MI-stickyTop, 0px) + 12px);
				gap: 8px;
				margin-top: 12px;
			}
		}
	}
}

.card {
	background: var(--MI_THEME-panel);
	border-radius: var(--MI-cardRadius);
	overflow: clip;
}

.activityCard > .tabs {
	border-top: none;
}

.replyComposer {
	padding: var(--MI-cardPadding);
}

.commentHeader {
	@include card-header.row;
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-inline: var(--MI-cardPadding);
	h2 { @include card-header.label; margin: 0; }
	h2 > button { font-weight: inherit; }
	h2 span { color: var(--MI_THEME-fgTransparentWeak); font-size: .85em; font-weight: normal; }
}

.activityLinks { display: flex; gap: 16px; color: var(--MI_THEME-fgTransparentWeak); font-size: .85em; }
.repliesLoading { padding: 24px; }

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
		background: var(--MI_THEME-divider); // divider-exempt: thread connector line
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
	padding: var(--MI-note-padding-top, var(--MI-cardPadding)) var(--MI-cardPadding) var(--MI-note-padding-bottom, var(--MI-cardPadding));
}

.main {
	min-width: 0;
}

// 详情页各区块共用卡片自身的内边距，这里只负责垂直节奏。
.tagsAndLikeRow {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	margin-top: 12px;
	min-width: 0;
}

.footer {
	margin-top: 12px;
}

.noteHeader {
	display: flex;
	position: relative;
	gap: 14px;
	margin-bottom: var(--MI-contentHeaderGap);
	align-items: center;
}

.noteHeaderAvatar {
	display: block;
	flex-shrink: 0;
	width: 32px;
	height: 32px;
}

.noteHeaderMenuButton {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	// 抵消 .noteHeader 的 14px 间距，与左侧可见范围图标并排成组
	margin: 0 0 0 -10px;
	padding: 0 4px;
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

// 尺寸和内边距与右侧菜单按钮一致
.noteVisibility {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	padding: 0 4px;
	color: var(--MI_THEME-fgTransparentWeak);
}

.noteContent {
	container-type: inline-size;
	overflow-wrap: break-word;
}

.hiddenContent {
	display: flex;
	flex-direction: column;
	align-items: stretch;
	gap: 12px;
	margin: 4px 0;
	padding: 16px 20px;
	border-radius: var(--MI-radius);
	background: color-mix(in srgb, var(--MI_THEME-fg) 8%, var(--MI_THEME-panel));
	color: var(--MI_THEME-fg);
	font-size: 0.92em;
	font-weight: 500;
	line-height: 1.5;
	cursor: default;
	box-sizing: border-box;
}

.hiddenContentTitle {
	display: flex;
	align-items: center;
	gap: 6px;
}

.hiddenContentTitle > i {
	flex: 0 0 auto;
	color: var(--MI_THEME-accent);
}

.hiddenContentDivider {
	display: block;
	width: 100%;
	border-top: var(--MI-divider);
}

.rn {
	margin-left: 4px;
	font-style: oblique;
	color: var(--MI_THEME-renote);
}

@include community.noteBody;

@container (max-width: 580px) {
	.root { font-size: 0.95em; }
}

@container (max-width: 500px) {
	.root { font-size: 0.9em; }
}

.reply:not(:first-child) {
	border-top: var(--MI-divider);
}

.tabs {
	border-top: var(--MI-divider);
	border-bottom: var(--MI-divider);
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

.reactionTabs {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
	margin-bottom: 8px;
}

.reactionTab {
	padding: 4px 6px;
	border: var(--MI-divider);
	border-radius: 6px;
}

.reactionTabActive {
	border-color: color-mix(in srgb, var(--MI_THEME-accent) 45%, var(--MI-dividerColor));
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
