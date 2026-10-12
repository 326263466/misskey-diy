<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard :tabs="headerTabs">
	<div class="_pageBody">
		<div v-if="channelId == null || channel != null" class="_gaps_m">
			<MkInfo v-if="channel?.isArchived">{{ i18n.ts.thisChannelArchived }}</MkInfo>
			<MkInput v-model="name" :counterMaxLength="CONTENT_LIMITS.channelName">
				<template #label>{{ i18n.ts.name }}</template>
			</MkInput>

			<MkTextarea v-model="description" :counterMaxLength="CONTENT_LIMITS.channelDescription" :class="$style.description" mfmAutocomplete>
				<template #label>{{ i18n.ts.description }}</template>
			</MkTextarea>

			<MkSwitch v-model="isSensitive">
				<template #label>{{ i18n.ts.sensitive }}</template>
			</MkSwitch>

			<MkSwitch v-model="allowRenoteToExternal">
				<template #label>{{ i18n.ts._channel.allowRenoteToExternal }}</template>
			</MkSwitch>

			<div>
				<MkButton v-if="bannerId == null" @click="setBannerImage"><i class="ti ti-plus"></i> {{ i18n.ts._channel.setBanner }}</MkButton>
				<div v-else-if="bannerUrl">
					<img :src="bannerUrl" style="width: 100%;"/>
					<MkButton @click="removeBannerImage()"><i class="ti ti-trash"></i> {{ i18n.ts._channel.removeBanner }}</MkButton>
				</div>
			</div>

			<MkFolder :defaultOpen="true">
				<template #label>{{ i18n.ts.pinnedNotes }}</template>

				<div class="_gaps">
					<MkButton primary rounded @click="addPinnedNote()"><i class="ti ti-plus"></i></MkButton>

					<MkDraggable
						:modelValue="pinnedNoteIds.map(id => ({ id }))"
						direction="vertical"
						manualDragStart
						@update:modelValue="v => pinnedNoteIds = v.map(x => x.id)"
					>
						<template #default="{ item, dragStart }">
							<div :class="$style.pinnedNote">
						<button class="_button _iconButton" :class="$style.pinnedNoteHandle" tabindex="-1" :draggable="true" @dragstart.stop="dragStart"><i class="ti ti-menu"></i></button>
								{{ item.id }}
								<button class="_button _iconButton" :class="$style.pinnedNoteRemove" @click="removePinnedNote(item.id)"><i class="ti ti-x"></i></button>
							</div>
						</template>
					</MkDraggable>
				</div>
			</MkFolder>

			<div class="_buttons" :aria-busy="saving">
				<MkButton primary :disabled="saving || !validContent" @click="save()"><i :class="pendingAction === 'save' ? 'ti ti-loader-2 ti-spin' : 'ti ti-device-floppy'"></i> {{ pendingAction === 'save' ? i18n.ts.processing : channelId ? i18n.ts.save : i18n.ts.create }}</MkButton>
				<MkButton v-if="channelId" :danger="!channel?.isArchived" :disabled="saving" @click="archive()"><i :class="pendingAction === 'archive' ? 'ti ti-loader-2 ti-spin' : channel?.isArchived ? 'ti ti-archive-off' : 'ti ti-archive'"></i> {{ pendingAction === 'archive' ? i18n.ts.processing : channel?.isArchived ? i18n.ts.unarchive : i18n.ts.archive }}</MkButton>
			</div>
			<div v-if="actionStatus" role="status" :class="[$style.actionStatus, { [$style.actionError]: actionStatus === 'error' }]"><i :class="actionStatus === 'error' ? 'ti ti-alert-circle' : 'ti ti-check'"></i> {{ actionStatus === 'error' ? i18n.ts.error : actionStatus === 'archived' ? i18n.ts.archived : i18n.ts.saved }}</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import lightTheme from '@@/themes/_light.json5';
