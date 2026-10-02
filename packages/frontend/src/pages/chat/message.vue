<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard>
	<div class="_pageBody">
		<div v-if="initializing">
			<MkLoading/>
		</div>
		<MkError v-else-if="error" @retry="initialize"/>
		<div v-else-if="message">
			<XMessage :message="message" :isSearchResult="true"/>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import * as Misskey from 'misskey-js';
import XMessage from './XMessage.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { definePage } from '@/page.js';

const props = defineProps<{
	messageId: string;
}>();

const initializing = ref(true);
const message = ref<Misskey.entities.ChatMessage | null>();
const error = ref(false);

async function initialize() {
	initializing.value = true;
	error.value = false;

	try {
		message.value = await misskeyApi('chat/messages/show', {
			messageId: props.messageId,
		});
	} catch {
		error.value = true;
	} finally {
		initializing.value = false;
	}
}

onMounted(() => {
	initialize();
});

definePage({
	title: i18n.ts.chat,
});
</script>
