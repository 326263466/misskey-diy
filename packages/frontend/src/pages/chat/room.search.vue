<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<MkInput
		v-model="searchQuery"
		:placeholder="i18n.ts._chat.searchMessages"
		:aria-label="i18n.ts._chat.searchMessages"
		:autofocus="true"
		:maxLength="256"
		type="search"
		@enter="search()"
	>
		<template #prefix><i class="ti ti-search"></i></template>
	</MkInput>

	<section v-if="fetching || searched || failed" :aria-label="i18n.ts.searchResult" :aria-busy="fetching">
		<MkLoading v-if="fetching"/>
		<MkError v-else-if="failed" @retry="search"/>
		<div v-else-if="searchResults.length > 0" :class="$style.results">
			<button v-for="message in searchResults" :key="message.id" type="button" class="_button" :class="$style.result" @click="emit('select', message.id)">
				<MkAvatar :user="message.fromUser" :link="false" :preview="false" :class="$style.avatar"/>
				<span :class="$style.content">
					<span :class="$style.header">
						<MkUserName :user="message.fromUser" :class="$style.name"/>
						<MkTime :time="message.createdAt" :class="$style.time"/>
					</span>
					<Mfm :text="message.text || message.file?.name || (message.redPacket ? i18n.ts._redPacket.title : i18n.ts._chat.messageUnavailable)" :plain="true" :nowrap="true" :noEmojiTooltip="true" :author="message.fromUser" :class="$style.summary"/>
				</span>
			</button>
		</div>
		<MkResult v-else type="notFound"/>
	</section>
</div>
</template>

<script lang="ts" setup>
import { onBeforeUnmount, ref, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import MkInput from '@/components/MkInput.vue';

const props = defineProps<{
	userId?: string;
	roomId?: string;
}>();

const emit = defineEmits<{
	(event: 'select', messageId: string): void;
}>();

const SEARCH_DELAY = 150;
const searchQuery = ref('');
const searched = ref(false);
const searchResults = ref<Misskey.entities.ChatMessage[]>([]);
const fetching = ref(false);
const failed = ref(false);
let searchTimer: number | undefined;
let searchController: AbortController | null = null;
let requestRevision = 0;
let disposed = false;

function resetSearch() {
	window.clearTimeout(searchTimer);
	searchTimer = undefined;
	requestRevision++;
	searchController?.abort();
	searchController = null;
	searchResults.value = [];
	searched.value = false;
	fetching.value = false;
	failed.value = false;
}

async function search() {
	resetSearch();
	const query = searchQuery.value.trim();
	if (!query || disposed) return;
	const controller = new AbortController();
	searchController = controller;
	const revision = requestRevision;
	fetching.value = true;
	try {
		const result = await misskeyApi('chat/messages/search', {
			query,
			roomId: props.roomId,
			userId: props.userId,
			limit: 50,
		}, undefined, controller.signal);
		if (disposed || controller.signal.aborted || revision !== requestRevision) return;
		searchResults.value = result;
		searched.value = true;
	} catch {
		if (!disposed && !controller.signal.aborted && revision === requestRevision) failed.value = true;
	} finally {
		if (!disposed && revision === requestRevision) {
			fetching.value = false;
			if (searchController === controller) searchController = null;
		}
	}
}

function scheduleSearch() {
	resetSearch();
	if (!searchQuery.value.trim() || disposed) return;
	fetching.value = true;
	searchTimer = window.setTimeout(() => { void search(); }, SEARCH_DELAY);
}

watch([searchQuery, () => props.roomId, () => props.userId], scheduleSearch);
onBeforeUnmount(() => {
	disposed = true;
	resetSearch();
});
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 16px;
}

.results {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.result {
	display: grid;
	grid-template-columns: 32px minmax(0, 1fr);
	align-items: center;
	gap: 10px;
	width: 100%;
	padding: 8px;
	border-radius: 8px;
	text-align: left;

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-accent);
		outline-offset: 2px;
	}
}

.avatar {
	width: 32px;
	height: 32px;
}

.content {
	min-width: 0;
}

.header {
	display: flex;
	align-items: center;
	gap: 8px;
}

.name {
	flex: 1;
	min-width: 0;
	font-size: 13px;
	font-weight: 600;
}

.time {
	flex-shrink: 0;
	font-size: 11px;
	color: var(--MI_THEME-fgTransparentWeak);
}

.summary {
	display: block;
	min-width: 0;
	max-width: 100%;
	margin-top: 2px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 13px;
	line-height: 20px;
	color: var(--MI_THEME-fgTransparentWeak);
}
</style>
