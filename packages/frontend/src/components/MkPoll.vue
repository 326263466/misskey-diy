<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root" :aria-busy="submitting" @click.stop>
	<div :class="$style.header">
		<span :class="$style.badge">{{ multiple ? i18n.ts._poll.multipleChoice : i18n.ts._poll.singleChoice }}</span>
		<span>{{ multiple ? i18n.tsx._poll.totalVotes({ n: total }) : i18n.tsx._poll.participants({ n: total }) }}</span>
	</div>
	<fieldset :class="$style.choices" :aria-label="i18n.ts.poll">
		<label v-for="(choice, i) in displayedChoices" :key="i" :class="[$style.choice, { [$style.selected]: choice.isVoted || selected.includes(i), [$style.leading]: total > 0 && choice.votes === maxVotes }]">
			<input
				:class="$style.input"
				:type="multiple ? 'checkbox' : 'radio'"
				:name="inputName"
				:checked="choice.isVoted || selected.includes(i)"
				:disabled="showResult || !canVote || submitting || choice.isVoted"
				@change="select(i)"
			>
			<span :class="$style.indicator" aria-hidden="true">
				<i v-if="choice.isVoted || selected.includes(i)" class="ti ti-check"></i>
			</span>
			<span :class="$style.choiceText"><Mfm :text="choice.text" :plain="true" :author="author" :emojiUrls="emojiUrls"/></span>
			<span :class="$style.count" :title="i18n.tsx._poll.votesCount({ n: choice.votes })">{{ countLabel(choice.votes) }}</span>
			<span :class="$style.barTrack" aria-hidden="true">
				<span :class="$style.barFill" :style="{ width: `${total > 0 ? choice.votes / total * 100 : 0}%` }"></span>
			</span>
		</label>
	</fieldset>
	<div v-if="!readOnly" :class="$style.footer">
		<button v-if="!showResult && canVote" type="button" class="_button" :class="$style.pillButton" :disabled="selected.length === 0 || submitting" @click="vote">
			{{ i18n.ts._poll.vote }}
		</button>
		<span v-else-if="closed" :class="$style.pillButton">{{ i18n.ts._poll.closed }}</span>
		<span v-else-if="hasVoted" :class="$style.pillButton">{{ i18n.ts._poll.voted }}</span>
		<span v-if="remaining > 0" :class="$style.timer">{{ timer }}</span>
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
// 保留已确认的投票，等待实时流更新；多选中途失败时只重试剩余项。
const confirmedVotes = ref(new Map<number, number>());
const displayedChoices = computed(() => props.choices.map((choice, index) => ({
	...choice,
	votes: Math.max(choice.votes, confirmedVotes.value.get(index) ?? 0),
	isVoted: choice.isVoted || confirmedVotes.value.has(index),
})));
const total = computed(() => sum(displayedChoices.value.map(x => x.votes)));
const maxVotes = computed(() => Math.max(0, ...displayedChoices.value.map(x => x.votes)));
const closed = computed(() => props.expiresAt != null && remaining.value <= 0);
const hasVoted = computed(() => displayedChoices.value.some(c => c.isVoted));
const canVote = computed(() => !props.readOnly && !closed.value && (props.multiple ? displayedChoices.value.some(c => !c.isVoted) : !hasVoted.value));
// 投过票或已截止就直接显示结果，不再提供查看结果切换
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

function percentOf(votes: number): string {
	return total.value > 0 ? `${Math.round(votes / total.value * 100)}%` : '';
}

// 无票时不显示空括号的百分比
function countLabel(votes: number): string {
	const percent = percentOf(votes);
	return percent ? `${i18n.tsx._poll.votesCount({ n: votes })} (${percent})` : i18n.tsx._poll.votesCount({ n: votes });
}

function select(id: number): void {
	if (!canVote.value || showResult.value || submitting.value || displayedChoices.value[id].isVoted) return;
	selected.value = props.multiple ? (selected.value.includes(id) ? selected.value.filter(choice => choice !== id) : [...selected.value, id]) : [id];
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

.header {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
	margin-bottom: 8px;
	padding-bottom: 8px;
	border-bottom: solid 1px var(--MI-divider);
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.badge {
	padding: 2px 8px;
	border-radius: 999px;
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	font-weight: 600;
	line-height: 1.4;
}

.choices {
	display: flex;
	flex-direction: column;
	min-width: 0;
	margin: 0;
	padding: 0;
	border: 0;
}

.choice {
	position: relative;
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
	padding: 7px 0;
	border-radius: 4px;
	line-height: 1.5;
	cursor: pointer;

	&:has(input:focus-visible) {
		outline: 2px solid var(--MI_THEME-accent);
		outline-offset: 2px;
	}

	&:has(input:disabled) {
		cursor: default;
	}
}

.choiceText {
	flex: 1;
	min-width: 0;
	overflow-wrap: anywhere;
}

.indicator {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	width: 18px;
	height: 18px;
	border: solid 2px color-mix(in srgb, var(--MI_THEME-fg) 32%, transparent);
	border-radius: 50%;
	color: var(--MI_THEME-fgOnAccent);
	font-size: 12px;
	font-weight: bold;
	transition: border-color 0.15s, background-color 0.15s, color 0.15s;
}

.selected .indicator {
	border-color: var(--MI_THEME-accent);
	background: var(--MI_THEME-accent);
}

.choice:hover:not(:has(input:disabled)) .indicator {
	border-color: color-mix(in srgb, var(--MI_THEME-accent) 60%, transparent);
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

.count {
	flex-shrink: 0;
	font-size: 0.9em;
	font-variant-numeric: tabular-nums;
	color: var(--MI_THEME-fgTransparentWeak);
}

.leading .choiceText,
.leading .count {
	color: var(--MI_THEME-accent);
}

.barTrack {
	flex-basis: 100%;
	height: 8px;
	margin-top: 2px;
	border-radius: 999px;
	background: color-mix(in srgb, var(--MI_THEME-fg) 8%, transparent);
	overflow: clip;
}

.barFill {
	display: block;
	height: 100%;
	border-radius: 999px;
	background: color-mix(in srgb, var(--MI_THEME-fg) 30%, transparent);
	transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1);
}

.leading .barFill {
	background: var(--MI_THEME-accent);
}

.footer {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 12px;
	margin-top: 8px;
	font-size: 0.85em;
}

.pillButton {
	padding: 1px 7px;
	border: solid 1px color-mix(in srgb, var(--MI_THEME-accent) 45%, transparent);
	border-radius: 999px;
	color: var(--MI_THEME-accent);
	line-height: 1.4;
}

button.pillButton {
	transition: background-color 0.15s, transform 0.1s;

	&:hover:not(:disabled) {
		background: var(--MI_THEME-accentedBg);
	}

	&:active:not(:disabled) {
		transform: scale(0.97);
	}

	&:disabled {
		opacity: 0.5;
		cursor: default;
	}
}

.timer {
	margin-left: auto;
	color: var(--MI_THEME-fgTransparentWeak);
}

@media (prefers-reduced-motion: reduce) {
	.barFill {
		transition: none;
	}
}
</style>
