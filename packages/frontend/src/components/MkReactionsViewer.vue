<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl" :class="$style.root">
	<TransitionGroup
		:css="prefer.s.animation"
		:enterActiveClass="$style.transition_x_enterActive"
		:leaveActiveClass="$style.transition_x_leaveActive"
		:enterFromClass="$style.transition_x_enterFrom"
		:leaveToClass="$style.transition_x_leaveTo"
		:moveClass="$style.transition_x_move"
	>
		<XReaction
			v-for="[reaction, count] in _reactions"
			:key="reaction"
			:reaction="reaction"
			:reactionEmojis="props.reactionEmojis"
			:count="count"
			:isInitial="initialReactions.has(reaction)"
			:noteId="props.noteId"
			:myReaction="props.myReaction"
			:users="reactionUsers.get(reaction) ?? []"
			@reactionToggled="onMockToggleReaction"
		/>
		<slot v-if="hasMoreReactions" name="more"></slot>
	</TransitionGroup>
	<slot name="boost"></slot>
</div>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import { computed, inject, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch, ref } from 'vue';
import { TransitionGroup } from 'vue';
import { isSupportedEmoji } from '@@/js/emojilist.js';
import { getEmojiNameFromReaction, isLocalCustomEmojiReaction } from '@@/js/emoji-name.js';
import XReaction from '@/components/MkReactionsViewer.reaction.vue';
import { $i } from '@/i.js';
import { prefer } from '@/preferences.js';
import { customEmojisMap } from '@/custom-emojis.js';
import { DI } from '@/di.js';
import { isTextBoost } from '@/utility/boost.js';
import { misskeyApi } from '@/utility/misskey-api.js';

const props = withDefaults(defineProps<{
	noteId: Misskey.entities.Note['id'];
	reactions: Misskey.entities.Note['reactions'];
	reactionEmojis: Misskey.entities.Note['reactionEmojis'];
	myReaction: Misskey.entities.Note['myReaction'];
	maxNumber?: number;
}>(), {
	maxNumber: Infinity,
});

const mock = inject(DI.mock, false);

const emit = defineEmits<{
	(ev: 'mockUpdateMyReaction', emoji: string, delta: number): void;
}>();

const initialReactions = new Set(Object.keys(props.reactions));

const _reactions = ref<[string, number][]>([]);
const hasMoreReactions = ref(false);
const rootEl = useTemplateRef('rootEl');
const visible = ref(false);
const participants = shallowRef<Misskey.entities.NoteReaction[]>([]);

function reactionKey(reaction: string): string {
	return reaction.replace(/^:([\w+-]+)@\.:$/, ':$1:');
}

const reactionUsers = computed(() => {
	const users = new Map<string, Misskey.entities.UserLite[]>();
	for (const participant of participants.value) {
		const reaction = reactionKey(participant.type);
		const group = users.get(reaction) ?? [];
		if (group.length < 10 && !group.some(user => user.id === participant.user.id)) group.push(participant.user);
		users.set(reaction, group);
	}
	if ($i && props.myReaction && !users.has(reactionKey(props.myReaction))) users.set(reactionKey(props.myReaction), [$i]);
	return users;
});

let observer: IntersectionObserver | undefined;
let avatarRequest: AbortController | undefined;
let attemptedSignature = '';
let disposed = false;

const reactionSignature = computed(() => JSON.stringify([props.noteId, Object.entries(props.reactions).filter(([, count]) => count > 0).sort(([a], [b]) => a.localeCompare(b))]));

async function loadParticipants() {
	const signature = reactionSignature.value;
	if (mock || disposed || !visible.value || Object.values(props.reactions).every(count => count <= 0) || signature === attemptedSignature) return;
	attemptedSignature = signature;
	avatarRequest?.abort();
	const request = new AbortController();
	avatarRequest = request;
	try {
		const result = await misskeyApi('notes/reactions', { noteId: props.noteId, limit: 100 }, undefined, request.signal);
		if (!disposed && !request.signal.aborted && signature === reactionSignature.value) participants.value = result;
	} catch {
		// 头像预览失败不妨碍 Boost 操作，下一次统计变化时再加载。
	} finally {
		if (avatarRequest === request) avatarRequest = undefined;
	}
}

