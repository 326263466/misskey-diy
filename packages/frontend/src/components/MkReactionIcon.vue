<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<span v-if="allowTextBoost && isTextBoost(reaction)" ref="elRef" class="_mfm" :class="$style.text">{{ getBoostText(reaction) }}</span>
<MkCustomEmoji v-else-if="reaction[0] === ':'" ref="elRef" :name="reaction" :normal="true" :noStyle="noStyle" :url="emojiUrl" :fallbackToImage="true"/>
<MkEmoji v-else ref="elRef" :emoji="reaction" :normal="true" :noStyle="noStyle"/>
</template>

<script lang="ts" setup>
import { defineAsyncComponent, useTemplateRef } from 'vue';
import { useTooltip } from '@/composables/use-tooltip.js';
import * as os from '@/os.js';
import { getBoostText, isTextBoost } from '@/utility/boost.js';

const props = defineProps<{
	reaction: string;
	noStyle?: boolean;
	emojiUrl?: string;
	withTooltip?: boolean;
	allowTextBoost?: boolean;
}>();

const allowTextBoost = props.allowTextBoost ?? false;

const elRef = useTemplateRef('elRef');

if (props.withTooltip) {
	useTooltip(elRef, (showing) => {
		if (elRef.value == null) return;
		const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkReactionTooltip.vue')), {
			showing,
			reaction: props.reaction.replace(/^:(\w+):$/, ':$1@.:'),
			allowTextBoost,
			anchorElement: elRef.value instanceof HTMLElement ? elRef.value : elRef.value.$el,
		}, {
			closed: () => dispose(),
		});
	});
}
</script>

<style lang="scss" module>
.text {
	font-size: 1em;
	line-height: 1.4;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}
</style>
