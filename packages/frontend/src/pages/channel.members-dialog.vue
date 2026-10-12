<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow ref="dialog" :width="600" :height="650" closeButtonRight @closed="emit('closed')">
	<template #header>{{ i18n.ts._channel.members }}</template>
	<MkPagination :paginator="paginator" :class="$style.list">
		<template #empty><MkResult type="empty" :text="i18n.ts.noUsers"/></template>
		<template #default="{ items }">
			<div v-for="user in items" :key="user.id" :class="$style.member">
				<MkA :to="userPage(user)" :class="$style.identity" @click="dialog?.close()">
					<MkAvatar :user="user" :class="$style.avatar" :link="false"/>
					<div :class="$style.details">
						<MkUserName :user="user" :class="$style.name"/>
						<div :class="$style.description">
							<Mfm v-if="user.description" :text="user.description" :plain="true" :nowrap="true" :author="user"/>
							<MkAcct v-else :user="user"/>
						</div>
					</div>
				</MkA>
				<MkFollowButton v-if="user.id !== $i?.id" :user="user" :class="$style.follow" full/>
			</div>
		</template>
	</MkPagination>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { markRaw, useTemplateRef } from 'vue';
import { userPage } from '@@/js/user.js';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkPagination from '@/components/MkPagination.vue';
import MkFollowButton from '@/components/MkFollowButton.vue';
import { Paginator } from '@/utility/paginator.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';

const props = defineProps<{
	channelId: string;
}>();

const emit = defineEmits<{
	(event: 'closed'): void;
}>();

const dialog = useTemplateRef('dialog');
const paginator = markRaw(new Paginator('channels/participants', {
	limit: 30,
	offsetMode: true,
	params: { channelId: props.channelId },
}));
</script>

<style lang="scss" module>
.list {
	padding: var(--MI-cardPadding);
}

.member {
	display: flex;
	align-items: center;
	gap: 12px;
}

.identity {
	flex: 1;
	min-width: 0;
	display: flex;
	align-items: center;
	gap: 12px;
}

.avatar {
	flex-shrink: 0;
	width: 48px;
	height: 48px;
}

.details {
	flex: 1;
	min-width: 0;
}

.name {
	font-weight: 600;
}

.description {
	margin-top: 4px;
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparentWeak);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.follow {
	flex-shrink: 0;
}
</style>
