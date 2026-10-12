<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader hideHeader>
	<div class="_pageBody">
		<MkError v-if="error" page @retry="resolve()"/>
		<MkLoading v-else page/>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { onActivated, onDeactivated, onMounted, onUnmounted, ref } from 'vue';
import * as Misskey from 'misskey-js';
import { host } from '@@/js/config.js';
import { userPage } from '@@/js/user.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import { useRouter } from '@/router.js';
import { pleaseLogin } from '@/utility/please-login.js';
import { serverContext, assertServerContext } from '@/server-context.js';
import { $i } from '@/i.js';

const props = defineProps<{
	noteId: string;
}>();

// contextは非ログイン状態の情報しかないためログイン時は利用できない
const CTX_NOTE = !$i && assertServerContext(serverContext, 'note') ? serverContext.note : null;
const router = useRouter();
const error = ref<unknown>(null);
// 页面被缓存或已离开时，迟到的结果不再跳转；从缓存恢复时重新解析。
let request = 0;
let active = false;

function resolve(): void {
	active = true;
	const current = ++request;
	error.value = null;
	const fetching: Promise<Misskey.entities.Note> = CTX_NOTE?.id === props.noteId
		? Promise.resolve(CTX_NOTE)
		: misskeyApi('notes/show', { noteId: props.noteId });

	fetching.then(note => {
		if (current === request) router.replaceByPath(userPage(note.user));
	}).catch(err => {
		if (current !== request) return;
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
	});
}

function leave(): void {
	active = false;
	request++;
}

onMounted(() => { if (!active) resolve(); });
onActivated(() => { if (!active) resolve(); });
onDeactivated(leave);
onUnmounted(leave);

definePage({
	title: i18n.ts.note,
});
</script>
