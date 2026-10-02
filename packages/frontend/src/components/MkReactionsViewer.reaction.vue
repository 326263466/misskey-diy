<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<span ref="bubbleEl" :class="$style.bubble">
	<button v-if="author != null && !mock" ref="avatarButton" type="button" class="_button" :class="$style.bubbleAvatar" :aria-label="acct(author)" aria-haspopup="dialog" :aria-expanded="authorShown" @click.stop="toggleAuthor">
		<MkAvatar :class="$style.bubbleAvatar" :user="author" :link="false" :preview="false" title=""/>
	</button>
	<MkAvatar v-else-if="author != null" :class="$style.bubbleAvatar" :user="author" :link="false" :preview="false"/>
	<span v-else :class="[$style.bubbleAvatar, $style.bubbleAvatarFallback]"><i class="ti ti-rocket" aria-hidden="true"></i></span>
	<template v-if="isTextBoost(reaction)">
		<button v-if="bubbleAction != null" class="_button" :class="$style.bubbleText" :aria-expanded="actionShown" @click.stop="actionShown = !actionShown"><MkReactionIcon :reaction="reaction" :allowTextBoost="true" :nowrap="true"/></button>
		<span v-else :class="$style.bubbleText"><MkReactionIcon :reaction="reaction" :allowTextBoost="true" :nowrap="true"/></span>
	</template>
	<button
		v-else
		ref="buttonEl"
		v-ripple="canToggle"
		class="_button"
		:class="$style.emojiContent"
		:aria-pressed="isMine"
		:aria-expanded="actionShown"
		:disabled="busy"
		@click.stop="onClick"
		@contextmenu.prevent.stop="menu"
	>
		<MkReactionIcon style="pointer-events: none;" :class="prefer.s.limitWidthOfReaction ? $style.limitWidth : ''" :reaction="reaction" :emojiUrl="reactionEmojis[emojiName]"/>
		<span v-if="count > 1" :class="$style.count">×{{ count }}</span>
	</button>
	<button v-if="actionShown && bubbleAction === 'remove'" v-tooltip="i18n.ts.delete" class="_button" :class="[$style.bubbleAction, $style.removeAction]" :disabled="busy" :aria-label="i18n.ts.delete" @click.stop="removeBoost()"><i class="ti ti-trash" aria-hidden="true"></i></button>
	<button v-else-if="actionShown && bubbleAction === 'report'" v-tooltip="i18n.ts.reportAbuse" class="_button" :class="$style.bubbleAction" :aria-label="i18n.ts.reportAbuse" @click.stop="reportBoost()"><i class="ti ti-flag" aria-hidden="true"></i></button>
</span>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, inject, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { getUnicodeEmojiOrNull } from '@@/js/emojilist.js';
import { getEmojiNameFromReaction, isLocalCustomEmojiReaction } from '@@/js/emoji-name.js';
import { url } from '@@/js/config.js';
import MkCustomEmojiDetailedDialog from './MkCustomEmojiDetailedDialog.vue';
import type { MenuItem } from '@/types/menu';
import XDetails from '@/components/MkReactionsViewer.details.vue';
import MkReactionIcon from '@/components/MkReactionIcon.vue';
import * as os from '@/os.js';
import { misskeyApi, misskeyApiGet } from '@/utility/misskey-api.js';
import { useTooltip } from '@/composables/use-tooltip.js';
import { $i } from '@/i.js';
import MkReactionEffect from '@/components/MkReactionEffect.vue';
import { i18n } from '@/i18n.js';

// import { checkReactionPermissions } from '@/utility/check-reaction-permissions.js';
import { customEmojisMap } from '@/custom-emojis.js';
import { prefer } from '@/preferences.js';
import { DI } from '@/di.js';
import { noteEvents } from '@/composables/use-note-capture.js';
import { mute as muteEmoji, unmute as unmuteEmoji, checkMuted as isEmojiMuted } from '@/utility/emoji-mute.js';
import { addToEmojiPalette } from '@/utility/emoji-palette.js';

