<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard>
	<div class="_pageBody _gaps_m">
		<MkInput v-model="title" :counterMaxLength="Misskey.CONTENT_LIMITS.galleryTitle">
			<template #label>{{ i18n.ts.title }}</template>
		</MkInput>

		<MkTextarea v-model="description" :rows="3" :counterMaxLength="Misskey.CONTENT_LIMITS.galleryDescription">
			<template #label>{{ i18n.ts.description }}</template>
		</MkTextarea>

		<section :class="$style.attachments">
			<div :class="$style.attachmentsHeader">
				<span :class="$style.attachmentsLabel"><i class="ti ti-photo" aria-hidden="true"></i>{{ i18n.ts.images }}</span>
				<span :class="$style.attachmentsCount">{{ files.length }}/{{ MAX_FILES }}</span>
			</div>
			<div :class="$style.grid">
				<div v-for="(file, index) in files" :key="file.id" class="_imageContainer" :class="$style.tile">
					<img v-if="file.thumbnailUrl" class="_imageBackground" :class="$style.tileImage" :src="file.thumbnailUrl" alt=""/>
					<span :class="$style.tileIndex" aria-hidden="true">{{ index + 1 }}</span>
					<button v-tooltip="i18n.ts.remove" type="button" class="_button" :class="$style.tileRemove" :aria-label="i18n.ts.remove" @click="remove(file)"><i class="ti ti-x" aria-hidden="true"></i></button>
					<span :class="$style.tileName" :title="file.name">{{ file.name }}</span>
				</div>
				<button v-if="files.length < MAX_FILES" type="button" class="_button" :class="$style.addTile" @click="chooseFile">
					<i class="ti ti-plus" aria-hidden="true"></i>
					<span>{{ i18n.ts.attachFile }}</span>
				</button>
			</div>
		</section>

		<MkSwitch v-model="isSensitive">{{ i18n.ts.markAsSensitive }}</MkSwitch>

		<div class="_buttons">
			<MkButton v-if="props.post != null" primary :disabled="!validContent" @click="save"><i class="ti ti-device-floppy"></i> {{ i18n.ts.save }}</MkButton>
			<MkButton v-else primary :disabled="!validContent" @click="save"><i class="ti ti-device-floppy"></i> {{ i18n.ts.publish }}</MkButton>

			<MkButton v-if="props.post != null" danger @click="del"><i class="ti ti-trash"></i> {{ i18n.ts.delete }}</MkButton>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import { selectFile } from '@/utility/drive.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { useRouter } from '@/router.js';

const router = useRouter();

const props = defineProps<{
	post: Misskey.entities.GalleryPost | null;
}>();

// 与 gallery/posts/create 的 fileIds.maxItems 保持一致
const MAX_FILES = 32;

const files = ref(props.post?.files ?? []);
const description = ref(props.post?.description ?? null);
const title = ref(props.post?.title ?? '');
const isSensitive = ref(props.post?.isSensitive ?? false);
const validContent = computed(() => title.value.trim() !== '' && files.value.length > 0 &&
	(title.value === props.post?.title || Array.from(title.value).length <= Misskey.CONTENT_LIMITS.galleryTitle) &&
	(description.value === props.post?.description || Array.from(description.value ?? '').length <= Misskey.CONTENT_LIMITS.galleryDescription));

function chooseFile(evt: MouseEvent) {
	selectFile({
		anchorElement: evt.currentTarget ?? evt.target,
		multiple: true,
	}).then(selected => {
		const remaining = MAX_FILES - files.value.length;
		if (selected.length > remaining) os.toast(i18n.tsx.limitTo({ x: MAX_FILES }), 'warning');
		files.value = files.value.concat(selected.slice(0, remaining));
	});
}

function remove(file: NonNullable<Misskey.entities.GalleryPost['files']>[number]) {
	files.value = files.value.filter(f => f.id !== file.id);
}

async function save() {
	if (!validContent.value) return;
	if (props.post != null) {
		await os.apiWithDialog('gallery/posts/update', {
			postId: props.post.id,
			title: title.value,
			description: description.value,
			fileIds: files.value.map(file => file.id),
			isSensitive: isSensitive.value,
		});
		os.toast(i18n.ts.saved, 'success');
		router.push('/gallery/:postId', {
			params: {
				postId: props.post.id,
			},
		});
	} else {
		const created = await os.apiWithDialog('gallery/posts/create', {
			title: title.value,
			description: description.value,
			fileIds: files.value.map(file => file.id),
			isSensitive: isSensitive.value,
		});
		router.push('/gallery/:postId', {
			params: {
				postId: created.id,
			},
		});
	}
}

async function del() {
	if (props.post == null) return;
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts.deleteConfirm,
	});
	if (canceled) return;
	await os.apiWithDialog('gallery/posts/delete', {
		postId: props.post.id,
	});
	os.toast(i18n.ts.deleteSucceeded, 'success');
	router.push('/gallery');
}

</script>

<style lang="scss" module>
.attachments {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.attachmentsHeader {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: 8px;
}

.attachmentsLabel {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	font-size: 0.85em;
	user-select: none;
}

.attachmentsCount {
	font-size: 0.8em;
	color: var(--MI_THEME-fgTransparentWeak);
	font-variant-numeric: tabular-nums;
}

.grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
	gap: 8px;
}

.tile {
	aspect-ratio: 1;
	border-radius: var(--MI-radius);
	overflow: clip;
	background: var(--MI_THEME-bg);
}

.tileImage {
	object-fit: contain;
}

.tileIndex {
	position: absolute;
	top: 6px;
	left: 6px;
	min-width: 18px;
	padding: 1px 5px;
	box-sizing: border-box;
	border-radius: 999px;
	background: color-mix(in srgb, var(--MI_THEME-bg) 72%, transparent);
	color: var(--MI_THEME-fg);
	font-size: 11px;
	line-height: 16px;
	text-align: center;
	font-variant-numeric: tabular-nums;
}

.tileRemove {
	position: absolute;
	top: 4px;
	right: 4px;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 26px;
	height: 26px;
	border-radius: 50%;
	background: color-mix(in srgb, var(--MI_THEME-bg) 72%, transparent);
	color: var(--MI_THEME-fg);
	font-size: 14px;
	transition: background 0.1s, opacity 0.1s;

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: 1px;
	}
}

// 触屏没有 hover，删除按钮保持常显
@media (hover: hover) {
	.tileRemove {
		opacity: 0;
	}

	.tile:hover .tileRemove,
	.tile:focus-within .tileRemove {
		opacity: 1;
	}
}

.tileName {
	position: absolute;
	inset-inline: 0;
	bottom: 0;
	padding: 3px 8px;
	background: color-mix(in srgb, var(--MI_THEME-bg) 72%, transparent);
	color: var(--MI_THEME-fg);
	font-size: 11px;
	line-height: 1.5;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.addTile {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 6px;
	aspect-ratio: 1;
	border: 1px dashed var(--MI_THEME-divider); // divider-exempt: add-tile placeholder outline
	border-radius: var(--MI-radius);
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.9em;
	transition: background 0.1s, border-color 0.1s, color 0.1s;

	> i {
		font-size: 20px;
	}

	&:hover,
	&:focus-visible {
		background: var(--MI_THEME-buttonHoverBg);
		border-color: var(--MI_THEME-accent);
		color: var(--MI_THEME-accent);
	}
}

</style>
