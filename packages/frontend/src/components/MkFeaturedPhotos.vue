<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-if="instance" class="_imageContainer">
	<img v-if="instance.backgroundImageUrl" class="_imageBackground" :src="instance.backgroundImageUrl" alt=""/>
</div>
</template>

<script lang="ts" setup>
import { instance } from '@/instance.js';
</script>

