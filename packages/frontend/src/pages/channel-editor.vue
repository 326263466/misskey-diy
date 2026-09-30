<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 700px;">
		<div v-if="channelId == null || channel != null" class="_gaps_m">
			<MkInfo v-if="channel?.isArchived">{{ i18n.ts.thisChannelArchived }}</MkInfo>
			<section v-if="showPreview" :aria-label="i18n.ts.preview" class="_gaps_s">
				<MkChannelPreview :channel="previewChannel" preview/>
			</section>
			<MkInput v-model="name">
				<template #label>{{ i18n.ts.name }}</template>
			</MkInput>

			<MkTextarea v-model="description" :class="$style.description" mfmAutocomplete>
				<template #label>{{ i18n.ts.description }}</template>
			</MkTextarea>

			<div>
				<div :class="$style.colorLabel">{{ i18n.ts.color }}</div>
				<div :class="$style.swatches" role="group" :aria-label="i18n.ts.color">
					<button
						v-for="c in swatchColors"
						:key="c"
						type="button"
						class="_button"
						:class="[$style.swatch, { [$style.swatchSelected]: color?.toLowerCase() === c.toLowerCase() }]"
						:style="{ background: c }"
						:aria-pressed="color?.toLowerCase() === c.toLowerCase()"
						:title="c"
						@click="color = c"
					>
						<i v-if="color?.toLowerCase() === c.toLowerCase()" class="ti ti-check" :class="$style.swatchCheck" aria-hidden="true"></i>
					</button>
					<div :class="$style.swatchActions">
						<button type="button" class="_button" :class="$style.miniButton" :title="i18n.ts._channel.randomColor" :aria-label="i18n.ts._channel.randomColor" @click="setRandomColor"><i class="ti ti-dice-5" aria-hidden="true"></i></button>
						<button type="button" class="_button" :class="[$style.miniButton, $style.miniButtonDashed]" :title="i18n.ts._channel.customColor" :aria-label="i18n.ts._channel.customColor" @click="setCustomColor"><i class="ti ti-plus" aria-hidden="true"></i></button>
					</div>
				</div>
			</div>

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
								<button class="_button" :class="$style.pinnedNoteHandle" tabindex="-1" :draggable="true" @dragstart.stop="dragStart"><i class="ti ti-menu"></i></button>
								{{ item.id }}
								<button class="_button" :class="$style.pinnedNoteRemove" @click="removePinnedNote(item.id)"><i class="ti ti-x"></i></button>
							</div>
						</template>
					</MkDraggable>
				</div>
			</MkFolder>

			<div class="_buttons" :aria-busy="saving">
				<MkButton primary :disabled="saving" @click="save()"><i :class="pendingAction === 'save' ? 'ti ti-loader-2 ti-spin' : 'ti ti-device-floppy'"></i> {{ pendingAction === 'save' ? i18n.ts.processing : channelId ? i18n.ts.save : i18n.ts.create }}</MkButton>
				<MkButton v-if="channelId" :danger="!channel?.isArchived" :disabled="saving" @click="archive()"><i :class="pendingAction === 'archive' ? 'ti ti-loader-2 ti-spin' : channel?.isArchived ? 'ti ti-archive-off' : 'ti ti-archive'"></i> {{ pendingAction === 'archive' ? i18n.ts.processing : channel?.isArchived ? i18n.ts.unarchive : i18n.ts.archive }}</MkButton>
			</div>
			<div v-if="actionStatus" role="status" :class="[$style.actionStatus, { [$style.actionError]: actionStatus === 'error' }]"><i :class="actionStatus === 'error' ? 'ti ti-alert-circle' : 'ti ti-check'"></i> {{ i18n.ts[actionStatus] }}</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import lightTheme from '@@/themes/_light.json5';
import tinycolor from 'tinycolor2';
import type * as Misskey from 'misskey-js';
import { themeManager } from '@/theme.js';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkChannelPreview from '@/components/MkChannelPreview.vue';
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

// 新建频道的默认色跟随当前生效的主题，而非固定浅色主题
function defaultAccent(): string {
	return themeManager.currentCompiledTheme?.accent ?? lightTheme.props.accent;
}

const color = ref(defaultAccent());
// 频道颜色只用于识别色条，提供预设色板直接点选，不再唤起原生取色器；
// 编辑已有频道时若当前颜色不在预设里，补在开头，保证不丢色且有选中态
const presetColors = [
	'#86b300', '#e5484d', '#f76b15', '#ffb224', '#eac700',
	'#46a758', '#12a594', '#00a2c7', '#0091ff', '#3e63dd',
	'#6e56cf', '#8e4ec6', '#bf3ea0', '#e93d82', '#8d8d8d',
];
const swatchColors = computed(() => {
	const list = [...presetColors];
	const current = color.value.toLowerCase();
	if (!list.some(c => c.toLowerCase() === current)) list.unshift(color.value);
	return list;
});