import { getBoostText, isTextBoost } from '@/utility/boost.js';
import MkAvatar from '@/components/global/MkAvatar.vue';
import { claimUserPopup } from '@/utility/user-popup.js';
import { normalizeReaction } from '@/utility/normalize-reaction.js';
import { acct } from '@/filters/user.js';

const props = defineProps<{
	noteId: Misskey.entities.Note['id'];
	reaction: string;
	reactionEmojis: Misskey.entities.Note['reactionEmojis'];
	myReaction: Misskey.entities.Note['myReaction'];
	count: number;
	isInitial: boolean;
	users?: Misskey.entities.UserLite[];
}>();

const users = computed(() => props.users ?? []);

const mock = inject(DI.mock, false);

const emit = defineEmits<{
	(ev: 'reactionToggled', emoji: string, newCount: number): void;
}>();

const buttonEl = useTemplateRef('buttonEl');
const bubbleEl = useTemplateRef('bubbleEl');
const avatarButton = useTemplateRef('avatarButton');
const authorShown = ref(false);
let authorDispose: (() => void) | null = null;
let releaseAuthorPopup: (() => void) | null = null;
const busy = ref(false);
const actionShown = ref(false);
let dialogOpen = false;
let disposed = false;

watch(actionShown, shown => {
	if (!shown) {
		window.document.removeEventListener('pointerdown', onOutsidePointer, { capture: true });
		return;
	}
	window.document.addEventListener('pointerdown', onOutsidePointer, { capture: true });
});

function onOutsidePointer(ev: PointerEvent) {
	// 举报窗在气泡外面，打开期间保留操作图标。
	if (dialogOpen) return;
	const target = ev.target as HTMLElement | null;
	if (target != null && bubbleEl.value?.contains(target)) return;
	actionShown.value = false;
}

onBeforeUnmount(() => {
	disposed = true;
	window.document.removeEventListener('pointerdown', onOutsidePointer, { capture: true });
	closeAuthor();
});

const isMine = computed(() => $i != null && props.myReaction != null && normalizeReaction(props.myReaction) === normalizeReaction(props.reaction));

const author = computed(() => (isMine.value ? $i : users.value[0]) ?? null);

watch(() => author.value?.id, closeAuthor);

function closeAuthor() {
	authorShown.value = false;
	releaseAuthorPopup?.();
	releaseAuthorPopup = null;
	const dispose = authorDispose;
	authorDispose = null;
	dispose?.();
}

function toggleAuthor() {
	if (authorShown.value) {
		closeAuthor();
		return;
	}
	if (mock || author.value == null || avatarButton.value == null || authorDispose != null) return;
	releaseAuthorPopup = claimUserPopup(closeAuthor);
	authorShown.value = true;
	const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkUserPopup.vue')), {
		showing: authorShown,
		q: author.value.id,
		source: avatarButton.value,
		interactive: true,
	}, {
		close: closeAuthor,
		closed: () => {
			if (authorDispose === dispose) closeAuthor();
		},
	});
	authorDispose = dispose;
}

const bubbleAction = computed<'remove' | 'report' | null>(() => {
	if ($i == null) return null;
	if (isMine.value) return 'remove';
	return author.value != null ? 'report' : null;
});

const emojiName = computed(() => getEmojiNameFromReaction(props.reaction));

const isLocalCustomEmoji = computed(() => isLocalCustomEmojiReaction(normalizeReaction(props.reaction)));

const canToggle = computed(() => {
	if (isTextBoost(props.reaction)) return false;
	const emoji = isLocalCustomEmoji.value ? customEmojisMap.get(emojiName.value) : getUnicodeEmojiOrNull(props.reaction);

	// TODO
	//return $i != null && emoji != null && checkReactionPermissions($i, props.note, emoji);
	return $i != null && (emoji != null || isMine.value);
});

function onClick() {
	if (bubbleAction.value != null) {
		actionShown.value = !actionShown.value;
	} else {
		showDetails();
	}
}

