<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow ref="dialogEl" :width="480" :height="760" autoHeight headerIcon="ti ti-apps" @close="close" @closed="emit('closed')">
	<template #header>{{ flash.title }}</template>
	<template #headerActions>
		<button v-tooltip="i18n.ts.more" type="button" class="_button" :class="$style.iconButton" :aria-label="i18n.ts.more" aria-haspopup="menu" @click="showMenu"><i class="ti ti-dots" aria-hidden="true"></i></button>
	</template>
	<div :class="$style.stage">
		<MkFlashRunner ref="runnerEl" :flash="flash"/>
	</div>
	<template #footer>
		<div :class="$style.controls">
			<MkA :to="userPage(flash.user)" :class="$style.author" @click="close">
				<MkAvatar :user="flash.user" :class="$style.avatar" :link="false"/>
				<MkUserName :user="flash.user" :class="$style.authorName"/>
			</MkA>
			<MkButton rounded small @click="runnerEl?.run()"><i class="ti ti-refresh" aria-hidden="true"></i>{{ i18n.ts._play.restart }}</MkButton>
			<button v-tooltip="flash.isLiked ? i18n.ts.unlike : i18n.ts.like" type="button" class="_button" :class="[$style.iconButton, { [$style.iconButtonActive]: flash.isLiked }]" :aria-label="flash.isLiked ? i18n.ts.unlike : i18n.ts.like" :aria-pressed="flash.isLiked ?? false" @click="toggleFlashLike(flash)"><i :class="flash.isLiked ? 'ti ti-heart-filled' : 'ti ti-heart'" aria-hidden="true"></i></button>
			<button v-tooltip="i18n.ts.share" type="button" class="_button" :class="$style.iconButton" :aria-label="i18n.ts.share" @click="shareFlash(flash)"><i class="ti ti-share" aria-hidden="true"></i></button>
		</div>
	</template>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import { userPage } from '@@/js/user.js';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkButton from '@/components/MkButton.vue';
import MkFlashRunner from '@/components/MkFlashRunner.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { useRouter } from '@/router.js';
import { getFlashMenu, shareFlash, toggleFlashLike } from '@/utility/flash-actions.js';

const props = defineProps<{
	/** 传入列表中的响应式对象，点赞后列表同步更新 */
	flash: Misskey.entities.Flash;
}>();

const emit = defineEmits<{
	(ev: 'deleted'): void;
	(ev: 'closed'): void;
}>();

const router = useRouter();
const dialogEl = useTemplateRef('dialogEl');
const runnerEl = useTemplateRef('runnerEl');

function close() {
	dialogEl.value?.close();
}

function showMenu(ev: PointerEvent) {
	os.popupMenu(getFlashMenu(props.flash, router, {
		showInPage: true,
		beforeLeave: close,
		onDeleted: () => {
			emit('deleted');
			close();
		},
	}), ev.currentTarget ?? ev.target);
}
</script>

<style lang="scss" module>
.stage {
	padding: var(--MI-cardPadding);
}

.controls {
	display: flex;
	align-items: center;
	gap: 8px;
}

.author {
	display: flex;
	flex: 1;
	align-items: center;
	gap: 8px;
	min-width: 0;
	color: inherit;

	&:hover {
		text-decoration: none;
	}
}

.avatar {
	flex-shrink: 0;
	width: 28px;
	height: 28px;
}

.authorName {
	overflow: hidden;
	font-size: .9em;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.iconButton {
	display: grid;
	flex-shrink: 0;
	place-items: center;
	width: 36px;
	height: 36px;
	border-radius: 50%;
	color: var(--MI_THEME-fgTransparent);

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
		color: var(--MI_THEME-fg);
	}
}

.iconButtonActive {
	color: var(--MI_THEME-love);

	&:hover {
		color: var(--MI_THEME-love);
	}
}
</style>
