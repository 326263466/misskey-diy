<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<XReaction v-for="[reaction, count] in reactions" :key="reaction" :reaction="reaction" :count="count" :isMine="myReactions.includes(reaction)" :note="note"/>
</div>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import { computed } from 'vue';
import { isSupportedEmoji } from '@@/js/emojilist.js';
import XReaction from '@/components/EmReactionsViewer.reaction.vue';

const props = defineProps<{
	note: Misskey.entities.Note;
}>();

function isEmojiReaction(reaction: string): boolean {
	return /^:[\w+-]+(?:@[\w.-]+)?:$/.test(reaction) || isSupportedEmoji(reaction);
}

function normalizeReaction(reaction: string): string {
	const normalized = reaction.replace(/^:([\w+-]+):$/, ':$1@.:');
	return normalized.includes('\u200d') ? normalized : normalized.replace(/\ufe0f/g, '');
}

const myReactions = computed(() => (props.note.myReactions ?? [])
	.filter(isEmojiReaction).map(normalizeReaction));

const reactions = computed(() => {
	const counts = new Map<string, number>();
	for (const [reaction, count] of Object.entries(props.note.reactions)) {
		if (!isEmojiReaction(reaction) || count <= 0) continue;
		const normalized = normalizeReaction(reaction);
		counts.set(normalized, (counts.get(normalized) ?? 0) + count);
	}
	for (const reaction of myReactions.value) {
		if (!counts.has(reaction)) counts.set(reaction, 1);
	}
	return [...counts].sort((a, b) => b[1] - a[1]);
});
</script>

<style lang="scss" module>
@use '../../../frontend/src/styles/reaction-chip.scss' as reactionChip;

.root {
	@include reactionChip.list;
}
</style>
