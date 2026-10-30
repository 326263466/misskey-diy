<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<article ref="rootEl" :class="[$style.comment, { [$style.menuOpen]: menuOpen, [$style.child]: child }]">
	<div v-if="$slots.muted" :class="$style.muted"><slot name="muted"></slot></div>
	<template v-else>
		<MkAvatar :user="user" :class="$style.avatar" link preview/>
		<div :class="$style.commentBody">
		<p v-if="deletedText != null" role="status" :class="$style.deleted">{{ deletedText }}</p>
		<template v-else>
			<header :class="$style.meta">
				<div :class="$style.metaContent">
					<MkA :to="userPage(user)"><MkUserName :user="user"/><span v-if="user.id === authorId" :class="$style.authorBadge">{{ i18n.ts.author }}</span></MkA>
					<MkTime :time="createdAt"/>
					<slot name="metadata"></slot>
				</div>
				<button v-if="menu" v-tooltip="i18n.ts.more" type="button" class="_button" :class="[$style.action, $style.menu]" :aria-label="i18n.ts.more" aria-haspopup="menu" :aria-expanded="menuOpen ?? false" :disabled="menuDisabled" @click="emit('menu', $event)"><i class="ti ti-dots" aria-hidden="true"></i></button>
			</header>
			<div v-if="replyTo" :class="$style.quote">
				<div :class="$style.quoteHeader">
					<span :class="$style.quoteUser">@<MkUserName :user="replyTo.user"/></span>
					<span>：</span>
				</div>
				<span :class="$style.quoteText"><Mfm :text="replyTo.isDeleted ? i18n.ts.deletedComment : replyTo.text ?? ''" :plain="true"/></span>
			</div>
			<div :class="$style.text"><slot></slot></div>
			<slot name="contentAfter"></slot>
			<div v-if="$slots.actions || repliesCount != null || likedCount != null" :class="$style.actions">
				<slot name="actions" :actionClass="$style.action" :activeClass="$style.actionActive" :menuClass="$style.menu">
					<button v-if="repliesCount != null" v-tooltip="replyOpen ? i18n.ts._article.cancelReply : i18n.ts.reply" type="button" class="_button" :class="[$style.action, { [$style.actionActive]: replyOpen }]" :aria-label="replyOpen ? i18n.ts._article.cancelReply : i18n.ts.reply" :aria-expanded="replyOpen" :disabled="replyDisabled" @click="emit('reply')">{{ i18n.ts.reply }}<span v-if="repliesCount > 0">{{ repliesCount }}</span></button>
					<button v-if="likedCount != null" v-tooltip="isLiked ? i18n.ts.unlike : i18n.ts.like" type="button" class="_button" :class="[$style.action, { [$style.actionActive]: isLiked }]" :aria-label="isLiked ? i18n.ts.unlike : i18n.ts.like" :aria-pressed="isLiked ?? false" :disabled="likeDisabled" @click="emit('like')">{{ i18n.ts.like }}<span v-if="likedCount > 0">{{ likedCount }}</span></button>
				</slot>
			</div>
			<div v-if="$slots.reply" :class="$style.replyForm"><slot name="reply"></slot></div>
		</template>
		</div>
	</template>
</article>
</template>

<script lang="ts" setup>
import { useTemplateRef } from 'vue';
import type { entities } from 'misskey-js';
import { userPage } from '@@/js/user.js';
import { i18n } from '@/i18n.js';

defineProps<{
	user: entities.UserLite;
	createdAt: string;
	authorId?: string;
	child?: boolean;
	deletedText?: string;
	replyTo?: { id: string; text: string | null; user: entities.UserLite; isDeleted?: boolean } | null;
	repliesCount?: number;
	likedCount?: number;
	isLiked?: boolean;
	replyOpen?: boolean;
	replyDisabled?: boolean;
	likeDisabled?: boolean;
	menuDisabled?: boolean;
	menu?: boolean;
	menuOpen?: boolean;
}>();

