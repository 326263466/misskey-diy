<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader>
	<div class="_pageBody">
		<MkClickerGame/>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import MkClickerGame from '@/components/MkClickerGame.vue';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';

definePage(() => ({
	title: i18n.ts.cookieClicker,
	icon: 'ti ti-cookie',
}));
</script>

<style lang="scss" module>

</style>
