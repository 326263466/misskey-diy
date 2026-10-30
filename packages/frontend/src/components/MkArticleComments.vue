<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkCommentSection ref="rootEl" :items="threads" :loadMore="loadMore" :count="count" :showHeading="showHeading" :panel="panel" :showThreads="showThreads" :loading="loading" :error="loadError" :hasMore="hasMore || reconciliation != null" :active="pageActive" :composerDocked="composerDocked">
	<template #composer>
		<MkCommentComposer :key="articleId" ref="editor" v-model="text" v-model:files="files" :docked="composerDocked" :disabled="sending || deleting.size > 0" :sending="sending && !sendingReply" @submit="submit">
			<template v-if="$slots.composerActions" #compactActions><slot name="composerActions"></slot></template>
		</MkCommentComposer>
	</template>
	<template v-if="actionError" #actionError>{{ actionError }}</template>
	<template #default="{ items: pageThreads }">
	<MkCommentThread v-for="thread in pageThreads" :key="thread.comment.id" :ref="el => setThreadView(thread.comment.id, el)" :replyCount="thread.comment.repliesCount" :loadedCount="thread.replies.length" :hasMore="thread.hasMore" :loading="thread.loading" :error="thread.error" :active="pageActive" :loadReplies="limit => loadReplies(thread, limit)">
		<template v-for="slotName in commentSlots" #[slotName]="{ start, end }">
		<MkComment v-for="(comment, index) in slotName === 'default' ? [thread.comment] : thread.replies" v-show="slotName === 'default' || (index >= start && index < end)" :id="`comment-${comment.id}`" :key="comment.id" :user="comment.user" :createdAt="comment.createdAt" :authorId="authorId" :child="slotName === 'replies'" :deletedText="comment.isDeleted ? i18n.ts.deletedComment : undefined" :replyTo="comment.replyTo && !isUserBlocked(comment.replyTo.user.id) && comment.replyTo.id !== thread.comment.id ? comment.replyTo : null" :repliesCount="comment.repliesCount" :likedCount="comment.likedCount" :isLiked="comment.isLiked" :replyOpen="replyTo?.id === comment.id" :replyDisabled="sending || choosingEmoji || deleting.size > 0" :likeDisabled="liking.has(comment.id) || deleting.size > 0" :menuDisabled="sending || deleting.size > 0 || blocking.has(comment.user.id)" :menuOpen="menuCommentId === comment.id" menu @reply="reply(comment)" @like="toggleLike(comment)" @menu="showMenu(comment, $event)">
			<Mfm :text="comment.text" :author="comment.user"/>
			<template #contentAfter><MkMediaList v-if="comment.files.length" :mediaList="comment.files"/></template>
			<template v-if="replyTo?.id === comment.id" #reply>
				<MkCommentComposer :ref="el => setReplyEditor(comment.id, el)" v-model="replyText" v-model:files="replyFiles" inline :disabled="sending || deleting.size > 0" :sending="sendingReply" :submitLabel="i18n.ts.reply" :placeholder="i18n.tsx._article.replyPlaceholder({ user: comment.user.name ?? comment.user.username })" @submit="submitReply" @keydown.esc.stop="cancelReply"/>
			</template>
		</MkComment>
		</template>
	</MkCommentThread>
	</template>
</MkCommentSection>
</template>

