<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow v-if="asDialog" ref="dialogEl" :width="440" :height="560" :autoHeight="true" @close="close" @esc="close" @closed="emit('closed')">
	<template #header>
		<div :class="$style.dialogHeader"><MkReactionIcon :allowTextBoost="true" :reaction="reaction" :class="$style.dialogIcon" :noStyle="true"/> {{ i18n.ts._boost.title }}</div>
	</template>
	<div :class="$style.dialogContent">
		<MkPagination :paginator="paginator" :pullToRefresh="false">
			<template #empty><MkResult type="empty" :text="i18n.ts.noUsers"/></template>
			<template #default="{ items }">
				<div :class="$style.dialogUsers">
					<div v-for="item in items" :key="item.id" :class="$style.dialogUser">
						<MkAvatar :user="item.user" :class="$style.dialogAvatar"/>
						<MkUserName :user="item.user"/>
					</div>
				</div>
			</template>
		</MkPagination>
	</div>
</MkModalWindow>
<MkTooltip v-else ref="tooltip" :showing="showing" :anchorElement="anchorElement" :maxWidth="340" @closed="emit('closed')">
	<div :class="$style.root">
		<div :class="$style.reaction">
			<MkReactionIcon :allowTextBoost="true" :reaction="reaction" :class="$style.reactionIcon" :noStyle="true"/>
			<div :class="[$style.reactionName, { _mfm: isTextBoost(reaction) }]">{{ isTextBoost(reaction) ? getBoostText(reaction) : getReactionName(reaction) }}</div>
		</div>
		<div :class="$style.users">
			<div v-for="u in users" :key="u.id" :class="$style.user">
				<MkAvatar :class="$style.avatar" :user="u"/>
				<MkUserName :user="u" :nowrap="true"/>
			</div>
			<div v-if="count > 10" :class="$style.more">+{{ count - 10 }}</div>
		</div>
	</div>
</MkTooltip>
</template>

<script lang="ts" setup>
import { markRaw, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import { getEmojiName } from '@@/js/emojilist.js';
import MkTooltip from './MkTooltip.vue';
import MkReactionIcon from '@/components/MkReactionIcon.vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkPagination from '@/components/MkPagination.vue';
import { Paginator } from '@/utility/paginator.js';
import { getBoostText, isTextBoost } from '@/utility/boost.js';
import { i18n } from '@/i18n.js';

const props = withDefaults(defineProps<{
	showing: boolean;
	reaction: string;
	users: Misskey.entities.UserLite[];
	count: number;
	anchorElement?: HTMLElement;
	noteId?: Misskey.entities.Note['id'];
	asDialog?: boolean;
}>(), { asDialog: false });

const dialogEl = useTemplateRef('dialogEl');
const paginator = markRaw(new Paginator('notes/reactions', {
	limit: 20,
	params: { noteId: props.noteId ?? '', type: props.reaction },
}));

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

function getReactionName(reaction: string): string {
	const trimLocal = reaction.replace('@.', '');
	if (trimLocal.startsWith(':')) {
		return trimLocal;
	}
	return getEmojiName(reaction);
}

function close(): void {
	dialogEl.value?.close();
}
</script>

<style lang="scss" module>
.dialogUser {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 8px;
}

.dialogAvatar {
	width: 32px;
	height: 32px;
}
</style>

<style lang="scss" module>
.root {
	display: flex;
}

.dialogHeader {
	display: flex;
	align-items: center;
	gap: 6px;
}

.dialogIcon {
	font-size: 1.2em;
}

.dialogContent {
	padding: 8px 20px 20px;
}

.dialogUsers {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
	gap: var(--MI-margin);
}

.reaction {
	max-width: 100px;
	padding-right: 10px;
	text-align: center;
	border-right: solid 0.5px var(--MI_THEME-divider);
}

.reactionIcon {
	display: block;
	width: 60px;
	max-height: 60px;
	font-size: 60px; // unicodeな絵文字についてはwidthが効かないため
	object-fit: contain;
	margin: 0 auto;
}

.reactionName {
	font-size: 1em;
}

.users {
	flex: 1;
	min-width: 0;
	margin: -4px 14px 0 10px;
	font-size: 0.95em;
	text-align: left;
}

.user {
	display: flex;
	line-height: 24px;
	padding-top: 4px;
	white-space: nowrap;
	overflow: visible;
	text-overflow: ellipsis;
}

.avatar {
	width: 24px;
	height: 24px;
	margin-right: 3px;
}

.more {
	padding-top: 4px;
}
</style>
