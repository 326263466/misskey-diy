<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-if="company || jobTitle" :class="$style.root">
	<span v-if="jobTitle" :class="$style.value" :title="`${i18n.ts._profile.jobTitle}: ${jobTitle}`">{{ jobTitle }}</span>
	<span v-if="company && jobTitle" :class="$style.separator" aria-hidden="true">·</span>
	<span v-if="company" :class="$style.value" :title="`${i18n.ts._profile.company}: ${company}`">@{{ company }}</span>
</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { i18n } from '@/i18n.js';
import { useUserProfile } from '@/composables/use-user-profile.js';

const props = defineProps<{
	user: { id?: string; company?: string | null; jobTitle?: string | null };
}>();

const user = useUserProfile(() => props.user);
const company = computed(() => user.value.company?.trim());
const jobTitle = computed(() => user.value.jobTitle?.trim());
</script>

<style lang="scss" module>
.root {
	display: flex;
	align-items: center;
	gap: 0.18em;
	min-width: 0;
	margin-top: 2px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: .82em;
	line-height: 1.4;
}

.value {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.separator {
	flex-shrink: 0;
}
</style>
