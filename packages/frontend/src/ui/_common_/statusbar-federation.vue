<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<span v-if="!fetching" :class="$style.root">
	<template v-if="display === 'marquee'">
		<Transition
			:enterActiveClass="$style.transition_change_enterActive"
			:leaveActiveClass="$style.transition_change_leaveActive"
			:enterFromClass="$style.transition_change_enterFrom"
			:leaveToClass="$style.transition_change_leaveTo"
			mode="default"
		>
			<MkMarqueeText :key="key" :duration="marqueeDuration" :reverse="marqueeReverse">
				<span v-for="{ instance, style } in instanceItems" :key="instance.id" :class="[$style.item, { [$style.colored]: colored }]" :style="style">
					<img :class="$style.icon" :src="getInstanceIcon(instance)" alt=""/>
					<MkA :to="`/instance-info/${instance.host}`" :class="$style.host" class="_monospace">
						{{ instance.host }}
					</MkA>
					<span></span>
				</span>
			</MkMarqueeText>
		</Transition>
	</template>
	<template v-else-if="display === 'oneByOne'">
		<!-- TODO -->
	</template>
</span>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import * as Misskey from 'misskey-js';
import tinycolor from 'tinycolor2';
import { useInterval } from '@@/js/use-interval.js';
import MkMarqueeText from '@/components/MkMarqueeText.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { getProxiedImageUrlNullable } from '@/utility/media-proxy.js';

const props = defineProps<{
	display?: 'marquee' | 'oneByOne';
	colored?: boolean;
	marqueeDuration?: number;
	marqueeReverse?: boolean;
	oneByOneInterval?: number;
	refreshIntervalSec: number;
}>();

const instances = ref<Misskey.entities.FederationInstance[]>([]);
const instanceItems = computed(() => instances.value.map(instance => {
	const background = tinycolor(instance.themeColor ?? '');
	// 半透明色は親背景によってコントラストが変わるため、標準の配色に戻す。
	const style = props.colored && background.isValid() && background.getAlpha() === 1 ? {
		backgroundColor: background.toHexString(),
		color: tinycolor.mostReadable(background, ['black', 'white']).toHexString(),
	} : undefined;
	return { instance, style };
}));
const fetching = ref(true);
const key = ref(0);

const tick = () => {
	misskeyApi('federation/instances', {
		sort: '+latestRequestReceivedAt',
		limit: 30,
	}).then(res => {
		instances.value = res;
		fetching.value = false;
		key.value++;
	});
};

useInterval(tick, Math.max(5000, props.refreshIntervalSec * 1000), {
	immediate: true,
	afterMounted: true,
});

function getInstanceIcon(instance: Misskey.entities.FederationInstance): string {
	return getProxiedImageUrlNullable(instance.iconUrl, 'preview') ?? getProxiedImageUrlNullable(instance.faviconUrl, 'preview') ?? '/client-assets/dummy.png';
}
</script>

<style lang="scss" module>
.transition_change_enterActive,
.transition_change_leaveActive {
	position: absolute;
	top: 0;
  transition: all 1s ease;
}
.transition_change_enterFrom {
	opacity: 0;
	transform: translateY(-100%);
}
.transition_change_leaveTo {
	opacity: 0;
	transform: translateY(100%);
}

.root {
	display: inline-block;
	position: relative;
}

.item {
	display: inline-block;
	vertical-align: bottom;
	margin-right: 5em;

	&.colored {
		padding-right: 1em;
	}
}

.icon {
	display: inline-block;
	height: var(--height);
	aspect-ratio: 1;
	vertical-align: bottom;
	margin-right: 1em;
}

.host {
	vertical-align: bottom;
}
</style>
