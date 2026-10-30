<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<!-- 布局与帖子点赞弹窗（MkLikesDialog）保持一致。 -->
<template>
<MkModalWindow ref="dialog" :width="400" :height="480" headerIcon="ti ti-users" :autoHeight="true" @close="close" @esc="close" @closed="emit('closed')">
	<template #header>{{ count == null ? i18n.ts._channel.members : i18n.tsx._channel.membersWithCount({ n: count }) }}</template>
	<div :class="$style.content">
		<MkPagination :paginator="paginator" :pullToRefresh="false">
			<template #empty><MkResult type="empty" :text="i18n.ts.noUsers"/></template>
			<template #default="{ items }">
				<div :class="$style.users">
					<div v-for="user in items" :key="user.id" :class="$style.user">
						<div :class="$style.identity">
							<MkA :to="userPage(user)" :class="$style.avatarLink" @click="close">
								<MkAvatar :user="user" :class="$style.avatar" indicator/>
							</MkA>
							<div :class="$style.names">
								<MkA :to="userPage(user)" :class="$style.nameLink" @click="close"><MkUserName :user="user" :class="$style.name"/></MkA>
								<div :class="$style.sub">
									<Mfm v-if="descriptionOf(user) !== ''" :text="descriptionOf(user)" :plain="true" :nowrap="true" :author="user"/>
									<MkAcct v-else :user="user"/>
								</div>
							</div>
						</div>
						<MkFollowButton v-if="$i != null && user.id !== $i.id" :user="user" :class="$style.follow"/>
					</div>
				</div>
			</template>
		</MkPagination>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { markRaw, useTemplateRef } from 'vue';
import type * as Misskey from 'misskey-js';
import { userPage } from '@@/js/user.js';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkPagination from '@/components/MkPagination.vue';
import MkFollowButton from '@/components/MkFollowButton.vue';
import { Paginator } from '@/utility/paginator.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';

const props = defineProps<{
	channelId: string;
	count?: number;
}>();

const emit = defineEmits<{
	(event: 'closed'): void;
}>();

const dialog = useTemplateRef('dialog');
const paginator = markRaw(new Paginator('channels/participants', {
	limit: 20,
	offsetMode: true,
	params: { channelId: props.channelId },
}));

// 副标题显示个人简介首行，空的才退回 @handle
function descriptionOf(user: Misskey.entities.UserDetailed): string {
	return user.description?.split('\n').find(line => line.trim() !== '')?.trim() ?? '';
}

function close(): void { dialog.value?.close(); }
</script>

<style lang="scss" module>
.content { padding: 8px; }
.users {
	display: flex;
	flex-direction: column;
	gap: 2px;
}
.user {
	display: flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
	padding: 8px;
	border-radius: var(--MI-radius);
	transition: background-color .15s ease;
	&:hover,
	&:focus-within { background: var(--MI_THEME-panelHighlight); }
	&:hover .name { color: var(--MI_THEME-link); }
}
.identity {
	display: flex;
	align-items: center;
	gap: 10px;
	flex: 1;
	min-width: 0;
}
.avatarLink { display: block; flex-shrink: 0; }
.nameLink {
	display: block;
	min-width: 0;
	text-decoration: none;
}
.avatar { flex-shrink: 0; width: 36px; height: 36px; }
.names {
	display: flex;
	flex-direction: column;
	min-width: 0;
	gap: 2px;
}
.name {
	font-size: 1em;
	font-weight: 650;
	line-height: 1.35;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}
.sub {
	font-size: .875em;
	line-height: 1.4;
	color: var(--MI_THEME-fgTransparentWeak);
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}
.follow:global(._button) {
	flex-shrink: 0;
	min-width: 64px;
	height: 28px;
	padding-inline: 12px;
	font-size: 13px;
}

@media (max-width: 420px) {
	.content { padding: 6px; }
	.user {
		gap: 6px;
		padding: 8px 6px;
	}
	.identity { gap: 8px; }
}

@media (prefers-reduced-motion: reduce) {
	.user { transition: none; }
}
</style>
