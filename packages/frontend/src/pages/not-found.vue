<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_pageBody">
	<MkResult type="notFound" :text="i18n.ts.notFoundDescription" page/>
</div>
</template>

<script lang="ts" setup>
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { pleaseLogin } from '@/utility/please-login.js';

const props = defineProps<{
	showLoginPopup?: boolean;
}>();

if (props.showLoginPopup) {
	pleaseLogin({ path: '/' });
}

definePage(() => ({
	title: i18n.ts.notFound,
	icon: 'ti ti-alert-triangle',
}));
</script>
