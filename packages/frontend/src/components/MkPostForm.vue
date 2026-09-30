<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div
	:class="[$style.root, { [$style.rootMaximized]: maximized, [$style.withInitialRows]: initialRows != null }]"
	:style="initialRows != null ? { '--MI-postForm-initialRows': initialRows } : undefined"
	@dragover.stop="onDragover"
	@dragenter="onDragenter"
	@dragleave="onDragleave"
	@drop.stop="onDrop"
>
	<header :class="$style.header">
		<div :class="$style.headerLeft">
			<button v-if="!fixed" v-tooltip="i18n.ts.cancel" :class="$style.cancel" class="_button" :aria-label="i18n.ts.cancel" @click="cancel"><i class="ti ti-x"></i></button>
			<button ref="accountMenuEl" v-click-anime v-tooltip="userName(postAccount ?? $i)" class="_button" :aria-label="i18n.ts.account" :disabled="isEditing" @click="openAccountMenu">
				<img :class="$style.avatar" :src="getUserAvatar(postAccount ?? $i).avatarUrl" alt="" style="border-radius: 100%;"/>
			</button>
		</div>
		<div :class="$style.headerRight">
			<template v-if="!(props.channel != null && fixed)">
				<button v-if="targetChannel == null || canChooseChannel" ref="visibilityButton" :class="['_button', $style.headerRightItem, $style.visibility]" :aria-label="visibilityLabel" :disabled="isEditing || targetChannel != null" @click="setVisibility">
					<span v-tooltip="visibilityLabel" :class="$style.visibilityIcon">
						<i v-if="visibility === 'public'" class="ti ti-world"></i>
						<i v-if="visibility === 'home'" class="ti ti-home"></i>
						<i v-if="visibility === 'followers'" class="ti ti-lock"></i>
						<i v-if="visibility === 'specified'" class="ti ti-mail"></i>
					</span>
					<span :class="$style.headerRightButtonText">{{ i18n.ts._visibility[visibility] }}</span>
				</button>
				<button v-else class="_button" :class="[$style.headerRightItem, $style.visibility]" :aria-label="targetChannel.name" disabled>
					<span v-tooltip="targetChannel.name" :class="$style.visibilityIcon"><i class="ti ti-device-tv"></i></span>
					<span :class="$style.headerRightButtonText">{{ targetChannel.name }}</span>
				</button>
			</template>
			<button v-if="visibility !== 'specified'" v-tooltip="i18n.ts._visibility.disableFederation" class="_button" :class="[$style.headerRightItem, { [$style.danger]: localOnly }]" :aria-label="i18n.ts._visibility.disableFederation" :aria-pressed="localOnly" :disabled="isEditing || targetChannel != null" @click="toggleLocalOnly">
				<span v-if="!localOnly"><i class="ti ti-rocket"></i></span>
				<span v-else><i class="ti ti-rocket-off"></i></span>
			</button>
			<button v-if="canMaximize" v-tooltip="maximizeTitle" :aria-label="maximizeTitle" :aria-pressed="maximized" class="_button" :class="$style.headerRightItem" @click="toggleMaximize">
				<i v-if="maximized" class="ti ti-arrows-minimize"></i>
				<i v-else class="ti ti-arrows-maximize"></i>
			</button>
			<button ref="otherSettingsButton" v-tooltip="i18n.ts.other" class="_button" :class="$style.headerRightItem" :aria-label="i18n.ts.other" :disabled="posting || posted" @click="showOtherSettings"><i class="ti ti-dots"></i></button>
			<button ref="submitButtonEl" v-click-anime class="_button" :class="$style.submit" :disabled="!canPost" data-testid="post-form-submit" @click="post">
				<div :class="$style.submitInner">
					<template v-if="posted"></template>
					<template v-else-if="posting"><MkEllipsis/></template>
					<template v-else>{{ submitText }}</template>
					<i style="margin-left: 6px;" :class="submitIcon"></i>
				</div>
			</button>
		</div>
	</header>
	<MkNoteSimple v-if="replyTargetNote" :class="$style.targetNote" :note="replyTargetNote" compact/>
	<div v-if="replyTargetNote" :class="$style.replyPublishing">
		<input v-model="onlyDiscussUnderPost" type="checkbox" :class="$style.replyPublishingCheckbox" :aria-label="i18n.ts._postForm.onlyDiscussUnderPost" :disabled="isEditing || posting || posted" data-testid="post-form-publish-reply">
		<span>{{ i18n.ts._postForm.onlyDiscussUnderPost }}</span>
		<button v-tooltip:dialog="i18n.ts._postForm.onlyDiscussUnderPostDescription" type="button" class="_button" :class="$style.replyPublishingInfo" :aria-label="i18n.ts.info"><i class="ti ti-info-circle"></i></button>
	</div>
	<MkNoteSimple v-if="renoteTargetNote && renoteTargetNote.id !== replyTargetNote?.id" :class="$style.targetNote" :note="renoteTargetNote" compact/>
	<div v-if="quoteId" :class="$style.withQuote"><i class="ti ti-quote"></i> {{ i18n.ts.quoteAttached }}<button v-if="!isEditing" v-tooltip="i18n.ts.remove" :aria-label="i18n.ts.remove" @click="quoteId = null; renoteTargetNote = null;"><i class="ti ti-x"></i></button></div>
	<div v-if="visibility === 'specified'" :class="$style.toSpecified">
		<span style="margin-right: 8px;">{{ i18n.ts._postForm.visibleUsers }}</span>
		<div :class="$style.visibleUsers">
			<span v-for="u in visibleUsers" :key="u.id" :class="$style.visibleUser">
				<MkAcct :user="u"/>
				<button v-if="!isEditing" v-tooltip="i18n.ts.remove" class="_button" :aria-label="i18n.ts.remove" style="padding: 4px 8px;" @click="removeVisibleUser(u.id)"><i class="ti ti-x"></i></button>
			</span>
			<button v-if="!isEditing" v-tooltip="i18n.ts.add" class="_buttonPrimary" :aria-label="i18n.ts.add" style="padding: 4px; border-radius: 8px;" @click="addVisibleUser"><i class="ti ti-plus ti-fw"></i></button>
		</div>
	</div>
	<MkInfo v-if="!store.r.tips.value.postForm" :class="$style.showHowToUse" closable @close="closeTip('postForm')">
		<button class="_textButton" @click="showTour">{{ i18n.ts._postForm.showHowToUse }}</button>
	</MkInfo>
	<MkInfo v-if="scheduledAt != null" :class="$style.scheduledAt">
		<I18n :src="i18n.ts.scheduleToPostOnX" tag="span">
			<template #x>
				<MkTime :time="scheduledAt" :mode="'detail'" style="font-weight: bold;"/>
			</template>
		</I18n> - <button class="_textButton" @click="cancelSchedule()">{{ i18n.ts.cancel }}</button>
	</MkInfo>
	<MkInfo v-if="hasNotSpecifiedMentions" warn :class="$style.hasNotSpecifiedMentions">{{ i18n.ts.notSpecifiedMentionWarning }}<template v-if="!isEditing"> - <button class="_textButton" @click="addMissingMention()">{{ i18n.ts.add }}</button></template></MkInfo>
	<div v-show="useCw" :class="$style.cwOuter">
		<div :class="$style.cwHeader">
			<label :for="cwInputId" :class="$style.cwLabel"><i class="ti ti-eye-off" aria-hidden="true"></i>{{ i18n.ts._postForm.cwTitle }}</label>
			<span :id="cwHintId" :class="$style.cwHint">{{ i18n.ts._postForm.cwHint }}</span>
			<button type="button" class="_button" :class="$style.cwRemove" :disabled="posting || posted" :aria-label="i18n.ts._postForm.cwRemove" :title="i18n.ts._postForm.cwRemove" @click="toggleCw"><i class="ti ti-x" aria-hidden="true"></i></button>
		</div>
		<div :class="$style.cwInputWrap">
			<input :id="cwInputId" ref="cwInputEl" v-model="cw" class="_mfm" :class="$style.cw" :disabled="posting || posted" :placeholder="i18n.ts._postForm.cwSummary" :aria-label="i18n.ts._postForm.cwSummary" :aria-describedby="cwHintId" :aria-required="useCw" @keydown="onKeydown" @keyup="onKeyup" @compositionend="onCompositionEnd">
			<MkEmojiInputOverlay :inputElement="cwInputEl" :text="cw"/>
			<div v-if="maxCwTextLength - cwTextLength < 20" :class="['_acrylic', $style.cwTextCount, { [$style.cwTextOver]: cwTextLength > maxCwTextLength }]">{{ maxCwTextLength - cwTextLength }}</div>
		</div>
	</div>
	<div :class="[$style.textOuter, { [$style.withCw]: useCw }]">
		<div v-if="targetChannel && !canChooseChannel" :class="$style.colorBar" :style="{ '--MI-channelColor': channelColor(targetChannel.color) }"></div>
		<div v-if="useCw" :class="$style.hiddenBodyLabel"><i class="ti ti-align-left" aria-hidden="true"></i>{{ i18n.ts._postForm.cwBody }}</div>
		<textarea ref="textareaEl" v-model="text" class="_mfm" :class="[$style.text]" :rows="initialRows" :disabled="posting || posted" :readonly="textAreaReadOnly" :placeholder="placeholder" :aria-label="i18n.ts.text" data-testid="post-form-text" @keydown="onKeydown" @keyup="onKeyup" @paste="onPaste" @compositionupdate="onCompositionUpdate" @compositionend="onCompositionEnd"></textarea>
		<MkEmojiInputOverlay :inputElement="textareaEl" :text="text"/>
		<div v-if="maxTextLength - textLength < 100" :class="['_acrylic', $style.textCount, { [$style.textOver]: textLength > maxTextLength }]">{{ maxTextLength - textLength }}</div>
		<div v-if="canChooseChannel || targetChannel" :class="$style.channelRow">
			<button v-if="canChooseChannel" ref="channelButtonEl" type="button" class="_button" :class="$style.channelChip" :disabled="posting || posted" :aria-label="targetChannel ? `${i18n.ts.selectChannel}: ${targetChannel.name}` : i18n.ts.selectChannel" aria-haspopup="dialog" :aria-expanded="channelPickerOpen" data-testid="post-form-channel" @click="openChannelPicker">
				<i class="ti ti-device-tv" aria-hidden="true"></i><span :class="$style.channelName">{{ targetChannel?.name ?? i18n.ts.selectChannel }}</span><i class="ti ti-chevron-right" :class="[$style.channelArrow, { [$style.channelArrowOpen]: channelPickerOpen, [$style.channelArrowAnimated]: prefer.s.animation }]" aria-hidden="true"></i>
			</button>
			<span v-else :class="$style.channelChip" :title="i18n.ts._channelPicker.description"><i class="ti ti-device-tv" aria-hidden="true"></i><span :class="$style.channelName">{{ targetChannel?.name }}</span></span>
		</div>
	</div>
	<MkPostFormTopics ref="topicsEl" v-model="hashtags" v-model:enabled="withHashtags" :disabled="posting || posted" @openChange="topicsOpen = $event" @empty="focusTopics"/>
	<XPostFormAttaches v-model="files" :editing="isEditing" :disabled="posting || posted" @detach="detachFile" @changeSensitive="updateFileSensitive" @changeName="updateFileName"/>
	<div v-if="uploader.items.value.length > 0" style="padding: 12px;">
		<MkTip k="postFormUploader">
			{{ i18n.ts._postForm.uploaderTip }}
		</MkTip>
		<MkUploaderItems :items="uploader.items.value" @showMenu="(item, ev) => showPerUploadItemMenu(item, ev)" @showMenuViaContextmenu="(item, ev) => showPerUploadItemMenuViaContextmenu(item, ev)"/>
	</div>
	<MkPoll v-if="editingNote?.poll" :class="$style.existingPoll" :noteId="editingNote.id" :multiple="editingNote.poll.multiple" :expiresAt="editingNote.poll.expiresAt" :choices="editingNote.poll.choices" :author="editingNote.user" :emojiUrls="editingNote.emojis" readOnly/>
	<MkPollEditor v-else-if="poll" v-model="poll" @destroyed="poll = null"/>
	<MkNotePreview v-if="showPreview" :class="$style.preview" :text="getPostText() ?? ''" :files="files" :poll="poll ?? undefined" :useCw="useCw" :cw="cw" :user="postAccount ?? $i"/>
	<div v-if="showingOptions" style="padding: 8px 16px;">
	</div>
	<footer ref="footerEl" :class="$style.footer">
		<div :class="$style.footerLeft">
			<button v-tooltip="i18n.ts.attachFile + ' (' + i18n.ts.upload + ')'" class="_button" :class="$style.footerButton" :aria-label="i18n.ts.attachFile + ' (' + i18n.ts.upload + ')'" :disabled="posting || posted" @click="chooseFileFromPc"><i class="ti ti-photo-plus"></i></button>
			<button v-tooltip="i18n.ts.attachFile + ' (' + i18n.ts.fromDrive + ')'" class="_button" :class="$style.footerButton" :aria-label="i18n.ts.attachFile + ' (' + i18n.ts.fromDrive + ')'" :disabled="posting || posted" @click="chooseFileFromDrive"><i class="ti ti-cloud-download"></i></button>
			<button v-tooltip="i18n.ts.poll" class="_button" :class="[$style.footerButton, { [$style.footerButtonActive]: poll }]" :aria-label="i18n.ts.poll" :aria-pressed="poll != null" :disabled="isEditing" @click="togglePoll"><i class="ti ti-chart-arrows"></i></button>
			<button v-tooltip="i18n.ts.useCw" class="_button" :class="[$style.footerButton, { [$style.footerButtonActive]: useCw }]" :aria-label="i18n.ts.useCw" :aria-pressed="useCw" :disabled="posting || posted" @click="toggleCw"><i class="ti ti-eye-off"></i></button>
			<button ref="topicsButtonEl" v-tooltip="i18n.ts.hashtags" class="_button" :class="[$style.footerButton, { [$style.footerButtonActive]: withHashtags && hashtags.trim() !== '' }]" :aria-label="i18n.ts.hashtags" aria-haspopup="dialog" :aria-expanded="topicsOpen" :disabled="posting || posted" @click="openTopics"><i class="ti ti-hash"></i></button>
			<button v-tooltip="i18n.ts.mention" class="_button" :class="$style.footerButton" :aria-label="i18n.ts.mention" :disabled="posting || posted" @click="insertMention"><i class="ti ti-at"></i></button>
			<button v-if="showAddMfmFunction" v-tooltip="i18n.ts.addMfmFunction" :class="['_button', $style.footerButton]" :aria-label="i18n.ts.addMfmFunction" :disabled="posting || posted" @click="insertMfmFunction"><i class="ti ti-palette"></i></button>
			<button v-if="postFormActions.length > 0" v-tooltip="i18n.ts.plugins" class="_button" :class="$style.footerButton" :aria-label="i18n.ts.plugins" :disabled="posting || posted" @click="showActions"><i class="ti ti-plug"></i></button>
		</div>
		<div :class="$style.footerRight">
			<button v-tooltip="i18n.ts.emoji" :class="['_button', $style.footerButton]" :aria-label="i18n.ts.emoji" :disabled="posting || posted" @click="insertEmoji"><i class="ti ti-mood-happy"></i></button>
		</div>
	</footer>
