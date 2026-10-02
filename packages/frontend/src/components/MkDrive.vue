<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer class="_panel" :class="$style.root">
	<template #header>
		<nav :class="$style.nav">
			<div :class="$style.navPath" @contextmenu.prevent.stop="() => {}">
				<XNavFolder
					:class="[$style.navPathItem, { [$style.navCurrent]: folder == null }]"
					:parentFolder="folder"
					@click="cd(null)"
					@upload="onUploadRequested"
				/>
				<template v-for="f in hierarchyFolders">
					<span :class="[$style.navPathItem, $style.navSeparator]"><i class="ti ti-chevron-right"></i></span>
					<XNavFolder
						:folder="f"
						:parentFolder="folder"
						:class="[$style.navPathItem]"
						@click="cd(f)"
						@upload="onUploadRequested"
					/>
				</template>
				<span v-if="folder != null" :class="[$style.navPathItem, $style.navSeparator]"><i class="ti ti-chevron-right"></i></span>
				<span v-if="folder != null" :class="[$style.navPathItem, $style.navCurrent]">{{ folder.name }}</span>
			</div>
			<button class="_button" :class="$style.navMenu" :aria-label="i18n.ts.more" @click="showMenu"><i class="ti ti-dots"></i></button>
		</nav>
	</template>

	<div
		:class="$style.content"
		@dragover.prevent.stop="onDragover"
		@dragenter="onDragenter"
		@dragleave="onDragleave"
		@drop.prevent.stop="onDrop"
		@contextmenu.stop="onContextmenu"
	>
		<div v-if="select === 'folder'">
			<template v-if="folder == null">
				<MkButton v-if="!isRootSelected" @click="isRootSelected = true">
					<i class="ti ti-square"></i> {{ i18n.ts.selectFolder }}
				</MkButton>
				<MkButton v-else @click="isRootSelected = false">
					<i class="ti ti-checkbox"></i> {{ i18n.ts.unselectFolder }}
				</MkButton>
			</template>
			<template v-else>
				<MkButton v-if="!selectedFolders.some(f => f.id === folder!.id)" @click="selectedFolders.push(folder)">
					<i class="ti ti-square"></i> {{ i18n.ts.selectFolder }}
				</MkButton>
				<MkButton v-else @click="selectedFolders = selectedFolders.filter(f => f.id !== folder!.id)">
					<i class="ti ti-checkbox"></i> {{ i18n.ts.unselectFolder }}
				</MkButton>
			</template>
		</div>

		<div :class="[$style.main, { [$style.fetching]: fetching }]">
			<div :class="$style.tipContainer">
				<MkTip k="drive"><div v-html="i18n.ts.driveAboutTip"></div></MkTip>
			</div>

			<div v-if="foldersPaginator.items.value.length > 0" :class="$style.folders">
				<XFolder
					v-for="(f, i) in foldersPaginator.items.value"
					:key="f.id"
					v-anim="i"
					:data-scroll-anchor="f.id"
					:folder="f"
					:selectMode="select === 'folder'"
					:isSelected="selectedFolders.some(x => x.id === f.id)"
					@chosen="chooseFolder"
					@unchose="unchoseFolder"
					@click="cd(f)"
					@upload="onUploadRequested"
					@dragstart="isDragSource = true"
					@dragend="isDragSource = false"
				/>
			</div>
			<div v-if="!fetching && foldersPaginator.canFetchOlder.value">
				<div :key="foldersPaginator.items.value.at(-1)?.id" v-appear="foldersPaginator.fetchOlder" :class="$style.sentinel" aria-hidden="true"></div>
				<MkLoading v-if="foldersPaginator.fetchingOlder.value"/>
			</div>

			<template v-if="shouldBeGroupedByDate">
				<MkStickyContainer v-for="item in filesTimeline" :key="item.key">
					<template #header>
						<button
							type="button"
							class="_button"
							:class="$style.date"
							:aria-expanded="!collapsedMonths.has(item.key)"
							:aria-controls="`${dateGroupId}-${item.key}`"
							@click="toggleMonth(item.key)"
						>
							<i class="ti" :class="collapsedMonths.has(item.key) ? 'ti-chevron-right' : 'ti-chevron-down'" aria-hidden="true"></i>
							<span>{{ item.key }}</span>
						</button>
					</template>

					<Transition
						:enterActiveClass="prefer.s.animation ? $style.groupToggleActive : ''"
						:leaveActiveClass="prefer.s.animation ? $style.groupToggleActive : ''"
						:enterFromClass="prefer.s.animation ? $style.groupToggleHidden : ''"
						:leaveToClass="prefer.s.animation ? $style.groupToggleHidden : ''"
					>
						<div v-show="!collapsedMonths.has(item.key)" :id="`${dateGroupId}-${item.key}`" :class="$style.groupBody" :inert="collapsedMonths.has(item.key)">
							<div :class="$style.groupInner">
								<TransitionGroup
									tag="div"
									:enterActiveClass="prefer.s.animation ? $style.transition_files_enterActive : ''"
									:leaveActiveClass="prefer.s.animation ? $style.transition_files_leaveActive : ''"
									:enterFromClass="prefer.s.animation ? $style.transition_files_enterFrom : ''"
									:leaveToClass="prefer.s.animation ? $style.transition_files_leaveTo : ''"
									:class="[$style.files, $style.groupFiles]"
								>
									<XFile
										v-for="file in item.items" :key="file.id"
										:data-scroll-anchor="file.id"
										:file="file"
										:folder="folder"
										:isSelected="selectedFiles.some(x => x.id === file.id)"
										@click="onFileClick($event, file)"
										@dragstart="onFileDragstart(file, $event)"
										@dragend="isDragSource = false"
									/>
								</TransitionGroup>
							</div>
						</div>
					</Transition>
				</MkStickyContainer>
			</template>
			<TransitionGroup
				v-else
				tag="div"
				:enterActiveClass="prefer.s.animation ? $style.transition_files_enterActive : ''"
				:leaveActiveClass="prefer.s.animation ? $style.transition_files_leaveActive : ''"
				:enterFromClass="prefer.s.animation ? $style.transition_files_enterFrom : ''"
				:leaveToClass="prefer.s.animation ? $style.transition_files_leaveTo : ''"
				:moveClass="prefer.s.animation ? $style.transition_files_move : ''"
				:class="$style.files"
			>
				<XFile
					v-for="file in filesPaginator.items.value" :key="file.id"
					:data-scroll-anchor="file.id"
					:file="file"
					:folder="folder"
					:isSelected="selectedFiles.some(x => x.id === file.id)"
					@click="onFileClick($event, file)"
					@dragstart="onFileDragstart(file, $event)"
					@dragend="isDragSource = false"
				/>
			</TransitionGroup>

			<div v-if="canFetchFiles">
				<div :key="filesPaginator.items.value.at(-1)?.id" v-appear="fetchMoreFiles" :class="$style.sentinel" aria-hidden="true"></div>
				<MkLoading v-if="fetchingMoreFiles"/>
			</div>

			<div v-if="filesPaginator.items.value.length == 0 && foldersPaginator.items.value.length == 0 && !fetching" :class="$style.empty">
				<div v-if="draghover">{{ i18n.ts.dropHereToUpload }}</div>
				<div v-if="!draghover && folder == null"><strong>{{ i18n.ts.emptyDrive }}</strong></div>
				<div v-if="!draghover && folder != null">{{ i18n.ts.emptyFolder }}</div>
			</div>
		</div>
		<MkLoading v-if="fetching"/>
		<div v-if="draghover" :class="$style.dropzone"></div>
	</div>

	<template #footer>
		<div v-if="isEditMode" :class="$style.footer">
			<MkButton primary rounded @click="moveFilesBulk()"><i class="ti ti-folder-symlink"></i> {{ i18n.ts.move }}...</MkButton>
		</div>
	</template>
