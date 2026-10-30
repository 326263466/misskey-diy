<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.root, { [$style.done]: closed || (hasVoted && !canVote) }]" :aria-busy="submitting" @click.stop>
	<fieldset :class="$style.choices" :aria-label="i18n.ts.poll">
		<label v-for="(choice, i) in displayedChoices" :key="i" :class="[$style.choice, { [$style.selected]: choice.isVoted || selected.includes(i) }]">
			<input
				:class="$style.input"
				:type="multiple ? 'checkbox' : 'radio'"
				:name="inputName"
				:aria-label="choice.text"
				:checked="choice.isVoted || selected.includes(i)"
				:disabled="!canVote || submitting || choice.isVoted"
				@click.prevent="select(i)"
			>
			<span :class="$style.choiceIndex" aria-hidden="true">{{ i + 1 }}</span>
			<span :class="$style.choiceText"><Mfm :text="choice.text" :plain="true" :author="author" :emojiUrls="emojiUrls"/></span>
			<span :class="$style.choiceMeta">
				<span v-if="showResult" :class="$style.percent">{{ percentOf(choice.votes) }}</span>
				<span v-if="showResult" :class="$style.count">{{ i18n.tsx._poll.votesCount({ n: choice.votes }) }}</span>
			</span>
			<span v-if="showResult" :class="$style.barTrack" aria-hidden="true">
				<span :class="$style.barFill" :style="{ transform: `scaleX(${total > 0 ? choice.votes / total : 0})` }"></span>
			</span>
		</label>
	</fieldset>
	<div v-if="!readOnly" :class="$style.info">
		<span>{{ multiple ? i18n.tsx._poll.totalVotes({ n: total }) : i18n.tsx._poll.participants({ n: total }) }}</span>
		<template v-if="closed">
			<span aria-hidden="true">·</span>
			<span>{{ i18n.ts._poll.closed }}</span>
		</template>
		<template v-else-if="selected.length > 0">
			<span aria-hidden="true">·</span>
			<span :class="$style.selection" :title="selectedChoiceText">{{ selectedChoiceText }}</span>
		</template>
		<template v-else-if="hasVoted">
			<span aria-hidden="true">·</span>
			<span>{{ i18n.ts._poll.voted }}</span>
		</template>
		<template v-if="remaining > 0">
			<span aria-hidden="true">·</span>
			<span :class="$style.timer">{{ timer }}</span>
		</template>
		<button
			v-if="canVote"
			type="button"
			class="_button"
			:class="[$style.confirmButton, { [$style.confirmReady]: selected.length > 0 }]"
			:title="voteActionLabel"
			:aria-label="voteActionLabel"
			:disabled="selected.length === 0 || submitting"
			@click="vote"
		>{{ i18n.ts._poll.vote }}</button>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { host } from '@@/js/config.js';
import type { OpenOnRemoteOptions } from '@/utility/please-login.js';
import { sum } from '@/utility/array.js';
import { pleaseLogin } from '@/utility/please-login.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { useLowresTime } from '@@/js/use-lowres-time.js';

const props = defineProps<{
	noteId: string;
	multiple: NonNullable<Misskey.entities.Note['poll']>['multiple'];
	expiresAt: NonNullable<Misskey.entities.Note['poll']>['expiresAt'];
	choices: NonNullable<Misskey.entities.Note['poll']>['choices'];
	readOnly?: boolean;
	emojiUrls?: Record<string, string>;
	author?: Misskey.entities.UserLite;
}>();

const now = useLowresTime();

const expiresAtTime = computed(() => props.expiresAt ? new Date(props.expiresAt).getTime() : null);

const remaining = computed(() => {
	if (expiresAtTime.value == null) return -1;
	return Math.floor(Math.max(expiresAtTime.value - now.value, 0) / 1000);
});

