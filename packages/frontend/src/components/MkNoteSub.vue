<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-if="note == null" :class="$style.deleted">
	{{ i18n.ts.deletedNote }}
</div>
<div v-else-if="!muted" :class="[$style.root, { [$style.children]: depth > 1 }]">
	<div :class="[$style.main, { [$style.mainWithReplies]: hasVisibleReplies }]">
		<div v-if="note.channel" :class="$style.colorBar" :style="{ background: note.channel.color }"></div>
		<MkAvatar :class="$style.avatar" :user="note.user" link preview/>
		<div :class="$style.body">
			<MkNoteHeader :class="$style.header" :note="note" :mini="true" :showAuthorBadge="isThreadAuthor"/>
			<div>
				<p v-if="note.cw != null" :class="$style.cw">
					<Mfm v-if="note.cw != ''" style="margin-right: 8px;" :text="note.cw" :author="note.user" :nyaize="'respect'"/>
					<MkCwButton v-model="showContent" :text="note.text" :files="note.files" :poll="note.poll"/>
				</p>
				<div v-show="note.cw == null || showContent">
					<MkSubNoteContent :class="$style.text" :note="note" :omitMentionOf="omitMentionOf"/>
				</div>
			</div>
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
		<button
			v-if="hasMoreReplies || loadingReplies || repliesError"
			type="button"
			class="_button"
			:class="$style.more"
			:disabled="loadingReplies"
			:aria-busy="loadingReplies"
			@click="loadReplies"
		>
			<MkLoading v-if="loadingReplies" em/>
			<i v-else :class="repliesError ? 'ti ti-reload' : 'ti ti-chevron-down'"></i>
			<span>{{ repliesError ? i18n.ts.retry : i18n.ts.loadMore }}</span>
		</button>
	</template>
</div>
<div v-else :class="$style.muted" @click="muted = false">
	<I18n :src="i18n.ts.userSaysSomething" tag="small">
		<template #name>
			<MkA v-user-preview="note.userId" :to="userPage(note.user)">
				<MkUserName :user="note.user"/>
			</MkA>
		</template>
	</I18n>
</div>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, ref } from 'vue';
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

// 作者本人的回复，在昵称后加作者标签
const isThreadAuthor = computed(() => props.threadAuthor != null && props.note?.userId === props.threadAuthor.id);

const omitMentionOf = computed(() => {
	if (props.parentComment != null) {
		return props.note?.replyId === props.parentComment.id ? props.parentComment.user : null;
	}
	return props.threadAuthor;
});

const muted = ref(props.note && $i ? checkWordMute(props.note, $i, $i.mutedWords) : false);

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
		replies.value.push(...result.notes);
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
	--avatarSize: 38px;
	--columnGap: 8px;
	--threadLineWidth: 2px;
	display: grid;
	grid-template-columns: var(--avatarSize) minmax(0, 1fr);
	column-gap: var(--columnGap);
	padding: 20px 32px;
	font-size: 1.05em;
	position: relative;

	&.children {
		padding: 10px 0 0;
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
	bottom: 0;
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

.header {
	margin-bottom: 2px;
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

.reply, .more {
	grid-column: 2;
	min-width: 0;
	margin-top: 10px;
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
		top: -10px;
		width: calc(var(--avatarSize) + var(--columnGap) + var(--threadLineWidth) / 2);
		height: calc(20px + (var(--avatarSize) + var(--threadLineWidth)) / 2);
		border-left: solid var(--threadLineWidth) var(--MI_THEME-divider);
		border-bottom: solid var(--threadLineWidth) var(--MI_THEME-divider);
		border-bottom-left-radius: 8px;
		pointer-events: none;
	}

	// 多条同级回复时，线要穿过本条继续往下接到下一条，否则中间会断开
	&.replyWithSibling::after {
		content: "";
		position: absolute;
		left: var(--threadLineLeft);
		top: -10px;
		bottom: 0;
		width: var(--threadLineWidth);
		background: var(--MI_THEME-divider);
		pointer-events: none;
	}
}

.more {
	display: flex;
	align-items: center;
	justify-self: start;
	gap: 6px;
	min-height: 28px;
	padding: 0;
	color: var(--MI_THEME-link);
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

.deleted {
	text-align: center;
	padding: 8px !important;
	margin: 8px 8px 0 8px;
	--color: light-dark(rgba(0, 0, 0, 0.05), rgba(0, 0, 0, 0.15));
	background-size: auto auto;
	background-image: repeating-linear-gradient(135deg, transparent, transparent 10px, var(--color) 4px, var(--color) 14px);
	border-radius: 8px;
}
</style>
