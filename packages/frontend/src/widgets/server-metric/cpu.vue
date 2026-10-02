<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="vrvdvrys">
	<XPie class="pie" :value="usage"/>
	<div>
		<p><i class="ti ti-cpu"></i>CPU</p>
		<p>{{ i18n.tsx._serverStats.logicalCores({ n: meta.cpu.cores }) }}</p>
		<p>{{ meta.cpu.model }}</p>
	</div>
</div>
</template>

<script lang="ts" setup>
import { onMounted, onBeforeUnmount, ref } from 'vue';
import * as Misskey from 'misskey-js';
import XPie from './pie.vue';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	connection: Misskey.IChannelConnection<Misskey.Channels['serverStats']>,
	meta: Misskey.entities.ServerInfoResponse
}>();

const usage = ref<number>(0);

function onStats(stats: Misskey.entities.ServerStats) {
	usage.value = stats.cpu;
}

onMounted(() => {
	props.connection.on('stats', onStats);
});

onBeforeUnmount(() => {
	props.connection.off('stats', onStats);
});
</script>

<style lang="scss" scoped>
.vrvdvrys {
	display: flex;
	padding: var(--MI-cardPadding, 18px);

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