const inputName = useId();
const selected = ref<number[]>([]);
const submitting = ref(false);
let voteGeneration = 0;
// 立即保留刚确认的投票，避免等待实时流更新。
const confirmedVotes = ref(new Map<number, number>());
const displayedChoices = computed(() => props.choices.map((choice, index) => ({
	...choice,
	votes: Math.max(choice.votes, confirmedVotes.value.get(index) ?? 0),
	isVoted: choice.isVoted || confirmedVotes.value.has(index),
})));
const total = computed(() => sum(displayedChoices.value.map(x => x.votes)));
const closed = computed(() => props.expiresAt != null && remaining.value <= 0);
const hasVoted = computed(() => displayedChoices.value.some(c => c.isVoted));
const canVote = computed(() => !props.readOnly && !closed.value && (props.multiple ? displayedChoices.value.some(c => !c.isVoted) : !hasVoted.value));
const selectedChoiceText = computed(() => selected.value.map(index => displayedChoices.value[index].text).join(' / '));
const voteActionLabel = computed(() => selectedChoiceText.value
	? i18n.tsx.voteConfirm({ choice: selectedChoiceText.value })
	: i18n.ts._poll.vote);
// 投过票或已截止才显示结果，不提供未投票查看结果的入口。
const showResult = computed(() => props.readOnly || hasVoted.value || closed.value);
const timer = computed(() => i18n.tsx._poll[
	remaining.value >= 86400 ? 'remainingDays' :
	remaining.value >= 3600 ? 'remainingHours' :
	remaining.value >= 60 ? 'remainingMinutes' : 'remainingSeconds'
]({
	s: Math.floor(remaining.value % 60),
	m: Math.floor(remaining.value / 60) % 60,
	h: Math.floor(remaining.value / 3600) % 24,
	d: Math.floor(remaining.value / 86400),
}));

watch(() => props.noteId, () => {
	voteGeneration++;
	submitting.value = false;
	selected.value = [];
	confirmedVotes.value.clear();
});

onBeforeUnmount(() => {
	voteGeneration++;
});

const pleaseLoginContext = computed<OpenOnRemoteOptions>(() => ({
	type: 'lookup',
	url: `https://${host}/notes/${props.noteId}`,
}));

function select(id: number): void {
	if (!canVote.value || submitting.value || displayedChoices.value[id].isVoted) return;
	if (selected.value.includes(id)) {
		selected.value = selected.value.filter(choice => choice !== id);
		return;
	}
	selected.value = props.multiple
		? [...selected.value, id]
		: [id];
}

function percentOf(votes: number): string {
	return `${total.value > 0 ? Math.round(votes / total.value * 100) : 0}%`;
}

async function vote(): Promise<void> {
	if (!canVote.value || submitting.value || selected.value.length === 0) return;
	submitting.value = true;
	const noteId = props.noteId;
	const generation = voteGeneration;
	const choicesToVote = [...selected.value];
	const isCurrent = () => generation === voteGeneration && props.noteId === noteId;
	try {
		if (!await pleaseLogin({ openOnRemote: pleaseLoginContext.value })) return;
		if (!isCurrent()) return;
		for (const id of choicesToVote) {
			if (!isCurrent() || !canVote.value) return;
			if (displayedChoices.value[id].isVoted) {
				selected.value = selected.value.filter(choice => choice !== id);
				continue;
			}
			const votes = displayedChoices.value[id].votes;
			try {
				await os.apiWithDialog('notes/polls/vote', { noteId, choice: id });
			} catch {
				if (!isCurrent()) return;
				// 请求超时也可能已经落库，先恢复服务端确认状态再允许重试。
				const note = await misskeyApi('notes/show', { noteId }).catch(() => null);
				if (!isCurrent()) return;
				for (const [index, choice] of (note?.poll?.choices ?? []).entries()) {
					if (choice.isVoted) confirmedVotes.value.set(index, choice.votes);
				}
				selected.value = selected.value.filter(choice => !displayedChoices.value[choice].isVoted);
				return;
			}
			if (!isCurrent()) return;
			confirmedVotes.value.set(id, votes + 1);
			selected.value = selected.value.filter(choice => choice !== id);
		}
	} finally {
		if (isCurrent()) submitting.value = false;
	}
}
</script>

<style lang="scss" module>
.root {
	padding: 2px 0;
}

