<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<section ref="rootEl" class="_panel _panelPadding" :class="$style.root" :aria-label="i18n.ts._article.comment">
	<h2 :class="$style.heading">{{ i18n.ts._article.comment }} <span>{{ count }}</span></h2>
	<form :class="$style.composer" @submit.prevent="submit">
		<MkAvatar v-if="$i" :user="$i" :class="$style.avatar"/>
		<div v-else :class="[$style.avatar, $style.guestAvatar]" aria-hidden="true"><i class="ti ti-user-filled"></i></div>
		<div :class="$style.editorBody">
			<div v-if="replyTo" :class="$style.replying">
				<span>{{ i18n.ts.reply }} <MkUserName :user="replyTo.user"/></span>
				<button type="button" class="_button _iconButton" :aria-label="i18n.ts.cancel" :disabled="sending || choosingEmoji" @click="replyTo = null"><i class="ti ti-x" aria-hidden="true"></i></button>
			</div>
			<MkPostFormInput :key="articleId" ref="editor" v-model="text" v-model:files="files" :maxLength="CONTENT_LIMITS.commentText" :disabled="sending" :placeholder="i18n.ts._article.commentPlaceholder" @submit="submit">
				<template #actions="{ valid }"><MkButton primary small :disabled="!$i || sending || deleting.size > 0 || !valid" :wait="sending" type="submit">{{ i18n.ts._article.publishComment }}</MkButton></template>
			</MkPostFormInput>
		</div>
	</form>
	<div v-if="actionError" role="alert" :class="$style.error">{{ actionError }}</div>
	<div v-for="thread in threads" :key="thread.comment.id" :class="$style.thread">
		<article v-for="(comment, index) in [thread.comment, ...thread.replies]" :key="comment.id" :class="[$style.comment, { [$style.child]: index > 0, [$style.parentWithReplies]: index === 0 && thread.replies.length > 0, [$style.withSibling]: index > 0 && index < thread.replies.length }]">
			<MkAvatar :user="comment.user" :class="$style.avatar" link preview/>
			<div :class="$style.commentBody">
				<div :class="$style.meta"><MkA :to="userPage(comment.user)"><MkUserName :user="comment.user"/></MkA><MkTime :time="comment.createdAt"/></div>
				<div v-if="comment.replyTo && comment.replyTo.id !== thread.comment.id" :class="$style.quote"><span>{{ i18n.ts.reply }} <MkUserName :user="comment.replyTo.user"/></span><Mfm :text="comment.replyTo.text" :plain="true"/></div>
				<div :class="$style.text"><Mfm :text="comment.text" :author="comment.user"/></div>
				<MkMediaList v-if="comment.files.length" :mediaList="comment.files"/>
				<div :class="$style.actions">
					<button type="button" class="_button" :class="$style.action" :disabled="sending || choosingEmoji || deleting.size > 0" @click="reply(comment, thread.comment.id)"><i class="ti ti-message-circle" aria-hidden="true"></i>{{ i18n.ts.reply }}<span v-if="comment.repliesCount > 0">{{ comment.repliesCount }}</span></button>
					<button v-if="comment.canDelete" type="button" class="_button" :class="$style.action" :disabled="sending || deleting.size > 0" @click="remove(comment)">{{ i18n.ts.delete }}</button>
				</div>
			</div>
		</article>
		<div v-if="thread.hasMore && !thread.error" :key="thread.replies.length" v-appear="() => loadReplies(thread)" :class="$style.sentinel" aria-hidden="true"></div>
		<MkLoading v-if="thread.loading" :class="$style.replyStatus"/>
		<MkButton v-else-if="thread.error" small :class="$style.replyStatus" @click="loadReplies(thread)">{{ i18n.ts.retry }}</MkButton>
		<MkButton v-else-if="thread.hasMore" small :class="$style.replyStatus" @click="loadReplies(thread)">{{ i18n.ts.loadMore }}</MkButton>
	</div>
	<MkLoading v-if="loading"/>
	<MkButton v-else-if="loadError" @click="loadMore">{{ i18n.ts.retry }}</MkButton>
	<MkButton v-else-if="hasMore" @click="loadMore">{{ i18n.ts.loadMore }}</MkButton>
	<MkCommentEmpty v-else-if="threads.length === 0"/>
</section>
</template>