<script lang="ts" setup>
import { computed, inject, markRaw, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowReactive, useTemplateRef, watch } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import { CONTENT_LIMITS } from 'misskey-js';
import type { Endpoints, entities } from 'misskey-js';
import MkCommentSection, { COMMENT_PAGE_SIZE } from '@/components/MkCommentSection.vue';
import MkCommentThread, { COMMENT_REPLY_PREVIEW_SIZE } from '@/components/MkCommentThread.vue';
import MkComment from '@/components/MkComment.vue';
import MkCommentComposer from '@/components/MkCommentComposer.vue';
import MkMediaList from '@/components/MkMediaList.vue';
import { $i } from '@/i.js';
import { pleaseLogin } from '@/utility/please-login.js';
import { i18n } from '@/i18n.js';
import { getScrollContainer, getStickyTop } from '@@/js/scroll.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { isAccountSessionErrorHandled } from '@/utility/account-session-error.js';
import { createFlatNoteRepliesLoader } from '@/utility/flat-note-replies.js';
import { prefer } from '@/preferences.js';
import { DI } from '@/di.js';
import * as os from '@/os.js';
import type { MenuItem } from '@/types/menu.js';
import { useGlobalEvent } from '@/events.js';
import { isUserBlocked, updateUserBlocking } from '@/utility/user-blocking.js';
import { getAbuseReportMenu } from '@/utility/abuse-report.js';
import { useRouter } from '@/router.js';

type ArticleComment = Endpoints['articles/comments']['res'][number];
type ArticleThread = {
	comment: ArticleComment;
	replies: ArticleComment[];
	loader: ReturnType<typeof createFlatNoteRepliesLoader<ArticleComment>>;
	hasMore: boolean;
	loading: boolean;
	error: boolean;
};
const props = withDefaults(defineProps<{
	articleId: string;
	authorId: string;
	count: number;
	showHeading?: boolean;
	panel?: boolean;
	showThreads?: boolean;
	autofocus?: boolean;
	composerDocked?: boolean;
}>(), { showHeading: true, panel: true, showThreads: true });
const emit = defineEmits<{ (event: 'countChange', difference: number): void }>();
const LIMIT = COMMENT_PAGE_SIZE + 1;
const commentSlots = ['default', 'replies'] as const;
const rootEl = useTemplateRef('rootEl');
const router = useRouter();
const pageActive = inject(DI.pageActive, ref(true));
const editor = useTemplateRef('editor');
const threads = ref<ArticleThread[]>([]);
const text = ref('');
const files = ref<entities.DriveFile[]>([]);
// 回复框展开在被回复的评论下方，与顶部发表评论的输入框分开保存内容。
const replyTo = ref<ArticleComment | null>(null);
const replyText = ref('');
const replyFiles = ref<entities.DriveFile[]>([]);
const replyEditors = shallowReactive(new Map<string, InstanceType<typeof MkCommentComposer>>());
const replyEditor = computed(() => (replyTo.value ? replyEditors.get(replyTo.value.id) : null) ?? null);
const sendingReply = ref(false);
const loading = ref(false);
const loadError = ref(false);
const actionError = ref('');
const hasMore = ref(true);
const sending = ref(false);
const choosingEmoji = computed(() => (editor.value?.busy ?? false) || (replyEditor.value?.busy ?? false));
const deleting = ref(new Set<string>());
const liking = ref(new Set<string>());
const blocking = ref(new Set<string>());
const menuCommentId = ref<string | null>(null);
const likeStates = new Map<string, { revision: number; state: { likedCount: number; isLiked: boolean } }>();
const commentsById = new Map<string, ArticleComment>();
const replyRoots = new Map<string, string>();
const removedIds = new Set<string>();
const commentUpdates = new Map<string, { revision: number; comment: ArticleComment }>();
const threadViews = new Map<string, InstanceType<typeof MkCommentThread>>();
const reconciliation = ref<{ untilId?: string; boundary?: string } | null>(null);
let likeRevision = 0;
let commentRevision = 0;
let blockingRevision = 0;
let cursor: string | undefined;
let generation = 0;
let listGeneration = 0;
let anchorRequest = 0;

function applyRecentLike(comment: ArticleComment, revision: number): ArticleComment {
	const latest = likeStates.get(comment.id);
	if (!comment.isDeleted && latest && latest.revision > revision) Object.assign(comment, latest.state);
	return comment;
}

