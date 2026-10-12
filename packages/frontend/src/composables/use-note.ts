/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, nextTick, ref } from 'vue';
import type { Ref } from 'vue';
import * as mfm from 'mfm-js';
import * as Misskey from 'misskey-js';
import { isLink } from '@@/js/is-link.js';
import { host } from '@@/js/config.js';
import { pleaseLogin } from '@/utility/please-login.js';
import type { OpenOnRemoteOptions } from '@/utility/please-login.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { checkWordMute } from '@/utility/check-word-mute.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import * as sound from '@/utility/sound.js';
import * as os from '@/os.js';
import { extractUrlFromMfm } from '@/utility/extract-url-from-mfm.js';
import { getNoteClipMenu, getNoteMenu, getRenoteMenu, getAbuseNoteMenu, getCopyNoteLinkMenu } from '@/utility/get-note-menu.js';
import { getMyRenoteId, noteEvents, unregisterMyRenote, useNoteCapture, useNoteCaptureVisibility } from '@/composables/use-note-capture.js';
import { deepClone } from '@/utility/clone.js';
import { claimAchievement } from '@/utility/achievements.js';
import { showMovedDialog } from '@/utility/show-moved-dialog.js';
import { getAppearNote } from '@/utility/get-appear-note.js';
import { prefer } from '@/preferences.js';
import { getPluginHandlers } from '@/plugin.js';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import { globalEvents, useGlobalEvent } from '@/events.js';
import { reactionPicker } from '@/utility/reaction-picker.js';
import { notePage } from '@@/js/note.js';
import type { DI as DIType } from '@/di.js';
import type { ExtractInjectedType } from '@/types/misc.js';
import type { MenuItem } from '@/types/menu.js';
import type { WordMuteResult } from '@/utility/check-word-mute.js';
import { useNoteContent } from '@/composables/use-note-content.js';
import { useLike } from '@/composables/use-like.js';
import { useNoteViews } from '@/composables/use-note-views.js';
import { shareNote } from '@/utility/share-note.js';
import { getMyReactions, isEmojiReaction, normalizeReaction, REACTION_KIND_LIMIT } from '@/utility/normalize-reaction.js';
import { playReactionEffect } from '@/utility/reaction-effect.js';

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
	menuContext?: 'list' | 'detail';
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
	const reactionNote = appearNote;
	const renoteTargetId = isRenote ? rawNote.renoteId : appearNote.id;

	// キャプチャ（ストリーム購読）
	const noteCaptureActive = useNoteCaptureVisibility(els.rootEl);
	const appearNoteCapture = useNoteCapture({
		note: appearNote,
		parentNote: rawNote,
		mock: props.mock,
		active: noteCaptureActive,
	});
	const { $note: $appearNote, subscribe: subscribeManuallyToNoteCapture } = appearNoteCapture;
	const $reactionNote = $appearNote;
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
	const canRenote = ['public', 'home'].includes(appearNote.visibility) || (appearNote.visibility === 'followers' && appearNote.userId === $i?.id);
	const showTicker = (prefer.s.instanceTicker === 'always') || (prefer.s.instanceTicker === 'remote' && appearNote.user.instance);
	const renoteCollapsed = ref(prefer.s.collapseRenotes && isRenote && (($i && ($i.id === rawNote.userId || $i.id === appearNote.userId)) || (getMyReactions($reactionNote).length > 0)));
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

	const pendingReactions = new Set<string>();

	async function createReaction(reaction: string, createReactionMock?: (reaction: string) => void) {
		const normalized = normalizeReaction(reaction);
		if ($i == null || pendingReactions.has(normalized) || getMyReactions($reactionNote).includes(normalized)) return;
		const kinds = new Set(Object.entries($reactionNote.reactions)
			.filter(([key, count]) => count > 0 && isEmojiReaction(key)).map(([key]) => normalizeReaction(key)));
		if (!kinds.has(normalized) && kinds.size >= REACTION_KIND_LIMIT) {
			os.toast(i18n.ts._chat.reactionLimit, 'warning');
			return;
		}
		pendingReactions.add(normalized);
		let acceptedReaction = reaction;
		try {
			if (appearNote.reactionAcceptance !== 'likeOnly' && prefer.s.confirmOnReact) {
				const { canceled } = await os.confirm({ type: 'question', text: i18n.tsx.reactAreYouSure({ emoji: reaction.replace('@.', '') }) });
				if (canceled) return;
			}
			if (props.mock) {
				createReactionMock?.(normalized);
			} else {
				const result = await misskeyApi('notes/reactions/create', { noteId: reactionNote.id, reaction });
				acceptedReaction = result.reaction;
				noteEvents.emit(`reacted:${reactionNote.id}`, { userId: $i.id, reaction: acceptedReaction });
			}
			sound.playMisskeySfx('reaction');
			await nextTick();
			const target = els.rootEl?.value?.querySelector<HTMLButtonElement>(`[data-reaction="${CSS.escape(normalizeReaction(acceptedReaction))}"]`);
			playReactionEffect(acceptedReaction, target);
			if (appearNote.text && appearNote.text.length > 100 && (Date.now() - new Date(appearNote.createdAt).getTime() < 1000 * 3)) {
				claimAchievement('reactWithoutRead');
			}
		} catch {
			os.toast(i18n.ts.somethingHappened, 'error');
		} finally {
			pendingReactions.delete(normalized);
		}
	}

	async function react(createReactionMock?: (reaction: string) => void, anchorElement: HTMLElement | null = els.reactButton?.value ?? null) {
		const isLoggedIn = await pleaseLogin({ openOnRemote: pleaseLoginContext });
		if (!isLoggedIn) return;
		showMovedDialog();
		if (appearNote.reactionAcceptance === 'likeOnly') {
			await createReaction('❤️', createReactionMock);
		} else {
			blur();
			const anchor = anchorElement?.isConnected ? anchorElement : els.reactButton?.value ?? null;
			reactionPicker.show(anchor, rawNote, reaction => createReaction(reaction, createReactionMock), () => {
				(anchor?.isConnected ? anchor : els.reactButton?.value ?? els.rootEl?.value)?.focus({ preventScroll: true });
			});
		}
	}

	async function reactViaMfmEmoji(reaction: string) {
		if (props.mock) return;
		const isLoggedIn = await pleaseLogin({ openOnRemote: pleaseLoginContext });
		if (!isLoggedIn) return;
		showMovedDialog();
		await createReaction(reaction);
	}

	async function undoReact(reaction: string): Promise<void> {
		if (props.mock || $i == null || pendingReactions.has(reaction)) return;
		pendingReactions.add(reaction);
		try {
			await misskeyApi('notes/reactions/delete', { noteId: appearNote.id, reaction });
			noteEvents.emit(`unreacted:${appearNote.id}`, { userId: $i.id, reaction });
		} catch {
			os.toast(i18n.ts.somethingHappened, 'error');
		} finally {
			pendingReactions.delete(reaction);
		}
	}

	function toggleReact(customMockCallback?: (reaction: string) => void, anchorElement?: HTMLElement | null) {
		const heart = getMyReactions($reactionNote).find(reaction => reaction === normalizeReaction('❤️'));
		if (appearNote.reactionAcceptance === 'likeOnly' && heart) {
			if (props.mock && customMockCallback) customMockCallback(heart);
			else void undoReact(heart);
		} else {
			void react(customMockCallback, anchorElement);
		}
	}

	function onContextmenu(ev: PointerEvent): void {
		if (props.mock) return;
		if (ev.target && isLink(ev.target as HTMLElement)) {
			// os.contextMenu はネイティブメニュー設定時に no-op するため、その場合は preventDefault せずブラウザーに任せる
			const useAppMenu = prefer.s.contextMenu === 'app' || (prefer.s.contextMenu === 'appWithShift' && ev.shiftKey);
			if (!useAppMenu) return;
			if (window.getSelection()?.toString() !== '') return;
			const anchor = (ev.target as HTMLElement).closest?.('a');
			if (anchor == null || !anchor.hasAttribute('href')) return;
			ev.preventDefault();
			os.contextMenu([{
				type: 'label',
				text: anchor.href,
			}, {
				icon: 'ti ti-external-link',
				text: i18n.ts.openInNewTab,
				action: () => {
					window.open(anchor.href, '_blank', 'noopener');
				},
			}, {
				icon: 'ti ti-link',
				text: i18n.ts.copyLink,
				action: () => {
					copyToClipboard(anchor.href);
				},
			}], ev).then(focus);
			return;
		}
		if (window.getSelection()?.toString() !== '') return;

		if (prefer.s.useReactionPickerForContextMenu) {
			ev.preventDefault();
			react();
		} else {
			const { menu, cleanup } = getNoteMenu({
				note: isRenote ? { ...rawNote, renote: appearNote } : appearNote,
				menuContext: options.menuContext,
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
			menuContext: options.menuContext,
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

	function share(): void {
		if (props.mock) return;
		shareNote(appearNote);
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
		showTicker,
		canRenote,

		// アクション関数
		renote,
		toggleRenote,
		deleteRenote,
		reply,
		react,
		reactViaMfmEmoji,
		toggleReact,
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
