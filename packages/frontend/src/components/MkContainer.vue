<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl" class="_panel _card" :class="[$style.root, { [$style.naked]: naked, [$style.thin]: thin, [$style.scrollable]: scrollable, [$style.stickyHeader]: stickyHeader, [$style.flatBody]: !showHeader || !foldable }]">
	<header v-if="showHeader" ref="headerEl" :class="$style.header">
		<h2 :class="$style.title">
			<span :class="$style.titleIcon"><slot name="icon"></slot></span>
			<slot name="header"></slot>
		</h2>
		<div :class="$style.headerSub">
			<slot name="func" :buttonStyleClass="$style.headerButton"></slot>
			<button v-if="foldable" :class="$style.headerButton" class="_button _iconButton" @click="() => showBody = !showBody">
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
				<span class="_textAction" :class="$style.fadeLabel">{{ i18n.ts.showMore }}</span>
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
	stickyHeader?: boolean;
	expanded?: boolean;
	maxHeight?: number | null;
}>(), {
	expanded: true,
	showHeader: true,
	stickyHeader: true,
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
@use '@/styles/card-header.scss';

.transition_toggle_enterActive,
.transition_toggle_leaveActive {
	overflow: clip;
	transition: grid-template-rows 0.25s !important;
}
.content.transition_toggle_enterFrom,
.content.transition_toggle_leaveTo {
	grid-template-rows: 0fr;
}

.root {
	background: var(--MI_THEME-panel);
	position: relative;
	overflow: clip;
	contain: content;

	&.naked {
		background: transparent !important;
		box-shadow: none !important;
		border: 0;

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
			padding-block: card-header.$compactPadding;
		}
	}
}

.header {
	@include card-header.row;
	display: flex;
	align-items: center;
	gap: 8px;
	position: relative;
	padding-inline: var(--MI-cardPadding);
	color: var(--MI_THEME-fg);
	background: var(--MI-containerHeaderBg, var(--MI_THEME-panel));
	z-index: 2;
	line-height: 1.4em;
}

.stickyHeader > .header {
	position: sticky;
	top: var(--MI-stickyTop, 0px);
	left: 0;
}

.title {
	@include card-header.label;
	flex: 1;
	min-width: 0;
	display: flex;
	align-items: center;
	box-sizing: border-box;
	margin: 0;

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
	flex-shrink: 0;
	align-items: center;
	align-self: stretch;
	z-index: 2;

	&:empty {
		display: none;
	}
}

.headerButton {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	align-self: stretch;
	width: 42px;
	min-height: 24px;
}

.flatBody {
	--MI-containerBodyBg: var(--MI_THEME-panel);
}

.content {
	display: grid;
	grid-template-rows: 1fr;
	--MI-stickyTop: 0px;

	// 理屈は知らないけど、ここでbackgroundを設定しておかないと
	// スクロールコンテナーが少なくともChromeにおいて
	// main thread scrolling になってしまい、パフォーマンスが(多分)落ちる。
	// backgroundが透明だと裏側を描画しないといけなくなるとかそういう理由かもしれない
	background: var(--MI-containerBodyBg, var(--MI_THEME-panel));

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
			background: linear-gradient(0deg, var(--MI-containerBodyBg, var(--MI_THEME-panel)), color(from var(--MI-containerBodyBg, var(--MI_THEME-panel)) srgb r g b / 0));

			> .fadeLabel {
				display: inline-block;
				background: var(--MI-containerBodyBg, var(--MI_THEME-panel));
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
	// 网格项默认按内容最小宽度撑开，长文本会越过卡片内边距；设 0 才能让内部省略号生效。
	min-width: 0;
	min-height: 0;
	display: flow-root;
}
</style>