function mergeComment(comment: ArticleComment, revision = commentRevision, likes = likeRevision): ArticleComment | null {
	if (removedIds.has(comment.id) || isUserBlocked(comment.user.id)) return null;
	const update = commentUpdates.get(comment.id);
	const value = applyRecentLike(update && update.revision > revision ? { ...comment, ...update.comment } : { ...comment }, likes);
	if (value.replyTo) {
		if (isUserBlocked(value.replyTo.user.id)) value.replyTo = null;
		else if (removedIds.has(value.replyTo.id) || commentsById.get(value.replyTo.id)?.isDeleted) value.replyTo = { ...value.replyTo, text: '', isDeleted: true };
	}
	const existing = commentsById.get(value.id);
	if (existing) {
		Object.assign(existing, value);
		return existing;
	}
	const record = reactive(value);
	commentsById.set(record.id, record);
	return record;
}

function rememberUpdate(comment: ArticleComment): void {
	commentUpdates.set(comment.id, { revision: ++commentRevision, comment: { ...comment } });
}

function setThreadView(id: string, view: Element | ComponentPublicInstance | null): void {
	if (view) threadViews.set(id, view as InstanceType<typeof MkCommentThread>);
	else threadViews.delete(id);
}

function createThread(comment: ArticleComment, loader = createRepliesLoader(comment)): ArticleThread {
	if (!replyRoots.has(comment.id)) replyRoots.set(comment.id, comment.id);
	return {
		comment,
		replies: [],
		loader,
		hasMore: comment.repliesCount > 0,
		loading: false,
		error: false,
	};
}

function createRepliesLoader(comment: ArticleComment, reload = false): ArticleThread['loader'] {
	const articleId = props.articleId;
	return markRaw(createFlatNoteRepliesLoader({ ...comment, repliesCount: reload ? Math.max(1, comment.repliesCount) : comment.repliesCount }, ({ noteId, ...pagination }) => misskeyApi('articles/comments', { articleId, replyId: noteId, ...pagination }), { recursive: false, ascending: true }));
}

async function loadReplies(thread: ArticleThread, limit: number) {
	if (!pageActive.value || thread.loading || !thread.hasMore) return;
	const current = generation;
	const currentBlocking = blockingRevision;
	const currentLikes = likeRevision;
	const currentComments = commentRevision;
	const loader = thread.loader;
	thread.loading = true;
	thread.error = false;
	try {
		let added = false;
		// 刷新后的加载器先重扫旧回复，重复批次不能让分页误判为没有新数据。
		do {
			const result = await loader.loadMore(limit);
			if (current !== generation || loader !== thread.loader) return;
			const existing = new Set(thread.replies.map(comment => comment.id));
			for (const value of result.notes) {
				const comment = mergeComment(value, currentComments, currentLikes);
				if (comment && !existing.has(comment.id)) {
					existing.add(comment.id);
					replyRoots.set(comment.id, thread.comment.id);
					thread.replies.push(comment);
					added = true;
				}
			}
			thread.hasMore = result.hasMore;
		} while (!added && thread.hasMore && pageActive.value);
		if (currentBlocking !== blockingRevision || !threads.value.includes(thread)) regroupVisibleComments();
	} catch {
		if (current === generation && loader === thread.loader && threads.value.includes(thread)) thread.error = true;
	} finally {
		if (current === generation && loader === thread.loader) thread.loading = false;
	}
}

