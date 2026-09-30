<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<header :class="$style.header" class="_button" @click="showBody = !showBody">
		<div :class="$style.title"><div><slot name="header"></slot></div></div>
		<div :class="$style.divider"></div>
		<button class="_button" :class="$style.button">
			<template v-if="showBody"><i class="ti ti-chevron-up"></i></template>
			<template v-else><i class="ti ti-chevron-down"></i></template>
		</button>
	</header>
	<Transition
		:enterActiveClass="prefer.s.animation ? $style.folderToggleEnterActive : ''"
		:leaveActiveClass="prefer.s.animation ? $style.folderToggleLeaveActive : ''"
		:enterFromClass="prefer.s.animation ? $style.folderToggleEnterFrom : ''"
		:leaveToClass="prefer.s.animation ? $style.folderToggleLeaveTo : ''"
	>
		<div v-show="showBody" :class="$style.body">
			<div :class="$style.bodyInner">
				<div :class="$style.bodyPadding">
					<slot></slot>
				</div>
			</div>
		</div>
	</Transition>
</div>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import { miLocalStorage } from '@/local-storage.js';
import { prefer } from '@/preferences.js';

const miLocalStoragePrefix = 'ui:folder:' as const;

const props = withDefaults(defineProps<{
	expanded?: boolean;
	persistKey?: string | null;
}>(), {
	expanded: true,
	persistKey: null,
});

// eslint-disable-next-line vue/no-setup-props-reactivity-loss
const showBody = ref((props.persistKey && miLocalStorage.getItem(`${miLocalStoragePrefix}${props.persistKey}`)) ? (miLocalStorage.getItem(`${miLocalStoragePrefix}${props.persistKey}`) === 't') : props.expanded);

watch(showBody, () => {
	if (props.persistKey) {
		miLocalStorage.setItem(`${miLocalStoragePrefix}${props.persistKey}`, showBody.value ? 't' : 'f');
	}
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
	// 网格项自身不能有内边距: auto 最小尺寸会含内边距, 折叠时把轨道顶在残留高度上
	min-height: 0;
	display: flow-root;
}

.bodyPadding {
	padding: 0 16px 16px;
}

.root {
	position: relative;
	// 标题与内容合成一张整卡, 折叠时只留标题行
	// (overflow: clip 裁出圆角, header 的 sticky 因此只在卡片内生效, 不再悬浮于页面)
	background: var(--MI_THEME-panel);
	border-radius: var(--MI-cardRadius);
	overflow: clip;
}

.header {
	display: flex;
	position: sticky;
	top: var(--MI-stickyTop, 0px);
	z-index: 10;
	background-color: var(--MI_THEME-panel);
}

.title {
	display: grid;
	place-content: center;
	margin: 0;
	padding: 12px 16px;
}

.divider {
	flex: 1;
	margin: auto;
	height: 1px;
	background: var(--MI_THEME-divider);
}

.button {
	padding: 12px 16px;
}

@container (max-width: 500px) {
	.title {
		padding: 8px 10px;
	}

	.button {
		padding: 8px 10px;
	}

	.bodyPadding {
		padding: 0 10px 10px;
	}
}
</style>
