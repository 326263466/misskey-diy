<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader hideHeader>
	<div class="_pageBody">
		<Teleport v-if="note && sidebarTarget && active && pageActive" :to="sidebarTarget">
			<div class="_gaps">
				<MkUserCardMini :user="getAppearNote(note)?.user ?? note.user" :withChart="false" :cachePath="`/notes/${note.id}`" author/>
				<MkDetailRecommendations kind="note" :excludeId="getAppearNote(note)?.id ?? note.id"/>
			</div>
		</Teleport>
		<Transition name="" mode="out-in">
			<div v-if="note" class="_gaps">
				<MkNoteDetailed :key="note.id" v-model:note="note" :initialTab="initialTab" menuContext="detail" separateActivity :sideActions="!inWindow">
					<template v-if="note.user.host != null" #header>
						<MkRemoteCaution :class="$style.remoteCaution" :href="note.url ?? note.uri"/>
					</template>
				</MkNoteDetailed>
				<div v-if="clips && clips.length > 0">
					<div style="font-weight: bold; padding: 12px;">{{ i18n.ts.clip }}</div>
					<div class="_gaps">
						<MkClipPreview v-for="item in clips" :key="item.id" :clip="item"/>
					</div>
				</div>
			</div>
			<MkError v-else-if="error" page @retry="fetchNote()"/>
			<MkLoading v-else page/>
		</Transition>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, inject, onActivated, onDeactivated, watch, ref } from 'vue';
import * as Misskey from 'misskey-js';
import { host } from '@@/js/config.js';
import MkNoteDetailed from '@/components/MkNoteDetailed.vue';
import MkRemoteCaution from '@/components/MkRemoteCaution.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import { dateString } from '@/filters/date.js';
import MkClipPreview from '@/components/MkClipPreview.vue';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import MkDetailRecommendations from '@/components/MkDetailRecommendations.vue';
import { DI } from '@/di.js';
import { pleaseLogin } from '@/utility/please-login.js';
import { getAppearNote } from '@/utility/get-appear-note.js';
import { serverContext, assertServerContext } from '@/server-context.js';
import { $i } from '@/i.js';

// contextは非ログイン状態の情報しかないためログイン時は利用できない
const CTX_NOTE = !$i && assertServerContext(serverContext, 'note') ? serverContext.note : null;
const inWindow = inject<boolean>('inWindow', false);
const active = ref(true);
const pageActive = inject(DI.pageActive, ref(true));
const detailActionsLoading = inject(DI.detailActionsLoading, ref(true));
const pageSidebar = inject(DI.pageSidebar, ref(null));
const sidebarTarget = computed(() => inWindow ? null : pageSidebar.value);
onActivated(() => { active.value = true; });
onDeactivated(() => { active.value = false; });

const props = defineProps<{
	noteId: string;
	initialTab?: string;
}>();

const note = ref<null | Misskey.entities.Note>(CTX_NOTE);
const clips = ref<Misskey.entities.Clip[]>();
const initialTab = computed<'reactions' | 'replies' | 'renotes' | undefined>(() => {
	if (['reactions', 'replies', 'renotes'].includes(props.initialTab ?? '')) {
		return props.initialTab as 'reactions' | 'replies' | 'renotes';
	}
	return undefined;
});
const error = ref();

function fetchNote() {
	note.value = null;
	error.value = null;
	if (active.value && pageActive.value) detailActionsLoading.value = true;

	if (CTX_NOTE && CTX_NOTE.id === props.noteId) {
		note.value = CTX_NOTE;
		detailActionsLoading.value = false;
		return;
	}

	misskeyApi('notes/show', {
		noteId: props.noteId,
	}).then(res => {
		note.value = res;
		const appearNote = getAppearNote(res) ?? res;
		// 古いノートは被クリップ数をカウントしていないので、2023-10-01以前のものは強制的にnotes/clipsを叩く
		if ((appearNote.clippedCount ?? 0) > 0 || new Date(appearNote.createdAt).getTime() < new Date('2023-10-01').getTime()) {
			misskeyApi('notes/clips', {
				noteId: appearNote.id,
			}).then((_clips) => {
				clips.value = _clips;
			});
		}
	}).catch(err => {
		if (['fbcc002d-37d9-4944-a6b0-d9e29f2d33ab', '145f88d2-b03d-4087-8143-a78928883c4b'].includes(err.id)) {
			pleaseLogin({
				path: '/',
				message: err.id === 'fbcc002d-37d9-4944-a6b0-d9e29f2d33ab' ? i18n.ts.thisContentsAreMarkedAsSigninRequiredByAuthor : i18n.ts.signinOrContinueOnRemote,
				openOnRemote: {
					type: 'lookup',
					url: `https://${host}/notes/${props.noteId}`,
				},
			});
		}
		error.value = err;
	}).finally(() => {
		if (active.value && pageActive.value) detailActionsLoading.value = false;
	});
}

watch(() => props.noteId, fetchNote, {
	immediate: true,
});

// 回复帖和普通帖用不同措辞，否则浏览器标签页上两者无法区分
const pageTitle = computed(() => {
	if (note.value == null) return i18n.ts.note;

	const user = note.value.user.name ?? note.value.user.username;
	return note.value.replyId != null ? i18n.tsx.replyOf({ user }) : i18n.tsx.noteOf({ user });
});

definePage(() => ({
	title: pageTitle.value,
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
.fade-enter-active,
.fade-leave-active {
	transition: opacity 0.125s ease;
}
.fade-enter-from,
.fade-leave-to {
	opacity: 0;
}

.remoteCaution {
	margin: 20px 20px 0;
}

</style>
