<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageTimeline v-if="openGuestAccess"/>
<div v-else-if="instance">
	<XSetup v-if="instance.requireSetup"/>
	<XEntranceClassic v-else-if="(instance.clientOptions.entrancePageStyle ?? 'classic') === 'classic'"/>
	<XEntranceSimple v-else/>
</div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import type * as Misskey from 'misskey-js';
import { instanceName } from '@@/js/config.js';
import XSetup from './welcome.setup.vue';
import XEntranceClassic from './welcome.entrance.classic.vue';
import XEntranceSimple from './welcome.entrance.simple.vue';
import PageTimeline from './timeline.vue';
import { fetchInstance, instance as serverInstance } from '@/instance.js';
import { definePage } from '@/page.js';

const openGuestAccess = !serverInstance.requireSetup && serverInstance.clientOptions.openGuestAccess === true;
const instance = ref<Misskey.entities.MetaDetailed | null>(null);

if (!openGuestAccess) {
	fetchInstance(true).then(res => {
		instance.value = res;
	});

	definePage(() => ({
		title: instanceName,
		icon: null,
	}));
}
</script>
