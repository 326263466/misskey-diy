<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl" :class="$style.root" :data-expanded="showBody">
	<header :class="$style.header" class="_button" data-foldable-section-header @click="showBody = !showBody">
		<div :id="titleId" :class="$style.title" data-foldable-section-title><div><slot name="header"></slot></div></div>
		<div :class="$style.divider" data-foldable-section-divider></div>
		<button type="button" class="_button" :class="$style.button" data-foldable-section-toggle :aria-expanded="showBody" :aria-controls="bodyId" :aria-labelledby="titleId">
			<i v-if="showBody" class="ti ti-chevron-up" aria-hidden="true"></i>
			<i v-else class="ti ti-chevron-down" aria-hidden="true"></i>
		</button>
	</header>
	<Transition
		:enterActiveClass="prefer.s.animation ? $style.folderToggleEnterActive : ''"
		:leaveActiveClass="prefer.s.animation ? $style.folderToggleLeaveActive : ''"
		:enterFromClass="prefer.s.animation ? $style.folderToggleEnterFrom : ''"
		:leaveToClass="prefer.s.animation ? $style.folderToggleLeaveTo : ''"
	>
		<div v-show="showBody" :id="bodyId" :class="$style.body" data-foldable-section-body>
			<div :class="$style.bodyInner" data-foldable-section-body-inner>
				<div :class="$style.bodyPadding" data-foldable-section-body-padding>
					<slot></slot>
				</div>
			</div>
		</div>
	</Transition>
</div>
</template>

<script lang="ts" setup>
import { onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import { miLocalStorage } from '@/local-storage.js';
import { prefer } from '@/preferences.js';
import { themeManager } from '@/theme.js';
import { getBgColor } from '@/utility/get-bg-color.js';
import { genId } from '@/utility/id.js';

const miLocalStoragePrefix = 'ui:folder:' as const;

const props = withDefaults(defineProps<{
	expanded?: boolean;
	persistKey?: string | null;
}>(), {
	expanded: true,
	persistKey: null,
});

const rootEl = useTemplateRef('rootEl');
const titleId = `foldable-title-${genId()}`;
const bodyId = `foldable-body-${genId()}`;
const parentBg = ref<string | null>(null);
// eslint-disable-next-line vue/no-setup-props-reactivity-loss
const showBody = ref((props.persistKey && miLocalStorage.getItem(`${miLocalStoragePrefix}${props.persistKey}`)) ? (miLocalStorage.getItem(`${miLocalStoragePrefix}${props.persistKey}`) === 't') : props.expanded);

watch(showBody, () => {
	if (props.persistKey) {
		miLocalStorage.setItem(`${miLocalStoragePrefix}${props.persistKey}`, showBody.value ? 't' : 'f');
	}
});

function updateBgColor() {
	if (rootEl.value) parentBg.value = getBgColor(rootEl.value.parentElement);
}

onMounted(() => {
	updateBgColor();
	themeManager.on('themeChanging', updateBgColor);
});

onBeforeUnmount(() => {
	themeManager.off('themeChanging', updateBgColor);
});
</script>

<style lang="scss" module>
.folderToggleEnterActive, .folderToggleLeaveActive {
	overflow: clip;
	// 只过渡 grid-template-rows: 混入 opacity 会让包含图表的内容在动画首尾
	// 反复提升/移除合成层, 造成一次明显的掉帧; 时长压短减少逐帧重排的暴露窗口
	transition: grid-template-rows 0.25s !important;
}

.body.folderToggleEnterFrom, .body.folderToggleLeaveTo {
	grid-template-rows: 0fr;
}

.body {
	display: grid;
	grid-template-rows: 1fr;
}

.bodyInner {
	--MI-formGroupInset: 0px;
	// 网格项自身不能有内边距: auto 最小尺寸会含内边距, 折叠时把轨道顶在残留高度上
	min-height: 0;
	display: flow-root;
}

.bodyPadding {
	--MI-formGroupRadius: initial;
}

.root {
	margin-inline: calc(0px - var(--MI-formGroupInset, 0px));
	position: relative;
	// 保留折叠区域内的 sticky 范围，不给内容额外套卡片。
	overflow: clip;
}

.header {
	display: flex;
	position: sticky;
	top: var(--MI-stickyTop, 0px);
	z-index: 10;
	-webkit-backdrop-filter: var(--MI-blur, blur(8px));
	backdrop-filter: var(--MI-blur, blur(20px));
	background-color: color(from v-bind("parentBg ?? 'var(--MI_THEME-bg)'") srgb r g b / 0.85);
}

.title {
	display: grid;
	place-content: center;
	margin: 0;
	padding: 12px 16px 12px 0;
}

.divider {
	flex: 1;
	margin: auto;
	height: var(--MI-dividerWidth);
	background: var(--MI-dividerColor);
}

.button {
	padding: 12px 0 12px 16px;
}

@container (max-width: 500px) {
	.title {
		padding: 8px 10px 8px 0;
	}

}
</style>