</div>
</template>

<script lang="ts" setup>
import { channelColor } from '@/utility/channel-color.js';
import { watch, nextTick, onMounted, defineAsyncComponent, provide, shallowRef, ref, computed, useId, useTemplateRef, onUnmounted, onBeforeUnmount } from 'vue';
import * as mfm from 'mfm-js';
import * as Misskey from 'misskey-js';
import insertTextAtCursor from 'insert-text-at-cursor';
import { toASCII } from 'punycode.js';
import { host, url } from '@@/js/config.js';
import MkUploaderItems from './MkUploaderItems.vue';
import type { ShallowRef } from 'vue';
import type { PostFormProps } from '@/types/post-form.js';
import type { MenuItem } from '@/types/menu.js';
import type { PollEditorModelValue } from '@/components/MkPollEditor.vue';
import type { UploaderItem } from '@/composables/use-uploader.js';
import MkNotePreview from '@/components/MkNotePreview.vue';
import MkEmojiInputOverlay from '@/components/MkEmojiInputOverlay.vue';
import MkPostFormTopics from '@/components/MkPostFormTopics.vue';
import XPostFormAttaches from '@/components/MkPostFormAttaches.vue';
import XTextCounter from '@/components/MkPostForm.TextCounter.vue';
import MkPollEditor from '@/components/MkPollEditor.vue';
import MkPoll from '@/components/MkPoll.vue';
import MkNoteSimple from '@/components/MkNoteSimple.vue';
import { erase, unique } from '@/utility/array.js';
import { extractMentions } from '@/utility/extract-mentions.js';
import { formatTimeString } from '@/utility/format-time-string.js';
import { Autocomplete } from '@/utility/autocomplete.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { chooseDriveFile } from '@/utility/drive.js';
import { store } from '@/store.js';
import MkInfo from '@/components/MkInfo.vue';
import { i18n } from '@/i18n.js';
import { userName } from '@/filters/user.js';
import { instance } from '@/instance.js';
import { ensureSignin, notesCount, incNotesCount } from '@/i.js';
import { getAccounts, getAccountMenu } from '@/accounts.js';
import { deepClone } from '@/utility/clone.js';
import MkRippleEffect from '@/components/MkRippleEffect.vue';
import { miLocalStorage } from '@/local-storage.js';
import { claimAchievement } from '@/utility/achievements.js';
import { emojiPicker } from '@/utility/emoji-picker.js';
import { mfmFunctionPicker } from '@/utility/mfm-function-picker.js';
import { prefer } from '@/preferences.js';
import { getPluginHandlers } from '@/plugin.js';
import { DI } from '@/di.js';
import { globalEvents } from '@/events.js';
import { checkDragDataType, getDragData } from '@/drag-and-drop.js';
import { useUploader } from '@/composables/use-uploader.js';
import { startTour } from '@/utility/tour.js';
import { closeTip } from '@/tips.js';
import { getNoteTopics } from '@/utility/note-topics.js';
import { MAX_TOPICS, parseTopics, uniqueTopics } from '@/utility/topic-picker.js';
import { getUserAvatar } from '@/utility/get-user-avatar.js';

const $i = ensureSignin();

const props = withDefaults(defineProps<PostFormProps & {
	fixed?: boolean;
	autofocus?: boolean;
	freezeAfterPosted?: boolean;
	mock?: boolean;
	canMaximize?: boolean;
}>(), {
	initialVisibleUsers: () => [],
	autofocus: false,
	mock: false,
	initialLocalOnly: undefined,
});

// 最大化后要撑满窗口，必须由外层对话框放开宽高限制，所以状态跟父组件共享
const maximized = defineModel<boolean>('maximized', { default: false });
const initialRows = computed(() => Number.isInteger(props.initialRows) && props.initialRows! > 0 ? props.initialRows : undefined);

provide(DI.mock, props.mock);

const emit = defineEmits<{
	(ev: 'posted'): void;
	(ev: 'cancel'): void;
	(ev: 'esc'): void;

	// Mock用
	(ev: 'fileChangeSensitive', fileId: string, to: boolean): void;
}>();

const textareaEl = useTemplateRef('textareaEl');
const cwInputEl = useTemplateRef('cwInputEl');
const topicsEl = useTemplateRef('topicsEl');
const topicsButtonEl = useTemplateRef('topicsButtonEl');
const topicsOpen = ref(false);
const channelButtonEl = useTemplateRef('channelButtonEl');
const channelPickerOpen = ref(false);
let disposeChannelPicker: (() => void) | undefined;
const cwInputId = useId();
const cwHintId = useId();
const visibilityButton = useTemplateRef('visibilityButton');
const otherSettingsButton = useTemplateRef('otherSettingsButton');
const accountMenuEl = useTemplateRef('accountMenuEl');
const footerEl = useTemplateRef('footerEl');
const submitButtonEl = useTemplateRef('submitButtonEl');

const posting = ref(false);
const posted = ref(false);
const editingNote = props.editingNote ? deepClone(props.editingNote) : undefined;
const isEditing = editingNote != null;
const editingTopics = editingNote ? getNoteTopics(editingNote) : null;
const editingText = editingTopics?.tags.length ? mfm.toString(editingTopics.nodes ?? []) : editingNote?.text ?? '';
const editingHashtags = editingTopics?.tags.map(tag => `#${tag}`).join(' ') ?? '';
const editSource = editingNote ? {
	text: editingNote.text ?? null,
	cw: editingNote.cw ?? null,
	fileIds: [...(editingNote.fileIds ?? editingNote.files?.map(file => file.id) ?? [])],
	reactionAcceptance: editingNote.reactionAcceptance ?? null,
} : undefined;
const text = ref(props.initialText ?? '');
const files = ref(props.initialFiles ?? []);
const poll = ref<PollEditorModelValue | null>(null);
const useCw = ref<boolean>(!!props.initialCw);
const showPreview = ref(false);
const showAddMfmFunction = ref(prefer.s.enableQuickAddMfmFunction);
watch(showAddMfmFunction, () => prefer.commit('enableQuickAddMfmFunction', showAddMfmFunction.value));
const cw = ref<string | null>(props.initialCw ?? null);
const localOnly = ref(props.initialLocalOnly ?? (prefer.s.rememberNoteVisibility ? store.s.localOnly : prefer.s.defaultNoteLocalOnly));
const visibility = ref(props.initialVisibility ?? (prefer.s.rememberNoteVisibility ? store.s.visibility : prefer.s.defaultNoteVisibility));
const visibilityLabel = computed(() => `${i18n.ts.visibility}: ${i18n.ts._visibility[visibility.value]}`);
const visibleUsers = ref<Misskey.entities.UserDetailed[]>([]);
if (props.initialVisibleUsers) {
	props.initialVisibleUsers.forEach(u => pushVisibleUser(u));
}
const reactionAcceptance = ref(store.s.reactionAcceptance);
const scheduledAt = ref<number | null>(null);
const draghover = ref(false);
const quoteId = ref<string | null>(null);
const hasNotSpecifiedMentions = ref(false);
const imeText = ref('');
const showingOptions = ref(false);
const textAreaReadOnly = ref(false);
const justEndedComposition = ref(false);
const renoteTargetNote: ShallowRef<PostFormProps['renote'] | null> = shallowRef(editingNote?.renote ?? props.renote ?? props.initialNote?.renote);
const replyTargetNote: ShallowRef<PostFormProps['reply'] | null> = shallowRef(editingNote?.reply ?? props.reply ?? props.initialNote?.reply);
const targetChannel = shallowRef(editingNote?.channel ?? props.channel ?? replyTargetNote.value?.channel ?? props.initialNote?.channel);
const draftHasReply = ref(false);
const canChooseChannel = computed(() => !isEditing && props.channel == null && props.reply == null && props.renote == null && replyTargetNote.value == null && !draftHasReply.value && props.initialNote?.replyId == null && postRenoteId.value == null);
type ChannelAudience = { visibility: typeof visibility.value; localOnly: boolean; visibleUsers: Misskey.entities.UserDetailed[] };
const initialAudience: ChannelAudience = { visibility: $i.isSilenced && visibility.value === 'public' ? 'home' : visibility.value, localOnly: localOnly.value, visibleUsers: [...visibleUsers.value] };
let audienceBeforeChannel: ChannelAudience | undefined = targetChannel.value ? { ...initialAudience, visibleUsers: [...initialAudience.visibleUsers] } : undefined;
const publishReply = ref(props.initialNote?.replyId != null && props.initialNote.isPublishedReply === true);
// UI 的「仅在正文下讨论」与 publishReply 含义相反
const onlyDiscussUnderPost = computed({
	get: () => !publishReply.value,
	set: (v) => { publishReply.value = !v; },
});
const postRenoteId = computed(() => renoteTargetNote.value?.id ?? quoteId.value ?? undefined);

