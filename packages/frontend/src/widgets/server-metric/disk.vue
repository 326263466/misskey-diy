<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="zbwaqsat">
	<XPie class="pie" :value="usage"/>
	<div>
		<p><i class="ti ti-database"></i>{{ i18n.ts.disk }}</p>
		<p>{{ i18n.ts.total }}: {{ bytes(total, 1) }}</p>
		<p>{{ i18n.ts._serverStats.free }}: {{ bytes(available, 1) }}</p>
		<p>{{ i18n.ts.used }}: {{ bytes(used, 1) }}</p>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import * as Misskey from 'misskey-js';
import XPie from './pie.vue';
import bytes from '@/filters/bytes.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	meta: Misskey.entities.ServerInfoResponse;
}>();

const usage = computed(() => props.meta.fs.used / props.meta.fs.total);
const total = computed(() => props.meta.fs.total);
const used = computed(() => props.meta.fs.used);
const available = computed(() => props.meta.fs.total - props.meta.fs.used);
</script>

<style lang="scss" scoped>
.zbwaqsat {
	display: flex;
	padding: var(--MI-cardPadding, 20px);

	> .pie {
		height: 82px;
		flex-shrink: 0;
		margin-right: 16px;
	}

	> div {
		flex: 1;

		> p {
			margin: 0;
			font-size: 0.8em;

			&:first-child {
				font-weight: bold;
				margin-bottom: 4px;

				> i {
					margin-right: 4px;
				}
			}
		}
	}
}
</style>
