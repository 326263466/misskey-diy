<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkTooltip :id="tooltipId" class="_shadow" :class="$style.tooltip" :showing="showing" :anchorElement="anchorElement" :maxWidth="360" direction="top" @closed="emit('closed')">
	<div :class="$style.content">
		<MkReactionIcon :reaction="iconReaction" :withTooltip="false" :noStyle="true" :alignVisualCenter="true" :emojiUrl="emojiUrl" :class="$style.icon" aria-hidden="true"/>
		<div :class="$style.details">
			<div :class="$style.name">{{ reactionName }}</div>
			<div v-if="count > 0" :class="$style.users">{{ i18n.tsx._chat.reactionUsers({ users: participants }) }}</div>
		</div>
	</div>
</MkTooltip>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type * as Misskey from 'misskey-js';
import { getEmojiName } from '@@/js/emojilist.js';
import MkTooltip from '@/components/MkTooltip.vue';
import MkReactionIcon from '@/components/MkReactionIcon.vue';
import { i18n } from '@/i18n.js';

const props = withDefaults(defineProps<{
	showing: boolean;
	tooltipId?: string;
	reaction: string;
	users?: Misskey.entities.UserLite[];
	count?: number;
	emojiUrl?: string;
	anchorElement: HTMLElement;
}>(), { users: () => [], count: 0 });

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const iconReaction = computed(() => props.reaction.replace(/^:(\w+):$/, ':$1@.:'));
const reactionName = computed(() => {
	if (props.reaction.startsWith(':')) return props.reaction.replace('@.', '');
	const name = getEmojiName(props.reaction);
	return name === props.reaction ? name : `:${name}:`;
});
const participants = computed(() => {
	const names = props.users.slice(0, 2).map(user => {
		const name = Array.from(user.name || user.username);
		return name.length > 16 ? `${name.slice(0, 16).join('')}…` : name.join('');
	});
	if (props.count > names.length) {
		names.push(i18n.tsx._chat.reactionOthers({ count: props.count - names.length }));
	}
	return names.join('、');
});
</script>

<style lang="scss" module>
.tooltip {
	padding: 12px;
	border-radius: 8px;
	font-size: 13px;
	line-height: 1.5;
	word-break: normal;
}

.content {
	display: flex;
	align-items: center;
	gap: 12px;
	max-width: min(312px, calc(100vw - 48px));
	text-align: left;
}

.icon {
	display: block;
	flex-shrink: 0;
	width: 52px;
	height: 52px;
	font-size: 52px;
	line-height: 1;
	object-fit: contain;
	pointer-events: none;
}

.details {
	min-width: 0;
	overflow-wrap: anywhere;
}

.name,
.users {
	display: -webkit-box;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.name {
	-webkit-line-clamp: 2;
	font-weight: 600;
}

.users {
	-webkit-line-clamp: 2;
}
</style>
