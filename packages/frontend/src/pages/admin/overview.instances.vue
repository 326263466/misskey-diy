<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div>
	<MkError v-if="failed && instances == null" @retry="fetch"/>
	<MkLoading v-else-if="instances == null"/>
	<template v-else>
		<p v-if="failed" role="alert" :class="$style.error">{{ i18n.ts._dashboard.refreshFailed }}</p>
		<MkResult v-if="instances.length === 0" type="empty" :text="i18n.ts._dashboard.noRemoteInstances"/>
		<div v-else :class="$style.instances">
			<MkA v-for="instance in instances" :key="instance.id" v-tooltip.mfm="`${instance.name}\n${instance.host}\n${instance.softwareName} ${instance.softwareVersion}`" :to="`/instance-info/${instance.host}`" :class="$style.instance">
				<MkInstanceCardMini :instance="instance"/>
			</MkA>
		</div>
	</template>
</div>
</template>

<script lang="ts" setup>
import { onBeforeUnmount, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { misskeyApi } from '@/utility/misskey-api.js';
import MkInstanceCardMini from '@/components/MkInstanceCardMini.vue';
import { i18n } from '@/i18n.js';

const instances = ref<Misskey.entities.FederationInstance[] | null>(null);
const props = defineProps<{ refreshKey: number }>();
const failed = ref(false);
let controller: AbortController | null = null;

const fetch = async () => {
	controller?.abort();
	const current = new AbortController();
	controller = current;
	try {
		const result = await misskeyApi('federation/instances', {
			sort: '+latestRequestReceivedAt',
			limit: 6,
		}, undefined, AbortSignal.any([current.signal, AbortSignal.timeout(20_000)]));
		if (current.signal.aborted) return;
		instances.value = result;
		failed.value = false;
	} catch {
		if (!current.signal.aborted) failed.value = true;
	}
};

watch(() => props.refreshKey, () => { void fetch(); }, { immediate: true });
onBeforeUnmount(() => controller?.abort());
</script>

<style lang="scss" module>
.error {
	color: var(--MI_THEME-error);
	font-size: .85em;
}

.instances {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(min(180px, 100%), 1fr));
	grid-gap: 12px;
}

.instance:hover {
	text-decoration: none;
}
</style>