async function loadMore() {
	if (!pageActive.value || loading.value || (!hasMore.value && !reconciliation.value)) return;
	const current = generation;
	const currentList = listGeneration;
	const currentLikes = likeRevision;
	const currentComments = commentRevision;
	const scan = reconciliation.value;
	loading.value = true;
	loadError.value = false;
	try {
		const result = await misskeyApi('articles/comments', { articleId: props.articleId, replyId: null, untilId: scan?.untilId ?? (scan ? undefined : cursor), limit: LIMIT });
		if (current !== generation || currentList !== listGeneration) return;
		const chunk = result.slice(0, COMMENT_PAGE_SIZE);
		const known = new Set(threads.value.map(thread => thread.comment.id));
		// 父评论和回复预览一起交给视图，首次定位时不先显示下一条父评论再把它挤走。
		const prepared = await Promise.all(chunk.filter(comment => !known.has(comment.id)).map(async comment => {
			const loader = createRepliesLoader(comment);
			try {
				return { comment, loader, ...await loader.loadMore(COMMENT_REPLY_PREVIEW_SIZE + 1), error: false };
			} catch {
				return { comment, loader, notes: [] as ArticleComment[], hasMore: loader.hasMore, error: true };
			}
		}));
		if (current !== generation || currentList !== listGeneration) return;
		const previews = new Map(prepared.map(preview => [preview.comment.id, preview]));
		const nextCursor = chunk.at(-1)?.id;
		if (scan) {
			if (reconciliation.value === scan) {
				if (scan.boundary == null) {
					// 原列表为空时，这一页同时成为正常分页的起点。
					cursor = nextCursor;
					hasMore.value = result.length > COMMENT_PAGE_SIZE;
					reconciliation.value = null;
				} else if (result.length > COMMENT_PAGE_SIZE && nextCursor && nextCursor !== scan.untilId && nextCursor > scan.boundary) {
					scan.untilId = nextCursor;
				} else {
					reconciliation.value = null;
				}
			}
		} else {
			hasMore.value = result.length > COMMENT_PAGE_SIZE && nextCursor !== cursor;
			cursor = nextCursor;
			if (reconciliation.value && reconciliation.value.boundary == null) reconciliation.value.boundary = cursor;
		}
		const existing = new Map(threads.value.map(thread => [thread.comment.id, thread]));
		const changedReplies: ArticleThread[] = [];
		for (const value of chunk) {
			const previous = existing.get(value.id);
			const previousReplyCount = previous?.comment.repliesCount;
			const comment = mergeComment(value, currentComments, currentLikes);
			if (!comment) continue;
			if (previous) {
				if (previousReplyCount !== comment.repliesCount) {
					previous.loader = createRepliesLoader(comment);
					previous.hasMore = previous.loader.hasMore;
					previous.loading = false;
					previous.error = false;
					changedReplies.push(previous);
				}
				continue;
			}
			const preview = previews.get(comment.id);
			const thread = createThread(comment, preview?.loader);
			existing.set(comment.id, thread);
			thread.hasMore = preview?.hasMore ?? thread.hasMore;
			thread.error = preview?.error ?? false;
			for (const value of preview?.notes ?? []) {
				const reply = mergeComment(value, currentComments, currentLikes);
				if (!reply) continue;
				replyRoots.set(reply.id, comment.id);
				thread.replies.push(reply);
			}
			const index = scan ? threads.value.findIndex(item => item.comment.id < comment.id) : -1;
			if (index < 0) threads.value.push(thread);
			else threads.value.splice(index, 0, thread);
		}
		if (scan) regroupVisibleComments();
		await Promise.all(changedReplies.map(thread => loadReplies(thread, COMMENT_REPLY_PREVIEW_SIZE + 1)));
	} catch {
		if (current === generation && currentList === listGeneration) loadError.value = true;
	} finally {
		if (current === generation && currentList === listGeneration) {
			loading.value = false;
			if (reconciliation.value && reconciliation.value !== scan) void loadMore();
		}
	}
}

