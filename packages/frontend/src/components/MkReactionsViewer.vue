<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkReactionList :canAdd="canAdd && $i != null && _reactions.length > 0" @add="emit('add', $event)">
	<XReaction
		v-for="[reaction, count] in _reactions"
		:key="reaction"
		:reaction="reaction"
		:reactionEmojis="props.reactionEmojis"
		:count="count"
		:noteId="props.noteId"
		:myReactions="myReactions"
		@reactionToggled="onMockToggleReaction"
	/>
</MkReactionList>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import { computed, inject, watch, ref } from 'vue';
import MkReactionList from '@/components/MkReactionList.vue';
import { isSupportedEmoji } from '@@/js/emojilist.js';
import { getEmojiNameFromReaction, isLocalCustomEmojiReaction } from '@@/js/emoji-name.js';
import XReaction from '@/components/MkReactionsViewer.reaction.vue';
import { $i } from '@/i.js';
import { prefer } from '@/preferences.js';
import { customEmojisMap } from '@/custom-emojis.js';
import { DI } from '@/di.js';
import { getMyReactions, isEmojiReaction, normalizeReaction } from '@/utility/normalize-reaction.js';

const props = defineProps<{
	noteId: Misskey.entities.Note['id'];
	reactions: Misskey.entities.Note['reactions'];
	reactionEmojis: Misskey.entities.Note['reactionEmojis'];
	myReactions?: string[];
	canAdd?: boolean;
}>();

const mock = inject(DI.mock, false);

const emit = defineEmits<{
	(ev: 'mockUpdateMyReaction', emoji: string, delta: number): void;
	(ev: 'add', event: MouseEvent): void;
}>();

const myReactions = computed(() => getMyReactions(props));

const _reactions = ref<[string, number][]>([]);

function onMockToggleReaction(emoji: string, count: number) {
	if (!mock) return;

	const i = _reactions.value.findIndex((item) => item[0] === emoji);
	if (i < 0) return;

	emit('mockUpdateMyReaction', emoji, (count - _reactions.value[i][1]));
}

function canReact(reaction: string) {
	if (!$i) return false;
	// TODO: CheckPermissions
	return isLocalCustomEmojiReaction(reaction)
		? customEmojisMap.has(getEmojiNameFromReaction(reaction))
		: isSupportedEmoji(reaction);
}

watch([() => props.reactions, myReactions], ([source]) => {
	const newSource: Record<string, number> = {};
	for (const [reaction, count] of Object.entries(source)) {
		if (!isEmojiReaction(reaction) || count <= 0) continue;
		const normalized = normalizeReaction(reaction);
		newSource[normalized] = (newSource[normalized] ?? 0) + count;
	}
	let newReactions: [string, number][] = [];

	for (let i = 0; i < _reactions.value.length; i++) {
		const reaction = _reactions.value[i][0];
		if (reaction in newSource && newSource[reaction] !== 0) {
			_reactions.value[i][1] = newSource[reaction];
			newReactions.push(_reactions.value[i]);
		}
	}

	// 服务器按首次回应时间给出顺序，新增种类追加在末尾；计数变化不改变位置。
	let sorted = Object.entries(newSource);
	if (prefer.s.showAvailableReactionsFirstInNote) {
		sorted = [...sorted.filter(([emoji]) => canReact(emoji)), ...sorted.filter(([emoji]) => !canReact(emoji))];
	}

	const newReactionsNames = new Set(newReactions.map(([x]) => x));
	newReactions = [
		...newReactions,
		...sorted.filter(([y]) => !newReactionsNames.has(y)),
	];

	for (const reaction of myReactions.value) {
		if (!newReactions.some(([x]) => x === reaction)) newReactions.push([reaction, newSource[reaction] ?? 1]);
	}

	_reactions.value = newReactions;
}, { immediate: true, deep: true });
</script>

