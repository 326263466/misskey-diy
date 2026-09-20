<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-if="note != null && !deleted && muted" :class="$style.muted" @click="muted = false">
	<I18n :src="i18n.ts.userSaysSomething" tag="small">
		<template #name>
			<MkA v-user-preview="note.userId" :to="userPage(note.user)">
				<MkUserName :user="note.user"/>
			</MkA>
		</template>
	</I18n>
</div>
<div v-else-if="note != null" ref="rootEl" :class="[$style.root, { [$style.children]: depth > 1 }]">
	<div :class="[$style.main, { [$style.mainWithReplies]: hasVisibleReplies }]">
		<div v-if="note.channel && !deleted" :class="$style.colorBar" :style="{ background: note.channel.color }"></div>
		<MkAvatar :class="$style.avatar" :user="note.user" link preview/>
		<div :class="$style.body">
			<p v-if="deleted" :class="$style.deletedContent" role="status">{{ getDeletedText(deletedBy, true) }}</p>
			<div v-else :class="$style.headerRow">
				<MkNoteHeader :class="$style.header" :note="note" :showTime="false" :showAuthorBadge="isThreadAuthor"/>
				<button v-tooltip="i18n.ts.more" type="button" class="_button" :class="[$style.action, $style.menu]" :aria-label="i18n.ts.more" @click="showMenu">
					<i class="ti ti-dots"></i>
				</button>
			</div>
			<div v-if="!deleted">
				<p v-if="note.cw != null" :class="$style.cw">
					<Mfm v-if="note.cw != ''" style="margin-right: 8px;" :text="note.cw" :author="note.user" :nyaize="'respect'"/>
					<MkCwButton v-model="showContent" :text="note.text" :files="note.files" :poll="note.poll"/>
				</p>
				<div v-show="note.cw == null || showContent">
					<MkSubNoteContent :class="$style.text" :note="note" :omitMentionOf="omitMentionOf" :relocateTags="true"/>
				</div>
			</div>
			<MkReactionsViewer v-if="!deleted && captured && captured.reactionCount > 0" :noteId="note.id" :reactions="captured.reactions" :reactionEmojis="captured.reactionEmojis" :myReaction="captured.myReaction"/>
			<MkNoteTags v-if="!deleted && (note.cw == null || showContent)" :class="$style.tags" :tags="topics.tags"/>
			<footer v-if="!deleted" :class="$style.footer">
				<MkA :class="$style.time" :to="notePage(note)"><MkTime :time="note.createdAt"/></MkA>
				<button v-tooltip="i18n.ts.like" type="button" class="_button" :class="[$style.action, { [$style.liked]: captured?.isLiked }]" :aria-label="i18n.ts.like" :aria-pressed="captured?.isLiked ?? false" :disabled="liking" @click="toggleLike">
					<i :class="captured?.isLiked ? 'ti ti-thumb-up-filled' : 'ti ti-thumb-up'"></i><span v-if="captured && captured.likeCount > 0">{{ captured.likeCount }}</span>
				</button>
				<button v-tooltip="i18n.ts.reply" type="button" class="_button" :class="$style.action" :aria-label="i18n.ts.reply" @click="replyToComment">
					<i class="ti ti-message-circle"></i><span v-if="captured && captured.repliesCount > 0">{{ captured.repliesCount }}</span>
				</button>
			</footer>
		</div>
	</div>
	<template v-if="detail && depth === 1">
		<MkNoteSub
			v-for="(reply, index) in replies"
			:key="reply.id"
			:note="reply"
			:class="[$style.reply, { [$style.replyWithSibling]: index < replies.length - 1 }]"
			:depth="2"
			:threadAuthor="threadAuthor"
			:parentComment="note"
		/>
		<div v-if="hasMoreReplies && !repliesError" :key="replies.length" v-appear="loadReplies" :class="$style.sentinel" aria-hidden="true"></div>
		<MkLoading v-if="loadingReplies" :class="$style.replyLoading"/>
		<MkError v-else-if="repliesError" :class="$style.replyError" @retry="loadReplies"/>
	</template>
</div>
</template>