function regroupVisibleComments(): void {
	const previous = new Map(threads.value.map(thread => [thread.comment.id, thread]));
	const groups = new Map<string, { thread: ArticleThread; replies: ArticleComment[]; seen: Set<string> }>();
	const loaded = threads.value.flatMap(thread => [thread.comment, ...thread.replies]);
	const known = new Set(loaded.map(comment => comment.id));
	// 拉黑只隐藏缓存，不丢掉回复；解除后仍可恢复已经加载的内容。
	loaded.push(...[...commentsById.values()].filter(comment => !known.has(comment.id)));
	for (const comment of loaded) {
		if (isUserBlocked(comment.user.id) || removedIds.has(comment.id)) continue;
		const replyTo = comment.replyId ? commentsById.get(comment.replyId) : null;
		if (!comment.replyTo && replyTo && !isUserBlocked(replyTo.user.id) && !removedIds.has(replyTo.id)) {
			comment.replyTo = { id: replyTo.id, user: replyTo.user, text: replyTo.text, isDeleted: replyTo.isDeleted };
		}
		let root = comment;
		const ancestors = new Set<string>();
		while (root.replyId && !ancestors.has(root.id)) {
			ancestors.add(root.id);
			const parent = commentsById.get(root.replyId);
			if (!parent) {
				const source = commentsById.get(replyRoots.get(comment.id) ?? '');
				if (source && !isUserBlocked(source.user.id) && !removedIds.has(source.id)) root = source;
				break;
			}
			if (isUserBlocked(parent.user.id)) break;
			root = parent;
		}
		let group = groups.get(root.id);
		if (!group) {
			group = { thread: previous.get(root.id) ?? createThread(root), replies: [], seen: new Set([root.id]) };
			groups.set(root.id, group);
		}
		if (!group.seen.has(comment.id)) {
			group.seen.add(comment.id);
			group.replies.push(comment);
		}
	}
	for (const { thread, replies } of groups.values()) {
		if (thread.replies.length !== replies.length || thread.replies.some((reply, index) => reply.id !== replies[index]?.id)) thread.replies = replies;
	}
	threads.value = [...groups.values()].map(group => group.thread).sort((a, b) => a.comment.id < b.comment.id ? 1 : a.comment.id > b.comment.id ? -1 : 0);
}

function invalidatePageLoad() {
	listGeneration++;
	loading.value = false;
	loadError.value = false;
}

function resetComments() {
	invalidatePageLoad();
	threads.value = [];
	cursor = undefined;
	hasMore.value = true;
	reconciliation.value = null;
}

async function reload() {
	if (!pageActive.value) return;
	invalidatePageLoad();
	// 从第一页补齐新评论，保留已展开的线程和未发送的内容。
	reconciliation.value = { boundary: cursor };
	await loadMore();
}

function focus() {
	const root = rootEl.value?.rootEl;
	if (!root) return;
	const container = getScrollContainer(root);
	const top = root.getBoundingClientRect().top - (container?.getBoundingClientRect().top ?? 0)
		+ (container?.scrollTop ?? window.scrollY) - getStickyTop(root, container) - 16;
	const smooth = prefer.s.animation && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	// 只移动正文的滚动容器，聚焦输入框时不再带动祖先页面。
	editor.value?.focus({ preventScroll: true });
	(container ?? window).scrollTo({ top, behavior: smooth ? 'smooth' : 'instant' });
}

