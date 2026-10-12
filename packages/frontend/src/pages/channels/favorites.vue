<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkChannelList :paginator="paginator"/>
</template>

<script lang="ts" setup>
import { markRaw } from 'vue';
import MkChannelList from '@/components/MkChannelList.vue';
import { Paginator } from '@/utility/paginator.js';

const paginator = markRaw(new Paginator('channels/my-favorites', {
	limit: 100,
	noPaging: true,
}));
</script>
