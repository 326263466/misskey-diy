<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl" :class="$style.root" role="group" :aria-expanded="opened">
	<MkStickyContainer>
		<template #header>
			<button :class="[$style.header, { [$style.opened]: opened }]" class="_button" role="button" data-testid="folder-header" @click="toggle">
				<div :class="$style.headerIcon"><slot name="icon"></slot></div>
				<div :class="$style.headerText">
					<div :class="$style.headerTextMain">
						<MkCondensedLine :minScale="2 / 3"><slot name="label"></slot></MkCondensedLine>
					</div>
					<div :class="$style.headerTextSub">
						<slot name="caption"></slot>
					</div>
				</div>
				<div :class="$style.headerRight">
					<span :class="$style.headerRightText"><slot name="suffix"></slot></span>
					<i v-if="asPage" class="ti ti-chevron-right icon"></i>
					<i v-else-if="opened" class="ti ti-chevron-up icon"></i>
					<i v-else class="ti ti-chevron-down icon"></i>
				</div>
			</button>
		</template>

		<div v-if="asPage">
			<Teleport v-if="opened" defer :to="`#v-${pageId}-header`">
				<slot name="label"></slot>
			</Teleport>
			<Teleport v-if="opened" defer :to="`#v-${pageId}-body`">
				<MkStickyContainer>
					<template #header>
						<div v-if="$slots.header" :class="$style.inBodyHeader">
							<slot name="header"></slot>
						</div>
					</template>

					<div v-if="withSpacer" class="_spacer" :class="$style.spacer" :style="spacerStyle">
						<slot></slot>
					</div>
					<div v-else>
						<slot></slot>
					</div>

					<template #footer>
						<div v-if="$slots.footer" :class="$style.inBodyFooter">
							<slot name="footer"></slot>
						</div>
					</template>
				</MkStickyContainer>
			</Teleport>
		</div>

		<div v-else-if="openedAtLeastOnce" :class="$style.body" :style="{ maxHeight: maxHeight ? `${maxHeight}px` : undefined, overflow: maxHeight ? `auto` : undefined }" :aria-hidden="!opened">
			<Transition
				:enterActiveClass="prefer.s.animation ? $style.transition_toggle_enterActive : ''"
				:leaveActiveClass="prefer.s.animation ? $style.transition_toggle_leaveActive : ''"
				:enterFromClass="prefer.s.animation ? $style.transition_toggle_enterFrom : ''"
				:leaveToClass="prefer.s.animation ? $style.transition_toggle_leaveTo : ''"
			>
				<KeepAlive>
					<div v-show="opened" :class="$style.bodyContent">
						<div :class="$style.bodyInner">
							<MkStickyContainer>
								<template #header>
									<div v-if="$slots.header" :class="$style.inBodyHeader">
										<slot name="header"></slot>
									</div>
								</template>

								<div v-if="withSpacer" class="_spacer" :class="$style.spacer" :style="spacerStyle">
									<slot></slot>
								</div>
								<div v-else>
									<slot></slot>
								</div>

								<template #footer>
									<div v-if="$slots.footer" :class="$style.inBodyFooter">
										<slot name="footer"></slot>
									</div>
								</template>
							</MkStickyContainer>
						</div>
					</div>
				</KeepAlive>
			</Transition>
		</div>
	</MkStickyContainer>
</div>
</template>

<script lang="ts" setup>
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';
import { prefer } from '@/preferences.js';
import { pageFolderTeleportCount, popup } from '@/os.js';
import MkFolderPage from '@/components/MkFolderPage.vue';
import { deviceKind } from '@/utility/device-kind.js';

const props = withDefaults(defineProps<{
	defaultOpen?: boolean;
	maxHeight?: number | null;
	withSpacer?: boolean;
	spacerMin?: number;
	spacerMax?: number;
	canPage?: boolean;
}>(), {
	defaultOpen: false,
	maxHeight: null,
	withSpacer: true,
	canPage: true,
});

const emit = defineEmits<{
	(ev: 'opened'): void;
	(ev: 'closed'): void;
}>();

const rootEl = useTemplateRef('rootEl');
const asPage = props.canPage && deviceKind === 'smartphone' && prefer.s['experimental.enableFolderPageView'];
const spacerStyle = computed(() => ({
	'--MI_SPACER-min': props.spacerMin == null ? 'var(--MI-cardPadding)' : `${props.spacerMin}px`,
	'--MI_SPACER-max': props.spacerMax == null ? 'var(--MI-cardPadding)' : `${props.spacerMax}px`,
}));
const opened = ref(asPage ? false : props.defaultOpen);
const openedAtLeastOnce = ref(opened.value);

let pageId = pageFolderTeleportCount.value;
pageFolderTeleportCount.value += 1000;

