<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-show="props.modelValue.length != 0" :class="$style.root" @dragstart.capture="onDragStart">
	<MkDraggable
		:modelValue="props.modelValue"
		:class="$style.files"
		direction="horizontal"
		:manualDragStart="props.disabled"
		withGaps
		@update:modelValue="updateFiles"
	>
		<template #default="{ item }">
			<div
				:class="[$style.file, { [$style.disabled]: props.disabled }]"
				role="button"
				:tabindex="props.disabled ? -1 : 0"
				:aria-label="item.name"
				:aria-disabled="props.disabled"
				@click="showFileMenu(item, $event)"
				@keydown.space.enter.prevent="showFileMenu(item, $event)"
				@contextmenu.prevent.stop="showFileMenu(item, $event)"
			>
				<!-- pointer-eventsをnoneにしておかないとiOSなどでドラッグしたときに画像の方に判定が持ってかれる -->
				<MkDriveFileThumbnail style="pointer-events: none;" :data-id="item.id" :class="$style.thumbnail" :file="item" fit="cover"/>
				<div v-if="item.isSensitive" :class="$style.sensitive" style="pointer-events: none;">
					<i class="ti ti-eye-exclamation" style="margin: auto;"></i>
				</div>
			</div>
		</template>
	</MkDraggable>
	<p
		:class="[$style.remain, {
			[$style.exceeded]: props.modelValue.length > 16,
		}]"
	>
		{{ props.modelValue.length }}/16
	</p>
</div>
</template>

<script lang="ts" setup>
import { inject } from 'vue';
import * as Misskey from 'misskey-js';
import type { MenuItem } from '@/types/menu';
import { copyToClipboard } from '@/utility/copy-to-clipboard';
import MkDriveFileThumbnail from '@/components/MkDriveFileThumbnail.vue';
import MkDraggable from '@/components/MkDraggable.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import { DI } from '@/di.js';
import { globalEvents } from '@/events.js';
import type { Content } from '@/components/MkLightbox.item.vue';
import { isPreviewable, getType } from '@/utility/lightbox.js';

const props = defineProps<{
	modelValue: Misskey.entities.DriveFile[];
	detachMediaFn?: (id: string) => void;
	editing?: boolean;
	disabled?: boolean;
}>();

const mock = inject(DI.mock, false);

const emit = defineEmits<{
	(ev: 'update:modelValue', value: Misskey.entities.DriveFile[]): void;
	(ev: 'detach', id: string): void;
	(ev: 'changeSensitive', file: Misskey.entities.DriveFile, isSensitive: boolean): void;
	(ev: 'changeName', file: Misskey.entities.DriveFile, newName: string): void;
}>();

let menuShowing = false;

function updateFiles(files: Misskey.entities.DriveFile[]) {
	if (props.disabled) return;
	emit('update:modelValue', files);
}

function onDragStart(ev: DragEvent) {
	if (!props.disabled) return;
	ev.preventDefault();
	ev.stopPropagation();
}

function detachMedia(id: string) {
	if (mock || props.disabled) return;

	if (props.detachMediaFn) {
		props.detachMediaFn(id);
	} else {
		emit('detach', id);
	}
}

async function detachAndDeleteMedia(file: Misskey.entities.DriveFile) {
	if (mock || props.editing || props.disabled) return;

	detachMedia(file.id);

	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.tsx.driveFileDeleteConfirm({ name: file.name }),
	});
	if (canceled || props.editing || props.disabled) return;

	await os.apiWithDialog('drive/files/delete', {
		fileId: file.id,
	});

	globalEvents.emit('driveFilesDeleted', [file]);
}

function toggleSensitive(file: Misskey.entities.DriveFile) {
	if (props.editing || props.disabled) return;
	if (mock) {
		emit('changeSensitive', file, !file.isSensitive);
		return;
	}

	misskeyApi('drive/files/update', {
		fileId: file.id,
		isSensitive: !file.isSensitive,
	}).then(() => {
		emit('changeSensitive', file, !file.isSensitive);
	});
}

async function rename(file: Misskey.entities.DriveFile) {
	if (mock || props.editing || props.disabled) return;

	const { canceled, result } = await os.inputText({
		title: i18n.ts.enterFileName,
		default: file.name,
		minLength: 1,
	});
	if (canceled || props.editing || props.disabled) return;
	misskeyApi('drive/files/update', {
		fileId: file.id,
		name: result,
	}).then(() => {
		emit('changeName', file, result);
		file.name = result;
	});
}