import { CONTENT_LIMITS } from 'misskey-js';
import type * as Misskey from 'misskey-js';
import { themeManager } from '@/theme.js';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkInfo from '@/components/MkInfo.vue';
import { selectFile } from '@/utility/drive.js';
import * as os from '@/os.js';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import MkFolder from '@/components/MkFolder.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkDraggable from '@/components/MkDraggable.vue';
import { useRouter } from '@/router.js';

const router = useRouter();

const props = defineProps<{
	channelId?: string;
}>();

const channel = ref<Misskey.entities.Channel | null>(null);
const name = ref<string>('');
const description = ref<string | null>(null);
const bannerUrl = ref<string | null>(null);
const bannerId = ref<string | null>(null);
const validContent = computed(() => name.value.trim() !== '' &&
	(name.value === channel.value?.name || Array.from(name.value).length <= CONTENT_LIMITS.channelName) &&
	(description.value === channel.value?.description || Array.from(description.value ?? '').length <= CONTENT_LIMITS.channelDescription));

// 新建频道的默认色跟随当前生效的主题，而非固定浅色主题。
// 颜色选择 UI 已移除：API 仍要求该字段，这里保留内部值——更新时原样带回，不改变既有频道的颜色。
function defaultAccent(): string {
	return themeManager.currentCompiledTheme?.accent ?? lightTheme.props.accent;
}

const color = ref(defaultAccent());

const isSensitive = ref(false);
const allowRenoteToExternal = ref(true);
const pinnedNoteIds = ref<Misskey.entities.Note['id'][]>([]);
const pendingAction = ref<'save' | 'archive' | null>(null);
const saving = computed(() => pendingAction.value !== null);
const actionStatus = ref<'saved' | 'archived' | 'error' | null>(null);
let channelGeneration = 0;

watch([name, description, color, bannerId, isSensitive, allowRenoteToExternal, pinnedNoteIds], () => {
	actionStatus.value = null;
}, { flush: 'sync', deep: true });

function applyChannel(result: Misskey.entities.Channel) {
	name.value = result.name;
	description.value = result.description;
	bannerId.value = result.bannerId;
	bannerUrl.value = result.bannerUrl;
	isSensitive.value = result.isSensitive;
	pinnedNoteIds.value = result.pinnedNoteIds;
	color.value = result.color ?? defaultAccent();
	allowRenoteToExternal.value = result.allowRenoteToExternal;

	channel.value = result;
}

watch(() => props.channelId, async (channelId, _, onCleanup) => {
	channelGeneration++;
	actionStatus.value = null;
	let current = true;
	onCleanup(() => { current = false; });
	channel.value = null;
	if (channelId == null) {
		name.value = '';
		description.value = null;
		bannerId.value = null;
		bannerUrl.value = null;
		color.value = defaultAccent();
		isSensitive.value = false;
		allowRenoteToExternal.value = true;
		pinnedNoteIds.value = [];
		return;
	}
	try {
		const result = await os.apiWithDialog('channels/show', { channelId });
		if (current) applyChannel(result);
	} catch {
		// apiWithDialog displays the loading error.
	}
}, { immediate: true });

async function addPinnedNote() {
	const { canceled, result: value } = await os.inputText({
		title: i18n.ts.noteIdOrUrl,
	});
	if (canceled || value == null) return;
	const fromUrl = value.includes('/') ? value.split('/').pop() : null;
	const note = await os.apiWithDialog('notes/show', {
		noteId: fromUrl ?? value,
	});
	pinnedNoteIds.value.unshift(note.id);
}

function removePinnedNote(id: string) {
	pinnedNoteIds.value = pinnedNoteIds.value.filter(x => x !== id);
}

