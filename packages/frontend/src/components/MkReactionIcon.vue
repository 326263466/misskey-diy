<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkCustomEmoji v-if="isEmojiReaction(reaction) && reaction[0] === ':'" ref="elRef" :name="reaction" :normal="true" :noStyle="noStyle" :url="emojiUrl" :fallbackToImage="true"/>
<MkEmoji v-else-if="isEmojiReaction(reaction)" ref="elRef" :emoji="reaction" :normal="true" :noStyle="noStyle" :alignVisualCenter="alignVisualCenter"/>
</template>

<script lang="ts" setup>
import { defineAsyncComponent, useTemplateRef } from 'vue';
import { useTooltip } from '@/composables/use-tooltip.js';
import * as os from '@/os.js';
import { isEmojiReaction } from '@/utility/normalize-reaction.js';

const props = defineProps<{
	reaction: string;
	noStyle?: boolean;
	alignVisualCenter?: boolean;
	emojiUrl?: string;
	withTooltip?: boolean;
}>();

const elRef = useTemplateRef('elRef');

if (props.withTooltip) {
	useTooltip(elRef, (showing) => {
		if (elRef.value == null) return;
		const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkReactionTooltip.vue')), {
			showing,
			reaction: props.reaction.replace(/^:(\w+):$/, ':$1@.:'),
			anchorElement: elRef.value.$el,
		}, {
			closed: () => dispose(),
		});
	});
}
</script>
