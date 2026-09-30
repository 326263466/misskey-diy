<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl" class="_panel" :class="[$style.root, { [$style.naked]: naked, [$style.thin]: thin, [$style.scrollable]: scrollable }]">
	<header v-if="showHeader" ref="headerEl" :class="$style.header">
		<div :class="$style.title">
			<span :class="$style.titleIcon"><slot name="icon"></slot></span>
			<slot name="header"></slot>
		</div>
		<div :class="$style.headerSub">
			<slot name="func" :buttonStyleClass="$style.headerButton"></slot>
			<button v-if="foldable" :class="$style.headerButton" class="_button" @click="() => showBody = !showBody">
				<template v-if="showBody"><i class="ti ti-chevron-up"></i></template>
				<template v-else><i class="ti ti-chevron-down"></i></template>
			</button>
		</div>
	</header>
	<Transition
		:enterActiveClass="prefer.s.animation ? $style.transition_toggle_enterActive : ''"
		:leaveActiveClass="prefer.s.animation ? $style.transition_toggle_leaveActive : ''"
		:enterFromClass="prefer.s.animation ? $style.transition_toggle_enterFrom : ''"
		:leaveToClass="prefer.s.animation ? $style.transition_toggle_leaveTo : ''"
	>
		<div v-show="showBody" ref="contentEl" :class="[$style.content, { [$style.omitted]: omitted }]">
			<div :class="$style.bodyInner">
				<slot></slot>
			</div>
			<button v-if="omitted" :class="$style.fade" class="_button" @click="showMore">
				<span :class="$style.fadeLabel">{{ i18n.ts.showMore }}</span>
			</button>
		</div>
	</Transition>
</div>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue';
import { prefer } from '@/preferences.js';
import { i18n } from '@/i18n.js';

const props = withDefaults(defineProps<{
	showHeader?: boolean;
	thin?: boolean;
	naked?: boolean;
	foldable?: boolean;
	scrollable?: boolean;
	expanded?: boolean;
	maxHeight?: number | null;
}>(), {
	expanded: true,
	showHeader: true,
	maxHeight: null,
});

const rootEl = useTemplateRef('rootEl');
const contentEl = useTemplateRef('contentEl');
const headerEl = useTemplateRef('headerEl');
const showBody = ref(props.expanded);
const ignoreOmit = ref(false);
const omitted = ref(false);

const calcOmit = () => {
	if (omitted.value || ignoreOmit.value || props.maxHeight == null) return;
	if (!contentEl.value) return;
	const height = contentEl.value.offsetHeight;
	omitted.value = height > props.maxHeight;
};

const omitObserver = new ResizeObserver((entries, observer) => {
	calcOmit();
});

function showMore() {
	ignoreOmit.value = true;
	omitted.value = false;
}

onMounted(() => {
	watch(showBody, v => {
		if (!rootEl.value) return;
		const headerHeight = props.showHeader ? headerEl.value?.offsetHeight ?? 0 : 0;
		rootEl.value.style.minHeight = `${headerHeight}px`;
		if (v) {
			rootEl.value.style.flexBasis = 'auto';
		} else {
			rootEl.value.style.flexBasis = `${headerHeight}px`;
		}
	}, {
		immediate: true,
	});

	if (rootEl.value) rootEl.value.style.setProperty('--maxHeight', props.maxHeight + 'px');

	calcOmit();

	if (contentEl.value) omitObserver.observe(contentEl.value);
});

onUnmounted(() => {
	omitObserver.disconnect();
});
</script>

<style lang="scss" module>
.transition_toggle_enterActive,
.transition_toggle_leaveActive {
	overflow: clip;
	transition: opacity 0.5s, grid-template-rows 0.5s !important;
}
.content.transition_toggle_enterFrom,
.content.transition_toggle_leaveTo {
	grid-template-rows: 0fr;
	opacity: 0;
}

.root {
	position: relative;
	overflow: clip;
	contain: content;

	&.naked {
		background: transparent !important;
		box-shadow: none !important;

		> .content {
			background: transparent !important;
		}
	}

	&.scrollable {
		display: flex;
		flex-direction: column;

		> .content {
			overflow: auto;
			// 保留滚动能力，仅隐藏滚动条
			scrollbar-width: none;

			&::-webkit-scrollbar {
				display: none;
			}
		}
	}

	&.thin {
		> .header {
			> .title {
				min-height: 36px;
				padding: 0 10px;
				font-size: 0.9em;
			}
		}
	}
}

.header {
	position: sticky;
	top: var(--MI-stickyTop, 0px);
	left: 0;
	color: var(--MI_THEME-panelHeaderFg);
	background: var(--MI_THEME-panelHeaderBg);
	z-index: 2;
	line-height: 1.4em;
}

@container style(--MI_THEME-panelHeaderBg: var(--MI_THEME-panel)) {
	.header {
		box-shadow: 0 0.5px 0 0 light-dark(#0002, #fff2);
	}
}

.title {
	display: flex;
	align-items: center;
	box-sizing: border-box;
	// 高度写死，标题文字和图标靠 align-items 在表头高度内垂直居中，不依赖上下 padding 对称。
	// 行高必须保留（继承表头的 1.4em）：压到 1 时行盒正好等于 1em，而中日文字体的
	// ascent+descent 超过 1em，溢出量会按字体比例偏向一侧，墨迹反而压不到正中
	min-height: 44px;
	margin: 0;
	padding: 0 var(--MI-cardPadding, 20px);

	&:empty {
		display: none;
	}
}

.titleIcon {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	margin-right: 6px;

	// 没传图标时这里是个空 span，留着 margin 会让标题文字比下方内容多缩进 6px
	&:empty {
		display: none;
	}
}

.headerSub {
	display: flex;
	align-items: center;
	position: absolute;
	z-index: 2;
	top: 0;
	right: 0;
	height: 100%;
}

.headerButton {
	width: 42px;
	height: 100%;
}

.content {
	display: grid;
	grid-template-rows: 1fr;
	--MI-stickyTop: 0px;

	/*
	理屈は知らないけど、ここでbackgroundを設定しておかないと
	スクロールコンテナーが少なくともChromeにおいて
	main thread scrolling になってしまい、パフォーマンスが(多分)落ちる。
	backgroundが透明だと裏側を描画しないといけなくなるとかそういう理由かもしれない
	*/
	background: var(--MI_THEME-panel);

	&.omitted {
		position: relative;
		max-height: var(--maxHeight);
		overflow: hidden;

		> .fade {
			display: block;
			position: absolute;
			z-index: 10;
			bottom: 0;
			left: 0;
			width: 100%;
			height: 64px;
			background: linear-gradient(0deg, var(--MI_THEME-panel), color(from var(--MI_THEME-panel) srgb r g b / 0));

			> .fadeLabel {
				display: inline-block;
				background: var(--MI_THEME-panel);
				padding: 6px 10px;
				font-size: 0.8em;
				border-radius: 999px;
				box-shadow: 0 2px 6px rgb(0 0 0 / 20%);
			}

			&:hover {
				> .fadeLabel {
					background: var(--MI_THEME-panelHighlight);
				}
			}
		}
	}
}

.bodyInner {
	min-height: 0;
	display: flow-root;
}

@container (max-width: 380px) {
	.title {
		min-height: 36px;
		padding: 0 var(--MI-cardPadding, 20px);
		font-size: 0.9em;
	}
}
</style>
