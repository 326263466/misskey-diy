<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<span v-if="isTextBoost(reaction)" ref="bubbleEl" :class="$style.bubble">
	<button v-if="author != null" ref="avatarEl" class="_button" :class="$style.bubbleAvatar" :aria-label="acct(author)" @click="showUserPopup()">
		<MkAvatar :user="author"/>
	</button>
	<span v-else :class="$style.bubbleAvatar"><i class="ti ti-rocket" aria-hidden="true"></i></span>
	<button v-if="bubbleAction != null" class="_button" :class="$style.bubbleText" :aria-expanded="actionShown" @click="actionShown = !actionShown">{{ getBoostText(reaction) }}</button>
	<span v-else :class="$style.bubbleText">{{ getBoostText(reaction) }}</span>
	<button v-if="actionShown && bubbleAction === 'remove'" class="_button" :class="$style.bubbleAction" :disabled="busy" :aria-label="i18n.ts.delete" @click="removeBoost()"><i class="ti ti-trash" aria-hidden="true"></i></button>
	<button v-else-if="actionShown && bubbleAction === 'report'" class="_button" :class="$style.bubbleAction" :aria-label="i18n.ts.reportAbuse" @click="reportBoost()"><i class="ti ti-flag" aria-hidden="true"></i></button>
</span>
<button
	v-else
	ref="buttonEl"
	v-ripple="canToggle"
	class="_button"
	:class="[$style.root, { [$style.reacted]: myReaction == reaction, [$style.canToggle]: canToggle, [$style.interactive]: !canToggle, [$style.small]: prefer.s.reactionsDisplaySize === 'small', [$style.large]: prefer.s.reactionsDisplaySize === 'large' }]"
	:aria-pressed="myReaction == reaction"
	:disabled="busy"
	@click="onClick"
	@contextmenu.prevent.stop="menu"
>
	<MkReactionIcon :allowTextBoost="true" style="pointer-events: none;" :class="prefer.s.limitWidthOfReaction ? $style.limitWidth : ''" :reaction="reaction" :emojiUrl="reactionEmojis[emojiName]"/>
	<span :class="$style.count">×{{ count }}</span>
</button>
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
import * as sound from '@/utility/sound.js';
// import { checkReactionPermissions } from '@/utility/check-reaction-permissions.js';
import { customEmojisMap } from '@/custom-emojis.js';
import { prefer } from '@/preferences.js';
import { DI } from '@/di.js';
import { noteEvents } from '@/composables/use-note-capture.js';
import { mute as muteEmoji, unmute as unmuteEmoji, checkMuted as isEmojiMuted } from '@/utility/emoji-mute.js';
import { addToEmojiPalette } from '@/utility/emoji-palette.js';
import { haptic } from '@/utility/haptic.js';
import { getBoostText, isTextBoost } from '@/utility/boost.js';
import MkAvatar from '@/components/global/MkAvatar.vue';
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
const avatarEl = useTemplateRef('avatarEl');
const busy = ref(false);
const actionShown = ref(false);
let userPopupOpen = false;

// バブルの外をクリックしたら操作アイコンを畳む
watch(actionShown, shown => {
	if (!shown) {
		window.document.removeEventListener('pointerdown', onOutsidePointer, { capture: true });
		return;
	}
	window.document.addEventListener('pointerdown', onOutsidePointer, { capture: true });
});

function onOutsidePointer(ev: PointerEvent) {
	const target = ev.target as HTMLElement | null;
	if (target != null && bubbleEl.value?.contains(target)) return;
	actionShown.value = false;
}

onBeforeUnmount(() => {
	window.document.removeEventListener('pointerdown', onOutsidePointer, { capture: true });
});

const isMine = computed(() => $i != null && props.myReaction === props.reaction);

// 参加者一覧の取得を待たずにアバターを出せるよう、自分のBoostは$iを優先する
const author = computed(() => (isMine.value ? $i : users.value[0]) ?? null);

// 本文をクリックしたときにアイコンを出す。自分のBoostは消すだけ、他人のBoostは通報だけ
const bubbleAction = computed<'remove' | 'report' | null>(() => {
	if ($i == null) return null;
	if (isMine.value) return 'remove';
	return author.value != null ? 'report' : null;
});

const emojiName = computed(() => getEmojiNameFromReaction(props.reaction));

const isLocalCustomEmoji = computed(() => isLocalCustomEmojiReaction(props.reaction));

const canToggle = computed(() => {
	// Boostは投稿したら取り消せない
	if (isTextBoost(props.reaction)) return false;
	const emoji = isLocalCustomEmoji.value ? customEmojisMap.get(emojiName.value) : getUnicodeEmojiOrNull(props.reaction);

	// TODO
	//return $i != null && emoji != null && checkReactionPermissions($i, props.note, emoji);
	return $i != null && (emoji != null || props.myReaction === props.reaction);
});

function onClick() {
	if (canToggle.value) {
		void toggleReaction();
	} else {
		showDetails();
	}
}

// hoverで開くv-user-previewとは別系統。クリックで開くので外側のクリックで閉じる
function showUserPopup() {
	if (mock || author.value == null || avatarEl.value == null || userPopupOpen) return;
	const anchor = avatarEl.value;
	const showing = ref(true);
	userPopupOpen = true;

	const onPointerDown = (ev: PointerEvent) => {
		const target = ev.target as HTMLElement | null;
		if (target != null && (anchor.contains(target) || target.closest('._popup') != null)) return;
		showing.value = false;
	};
	window.document.addEventListener('pointerdown', onPointerDown, { capture: true });

	const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkUserPopup.vue')), {
		showing,
		q: author.value.id,
		source: anchor,
	}, {
		closed: () => {
			window.document.removeEventListener('pointerdown', onPointerDown, { capture: true });
			userPopupOpen = false;
			dispose();
		},
	});
}