</MkStickyContainer>
</template>

<script lang="ts" setup>
import { nextTick, onActivated, onBeforeUnmount, onMounted, ref, useId, useTemplateRef, watch, computed, TransitionGroup, markRaw } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from './MkButton.vue';
import type { MenuItem } from '@/types/menu.js';
import XNavFolder from '@/components/MkDrive.navFolder.vue';
import XFolder from '@/components/MkDrive.folder.vue';
import XFile from '@/components/MkDrive.file.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { useStream } from '@/stream.js';
import { i18n } from '@/i18n.js';
import { claimAchievement } from '@/utility/achievements.js';
import { prefer } from '@/preferences.js';
import { chooseFileFromPcAndUpload, selectDriveFolder } from '@/utility/drive.js';
import { store } from '@/store.js';
import { makeDateGroupedTimelineComputedRef } from '@/utility/timeline-date-separate.js';
import { globalEvents, useGlobalEvent } from '@/events.js';
import { checkDragDataType, getDragData, setDragData } from '@/drag-and-drop.js';
import { getDriveFileMenu } from '@/utility/get-drive-file-menu.js';
import { Paginator } from '@/utility/paginator.js';

const props = withDefaults(defineProps<{
	initialFolder?: Misskey.entities.DriveFolder | Misskey.entities.DriveFolder['id'] | null;
	type?: string;
	multiple?: boolean;
	select?: 'file' | 'folder' | null;
}>(), {
	initialFolder: null,
	multiple: false,
	select: null,
});

