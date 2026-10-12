<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader>
	<div class="_pageBody">
		<MkUserList :paginator="paginator" pageEmpty/>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, markRaw, ref, watch } from 'vue';
import MkUserList from '@/components/MkUserList.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { Paginator } from '@/utility/paginator.js';

const props = defineProps<{
	channelId: string;
}>();

const channelName = ref<string | null>(null);

const paginator = markRaw(new Paginator('channels/participants', {
	limit: 30,
	offsetMode: true,
	computedParams: computed(() => ({
		channelId: props.channelId,
	})),
}));

watch(() => props.channelId, async (channelId) => {
	channelName.value = null;
	const channel = await misskeyApi('channels/show', { channelId }).catch(() => null);
	if (channel != null && channelId === props.channelId) channelName.value = channel.name;
}, { immediate: true });

definePage(() => ({
	title: i18n.ts._channel.members,
	subtitle: channelName.value ?? undefined,
	icon: 'ti ti-users',
}));
</script>
