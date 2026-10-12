<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_pageBody">
	<section class="_panel _gaps_m" :class="$style.menu">
		<h1 :class="$style.heading">{{ i18n.ts._management.title }}</h1>
		<nav :aria-label="i18n.ts._management.title"><MkSuperMenu :def="menu" grid/></nav>
	</section>
</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import MkSuperMenu from '@/components/MkSuperMenu.vue';
import type { SuperMenuDef } from '@/components/MkSuperMenu.vue';
import { ensureSignin, iAmAdmin } from '@/i.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';

ensureSignin();
const menu = computed<SuperMenuDef[]>(() => [{
	title: i18n.ts._management.products,
	items: [
		{ icon: 'ti ti-plus', text: i18n.ts._marketplace.publishProduct, to: '/products/new' },
		{ icon: 'ti ti-package', text: i18n.ts._marketplace.myProducts, to: '/products/manage' },
	],
}, {
	title: i18n.ts._management.orders,
	items: [
		{ icon: 'ti ti-receipt', text: i18n.ts._marketplace.orders, to: '/orders' },
		{ icon: 'ti ti-building-store', text: i18n.ts._marketplace.sales, to: '/orders?mode=sales' },
	],
}, ...(iAmAdmin ? [{
	title: i18n.ts._management.platform,
	items: [{ icon: 'ti ti-percentage', text: i18n.ts._payments.title, to: '/admin/payments' }],
}] : [])]);
definePage(() => ({ title: i18n.ts._management.title, icon: 'ti ti-layout-grid' }));
</script>

<style lang="scss" module>
.menu { padding: var(--MI-cardPadding); }
.heading { margin: 0; font-size: 1.35em; }
</style>