const emit = defineEmits<{
	(ev: 'changeSelectedFiles', v: Misskey.entities.DriveFile[]): void;
	(ev: 'changeSelectedFolders', v: (Misskey.entities.DriveFolder | null)[]): void;
	(ev: 'cd', v: Misskey.entities.DriveFolder | null): void;
}>();

const folder = ref<Misskey.entities.DriveFolder | null>(null);
const hierarchyFolders = ref<Misskey.entities.DriveFolder[]>([]);

// ドロップされようとしているか
const draghover = ref(false);

// 自身の所有するアイテムがドラッグをスタートさせたか
// (自分自身の階層にドロップできないようにするためのフラグ)
const isDragSource = ref(false);

const isEditMode = ref(false);

const selectedFiles = ref<Misskey.entities.DriveFile[]>([]);
const selectedFolders = ref<Misskey.entities.DriveFolder[]>([]);
const isRootSelected = ref(false);

watch(selectedFiles, () => {
	emit('changeSelectedFiles', selectedFiles.value);
}, { deep: true });

watch([selectedFolders, isRootSelected], () => {
	emit('changeSelectedFolders', isRootSelected.value ? [null, ...selectedFolders.value] : selectedFolders.value);
});

const fetching = ref(true);

const sortModeSelect = ref<NonNullable<Misskey.entities.DriveFilesRequest['sort']>>('+createdAt');

const filesPaginator = markRaw(new Paginator('drive/files', {
	limit: 30,
	canFetchDetection: 'limit',
	params: () => ({ // 自動でリロードしたくないためcomputedParamsは使わない
		folderId: folder.value ? folder.value.id : null,
		type: props.type,
		sort: ['-createdAt', '+createdAt'].includes(sortModeSelect.value) ? null : sortModeSelect.value,
	}),
}));
const foldersPaginator = markRaw(new Paginator('drive/folders', {
	limit: 30,
	canFetchDetection: 'limit',
	params: () => ({ // 自動でリロードしたくないためcomputedParamsは使わない
		folderId: folder.value ? folder.value.id : null,
	}),
}));

const canFetchFiles = computed(() => !fetching.value && (filesPaginator.order.value === 'oldest' ? filesPaginator.canFetchNewer.value : filesPaginator.canFetchOlder.value));
const fetchingMoreFiles = computed(() => filesPaginator.fetchingOlder.value || filesPaginator.fetchingNewer.value);

