<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow ref="dialogEl" :width="440" :height="560" :autoHeight="true" @close="close" @click="close" @esc="close" @closed="emit('closed')">
	<template #header>{{ count == null ? i18n.ts._likes.title : i18n.tsx._likes.titleWithCount({ n: count }) }}</template>
	<div :class="$style.content">
		<MkPagination :paginator="paginator" :pullToRefresh="false">
			<template #empty><MkResult type="empty" :text="i18n.ts.noUsers"/></template>
			<template #default="{ items }">
				<div :class="$style.users">
					<div v-for="like in items" :key="like.id" :class="$style.user">
						<MkA :to="userPage(like.user)" :class="$style.identity" @click="close">
							<MkAvatar :user="like.user" :class="$style.avatar" indicator/>
							<div :class="$style.names">
								<MkUserName :user="like.user" :class="$style.name"/>
								<div :class="$style.sub">
									<Mfm v-if="descriptionOf(like.user) !== ''" :text="descriptionOf(like.user)" :plain="true" :nowrap="true" :author="like.user"/>
									<MkAcct v-else :user="like.user"/>
								</div>
							</div>
						</MkA>
						<MkFollowButton v-if="$i != null && like.user.id !== $i.id" v-model:user="like.user" :class="$style.follow" full/>
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
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import { userPage } from '@/filters/user.js';
import { Paginator } from '@/utility/paginator.js';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkPagination from '@/components/MkPagination.vue';
import MkFollowButton from '@/components/MkFollowButton.vue';

const props = defineProps<{
	noteId: Misskey.entities.Note['id'];
	count?: number;
}>();
const emit = defineEmits<{ (event: 'closed'): void }>();
const dialogEl = useTemplateRef('dialogEl');
const paginator = markRaw(new Paginator('notes/likes', { limit: 20, params: { noteId: props.noteId } }));

// 掘金那一行副标题是「一句话简介」，取个人简介首行，空的才退回 @handle
function descriptionOf(user: Misskey.entities.UserDetailed): string {
	return user.description?.split('\n').find(line => line.trim() !== '')?.trim() ?? '';
}

function close(): void { dialogEl.value?.close(); }
</script>

<style lang="scss" module>
.content { padding: 8px 20px 20px; }
.users { display: flex; flex-direction: column; }
.user {
	display: flex;
	align-items: center;
	gap: 12px;
	min-width: 0;
	padding: 12px 0;
	border-bottom: 1px solid var(--MI_THEME-divider);
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
