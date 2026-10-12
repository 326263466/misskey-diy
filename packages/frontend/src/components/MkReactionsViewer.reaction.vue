<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkReactionChip
	ref="chipEl"
	:reaction="reaction"
	:count="count"
	:isMine="isMine"
	:disabled="busy"
	:emojiUrl="reactionEmojis[emojiName]"
	:interactive="canToggle"
	:displaySize="prefer.s.reactionsDisplaySize"
	:limitWidth="prefer.s.limitWidthOfReaction"
	:fetchUsers="fetchUsers"
	@toggle="toggleReaction()"
	@contextmenu.prevent.stop="menu"
/>
</template>

<script lang="ts" setup>
import { computed, inject, onBeforeUnmount, ref, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import { getUnicodeEmojiOrNull } from '@@/js/emojilist.js';
import { getEmojiNameFromReaction, isLocalCustomEmojiReaction } from '@@/js/emoji-name.js';
import MkCustomEmojiDetailedDialog from './MkCustomEmojiDetailedDialog.vue';
import type { MenuItem } from '@/types/menu';
import MkReactionChip from '@/components/MkReactionChip.vue';
import * as os from '@/os.js';
import { misskeyApi, misskeyApiGet } from '@/utility/misskey-api.js';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import * as sound from '@/utility/sound.js';
// import { checkReactionPermissions } from '@/utility/check-reaction-permissions.js';
import { customEmojisMap } from '@/custom-emojis.js';
import { prefer } from '@/preferences.js';
import { DI } from '@/di.js';
import { noteEvents } from '@/composables/use-note-capture.js';
import { mute as muteEmoji, unmute as unmuteEmoji, checkMuted as isEmojiMuted } from '@/utility/emoji-mute.js';
import { addToEmojiPalette } from '@/utility/emoji-palette.js';
import { haptic } from '@/utility/haptic.js';
import { getMyReactions, normalizeReaction } from '@/utility/normalize-reaction.js';
import { animateReactionRemoval, playReactionEffect } from '@/utility/reaction-effect.js';

const props = defineProps<{
	noteId: Misskey.entities.Note['id'];
	reaction: string;
	reactionEmojis: Misskey.entities.Note['reactionEmojis'];
	myReactions?: string[];
	count: number;
}>();

const mock = inject(DI.mock, false);

const emit = defineEmits<{
	(ev: 'reactionToggled', emoji: string, newCount: number): void;
}>();

const chipEl = useTemplateRef('chipEl');
const buttonEl = computed(() => chipEl.value?.buttonEl ?? null);
const busy = ref(false);
const isMine = computed(() => getMyReactions(props).includes(normalizeReaction(props.reaction)));
let withdrawalAnimation: Animation | undefined;
let disposed = false;

onBeforeUnmount(() => {
	disposed = true;
	withdrawalAnimation?.cancel();
});

const emojiName = computed(() => getEmojiNameFromReaction(props.reaction));

const isLocalCustomEmoji = computed(() => isLocalCustomEmojiReaction(props.reaction));

const canToggle = computed(() => {
	const emoji = isLocalCustomEmoji.value ? customEmojisMap.get(emojiName.value) : getUnicodeEmojiOrNull(props.reaction);

	// TODO
	//return $i != null && emoji != null && checkReactionPermissions($i, props.note, emoji);
	return $i != null && (emoji != null || isMine.value);
});

async function toggleReaction() {
	if (!canToggle.value || $i == null || busy.value) return;
	const me = $i;
	const reaction = props.reaction;
	const noteId = props.noteId;
	const remove = isMine.value;
	let acceptedReaction = reaction;
	busy.value = true;
	try {
		if (!remove && prefer.s.confirmOnReact) {
			const confirm = await os.confirm({
				type: 'question',
				text: i18n.tsx.reactAreYouSure({ emoji: reaction.replace('@.', '') }),
			});
			if (confirm.canceled) return;
		}
		if (remove && props.count === 1) {
			withdrawalAnimation = animateReactionRemoval(buttonEl.value);
			await withdrawalAnimation?.finished.catch(() => {});
		}
		if (disposed || props.noteId !== noteId || props.reaction !== reaction) return;
		if (mock) {
			emit('reactionToggled', reaction, props.count + (remove ? -1 : 1));
		} else {
			if (remove) {
				await misskeyApi('notes/reactions/delete', { noteId, reaction });
				noteEvents.emit(`unreacted:${noteId}`, { userId: me.id, reaction });
			} else {
				const result = await misskeyApi('notes/reactions/create', { noteId, reaction });
				acceptedReaction = result.reaction;
				noteEvents.emit(`reacted:${noteId}`, { userId: me.id, reaction: acceptedReaction, emoji: customEmojisMap.get(getEmojiNameFromReaction(acceptedReaction)) });
			}
		}
		if (!remove) {
			sound.playMisskeySfx('reaction');
			haptic();
			playReactionEffect(acceptedReaction, buttonEl.value);
		}
	} catch {
		os.toast(i18n.ts.somethingHappened, 'error');
	} finally {
		withdrawalAnimation?.cancel();
		withdrawalAnimation = undefined;
		busy.value = false;
	}
}

async function menu(ev: PointerEvent) {
	let menuItems: MenuItem[] = [];

	if (isLocalCustomEmoji.value) {
		menuItems.push({
			text: i18n.ts.info,
			icon: 'ti ti-info-circle',
			action: async () => {
				const { dispose } = os.popup(MkCustomEmojiDetailedDialog, {
					emoji: await misskeyApiGet('emoji', {
						name: emojiName.value,
					}),
				}, {
					closed: () => dispose(),
				});
			},
		});
	}

	if (isEmojiMuted(props.reaction).value) {
		menuItems.push({
			text: i18n.ts.emojiUnmute,
			icon: 'ti ti-mood-smile',
			action: () => {
				os.confirm({
					type: 'question',
					title: i18n.tsx.unmuteX({ x: isLocalCustomEmoji.value ? `:${emojiName.value}:` : props.reaction }),
				}).then(({ canceled }) => {
					if (canceled) return;
					unmuteEmoji(props.reaction);
				});
			},
		});
	} else {
		menuItems.push({
			text: i18n.ts.emojiMute,
			icon: 'ti ti-mood-off',
			action: () => {
				os.confirm({
					type: 'question',
					title: i18n.tsx.muteX({ x: isLocalCustomEmoji.value ? `:${emojiName.value}:` : props.reaction }),
				}).then(({ canceled }) => {
					if (canceled) return;
					muteEmoji(props.reaction);
				});
			},
		});
	}

	if (canToggle.value) {
		menuItems.push({
			text: i18n.ts.addToEmojiPalette,
			icon: 'ti ti-palette',
			action: () => {
				addToEmojiPalette(isLocalCustomEmoji.value ? `:${emojiName.value}:` : props.reaction);
			},
		});
	}

	os.popupMenu(menuItems, ev.currentTarget ?? ev.target);
}

async function fetchUsers(): Promise<Misskey.entities.UserLite[]> {
	if (mock) return [];
	const reactions = await misskeyApi('notes/reactions', { noteId: props.noteId, type: props.reaction, limit: 2 });
	return reactions.map(record => record.user);
}

</script>