async function fetchMoreFiles() {
	if (!canFetchFiles.value || fetchingMoreFiles.value) return;
	if (filesPaginator.order.value === 'oldest') {
		filesPaginator.fetchNewer();
	} else {
		filesPaginator.fetchOlder();
	}
}

const dateGroupedFiles = makeDateGroupedTimelineComputedRef(filesPaginator.items, 'month');
const filesTimeline = computed(() => dateGroupedFiles.value.map(item => ({
	...item,
	key: `${item.date.getFullYear()}/${item.date.getMonth() + 1}`,
})));
const collapsedMonths = ref(new Set<string>());
const dateGroupId = useId();
const shouldBeGroupedByDate = computed(() => ['+createdAt', '-createdAt'].includes(sortModeSelect.value));

function toggleMonth(key: string) {
	if (collapsedMonths.value.has(key)) {
		collapsedMonths.value.delete(key);
	} else {
		collapsedMonths.value.add(key);
	}
}

watch(folder, () => {
	collapsedMonths.value.clear();
	emit('cd', folder.value);
});
watch(sortModeSelect, () => {
	initialize();
});

async function initialize() {
	fetching.value = true;
	await foldersPaginator.reload();
	filesPaginator.initialDirection = sortModeSelect.value === '-createdAt' ? 'newer' : 'older';
	filesPaginator.order.value = sortModeSelect.value === '-createdAt' ? 'oldest' : 'newest';
	await filesPaginator.reload();
	fetching.value = false;
}

function onStreamDriveFileCreated(file: Misskey.entities.DriveFile) {
	if (file.folderId === (folder.value?.id ?? null)) {
		filesPaginator.prepend(file);
	}
}

function onFileDragstart(file: Misskey.entities.DriveFile, ev: DragEvent) {
	if (isEditMode.value) {
		if (!selectedFiles.value.some(f => f.id === file.id)) {
			selectedFiles.value.push(file);
		}

		if (ev.dataTransfer) {
			ev.dataTransfer.effectAllowed = 'move';
			setDragData(ev, 'driveFiles', selectedFiles.value);
		}
	}

	isDragSource.value = true;
}

function onDragover(ev: DragEvent) {
	if (!ev.dataTransfer) return;

	// ドラッグ元が自分自身の所有するアイテムだったら
	if (isDragSource.value) {
		// 自分自身にはドロップさせない
		ev.dataTransfer.dropEffect = 'none';
		return;
	}

	const isFile = ev.dataTransfer.items[0].kind === 'file';
	if (isFile || checkDragDataType(ev, ['driveFiles', 'driveFolders'])) {
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
	} else {
		ev.dataTransfer.dropEffect = 'none';
	}

	return false;
}

function onDragenter() {
	if (!isDragSource.value) draghover.value = true;
}

function onDragleave() {
	draghover.value = false;
}

function onDrop(ev: DragEvent): void | boolean {
	draghover.value = false;

	if (!ev.dataTransfer) return;

	// ドロップされてきたものがファイルだったら
	if (ev.dataTransfer.files.length > 0) {
		os.launchUploader(Array.from(ev.dataTransfer.files), {
			folderId: folder.value?.id ?? null,
		});
		return;
	}

	//#region ドライブのファイル
	{
		const droppedData = getDragData(ev, 'driveFiles');
		if (droppedData != null) {
			misskeyApi('drive/files/move-bulk', {
				fileIds: droppedData.map(f => f.id),
				folderId: folder.value ? folder.value.id : null,
			}).then(() => {
				globalEvents.emit('driveFilesUpdated', droppedData.map(x => ({
					...x,
					folderId: folder.value ? folder.value.id : null,
					folder: folder.value,
				})));
			});
		}
	}
	//#endregion

	//#region ドライブのフォルダ
	{
		const droppedData = getDragData(ev, 'driveFolders');
		if (droppedData != null) {
			const droppedFolder = droppedData[0];
			// 移動先が自分自身ならreject
			if (folder.value && droppedFolder.id === folder.value.id) return false;
			if (foldersPaginator.items.value.some(f => f.id === droppedFolder.id)) return false;
			misskeyApi('drive/folders/update', {
				folderId: droppedFolder.id,
				parentId: folder.value ? folder.value.id : null,
			}).then(() => {
				globalEvents.emit('driveFoldersUpdated', [droppedFolder].map(x => ({
					...x,
					parentId: folder.value ? folder.value.id : null,
					parent: folder.value,
				})));
			}).catch(err => {
				switch (err.code) {
					case 'RECURSIVE_NESTING':
						claimAchievement('driveFolderCircularReference');
						os.alert({
							type: 'error',
							title: i18n.ts.unableToProcess,
							text: i18n.ts.circularReferenceFolder,
						});
						break;
					default:
						os.alert({
							type: 'error',
							text: i18n.ts.somethingHappened,
						});
				}
			});
		}
	}
	//#endregion
}