async function locateComment(): Promise<void> {
	const request = ++anchorRequest;
	const id = /^comment-([a-zA-Z0-9]+)$/.exec(router.currentRef.value._parsedRoute.hash ?? '')?.[1];
	if (!id || !pageActive.value || !props.showThreads) return;
	const current = generation;
	const currentBlocking = blockingRevision;
	const valid = () => request === anchorRequest && current === generation && currentBlocking === blockingRevision && pageActive.value;
	const path: ArticleComment[] = [];
	try {
		// 使用现有分页接口定向查 ID，不从第一页无界翻到旧评论。
		for (let depth = 0, parentId: string | null = id; parentId && depth < 32; depth++) {
			let parent = commentsById.get(parentId);
			if (!parent) {
				const revision = commentRevision;
				const likes = likeRevision;
				const result: ArticleComment[] = await misskeyApi('articles/comments', { articleId: props.articleId, untilId: `${parentId}0`, limit: 1 });
				if (!valid() || result[0]?.id !== parentId) return;
				parent = mergeComment(result[0], revision, likes) ?? undefined;
			}
			if (!parent || isUserBlocked(parent.user.id) || removedIds.has(parent.id) || path.some(item => item.id === parent.id)) return;
			path.push(parent);
			parentId = parent.replyTo?.id ?? null;
			if (parentId && depth === 31) return;
		}
		if (!valid()) return;
		const comment = path[0];
		const root = path.at(-1);
		if (!comment || !root) return;
		let thread = threads.value.find(item => item.comment.id === root.id);
		if (!thread) {
			thread = createThread(root);
			const index = threads.value.findIndex(item => item.comment.id < root.id);
			threads.value.splice(index < 0 ? threads.value.length : index, 0, thread);
		}
		for (const reply of path.slice(0, -1)) {
			replyRoots.set(reply.id, root.id);
			if (!thread.replies.some(item => item.id === reply.id)) thread.replies.push(reply);
		}
		// 目标线程可能不在当前页，先切到它所在的页再展开回复。
		rootEl.value?.revealItem(threads.value.indexOf(thread));
		await nextTick();
		if (!valid()) return;
		threadViews.get(root.id)?.revealReply(thread.replies.findIndex(item => item.id === id));
		await nextTick();
		const element = rootEl.value?.rootEl?.querySelector<HTMLElement>(`#comment-${id}`);
		if (!valid() || !element) return;
		const container = getScrollContainer(element);
		const top = element.getBoundingClientRect().top - (container?.getBoundingClientRect().top ?? 0)
			+ (container?.scrollTop ?? window.scrollY) - getStickyTop(element, container) - 16;
		(container ?? window).scrollTo({ top, behavior: 'instant' });
	} catch {
		// 评论已删除或不可见时保留当前列表，不让源链接触发连续重试。
	}
}

function setReplyEditor(id: string, el: Element | ComponentPublicInstance | null) {
	if (el) replyEditors.set(id, el as InstanceType<typeof MkCommentComposer>);
	else replyEditors.delete(id);
}

function cancelReply() {
	if (sending.value || choosingEmoji.value) return;
	replyTo.value = null;
}

async function reply(comment: ArticleComment) {
	if (comment.isDeleted || sending.value || choosingEmoji.value || deleting.value.size > 0 || isUserBlocked(comment.user.id)) return;
	if (replyTo.value?.id === comment.id) return cancelReply();
	if (!await pleaseLogin() || comment.isDeleted || isUserBlocked(comment.user.id)) return;
	if (replyTo.value?.id !== comment.id) {
		replyText.value = '';
		replyFiles.value = [];
	}
	replyTo.value = comment;
	await nextTick();
	replyEditor.value?.focus();
}

async function toggleLike(comment: ArticleComment) {
	if (comment.isDeleted || liking.value.has(comment.id) || deleting.value.size > 0 || isUserBlocked(comment.user.id)) return;
	const current = generation;
	liking.value.add(comment.id);
	try {
		if (!await pleaseLogin() || current !== generation || comment.isDeleted || isUserBlocked(comment.user.id)) return;
		const state = await os.apiWithDialog('articles/comments/like', { commentId: comment.id, liked: !comment.isLiked });
		if (current !== generation || comment.isDeleted || removedIds.has(comment.id) || isUserBlocked(comment.user.id)) return;
		likeStates.set(comment.id, { revision: ++likeRevision, state });
		Object.assign(comment, state);
	} catch {
		// 接口已提示错误，失败时保留点赞状态和计数。
	} finally {
		if (current === generation) liking.value.delete(comment.id);
	}
}

