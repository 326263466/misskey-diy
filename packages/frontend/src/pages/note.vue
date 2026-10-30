<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader hideHeader>
	<div class="_pageBody" :class="[$style.reader, { [$style.inWindow]: inWindow }]">
		<div :class="$style.main">
			<template v-if="note">
				<MkRemoteCaution v-if="appearNote!.user.host != null" :href="appearNote!.url ?? appearNote!.uri"/>
				<MkNoteDetailed :key="note.id" :note="note" standalone/>
			</template>
			<MkNoteUnavailable v-else-if="unavailable"/>
			<MkError v-else-if="error" page @retry="fetchNote"/>
			<div v-else :class="$style.loading"><MkLoading/></div>
		</div>
		<aside v-if="!inWindow" ref="sidebarEl" :class="$style.sidebar">
			<template v-if="sidebarVisible && active && pageActive">
				<MkUserCardMini v-if="appearNote" :user="appearNote.user" :withChart="false" :cachePath="`/notes/${appearNote.id}`" author/>
				<div v-if="note || error" :class="$style.sidebarSticky" @wheel="onSidebarWheel">
					<MkNoteRecommendations :excludeId="appearNote?.id" :channelId="appearNote?.channelId"/>
				</div>
			</template>
		</aside>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, inject, onActivated, onBeforeUnmount, onDeactivated, ref, useTemplateRef, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import { host } from '@@/js/config.js';
import { getScrollContainer } from '@@/js/scroll.js';
import MkNoteDetailed from '@/components/MkNoteDetailed.vue';
import MkRemoteCaution from '@/components/MkRemoteCaution.vue';
import MkNoteRecommendations from '@/components/MkNoteRecommendations.vue';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import MkNoteUnavailable from '@/components/MkNoteUnavailable.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import { dateString } from '@/filters/date.js';
import { pleaseLogin } from '@/utility/please-login.js';
import { getAppearNote } from '@/utility/get-appear-note.js';
import { serverContext, assertServerContext } from '@/server-context.js';
import { $i } from '@/i.js';
import { DI } from '@/di.js';

// 服务端预取的帖子只代表未登录视角，登录后重新获取。
const CTX_NOTE = !$i && assertServerContext(serverContext, 'note') ? serverContext.note : null;
const SIGNIN_REQUIRED_ERRORS = ['fbcc002d-37d9-4944-a6b0-d9e29f2d33ab', '145f88d2-b03d-4087-8143-a78928883c4b'];
const NOTE_UNAVAILABLE_ERROR = 'NO_SUCH_NOTE';

const props = defineProps<{
	noteId: string;
}>();

const inWindow = inject<boolean>('inWindow', false);
const pageActive = inject(DI.pageActive, ref(true));
const active = ref(true);
const note = ref<Misskey.entities.Note | null>(null);
const appearNote = computed(() => note.value == null ? null : getAppearNote(note.value) ?? note.value);
const error = ref<unknown>(null);
// 不存在、已删除和因拉黑不可见的帖子都由 notes/show 返回 NO_SUCH_NOTE。
const unavailable = computed(() => (error.value as { code?: string } | null)?.code === NOTE_UNAVAILABLE_ERROR);
let request = 0;

async function fetchNote(): Promise<void> {
	const current = ++request;
	note.value = null;
	error.value = null;
	try {
		const result = CTX_NOTE?.id === props.noteId ? CTX_NOTE : await misskeyApi('notes/show', { noteId: props.noteId });
		if (current !== request) return;
		note.value = result;
	} catch (err) {
		if (current !== request) return;
		error.value = err;
	}
}

watch(() => props.noteId, fetchNote, { immediate: true });
onActivated(() => { active.value = true; });
onDeactivated(() => { active.value = false; });
onBeforeUnmount(() => { request++; });