function onUploadRequested(files: File[], folder?: Misskey.entities.DriveFolder | null) {
	os.launchUploader(files, {
		folderId: folder?.id ?? null,
	});
}

async function urlUpload() {
	const { canceled, result: url } = await os.inputText({
		title: i18n.ts.uploadFromUrl,
		type: 'url',
		placeholder: i18n.ts.uploadFromUrlDescription,
	});
	if (canceled || !url) return;

	await os.apiWithDialog('drive/files/upload-from-url', {
		url: url,
		folderId: folder.value ? folder.value.id : undefined,
	});

	os.alert({
		title: i18n.ts.uploadFromUrlRequested,
		text: i18n.ts.uploadFromUrlMayTakeTime,
	});
}

async function createFolder() {
	const { canceled, result: name } = await os.inputText({
		title: i18n.ts.createFolder,
		placeholder: i18n.ts.folderName,
	});
	if (canceled || name == null) return;

	const createdFolder = await os.apiWithDialog('drive/folders/create', {
		name: name,
		parentId: folder.value ? folder.value.id : undefined,
	});

	foldersPaginator.prepend(createdFolder);
}

async function renameFolder(folderToRename: Misskey.entities.DriveFolder) {
	const { canceled, result: name } = await os.inputText({
		title: i18n.ts.renameFolder,
		placeholder: i18n.ts.inputNewFolderName,
		default: folderToRename.name,
	});
	if (canceled) return;

	const updatedFolder = await os.apiWithDialog('drive/folders/update', {
		folderId: folderToRename.id,
		name: name,
	});

	globalEvents.emit('driveFoldersUpdated', [updatedFolder]);
}

function deleteFolder(folderToDelete: Misskey.entities.DriveFolder) {
	misskeyApi('drive/folders/delete', {
		folderId: folderToDelete.id,
	}).then(() => {
		// 削除時に親フォルダに移動
		cd(folderToDelete.parentId);
		globalEvents.emit('driveFoldersDeleted', [folderToDelete]);
	}).catch(err => {
		switch (err.id) {
			case 'b0fc8a17-963c-405d-bfbc-859a487295e1':
				os.alert({
					type: 'error',
					title: i18n.ts.unableToDelete,
					text: i18n.ts.hasChildFilesOrFolders,
				});
				break;
			default:
				os.alert({
					type: 'error',
					text: i18n.ts.unableToDelete,
				});
		}
	});
}

