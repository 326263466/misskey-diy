<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkCommentComposer v-model="text"/>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import MkCommentComposer from '@/components/MkCommentComposer.vue';

const text = ref('');
</script>