<script lang="ts" setup>
import { computed, markRaw, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue';
import { CONTENT_LIMITS } from 'misskey-js';
import type { Endpoints, entities } from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkPostFormInput from '@/components/MkPostFormInput.vue';
import MkMediaList from '@/components/MkMediaList.vue';
import MkCommentEmpty from '@/components/MkCommentEmpty.vue';
import { $i } from '@/i.js';
import { pleaseLogin } from '@/utility/please-login.js';
import { i18n } from '@/i18n.js';
import { userPage } from '@@/js/user.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { isAccountSessionErrorHandled } from '@/utility/account-session-error.js';
import { createFlatNoteRepliesLoader } from '@/utility/flat-note-replies.js';
import * as os from '@/os.js';

type ArticleComment = Endpoints['articles/comments']['res'][number];
type ArticleThread = {
	comment: ArticleComment;
	replies: ArticleComment[];
	loader: ReturnType<typeof createFlatNoteRepliesLoader<ArticleComment>>;
	hasMore: boolean;
	loading: boolean;
	error: boolean;
};
const props = defineProps<{ articleId: string; count: number }>();
const emit = defineEmits<{ (event: 'countChange', difference: number): void }>();
const rootEl = useTemplateRef('rootEl');
const editor = useTemplateRef('editor');
const threads = ref<ArticleThread[]>([]);
const text = ref('');
const files = ref<entities.DriveFile[]>([]);
const textLength = computed(() => Array.from(text.value).length);
const replyTo = ref<ArticleComment | null>(null);
let replyingRootId: string | null = null;
const loading = ref(false);
const loadError = ref(false);
const actionError = ref('');
const hasMore = ref(true);
const sending = ref(false);
const choosingEmoji = computed(() => editor.value?.busy ?? false);
const deleting = ref(new Set<string>());
let cursor: string | undefined;
let generation = 0;
let listGeneration = 0;

function createThread(comment: ArticleComment): ArticleThread {
	const articleId = props.articleId;
	return {
		comment,
		replies: [],
		loader: markRaw(createFlatNoteRepliesLoader(comment, ({ noteId, ...pagination }) => misskeyApi('articles/comments', { articleId, replyId: noteId, ...pagination }))),
		hasMore: comment.repliesCount > 0,
		loading: false,
		error: false,
	};
}

async function loadReplies(thread: ArticleThread) {
	if (thread.loading || !thread.hasMore) return;
	const current = generation;
	const currentList = listGeneration;
	thread.loading = true;
	thread.error = false;
	try {
		const result = await thread.loader.loadMore();
		if (current !== generation || currentList !== listGeneration) return;
		const existing = new Set(thread.replies.map(comment => comment.id));
		thread.replies.push(...result.notes.filter(comment => !existing.has(comment.id)));
		thread.hasMore = result.hasMore;
	} catch (error) {
		if (current === generation && currentList === listGeneration && !isAccountSessionErrorHandled(error)) thread.error = true;
	} finally {
		if (current === generation && currentList === listGeneration) thread.loading = false;
	}
}

async function loadMore() {
	if (loading.value || !hasMore.value) return;
	const current = generation;
	const currentList = listGeneration;
	loading.value = true;
	loadError.value = false;
	try {
		const result = await misskeyApi('articles/comments', { articleId: props.articleId, replyId: null, untilId: cursor, limit: 21 });
		if (current !== generation || currentList !== listGeneration) return;
		hasMore.value = result.length > 20;
		const chunk = result.slice(0, 20);
		cursor = chunk.at(-1)?.id;
		const existing = new Set(threads.value.map(thread => thread.comment.id));
		threads.value.push(...chunk.filter(comment => !existing.has(comment.id)).map(createThread));
	} catch (error) {
		if (current === generation && currentList === listGeneration && !isAccountSessionErrorHandled(error)) loadError.value = true;
	} finally {
		if (current === generation && currentList === listGeneration) loading.value = false;
	}
}

function resetComments() {
	listGeneration++;
	threads.value = [];
	cursor = undefined;
	loading.value = false;
	loadError.value = false;
	hasMore.value = true;
}

function focus() {
	rootEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	editor.value?.focus();
}

async function reply(comment: ArticleComment, rootId: string) {
	if (sending.value || choosingEmoji.value || deleting.value.size > 0) return;
	if (!await pleaseLogin()) return;
	replyTo.value = comment;
	replyingRootId = rootId;
	await nextTick();
	focus();
}

async function submit() {
	if (!$i || sending.value || choosingEmoji.value || deleting.value.size > 0 || !editor.value?.valid || textLength.value > CONTENT_LIMITS.commentText) return;
	const current = generation;
	const target = replyTo.value;
	const rootId = replyingRootId;
	sending.value = true;
	actionError.value = '';
	try {
		const comment = await misskeyApi('articles/comments/create', { articleId: props.articleId, text: text.value.trim(), fileIds: files.value.map(file => file.id), replyId: target?.id });
		if (current !== generation) return;
		const thread = target ? threads.value.find(item => item.comment.id === rootId) : null;
		if (!target) {
			threads.value.unshift(createThread(comment));
		} else if (thread) {
			const parent = [thread.comment, ...thread.replies].find(item => item.id === target.id);
			if (parent) parent.repliesCount++;
			thread.replies.unshift(comment);
		} else {
			resetComments();
			void loadMore();
		}
		editor.value?.submitted();
		replyTo.value = null;
		replyingRootId = null;
		emit('countChange', 1);
	} catch (error) {
		if (current === generation && !isAccountSessionErrorHandled(error)) os.toast(i18n.ts.somethingHappened, 'error');
	} finally {
		if (current === generation) sending.value = false;
	}
}

async function remove(comment: ArticleComment) {
	if (sending.value || deleting.value.size > 0) return;
	const current = generation;
	const { canceled } = await os.confirm({ type: 'warning', text: i18n.ts._article.deleteCommentConfirm });
	if (canceled || current !== generation || sending.value || deleting.value.size > 0) return;
	deleting.value.add(comment.id);
	actionError.value = '';
	try {
		await misskeyApi('articles/comments/delete', { commentId: comment.id });
		if (current !== generation) return;
		if (replyTo.value?.id === comment.id) replyTo.value = null;
		replyingRootId = null;
		emit('countChange', -1);
		// 删除后直接子评论会成为父评论，重新读取层级，避免把它们留在已删除的分组中。
		resetComments();
		await loadMore();
	} catch (error) {
		if (current === generation && !isAccountSessionErrorHandled(error)) actionError.value = i18n.ts.somethingHappened;
	} finally {
		if (current === generation) deleting.value.delete(comment.id);
	}
}

watch(() => props.articleId, () => {
	generation++;
	resetComments();
	text.value = '';
	files.value = [];
	replyTo.value = null;
	replyingRootId = null;
	sending.value = false;
	deleting.value.clear();
	actionError.value = '';
	void loadMore();
}, { immediate: true });
onBeforeUnmount(() => { generation++; });
defineExpose({ focus });
</script>

<style lang="scss" module>
.root { display: flex; flex-direction: column; gap: var(--MI-margin); scroll-margin-top: calc(var(--MI-stickyTop, 0px) + 16px); }
.heading { margin: 0; font-size: 1.2em; }
.heading > span { color: var(--MI_THEME-fgTransparentWeak); font-size: .85em; font-weight: normal; }
.composer { display: flex; align-items: flex-start; gap: 12px; width: 100%; min-width: 0; }
.editorBody { flex: 1 1 auto; width: 100%; min-width: 0; }
.replying { display: flex; justify-content: space-between; align-items: center; gap: var(--MI-marginHalf); margin-bottom: var(--MI-marginHalf); padding: var(--MI-marginHalf) var(--MI-margin); background: var(--MI_THEME-panelHighlight); border-radius: var(--MI-radius); }
.replying > span { min-width: 0; overflow-wrap: anywhere; }
.thread { --avatarSize: 36px; --columnGap: 12px; --threadLineWidth: 2px; display: grid; grid-template-columns: var(--avatarSize) minmax(0, 1fr); column-gap: var(--columnGap); padding-top: var(--MI-margin); border-top: var(--MI-divider); }
.comment { display: flex; position: relative; grid-column: 1 / -1; gap: var(--columnGap); min-width: 0; }
.parentWithReplies::after { content: ''; position: absolute; left: calc((var(--avatarSize) - var(--threadLineWidth)) / 2); top: var(--avatarSize); bottom: 0; width: var(--threadLineWidth); background: var(--MI_THEME-divider); pointer-events: none; } // divider-exempt: thread connector line
.child { grid-column: 2; padding-top: 16px; }
.child::before { content: ''; position: absolute; left: calc(-1 * (var(--columnGap) + (var(--avatarSize) + var(--threadLineWidth)) / 2)); top: 0; width: calc(var(--columnGap) + var(--avatarSize) / 2); height: calc(16px + var(--avatarSize) / 2); border-left: solid var(--threadLineWidth) var(--MI_THEME-divider); border-bottom: solid var(--threadLineWidth) var(--MI_THEME-divider); border-bottom-left-radius: 8px; pointer-events: none; } // divider-exempt: thread connector line
.withSibling::after { content: ''; position: absolute; left: calc(-1 * (var(--columnGap) + (var(--avatarSize) + var(--threadLineWidth)) / 2)); top: 0; bottom: 0; width: var(--threadLineWidth); background: var(--MI_THEME-divider); pointer-events: none; } // divider-exempt: thread connector line
.sentinel, .replyStatus { grid-column: 2; margin-top: 8px; }
.sentinel { height: 1px; }
.avatar { flex-shrink: 0; width: 36px; height: 36px; }
.guestAvatar { display: grid; place-items: center; border-radius: 50%; background: var(--MI_THEME-panelHighlight); color: var(--MI_THEME-fgTransparentWeak); font-size: 24px; overflow: hidden; }
.commentBody { flex: 1; min-width: 0; }
.meta { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; font-size: .85em; }
.meta > time { color: var(--MI_THEME-fgTransparentWeak); }
.text { margin: 10px 0; overflow-wrap: anywhere; }
.quote { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; padding: 8px 12px; border-radius: 6px; background: var(--MI_THEME-panelHighlight); color: var(--MI_THEME-fgTransparentWeak); font-size: .85em; overflow-wrap: anywhere; }
.actions { display: flex; align-items: center; gap: 16px; color: var(--MI_THEME-fgTransparentWeak); font-size: .85em; }
.action { display: inline-flex; align-items: center; gap: 4px; min-height: 32px; }
.action:hover:not(:disabled) { color: var(--MI_THEME-accent); }
.action:focus-visible { outline: 2px solid var(--MI_THEME-focus); }
.error { color: var(--MI_THEME-error) !important; }
</style>