const serverDraftId = ref<string | null>(null);
const postFormActions = getPluginHandlers('post_form_action');

let textAutocomplete: Autocomplete | null = null;
let cwAutocomplete: Autocomplete | null = null;

const uploader = useUploader({
	multiple: true,
});

onUnmounted(() => {
	uploader.dispose();
});

uploader.events.on('itemUploaded', ctx => {
	files.value.push(ctx.item.uploaded!);
	uploader.removeItem(ctx.item);
});

const draftKey = computed((): string => {
	if (editingNote) return `edit:${editingNote.id}`;
	let key = targetChannel.value ? `channel:${targetChannel.value.id}` : '';

	if (replyTargetNote.value) {
		key += `reply:${replyTargetNote.value.id}`;
	} else if (renoteTargetNote.value) {
		key += `renote:${renoteTargetNote.value.id}`;
	} else {
		key += `note:${$i.id}`;
	}

	return key;
});

function getRandomPlaceholder(): string {
	const xs = [
		i18n.ts._postForm._placeholders.a,
		i18n.ts._postForm._placeholders.b,
		i18n.ts._postForm._placeholders.c,
		i18n.ts._postForm._placeholders.d,
		i18n.ts._postForm._placeholders.e,
		i18n.ts._postForm._placeholders.f,
	];
	return xs[Math.floor(Math.random() * xs.length)];
}

const randomPlaceholder = getRandomPlaceholder();

const placeholder = computed((): string => {
	if (replyTargetNote.value) {
		return i18n.tsx._drafts.replyTo({ user: `@${userName(replyTargetNote.value.user)}` });
	} else if (renoteTargetNote.value) {
		return i18n.ts._postForm.quotePlaceholder;
	} else if (targetChannel.value && !canChooseChannel.value) {
		return i18n.ts._postForm.channelPlaceholder;
	} else {
		return randomPlaceholder;
	}
});

const submitText = computed((): string => {
	if (isEditing) return i18n.ts.save;
	return scheduledAt.value != null
		? i18n.ts.schedule
		: replyTargetNote.value
			? i18n.ts.reply
			: renoteTargetNote.value
				? i18n.ts.quote
				: i18n.ts._postForm.post;
});

const submitIcon = computed((): string => {
	return posted.value ? 'ti ti-check' : isEditing ? 'ti ti-device-floppy' : scheduledAt.value != null ? 'ti ti-calendar-time' : replyTargetNote.value ? 'ti ti-message-circle' : renoteTargetNote.value ? 'ti ti-quote' : 'ti ti-send';
});

const maximizeTitle = computed((): string => {
	return maximized.value ? i18n.ts.windowRestore : i18n.ts.windowMaximize;
});

function toggleMaximize() {
	maximized.value = !maximized.value;
}

const textLength = computed((): number => {
	return ((getPostText() ?? '') + imeText.value).length;
});

const maxTextLength = computed((): number => {
	return instance ? instance.maxNoteTextLength : 1000;
});

const cwTextLength = computed((): number => {
	return cw.value?.length ?? 0;
});

const maxCwTextLength = 100;

const canPost = computed((): boolean => {
	return !props.mock && !posting.value && !posted.value && !uploader.uploading.value && (uploader.items.value.length === 0 || uploader.readyForUpload.value) &&
		(
			1 <= (isEditing ? ((getPostText() ?? '') + imeText.value).trim().length : textLength.value) ||
			1 <= files.value.length ||
			1 <= uploader.items.value.length ||
			poll.value != null ||
			renoteTargetNote.value != null ||
			quoteId.value != null
		) &&
		(textLength.value <= maxTextLength.value) &&
		(!withHashtags.value || parseTopics(hashtags.value).length <= MAX_TOPICS) &&
		(
			useCw.value ?
				(
					cw.value != null && cw.value.trim() !== '' &&
					cwTextLength.value <= maxCwTextLength
				) : true
		) &&
		(files.value.length <= 16) &&
		(!poll.value || poll.value.choices.length >= 2);
});

// cannot save pure renote as draft
const canSaveAsServerDraft = computed((): boolean => {
	return !isEditing && canPost.value && (textLength.value > 0 || files.value.length > 0 || poll.value != null);
});

const hashtags = ref(uniqueTopics(props.initialHashtags ?? []).map(tag => `#${tag}`).join(' '));
const withHashtags = ref(hashtags.value !== '');

async function toggleCw() {
	if (posting.value || posted.value) return;
	useCw.value = !useCw.value;
	await nextTick();
	if (useCw.value) cwInputEl.value?.focus();
	else textareaEl.value?.focus();
}

function openTopics(event: MouseEvent) {
	if (posting.value || posted.value || !(event.currentTarget instanceof HTMLElement)) return;
	topicsEl.value?.open(event.currentTarget);
}

async function focusTopics() {
	await nextTick();
	topicsButtonEl.value?.focus();
}

function closeChannelPicker() {
	disposeChannelPicker?.();
	disposeChannelPicker = undefined;
	channelPickerOpen.value = false;
}

function chooseChannel(channel: Misskey.entities.Channel | null) {
	if (!canChooseChannel.value || posting.value || posted.value || channel?.isArchived) return;
	if (channel) {
		if (!targetChannel.value) audienceBeforeChannel = { visibility: visibility.value, localOnly: localOnly.value, visibleUsers: [...visibleUsers.value] };
		targetChannel.value = channel;
		visibility.value = 'public';
		localOnly.value = true;
		visibleUsers.value = [];
	} else {
		targetChannel.value = null;
		if (audienceBeforeChannel) {
			visibility.value = audienceBeforeChannel.visibility;
			localOnly.value = audienceBeforeChannel.localOnly;
			visibleUsers.value = [...audienceBeforeChannel.visibleUsers];
		}
		audienceBeforeChannel = undefined;
	}
	closeChannelPicker();
	void nextTick(() => textareaEl.value?.focus());
}

function openChannelPicker(event: MouseEvent) {
	if (!canChooseChannel.value || posting.value || posted.value || channelPickerOpen.value || !(event.currentTarget instanceof HTMLElement)) return;
	channelPickerOpen.value = true;
	const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkChannelPicker.vue')), {
		anchorElement: event.currentTarget,
		selectedId: targetChannel.value?.id,
		disabled: computed(() => posting.value || posted.value),
	}, {
		choose: channel => {
			if (channelPickerOpen.value) chooseChannel(channel);
		},
		closed: () => {
			closeChannelPicker();
			void nextTick(() => channelButtonEl.value?.focus());
		},
	});
	disposeChannelPicker = dispose;
}

watch([posting, posted, canChooseChannel], () => {
	if (posting.value || posted.value || !canChooseChannel.value) closeChannelPicker();
});

const hasUnsavedEdit = computed(() => editSource != null && !matchesEditSource({
	text: getPostText(),
	cw: useCw.value ? cw.value ?? '' : null,
	fileIds: files.value.map(file => file.id),
	reactionAcceptance: reactionAcceptance.value,
}));

function matchesEditSource(source: typeof editSource): boolean {
	return source != null && editSource != null &&
		source.text === editSource.text && source.cw === editSource.cw &&
		source.reactionAcceptance === editSource.reactionAcceptance &&
		source.fileIds.length === editSource.fileIds.length &&
		source.fileIds.every((id, index) => id === editSource.fileIds[index]);
}

function getPostText(): string | null {
	// 拆分话题展示时保留未修改的原文。
	if (editingNote && text.value === editingText && (withHashtags.value ? hashtags.value : '') === editingHashtags &&
		(useCw.value ? cw.value : null) === (editingNote.cw ?? null)) {
		return editingNote.text ?? null;
	}
	let result = text.value;
	if (withHashtags.value && hashtags.value.trim() !== '') {
		const tags = hashtags.value.trim().split(/\s+/).map(tag => tag.startsWith('#') ? tag : `#${tag}`).join(' ');
		result += result === '' || result.endsWith('\n') ? tags : ` ${tags}`;
	}
	return (isEditing ? result.trim() === '' : result === '') ? null : result;
}

watch(text, () => {
	checkMissingMention();
}, { immediate: true });

watch(visibility, () => {
	checkMissingMention();
}, { immediate: true });

watch(visibleUsers, () => {
	checkMissingMention();
}, {
	deep: true,
});

if (!isEditing && props.mention) {
	text.value = props.mention.host ? `@${props.mention.username}@${toASCII(props.mention.host)}` : `@${props.mention.username}`;
	text.value += ' ';
}

if (!isEditing && $i.isSilenced && visibility.value === 'public') {
	visibility.value = 'home';
}

if (!isEditing && targetChannel.value) {
	visibility.value = 'public';
	localOnly.value = true; // TODO: チャンネルが連合するようになった折には消す
	visibleUsers.value = [];
}

