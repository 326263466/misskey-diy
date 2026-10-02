<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-if="show || $slots.actions" :class="[$style.container, { [$style.containerEmbedded]: embedded }]">
	<div ref="el" data-page-header :class="[$style.root, { [$style.embedded]: embedded, [$style.tabsBelow]: tabsBelow, [$style.scrolled]: scrolled && !embedded }]">
		<div :class="[$style.upper, { [$style.slim]: narrow, [$style.thin]: thin_, [$style.hasCustomActions]: $slots.actions }]">
			<button v-if="displayBackButton_" class="_button" :class="$style.backButton" :aria-label="i18n.ts.goBack" @click.stop="goBack"><i class="ti ti-arrow-left"></i></button>
			<div v-else-if="!thin_ && (narrow || deviceKind === 'smartphone') && props.displayMyAvatar && $i" class="_button" @click="openAccountMenu">
				<MkAvatar :class="$style.avatar" :user="$i"/>
			</div>
			<div v-else-if="!thin_ && narrow && !hideTitle && !$slots.actions && !tabsBelow" :class="$style.buttons"></div>

			<template v-if="pageMetadata">
				<div v-if="!hideTitle" :class="[$style.titleContainer, { [$style.titleContainerWithBackButton]: displayBackButton_ }]" @click="top">
					<div v-if="pageMetadata.avatar" :class="$style.titleAvatarContainer">
						<MkAvatar :class="$style.titleAvatar" :user="pageMetadata.avatar" indicator/>
					</div>
					<i v-else-if="pageMetadata.icon" :class="[$style.titleIcon, pageMetadata.icon]"></i>

					<div class="_nowrap" :class="$style.title">
						<MkUserName v-if="pageMetadata.userName" :user="pageMetadata.userName" :nowrap="true"/>
						<div v-else-if="pageMetadata.title" class="_nowrap">{{ pageMetadata.title }}</div>
						<div v-if="pageMetadata.subtitle" :class="$style.subtitle">
							{{ pageMetadata.subtitle }}
						</div>
					</div>
				</div>
				<XTabs v-if="hasTabs && !tabsBelow && (!narrow || hideTitle)" :class="$style.tabs" :tab="tab" :tabs="tabs" :rootEl="el" @update:tab="key => emit('update:tab', key)" @tabClick="onTabClick"/>
			</template>
			<div v-if="$slots.actions || (!thin_ && narrow && !hideTitle) || (actions && actions.length > 0)" :class="[$style.buttons, { [$style.customActions]: $slots.actions }]">
				<slot name="actions"></slot>
				<template v-for="action in actions">
					<button v-tooltip.icon="action.text" class="_button" :class="[$style.button, { [$style.highlighted]: action.highlighted }]" :aria-label="action.text" @click.stop="action.handler" @touchstart="preventDrag"><i :class="action.icon"></i></button>
				</template>
			</div>
		</div>
		<div v-if="(tabsBelow || (narrow && !hideTitle)) && hasTabs" :class="[$style.lower, { [$style.slim]: narrow, [$style.thin]: thin_ }]">
			<XTabs :class="$style.tabs" :tab="tab" :tabs="tabs" :rootEl="el" @update:tab="key => emit('update:tab', key)" @tabClick="onTabClick"/>
		</div>
	</div>
</div>
</template>

<script lang="ts">
import type { PageHeaderItem } from '@/types/page-header.js';
import type { PageMetadata } from '@/page.js';
import type { Tab } from './MkPageHeader.tabs.vue';

export type PageHeaderProps = {
	overridePageMetadata?: PageMetadata;
	tabs?: Tab[];
	tabsBelow?: boolean;
	tab?: string;
	actions?: PageHeaderItem[] | null;
	thin?: boolean;
	hideTitle?: boolean;
	canOmitTitle?: boolean;
	displayMyAvatar?: boolean;
	displayBackButton?: boolean;
	embedded?: boolean;
};
</script>

