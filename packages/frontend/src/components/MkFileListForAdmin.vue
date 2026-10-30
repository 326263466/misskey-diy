<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div>
	<MkPagination v-slot="{ items }" :paginator="paginator" :paged="viewMode === 'table' ? true : undefined">
		<div v-if="viewMode === 'table'" class="_adminTableContainer">
			<table class="_adminTable">
				<thead>
					<tr>
						<th scope="col">{{ i18n.ts.preview }}</th>
						<th scope="col">{{ i18n.ts.fileName }}</th>
						<th scope="col">{{ i18n.ts.user }}</th>
						<th scope="col">{{ i18n.ts.mimeType }}</th>
						<th scope="col" class="_adminTableNumber">{{ i18n.ts.size }}</th>
						<th scope="col">{{ i18n.ts.createdAt }}</th>
						<th scope="col" class="_adminTableActions">{{ i18n.ts.operations }}</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="file in items" :key="file.id">
						<td>
							<button type="button" class="_button" :aria-label="`${i18n.ts.details}: ${file.name}`" @click="openFile(file.id)">
								<MkDriveFileThumbnail class="_adminTableImage" :file="file" fit="contain" :highlightWhenSensitive="true" title=""/>
							</button>
						</td>
						<td class="_adminTableMain">
							<button type="button" class="_button _textButton" :class="$style.tableFileName" @click="openFile(file.id)">{{ file.name }}</button>
							<div class="_adminTableSecondary _monospace">{{ file.id }}</div>
							<span v-if="file.isSensitive" class="_adminTableStatus" style="--admin-statusColor: var(--MI_THEME-warn);">{{ i18n.ts.sensitive }}</span>
						</td>
						<td>
							<MkAcct v-if="file.user" :user="file.user"/>
							<span v-else>{{ i18n.ts.system }}</span>
						</td>
						<td>{{ file.type }}</td>
						<td class="_adminTableNumber">{{ bytes(file.size) }}</td>
						<td><MkTime :time="file.createdAt" mode="detail"/></td>
						<td class="_adminTableActions">
							<button type="button" class="_button _textButton" @click="openFile(file.id)"><i class="ti ti-info-circle" aria-hidden="true"></i> {{ i18n.ts.details }}</button>
						</td>
					</tr>
				</tbody>
			</table>
		</div>
		<div
			v-else
			:class="{
				[$style.grid]: viewMode === 'grid',
				[$style.list]: viewMode === 'list',
				'_gaps_s': viewMode === 'list',
			}"
		>
			<MkA
				v-for="file in items"
				:key="file.id"
				v-tooltip="viewMode === 'grid' ? `${file.name} · ${file.type} · ${bytes(file.size)} · ${dateString(file.createdAt)} · ${file.user ? '@' + Misskey.acct.toString(file.user) : i18n.ts.system}` : undefined"
				:to="`/admin/file/${file.id}`"
				behavior="window"
				:class="[$style.file, '_button']"
				:aria-label="file.name"
			>
				<div v-if="file.isSensitive" :class="$style.sensitiveLabel">{{ i18n.ts.sensitive }}</div>
				<MkDriveFileThumbnail :class="$style.thumbnail" :file="file" fit="contain" :highlightWhenSensitive="true" title=""/>
				<div v-if="viewMode === 'list'" :class="$style.body">
					<div>
						<small style="color: var(--MI_THEME-fgTransparentWeak);">{{ file.name }}</small>
					</div>
					<div>
						<MkAcct v-if="file.user" :user="file.user"/>
						<div v-else>{{ i18n.ts.system }}</div>
					</div>
					<div>
						<span style="margin-right: 1em;">{{ file.type }}</span>
						<span>{{ bytes(file.size) }}</span>
					</div>
					<div>
						<span>{{ i18n.ts.createdAt }}: <MkTime :time="file.createdAt" mode="detail"/></span>
					</div>
				</div>
			</MkA>
		</div>
	</MkPagination>
</div>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import type { Paginator } from '@/utility/paginator.js';
import MkPagination from '@/components/MkPagination.vue';
import MkDriveFileThumbnail from '@/components/MkDriveFileThumbnail.vue';
import bytes from '@/filters/bytes.js';
import { i18n } from '@/i18n.js';
import { dateString } from '@/filters/date.js';
import * as os from '@/os.js';

defineProps<{
	paginator: Paginator<'admin/drive/files'>;
	viewMode: 'grid' | 'list' | 'table';
}>();

function openFile(fileId: string) {
	os.pageWindow(`/admin/file/${fileId}`);
}
</script>

<style lang="scss" module>
@keyframes sensitive-blink {
	0% { opacity: 1; }
	50% { opacity: 0; }
}

.tableFileName {
	text-align: start;
	overflow-wrap: anywhere;
}

.list {
	> .file {
		display: flex;
		width: 100%;
		height: auto;
		box-sizing: border-box;
		text-align: left;
		align-items: center;
	}

	> .file:hover {
		color: var(--MI_THEME-accent);
	}

	> .file > .thumbnail {
		width: 128px;
		height: 128px;
	}

	> .file > .body {
		margin-left: 0.3em;
		padding: 8px;
		flex: 1;

		@media (max-width: 500px) {
			font-size: 14px;
		}
	}
}

.grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(min(130px, 100%), 1fr));
	grid-gap: 12px;

	> .file {
		position: relative;
		aspect-ratio: 1;
	}

	.thumbnail {
		width: 100%;
		height: 100%;
	}
}

.sensitiveLabel {
	position: absolute;
	z-index: 10;
	top: 8px;
	left: 8px;
	padding: 2px 4px;
	background: #ff0000bf;
	color: #fff;
	border-radius: 4px;
	font-size: 85%;
	animation: sensitive-blink 1s infinite;
}
</style>
