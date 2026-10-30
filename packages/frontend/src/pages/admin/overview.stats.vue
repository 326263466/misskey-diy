<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<dl :class="$style.root" :aria-label="i18n.ts.statistics">
	<div v-for="card in cards" :key="card.key" :class="$style.card" :aria-busy="card.value == null && !card.failed">
		<dt :class="$style.label"><span>{{ card.label }}</span><i :class="card.icon" aria-hidden="true"></i></dt>
		<dd :class="[$style.value, { [$style.unavailable]: card.failed && card.value == null }]">
			<template v-if="card.value != null">{{ number(card.value) }}</template>
			<span v-else :aria-label="card.failed ? i18n.ts.unavailable : i18n.ts.loading">{{ card.failed ? i18n.ts.unavailable : '—' }}</span>
		</dd>
		<dd :class="$style.growth" :title="todayHint">
			<span>{{ i18n.ts._dashboard.todayNew }}</span>
			<strong>{{ card.today == null ? '—' : `+${number(card.today)}` }}</strong>
		</dd>
		<dd :class="$style.hint">{{ card.hint }}</dd>
	</div>
</dl>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type { entities } from 'misskey-js';
import { dateTimeFormat } from '@@/js/intl-const.js';
import number from '@/filters/number.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	stats: entities.AdminOverviewResponse | null;
	failed: boolean;
}>();

const todayHint = computed(() => props.stats ? i18n.tsx._dashboard.todaySince({ time: dateTimeFormat.format(new Date(props.stats.dayStart)) }) : i18n.ts._dashboard.todayNew);
const cards = computed(() => [
	{ key: 'users', label: i18n.ts._dashboard.localUsers, icon: 'ti ti-users', value: props.stats?.usersCount, today: props.stats?.today.usersCount, failed: props.failed, hint: i18n.ts._dashboard.localUsersHint },
	{ key: 'notes', label: i18n.ts._dashboard.localNotes, icon: 'ti ti-pencil', value: props.stats?.notesCount, today: props.stats?.today.notesCount, failed: props.failed, hint: i18n.ts._dashboard.localNotesHint },
	{ key: 'articles', label: i18n.ts._dashboard.publicArticles, icon: 'ti ti-file-text', value: props.stats?.articlesCount, today: props.stats?.today.articlesCount, failed: props.failed, hint: i18n.ts._dashboard.publicArticlesHint },
	{ key: 'files', label: i18n.ts._dashboard.localFiles, icon: 'ti ti-cloud', value: props.stats?.filesCount, today: props.stats?.today.filesCount, failed: props.failed, hint: i18n.ts._dashboard.localFilesHint },
]);
</script>

<style lang="scss" module>
.root { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin: 0; min-width: 0; }
.card { min-width: 0; padding: 20px; background: var(--MI_THEME-panel); border-radius: var(--MI-cardRadius); }
.label { display: flex; justify-content: space-between; align-items: center; gap: 8px; color: var(--MI_THEME-fgTransparentWeak); font-size: .9em; }
.label > i { color: var(--MI_THEME-accent); font-size: 1.25em; }
.value { margin: 12px 0 8px; color: var(--MI_THEME-fgHighlighted); font-size: 2em; font-weight: 600; line-height: 1.2; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.unavailable { color: var(--MI_THEME-error); font-size: 1.2em; }
.growth { display: flex; flex-wrap: wrap; gap: 4px 8px; margin: 12px 0 8px; font-size: .85em; color: var(--MI_THEME-fgTransparentWeak); }
.growth strong { color: var(--MI_THEME-accent); font-variant-numeric: tabular-nums; font-weight: 600; }
.hint { margin: 0; color: var(--MI_THEME-fgTransparentWeak); font-size: .8em; line-height: 1.5; }

@container (max-width: 760px) {
	.root { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
	.card { padding: 16px; }
}

@container (max-width: 320px) {
	.root { grid-template-columns: minmax(0, 1fr); }
}
</style>