async function showMenu(comment: ArticleComment, ev: PointerEvent) {
	const anchor = ev.currentTarget ?? ev.target;
	const current = generation;
	if (comment.isDeleted || sending.value || deleting.value.size > 0 || blocking.value.has(comment.user.id) || isUserBlocked(comment.user.id)) return;
	if (!await pleaseLogin() || current !== generation || comment.isDeleted || isUserBlocked(comment.user.id)) return;
	const menu: MenuItem[] = [];
	if (comment.user.id !== $i?.id) {
		menu.push(getAbuseReportMenu({ type: 'article_comment', articleId: props.articleId, comment }, () => current === generation && !isUserBlocked(comment.user.id)), {
			icon: 'ti ti-ban', text: i18n.ts.block, danger: true,
			action: async () => {
				if (blocking.value.has(comment.user.id) || isUserBlocked(comment.user.id)) return;
				blocking.value.add(comment.user.id);
				try {
					const { canceled } = await os.confirm({ type: 'warning', text: i18n.ts.blockConfirm });
					if (canceled || isUserBlocked(comment.user.id)) return;
					await os.apiWithDialog('blocking/create', { userId: comment.user.id });
					updateUserBlocking(comment.user.id, true);
					os.toast(i18n.ts.youBlockedThisUser, 'success');
				} catch {
					// 接口已提示错误，失败时不隐藏评论。
				} finally {
					blocking.value.delete(comment.user.id);
				}
			},
		});
	}
	if (comment.canDelete) menu.push({
		icon: 'ti ti-trash', text: i18n.ts.delete, danger: true,
		action: () => current === generation ? remove(comment) : undefined,
	});
	menuCommentId.value = comment.id;
	try {
		await os.popupMenu(menu, anchor);
	} finally {
		if (menuCommentId.value === comment.id) menuCommentId.value = null;
	}
}

async function postComment(input: InstanceType<typeof MkCommentComposer> | null, body: string, attachments: entities.DriveFile[], target: ArticleComment | null) {
	if (!$i || sending.value || choosingEmoji.value || deleting.value.size > 0 || (target && (target.isDeleted || isUserBlocked(target.user.id))) || !input?.valid || Array.from(body).length > CONTENT_LIMITS.commentText) return false;
	const current = generation;
	sending.value = true;
	actionError.value = '';
	try {
		const result = await misskeyApi('articles/comments/create', { articleId: props.articleId, text: body.trim(), fileIds: attachments.map(file => file.id), replyId: target?.id });
		if (current !== generation) return false;
		const comment = mergeComment(result);
		if (!comment) return false;
		rememberUpdate(comment);
		const thread = target ? threads.value.find(item => item.comment.id === target.id || item.replies.some(reply => reply.id === target.id)) : null;
		if (!thread) {
			threads.value.unshift(createThread(comment));
			rootEl.value?.revealItem(0);
		} else if (target) {
			const ancestors = new Set([thread.comment.id]);
			let parent: ArticleComment | undefined = target;
			while (parent && !ancestors.has(parent.id)) {
				ancestors.add(parent.id);
				parent = parent.replyId ? commentsById.get(parent.replyId) : undefined;
			}
			for (const id of ancestors) {
				const ancestor = commentsById.get(id);
				if (ancestor) {
					ancestor.repliesCount++;
					rememberUpdate(ancestor);
				}
			}
			const index = thread.replies.findIndex(item => item.id === target.id) + 1;
			replyRoots.set(comment.id, thread.comment.id);
			thread.replies.splice(index, 0, comment);
			rootEl.value?.revealItem(threads.value.indexOf(thread));
			threadViews.get(thread.comment.id)?.revealReply(index);
		}
		input.submitted();
		emit('countChange', 1);
		return true;
	} catch (error) {
		if (current === generation && !isAccountSessionErrorHandled(error)) os.toast(i18n.ts.somethingHappened, 'error');
		return false;
	} finally {
		if (current === generation) sending.value = false;
	}
}

function submit() {
	return postComment(editor.value, text.value, files.value, null);
}

async function submitReply() {
	const target = replyTo.value;
	if (!target) return;
	sendingReply.value = true;
	try {
		if (await postComment(replyEditor.value, replyText.value, replyFiles.value, target) && replyTo.value?.id === target.id) {
			replyTo.value = null;
		}
	} finally {
		sendingReply.value = false;
	}
}