// 缓存中的后台页面不弹登录框，回到该页面时再提示。
watch([error, active, pageActive], ([err, isActive, isPageActive]) => {
	if (!isActive || !isPageActive) return;
	const id = (err as { id?: string } | null)?.id;
	if (id == null || !SIGNIN_REQUIRED_ERRORS.includes(id)) return;
	pleaseLogin({
		path: '/',
		message: id === SIGNIN_REQUIRED_ERRORS[0] ? i18n.ts.thisContentsAreMarkedAsSigninRequiredByAuthor : i18n.ts.signinOrContinueOnRemote,
		openOnRemote: { type: 'lookup', url: `https://${host}/notes/${props.noteId}` },
	});
});

const sidebarEl = useTemplateRef('sidebarEl');
const sidebarVisible = ref(false);
watch(sidebarEl, (element, _previous, onCleanup) => {
	sidebarVisible.value = false;
	if (!element) return;
	const update = () => { sidebarVisible.value = element.getBoundingClientRect().width > 0; };
	const observer = new ResizeObserver(update);
	observer.observe(element);
	update();
	onCleanup(() => observer.disconnect());
}, { flush: 'post' });

// 吸顶区域内尚可滚动时由推荐区接管滚轮，否则继续滚动页面。
function onSidebarWheel(ev: WheelEvent) {
	const region = ev.currentTarget as HTMLElement;
	const page = getScrollContainer(region.parentElement);
	if (page == null || ev.deltaY === 0) return;
	const down = ev.deltaY > 0;
	const stuck = region.getBoundingClientRect().top <= page.getBoundingClientRect().top + (parseFloat(getComputedStyle(region).top) || 0) + 1;
	const regionCanScroll = down ? region.scrollTop + region.clientHeight < region.scrollHeight - 1 : region.scrollTop > 0;
	if (stuck && regionCanScroll) return;
	const pageCanScroll = down ? page.scrollTop + page.clientHeight < page.scrollHeight - 1 : page.scrollTop > 0;
	if (!pageCanScroll) return;
	ev.preventDefault();
	const unit = ev.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : ev.deltaMode === WheelEvent.DOM_DELTA_PAGE ? page.clientHeight : 1;
	page.scrollBy({ top: ev.deltaY * unit, behavior: 'instant' });
}

definePage(() => ({
	title: i18n.ts.note,
	...note.value ? {
		subtitle: dateString(note.value.createdAt),
		avatar: note.value.user,
		path: `/notes/${note.value.id}`,
		share: {
			title: i18n.tsx.noteOf({ user: note.value.user.name ?? note.value.user.username }),
			text: note.value.text,
		},
	} : {},
}));
</script>

<style lang="scss" module>
// 列宽和右栏显示取外壳的全局详情页变量，首屏即按最终宽度排布。
.reader {
	display: grid;
	grid-template-columns: var(--MI-detailColumns, minmax(0, 1fr));
	column-gap: var(--MI-detailColumnGap, 0px);
	align-items: stretch;

	&.inWindow { grid-template-columns: minmax(0, 1fr); }
}

.main {
	display: flex;
	flex-direction: column;
	gap: var(--MI-margin);
	min-width: 0;
}

.sidebar {
	display: var(--MI-detailSidebarDisplay, none);
	flex-direction: column;
	gap: var(--MI-margin);
	min-width: 0;
	align-self: stretch;

	> * { flex-shrink: 0; }
}

// 与文章详情一致：作者卡自然滚出视口，推荐卡吸顶后可在自身范围内滚动。
.sidebarSticky {
	--reach: var(--MI-pageReachTop, 0px);
	position: sticky;
	top: calc(var(--MI-stickyTop, 0px) - var(--reach));
	display: flex;
	flex-direction: column;
	gap: var(--MI-margin);
	max-height: calc(100cqh + var(--reach) - var(--MI-stickyTop, 0px) - var(--MI-stickyBottom, 0px));
	margin-block: calc(-1 * var(--reach)) calc(-1 * var(--MI-pageGap));
	padding-block: var(--reach) var(--MI-pageGap);
	box-sizing: border-box;
	overflow-y: auto;
	overscroll-behavior: contain;
	scrollbar-width: none;
	pointer-events: none;

	&::-webkit-scrollbar { display: none; }
	> * {
		flex-shrink: 0;
		pointer-events: auto;
	}
}

.loading {
	display: flex;
	justify-content: center;
	align-items: center;
	min-height: 240px;
}

</style>
