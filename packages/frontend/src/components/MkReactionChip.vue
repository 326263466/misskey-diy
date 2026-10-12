<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<button
	ref="buttonEl"
	type="button"
	class="_button"
	:class="[$style.root, { [$style.mine]: isMine, [$style.inactive]: !interactive, [$style.sized]: displaySize != null, [$style.small]: displaySize === 'small', [$style.large]: displaySize === 'large', [$style.limitWidth]: limitWidth }]"
	:data-reaction="reaction"
	:disabled="disabled"
	:aria-disabled="!interactive || disabled || undefined"
	:aria-pressed="isMine"
	:aria-describedby="tooltipShowing ? tooltipId : undefined"
	:aria-label="i18n.tsx._chat.reactionLabel({ reaction: reactionName, count })"
	@click.stop="toggle"
	@focus="onFocus"
	@blur="focusShowing = false"
	@keydown.esc.stop="closeTooltip"
>
	<span :class="$style.icon" aria-hidden="true"><MkReactionIcon :reaction="iconReaction" :emojiUrl="emojiUrl" :noStyle="displaySize == null" :alignVisualCenter="true"/></span>
	<span :class="$style.count" aria-hidden="true">{{ count }}</span>
</button>
</template>

<script lang="ts" setup>
import { computed, ref, shallowRef, toRef, useId, useTemplateRef, watch } from 'vue';
import type { Ref } from 'vue';
import type * as Misskey from 'misskey-js';
import MkReactionTooltip from '@/components/MkReactionTooltip.vue';
import { useTooltip } from '@/composables/use-tooltip.js';
import * as os from '@/os.js';
import { getEmojiName } from '@@/js/emojilist.js';
import MkReactionIcon from '@/components/MkReactionIcon.vue';
import { i18n } from '@/i18n.js';

const props = withDefaults(defineProps<{
	reaction: string;
	count: number;
	isMine: boolean;
	emojiUrl?: string;
	disabled?: boolean;
	interactive?: boolean;
	displaySize?: 'small' | 'medium' | 'large';
	limitWidth?: boolean;
	users?: Misskey.entities.UserLite[];
	fetchUsers?: () => Promise<Misskey.entities.UserLite[]>;
}>(), {
	interactive: true,
});

const emit = defineEmits<{
	(event: 'toggle', element: HTMLButtonElement): void;
}>();

const buttonEl = useTemplateRef('buttonEl');
const iconReaction = computed(() => props.reaction.replace(/^:(\w+):$/, ':$1@.:'));
const reactionName = computed(() => props.reaction.startsWith(':') ? props.reaction.replace('@.', '') : getEmojiName(props.reaction));

function toggle() {
	closeTooltip();
	if (!props.interactive || props.disabled || buttonEl.value == null) return;
	emit('toggle', buttonEl.value);
}

const tooltipId = useId();
const hoverState = shallowRef<{ showing: Ref<boolean> } | null>(null);
const focusShowing = ref(false);
const tooltipShowing = computed(() => focusShowing.value || (hoverState.value?.showing.value ?? false));
useTooltip(buttonEl, showing => { hoverState.value = { showing }; }, 100);

watch(tooltipShowing, async (showing, _previous, onCleanup) => {
	if (!showing || buttonEl.value == null) return;
	let active = true;
	let dispose: (() => void) | undefined;
	onCleanup(() => { active = false; dispose?.(); });
	let users = props.users;
	if (users == null && props.fetchUsers) {
		try { users = await props.fetchUsers(); } catch { users = []; }
	}
	if (!active || buttonEl.value == null) return;
	({ dispose } = os.popup(MkReactionTooltip, {
		showing: tooltipShowing, tooltipId,
		reaction: toRef(props, 'reaction'), emojiUrl: toRef(props, 'emojiUrl'), count: toRef(props, 'count'),
		users: props.users == null ? users ?? [] : toRef(props, 'users'), anchorElement: buttonEl.value,
	}, { closed: () => dispose?.() }));
});

function onFocus() {
	if (buttonEl.value?.matches(':focus-visible')) focusShowing.value = true;
}

function closeTooltip() {
	focusShowing.value = false;
	if (hoverState.value != null) hoverState.value.showing.value = false;
}

defineExpose({ buttonEl });
</script>

<style lang="scss" module>
@use "../styles/reaction-chip.scss";

.root {
	@include reaction-chip.chip;

	&.inactive {
		cursor: default;
	}
}

.icon {
	@include reaction-chip.icon;
}

.count {
	@include reaction-chip.count;
}

.sized {
	--MI-reactionEmojiSize: 20px;
	border-radius: 6px;

	> .icon {
		width: auto;
		height: var(--MI-reactionEmojiSize);
		font-size: var(--MI-reactionEmojiSize);
		line-height: 1;

		> * {
			width: auto;
			height: 100%;
			max-width: none;
		}
	}

	&.small {
		--MI-reactionEmojiSize: 16px;
		height: 24px;
		border-radius: 4px;
	}

	&.large {
		--MI-reactionEmojiSize: 24px;
		height: 32px;
		border-radius: 8px;
	}

	&.limitWidth > .icon > * {
		max-width: 70px;
	}
}
</style>