function onFileClick(ev: PointerEvent, file: Misskey.entities.DriveFile) {
	if (ev.shiftKey) {
		isEditMode.value = true;
	}

	if (props.select === 'file' || isEditMode.value) {
		const isAlreadySelected = selectedFiles.value.some(f => f.id === file.id);

		if (isEditMode.value) {
			if (isAlreadySelected) {
				selectedFiles.value = selectedFiles.value.filter(f => f.id !== file.id);
			} else {
				selectedFiles.value.push(file);
			}
			return;
		}

		if (props.multiple) {
			if (isAlreadySelected) {
				selectedFiles.value = selectedFiles.value.filter(f => f.id !== file.id);
			} else {
				selectedFiles.value.push(file);
			}
		} else {
			if (isAlreadySelected) {
				//emit('selected', file);
			} else {
				selectedFiles.value = [file];
			}
		}
	} else {
		os.popupMenu(getDriveFileMenu(file, folder.value), (ev.currentTarget ?? ev.target ?? undefined) as HTMLElement | undefined);
	}
}

function chooseFolder(folderToChoose: Misskey.entities.DriveFolder) {
	const isAlreadySelected = selectedFolders.value.some(f => f.id === folderToChoose.id);
	if (props.multiple) {
		if (isAlreadySelected) {
			selectedFolders.value = selectedFolders.value.filter(f => f.id !== folderToChoose.id);
		} else {
			selectedFolders.value.push(folderToChoose);
		}
	} else {
		if (isAlreadySelected) {
			//emit('selected', folderToChoose);
		} else {
			selectedFolders.value = [folderToChoose];
		}
	}
}

function unchoseFolder(folderToUnchose: Misskey.entities.DriveFolder) {
	selectedFolders.value = selectedFolders.value.filter(f => f.id !== folderToUnchose.id);
}

function cd(target?: Misskey.entities.DriveFolder | Misskey.entities.DriveFolder['id' | 'parentId']) {
	if (!target) {
		goRoot();
		return;
	} else if (typeof target === 'object') {
		target = target.id;
	}

	fetching.value = true;

	misskeyApi('drive/folders/show', {
		folderId: target,
	}).then(folderToMove => {
		folder.value = folderToMove;
		hierarchyFolders.value = [];

		const dive = (folderToDive: Misskey.entities.DriveFolder) => {
			hierarchyFolders.value.unshift(folderToDive);
			if (folderToDive.parent) dive(folderToDive.parent);
		};

		if (folderToMove.parent) dive(folderToMove.parent);

		initialize();
	});
}

async function moveFilesBulk() {
	if (selectedFiles.value.length === 0) return;

	const { canceled, folders } = await selectDriveFolder(folder.value ? folder.value.id : null);

	if (canceled) return;

	await os.apiWithDialog('drive/files/move-bulk', {
		fileIds: selectedFiles.value.map(f => f.id),
		folderId: folders[0] ? folders[0].id : null,
	});

	globalEvents.emit('driveFilesUpdated', selectedFiles.value.map(x => ({
		...x,
		folderId: folders[0] ? folders[0].id : null,
		folder: folders[0] ?? null,
	})));
}

function goRoot() {
	// 既にrootにいるなら何もしない
	if (folder.value == null) return;

	folder.value = null;
	hierarchyFolders.value = [];
	initialize();
}