<script lang="ts" setup>
import { onMounted, onUnmounted, ref, inject, useTemplateRef, computed } from 'vue';
import { scrollToTop, getScrollContainer } from '@@/js/scroll.js';
import XTabs from './MkPageHeader.tabs.vue';
import { getAccountMenu } from '@/accounts.js';
import { deviceKind } from '@/utility/device-kind.js';
import { $i } from '@/i.js';
import { DI } from '@/di.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';

const props = withDefaults(defineProps<PageHeaderProps>(), {
	tabs: () => ([] as Tab[]),
});

const emit = defineEmits<{
	(ev: 'update:tab', key: string): void;
}>();

//const viewId = inject(DI.viewId);
const injectedPageMetadata = inject(DI.pageMetadata, ref(null));
const pageMetadata = computed(() => props.overridePageMetadata ?? injectedPageMetadata.value);

const hideTitle = computed(() => inject('shouldOmitHeaderTitle', false) || props.hideTitle || (props.canOmitTitle && props.tabs.length > 0));
const thin_ = props.thin || inject('shouldHeaderThin', false);
const omitBackButton = inject('shouldOmitHeaderBackButton', false);
const displayBackButton_ = computed(() => props.displayBackButton && !omitBackButton);

const el = useTemplateRef('el');
const narrow = ref(false);
const hasTabs = computed(() => props.tabs.length > 0);
const hasActions = computed(() => props.actions && props.actions.length > 0);
const show = computed(() => {
	return !hideTitle.value || hasTabs.value || hasActions.value || displayBackButton_.value;
});

const preventDrag = (ev: TouchEvent) => {
	ev.stopPropagation();
};

// 路由本身没有提供后退操作，所以直接回退浏览器历史
function goBack() {
	window.history.back();
}

const top = () => {
	if (el.value) {
		scrollToTop(el.value as HTMLElement, { behavior: 'smooth' });
	}
};

async function openAccountMenu(ev: PointerEvent) {
	const menuItems = await getAccountMenu({
		withExtraOperation: true,
	});

	os.popupMenu(menuItems, ev.currentTarget ?? ev.target);
}

function onTabClick(): void {
	top();
}

const scrolled = ref(false);
let scrollContainer: HTMLElement | null = null;
let scrollListenerTarget: EventTarget | null = null;

function onHeaderScroll() {
	scrolled.value = (scrollContainer?.scrollTop ?? window.scrollY) > 4;
}

let ro: ResizeObserver | null;

onMounted(() => {
	if (el.value && el.value.parentElement) {
		narrow.value = el.value.parentElement.offsetWidth < 500;
		ro = new ResizeObserver((entries, observer) => {
			if (el.value && el.value.parentElement && window.document.body.contains(el.value as HTMLElement)) {
				narrow.value = el.value.parentElement.offsetWidth < 500;
			}
		});
		ro.observe(el.value.parentElement as HTMLElement);
	}

	if (el.value) {
		scrollContainer = getScrollContainer(el.value as HTMLElement);
		const target: EventTarget = scrollContainer ?? window;
		scrollListenerTarget = target;
		target.addEventListener('scroll', onHeaderScroll, { passive: true });
		onHeaderScroll();
	}
});

onUnmounted(() => {
	if (ro) ro.disconnect();
	scrollListenerTarget?.removeEventListener('scroll', onHeaderScroll);
});
</script>

<style lang="scss" module>
@use "../../styles/page-header.scss";

.container {
	padding-bottom: var(--MI-pageGap);
}

.containerEmbedded {
	padding-bottom: 0;
}

.root {
	@include page-header.surface;

	// 既定はカード（パネル）と同じ不透明色。下にコンテンツが潜り込んだ時だけ半透明+ぼかし
	background: var(--MI_THEME-panel);
	-webkit-backdrop-filter: none;
	backdrop-filter: none;
	transition: background 0.2s;
}

.scrolled {
	background: color(from var(--MI_THEME-panel) srgb r g b / 0.75);
	-webkit-backdrop-filter: var(--MI-blur, blur(15px));
	backdrop-filter: var(--MI-blur, blur(15px));
}