// 公開以外へのリプライ時は元の公開範囲を引き継ぐ
if (!isEditing && replyTargetNote.value && ['home', 'followers', 'specified'].includes(replyTargetNote.value.visibility)) {
	if (replyTargetNote.value.visibility === 'home' && visibility.value === 'followers') {
		visibility.value = 'followers';
	} else if (['home', 'followers'].includes(replyTargetNote.value.visibility) && visibility.value === 'specified') {
		visibility.value = 'specified';
	} else {
		visibility.value = replyTargetNote.value.visibility;
	}

	if (visibility.value === 'specified') {
		if (replyTargetNote.value.visibleUserIds) {
			misskeyApi('users/show', {
				userIds: replyTargetNote.value.visibleUserIds.filter(uid => uid !== $i.id && uid !== replyTargetNote.value?.userId),
			}).then(users => {
				users.forEach(u => pushVisibleUser(u));
			});
		}

		if (replyTargetNote.value.userId !== $i.id) {
			misskeyApi('users/show', { userId: replyTargetNote.value.userId }).then(user => {
				pushVisibleUser(user);
			});
		}
	}
}

if (!isEditing && props.specified) {
	visibility.value = 'specified';
	pushVisibleUser(props.specified);
}

let inheritedCw: string | null = null;

// keep cw when reply
if (!isEditing && prefer.s.keepCw && replyTargetNote.value && replyTargetNote.value.cw) {
	useCw.value = true;
	cw.value = replyTargetNote.value.cw;
	inheritedCw = cw.value;
}

function watchForDraft() {
	if (!isEditing) return;
	watch(text, () => saveDraft());
	watch(useCw, () => saveDraft());
	watch(cw, () => saveDraft());
	watch(poll, () => saveDraft());
	watch(files, () => saveDraft(), { deep: true });
	watch(visibility, () => saveDraft());
	watch(localOnly, () => saveDraft());
	watch(publishReply, () => saveDraft());
	watch(quoteId, () => saveDraft());
	watch(reactionAcceptance, () => saveDraft());
	watch(scheduledAt, () => saveDraft());
	watch(withHashtags, () => saveDraft());
	watch(hashtags, () => saveDraft());
}

function checkMissingMention() {
	if (visibility.value === 'specified') {
		const ast = mfm.parse(text.value);

		for (const x of extractMentions(ast)) {
			if (!visibleUsers.value.some(u => (u.username === x.username) && ((u.host === x.host) || (x.host === host && u.host == null)))) {
				hasNotSpecifiedMentions.value = true;
				return;
			}
		}
	}
	hasNotSpecifiedMentions.value = false;
}

function addMissingMention() {
	if (isEditing) return;
	const ast = mfm.parse(text.value);

	for (const x of extractMentions(ast)) {
		if (!visibleUsers.value.some(u => (u.username === x.username) && (u.host === x.host))) {
			misskeyApi('users/show', { username: x.username, host: x.host }).then(user => {
				pushVisibleUser(user);
			});
		}
	}
}

function togglePoll() {
	if (isEditing) return;
	if (poll.value) {
		poll.value = null;
	} else {
		poll.value = {
			choices: ['', ''],
			multiple: false,
			expiresAt: null,
			expiredAfter: null,
		};
	}
}

function addTag(tag: string) {
	if (textareaEl.value == null) return;
	insertTextAtCursor(textareaEl.value, ` #${tag} `);
}

function focus() {
	if (textareaEl.value) {
		textareaEl.value.focus();
		textareaEl.value.setSelectionRange(textareaEl.value.value.length, textareaEl.value.value.length);
	}
}

function chooseFileFromPc(ev: PointerEvent) {
	if (props.mock || posting.value || posted.value) return;

	os.chooseFileFromPc({ multiple: true }).then(files => {
		if (files.length === 0) return;
		uploader.addFiles(files);
	});
}

function chooseFileFromDrive(ev: PointerEvent) {
	if (props.mock || posting.value || posted.value) return;

	chooseDriveFile({ multiple: true }).then(driveFiles => {
		files.value.push(...driveFiles);
	});
}

function detachFile(id: Misskey.entities.DriveFile['id']) {
	if (posting.value || posted.value) return;
	files.value = files.value.filter(x => x.id !== id);
}

function updateFileSensitive(file: Misskey.entities.DriveFile, isSensitive: boolean) {
	if (props.mock) {
		emit('fileChangeSensitive', file.id, isSensitive);
	}
	files.value[files.value.findIndex(x => x.id === file.id)].isSensitive = isSensitive;
}

function updateFileName(file: Misskey.entities.DriveFile, name: Misskey.entities.DriveFile['name']) {
	files.value[files.value.findIndex(x => x.id === file.id)].name = name;
}

function setVisibility() {
	if (isEditing) return;
	if (targetChannel.value) {
		visibility.value = 'public';
		localOnly.value = true; // TODO: チャンネルが連合するようになった折には消す
		return;
	}

	const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkVisibilityPicker.vue')), {
		currentVisibility: visibility.value,
		isSilenced: $i.isSilenced,
		anchorElement: visibilityButton.value,
		...(replyTargetNote.value ? { isReplyVisibilitySpecified: replyTargetNote.value.visibility === 'specified' } : {}),
	}, {
		changeVisibility: v => {
			visibility.value = v;
			if (prefer.s.rememberNoteVisibility) {
				store.set('visibility', visibility.value);
			}
		},
		closed: () => dispose(),
	});
}

async function toggleLocalOnly() {
	if (isEditing) return;
	if (targetChannel.value) {
		visibility.value = 'public';
		localOnly.value = true; // TODO: チャンネルが連合するようになった折には消す
		return;
	}

	const neverShowInfo = miLocalStorage.getItem('neverShowLocalOnlyInfo');

	if (!localOnly.value && neverShowInfo !== 'true') {
		const confirm = await os.actions({
			type: 'question',
			title: i18n.ts.disableFederationConfirm,
			text: i18n.ts.disableFederationConfirmWarn,
			actions: [
				{
					value: 'yes' as const,
					text: i18n.ts.disableFederationOk,
					primary: true,
				},
				{
					value: 'neverShow' as const,
					text: `${i18n.ts.disableFederationOk} (${i18n.ts.neverShow})`,
					danger: true,
				},
				{
					value: 'no' as const,
					text: i18n.ts.cancel,
				},
			],
		});
		if (confirm.canceled) return;
		if (confirm.result === 'no') return;

		if (confirm.result === 'neverShow') {
			miLocalStorage.setItem('neverShowLocalOnlyInfo', 'true');
		}
	}

	localOnly.value = !localOnly.value;
	if (prefer.s.rememberNoteVisibility) {
		store.set('localOnly', localOnly.value);
	}
}

async function toggleReactionAcceptance() {
	if (posting.value || posted.value) return;
	const select = await os.select({
		title: i18n.ts.reactionAcceptance,
		items: [
			{ value: null, label: i18n.ts.all },
			{ value: 'likeOnlyForRemote' as const, label: i18n.ts.likeOnlyForRemote },
			{ value: 'nonSensitiveOnly' as const, label: i18n.ts.nonSensitiveOnly },
			{ value: 'nonSensitiveOnlyForLocalLikeOnlyForRemote' as const, label: i18n.ts.nonSensitiveOnlyForLocalLikeOnlyForRemote },
			{ value: 'likeOnly' as const, label: i18n.ts.likeOnly },
		],
		default: reactionAcceptance.value,
	});
	if (select.canceled) return;
	reactionAcceptance.value = select.result;
}

//#region その他の設定メニューpopup
function showOtherSettings() {
	if (posting.value || posted.value) return;
	let reactionAcceptanceIcon = 'ti ti-icons';
	let reactionAcceptanceCaption = '';

	switch (reactionAcceptance.value) {
		case 'likeOnly':
			reactionAcceptanceIcon = 'ti ti-heart _love';
			reactionAcceptanceCaption = i18n.ts.likeOnly;
			break;

		case 'likeOnlyForRemote':
			reactionAcceptanceIcon = 'ti ti-heart-plus';
			reactionAcceptanceCaption = i18n.ts.likeOnlyForRemote;
			break;

		case 'nonSensitiveOnly':
			reactionAcceptanceCaption = i18n.ts.nonSensitiveOnly;
			break;

		case 'nonSensitiveOnlyForLocalLikeOnlyForRemote':
			reactionAcceptanceCaption = i18n.ts.nonSensitiveOnlyForLocalLikeOnlyForRemote;
			break;

		default:
			reactionAcceptanceCaption = i18n.ts.all;
			break;
	}

	const menuItems = [{
		type: 'component',
		component: XTextCounter,
		props: {
			textLength: textLength,
		},
	}, { type: 'divider' }, {
		icon: reactionAcceptanceIcon,
		text: i18n.ts.reactionAcceptance,
		caption: reactionAcceptanceCaption,
		action: () => {
			toggleReactionAcceptance();
		},
	}, ...(isEditing ? [] : [{ type: 'divider' }, {
		type: 'button',
		text: i18n.ts._drafts.saveToDraft,
		icon: 'ti ti-cloud-upload',
		action: async () => {
			if (!canSaveAsServerDraft.value) {
				return os.alert({
					type: 'error',
					text: i18n.ts._drafts.cannotCreateDraft,
				});
			}
			saveServerDraft();
		},
	}, ...($i.policies.scheduledNoteLimit > 0 ? [{
		icon: 'ti ti-calendar-time',
		text: i18n.ts.schedulePost + '...',
		action: () => {
			schedule();
		},
	}] : [])] as MenuItem[]), { type: 'divider' }, {
		type: 'switch',
		icon: 'ti ti-eye',
		text: i18n.ts.preview,
		ref: showPreview,
	}, {
		icon: 'ti ti-trash',
		text: i18n.ts.reset,
		danger: true,
		action: async () => {
			if (props.mock) return;
			const { canceled } = await os.confirm({
				type: 'question',
				text: i18n.ts.resetAreYouSure,
			});
			if (canceled) return;
			if (isEditing) {
				restoreEditingNote();
				uploader.reset();
			} else {
				clear();
			}
		},
	}] satisfies MenuItem[];

	os.popupMenu(menuItems, otherSettingsButton.value);
}
//#endregion

function pushVisibleUser(user: Misskey.entities.UserDetailed) {
	if (!visibleUsers.value.some(u => u.username === user.username && u.host === user.host)) {
		visibleUsers.value.push(user);
	}
}

function addVisibleUser() {
	if (isEditing) return;
	os.selectUser().then(user => {
		pushVisibleUser(user);

		if (!text.value.toLowerCase().includes(`@${user.username.toLowerCase()}`)) {
			text.value = `@${Misskey.acct.toString(user)} ${text.value}`;
		}
	});
}

function removeVisibleUser(id: string) {
	if (isEditing) return;
	visibleUsers.value = visibleUsers.value.filter(u => u.id !== id);
}

function clear() {
	closeChannelPicker();
	text.value = '';
	cw.value = null;
	useCw.value = false;
	showPreview.value = false;
	files.value = [];
	poll.value = null;
	quoteId.value = null;
	scheduledAt.value = null;
	visibleUsers.value = [];
	reactionAcceptance.value = store.s.reactionAcceptance;
	publishReply.value = false;
	postAccount.value = null;
	if (!isEditing && props.channel == null && replyTargetNote.value == null && renoteTargetNote.value == null) {
		targetChannel.value = null;
		audienceBeforeChannel = undefined;
	}
	// 可见范围与话题标签辅助输入也还原为新开表单时的默认值；
	// 回复/频道场景的可见范围受上下文约束（如回复仅关注者可见的帖子），保留不动
	if (replyTargetNote.value == null && targetChannel.value == null) {
		visibility.value = prefer.s.rememberNoteVisibility ? store.s.visibility : prefer.s.defaultNoteVisibility;
		localOnly.value = prefer.s.rememberNoteVisibility ? store.s.localOnly : prefer.s.defaultNoteLocalOnly;
	}
	withHashtags.value = false;
	hashtags.value = '';
	uploader.reset();
	// 清空后连带丢弃草稿；等 watch 触发的 saveDraft 跑完再删，避免刚清空的内容又被写回
	nextTick(() => {
		deleteDraft();
	});
}

