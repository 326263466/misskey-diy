<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkCommunityHub active="achievements">
	<MkAchievements :key="refreshKey" :user="$i" card :withLocked="false"/>
</MkCommunityHub>
</template>

<script lang="ts" setup>
import { inject, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from 'vue';
import MkAchievements from '@/components/MkAchievements.vue';
import MkCommunityHub from '@/components/MkCommunityHub.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { ensureSignin } from '@/i.js';
import { claimAchievement } from '@/utility/achievements.js';
import { DI } from '@/di.js';

const $i = ensureSignin();
const refreshKey = ref(0);
const pageActive = inject(DI.pageActive, ref(true));
watch(pageActive, value => { if (value) refreshKey.value++; });

let timer: number | null;

function viewAchievements3min() {
	claimAchievement('viewAchievements3min');
}

onMounted(() => {
	if (timer == null) timer = window.setTimeout(viewAchievements3min, 1000 * 60 * 3);
});

onUnmounted(() => {
	if (timer != null) {
		window.clearTimeout(timer);
		timer = null;
	}
});

onActivated(() => {
	refreshKey.value++;
	if (timer == null) timer = window.setTimeout(viewAchievements3min, 1000 * 60 * 3);
});

onDeactivated(() => {
	if (timer != null) {
		window.clearTimeout(timer);
		timer = null;
	}
});

definePage(() => ({
	title: i18n.ts.achievements,
	icon: 'ti ti-medal',
	needWideArea: true,
}));
</script>