watch(reactionSignature, () => {
	avatarRequest?.abort();
	void loadParticipants();
});
watch(() => props.noteId, () => { participants.value = []; });
watch(visible, () => { void loadParticipants(); });

onMounted(() => {
	if (mock || !rootEl.value) return;
	observer = new IntersectionObserver(entries => {
		visible.value = entries[entries.length - 1]?.isIntersecting ?? false;
	});
	observer.observe(rootEl.value);
});

onBeforeUnmount(() => {
	disposed = true;
	observer?.disconnect();
	avatarRequest?.abort();
});

if (props.myReaction != null && !(props.myReaction in props.reactions)) {
	_reactions.value.push([props.myReaction, props.reactions[props.myReaction] ?? 0]);
}

function onMockToggleReaction(emoji: string, count: number) {
	if (!mock) return;

	const i = _reactions.value.findIndex((item) => item[0] === emoji);
	if (i < 0) return;

	emit('mockUpdateMyReaction', emoji, (count - _reactions.value[i][1]));
}

function canReact(reaction: string) {
	if (!$i) return false;
	if (isTextBoost(reaction)) return false;
	// TODO: CheckPermissions
	return isLocalCustomEmojiReaction(reaction)
		? customEmojisMap.has(getEmojiNameFromReaction(reaction))
		: isSupportedEmoji(reaction);
}

watch([() => props.reactions, () => props.maxNumber, () => props.myReaction], ([newSource, maxNumber]) => {
	let newReactions: [string, number][] = [];
	hasMoreReactions.value = Object.keys(newSource).length > maxNumber;

	for (let i = 0; i < _reactions.value.length; i++) {
		const reaction = _reactions.value[i][0];
		if (reaction in newSource && newSource[reaction] !== 0) {
			_reactions.value[i][1] = newSource[reaction];
			newReactions.push(_reactions.value[i]);
		}
	}

	const sorted = Object.entries(newSource);
	if (prefer.s.showAvailableReactionsFirstInNote) {
		// ソートの比較関数内で評価すると同じ絵文字に対して何度も実行されるため、事前に1回だけ評価しておく
		const canReactCache = new Map<string, boolean>();
		for (const [emoji] of sorted) {
			canReactCache.set(emoji, canReact(emoji));
		}
		sorted.sort(([emojiA, countA], [emojiB, countB]) => {
			const canReactA = canReactCache.get(emojiA)!;
			const canReactB = canReactCache.get(emojiB)!;
			if (canReactA !== canReactB) return canReactA ? -1 : 1;
			return countB - countA;
		});
	} else {
		sorted.sort(([, countA], [, countB]) => countB - countA);
	}

	const newReactionsNames = new Set(newReactions.map(([x]) => x));
	newReactions = [
		...newReactions,
		...sorted.filter(([y], i) => i < maxNumber && !newReactionsNames.has(y)),
	];

	newReactions = newReactions.slice(0, props.maxNumber);

	if (props.myReaction && !newReactions.some(([x]) => x === props.myReaction)) {
		newReactions.push([props.myReaction, newSource[props.myReaction] ?? 0]);
	}

	_reactions.value = newReactions;
}, { immediate: true, deep: true });
</script>

<style lang="scss" module>
.transition_x_move,
.transition_x_enterActive,
.transition_x_leaveActive {
	transition: opacity 0.2s cubic-bezier(0,.5,.5,1), transform 0.2s cubic-bezier(0,.5,.5,1) !important;
}
.transition_x_enterFrom,
.transition_x_leaveTo {
	opacity: 0;
	transform: scale(0.7);
}
.transition_x_leaveActive {
	position: absolute;
}

.root {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 4px;

	&:empty {
		display: none;
	}
}
</style>
