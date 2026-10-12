<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<MkRadios v-model="filter" :options="[{ value: 'active', label: i18n.ts._channel.owned }, { value: 'archived', label: i18n.ts.archived }]"/>
	<MkChannelList :key="filter" :paginator="filter === 'archived' ? archivedPaginator : ownedPaginator"/>
</div>
</template>

<script lang="ts" setup>
import { markRaw, ref } from 'vue';
import MkChannelList from '@/components/MkChannelList.vue';
import MkRadios from '@/components/MkRadios.vue';
import { i18n } from '@/i18n.js';
import { Paginator } from '@/utility/paginator.js';

const filter = ref<'active' | 'archived'>('active');

const ownedPaginator = markRaw(new Paginator('channels/owned', {
	limit: 10,
}));
const archivedPaginator = markRaw(new Paginator('channels/owned', {
	limit: 10,
	params: { isArchived: true },
}));
</script>
