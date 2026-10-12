<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon>
		<i v-if="signin.success" class="ti ti-check" :class="$style.succ" aria-hidden="true"></i>
		<i v-else class="ti ti-circle-x" :class="$style.fail" aria-hidden="true"></i>
	</template>
	<template #label>{{ title }}</template>
	<template #caption>
		<span :class="$style.caption">
			<span :class="{ [$style.fail]: !signin.success }">{{ signin.success ? i18n.ts._signinHistory.success : i18n.ts.loginFailed }}</span>
			<span> · </span>
			<span class="_monospace">{{ signin.ip }}</span>
		</span>
	</template>
	<template #suffix><MkTime :time="signin.createdAt"/></template>

	<div class="_gaps_s">
		<MkKeyValue oneline>
			<template #key>{{ i18n.ts.dateAndTime }}</template>
			<template #value><MkTime :time="signin.createdAt" mode="detail"/></template>
		</MkKeyValue>
		<MkKeyValue v-if="deviceLabel != null" oneline>
			<template #key>{{ i18n.ts._signinHistory.device }}</template>
			<template #value>{{ deviceLabel }}</template>
		</MkKeyValue>
		<MkKeyValue v-if="language != null" oneline>
			<template #key>{{ i18n.ts.language }}</template>
			<template #value>{{ language }}</template>
		</MkKeyValue>
		<MkKeyValue :copy="signin.ip">
			<template #key>{{ i18n.ts._signinHistory.ipAddress }}</template>
			<template #value><span class="_monospace" :class="$style.wrap">{{ signin.ip }}</span></template>
		</MkKeyValue>
		<MkKeyValue v-if="userAgent != null" :copy="userAgent">
			<template #key>{{ i18n.ts._signinHistory.userAgent }}</template>
			<template #value><span class="_monospace" :class="$style.wrap">{{ userAgent }}</span></template>
		</MkKeyValue>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import * as Misskey from 'misskey-js';
import MkFolder from '@/components/MkFolder.vue';
import MkKeyValue from '@/components/MkKeyValue.vue';
import { i18n } from '@/i18n.js';
import { langmap } from '@/utility/langmap.js';
import { formatUserAgent, parseUserAgent } from '@@/js/parse-user-agent.js';

const props = defineProps<{
	signin: Misskey.entities.Signin;
}>();

// 只读取界面需要的请求头，不展示 Cookie 等其他内容。
const headers = computed(() => props.signin.headers as Record<string, unknown>);

const userAgent = computed(() => {
	const ua = headers.value['user-agent'];
	return typeof ua === 'string' && ua.trim() !== '' ? ua : null;
});

const parsed = computed(() => parseUserAgent(userAgent.value));

const title = computed(() => formatUserAgent(userAgent.value) ?? i18n.ts._signinHistory.unknownDevice);

const deviceLabel = computed(() => {
	switch (parsed.value.device) {
		case 'desktop': return i18n.ts.desktop;
		case 'smartphone': return i18n.ts.smartphone;
		case 'tablet': return i18n.ts.tablet;
		default: return null;
	}
});

const language = computed(() => {
	const header = headers.value['accept-language'];
	if (typeof header !== 'string') return null;
	const tag = header.split(/[,;]/)[0].trim();
	if (tag === '' || tag === '*') return null;
	return (langmap as Record<string, { nativeName: string } | undefined>)[tag]?.nativeName ?? tag;
});
</script>

<style lang="scss" module>
.succ {
	color: var(--MI_THEME-success);
}

.fail {
	color: var(--MI_THEME-error);
}

.caption {
	display: block;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.wrap {
	word-break: break-all;
}
</style>