async function remove(comment: ArticleComment) {
	if (comment.isDeleted || sending.value || deleting.value.size > 0) return;
	const current = generation;
	const { canceled } = await os.confirm({ type: 'warning', text: i18n.ts._article.deleteCommentConfirm });
	if (canceled || current !== generation || sending.value || deleting.value.size > 0) return;
	deleting.value.add(comment.id);
	actionError.value = '';
	try {
		const result = await misskeyApi('articles/comments/delete', { commentId: comment.id });
		if (current !== generation) return;
		for (const id of result.removedIds) {
			removedIds.add(id);
			commentsById.delete(id);
			replyRoots.delete(id);
		}
		for (const value of result.updatedComments) {
			const updated = mergeComment(value);
			if (!updated) continue;
			rememberUpdate(updated);
			if (updated.replyId == null && !threads.value.some(thread => thread.comment.id === updated.id)) {
				// 回复尚未展开时，被提升的评论也必须进入可见线程。
				const index = threads.value.findIndex(thread => thread.comment.id < updated.id);
				threads.value.splice(index < 0 ? threads.value.length : index, 0, createThread(updated));
			}
		}
		commentRevision++;
		for (const item of commentsById.values()) {
			if (item.replyTo?.id === comment.id) {
				item.replyTo = { ...item.replyTo, text: '', isDeleted: true };
				rememberUpdate(item);
			}
		}
		if (replyTo.value && (replyTo.value.id === comment.id || removedIds.has(replyTo.value.id))) {
			replyTo.value = null;
		}
		// 删除顶层评论后，被提升的回复需要接管原线程。
		regroupVisibleComments();
		emit('countChange', result.commentsCount - props.count);
		os.toast(i18n.ts.deleteSucceeded, 'success');
	} catch (error) {
		if (current === generation && !isAccountSessionErrorHandled(error)) actionError.value = i18n.ts.somethingHappened;
	} finally {
		if (current === generation) deleting.value.delete(comment.id);
	}
}

useGlobalEvent('userBlockingChanged', async (_userId, blocked) => {
	const current = generation;
	const currentBlocking = ++blockingRevision;
	const currentComments = commentRevision;
	const articleId = props.articleId;
	if (replyTo.value && isUserBlocked(replyTo.value.user.id)) {
		replyTo.value = null;
	}
	// 拉黑会改变评论可见性，之前发出的页面请求不能再合并回列表。
	invalidatePageLoad();
	for (const thread of threads.value) {
		// 回复加载器会推进自己的游标，仍存在的线程必须接收并过滤这批结果。
		thread.error = false;
	}
	regroupVisibleComments();
	if (!blocked) {
		// 拉黑期间服务端过滤过的页需重新扫描，保留可见回复和编辑内容。
		for (const thread of threads.value) {
			thread.loader = createRepliesLoader(thread.comment, true);
			thread.hasMore = true;
			thread.loading = false;
		}
	}
	// 只补查拉黑后提升到顶层的评论，原列表和各线程游标继续保留。
	reconciliation.value = { boundary: cursor };
	void loadMore();
	try {
		const result = await misskeyApi('articles/show', { articleId });
		if (current === generation && currentBlocking === blockingRevision && currentComments === commentRevision) emit('countChange', result.commentsCount - props.count);
	} catch {
		// 拉黑后文章也可能不可读，不恢复已经隐藏的评论。
	}
});

watch(() => props.articleId, () => {
	generation++;
	resetComments();
	text.value = '';
	files.value = [];
	replyTo.value = null;
	replyText.value = '';
	replyFiles.value = [];
	sending.value = false;
	deleting.value.clear();
	liking.value.clear();
	likeStates.clear();
	commentsById.clear();
	replyRoots.clear();
	removedIds.clear();
	commentUpdates.clear();
	threadViews.clear();
	actionError.value = '';
	void loadMore();
}, { immediate: true });
watch([() => router.currentRef.value._parsedRoute.hash, pageActive, () => props.articleId], () => { void locateComment(); }, { immediate: true, flush: 'post' });
onMounted(() => { if (props.autofocus) editor.value?.focus(); });
onBeforeUnmount(() => { generation++; });
defineExpose({ focus, reload });
</script>