function getMenu() {
	const menu: MenuItem[] = [];

	menu.push({
		text: i18n.ts.addFile,
		type: 'label',
	}, {
		text: i18n.ts.upload,
		icon: 'ti ti-upload',
		action: () => {
			chooseFileFromPcAndUpload({
				multiple: true,
				folderId: folder.value?.id,
			});
		},
	}, {
		text: i18n.ts.fromUrl,
		icon: 'ti ti-link',
		action: () => { urlUpload(); },
	}, { type: 'divider' }, {
		text: folder.value ? folder.value.name : i18n.ts.drive,
		type: 'label',
	});

	menu.push({
		type: 'parent',
		text: i18n.ts.sort,
		icon: 'ti ti-arrows-sort',
		children: [{
			text: `${i18n.ts.registeredDate} (${i18n.ts.descendingOrder})`,
			icon: 'ti ti-sort-descending-letters',
			action: () => { sortModeSelect.value = '+createdAt'; },
			active: sortModeSelect.value === '+createdAt',
		}, {
			text: `${i18n.ts.registeredDate} (${i18n.ts.ascendingOrder})`,
			icon: 'ti ti-sort-ascending-letters',
			action: () => { sortModeSelect.value = '-createdAt'; },
			active: sortModeSelect.value === '-createdAt',
		}, {
			text: `${i18n.ts.size} (${i18n.ts.descendingOrder})`,
			icon: 'ti ti-sort-descending-letters',
			action: () => { sortModeSelect.value = '+size'; },
			active: sortModeSelect.value === '+size',
		}, {
			text: `${i18n.ts.size} (${i18n.ts.ascendingOrder})`,
			icon: 'ti ti-sort-ascending-letters',
			action: () => { sortModeSelect.value = '-size'; },
			active: sortModeSelect.value === '-size',
		}, {
			text: `${i18n.ts.name} (${i18n.ts.descendingOrder})`,
			icon: 'ti ti-sort-descending-letters',
			action: () => { sortModeSelect.value = '+name'; },
			active: sortModeSelect.value === '+name',
		}, {
			text: `${i18n.ts.name} (${i18n.ts.ascendingOrder})`,
			icon: 'ti ti-sort-ascending-letters',
			action: () => { sortModeSelect.value = '-name'; },
			active: sortModeSelect.value === '-name',
		}],
	});

	if (folder.value) {
		menu.push({
			text: i18n.ts.renameFolder,
			icon: 'ti ti-forms',
			action: () => { if (folder.value) renameFolder(folder.value); },
		}, {
			text: i18n.ts.deleteFolder,
			icon: 'ti ti-trash',
			action: () => { deleteFolder(folder.value as Misskey.entities.DriveFolder); },
		});
	}

	menu.push({
		text: i18n.ts.createFolder,
		icon: 'ti ti-folder-plus',
		action: () => { createFolder(); },
	}, { type: 'divider' }, {
		type: 'switch',
		text: i18n.ts.edit,
		icon: 'ti ti-pointer',
		ref: isEditMode,
	});

	return menu;
}

function showMenu(ev: PointerEvent) {
	os.popupMenu(getMenu(), (ev.currentTarget ?? ev.target ?? undefined) as HTMLElement | undefined);
}

function onContextmenu(ev: PointerEvent) {
	os.contextMenu(getMenu(), ev);
}

useGlobalEvent('driveFileCreated', (file) => {
	if (file.folderId === (folder.value?.id ?? null)) {
		filesPaginator.prepend(file);
	}
});

useGlobalEvent('driveFilesUpdated', (files) => {
	for (const f of files) {
		if (filesPaginator.items.value.some(x => x.id === f.id)) {
			if (f.folderId === (folder.value?.id ?? null)) {
				filesPaginator.updateItem(f.id, () => f);
			} else {
				filesPaginator.removeItem(f.id);
			}
		} else {
			if (f.folderId === (folder.value?.id ?? null)) {
				filesPaginator.prepend(f);
			}
		}
	}
});

useGlobalEvent('driveFilesDeleted', (files) => {
	for (const f of files) {
		filesPaginator.removeItem(f.id);
	}
});

useGlobalEvent('driveFoldersUpdated', (folders) => {
	for (const f of folders) {
		if (foldersPaginator.items.value.some(x => x.id === f.id)) {
			if (f.parentId === (folder.value?.id ?? null)) {
				foldersPaginator.updateItem(f.id, () => f);
			} else {
				foldersPaginator.removeItem(f.id);
			}
		} else {
			if (f.parentId === (folder.value?.id ?? null)) {
				foldersPaginator.prepend(f);
			}
		}
	}
});

useGlobalEvent('driveFoldersDeleted', (folders) => {
	for (const f of folders) {
		foldersPaginator.removeItem(f.id);
	}
});

let connection: Misskey.IChannelConnection<Misskey.Channels['drive']> | null = null;

onMounted(() => {
	if (store.s.realtimeMode) {
		connection = useStream().useChannel('drive');
		connection.on('fileCreated', onStreamDriveFileCreated);
	}

	if (props.initialFolder) {
		cd(props.initialFolder);
	} else {
		initialize();
	}
});