function onKeydown(ev: KeyboardEvent) {
	if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey) && canPost.value) post();

	// justEndedComposition.value is for Safari, which keyDown occurs after compositionend.
	// ev.isComposing is for another browsers.
	if (ev.key === 'Escape' && !justEndedComposition.value && !ev.isComposing) emit('esc');
}

function onKeyup(ev: KeyboardEvent) {
	justEndedComposition.value = false;
}

function onCompositionUpdate(ev: CompositionEvent) {
	imeText.value = ev.data;
}

function onCompositionEnd(ev: CompositionEvent) {
	imeText.value = '';
	justEndedComposition.value = true;
}

const pastedFileName = 'yyyy-MM-dd HH-mm-ss [{{number}}]';

async function onPaste(ev: ClipboardEvent) {
	if (props.mock || posting.value || posted.value) return;
	if (ev.clipboardData == null) return;
	if (textareaEl.value == null) return;

	let pastedFiles: File[] = [];
	for (const { item, i } of Array.from(ev.clipboardData.items, (data, x) => ({ item: data, i: x }))) {
		if (item.kind === 'file') {
			const file = item.getAsFile();
			if (!file) continue;
			const lio = file.name.lastIndexOf('.');
			const ext = lio >= 0 ? file.name.slice(lio) : '';
			const formattedName = `${formatTimeString(new Date(file.lastModified), pastedFileName).replace(/{{number}}/g, `${i + 1}`)}${ext}`;
			const renamedFile = new File([file], formattedName, { type: file.type });
			pastedFiles.push(renamedFile);
		}
	}
	if (pastedFiles.length > 0) {
		ev.preventDefault();
		uploader.addFiles(pastedFiles);
		return;
	}

	const paste = ev.clipboardData.getData('text');

	if (!isEditing && !renoteTargetNote.value && !quoteId.value && paste.startsWith(url + '/notes/')) {
		ev.preventDefault();

		const { canceled } = await os.confirm({
			type: 'info',
			text: i18n.ts.quoteQuestion,
		});

		if (canceled) {
			insertTextAtCursor(textareaEl.value, paste);
			return;
		}

		quoteId.value = paste.substring(url.length).match(/^\/notes\/(.+?)\/?$/)?.[1] ?? null;
	}

	if (paste.length > 1000) {
		ev.preventDefault();

		const { canceled } = await os.confirm({
			type: 'info',
			text: i18n.ts.attachAsFileQuestion,
		});

		if (canceled) {
			insertTextAtCursor(textareaEl.value, paste);
			return;
		}

		const fileName = formatTimeString(new Date(), pastedFileName).replace(/{{number}}/g, '0');
		const file = new File([paste], `${fileName}.txt`, { type: 'text/plain' });
		uploader.addFiles([file]);
	}
}

function onDragover(ev: DragEvent) {
	if (ev.dataTransfer == null) return;
	if (ev.dataTransfer.items[0] == null) return;

	const isFile = ev.dataTransfer.items[0].kind === 'file';
	if (isFile || checkDragDataType(ev, ['driveFiles'])) {
		ev.preventDefault();
		draghover.value = true;
		switch (ev.dataTransfer.effectAllowed) {
			case 'all':
			case 'uninitialized':
			case 'copy':
			case 'copyLink':
			case 'copyMove':
				ev.dataTransfer.dropEffect = 'copy';
				break;
			case 'linkMove':
			case 'move':
				ev.dataTransfer.dropEffect = 'move';
				break;
			default:
				ev.dataTransfer.dropEffect = 'none';
				break;
		}
	}
}

function onDragenter() {
	draghover.value = true;
}

function onDragleave() {
	draghover.value = false;
}

function onDrop(ev: DragEvent): void {
	draghover.value = false;
	if (posting.value || posted.value) return;

	// ファイルだったら
	if (ev.dataTransfer && ev.dataTransfer.files.length > 0) {
		ev.preventDefault();
		uploader.addFiles(Array.from(ev.dataTransfer.files));
		return;
	}

	//#region ドライブのファイル
	{
		const droppedData = getDragData(ev, 'driveFiles');
		if (droppedData != null) {
			files.value.push(...droppedData);
			ev.preventDefault();
		}
	}
	//#endregion
}

type StoredDrafts = {
	[key: string]: {
		updatedAt: string;
		editSource?: typeof editSource;
		data: {
			text: string;
			useCw: boolean;
			cw: string | null;
			visibility: 'public' | 'home' | 'followers' | 'specified';
			localOnly: boolean;
			publishReply?: boolean;
			files: Misskey.entities.DriveFile[];
			poll: PollEditorModelValue | null;
			visibleUserIds?: string[];
			quoteId: string | null;
			reactionAcceptance: 'likeOnly' | 'likeOnlyForRemote' | 'nonSensitiveOnly' | 'nonSensitiveOnlyForLocalLikeOnlyForRemote' | null;
			scheduledAt: number | null;
			withHashtags?: boolean;
			hashtags?: string;
		};
	};
};

function saveDraft() {
	if (!isEditing || props.instant || props.mock || posted.value) return;

	const draftsData = JSON.parse(miLocalStorage.getItem('drafts') ?? '{}') as StoredDrafts;
	if (isEditing && !hasUnsavedEdit.value) {
		delete draftsData[draftKey.value];
		miLocalStorage.setItem('drafts', JSON.stringify(draftsData));
		return;
	}

	draftsData[draftKey.value] = {
		updatedAt: new Date().toISOString(),
		...(isEditing ? { editSource } : {}),
		data: {
			text: text.value,
			useCw: useCw.value,
			cw: cw.value,
			visibility: visibility.value,
			localOnly: localOnly.value,
			publishReply: publishReply.value,
			files: files.value,
			poll: poll.value,
			...( visibleUsers.value.length > 0 ? { visibleUserIds: visibleUsers.value.map(x => x.id) } : {}),
			quoteId: quoteId.value,
			reactionAcceptance: reactionAcceptance.value,
			scheduledAt: scheduledAt.value,
			...(isEditing ? { withHashtags: withHashtags.value, hashtags: hashtags.value } : {}),
		},
	};

	miLocalStorage.setItem('drafts', JSON.stringify(draftsData));
}

function deleteDraft() {
	const draftsData = JSON.parse(miLocalStorage.getItem('drafts') ?? '{}') as StoredDrafts;

	delete draftsData[draftKey.value];

	miLocalStorage.setItem('drafts', JSON.stringify(draftsData));
}

async function saveServerDraft(options: {
	isActuallyScheduled?: boolean;
} = {}) {
	if (isEditing) return;
	return await os.apiWithDialog(serverDraftId.value == null ? 'notes/drafts/create' : 'notes/drafts/update', {
		...(serverDraftId.value == null ? {} : { draftId: serverDraftId.value }),
		text: text.value,
		cw: useCw.value ? cw.value || null : null,
		visibility: visibility.value,
		localOnly: localOnly.value,
		hashtag: hashtags.value,
		fileIds: files.value.map(f => f.id),
		poll: poll.value,
		visibleUserIds: visibility.value === 'specified' ? visibleUsers.value.map(x => x.id) : [],
		renoteId: postRenoteId.value ?? null,
		replyId: replyTargetNote.value ? replyTargetNote.value.id : null,
		publishReply: publishReply.value,
		channelId: targetChannel.value ? targetChannel.value.id : null,
		reactionAcceptance: reactionAcceptance.value,
		scheduledAt: scheduledAt.value,
		isActuallyScheduled: options.isActuallyScheduled ?? false,
	});
}

function isAnnoying(text: string): boolean {
	return text.includes('$[x2') ||
		text.includes('$[x3') ||
		text.includes('$[x4') ||
		text.includes('$[scale') ||
		text.includes('$[position');
}

async function uploadFiles() {
	await uploader.upload();

	for (const uploadedItem of uploader.items.value.filter(x => x.uploaded != null)) {
		files.value.push(uploadedItem.uploaded!);
		uploader.removeItem(uploadedItem);
	}
}

async function saveEdit() {
	if (!editingNote || props.mock || !canPost.value) return;
	posting.value = true;
	try {
		if (uploader.items.value.some(item => item.uploaded == null)) {
			await uploadFiles();
			if (uploader.items.value.some(item => item.uploaded == null)) return;
		}

		const updated = await os.apiWithDialog('notes/update', {
			noteId: editingNote.id,
			text: getPostText(),
			cw: useCw.value ? cw.value ?? '' : null,
			fileIds: files.value.map(file => file.id),
			reactionAcceptance: reactionAcceptance.value,
			expected: editSource,
		});
		globalEvents.emit('noteEdited', updated.id, {
			text: updated.text,
			cw: updated.cw,
			emojis: updated.emojis,
			tags: updated.tags ?? [],
			files: updated.files ?? [],
			fileIds: updated.fileIds ?? [],
			reactionAcceptance: updated.reactionAcceptance,
		});
		posted.value = true;
		deleteDraft();
		emit('posted');
	} catch {
		// 接口提示失败后保留编辑内容，方便重试。
		saveDraft();
	} finally {
		posting.value = false;
	}
}

