<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl" :class="$style.root">
	<button :class="$style.item" class="_button" :aria-label="i18n.ts.menu" @click="drawerMenuShowing = true">
		<div :class="$style.itemInner">
			<span :class="$style.itemIcon">
				<i class="ti ti-menu-2" aria-hidden="true"></i>
				<span v-if="menuIndicated" :class="$style.itemIndicator" class="_blink"><i class="_indicatorCircle"></i></span>
			</span>
		</div>
		<span :class="$style.itemText">{{ i18n.ts.menu }}</span>
	</button>

	<button :class="$style.item" class="_button" @click="mainRouter.push('/')">
		<div :class="$style.itemInner">
			<span :class="$style.itemIcon"><i class="ti ti-home" aria-hidden="true"></i></span>
		</div>
		<span :class="$style.itemText">{{ i18n.ts.home }}</span>
	</button>
	<button :class="$style.item" class="_button" @click="mainRouter.push('/timeline')">
		<div :class="$style.itemInner">
			<span :class="$style.itemIcon"><i class="ti ti-messages" aria-hidden="true"></i></span>
		</div>
		<span :class="$style.itemText">{{ i18n.ts.timeline }}</span>
	</button>

	<button :class="[$style.item, $style.post]" class="_button" @click="os.post()">
		<div :class="$style.itemInner">
			<span :class="$style.itemIcon"><i class="ti ti-plus" aria-hidden="true"></i></span>
		</div>
		<span :class="$style.itemText">{{ i18n.ts._postForm.post }}</span>
	</button>

	<button v-if="$i && $i.policies.chatAvailability !== 'unavailable'" :class="$style.item" class="_button" :aria-label="i18n.ts.chat" @click="openChat ? openChat() : mainRouter.push('/chat')">
		<div :class="$style.itemInner">
			<span :class="$style.itemIcon">
				<i class="ti ti-message-circle" aria-hidden="true"></i>
				<span v-if="$i.hasUnreadChatMessages" :class="$style.itemIndicator">
					<i class="_indicatorCircle"></i>
				</span>
			</span>
		</div>
		<span :class="$style.itemText">{{ i18n.ts.chat }}</span>
	</button>
	<button v-else :class="$style.item" class="_button" :aria-label="i18n.ts.search" @click="mainRouter.push('/search')">
		<div :class="$style.itemInner"><span :class="$style.itemIcon"><i class="ti ti-search" aria-hidden="true"></i></span></div>
		<span :class="$style.itemText">{{ i18n.ts.search }}</span>
	</button>

	<button v-if="$i" :class="$style.item" class="_button" :aria-label="i18n.ts.widgets" @click="widgetsShowing = true">
		<div :class="$style.itemInner">
			<span :class="$style.itemIcon"><i class="ti ti-apps" aria-hidden="true"></i></span>
		</div>
		<span :class="$style.itemText">{{ i18n.ts.widgets }}</span>
	</button>
	<button v-else :class="$style.item" class="_button" :aria-label="i18n.ts.login" @click="pleaseLogin({ message: '' })">
		<div :class="$style.itemInner"><span :class="$style.itemIcon"><i class="ti ti-login-2" aria-hidden="true"></i></span></div>
		<span :class="$style.itemText">{{ i18n.ts.login }}</span>
	</button>
</div>
</template>

<script lang="ts" setup>
import { computed, ref, useTemplateRef, watch } from 'vue';
import { $i } from '@/i.js';
import * as os from '@/os.js';
import { mainRouter } from '@/router.js';
import { navbarItemDef } from '@/navbar.js';
import { i18n } from '@/i18n.js';
import { pleaseLogin } from '@/utility/please-login.js';

const drawerMenuShowing = defineModel<boolean>('drawerMenuShowing');
const widgetsShowing = defineModel<boolean>('widgetsShowing');

defineProps<{
	openChat?: () => void;
}>();

const rootEl = useTemplateRef('rootEl');

const menuIndicated = computed(() => {
	for (const def in navbarItemDef) {
		if (def === 'chat') continue; // 聊天未读已在底部入口显示。
		if (navbarItemDef[def].indicated) return true;
	}
	return false;
});

const rootElHeight = ref(0);

watch(rootEl, () => {
	if (rootEl.value) {
		rootElHeight.value = rootEl.value.offsetHeight;
		window.document.body.style.setProperty('--MI-minBottomSpacing', 'var(--MI-minBottomSpacingMobile)');
	} else {
		rootElHeight.value = 0;
		window.document.body.style.setProperty('--MI-minBottomSpacing', '0px');
	}
}, {
	immediate: true,
});
</script>

<style lang="scss" module>
.root {
	position: relative;
	z-index: 1;
	padding-bottom: env(safe-area-inset-bottom, 0px);
	display: grid;
	grid-template-columns: repeat(6, minmax(0, 1fr));
	width: 100%;
	box-sizing: border-box;
	background: var(--MI_THEME-navBg);
	color: var(--MI_THEME-navFg);
	border-top: var(--MI-divider);
}

.item {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 2px;
	min-width: 0;
	padding: 6px 0;

	&.post {
		.itemInner {
			background: linear-gradient(90deg, var(--MI_THEME-buttonGradateA), var(--MI_THEME-buttonGradateB));
			color: var(--MI_THEME-fgOnAccent);

			&:hover {
				background: linear-gradient(90deg, hsl(from var(--MI_THEME-accent) h s calc(l + 5)), hsl(from var(--MI_THEME-accent) h s calc(l + 5)));
			}

			&:active {
				background: linear-gradient(90deg, hsl(from var(--MI_THEME-accent) h s calc(l + 5)), hsl(from var(--MI_THEME-accent) h s calc(l + 5)));
			}
		}
	}
}

.itemInner {
	position: relative;
	padding: 0;
	aspect-ratio: 1;
	width: 100%;
	max-width: 42px;
	margin: auto;
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: 100%;

	&:hover {
		background: var(--MI_THEME-panelHighlight);
	}

	&:active {
		background: var(--MI_THEME-panelHighlight);
	}
}

.itemIcon {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 1.28em;
	height: 1.28em;
	font-size: 15px;
}

.itemText {
	max-width: 100%;
	font-size: 1em;
	line-height: 1.35;
	white-space: nowrap;
}

.itemIndicator {
	position: absolute;
	top: -4px;
	left: 50%;
	transform-origin: top left;
	color: var(--MI_THEME-indicator);
	font-size: 10px;
	pointer-events: none;

}
</style>
