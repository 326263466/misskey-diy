<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<!--
页面上的举报按钮。图标、文字、显示条件和打开举报窗口都在这里，页面直接引用，不要另写。
菜单里的举报项用 getAbuseReportMenu。
iconOnly 只显示图标，外观随所在操作栏，由页面通过 class 传入。
-->
<template>
<button v-if="visible && iconOnly" v-tooltip.icon="i18n.ts.reportAbuse" type="button" class="_button" :aria-label="i18n.ts.reportAbuse" @click="report">
	<i :class="ABUSE_REPORT_ICON" aria-hidden="true"></i>
</button>
<MkButton v-else-if="visible" small @click="report"><i :class="ABUSE_REPORT_ICON" aria-hidden="true"></i> {{ i18n.ts.reportAbuse }}</MkButton>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import { ABUSE_REPORT_ICON, getReportedUser, openAbuseReport } from '@/utility/abuse-report.js';
import type { AbuseReportTarget } from '@/utility/abuse-report.js';

const props = defineProps<{
	// 内容还在加载时为 null：按钮和同一栏的其他操作一起先显示，加载完成后才能打开举报窗口。
	target: AbuseReportTarget | null;
	// 内容未加载时用于判断是否为自己的内容，例如缓存的作者 ID。
	authorId?: string | null;
	iconOnly?: boolean;
}>();

// 登录后才能举报，且不能举报自己的内容。
const visible = computed(() => {
	if ($i == null) return false;
	const authorId = props.target != null ? getReportedUser(props.target).id : props.authorId;
	return authorId !== $i.id;
});

function report(): void {
	if (props.target != null) void openAbuseReport(props.target);
}
</script>
