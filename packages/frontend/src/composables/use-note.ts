/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, onUnmounted, ref, watch } from 'vue';
import type { Ref } from 'vue';
import * as mfm from 'mfm-js';
import * as Misskey from 'misskey-js';
import { isLink } from '@@/js/is-link.js';
import { shouldCollapsed } from '@@/js/collapsed.js';
import { host, url } from '@@/js/config.js';
import { isSupportShare } from '@/utility/navigator.js';
import { pleaseLogin } from '@/utility/please-login.js';
import type { OpenOnRemoteOptions } from '@/utility/please-login.js';
import { checkWordMute } from '@/utility/check-word-mute.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import * as sound from '@/utility/sound.js';
import * as os from '@/os.js';
import { extractUrlFromMfm } from '@/utility/extract-url-from-mfm.js';
import { getNoteClipMenu, getNoteMenu, getRenoteMenu, getAbuseNoteMenu, getCopyNoteLinkMenu } from '@/utility/get-note-menu.js';
import { getMyRenoteId, noteEvents, unregisterMyRenote, useNoteCapture, useNoteCaptureVisibility } from '@/composables/use-note-capture.js';
import { deepClone } from '@/utility/clone.js';
import { useTooltip } from '@/composables/use-tooltip.js';
import { claimAchievement } from '@/utility/achievements.js';
import { showMovedDialog } from '@/utility/show-moved-dialog.js';
import { getAppearNote } from '@/utility/get-appear-note.js';
import { prefer } from '@/preferences.js';
import { getPluginHandlers } from '@/plugin.js';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import { globalEvents, useGlobalEvent } from '@/events.js';
import MkUsersTooltip from '@/components/MkUsersTooltip.vue';
import MkBoostComposer from '@/components/MkBoostComposer.vue';
import { notePage } from '@/filters/note.js';
import type { DI as DIType } from '@/di.js';
import type { ExtractInjectedType } from '@/types/misc.js';
import type { MenuItem } from '@/types/menu.js';
import type { WordMuteResult } from '@/utility/check-word-mute.js';
import { useNoteContent } from '@/composables/use-note-content.js';
import { useLike } from '@/composables/use-like.js';
import { useNoteViews } from '@/composables/use-note-views.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';

export interface UseNoteProps {
	note: Misskey.entities.Note;
	pinned?: boolean;
	mock?: boolean;
	withHardMute?: boolean;
}

export interface UseNoteElements {
	rootEl?: Ref<HTMLElement | null>;
	viewEl?: Readonly<Ref<HTMLElement | null>>;
	menuButton?: Ref<HTMLElement | null>;
	renoteButton?: Ref<HTMLElement | null>;
	reactButton?: Ref<HTMLElement | null>;
	clipButton?: Ref<HTMLElement | null>;
}

export interface UseNoteOptions {
	inTimeline?: boolean;
	tl_withSensitive?: Ref<boolean>;
	inChannel?: ExtractInjectedType<typeof DIType['inChannel']>;
	currentClip?: Ref<Misskey.entities.Clip | null> | null;
	currentAntenna?: Ref<Misskey.entities.Antenna | null> | null;
}

export function checkNoteWordMute(
	noteToCheck: Misskey.entities.Note,
	user: typeof $i,
	mutedWords: Array<string | string[]> | null,
): WordMuteResult {
	if (mutedWords != null) {
		const result = checkWordMute(noteToCheck, user, mutedWords);
		if (Array.isArray(result)) return result;

		const replyResult = noteToCheck.reply && checkWordMute(noteToCheck.reply, user, mutedWords);
		if (Array.isArray(replyResult)) return replyResult;

		const renoteResult = noteToCheck.renote && checkWordMute(noteToCheck.renote, user, mutedWords);
		if (Array.isArray(renoteResult)) return renoteResult;
	}

	return false;
}

export function checkBuiltinSoftMute(
	noteToCheck: Misskey.entities.Note,
	checkForSensitiveMedia: boolean,
): 'sensitiveMute' | false {
	if (checkForSensitiveMedia && noteToCheck.files?.some((v) => v.isSensitive)) {
		return 'sensitiveMute' as never;
	}

	return false;
}

