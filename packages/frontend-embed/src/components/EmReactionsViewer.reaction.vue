<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<button
	type="button"
	class="_button"
	:class="[$style.root, { [$style.mine]: isMine }]"
	:aria-pressed="isMine"
	aria-disabled="true"
>
	<span :class="$style.icon"><EmReactionIcon :reaction="reaction" :noStyle="true" :emojiUrl="note.reactionEmojis[getEmojiNameFromReaction(reaction)]"/></span>
	<span :class="$style.count">{{ count }}</span>
</button>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import { getEmojiNameFromReaction } from '@@/js/emoji-name.js';
import EmReactionIcon from '@/components/EmReactionIcon.vue';

defineProps<{
	reaction: string;
	count: number;
	isMine: boolean;
	note: Misskey.entities.Note;
}>();
</script>

<style lang="scss" module>
@use '../../../frontend/src/styles/reaction-chip.scss' as reactionChip;

.root {
	@include reactionChip.chip;
	cursor: default;
}

.icon {
	@include reactionChip.icon;
}

.count {
	@include reactionChip.count;
}
</style>