async function post(ev?: PointerEvent) {
	if (!canPost.value) return;
	if (ev != null) {
		const el = (ev.currentTarget ?? ev.target) as HTMLElement | null;

		if (el && prefer.s.animation) {
			const rect = el.getBoundingClientRect();
			const x = rect.left + (el.offsetWidth / 2);
			const y = rect.top + (el.offsetHeight / 2);
			const { dispose } = os.popup(MkRippleEffect, { x, y }, {
				end: () => dispose(),
			});
		}
	}

	if (isEditing) {
		await saveEdit();
		return;
	}

	if (scheduledAt.value != null) {
		if (uploader.items.value.some(x => x.uploaded == null)) {
			await uploadFiles();

			// アップロード失敗したものがあったら中止
			if (uploader.items.value.some(x => x.uploaded == null)) {
				return;
			}
		}

		await postAsScheduled();
		clear();
		return;
	}

	if (props.mock) return;

	if (visibility.value === 'public' && targetChannel.value == null && (
		(useCw.value && cw.value != null && cw.value.trim() !== '' && isAnnoying(cw.value)) || // CWが迷惑になる場合
		((!useCw.value || cw.value == null || cw.value.trim() === '') && text.value != null && text.value.trim() !== '' && isAnnoying(text.value)) // CWが無い かつ 本文が迷惑になる場合
	)) {
		const { canceled, result } = await os.actions({
			type: 'warning',
			text: i18n.ts.thisPostMayBeAnnoying,
			actions: [{
				value: 'home',
				text: i18n.ts.thisPostMayBeAnnoyingHome,
				primary: true,
			}, {
				value: 'cancel',
				text: i18n.ts.thisPostMayBeAnnoyingCancel,
			}, {
				value: 'ignore',
				text: i18n.ts.thisPostMayBeAnnoyingIgnore,
			}],
		});

		if (canceled) return;
		if (result === 'cancel') return;
		if (result === 'home') {
			visibility.value = 'home';
		}
	}

	if (uploader.items.value.some(x => x.uploaded == null)) {
		await uploadFiles();

		// アップロード失敗したものがあったら中止
		if (uploader.items.value.some(x => x.uploaded == null)) {
			return;
		}
	}

	let postData = {
		text: getPostText(),
		fileIds: files.value.length > 0 ? files.value.map(f => f.id) : undefined,
		replyId: replyTargetNote.value ? replyTargetNote.value.id : undefined,
		publishReply: replyTargetNote.value ? publishReply.value : undefined,
		renoteId: postRenoteId.value,
		channelId: targetChannel.value ? targetChannel.value.id : undefined,
		poll: poll.value,
		cw: useCw.value ? cw.value ?? '' : null,
		localOnly: visibility.value === 'specified' ? false : localOnly.value,
		visibility: visibility.value,
		visibleUserIds: visibility.value === 'specified' ? visibleUsers.value.map(u => u.id) : undefined,
		reactionAcceptance: reactionAcceptance.value,
	};

	// plugin
	const notePostInterruptors = getPluginHandlers('note_post_interruptor');
	if (notePostInterruptors.length > 0) {
		for (const interruptor of notePostInterruptors) {
			try {
				postData = await interruptor.handler(deepClone(postData)) as typeof postData;
			} catch (err) {
				console.error(err);
			}
		}
	}

	let token: string | undefined = undefined;

	if (postAccount.value) {
		const storedAccounts = await getAccounts();
		const storedAccount = storedAccounts.find(x => x.id === postAccount.value?.id);
		if (storedAccount && storedAccount.token != null) {
			token = storedAccount.token;
		} else {
			await os.alert({
				type: 'error',
				text: i18n.ts._postForm.accountTokenMissing,
			});
			return;
		}
	}

	posting.value = true;
	misskeyApi('notes/create', postData, token).then((res) => {
		if (props.freezeAfterPosted) {
			posted.value = true;
		} else {
			clear();
		}

		globalEvents.emit('notePosted', res.createdNote);

		nextTick(() => {
			deleteDraft();
			emit('posted');
			if (postData.text && postData.text !== '') {
				const hashtags_ = mfm.parse(postData.text).map(x => x.type === 'hashtag' && x.props.hashtag).filter(x => x) as string[];
				const history = JSON.parse(miLocalStorage.getItem('hashtags') ?? '[]') as string[];
				miLocalStorage.setItem('hashtags', JSON.stringify(unique(hashtags_.concat(history))));
			}
			posting.value = false;
			postAccount.value = null;

			incNotesCount();
			if (notesCount === 1) {
				claimAchievement('notes1');
			}

			const text = postData.text ?? '';
			const lowerCase = text.toLowerCase();
			if ((lowerCase.includes('love') || lowerCase.includes('❤')) && lowerCase.includes('misskey')) {
				claimAchievement('iLoveMisskey');
			}
			if ([
				'https://youtu.be/Efrlqw8ytg4',
				'https://www.youtube.com/watch?v=Efrlqw8ytg4',
				'https://m.youtube.com/watch?v=Efrlqw8ytg4',

				'https://youtu.be/XVCwzwxdHuA',
				'https://www.youtube.com/watch?v=XVCwzwxdHuA',
				'https://m.youtube.com/watch?v=XVCwzwxdHuA',

				'https://open.spotify.com/track/3Cuj0mZrlLoXx9nydNi7RB',
				'https://open.spotify.com/track/7anfcaNPQWlWCwyCHmZqNy',
				'https://open.spotify.com/track/5Odr16TvEN4my22K9nbH7l',
				'https://open.spotify.com/album/5bOlxyl4igOrp2DwVQxBco',
			].some(url => text.includes(url))) {
				claimAchievement('brainDiver');
			}

			if (renoteTargetNote.value && (renoteTargetNote.value.userId === $i.id) && text.length > 0) {
				claimAchievement('selfQuote');
			}

			const date = new Date();
			const h = date.getHours();
			const m = date.getMinutes();
			const s = date.getSeconds();
			if (h >= 0 && h <= 3) {
				claimAchievement('postedAtLateNight');
			}
			if (m === 0 && s === 0) {
				claimAchievement('postedAt0min0sec');
			}

			if (serverDraftId.value != null) {
				misskeyApi('notes/drafts/delete', { draftId: serverDraftId.value });
			}
		});
	}).catch(err => {
		posting.value = false;
		os.alert({
			type: 'error',
			text: err.message + '\n' + (err as any).id,
		});
	});
}

async function postAsScheduled() {
	if (props.mock) return;

	await saveServerDraft({
		isActuallyScheduled: true,
	});
}

function cancel() {
	emit('cancel');
}

function insertMention() {
	os.selectUser({ localOnly: localOnly.value, includeSelf: true }).then(user => {
		if (textareaEl.value == null) return;
		insertTextAtCursor(textareaEl.value, '@' + Misskey.acct.toString(user) + ' ');
	});
}

async function insertEmoji(ev: PointerEvent) {
	textAreaReadOnly.value = true;
	const target = ev.currentTarget ?? ev.target;
	if (target == null) return;

	// emojiPickerはダイアログが閉じずにtextareaとやりとりするので、
	// focustrapをかけているとinsertTextAtCursorが効かない
	// そのため、投稿フォームのテキストに直接注入する
	// See: https://github.com/misskey-dev/misskey/pull/14282
	//      https://github.com/misskey-dev/misskey/issues/14274

	let pos = textareaEl.value?.selectionStart ?? 0;
	let posEnd = textareaEl.value?.selectionEnd ?? text.value.length;
	emojiPicker.show(
		target as HTMLElement,
		emoji => {
			const textBefore = text.value.substring(0, pos);
			const textAfter = text.value.substring(posEnd);
			text.value = textBefore + emoji + textAfter;
			pos += emoji.length;
			posEnd = pos;
		},
		() => {
			textAreaReadOnly.value = false;
			nextTick(() => {
				if (textareaEl.value) {
					textareaEl.value.focus();
					textareaEl.value.setSelectionRange(pos, posEnd);
				}
			});
		},
	);
}

async function insertMfmFunction(ev: PointerEvent) {
	if (textareaEl.value == null) return;
	let pos = textareaEl.value.selectionStart ?? 0;
	let posEnd = textareaEl.value.selectionEnd ?? text.value.length;
	mfmFunctionPicker(
		ev.currentTarget ?? ev.target,
		(tag) => {
			if (pos === posEnd) {
				text.value = `${text.value.substring(0, pos)}$[${tag} ]${text.value.substring(pos)}`;
				pos += tag.length + 3;
				posEnd = pos;
			} else {
				text.value = `${text.value.substring(0, pos)}$[${tag} ${text.value.substring(pos, posEnd)}]${text.value.substring(posEnd)}`;
				pos += tag.length + 3;
				posEnd = pos;
			}
		},
		() => {
			nextTick(() => {
				if (textareaEl.value) {
					textareaEl.value.focus();
					textareaEl.value.setSelectionRange(pos, posEnd);
				}
			});
		},
	);
}

function showActions(ev: PointerEvent) {
	os.popupMenu(postFormActions.map(action => ({
		text: action.title,
		action: () => {
			action.handler({
				text: text.value,
				cw: cw.value,
			}, (key, value) => {
				if (typeof key !== 'string' || typeof value !== 'string') return;
				if (key === 'text') { text.value = value; }
				if (key === 'cw') { useCw.value = value !== null; cw.value = value; }
			});
		},
	})), ev.currentTarget ?? ev.target);
}

const postAccount = ref<Misskey.entities.UserDetailed | null>(null);

async function openAccountMenu(ev: PointerEvent) {
	if (props.mock || isEditing) return;

	function showDraftsDialog(scheduled: boolean) {
		const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkNoteDraftsDialog.vue')), {
			scheduled,
		}, {
			restore: async (draft: Misskey.entities.NoteDraft) => {
				if (posting.value || posted.value) return;
				if (props.channel && draft.channelId !== props.channel.id) {
					await os.alert({ type: 'info', text: i18n.ts._channelPicker.draftChannelMismatch });
					return;
				}
				closeChannelPicker();
				text.value = draft.text ?? '';
				useCw.value = draft.cw != null;
				cw.value = draft.cw ?? null;
				visibility.value = draft.visibility;
				localOnly.value = draft.localOnly ?? false;
				files.value = draft.files ?? [];
				hashtags.value = draft.hashtag ?? '';
				withHashtags.value = (draft.hashtag ?? '').trim() !== '';
				if (draft.poll) {
					// 投票を一時的に空にしないと反映されないため
					poll.value = null;
					nextTick(() => {
						poll.value = {
							choices: draft.poll!.choices,
							multiple: draft.poll!.multiple,
							expiresAt: draft.poll!.expiresAt ? (new Date(draft.poll!.expiresAt)).getTime() : null,
							expiredAfter: null,
						};
					});
				}
				quoteId.value = draft.renoteId ?? null;
				renoteTargetNote.value = draft.renote;
				replyTargetNote.value = draft.reply;
				draftHasReply.value = draft.replyId != null;
				publishReply.value = draft.publishReply ?? false;
				reactionAcceptance.value = draft.reactionAcceptance;
				scheduledAt.value = draft.scheduledAt ?? null;
				targetChannel.value = props.channel ?? draft.channel ?? draft.reply?.channel ?? null;
				audienceBeforeChannel = targetChannel.value ? { ...initialAudience, visibleUsers: [...initialAudience.visibleUsers] } : undefined;
				if (targetChannel.value) {
					visibility.value = 'public';
					localOnly.value = true;
				}

				visibleUsers.value = [];
				serverDraftId.value = draft.id;
				if (draft.visibleUserIds?.length) {
					const users = await misskeyApi('users/show', { userIds: draft.visibleUserIds });
					if (serverDraftId.value === draft.id) {
						if (targetChannel.value && audienceBeforeChannel) audienceBeforeChannel.visibleUsers = [...users];
						else visibleUsers.value = users;
					}
				}
			},
			cancel: () => {

			},
			closed: () => {
				dispose();
			},
		});
	}

	const items = await getAccountMenu({
		withExtraOperation: false,
		includeCurrentAccount: true,
		active: postAccount.value != null ? postAccount.value.id : $i.id,
		onChoose: (account) => {
			if (account.id === $i.id) {
				postAccount.value = null;
			} else {
				postAccount.value = account;
			}
		},
	});

	os.popupMenu([{
		type: 'button',
		text: i18n.ts._drafts.listDrafts,
		icon: 'ti ti-cloud-download',
		action: () => {
			showDraftsDialog(false);
		},
	}, {
		type: 'button',
		text: i18n.ts._drafts.listScheduledNotes,
		icon: 'ti ti-clock-down',
		action: () => {
			showDraftsDialog(true);
		},
	}, { type: 'divider' }, ...items], (ev.currentTarget ?? ev.target ?? undefined) as HTMLElement | undefined);
}