async function describe(file: Misskey.entities.DriveFile) {
	if (mock || props.editing || props.disabled) return;

	const { dispose } = await os.popupAsyncWithDialog(import('@/components/MkFileCaptionEditWindow.vue').then(x => x.default), {
		default: file.comment !== null ? file.comment : '',
		file: file,
	}, {
		done: caption => {
			if (props.editing || props.disabled) return;
			let comment = caption.length === 0 ? null : caption;
			misskeyApi('drive/files/update', {
				fileId: file.id,
				comment: comment,
			}).then(() => {
				file.comment = comment;
			});
		},
		closed: () => dispose(),
	});
}

function showFileMenu(file: Misskey.entities.DriveFile, ev: PointerEvent | KeyboardEvent): void {
	if (menuShowing || props.disabled) return;

	const menuItems: MenuItem[] = [];

	if (!props.editing) {
		menuItems.push({
			text: i18n.ts.renameFile,
			icon: 'ti ti-forms',
			action: () => { rename(file); },
		}, {
			text: file.isSensitive ? i18n.ts.unmarkAsSensitive : i18n.ts.markAsSensitive,
			icon: file.isSensitive ? 'ti ti-eye-exclamation' : 'ti ti-eye',
			action: () => { toggleSensitive(file); },
		}, {
			text: i18n.ts.describeFile,
			icon: 'ti ti-text-caption',
			action: () => { describe(file); },
		});
	}

	if (isPreviewable(file.type)) {
		menuItems.push({
			text: i18n.ts.preview,
			icon: 'ti ti-photo-search',
			action: async () => {
				if (props.disabled) return;
				const constents = props.modelValue.filter(item => isPreviewable(item.type)).map<Content>(item => ({
					id: item.id,
					type: getType(item.type),
					url: item.url,
					thumbnailUrl: item.thumbnailUrl,
					width: item.properties.width,
					height: item.properties.height,
					filename: item.name,
					file: item,
					//sourceElement: TODO
				}));
				const { dispose } = await os.popupAsyncWithDialog(import('@/components/MkLightbox.vue').then(x => x.default), {
					defaultIndex: constents.findIndex(content => content.id === file.id),
					contents: constents,
					initiallyRevealedContentIds: [file.id],
				}, {
					closed: () => dispose(),
				});
			},
		});
	}

	if (menuItems.length > 0) menuItems.push({ type: 'divider' });
	menuItems.push({
		text: i18n.ts.attachCancel,
		icon: 'ti ti-circle-x',
		action: () => { detachMedia(file.id); },
	});
	if (!props.editing) {
		menuItems.push({
			text: i18n.ts.deleteFile,
			icon: 'ti ti-trash',
			danger: true,
			action: () => { detachAndDeleteMedia(file); },
		});
	}

	if (prefer.s.devMode) {
		menuItems.push({ type: 'divider' }, {
			icon: 'ti ti-hash',
			text: i18n.ts.copyFileId,
			action: () => {
				if (props.disabled) return;
				copyToClipboard(file.id);
			},
		});
	}

	os.popupMenu(menuItems, ev.currentTarget ?? ev.target).then(() => menuShowing = false);
	menuShowing = true;
}
</script>

<style lang="scss" module>
.root {
	padding: 8px 16px;
	position: relative;
}

.files {
	display: flex;
	flex-wrap: wrap;
}

.file {
	position: relative;
	width: 64px;
	height: 64px;
	border-radius: 4px;
	overflow: hidden;
	cursor: move;

	&:focus-visible {
		outline-offset: 4px;
	}

	&.disabled {
		cursor: default;
	}
}

.thumbnail {
	width: 100%;
	height: 100%;
	z-index: 1;
	color: var(--MI_THEME-fg);
}

.sensitive {
	display: flex;
	position: absolute;
	width: 64px;
	height: 64px;
	top: 0;
	left: 0;
	z-index: 2;
	background: rgba(17, 17, 17, .7);
	color: #fff;
}

.remain {
	display: block;
	position: absolute;
	top: 8px;
	right: 8px;
	margin: 0;
	padding: 0;
	font-size: 90%;

	&.exceeded {
		color: var(--MI_THEME-error);
	}
}
</style>