.embedded {
	position: relative;
	background: var(--MI_THEME-panel);
	color: var(--MI_THEME-fg);
	backdrop-filter: none;
	border-bottom: none;
	border-bottom-left-radius: 0;
	border-bottom-right-radius: 0;

	&::after {
		content: '';
		position: absolute;
		inset-inline: 0;
		bottom: 0;
		height: 0.5px;
		background: var(--MI_THEME-divider);
		pointer-events: none;
	}
}

.upper,
.lower {
	width: 100%;
	background: transparent;

	&.thin {
		--height: 40px;
	}
}

.upper {
	--margin: 12px;
	display: flex;
	gap: var(--margin);
	align-items: center;
	height: var(--height);

	.tabs:first-child {
		padding: 0 12px;
	}

	.tabs {
		flex: 1;
		min-width: 0;
		margin-right: auto;
	}

	&.thin {
		--margin: 8px;

		> .buttons {
			> .button {
				font-size: 0.9em;
			}
		}
	}

	&.slim {
		text-align: center;

		.titleContainer {
			margin: 0 auto;
			max-width: 100%;
		}
	}

	&.hasCustomActions {
		row-gap: 0;
		height: auto;
		min-height: var(--height);

		.titleContainer {
			min-height: var(--height);
		}
	}
}

.lower {
	height: var(--height);
}

.tabsBelow {
	.upper .titleContainer {
		flex: 1;
		max-width: none;
		margin-left: 16px;
		margin-right: 0;
	}

	.lower {
		--height: 44px;
		box-sizing: border-box;
		padding: 0 8px;
		box-shadow: inset 0 1px var(--MI_THEME-divider);
	}

	.title > div {
		overflow: hidden;
		text-overflow: ellipsis;
	}
}

.buttons {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	margin-left: auto;
	min-width: var(--height);
	height: var(--height);
	padding-right: 8px;
	&:empty {
		width: var(--height);
	}
}

.customActions {
	box-sizing: border-box;
	height: auto;
	min-height: var(--height);
	max-width: calc(100% - 16px);
	flex-wrap: wrap;
	justify-content: flex-end;
	margin-left: auto;
	padding: 0 8px 0 0;
}

.avatar {
	$size: 32px;
	display: inline-block;
	width: $size;
	height: $size;
	vertical-align: bottom;
	margin: 0 8px;
}

.button {
	@include page-header.action;
	position: relative;

	&.highlighted {
		color: var(--MI_THEME-accent);
	}
}

.fullButton {
	& + .fullButton {
		margin-left: 12px;
	}
}

.backButton {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 34px;
	height: 34px;
	margin-left: 8px;
	box-sizing: border-box;
	border-radius: 100%;
	font-size: 1.1em;

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
	}
}

.titleContainer {
	display: flex;
	align-items: center;
	min-width: 0;
	max-width: min(30vw, 400px);
	overflow: clip;
	white-space: nowrap;
	text-align: left;
	font-weight: bold;
	flex-shrink: 1;
	margin-left: 12px;

	/* 返回按钮已经占据了左侧空间，标题不再需要额外缩进 */
	&.titleContainerWithBackButton {
		margin-left: 0;
	}
}

.titleAvatarContainer {
	$size: 32px;
	contain: strict;
	overflow: clip;
	width: $size;
	height: $size;
	padding: 8px;
	flex-shrink: 0;
}

.titleAvatar {
	width: 100%;
	height: 100%;
	pointer-events: none;
}

.titleIcon {
	margin-right: 8px;
	width: 16px;
	text-align: center;
}

.title {
	min-width: 0;
	line-height: 1.1;
}

.subtitle {
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.8em;
	font-weight: normal;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;

	&.activeTab {
		color: var(--MI_THEME-fgTransparent);
		text-align: center;

		> .chevron {
			display: inline-block;
			margin-left: 6px;
		}
	}
}
</style>
