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
			:myReaction="myReaction"
			:users="reactionUsers.get(reaction) ?? []"
			@reactionToggled="onMockToggleReaction"
		/>
		<slot v-if="hasMoreReactions" name="more"></slot>
	</TransitionGroup>
	<slot v-if="_reactions.length > 0 && myReaction == null" name="boost"></slot>
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
import { normalizeReaction } from '@/utility/normalize-reaction.js';
import { noteEvents } from '@/composables/use-note-capture.js';

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

const initialReactions = new Set(Object.keys(props.reactions).map(normalizeReaction));

const reactions = computed(() => {
	const result: Record<string, number> = {};
	for (const [reaction, count] of Object.entries(props.reactions)) {
		if (count <= 0) continue;
		const key = normalizeReaction(reaction);
		result[key] = (result[key] ?? 0) + count;
	}
	return result;
});

const _reactions = ref<[string, number][]>([]);
const hasMoreReactions = ref(false);
const rootEl = useTemplateRef('rootEl');
const visible = ref(false);
const participants = shallowRef<Misskey.entities.NoteReaction[]>([]);
const participantRevision = ref(0);

const myReaction = computed(() => {
	const reaction = props.myReaction === undefined
		? participants.value.find(participant => participant.user.id === $i?.id && normalizeReaction(participant.type) in reactions.value)?.type
		: props.myReaction;
	return reaction ? normalizeReaction(reaction) : null;
});

const reactionUsers = computed(() => {
	const users = new Map<string, Misskey.entities.UserLite[]>();
	if ($i && myReaction.value) users.set(myReaction.value, [$i]);
	for (const participant of participants.value) {
		const reaction = normalizeReaction(participant.type);
		if (!(reaction in reactions.value) || (participant.user.id === $i?.id && reaction !== myReaction.value)) continue;
		const group = users.get(reaction) ?? [];
		if (group.length < 10 && !group.some(user => user.id === participant.user.id)) group.push(participant.user);
		users.set(reaction, group);
	}
	return users;
});

let observer: IntersectionObserver | undefined;
let avatarRequest: AbortController | undefined;
let attemptedSignature = '';
let disposed = false;

const reactionSignature = computed(() => JSON.stringify([
	props.noteId,
	props.myReaction === undefined,
	props.myReaction ? normalizeReaction(props.myReaction) : null,
	participantRevision.value,
	Object.entries(reactions.value).sort(([a], [b]) => a.localeCompare(b)),
]));

async function loadParticipants() {
	const signature = reactionSignature.value;
	if (mock || disposed || !visible.value || Object.keys(reactions.value).length === 0 || signature === attemptedSignature) return;
	attemptedSignature = signature;
	avatarRequest?.abort();
	const request = new AbortController();
	avatarRequest = request;
	try {
		const result = await misskeyApi('notes/reactions', { noteId: props.noteId, limit: 100 }, undefined, request.signal);
		if (disposed || request.signal.aborted || signature !== reactionSignature.value) return;
		participants.value = result;
		// 热门回应可能塞满第一页，这里只补拉可见区域里缺失的头像
		const missing = _reactions.value.filter(([reaction]) => !reactionUsers.value.has(reaction));
		const extra = await Promise.allSettled(missing.map(([reaction]) => misskeyApi('notes/reactions', {
			noteId: props.noteId,
			type: reaction,
			limit: 1,
		}, undefined, request.signal)));
		if (disposed || request.signal.aborted || signature !== reactionSignature.value) return;
		participants.value = [...result, ...extra.flatMap(response => response.status === 'fulfilled' ? response.value : [])];
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

watch(() => props.noteId, (noteId, _, onCleanup) => {
	if (mock) return;

	function onReacted(ctx: { userId: string; reaction: string }) {
		participants.value = participants.value.filter(participant => participant.user.id !== ctx.userId || normalizeReaction(participant.type) === normalizeReaction(ctx.reaction));
		participantRevision.value++;
	}

	function onUnreacted(ctx: { userId: string }) {
		participants.value = participants.value.filter(participant => participant.user.id !== ctx.userId);
		participantRevision.value++;
	}

	noteEvents.on(`reacted:${noteId}`, onReacted);
	noteEvents.on(`unreacted:${noteId}`, onUnreacted);
	onCleanup(() => {
		noteEvents.off(`reacted:${noteId}`, onReacted);
		noteEvents.off(`unreacted:${noteId}`, onUnreacted);
	});
}, { immediate: true });

onMounted(() => {
	if (mock || !rootEl.value) return;
	if (typeof IntersectionObserver !== 'function') {
		visible.value = true;
		return;
	}
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

if (myReaction.value != null && !(myReaction.value in reactions.value)) {
	_reactions.value.push([myReaction.value, reactions.value[myReaction.value] ?? 0]);
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

watch([reactions, () => props.maxNumber, myReaction], ([newSource, maxNumber]) => {
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

	if (myReaction.value && !newReactions.some(([x]) => x === myReaction.value)) {
		newReactions.push([myReaction.value, newSource[myReaction.value] ?? 0]);
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
	// 与气泡实际高度一致，否则行内会多出一段空白
	min-height: 28px;
	gap: 4px;

	&:empty {
		display: none;
	}
}
</style>
