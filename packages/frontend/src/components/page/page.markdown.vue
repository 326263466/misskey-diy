<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkMarkdown :text="block.text"/>
</template>

<script lang="ts" setup>
import type { entities } from 'misskey-js';
import MkMarkdown from '@/components/MkMarkdown.vue';

defineProps<{ block: Extract<entities.PageBlock, { type: 'markdown' }> }>();
</script>