async function removeBoost() {
	if (!isMine.value || $i == null || busy.value) return;
	const userId = $i.id;
	const { canceled } = await os.confirm({ type: 'warning', text: i18n.ts.deleteConfirm });
	if (canceled) return;
	actionShown.value = false;
	busy.value = true;
	try {
		if (!mock) {
			await misskeyApi('notes/reactions/delete', { noteId: props.noteId });
			noteEvents.emit(`unreacted:${props.noteId}`, { userId, reaction: props.reaction });
		} else {
			emit('reactionToggled', props.reaction, props.count - 1);
		}
	} catch {
		await os.alert({ type: 'error', text: i18n.ts.somethingHappened });
	} finally {
		busy.value = false;
	}
}

async function reportBoost() {
	if (mock || author.value == null) return;
	const { dispose } = await os.popupAsyncWithDialog(import('@/components/MkAbuseReportWindow.vue').then(x => x.default), {
		user: author.value,
		initialComment: `Boost: ${getBoostText(props.reaction)}\nNote: ${url}/notes/${props.noteId}\n-----\n`,
	}, {
		closed: () => dispose(),
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

async function toggleReaction() {
	if (!canToggle.value || $i == null || busy.value) return;
	const userId = $i.id;
	const oldReaction = props.myReaction;
	const removing = oldReaction === props.reaction;
	busy.value = true;
	try {
		if (oldReaction) {
			const { canceled } = await os.confirm({
				type: 'warning',
				text: removing ? i18n.ts.cancelReactionConfirm : i18n.ts.changeReactionConfirm,
			});
			if (canceled) return;
		} else if (prefer.s.confirmOnReact) {
			const { canceled } = await os.confirm({ type: 'question', text: i18n.tsx.reactAreYouSure({ emoji: props.reaction.replace('@.', '') }) });
			if (canceled) return;
		}

		if (mock) {
			emit('reactionToggled', props.reaction, props.count + (removing ? -1 : 1));
			return;
		}

		if (removing) {
			await misskeyApi('notes/reactions/delete', { noteId: props.noteId });
		} else {
			await misskeyApi('notes/reactions/create', { noteId: props.noteId, reaction: props.reaction });
		}
		if (oldReaction) noteEvents.emit(`unreacted:${props.noteId}`, { userId, reaction: oldReaction });
		if (!removing) {
			noteEvents.emit(`reacted:${props.noteId}`, { userId, reaction: props.reaction, emoji: customEmojisMap.get(emojiName.value) });
			sound.playMisskeySfx('reaction');
			haptic();
		}
	} catch {
		await os.alert({ type: 'error', text: i18n.ts.somethingHappened });
	} finally {
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

// Boostのバブルはアバターと本文で誰が何を言ったか完結しているので、ツールチップは出さない。
// (テキストBoostではbuttonElが存在しないため、ここでの購読は絵文字リアクションにだけ効く)
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
	}, 100);
}
</script>

<style lang="scss" module>
// Boostのピルとバブルの地色。buttonBgはボタンやタグなど他の16箇所でも共有されているので、
// Boostだけ色を変えられるよう独立した変数にしておく
.root,
.bubble {
	--boost-bubble-bg: color-mix(in srgb, var(--MI_THEME-panel), var(--MI_THEME-fg) 8%);
}

	.root {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	box-sizing: border-box;
	gap: 4px;
	height: 32px;
	padding: 4px 8px 4px 4px;
	// Boostのバブルと同じ見た目。絵文字の高さは1.25emなので、アバターと同じ24pxになるfont-sizeを置く
	border-radius: 50px;
	font-size: 19.2px;

	&.canToggle {
		background: var(--boost-bubble-bg);

		// 黒の重ねだとダークテーマで暗くなってしまうので、地色に応じて明暗を変える
		&:hover {
			background: color-mix(in srgb, var(--MI_THEME-panel), var(--MI_THEME-fg) 14%);
		}
	}

	&:not(.canToggle) {
		cursor: default;
	}

	&.interactive {
		cursor: pointer;
	}

	&.small {
		height: 28px;
		font-size: 16px;
	}

	&.large {
		height: 40px;
		font-size: 25.6px;
	}

	&.reacted, &.reacted:hover {
		background: var(--MI_THEME-accentedBg);
		color: var(--MI_THEME-accent);
		box-shadow: 0 0 0 1px var(--MI_THEME-accent) inset;

		> .count {
			color: var(--MI_THEME-accent);
		}

		> .icon {
			filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.5));
		}
	}
}

.limitWidth {
	max-width: 70px;
	object-fit: contain;
}

// バブルの本文と同じ大きさ。絵文字側のfont-sizeが大きいので固定値で指定する
.count {
	font-size: 12px;
	line-height: 1.2;
}

// アバターと本文をひとつの丸いバブルにまとめる。左はアバターが縁に接するので詰める
.bubble {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	max-width: 280px;
	padding: 4px 8px 4px 4px;
	border-radius: 50px;
	font-size: 12px;
	line-height: 1;
	background: var(--boost-bubble-bg);
}

.bubbleAvatar {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	width: 24px;
	height: 24px;
	border-radius: 50%;
	overflow: hidden;
	background: var(--MI_THEME-divider);

	> :global(.ti) {
		line-height: 1;
	}

	> :global(*) {
		width: 100%;
		height: 100%;
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
	padding: 4px;
	margin-left: 4px;
	line-height: 1;
	color: var(--MI_THEME-fgTransparentWeak);

	> :global(.ti) {
		font-size: 12px;
	}

	&:hover {
		color: var(--MI_THEME-error);
	}
}
</style>