onActivated(() => {
});

onBeforeUnmount(() => {
	if (connection != null) {
		connection.dispose();
	}
});
</script>

<style lang="scss" module>
@use "../styles/page-header.scss";

.root {
	isolation: isolate;
}

.content {
	display: flex;
	flex-direction: column;
	gap: var(--MI-cardPadding);
	box-sizing: border-box;
	min-height: max(0px, calc(100cqh - var(--MI-stickyTop, 0px) - var(--MI-stickyBottom, 0px)));
	padding: var(--MI-cardPadding);
}

.transition_files_move {
	transition: transform 0.2s ease;
}

.transition_files_enterActive,
.transition_files_leaveActive {
	transition: opacity 0.2s ease;
}
.transition_files_enterFrom,
.transition_files_leaveTo {
	opacity: 0;
}
.transition_files_leaveActive {
	position: absolute;
}

.nav {
	@include page-header.surface;
	--MI-pageHeaderBg: var(--MI_THEME-panel);
	--MI-pageHeaderBgOpacity: 1;
	--MI-pageHeaderRadius: 0;
	--MI-pageHeaderBorder: 1px solid var(--MI_THEME-divider);
	display: flex;
	align-items: center;
	padding: 0 var(--MI-cardPadding);
	height: var(--height);
}

.navPath {
	flex: 1;
	min-width: 0;
	line-height: var(--height);
	white-space: nowrap;
	overflow-x: auto;
	scrollbar-width: none;
}

.navPathItem {
	display: inline-block;
	margin: 0;
	padding: 0 8px;
	line-height: var(--height);
	cursor: pointer;

	&:first-child {
		padding-left: 0;
	}

	&:hover {
		text-decoration: underline;
	}

	&.navCurrent {
		font-weight: bold;
		cursor: default;

		&:hover {
			text-decoration: none;
		}
	}

	&.navSeparator {
		margin: 0;
		padding: 0;
		color: var(--MI_THEME-fgTransparentWeak);
		cursor: default;
	}
}

.navMenu {
	@include page-header.action;
	margin-left: 8px;
}

.main {
	display: flex;
	flex-direction: column;
	gap: var(--MI-cardPadding);
	user-select: none;

	&.fetching {
		cursor: wait !important;
		opacity: 0.5;
		pointer-events: none;
	}
}

.tipContainer:empty {
	display: none;
}

.folders,
.files {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(min(140px, 100%), 1fr));
	gap: 12px;
}

.groupFiles {
	margin-top: var(--MI-cardPadding);
}

.groupBody {
	display: grid;
	grid-template-rows: 1fr;
	background: var(--MI_THEME-panel);
}

.groupInner {
	min-height: 0;
	display: flow-root;
}

.groupToggleActive {
	overflow: clip;
	transition: grid-template-rows 0.25s;
}

.groupBody.groupToggleHidden {
	grid-template-rows: 0fr;
}

.date {
	display: flex;
	align-items: center;
	gap: 8px;
	width: 100%;
	padding: 8px 0;
	font-size: 90%;
	color: var(--MI_THEME-fg);
	background: var(--MI_THEME-panel);
	box-shadow: inset 0 -1px var(--MI_THEME-divider);
	text-align: left;

	&:hover {
		color: var(--MI_THEME-accent);
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: -2px;
	}
}

.sentinel {
	height: 1px;
}

.footer {
	padding: var(--MI-cardPadding);
	font-size: 90%;
	background: var(--MI_THEME-panel);
	border-top: 1px solid var(--MI_THEME-divider);
}

.empty {
	text-align: center;
	pointer-events: none;
	color: var(--MI_THEME-fgTransparentWeak);
}

.dropzone {
	position: absolute;
	inset: 0;
	border: dashed 2px var(--MI_THEME-focus);
	pointer-events: none;
}
</style>