async function save() {
	if (saving.value || !validContent.value) return;
	const channelId = props.channelId;
	const generation = channelGeneration;
	pendingAction.value = 'save';
	actionStatus.value = null;
	const params = {
		name: name.value,
		description: description.value,
		bannerId: bannerId.value,
		color: color.value,
		isSensitive: isSensitive.value,
		allowRenoteToExternal: allowRenoteToExternal.value,
	} satisfies Misskey.entities.ChannelsCreateRequest;

	try {
		if (channelId != null) {
			const updated = await os.apiWithDialog('channels/update', {
				...params,
				channelId,
				pinnedNoteIds: pinnedNoteIds.value,
			});
			if (generation !== channelGeneration || channelId !== props.channelId) return;
			applyChannel(updated);
			actionStatus.value = 'saved';
			os.success(i18n.ts.saved);
		} else {
			const created = await os.apiWithDialog('channels/create', params);
			if (generation !== channelGeneration || channelId !== props.channelId) return;
			os.success(i18n.ts.saved);
			router.push('/channels/:channelId', {
				params: {
					channelId: created.id,
				},
			});
		}
	} catch {
		// apiWithDialog displays the failure; preserve the user's edits for retry.
		if (generation === channelGeneration && channelId === props.channelId) actionStatus.value = 'error';
	} finally {
		pendingAction.value = null;
	}
}

async function archive() {
	if (props.channelId == null || saving.value) return;
	const channelId = props.channelId;
	const generation = channelGeneration;
	const isArchived = !channel.value?.isArchived;

	const { canceled } = await os.confirm({
		type: isArchived ? 'warning' : 'question',
		title: isArchived ? i18n.tsx.channelArchiveConfirmTitle({ name: name.value }) : i18n.ts.unarchive,
		text: isArchived ? i18n.ts.channelArchiveConfirmDescription : name.value,
		okText: isArchived ? i18n.ts.archive : i18n.ts.unarchive,
	});
	if (canceled) return;

	if (saving.value || generation !== channelGeneration || channelId !== props.channelId) return;
	pendingAction.value = 'archive';
	actionStatus.value = null;
	try {
		const updated = await os.apiWithDialog('channels/update', {
			channelId,
			isArchived,
		});
		if (generation !== channelGeneration || channelId !== props.channelId) return;
		applyChannel(updated);
		actionStatus.value = isArchived ? 'archived' : 'saved';
		if (isArchived) {
			os.toast(i18n.ts.archived);
		} else {
			os.success(i18n.ts.saved);
		}
		router.push('/channels/:channelId', { params: { channelId: updated.id } });
	} catch {
		// apiWithDialog displays the failure.
		if (generation === channelGeneration && channelId === props.channelId) actionStatus.value = 'error';
	} finally {
		pendingAction.value = null;
	}
}

function setBannerImage(evt: PointerEvent) {
	const generation = channelGeneration;
	selectFile({
		anchorElement: evt.currentTarget ?? evt.target,
		multiple: false,
	}).then(file => {
		if (generation !== channelGeneration) return;
		bannerId.value = file.id;
		bannerUrl.value = file.url;
	});
}

function removeBannerImage() {
	bannerId.value = null;
	bannerUrl.value = null;
}

const headerTabs = computed(() => []);

definePage(() => ({
	title: props.channelId ? i18n.ts._channel.edit : i18n.ts._channel.create,
	icon: 'ti ti-device-tv',
}));
</script>

<style lang="scss" module>
.description :global(textarea) {
	min-height: calc(3em + 26px);
	height: calc(3em + 26px);
	line-height: 1.5;
	resize: none;
}

.actionStatus {
	display: flex;
	align-items: center;
	gap: 6px;
	color: var(--MI_THEME-accent);
}

.actionError {
	color: var(--MI_THEME-error);
}

.pinnedNote {
	position: relative;
	display: block;
	line-height: 2.85rem;
	text-overflow: ellipsis;
	overflow: hidden;
	white-space: nowrap;
	color: var(--MI_THEME-navFg);
}

.pinnedNoteRemove {
	position: absolute;
	z-index: 10000;
	width: 32px;
	height: 32px;
	color: #ff2a2a;
	right: 8px;
	opacity: 0.8;
}

.pinnedNoteHandle {
	cursor: move;
	width: 32px;
	height: 32px;
	margin: 0 8px;
	color: var(--MI_THEME-fgTransparentWeak);
}
</style>