async function removeBoost() {
	if (!isMine.value || $i == null || busy.value) return;
	const userId = $i.id;
	const noteId = props.noteId;
	const reaction = props.reaction;
	actionShown.value = false;
	busy.value = true;
	try {
		const { canceled } = await os.confirm({
			type: 'warning',
			text: i18n.ts.cancelReactionConfirm,
		});
		if (canceled || disposed || !isMine.value || props.noteId !== noteId || props.reaction !== reaction) return;

		if (!mock) {
			await misskeyApi('notes/reactions/delete', { noteId });
			noteEvents.emit(`unreacted:${noteId}`, { userId, reaction });
		} else {
			emit('reactionToggled', reaction, props.count - 1);
		}
	} catch {
		await os.alert({ type: 'error', text: i18n.ts.somethingHappened });
	} finally {
		busy.value = false;
	}
}

async function reportBoost() {
	if (mock || author.value == null) return;
	dialogOpen = true;
	const { dispose } = await os.popupAsyncWithDialog(import('@/components/MkAbuseReportWindow.vue').then(x => x.default), {
		user: author.value,
		reportTarget: { reportType: 'boost', targetId: props.noteId, reaction: props.reaction },
		context: { label: i18n.ts._boost.title, text: getBoostText(props.reaction), url: `${url}/notes/${props.noteId}` },
	}, {
		closed: () => {
			dialogOpen = false;
			dispose();
		},
	});
}

function showDetails() {
	if (mock) return;
	const { dispose } = os.popup(XDetails, {
		showing: true,
		reaction: props.reaction,
		users: users.value,
		count: props.count,
		noteId: props.noteId,
		asDialog: true,
	}, {
		closed: () => dispose(),
	});
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

function anime() {
	if (isTextBoost(props.reaction) || window.document.hidden || !prefer.s.animation || buttonEl.value == null) return;

	const rect = buttonEl.value.getBoundingClientRect();
	const x = rect.left + 16;
	const y = rect.top + (buttonEl.value.offsetHeight / 2);
	const { dispose } = os.popup(MkReactionEffect, { reaction: props.reaction, x, y }, {
		end: () => dispose(),
	});
}

watch(() => props.count, (newCount, oldCount) => {
	if (oldCount < newCount) anime();
});

onMounted(() => {
	if (!props.isInitial) anime();
});

if (!mock) {
	useTooltip(buttonEl, (showing) => {
		if (buttonEl.value == null) return;

		const { dispose } = os.popup(XDetails, {
			showing,
			reaction: props.reaction,
			users: users.value,
			count: props.count,
			anchorElement: buttonEl.value,
		}, {
			closed: () => dispose(),
		});
	});
}
</script>

<style lang="scss" module>
.bubble {
	--boost-bubble-bg: var(--MI_THEME-buttonBg);
}

.bubble .emojiContent {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 4px;
	font-size: 1.5em;
	line-height: 1.2;
}

.limitWidth {
	max-width: 70px;
	object-fit: contain;
}

.count {
	font-size: 0.7em;
	line-height: 1.2;
}

.bubble {
	display: inline-flex;
	align-items: center;
	box-sizing: border-box;
	// 高度写死，点开删除/举报图标时气泡不会跟着变高；内容由 align-items 居中
	height: 28px;
	gap: 3px;
	max-width: 280px;
	padding: 0 7px 0 2px;
	border-radius: 50px;
	font-size: 0.85em;
	line-height: 1;
	background: var(--boost-bubble-bg);

}

.bubble .bubbleAvatar {
	flex-shrink: 0;
	width: 24px;
	height: 24px;
	border-radius: 50%;
	background: var(--MI_THEME-divider);
}

.bubble .bubbleAvatarFallback {
	display: inline-flex;
	align-items: center;
	justify-content: center;

	> :global(.ti) {
		line-height: 1;
	}
}

.bubbleText {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	line-height: 1.2;
	color: inherit;
}

.bubbleAction {
	flex-shrink: 0;
	padding: 2px;
	margin: 0 -3px 0 0;
	line-height: 1;
	color: var(--MI_THEME-fg);

	> :global(.ti) {
		font-size: inherit;
	}

	&:hover {
		color: var(--MI_THEME-fgHighlighted);
	}
}

.removeAction {
	color: var(--MI_THEME-error);

	&:hover {
		color: var(--MI_THEME-error);
	}
}
</style>