async function toggle(ev: PointerEvent) {
	if (asPage && !opened.value) {
		pageId++;
		const { dispose } = await popup(MkFolderPage, {
			pageId,
		}, {
			closed: () => {
				opened.value = false;
				dispose();
			},
		});
	}

	if (!opened.value) {
		openedAtLeastOnce.value = true;
	}

	nextTick(() => {
		opened.value = !opened.value;
	});
}

watch(opened, (isOpened) => {
	if (isOpened) {
		emit('opened');
	} else {
		emit('closed');
	}
}, { flush: 'post' });
</script>

<style lang="scss" module>
.transition_toggle_enterActive,
.transition_toggle_leaveActive {
	// 创建滚动容器会改变内部 sticky 头部的定位基准
	overflow: clip;
	// 与 MkFoldableSection 一致: 只过渡高度, 不混 opacity (图表/表单重内容的合成层反复升降会掉帧)
	transition: grid-template-rows 0.25s;
}

.bodyContent.transition_toggle_enterFrom,
.bodyContent.transition_toggle_leaveTo {
	grid-template-rows: 0fr;
}

.root {
	display: block;
	// A padded form owns the inset: stretch groups into it, then apply it once.
	margin-inline: calc(0px - var(--MI-formGroupInset, 0px));
	background: var(--MI_THEME-panel);
	border-radius: var(--MI-formGroupRadius, var(--MI-cardRadius));
}

.header {
	display: flex;
	align-items: center;
	width: 100%;
	box-sizing: border-box;
	padding: 12px var(--MI-cardPadding);
	background: var(--MI_THEME-panelHighlight);
	-webkit-backdrop-filter: var(--MI-blur, blur(15px));
	backdrop-filter: var(--MI-blur, blur(15px));
	border-radius: var(--MI-formGroupRadius, var(--MI-cardRadius));
	transition: border-radius 0.3s;

	&:hover {
		text-decoration: none;
	}

	&:focus-within {
		outline-offset: 2px;
	}

	&.active {
		color: var(--MI_THEME-accent);
		background: var(--MI_THEME-folderHeaderHoverBg);

		.headerIcon {
			color: inherit;
		}
	}

	&.opened {
		border-radius: var(--MI-formGroupRadius, var(--MI-cardRadius)) var(--MI-formGroupRadius, var(--MI-cardRadius)) 0 0;
		box-shadow: inset 0 -1px var(--MI_THEME-divider);
	}
}

.headerUpper {
	display: flex;
	align-items: center;
}

.headerLower {
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: .85em;
	padding-left: 4px;
}

.headerIcon {
	margin-right: 0.75em;
	flex-shrink: 0;
	text-align: center;
	color: var(--MI_THEME-fgTransparentWeak);

	&:empty {
		display: none;
	}
}

.headerText {
	white-space: nowrap;
	text-overflow: ellipsis;
	overflow: hidden;
	padding-right: 12px;
}

.headerTextMain,
.headerTextSub {
	width: fit-content;
	max-width: 100%;
}

.headerTextMain {
	color: var(--MI_THEME-fg);
}

.headerTextSub {
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: .85em;
}

.headerRight {
	margin-left: auto;
	color: var(--MI_THEME-fgTransparentWeak);
	white-space: nowrap;
}

.headerRightText:not(:empty) {
	margin-right: 0.75em;
}

.body {
	--MI-formGroupInset: 0px;
	background: var(--MI_THEME-panel);
	border-radius: 0 0 var(--MI-formGroupRadius, var(--MI-cardRadius)) var(--MI-formGroupRadius, var(--MI-cardRadius));
	container-type: inline-size;
}

.bodyContent {
	display: grid;
	grid-template-rows: 1fr;
}

.bodyInner {
	// Keep sticky content at its natural height while its outer track collapses.
	min-height: 0;
	display: flow-root;
}

.spacer {
	--MI-formGroupInset: var(--MI_SPACER-max, var(--MI-cardPadding));
	--MI-formGroupRadius: 0px;
}

:global(._forceShrinkSpacer) .spacer {
	--MI-formGroupInset: var(--MI_SPACER-min, var(--MI-cardPadding));
}

@container (max-width: 450px) {
	.spacer {
		--MI-formGroupInset: var(--MI_SPACER-min, var(--MI-cardPadding));
	}
}

.inBodyHeader {
	background: var(--MI_THEME-panel);
	border-bottom: solid 0.5px var(--MI_THEME-divider);
}

.inBodyFooter {
	padding: var(--MI-cardPadding);
	background: var(--MI_THEME-panel);
	border-top: 1px solid var(--MI_THEME-divider);
	border-radius: 0 0 var(--MI-formGroupRadius, var(--MI-cardRadius)) var(--MI-formGroupRadius, var(--MI-cardRadius));
}
</style>
