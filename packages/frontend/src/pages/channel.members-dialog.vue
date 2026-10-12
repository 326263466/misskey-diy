<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<!-- 布局与帖子点赞弹窗（MkLikesDialog）保持一致。 -->
<template>
<MkModalWindow ref="dialog" :width="440" :height="560" :autoHeight="true" @close="close" @esc="close" @closed="emit('closed')">
	<template #header>{{ count == null ? i18n.ts._channel.members : i18n.tsx._channel.membersWithCount({ n: count }) }}</template>
	<div :class="$style.content">
		<MkPagination :paginator="paginator" :pullToRefresh="false">
			<template #empty><MkResult type="empty" :text="i18n.ts.noUsers"/></template>
			<template #default="{ items }">
				<div :class="$style.users">
					<div v-for="user in items" :key="user.id" :class="$style.user">
						<MkA :to="userPage(user)" :class="$style.identity" @click="close">
							<MkAvatar :user="user" :class="$style.avatar" indicator/>
							<div :class="$style.names">
								<MkUserName :user="user" :class="$style.name"/>
								<div :class="$style.sub">
									<Mfm v-if="descriptionOf(user) !== ''" :text="descriptionOf(user)" :plain="true" :nowrap="true" :author="user"/>
									<MkAcct v-else :user="user"/>
								</div>
							</div>
						</MkA>
						<MkFollowButton v-if="$i != null && user.id !== $i.id" :user="user" :class="$style.follow" full/>
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
.content { padding: var(--MI-cardPadding, 18px); }
.users { display: flex; flex-direction: column; }
.user {
	display: flex;
	align-items: center;
	gap: 12px;
	min-width: 0;
	padding: 12px 0;
	border-bottom: var(--MI-divider);
	&:last-child { border-bottom: 0; }
	&:hover .name { color: var(--MI_THEME-link); }
}
.identity {
	display: flex;
	align-items: center;
	gap: 12px;
	flex: 1;
	min-width: 0;
	text-decoration: none;
}
.avatar { flex-shrink: 0; width: 44px; height: 44px; }
.names { display: flex; flex-direction: column; min-width: 0; gap: 2px; }
.name { font-weight: bold; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.sub {
	font-size: calc(1em - 2px);
	color: var(--MI_THEME-fgTransparentWeak);
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}
.follow { flex-shrink: 0; }
</style>