const emit = defineEmits<{
	(event: 'reply'): void;
	(event: 'like'): void;
	(event: 'menu', ev: PointerEvent): void;
}>();
const rootEl = useTemplateRef('rootEl');

defineExpose({ rootEl });
</script>

<style lang="scss" module>
// 操作按钮比文字高约 6px，下方内边距相应减掉，让分割线两侧看起来等距。
.comment {
	display: grid;
	grid-column: 1 / -1;
	grid-template-columns: subgrid;
	position: relative;
	min-width: 0;
	padding-block: var(--MI-commentGap) calc(var(--MI-commentGap) - 6px);
}
.child {
	grid-template-columns: var(--MI-commentAvatarSize) minmax(0, 1fr);
	column-gap: var(--MI-commentColumnGap);
	border-top: var(--MI-divider);
}
// 父评论和子评论头像同样大小。
.avatar { width: var(--MI-commentAvatarSize); height: var(--MI-commentAvatarSize); }
.commentBody { min-width: 0; }
.deleted { display: flex; align-items: center; min-height: var(--MI-commentAvatarSize); margin: 0; color: var(--MI_THEME-fgTransparentWeak); }
.muted { grid-column: 1 / -1; width: 100%; text-align: center; color: var(--MI_THEME-fgTransparentWeak); }
.muted > button { padding: 8px; }
.muted > button:focus-visible { outline: 2px solid var(--MI_THEME-focus); }
// 评论使用正文字号，时间和底部操作略小。
.meta { display: flex; align-items: flex-start; gap: 4px; min-width: 0; font-size: 1em; }
.metaContent { display: flex; flex: 1; flex-wrap: wrap; align-items: center; gap: 4px; min-width: 0; min-height: 28px; }
.metaContent > a { min-width: 0; max-width: 100%; overflow-wrap: anywhere; }
.metaContent > time { color: var(--MI_THEME-fgTransparentWeak); font-size: .95em; }
.authorBadge { margin-inline-start: 4px; color: var(--MI_THEME-accent); font-size: .95em; white-space: nowrap; }
// 用户名行、正文、操作行之间留 4px，操作按钮自身上下各约 6px 留白，合计与正文行距相近。
.text { margin: 4px 0 0; overflow-wrap: anywhere; }
// 引用用浅底色与正文分开，显示为“用户名：”一行，内容最多两行。
.quote {
	display: grid;
	gap: 2px;
	min-width: 0;
	margin-block: 6px 8px;
	padding: 6px 10px;
	border-radius: var(--MI-radius);
	background: color-mix(in srgb, var(--MI_THEME-fg) 7%, var(--MI_THEME-panelHighlight));
	color: var(--MI_THEME-fgTransparent);
	font-size: .9em;
	line-height: 1.5;
}
.quoteHeader { display: flex; align-items: baseline; gap: 6px; min-width: 0; }
.quoteHeader > span { flex-shrink: 0; }
.quoteUser { flex: 0 1 auto; min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.quoteUser:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: 2px; }
.quoteText { min-width: 0; display: -webkit-box; overflow: hidden; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.actions { display: flex; align-items: center; gap: 16px; margin-top: 2px; color: var(--MI_THEME-fgTransparentWeak); font-size: .95em; }
.action { display: inline-flex; align-items: center; gap: 4px; min-height: 28px; }
.menu { margin-inline-start: auto; flex-shrink: 0; min-width: 28px; justify-content: center; color: var(--MI_THEME-fgTransparentWeak); font-size: .95em; }
.action:hover:not(:disabled), .actionActive { color: var(--MI_THEME-accent); }
.action:focus-visible { outline: 2px solid var(--MI_THEME-focus); }
.replyForm { margin-top: 8px; }

@media (hover: hover) and (pointer: fine) {
	.comment:not(:hover):not(.menuOpen) .menu:not(:focus-visible) { opacity: 0; pointer-events: none; }
}
</style>