// 从预设色板里随机挑一个（排除当前色），保证随机结果依然协调
function setRandomColor() {
	const candidates = presetColors.filter(c => c.toLowerCase() !== color.value.toLowerCase());
	color.value = candidates[Math.floor(Math.random() * candidates.length)];
}

// 自定义色走文本对话框输入 hex，不回到又卡又难看的原生取色器
async function setCustomColor() {
	const { canceled, result } = await os.inputText({
		title: i18n.ts._channel.customColor,
		placeholder: '#88cc00',
		default: color.value,
	});
	if (canceled || result == null) return;
	const parsed = tinycolor(result.trim());
	if (!parsed.isValid()) {
		os.alert({ type: 'error', text: i18n.ts._channel.invalidColor });
		return;
	}
	color.value = parsed.toHexString();
}

const isSensitive = ref(false);
const allowRenoteToExternal = ref(true);
const pinnedNoteIds = ref<Misskey.entities.Note['id'][]>([]);
const pendingAction = ref<'save' | 'archive' | null>(null);
const saving = computed(() => pendingAction.value !== null);
const showPreview = ref(false);
const actionStatus = ref<'saved' | 'archived' | 'error' | null>(null);
let channelGeneration = 0;

watch([name, description, color, bannerId, isSensitive, allowRenoteToExternal, pinnedNoteIds], () => {
	actionStatus.value = null;
}, { flush: 'sync', deep: true });

const previewChannel = computed<Misskey.entities.Channel>(() => ({
	id: props.channelId ?? '',
	createdAt: channel.value?.createdAt ?? new Date().toISOString(),
	lastNotedAt: channel.value?.lastNotedAt ?? null,
	userId: channel.value?.userId ?? null,
	usersCount: channel.value?.usersCount ?? 0,
	notesCount: channel.value?.notesCount ?? 0,
	isArchived: channel.value?.isArchived ?? false,
	name: name.value,
	description: description.value,
	bannerId: bannerId.value,
	bannerUrl: bannerUrl.value,
	color: color.value,
	isSensitive: isSensitive.value,
	allowRenoteToExternal: allowRenoteToExternal.value,
	pinnedNoteIds: pinnedNoteIds.value,
}));

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
	if (saving.value) return;
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
			os.toast(i18n.ts.saved);
		} else {
			const created = await os.apiWithDialog('channels/create', params);
			if (generation !== channelGeneration || channelId !== props.channelId) return;
			os.toast(i18n.ts.saved);
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
		os.toast(isArchived ? i18n.ts.archived : i18n.ts.saved);
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

const headerActions = computed(() => [{
	icon: 'ti ti-eye',
	text: i18n.ts.preview,
	handler: () => { showPreview.value = !showPreview.value; },
}]);

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

.colorLabel {
	display: block;
	padding: 0 0 8px;
	font-size: 0.85em;
	user-select: none;
}

.swatches {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	padding: 10px 12px;
	background: var(--MI_THEME-panel);
	border-radius: 6px;
}

.swatchActions {
	display: flex;
	align-items: center;
	gap: 8px;
	// 随机/自定义推到行尾
	margin-inline-start: auto;
}

.swatch {
	position: relative;
	display: grid;
	place-items: center;
	flex-shrink: 0;
	width: 26px;
	height: 26px;
	border-radius: 50%;
	// 内圈发丝线：浅色块（黄/琥珀/灰）在白底上有边缘，深色块也多一层质感
	box-shadow: inset 0 0 0 1px light-dark(rgb(0 0 0 / 8%), rgb(255 255 255 / 12%));
	transition: transform 0.1s ease;

	// 玻璃高光，纯色圆点不显呆板
	&::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: linear-gradient(145deg, rgb(255 255 255 / 30%), transparent 55%);
		pointer-events: none;
	}

	&:hover {
		transform: scale(1.15);
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: 2px;
	}

	&.swatchSelected {
		// 选中环用 outline，避免和发丝线的 box-shadow 叠写
		outline: 2px solid var(--MI_THEME-accent);
		outline-offset: 2px;
	}
}

.swatchCheck {
	position: relative;
	color: #fff;
	font-size: 15px;
	line-height: 1;
	// 白色对勾直接落在色块上，浅色块（黄/琥珀/灰）补一点暗影保证可读
	filter: drop-shadow(0 0 1px rgb(0 0 0 / 40%));
}

.miniButton {
	flex-shrink: 0;
	display: grid;
	place-items: center;
	width: 26px;
	height: 26px;
	border-radius: 50%;
	border: solid 1px var(--MI_THEME-divider);
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 14px;

	&:hover {
		color: var(--MI_THEME-accent);
		background: var(--MI_THEME-buttonHoverBg);
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: 2px;
	}
}

.miniButtonDashed {
	border-style: dashed;
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
	opacity: 0.5;
}
</style>