function showPerUploadItemMenu(item: UploaderItem, ev: PointerEvent) {
	const menu = uploader.getMenu(item);
	os.popupMenu(menu, ev.currentTarget ?? ev.target);
}

function showPerUploadItemMenuViaContextmenu(item: UploaderItem, ev: PointerEvent) {
	const menu = uploader.getMenu(item);
	os.contextMenu(menu, ev);
}

async function schedule() {
	if (isEditing) return;
	const { canceled, result } = await os.inputDatetime({
		title: i18n.ts.schedulePost,
	});
	if (canceled) return;
	if (result.getTime() <= Date.now()) return;

	scheduledAt.value = result.getTime();
}

function cancelSchedule() {
	scheduledAt.value = null;
}

function showTour() {
	if (textareaEl.value == null ||
		footerEl.value == null ||
		accountMenuEl.value == null ||
		visibilityButton.value == null ||
		otherSettingsButton.value == null ||
		submitButtonEl.value == null) {
		return;
	}

	startTour([{
		element: textareaEl.value,
		title: i18n.ts._postForm._howToUse.content_title,
		description: i18n.ts._postForm._howToUse.content_description,
	}, {
		element: footerEl.value,
		title: i18n.ts._postForm._howToUse.toolbar_title,
		description: i18n.ts._postForm._howToUse.toolbar_description,
	}, {
		element: accountMenuEl.value,
		title: i18n.ts._postForm._howToUse.account_title,
		description: i18n.ts._postForm._howToUse.account_description,
	}, {
		element: visibilityButton.value,
		title: i18n.ts._postForm._howToUse.visibility_title,
		description: i18n.ts._postForm._howToUse.visibility_description,
	}, {
		element: otherSettingsButton.value,
		title: i18n.ts._postForm._howToUse.menu_title,
		description: i18n.ts._postForm._howToUse.menu_description,
	}, {
		element: submitButtonEl.value,
		title: i18n.ts._postForm._howToUse.submit_title,
		description: i18n.ts._postForm._howToUse.submit_description,
	}]).then(() => {
		closeTip('postForm');
	});
}

function restoreEditingNote() {
	if (!editingNote) return;
	text.value = editingText;
	hashtags.value = editingHashtags;
	withHashtags.value = editingHashtags !== '';
	useCw.value = editingNote.cw != null;
	cw.value = editingNote.cw ?? null;
	visibility.value = editingNote.visibility;
	localOnly.value = editingNote.localOnly ?? false;
	publishReply.value = editingNote.replyId != null && editingNote.isPublishedReply === true;
	files.value = deepClone(editingNote.files ?? []);
	poll.value = editingNote.poll ? {
		choices: editingNote.poll.choices.map(choice => choice.text),
		multiple: editingNote.poll.multiple,
		expiresAt: editingNote.poll.expiresAt ? new Date(editingNote.poll.expiresAt).getTime() : null,
		expiredAfter: null,
	} : null;
	quoteId.value = editingNote.renoteId ?? null;
	reactionAcceptance.value = editingNote.reactionAcceptance ?? null;
}

onMounted(() => {
	if (props.autofocus) {
		focus();

		nextTick(() => {
			focus();
		});
	}

	if (textareaEl.value) textAutocomplete = new Autocomplete(textareaEl.value, text);
	if (cwInputEl.value) cwAutocomplete = new Autocomplete(cwInputEl.value, cw);

	nextTick(() => {
		if (editingNote) {
			restoreEditingNote();
			if (editingNote.visibleUserIds?.length) {
				misskeyApi('users/show', { userIds: editingNote.visibleUserIds }).then(users => {
					users.forEach(user => pushVisibleUser(user));
				});
			}
			const draft = JSON.parse(miLocalStorage.getItem('drafts') ?? '{}')[draftKey.value] as StoredDrafts[string] | undefined;
			// 仅恢复同一版本的草稿，避免覆盖更新后的帖子。
			if (!props.instant && !props.mock && draft != null && matchesEditSource(draft.editSource)) {
				text.value = draft.data.text;
				useCw.value = draft.data.useCw;
				cw.value = draft.data.cw;
				files.value = deepClone((draft.data.files ?? []).filter(Boolean));
				reactionAcceptance.value = draft.data.reactionAcceptance;
				withHashtags.value = draft.data.withHashtags ?? false;
				hashtags.value = draft.data.hashtags ?? '';
			}
			nextTick(() => watchForDraft());
			return;
		}

		// New composers start fresh; only explicitly supplied content is restored.
		if (props.initialNote) {
			const init = props.initialNote;
			text.value = init.text ? init.text : '';
			useCw.value = init.cw != null;
			cw.value = init.cw ?? null;
			visibility.value = init.visibility;
			localOnly.value = init.localOnly ?? false;
			if (targetChannel.value) {
				visibility.value = 'public';
				localOnly.value = true;
			}
			publishReply.value = init.replyId != null && init.isPublishedReply === true;
			files.value = init.files ?? [];
			if (init.poll) {
				poll.value = {
					choices: init.poll.choices.map(x => x.text),
					multiple: init.poll.multiple,
					expiresAt: init.poll.expiresAt ? (new Date(init.poll.expiresAt)).getTime() : null,
					expiredAfter: null,
				};
			}
			if (init.visibleUserIds) {
				misskeyApi('users/show', { userIds: init.visibleUserIds }).then(users => {
					if (targetChannel.value && audienceBeforeChannel) audienceBeforeChannel.visibleUsers = [...users];
					else users.forEach(u => pushVisibleUser(u));
				});
			}
			quoteId.value = renoteTargetNote.value?.id ?? init.renoteId ?? null;
			reactionAcceptance.value = init.reactionAcceptance;
		}

		nextTick(() => watchForDraft());
	});
});

onBeforeUnmount(() => {
	closeChannelPicker();
	uploader.abortAll();
	if (textAutocomplete) {
		textAutocomplete.detach();
	}
	if (cwAutocomplete) {
		cwAutocomplete.detach();
	}
});

async function canClose() {
	if (isEditing && (posting.value || uploader.uploading.value)) return false;
	if (isEditing && posted.value) return true;
	if (!uploader.allItemsUploaded.value) {
		const { canceled } = await os.confirm({
			type: 'question',
			text: i18n.ts._postForm.quitInspiteOfThereAreUnuploadedFilesConfirm,
			okText: i18n.ts.yes,
			cancelText: i18n.ts.no,
		});
		if (canceled) return false;
	} else if (isEditing ? hasUnsavedEdit.value : (
		text.value.trim() !== '' ||
		(cw.value != null && cw.value.trim() !== '' && cw.value !== inheritedCw) ||
		files.value.length > 0 ||
		poll.value != null ||
		quoteId.value != null ||
		renoteTargetNote.value != null ||
		hashtags.value.trim() !== '' ||
		scheduledAt.value != null
	)) {
		const { canceled } = await os.confirm({
			type: 'question',
			text: i18n.ts.leaveConfirm,
			okText: i18n.ts.yes,
			cancelText: i18n.ts.no,
		});
		if (canceled) return false;
	}

	return true;
}

defineExpose({
	clear,
	abortUploader: () => uploader.abortAll(),
	canClose,
});
</script>

<style lang="scss" module>
@use "../styles/channel-accent.scss";
.root {
	// 左右内边距取帖子卡片（MkNote 的 .article）的值，让操作栏、输入框和下方卡片共用同一条边线
	--MI-postForm-spacing: 20px;
	// 上下外边距要和「头部/操作栏 ↔ 输入区」的间距取同一个值，否则按钮 hover 时两侧留白看着不对称
	--MI-postForm-gap: 4px;
	// 输入面板自身的内边距，不与卡片内边距共用，否则正文会被推到 40px
	--MI-postForm-inputPadding: 10px;
	// Focus outlines share a color without changing the size of either field.
	--MI-postForm-inputBorder: transparent;
	box-sizing: border-box;
	position: relative;
	display: flex;
	flex-direction: column;
	container-type: inline-size;
	padding: var(--MI-postForm-gap) var(--MI-postForm-spacing);
	border-radius: var(--MI-cardRadius);

	&:has(.cw:focus, .text:focus) {
		--MI-postForm-inputBorder: var(--MI_THEME-accent);
	}
}

// 最大化时让正文区吃掉剩余高度：操作栏是最后一个子元素，正文撑开后它自然钉在底部，
// 而且整块面板不出滚动条（超长正文由 textarea 自己内部滚动）
.rootMaximized {
	display: flex;
	flex-direction: column;
	height: 100%;
	min-height: 0;
	overflow: clip;

	> .textOuter {
		flex: 1;
		min-height: 0;

		> .text {
			height: 100%;
			min-height: 0;
			max-height: none;
			overflow: auto;
			// content 会让高度随内容收缩，撑开的高度就保不住
			field-sizing: fixed;
		}
	}
}

//#region header
.header {
	z-index: 1000;
	flex-shrink: 0;
	min-height: 36px;
	display: flex;
	flex-wrap: nowrap;
	gap: 4px;
	margin-bottom: var(--MI-postForm-gap);
}

.headerLeft {
	display: flex;
	flex: 1;
	flex-wrap: nowrap;
	align-items: center;
	gap: 4px;
}

.cancel {
	padding: 8px;
}

.avatar {
	display: block;
	width: 22px;
	height: 22px;
	margin: auto;
	object-fit: cover;
}

.headerRight {
	display: flex;
	min-height: 36px;
	font-size: 0.9em;
	flex-wrap: nowrap;
	align-items: center;
	margin-left: auto;
	gap: 4px;
	overflow: clip;
}

.submit {
	// 填满操作栏高度，让按钮到提示条的可见留白也等于共用间距。
	display: flex;
	align-self: stretch;
	margin: 0 0 0 4px;

	&:focus-visible {
		outline: none;

		> .submitInner {
			outline: 2px solid var(--MI_THEME-fgOnAccent);
			outline-offset: -4px;
		}
	}

	&:disabled {
		opacity: 0.7;
	}

	&.posting {
		cursor: wait;
	}

	&:not(:disabled):hover {
		> .submitInner {
			background: linear-gradient(90deg, hsl(from var(--MI_THEME-accent) h s calc(l + 5)), hsl(from var(--MI_THEME-accent) h s calc(l + 5)));
		}
	}

	&:not(:disabled):active {
		> .submitInner {
			background: linear-gradient(90deg, hsl(from var(--MI_THEME-accent) h s calc(l + 5)), hsl(from var(--MI_THEME-accent) h s calc(l + 5)));
		}
	}
}

.colorBar {
	@include channel-accent.stripes;
	position: absolute;
	top: 0px;
	left: 0;
	width: 5px;
	height: 100% ;
	border-radius: 999px;
	pointer-events: none;
}

