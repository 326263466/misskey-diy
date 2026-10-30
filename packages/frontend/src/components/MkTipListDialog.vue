<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow ref="dialogEl" :width="360" :height="480" :autoHeight="true" headerIcon="ti ti-heart-handshake" @close="close" @esc="close" @closed="emit('closed')">
	<template #header>{{ count == null ? i18n.ts._tip.history : i18n.tsx._tip.historyWithCount({ n: count.toLocaleString() }) }}</template>
	<div :class="$style.content">
		<MkResult v-if="!loading && !error && items.length === 0" type="empty" :text="i18n.ts._tip.empty"/>
		<ul v-if="items.length > 0" :class="$style.list">
			<li v-for="tip in items" :key="tip.id" :class="$style.item" :data-tone="tipTone(tip.amount)">
				<button v-if="tip.user" type="button" class="_button" :class="$style.avatarButton" :aria-label="userName(tip.user)" @click="openUserPanel(tip.user, $event)"><MkAvatar :user="tip.user" :class="$style.avatar" imageOnly title=""/></button>
				<i v-else class="ti ti-user-circle" :class="$style.deletedAvatar" aria-hidden="true"></i>
				<div :class="$style.main">
					<div :class="$style.heading">
						<MkA v-if="tip.user" :to="userPage(tip.user)" :class="$style.name" @click="close"><MkUserName :user="tip.user" :nowrap="true"/></MkA>
						<span v-else :class="$style.name">{{ i18n.ts._tip.deletedUser }}</span>
						<span :class="$style.amount">{{ i18n.tsx._tip.record({ coins: tip.amount.toLocaleString() }) }}</span>
					</div>
					<p :class="$style.message"><span :class="$style.messageLabel">{{ i18n.ts._tip.message }}：</span><span :class="{ [$style.messagePlaceholder]: !tip.message }">{{ tip.message || i18n.ts._tip.noMessage }}</span></p>
				</div>
			</li>
		</ul>
		<MkLoading v-if="loading"/>
		<div v-if="error" :class="$style.error" role="alert">
			<span>{{ i18n.ts._tip.historyFailed }}</span>
			<MkButton type="button" small @click="list.retry">{{ i18n.ts.retry }}</MkButton>
		</div>
		<div v-if="list.canLoad.value && hasMore && !loading && !error" v-appear="list.loadMore" :class="$style.sentinel" aria-hidden="true"></div>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { ref, useTemplateRef } from 'vue';
import type { entities } from 'misskey-js';
import { userName, userPage } from '@@/js/user.js';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkButton from '@/components/MkButton.vue';
import { useInfiniteList } from '@/composables/use-infinite-list.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { tipTone } from '@/utility/tip.js';

const props = defineProps<{ targetType: 'note' | 'page'; targetId: string }>();
const emit = defineEmits<{ (event: 'closed'): void }>();
const dialogEl = useTemplateRef('dialogEl');
const count = ref<number | null>(null);
const pageSize = 20;

const list = useInfiniteList<entities.TipsListResponse['items'][number]>(async (cursor, signal) => {
	const result = await misskeyApi('tips/list', { targetType: props.targetType, targetId: props.targetId, limit: pageSize, ...(cursor ? { untilId: cursor } : {}) }, undefined, signal);
	count.value = result.totalCount;
	return { items: result.items, next: result.items.length === pageSize ? result.items.at(-1)!.id : null };
});
const { items, loading, error, hasMore } = list;
void list.refresh();

function close(): void { dialogEl.value?.close(); }

async function openUserPanel(user: entities.UserLite, event: MouseEvent) {
	const source = event.currentTarget as HTMLElement;
	const showing = ref(true);
	try {
		const component = (await import('@/components/MkUserPopup.vue')).default;
		const { dispose } = os.popup(component, { showing, q: user.id, source, interactive: true }, {
			close: () => { showing.value = false; },
			closed: () => dispose(),
		});
	} catch {
		os.toast(i18n.ts.somethingHappened, 'error');
	}
}
</script>

<style lang="scss" module>
.content { padding: var(--MI-margin); }
.list { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; }
.item {
	--tipColor: var(--MI-tipBlue);
	display: flex;
	align-items: flex-start;
	gap: 8px;
	min-width: 0;
	padding: 8px 0;
	border-bottom: var(--MI-divider);

	&:first-child { padding-top: 0; }
	&:last-child { border-bottom: 0; }
}
.item[data-tone='green'] { --tipColor: var(--MI-tipGreen); }
.item[data-tone='purple'] { --tipColor: var(--MI-tipPurple); }
.item[data-tone='gold'] { --tipColor: var(--MI-tipGold); }
.item[data-tone='red'] { --tipColor: var(--MI-tipRed); }
.avatarButton { flex-shrink: 0; cursor: pointer; }
.avatar { display: block; width: 32px; height: 32px; }
.deletedAvatar { flex-shrink: 0; font-size: 32px; line-height: 1; color: var(--MI_THEME-fgTransparentWeak); }
.main { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.heading { display: flex; align-items: center; gap: 8px; min-width: 0; }
.name { flex: 0 1 auto; min-width: 0; overflow: hidden; font-weight: 400; text-overflow: ellipsis; white-space: nowrap; color: var(--MI_THEME-fg); }
.amount { flex-shrink: 0; margin-left: auto; color: color-mix(in srgb, var(--tipColor) 75%, var(--MI_THEME-fg)); font-weight: 400; font-variant-numeric: tabular-nums; white-space: nowrap; }
.message { margin: 2px 0 0; color: var(--MI_THEME-fg); font-size: .85em; line-height: 1.45; overflow-wrap: anywhere; white-space: pre-wrap; }
.messageLabel { color: var(--MI_THEME-fgTransparentWeak); }
.messagePlaceholder { color: var(--MI_THEME-fgTransparentWeak); }
.error { display: flex; align-items: center; justify-content: center; gap: var(--MI-marginHalf); padding: var(--MI-margin) 0; font-size: .85em; }
.sentinel { height: 1px; }
</style>