.choices {
	display: flex;
	flex-direction: column;
	gap: 3px;
	min-width: 0;
	margin: 0;
	padding: 0;
	border: 0;
	font-size: .95em;
}

.choice {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr) auto;
	gap: 3px 7px;
	position: relative;
	min-width: 0;
	padding: 6px 9px;
	border: 1px solid transparent;
	border-radius: 6px;
	background: color-mix(in srgb, var(--MI_THEME-fg) 3%, transparent);
	cursor: pointer;
	transition: background-color 140ms ease, color 140ms ease;

	&:hover:not(:has(input:disabled)) {
		background: var(--MI_THEME-buttonHoverBg);
	}

	&:has(input:focus-visible) {
		outline: 2px solid var(--MI_THEME-accent);
		outline-offset: -1px;
	}

	&:has(input:disabled) {
		cursor: default;
	}
}

.selected {
	border-color: color-mix(in srgb, var(--MI_THEME-accent) 22%, transparent);
	background: color-mix(in srgb, var(--MI_THEME-accent) 9%, transparent);

	.choiceIndex {
		border-color: var(--MI_THEME-accent);
		background: var(--MI_THEME-accent);
		color: var(--MI_THEME-fgOnAccent);
	}
}

.input {
	position: absolute;
	width: 1px;
	height: 1px;
	margin: 0;
	overflow: hidden;
	clip-path: inset(50%);
	white-space: nowrap;
}

.choiceIndex {
	grid-column: 1;
	display: inline-grid;
	place-items: center;
	align-self: center;
	box-sizing: border-box;
	width: 20px;
	height: 20px;
	border: 1px solid color-mix(in srgb, var(--MI_THEME-fg) 10%, transparent);
	border-radius: 6px;
	color: var(--MI_THEME-fgTransparentWeak);
	background: color-mix(in srgb, var(--MI_THEME-panel) 72%, transparent);
	font-size: 11px;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
	line-height: 1;
	transition: border-color 140ms ease, background-color 140ms ease, color 140ms ease;
}

.choiceText {
	grid-column: 2;
	align-self: center;
	min-width: 0;
	line-height: 1.4;
	overflow-wrap: anywhere;
}

.choiceMeta {
	grid-column: 3;
	display: flex;
	align-items: center;
	justify-self: end;
	gap: 5px;
}

.percent {
	color: var(--MI_THEME-accent);
	font-size: .85em;
	font-variant-numeric: tabular-nums;
}

.count {
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: .85em;
	font-variant-numeric: tabular-nums;
	white-space: nowrap;
}

.barTrack {
	grid-column: 1 / -1;
	height: 3px;
	border-radius: 999px;
	background: color-mix(in srgb, var(--MI_THEME-accent) 12%, transparent);
	overflow: clip;
}

.barFill {
	display: block;
	width: 100%;
	height: 100%;
	border-radius: inherit;
	background: var(--MI_THEME-accent);
	opacity: .55;
	transform-origin: left center;
	transition: transform 600ms cubic-bezier(0.22, 1, 0.36, 1);
}

.info {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 3px;
	margin: 6px 0 0;
	line-height: 1.5;
	font-size: .9em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.selection {
	min-width: 0;
	max-width: 100%;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: var(--MI_THEME-accent);
}

.timer {
	color: var(--MI_THEME-fgTransparentWeak);
}

.confirmButton {
	min-height: 26px;
	margin-left: auto;
	padding: 2px 11px;
	border: 1px solid color-mix(in srgb, var(--MI_THEME-accent) 55%, transparent);
	border-radius: 999px;
	color: var(--MI_THEME-accent);
	transition: color 160ms ease, background-color 160ms ease, border-color 160ms ease, opacity 160ms ease;

	&:disabled {
		opacity: 0.42;
		cursor: default;
	}
}

.confirmReady {
	border-color: var(--MI_THEME-accent);
	background: var(--MI_THEME-accent);
	color: var(--MI_THEME-fgOnAccent);
}

.done {
	.choice {
		cursor: initial;
	}
}

@media (prefers-reduced-motion: reduce) {
	.choice, .barFill, .confirmButton { transition: none; }
}
</style>