.submitInner {
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 0 12px;
	line-height: 34px;
	font-weight: bold;
	border-radius: 6px;
	min-width: 90px;
	box-sizing: border-box;
	color: var(--MI_THEME-fgOnAccent);
	background: linear-gradient(90deg, var(--MI_THEME-buttonGradateA), var(--MI_THEME-buttonGradateB));
}

.headerRightItem {
	margin: 0;
	padding: 8px;
	border-radius: 6px;

	&:hover {
		background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05));
	}

	&:disabled {
		background: none;
	}

	&.danger {
		color: #ff2a2a;
	}
}

.headerRightButtonText {
	padding-left: 6px;
}

.visibilityIcon {
	pointer-events: none;
}

.visibility {
	overflow: clip;
	text-overflow: ellipsis;
	white-space: nowrap;
	max-width: 210px;

	&:enabled {
		> .headerRightButtonText {
			opacity: 0.8;
		}
	}
}
//#endregion

.preview {
	padding: 12px var(--MI-postForm-spacing) 0;
	min-height: 75px;
	max-height: 150px;
	overflow: auto;
	background-size: auto auto;
}

html[data-color-scheme=dark] .preview {
	background-image: repeating-linear-gradient(135deg, transparent, transparent 5px, #0004 5px, #0004 10px);
}

html[data-color-scheme=light] .preview {
	background-image: repeating-linear-gradient(135deg, transparent, transparent 5px, #00000005 5px, #00000005 10px);
}

.targetNote {
	padding: 0 0 12px;
}

.existingPoll {
	margin: 0 0 12px;
}

.replyPublishing {
	display: flex;
	align-items: center;
	min-height: 32px;
	margin: 0 0 8px;
	font-size: 0.9em;

	.replyPublishingCheckbox {
		appearance: none;
		-webkit-appearance: none;
		box-sizing: border-box;
		flex-shrink: 0;
		position: relative;
		width: 1em;
		height: 1em;
		margin: 0 8px 0 0;
		padding: 0;
		border: 0.12em solid var(--MI_THEME-divider);
		border-radius: 0.22em;
		background: transparent;
		cursor: pointer;

		&:checked {
			border-color: var(--MI_THEME-accent);
			background: var(--MI_THEME-accent);

			&::after {
				content: "";
				position: absolute;
				top: 0.05em;
				left: 0.28em;
				width: 0.22em;
				height: 0.44em;
				border: solid var(--MI_THEME-fgOnAccent);
				border-width: 0 0.11em 0.11em 0;
				transform: rotate(45deg);
			}
		}

		&:disabled {
			opacity: 0.6;
			cursor: default;
		}
	}

	> span {
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.replyPublishingInfo {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		margin-left: 4px;
		font-size: 1.05em;
		color: var(--MI_THEME-fgTransparentWeak);
		cursor: pointer;
	}
}

.withQuote {
	margin: 0 0 8px 0;
	color: var(--MI_THEME-accent);
}

.toSpecified {
	padding: 6px var(--MI-postForm-spacing);
	margin-bottom: 8px;
	overflow: auto;
	white-space: nowrap;
}

.visibleUsers {
	display: inline;
	top: -1px;
	font-size: 14px;
}

.visibleUser {
	margin-right: 14px;
	padding: 8px 0 8px 8px;
	border-radius: 8px;
	background: light-dark(rgba(0, 0, 0, 0.1), rgba(255, 255, 255, 0.1));
}

// 提示条上方的间距来自 header 的 margin-bottom（也就是 --MI-postForm-gap），
// 所以下方必须取同一个变量，否则同一条提示的上下留白会不对称
.hasNotSpecifiedMentions {
	margin: 0 0 var(--MI-postForm-gap);
}

.scheduledAt {
	margin: 0 0 var(--MI-postForm-gap);
}

.showHowToUse {
	margin: 0 0 var(--MI-postForm-gap);
}

.cw,
.text {
	display: block;
	box-sizing: border-box;
	// 纵向比横向收紧：面板高度由 min-height 决定（border-box），省下的空间直接还给可输入区域
	padding: 6px var(--MI-postForm-inputPadding);
	margin: 0;
	width: 100%;
	font-size: 1em;
	line-height: inherit;
	border: none;
	border-radius: 0;
	background: transparent;
	color: var(--MI_THEME-fg);
	font-family: inherit;

	// 提示文案要明显比正文浅，否则空输入框看着像已经填了内容
	&::placeholder {
		color: color-mix(in srgb, var(--MI_THEME-fg) 45%, transparent);
		opacity: 1;
	}

	&:focus {
		outline: none;
	}

	&:disabled {
		opacity: 0.5;
	}
}

.cwOuter {
	width: 100%;
	position: relative;
	flex-shrink: 0;
	margin-bottom: 6px;
}

.cwOuter,
.textOuter {
	isolation: isolate;

	// Keep the surface behind the input and its emoji overlay.
	&::before {
		content: "";
		position: absolute;
		z-index: -1;
		inset: 0;
		// 透明边框常驻，聚焦时只换颜色，避免出现 1px 的位移
		border: solid 1px var(--MI-postForm-inputBorder);
		border-radius: var(--MI-cardRadius);
		background: color-mix(in srgb, var(--MI_THEME-fg) 7%, transparent);
		pointer-events: none;
	}
}

.cwOuter::before {
	border-color: color-mix(in srgb, var(--MI_THEME-warn) 22%, transparent);
	background: color-mix(in srgb, var(--MI_THEME-warn) 7%, var(--MI_THEME-panel));
}

.cwOuter:focus-within::before {
	border-color: var(--MI_THEME-accent);
}

.cwHeader {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 2px 8px;
	padding: 6px var(--MI-postForm-inputPadding) 0;
}

.cwLabel {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	font-size: 0.8em;
	font-weight: 600;
	color: var(--MI_THEME-fg);

	> i {
		color: var(--MI_THEME-warn);
	}
}

.cwHint {
	flex: 1;
	min-width: 120px;
	font-size: 0.75em;
	line-height: 1.4;
	color: var(--MI_THEME-fgTransparentWeak);
}

.cwRemove {
	display: grid;
	place-items: center;
	flex-shrink: 0;
	width: 28px;
	height: 28px;
	margin-left: auto;
	border-radius: calc(var(--MI-radius) * 0.6);
	color: var(--MI_THEME-fgTransparentWeak);

	&:hover:not(:disabled) {
		background: var(--MI_THEME-buttonHoverBg);
		color: var(--MI_THEME-fg);
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: 2px;
	}
}

.cwInputWrap {
	position: relative;
}

.cw {
	z-index: 1;
	padding-top: 3px;
	padding-bottom: 9px;
	padding-right: calc(var(--MI-postForm-inputPadding) + 32px);
}

.cwTextCount {
	position: absolute;
	top: 4px;
	right: 4px;
	padding: 2px 6px;
	font-size: .9em;
	color: var(--MI_THEME-warn);
	border-radius: 6px;
	max-width: 100%;
	min-width: 1.6em;
	text-align: center;

	&.cwTextOver {
		color: var(--MI_THEME-error);
	}
}

.hiddenBodyLabel {
	display: flex;
	align-items: center;
	gap: 5px;
	padding: 8px var(--MI-postForm-inputPadding) 0;
	font-size: 0.75em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.textOuter {
	width: 100%;
	position: relative;
	display: flex;
	flex: 1 1 auto;
	min-height: 100px;
	flex-direction: column;

	&.withCw {
		&::before {
			background: color-mix(in srgb, var(--MI_THEME-warn) 3%, var(--MI_THEME-panel));
			border-color: color-mix(in srgb, var(--MI_THEME-warn) 16%, transparent);
		}

		&:focus-within::before {
			border-color: var(--MI_THEME-accent);
		}
	}
}

.text {
	flex: 1 1 auto;
	max-width: 100%;
	min-width: 100%;
	width: 100%;
	min-height: 100px;
	max-height: none;
	resize: none;
	field-sizing: content;
}

.withInitialRows:not(.rootMaximized) > .textOuter {
	min-height: 0;

	> .text {
		// lh follows the actual font and line height; include the textarea's vertical padding.
		min-height: calc(var(--MI-postForm-initialRows) * 1lh + 12px);
	}
}

.channelRow {
	display: flex;
	align-items: center;
	flex-shrink: 0;
	gap: 4px;
	min-width: 0;
	padding: 4px var(--MI-postForm-inputPadding) 8px;
}

.channelChip {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	min-width: 0;
	max-width: 100%;
	padding: 4px 8px;
	line-height: 1;
	border-radius: 999px 999px 999px 0;
	font-size: .85em;
	color: var(--MI_THEME-accent);
	background: var(--MI_THEME-panel);

	> i { display: flex; align-items: center; flex-shrink: 0; }
	&:enabled:hover { background: var(--MI_THEME-buttonHoverBg); }
	&:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: 2px; }
	&:disabled { opacity: .5; }
}

.channelName {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.channelArrow {
	transform: rotate(0);
}

.channelArrowOpen {
	transform: rotate(90deg);
}

.channelArrowAnimated {
	transition: transform .15s ease;

	@media (prefers-reduced-motion: reduce) {
		transition: none;
	}
}

.textCount {
	position: absolute;
	top: 4px;
	right: 4px;
	padding: 4px 6px;
	font-size: .9em;
	color: var(--MI_THEME-warn);
	border-radius: 6px;
	min-width: 1.6em;
	text-align: center;

	&.textOver {
		color: #ff2a2a;
	}
}

.footer {
	display: flex;
	flex-shrink: 0;
	padding-top: var(--MI-postForm-gap);
	font-size: 1em;
}

.footerLeft {
	flex: 1;
	min-width: 0;
	display: grid;
	grid-auto-flow: row;
	grid-template-columns: repeat(auto-fill, minmax(36px, 1fr));
	grid-auto-rows: 36px;
}

.footerRight {
	flex: 0 0 36px;
	margin-left: auto;
	display: grid;
	grid-auto-flow: row;
	grid-template-columns: 36px;
	grid-auto-rows: 36px;
	direction: rtl;
}

.footerButton {
	display: inline-block;
	padding: 0;
	margin: 0;
	font-size: 1em;
	width: auto;
	height: 100%;
	border-radius: 6px;

	&:hover {
		background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05));
	}

	&.footerButtonActive {
		color: var(--MI_THEME-accent);
	}
}

.previewButtonActive {
	color: var(--MI_THEME-accent);
}

@container (max-width: 500px) {
	.headerRight {
		font-size: .9em;
	}

	.headerRightButtonText {
		display: none;
	}

	.visibility {
		overflow: initial;
		padding: 0;
	}

	.visibilityIcon {
		display: block;
		padding: 8px;
		pointer-events: auto;
	}

	.text {
		min-height: 90px;
	}
}

@container (max-width: 350px) {
	.footer {
		font-size: 0.9em;
	}

	.cancel,
	.headerRightItem,
	.visibilityIcon {
		padding: 6px;
	}

	.visibility {
		padding: 0;
	}

	.submitInner {
		min-width: 72px;
	}

	.headerRight {
		gap: 0;
	}

}

@container (max-width: 260px) {
	.header {
		flex-wrap: wrap;
	}
}
</style>