<script lang="ts" setup>
import { computed, inject, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue';
import * as Misskey from 'misskey-js';
import MkNoteHeader from '@/components/MkNoteHeader.vue';
import MkSubNoteContent from '@/components/MkSubNoteContent.vue';
import MkCwButton from '@/components/MkCwButton.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { createFlatNoteRepliesLoader } from '@/utility/flat-note-replies.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import { userPage } from '@/filters/user.js';
import { checkWordMute } from '@/utility/check-word-mute.js';
import { notePage } from '@/filters/note.js';
import { useNoteCapture, useNoteCaptureVisibility } from '@/composables/use-note-capture.js';
import { globalEvents, useGlobalEvent } from '@/events.js';
import { pleaseLogin } from '@/utility/please-login.js';
import { getAbuseNoteMenu } from '@/utility/get-note-menu.js';
import * as os from '@/os.js';
import type { MenuItem } from '@/types/menu.js';
import { editNote } from '@/utility/edit-note.js';
import { useNoteContent } from '@/composables/use-note-content.js';
import { getDeletedText, toDeletedNote } from '@/utility/deleted-note.js';
import { DI } from '@/di.js';
import { useLike } from '@/composables/use-like.js';
import MkReactionsViewer from '@/components/MkReactionsViewer.vue';
import MkNoteTags from '@/components/MkNoteTags.vue';
import { getNoteTopics } from '@/utility/note-topics.js';

const props = withDefaults(defineProps<{
	note: Misskey.entities.Note | null;
	detail?: boolean;

	// Only top-level comments and one flat reply level are rendered.
	depth?: number;
	parentComment?: Misskey.entities.Note | null;

	// 原帖作者。用于显示作者标签，以及省略指向作者的 @提及
	threadAuthor?: Misskey.entities.UserLite | null;
}>(), {
	depth: 1,
	parentComment: null,
	threadAuthor: null,
});

const note = props.note == null ? null : useNoteContent(props.note);
const topics = computed(() => note == null ? { tags: [] } : getNoteTopics(note));

// 作者本人的回复，在昵称后加作者标签
const isThreadAuthor = computed(() => props.threadAuthor != null && props.note?.userId === props.threadAuthor.id);

const omitMentionOf = computed(() => {
	if (props.parentComment != null) {
		if (props.parentComment.isDeleted) return null;
		return props.note?.replyId === props.parentComment.id ? props.parentComment.user : null;
	}
	return props.threadAuthor;
});

const muted = ref<boolean | ReturnType<typeof checkWordMute>>(props.note && $i ? checkWordMute(props.note, $i, $i.mutedWords) : false);
const deleted = ref(props.note?.isDeleted === true);
const deletedBy = ref<Misskey.entities.Note['deletedBy']>(props.note?.deletedBy ?? null);
watch(() => [props.note?.isDeleted, props.note?.deletedBy] as const, ([value, source]) => {
	if (value) markDeleted(source);
});
const rootEl = useTemplateRef('rootEl');
const captureActive = useNoteCaptureVisibility(rootEl);
const mock = inject(DI.mock, false);
const captured = props.note == null ? null : useNoteCapture({ note: props.note, parentNote: null, active: captureActive, mock: mock || deleted.value }).$note;
const likeActions = note == null || captured == null ? null : useLike(note.id, captured, { disabled: () => deleted.value || note.isDeleted === true });
const liking = likeActions?.liking ?? ref(false);

function toggleLike(): void { void likeActions?.toggleLike(); }

async function replyToComment(): Promise<void> {
	if (note == null || deleted.value || !await pleaseLogin() || deleted.value) return;
	await os.post({ reply: note, channel: note.channel });
}

async function deleteComment(): Promise<void> {
	const note = props.note;
	if (note == null || deleted.value || note.userId !== $i?.id) return;
	const { canceled } = await os.confirm({ type: 'warning', text: i18n.ts.noteDeleteConfirm });
	if (canceled || deleted.value) return;
	await os.apiWithDialog('notes/delete', { noteId: note.id });
	globalEvents.emit('noteDeleted', note.id, note.replyId, note.renoteId != null && note.renote?.userId !== note.userId ? note.renoteId : null, 'author');
}

async function editComment(): Promise<void> {
	if (note != null && !deleted.value) await editNote(note);
}

async function showMenu(ev: PointerEvent): Promise<void> {
	const note = props.note;
	if (note == null || deleted.value || !await pleaseLogin() || deleted.value) return;
	const menu: MenuItem[] = note.userId === $i?.id ? [{
		icon: 'ti ti-trash', text: i18n.ts.delete, danger: true, action: deleteComment,
	}, {
		icon: 'ti ti-edit', text: i18n.ts.edit, action: editComment,
	}] : [getAbuseNoteMenu(note, i18n.ts.reportAbuse), {
		icon: 'ti ti-ban', text: i18n.ts.block, danger: true,
		action: async () => {
			const { canceled } = await os.confirm({ type: 'warning', text: i18n.ts.blockConfirm });
			if (canceled) return;
			await os.apiWithDialog('blocking/create', { userId: note.userId });
			muted.value = true;
		},
	}];
	await os.popupMenu(menu, ev.currentTarget ?? ev.target);
}

const showContent = ref(false);
const replies = ref<Misskey.entities.Note[]>([]);
const loadingReplies = ref(false);
const repliesError = ref(false);
const replyAbortController = new AbortController();
const replyLoader = props.detail && props.depth === 1 && props.note != null
	? createFlatNoteRepliesLoader<Misskey.entities.Note>(props.note, params => misskeyApi('notes/replies', params, undefined, replyAbortController.signal))
	: null;
const hasMoreReplies = ref(replyLoader?.hasMore ?? false);
let disposed = false;
const deletedReplySources = new Map<string, Misskey.entities.Note['deletedBy']>();

useGlobalEvent('notePosted', note => {
	if (!props.detail || props.depth !== 1 || note.replyId == null || deletedReplySources.has(note.id)) return;
	if (note.replyId !== props.note?.id && !replies.value.some(reply => reply.id === note.replyId)) return;
	if (!replies.value.some(reply => reply.id === note.id)) replies.value.push(note);
});

useGlobalEvent('noteDeleted', (noteId, _replyId, _renoteId, eventDeletedBy) => {
	deletedReplySources.set(noteId, eventDeletedBy ?? deletedReplySources.get(noteId));
	if (noteId === props.note?.id) markDeleted(eventDeletedBy);
	replies.value = replies.value.map(reply => reply.id === noteId ? toDeletedNote(reply, eventDeletedBy) : reply);
});

function markDeleted(eventDeletedBy?: Misskey.entities.Note['deletedBy']): void {
	deleted.value = true;
	deletedBy.value = eventDeletedBy ?? deletedBy.value ?? props.note?.deletedBy ?? null;
	if (note != null) Object.assign(note, toDeletedNote(note, deletedBy.value));
}

onBeforeUnmount(() => {
	disposed = true;
	replyAbortController.abort();
});

// 有子回复时才从头像下方接出连接线
const hasVisibleReplies = computed(() => replies.value.length > 0);

async function loadReplies(): Promise<void> {
	if (disposed || replyLoader == null || loadingReplies.value) return;
	loadingReplies.value = true;
	repliesError.value = false;
	try {
		const result = await replyLoader.loadMore();
		if (disposed) return;
		replies.value.push(...result.notes.filter(note => !replies.value.some(reply => reply.id === note.id)).map(note => deletedReplySources.has(note.id) ? toDeletedNote(note, deletedReplySources.get(note.id)) : note));
		hasMoreReplies.value = result.hasMore;
	} catch {
		if (!disposed) repliesError.value = true;
	} finally {
		if (!disposed) loadingReplies.value = false;
	}
}

if (hasMoreReplies.value) void loadReplies();
</script>

<style lang="scss" module>
.root {
	--avatarSize: 40px;
	--columnGap: 8px;
	--threadLineWidth: 2px;
	--replyGap: 10px;
	display: grid;
	grid-template-columns: var(--avatarSize) minmax(0, 1fr);
	column-gap: var(--columnGap);
	padding: 20px 32px;
	font-size: 1.05em;
	position: relative;

	&.children {
		padding: 10px 0 0;
		font-size: inherit;
	}
}

.main {
	display: grid;
	grid-column: 1 / -1;
	grid-template-columns: subgrid;
	position: relative;
}

// 头像下方垂下的竖线，接到子回复的肘形上
.mainWithReplies::after {
	content: "";
	position: absolute;
	left: calc((var(--avatarSize) - var(--threadLineWidth)) / 2);
	top: var(--avatarSize);
	bottom: calc(-1 * var(--replyGap));
	width: var(--threadLineWidth);
	background: var(--MI_THEME-divider);
	pointer-events: none;
}

.colorBar {
	position: absolute;
	top: 8px;
	left: 8px;
	width: 5px;
	height: calc(100% - 8px);
	border-radius: 999px;
	pointer-events: none;
}

.avatar {
	display: block;
	width: var(--avatarSize);
	height: var(--avatarSize);
	border-radius: 8px;
}

.body {
	min-width: 0;
}

.deletedContent {
	display: flex;
	align-items: center;
	min-height: var(--avatarSize);
	margin: 0;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: calc(1em - 1px);
}

.cw {
	cursor: default;
	display: block;
	margin: 0;
	padding: 0;
	overflow-wrap: break-word;
}

.text {
	margin: 0;
	padding: 0;
}

.tags {
	margin-top: 10px;
}

.footer {
	display: flex;
	align-items: center;
	gap: 14px;
	min-height: 32px;
	margin-top: 6px;
	font-size: calc(1em - 1px);
	color: var(--MI_THEME-fgTransparentWeak);
}

.time {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.action {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	gap: 4px;
	min-width: 28px;
	min-height: 32px;

	&:hover, &.liked {
		color: var(--MI_THEME-accent);
	}
}

.menu {
	margin-left: auto;
	flex-shrink: 0;
	width: 24px;
	height: 24px;
	min-width: 24px;
	min-height: 24px;
}

.headerRow {
	display: flex;
	align-items: center;
	gap: 8px;
}

.header {
	flex: 1;
	min-width: 0;
	margin-bottom: 2px;
}

.reply, .sentinel, .replyLoading, .replyError {
	grid-column: 2;
	min-width: 0;
	margin-top: var(--replyGap);
}

.sentinel {
	height: 1px;
}

// Connect the parent avatar column to the child avatar in the content column.
.reply {
	--threadLineLeft: calc(-1 * (var(--columnGap) + (var(--avatarSize) + var(--threadLineWidth)) / 2));
	position: relative;

	&::before {
		content: "";
		position: absolute;
		box-sizing: border-box;
		left: var(--threadLineLeft);
		top: 0;
		width: calc(var(--avatarSize) + var(--columnGap) + var(--threadLineWidth) / 2);
		height: calc(10px + (var(--avatarSize) + var(--threadLineWidth)) / 2);
		border-left: solid var(--threadLineWidth) transparent;
		border-bottom: solid var(--threadLineWidth) var(--MI_THEME-divider);
		border-bottom-left-radius: 8px;
		pointer-events: none;
	}

	// 多条同级回复时，线要穿过本条继续往下接到下一条，否则中间会断开
	&::after {
		content: "";
		position: absolute;
		left: var(--threadLineLeft);
		top: 0;
		bottom: calc(-1 * var(--replyGap));
		width: var(--threadLineWidth);
		background: var(--MI_THEME-divider);
		pointer-events: none;
	}

	&:not(.replyWithSibling)::after {
		height: calc(10px + (var(--avatarSize) + var(--threadLineWidth)) / 2 - 8px);
		bottom: auto;
	}

	&.replyWithSibling::before {
		left: calc(var(--threadLineLeft) + var(--threadLineWidth));
		width: calc(var(--avatarSize) + var(--columnGap) - var(--threadLineWidth) / 2);
		border-left: none;
		border-radius: 0;
	}

	&:not(.replyWithSibling)::before {
		border-left-color: var(--MI_THEME-divider);
		clip-path: inset(calc(100% - 8px) 0 0 0);
	}
}

@container (max-width: 450px) {
	.root {
		padding: 14px 16px;

		&.children {
			padding: 10px 0 0;
		}
	}
}

.muted {
	text-align: center;
	padding: 8px !important;
	border: 1px solid var(--MI_THEME-divider);
	margin: 8px 8px 0 8px;
	border-radius: 8px;
}

</style>
