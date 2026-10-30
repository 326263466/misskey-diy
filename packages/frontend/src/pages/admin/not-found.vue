<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard hideHeader>
	<div :class="$style.root">
		<MkResult type="notFound" :text="i18n.ts.notFoundDescription"/>
		<div :class="$style.actions">
			<MkA to="/admin/overview" class="_buttonPrimary" :class="$style.primary">{{ i18n.ts.dashboard }}</MkA>
			<MkA to="/" class="_textButton"><i class="ti ti-home" aria-hidden="true"></i> {{ i18n.ts.home }}</MkA>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';

definePage(() => ({ title: i18n.ts.notFound, icon: 'ti ti-alert-triangle' }));
</script>

<style lang="scss" module>
.root {
	padding: var(--MI-cardPadding);
}

.actions {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 20px;
	padding-bottom: var(--MI-cardPadding);
}

.primary {
	padding: 10px 18px;
	border-radius: calc(var(--MI-radius) / 3);
	text-decoration: none;
}
</style>