/** MkNote, MkNoteDetailedの共通ロジック */
export function useNote(
	props: UseNoteProps,
	els: UseNoteElements = {},
	options: UseNoteOptions = {},
) {
	const inTimeline = options.inTimeline ?? false;
	const tl_withSensitive = options.tl_withSensitive ?? ref(true);
	const inChannel = options.inChannel ?? null;
	const currentClip = options.currentClip ?? null;
	const currentAntenna = options.currentAntenna ?? null;

	// プラグインの割り込み処理
	let rawNote = deepClone(props.note);
	let hideByPlugin = false;
	const noteViewInterruptors = getPluginHandlers('note_view_interruptor');

	if (noteViewInterruptors.length > 0) {
		let result: Misskey.entities.Note | null = deepClone(rawNote);
		for (const interruptor of noteViewInterruptors) {
			try {
				result = interruptor.handler(result!) as Misskey.entities.Note | null;

				// nullになった場合（非表示）はこれ以上やることがないのでループを抜ける
				if (result == null) {
					break;
				}
			} catch (err) {
				console.error(err);
			}
		}
		if (result == null) {
			hideByPlugin = true;
		} else {
			rawNote = result;
		}
	}

	// 基本状態
	const isRenote = Misskey.note.isPureRenote(rawNote);
	const appearNote = useNoteContent(getAppearNote(rawNote) ?? rawNote);
	const reactionNote = isRenote ? rawNote : appearNote;
	const renoteTargetId = isRenote ? rawNote.renoteId : appearNote.id;

	// キャプチャ（ストリーム購読）
	const noteCaptureActive = useNoteCaptureVisibility(els.rootEl);
	const appearNoteCapture = useNoteCapture({
		note: appearNote,
		parentNote: rawNote,
		mock: props.mock,
		active: noteCaptureActive,
	});
	const reactionNoteCapture = reactionNote.id === appearNote.id
		? appearNoteCapture
		: useNoteCapture({
			note: reactionNote,
			parentNote: null,
			mock: props.mock,
			active: noteCaptureActive,
		});
	const { $note: $appearNote, subscribe: subscribeManuallyToNoteCapture } = appearNoteCapture;
	const { $note: $reactionNote } = reactionNoteCapture;
	const { liking, toggleLike } = useLike(appearNote.id, $appearNote, { mock: props.mock, disabled: () => appearNote.isDeleted === true });

	// 各種フラグ状態
	const showContent = ref(false);
	const isDeleted = ref(rawNote.isDeleted === true || (!isRenote && appearNote.isDeleted === true));
	const deletedBy = ref<Misskey.entities.Note['deletedBy']>(appearNote.deletedBy ?? null);
	const isRenoteTargetDeleted = ref(isRenote && (rawNote.renote == null || rawNote.renote.isDeleted === true));
	const renoteTargetDeletedBy = ref<Misskey.entities.Note['deletedBy']>(isRenote ? rawNote.renote?.deletedBy ?? null : null);
	const isFavorited = computed(() => $appearNote.isFavorited);
	const favoriting = ref(false);
	const translating = ref(false);
	const translation = ref<Misskey.entities.NotesTranslateResponse | null>(null);

	// ミュート判定
	// mutedはミュート解除の操作で書き換わるのでrefだが、hardMutedは解除できないのでリアクティブにしない
	const muted = ref($i ? checkNoteWordMute(appearNote, $i, $i.mutedWords) || checkBuiltinSoftMute(appearNote, inTimeline && !tl_withSensitive.value) : false);
	const hardMuted = props.withHardMute && $i ? checkNoteWordMute(appearNote, $i, $i.hardMutedWords) : false;

	// 導出値
	// rawNote / appearNote / $i.id / prefer.s は変化しないので一度だけ計算する
	const isMyRenote = $i != null && isRenote && ($i.id === rawNote.userId);
	const isRenotedByMe = computed(() => renoteTargetId != null && getMyRenoteId(renoteTargetId) != null);
	const displayedRenoteCount = computed(() => $appearNote.renoteCount + (isRenotedByMe.value && appearNote.userId === $i?.id && $i?.isBot !== true ? 1 : 0));
	const parsed = computed(() => appearNote.text ? mfm.parse(appearNote.text) : null);
	const urls = computed(() => parsed.value ? extractUrlFromMfm(parsed.value).filter((url) => appearNote.renote?.url !== url && appearNote.renote?.uri !== url) : null);
	const isLong = computed(() => shouldCollapsed(appearNote, urls.value ?? []));
	const collapsed = ref(appearNote.cw == null && isLong.value);
	watch([isLong, () => appearNote.cw], ([long, cw]) => {
		if (!long || cw != null) collapsed.value = false;
	});
	const canRenote = ['public', 'home'].includes(appearNote.visibility) || (appearNote.visibility === 'followers' && appearNote.userId === $i?.id);
	const showTicker = (prefer.s.instanceTicker === 'always') || (prefer.s.instanceTicker === 'remote' && appearNote.user.instance);
	const renoteCollapsed = ref(prefer.s.collapseRenotes && isRenote && (($i && ($i.id === rawNote.userId || $i.id === appearNote.userId)) || ($reactionNote.myReaction != null)));
	if (els.viewEl != null) {
		useNoteViews(els.viewEl, computed(() => appearNote.id), computed(() =>
			!props.mock && !hideByPlugin && !hardMuted && muted.value === false && !isDeleted.value &&
			!isRenoteTargetDeleted.value && !renoteCollapsed.value && !appearNote.isDeleted && !appearNote.isHidden &&
			(appearNote.cw == null || showContent.value)));
	}

	const pleaseLoginContext: OpenOnRemoteOptions = {
		type: 'lookup',
		url: `https://${host}/notes/${appearNote.id}`,
	};

	// グローバルイベントの監視
	useGlobalEvent('noteDeleted', (noteId, _replyId, _renoteId, eventDeletedBy) => {
		if (isMyRenote && noteId === rawNote.id) {
			if (renoteTargetId != null) unregisterMyRenote(renoteTargetId, rawNote.id);
		}
		if (noteId === rawNote.id) {
			isDeleted.value = true;
			deletedBy.value = eventDeletedBy ?? deletedBy.value;
		} else if (isRenote && noteId === renoteTargetId) {
			isRenoteTargetDeleted.value = true;
			renoteTargetDeletedBy.value = eventDeletedBy ?? renoteTargetDeletedBy.value;
		} else if (noteId === appearNote.id) {
			isDeleted.value = true;
			deletedBy.value = eventDeletedBy ?? deletedBy.value;
		}
	});

	// ツールチップのセットアップ (Mockでない場合のみ)
	if (!props.mock) {
		if (els.renoteButton != null) {
			useTooltip(els.renoteButton, async (showing) => {
				const renotes = await misskeyApi('notes/renotes', {
					noteId: appearNote.id,
					limit: 11,
				});
				const users = renotes.map(x => x.user);
				if (users.length < 1 || els.renoteButton!.value == null) return;
				const { dispose } = os.popup(MkUsersTooltip, {
					showing,
					users,
					count: displayedRenoteCount.value,
					anchorElement: els.renoteButton!.value,
				}, {
					closed: () => dispose(),
				});
			});
		}
	}

	// 共通アクション関数群
	async function renote() {
		if (props.mock) return;
		const isLoggedIn = await pleaseLogin({ openOnRemote: pleaseLoginContext });
		if (!isLoggedIn) return;
		showMovedDialog();
		if (els.renoteButton == null) return;
		const { menu } = getRenoteMenu({
			note: rawNote,
			renoteButton: els.renoteButton,
			mock: props.mock,
		});
		os.popupMenu(menu, els.renoteButton.value);
		subscribeManuallyToNoteCapture();
	}

	async function toggleRenote() {
		if (isRenote) {
			await showRenoteMenu();
		} else {
			await renote();
		}
	}

	async function deleteRenote(explicitRenoteNoteId: Misskey.entities.Note['id'] | null = null): Promise<void> {
		if (props.mock) return;
		const isLoggedIn = await pleaseLogin({ openOnRemote: pleaseLoginContext });
		if (!isLoggedIn) return;

		const renoteNoteId = explicitRenoteNoteId ?? (isMyRenote ? rawNote.id : null);
		if (!isRenote || renoteNoteId !== rawNote.id || (!isMyRenote && !$i?.isModerator && !$i?.isAdmin)) return;

		await misskeyApi('notes/delete', { noteId: renoteNoteId });
		unregisterMyRenote(renoteTargetId!, renoteNoteId);
		const countedRenoteId = !isRenoteTargetDeleted.value && appearNote.userId !== $i?.id && $i?.isBot !== true
			? renoteTargetId
			: null;
		globalEvents.emit('noteDeleted', renoteNoteId, null, countedRenoteId, isMyRenote ? 'author' : 'community');
	}

	async function reply() {
		if (props.mock) return;
		const isLoggedIn = await pleaseLogin({ openOnRemote: pleaseLoginContext });
		if (!isLoggedIn) return;
		os.post({
			reply: appearNote,
			channel: appearNote.channel,
		}).then(() => {
			focus();
		});
	}

	// Boostは1ノートにつき1回きり。投稿済みのユーザーには入口自体を出さない
	const canBoost = computed(() => $i != null && $reactionNote.myReaction == null);

	const boostOpen = ref(false);
	let boostDispose: (() => void) | null = null;
	let boostHoverTimer: number | null = null;
	let openingBoost = false;

	function cancelHoverReact() {
		if (boostHoverTimer != null) window.clearTimeout(boostHoverTimer);
		boostHoverTimer = null;
	}

	function hoverReact(event: PointerEvent) {
		if (event.pointerType !== 'mouse' || !$i || boostOpen.value || canBoost.value === false) return;
		cancelHoverReact();
		boostHoverTimer = window.setTimeout(() => { void react(undefined, true); }, 250);
	}

	async function react(createReactionMock?: (reaction: string) => void, fromHover = false) {
		cancelHoverReact();
		if (appearNote.isDeleted) return;
		// Boostは1ノートにつき1回だけ。投稿済みなら書き直しも取り消しもできない
		if (canBoost.value === false) return;
		if (boostOpen.value) {
			return;
		}
		if (openingBoost) return;
		openingBoost = true;
		try {
			if (!props.mock && !await pleaseLogin({ openOnRemote: pleaseLoginContext })) return;
			if (!fromHover) showMovedDialog();
			boostOpen.value = true;
			const { dispose } = os.popup(MkBoostComposer, {
				note: reactionNote,
				anchorElement: els.reactButton?.value,
				focusRequested: !fromHover,
				mock: props.mock,
			}, {
				changed: reaction => {
					if (props.mock && createReactionMock) createReactionMock(reaction ?? $reactionNote.myReaction ?? '');
				},
				closed: () => {
					boostOpen.value = false;
					boostDispose = null;
					dispose();
				},
			});
			boostDispose = dispose;
		} finally {
			openingBoost = false;
		}
	}

	onUnmounted(() => {
		cancelHoverReact();
		boostDispose?.();
	});

	async function reactViaMfmEmoji(reaction: string) {
		if (props.mock) return;
		const isLoggedIn = await pleaseLogin({ openOnRemote: pleaseLoginContext });
		if (!isLoggedIn) return;
		showMovedDialog();
		sound.playMisskeySfx('reaction');
		misskeyApi('notes/reactions/create', {
			noteId: reactionNote.id,
			reaction: reaction,
		}).then(() => {
			noteEvents.emit(`reacted:${reactionNote.id}`, {
				userId: $i!.id,
				reaction: reaction,
			});
		});
	}

	function toggleReact(customMockCallback?: (reaction: string) => void) {
		void react(customMockCallback);
	}

	function onContextmenu(ev: PointerEvent): void {
		if (props.mock) return;
		if (ev.target && isLink(ev.target as HTMLElement)) return;
		if (window.getSelection()?.toString() !== '') return;

		if (prefer.s.useReactionPickerForContextMenu) {
			ev.preventDefault();
			react();
		} else {
			const { menu, cleanup } = getNoteMenu({
				note: isRenote ? { ...rawNote, renote: appearNote } : appearNote,
				translating,
				translation,
				currentClip: currentClip?.value,
				currentAntenna: currentAntenna?.value ?? undefined,
			});
			os.contextMenu(menu, ev).then(focus).finally(cleanup);
		}
	}

	function showMenu(): void {
		if (props.mock || els.menuButton == null) return;
		const { menu, cleanup } = getNoteMenu({
			note: isRenote ? { ...rawNote, renote: appearNote } : appearNote,
			translating,
			translation,
			currentClip: currentClip?.value,
			currentAntenna: currentAntenna?.value ?? undefined,
		});
		os.popupMenu(menu, els.menuButton.value).then(focus).finally(cleanup);
	}

	async function clip(): Promise<void> {
		if (props.mock) return;
		os.popupMenu(await getNoteClipMenu({
			note: rawNote,
			currentClip: currentClip?.value,
		}), els.clipButton?.value).then(focus);
	}

	async function share(): Promise<void> {
		if (props.mock) return;
		if (!isSupportShare()) {
			copyToClipboard(`${url}/notes/${appearNote.id}`);
			return;
		}
		try {
			await navigator.share({
				title: i18n.tsx.noteOf({ user: appearNote.user.name ?? appearNote.user.username }),
				text: appearNote.text ?? '',
				url: `${url}/notes/${appearNote.id}`,
			});
		} catch (err) {
			if (err instanceof Error && err.name === 'AbortError') return;
			os.alert({ type: 'error', text: err instanceof Error ? err.message : String(err) });
		}
	}

	async function toggleFavorite(): Promise<void> {
		if (props.mock || favoriting.value || appearNote.isDeleted) return;
		const isLoggedIn = await pleaseLogin({ openOnRemote: pleaseLoginContext });
		if (!isLoggedIn || favoriting.value) return;

		const favorite = !isFavorited.value;
		favoriting.value = true;
		try {
			await os.apiWithDialog(favorite ? 'notes/favorites/create' : 'notes/favorites/delete', {
				noteId: appearNote.id,
			});
			$appearNote.isFavorited = favorite;
			noteEvents.emit(`statsUpdated:${appearNote.id}`);
			if (favorite) claimAchievement('noteFavorited1');
		} finally {
			favoriting.value = false;
		}
	}

	async function showRenoteMenu() {
		if (props.mock || !isRenote) return;
		const isLoggedIn = await pleaseLogin({ openOnRemote: pleaseLoginContext });
		if (!isLoggedIn) return;

		const getUnrenote = (explicitRenoteNoteId: Misskey.entities.Note['id'] | null = null) => ({
			text: i18n.ts.unrenote,
			icon: 'ti ti-trash',
			danger: true,
			action: () => deleteRenote(explicitRenoteNoteId),
		});

		const menuItems: MenuItem[] = [{
			type: 'link',
			text: i18n.ts.renoteDetails,
			icon: 'ti ti-info-circle',
			to: notePage(rawNote),
		}];

		if (props.note.channelId != null && (inChannel == null || props.note.channelId !== inChannel.value)) {
			menuItems.push({
				type: 'link',
				text: i18n.ts.viewRenotedChannel,
				icon: 'ti ti-device-tv',
				to: `/channels/${props.note.channelId}`,
			});
		}

		menuItems.push(getCopyNoteLinkMenu(rawNote, i18n.ts.copyLinkRenote));
		menuItems.push({ type: 'divider' });

		if (isMyRenote) {
			menuItems.push(getUnrenote());
			os.popupMenu(menuItems, els.renoteButton?.value);
		} else {
			menuItems.push(getAbuseNoteMenu(rawNote, i18n.ts.reportAbuseRenote));
			if ($i?.isModerator || $i?.isAdmin) {
				menuItems.push(getUnrenote(rawNote.id));
			}

			os.popupMenu(menuItems, els.renoteButton?.value);
		}
	}

	// フォーカス制御
	function focus() { els.rootEl?.value?.focus(); }

	function blur() { els.rootEl?.value?.blur(); }

	return {
		// 状態・データ
		note: rawNote,
		appearNote,
		$appearNote,
		reactionNote,
		$reactionNote,
		liking,
		toggleLike,
		hideByPlugin,
		isRenote,
		showContent,
		isDeleted,
		deletedBy,
		translating,
		translation,
		muted,
		hardMuted,
		collapsed,
		renoteCollapsed,
		isFavorited,
		favoriting,

		// 導出値
		isMyRenote,
		isRenotedByMe,
		isRenoteTargetDeleted,
		renoteTargetDeletedBy,
		displayedRenoteCount,
		parsed,
		urls,
		isLong,
		showTicker,
		canRenote,
		canBoost,

		// アクション関数
		renote,
		toggleRenote,
		deleteRenote,
		reply,
		react,
		reactViaMfmEmoji,
		toggleReact,
		boostOpen,
		hoverReact,
		cancelHoverReact,
		onContextmenu,
		showMenu,
		clip,
		share,
		toggleFavorite,
		showRenoteMenu,
		focus,
		blur,
	};
}
