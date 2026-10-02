<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<Teleport :to="fullscreenTarget ?? 'body'" :disabled="fullscreenTarget == null">
<Transition
	:name="transitionName"
	:enterActiveClass="normalizeClass({
		[$style.transition_modalDrawer_enterActive]: transitionName === 'modal-drawer',
		[$style.transition_modalPopup_enterActive]: transitionName === 'modal-popup',
		[$style.transition_modal_enterActive]: transitionName === 'modal',
		[$style.transition_send_enterActive]: transitionName === 'send',
	})"
	:leaveActiveClass="normalizeClass({
		[$style.transition_modalDrawer_leaveActive]: transitionName === 'modal-drawer',
		[$style.transition_modalPopup_leaveActive]: transitionName === 'modal-popup',
		[$style.transition_modal_leaveActive]: transitionName === 'modal',
		[$style.transition_send_leaveActive]: transitionName === 'send',
	})"
	:enterFromClass="normalizeClass({
		[$style.transition_modalDrawer_enterFrom]: transitionName === 'modal-drawer',
		[$style.transition_modalPopup_enterFrom]: transitionName === 'modal-popup',
		[$style.transition_modal_enterFrom]: transitionName === 'modal',
		[$style.transition_send_enterFrom]: transitionName === 'send',
	})"
	:leaveToClass="normalizeClass({
		[$style.transition_modalDrawer_leaveTo]: transitionName === 'modal-drawer',
		[$style.transition_modalPopup_leaveTo]: transitionName === 'modal-popup',
		[$style.transition_modal_leaveTo]: transitionName === 'modal',
		[$style.transition_send_leaveTo]: transitionName === 'send',
	})"
	:duration="transitionDuration" appear @afterLeave="onClosed" @enter="emit('opening')" @afterEnter="onOpened"
>
	<div v-show="manualShowing != null ? manualShowing : showing" ref="modalRootEl" v-hotkey.global="keymap" v-bind="$attrs" :class="[$style.root, { [$style.drawer]: type === 'drawer', [$style.dialog]: type === 'dialog', [$style.popup]: type === 'popup', [$style.menu]: menu, [$style.fullScreen]: fullScreen }]" :style="{ zIndex, pointerEvents: (manualShowing != null ? manualShowing : showing) ? 'auto' : 'none', '--transformOrigin': transformOrigin }">
		<div data-testid="bg" :data-test-is-transparent="isEnableBgTransparent" class="_modalBg" :class="[$style.bg, { [$style.bgTransparent]: isEnableBgTransparent }]" :style="{ zIndex }" @click="onBgClick" @mousedown="onBgClick" @contextmenu.prevent.stop="() => {}"></div>
		<div ref="content" :class="[$style.content, { [$style.fixed]: fixed }]" :style="{ zIndex }" @click.self="onBgClick">
			<slot :max-height="maxHeight" :type="type" :guardInitialPointer="menuOverlapsAnchor" :anchorWidth="anchorWidth"></slot>
		</div>
	</div>
</Transition>
</Teleport>
</template>

<script lang="ts" setup>
import { nextTick, normalizeClass, onMounted, onUnmounted, provide, watch, ref, useTemplateRef, computed } from 'vue';
import type { Keymap } from '@/utility/hotkey.js';
import * as os from '@/os.js';
import { isTouchUsing } from '@/utility/touch.js';
import { deviceKind } from '@/utility/device-kind.js';
import { focusTrap } from '@/utility/focus-trap.js';
import { focusParent } from '@/utility/focus.js';
import { prefer } from '@/preferences.js';
import { DI } from '@/di.js';
import { calcDropdownPosition } from '@/utility/menu-position.js';

defineOptions({ inheritAttrs: false });

function getFixedContainer(el: Element | null): Element | null {
	if (el == null || el.tagName === 'BODY') return null;
	const position = window.getComputedStyle(el).getPropertyValue('position');
	if (position === 'fixed') {
		return el;
	} else {
		return getFixedContainer(el.parentElement);
	}
}

type ModalTypes = 'popup' | 'dialog' | 'drawer';

// Menus opened in a fullscreen player must remain in the fullscreen subtree.
const fullscreenTarget = window.document.fullscreenElement;

const props = withDefaults(defineProps<{
	manualShowing?: boolean | null;
	anchor?: { x: string; y: string; };
	anchorElement?: HTMLElement | null;
	align?: 'left' | 'center' | 'right';
	preferType?: ModalTypes | 'auto';
	zPriority?: 'low' | 'middle' | 'high';
	noOverlap?: boolean;
	menu?: boolean;
	menuMatchAnchorWidth?: boolean;
	getContentHeight?: () => number | undefined;
	transparentBg?: boolean;
	fullScreen?: boolean;
	hasInteractionWithOtherFocusTrappedEls?: boolean;
	returnFocusTo?: HTMLElement | null;
}>(), {
	manualShowing: null,
	anchorElement: null,
	align: 'center',
	anchor: () => ({ x: 'center', y: 'bottom' }),
	preferType: 'auto',
	zPriority: 'low',
	noOverlap: true,
	menu: false,
	menuMatchAnchorWidth: false,
	transparentBg: false,
	fullScreen: false,
	hasInteractionWithOtherFocusTrappedEls: false,
	returnFocusTo: null,
});

const emit = defineEmits<{
	(ev: 'opening'): void;
	(ev: 'opened'): void;
	(ev: 'click'): void;
	(ev: 'esc'): void;
	(ev: 'close'): void; // TODO: (refactor) closing に改名する
	(ev: 'closed'): void;
}>();

provide(DI.inModal, true);

const maxHeight = ref<number>();
const anchorWidth = ref<number>();
const menuOverlapsAnchor = ref(false);
const fixed = ref(false);
const transformOrigin = ref('center');
const showing = ref(true);
const modalRootEl = useTemplateRef('modalRootEl');
const content = useTemplateRef('content');
const zIndex = os.claimZIndex(props.zPriority);
const useSendAnime = ref(false);
const type = computed<ModalTypes>(() => {
	if (props.preferType === 'auto') {
		if ((prefer.s.menuStyle === 'drawer') || (prefer.s.menuStyle === 'auto' && isTouchUsing && deviceKind === 'smartphone')) {
			return 'drawer';
		} else {
			return props.anchorElement != null ? 'popup' : 'dialog';
		}
	} else {
		return props.preferType!;
	}
});
const isEnableBgTransparent = computed(() => props.transparentBg && (type.value === 'popup'));
const transitionName = computed((() =>
	prefer.s.animation
		? useSendAnime.value
			? 'send'
			: type.value === 'drawer'
				? 'modal-drawer'
				: type.value === 'popup'
					? 'modal-popup'
					: 'modal'
		: ''
));
const transitionDuration = computed((() =>
	transitionName.value === 'send'
		? 400
		: transitionName.value === 'modal-popup'
			? 100
			: transitionName.value === 'modal'
				? 200
				: transitionName.value === 'modal-drawer'
					? 200
					: 0
));

let releaseFocusTrap: (() => void) | null = null;
let contentClicking = false;

function close(opts: { useSendAnimation?: boolean } = {}) {
	if (opts.useSendAnimation) {
		useSendAnime.value = true;
	}

	if (props.anchorElement) props.anchorElement.style.pointerEvents = 'auto';
	showing.value = false;
	emit('close');
}

function onBgClick() {
	if (contentClicking) return;
	emit('click');
}

if (type.value === 'drawer') {
	maxHeight.value = window.innerHeight / 1.5;
}

const keymap = {
	'esc': {
		allowRepeat: true,
		callback: () => emit('esc'),
	},
} as const satisfies Keymap;

const MARGIN = 16;
const SCROLLBAR_THICKNESS = 16;
const POPUP_GAP = 8;

const align = () => {
	if (props.anchorElement == null) return;
	if (!props.anchorElement.isConnected || props.anchorElement.getClientRects().length === 0) return;
	if (type.value === 'drawer') return;
	if (type.value === 'dialog') return;

	if (content.value == null) return;

	const anchorRect = props.anchorElement.getBoundingClientRect();

	const width = content.value!.offsetWidth;
	const height = content.value!.offsetHeight;

	// 按钮菜单锚定触发元素本身：默认挂在下方并与其起始边对齐，放不下就整体换方位。
	// 光标锚点的四角展开是右键菜单的语义，由 MkContextMenu 负责，不能混用。
	if (props.menu) {
		if (props.menuMatchAnchorWidth) anchorWidth.value = anchorRect.width;
		const position = calcDropdownPosition(
			// 传自然高度而非 offsetHeight，否则上一次施加的 maxHeight 会让菜单显得“放得下”
			{ width, height: props.getContentHeight?.() ?? height },
			anchorRect,
			{ width: window.innerWidth, height: window.innerHeight },
			{
				// 宽度跟随锚点的下拉（select）不应该甩到侧面
				allowSideFlip: !props.menuMatchAnchorWidth,
				rtl: window.getComputedStyle(props.anchorElement).direction === 'rtl',
			},
		);
		maxHeight.value = position.maxHeight ?? undefined;
		transformOrigin.value = position.transformOrigin;
		menuOverlapsAnchor.value = position.overlapsAnchor;
		content.value.style.left = `${position.left + (fixed.value ? 0 : window.scrollX)}px`;
		content.value.style.top = `${position.top + (fixed.value ? 0 : window.scrollY)}px`;
		return;
	}

	let left = 0;
	let top = 0;

	const x = anchorRect.left + (fixed.value ? 0 : window.scrollX);
	const y = anchorRect.top + (fixed.value ? 0 : window.scrollY);

	if (props.anchor.x === 'center') {
		left = props.align === 'left' ? x : props.align === 'right' ? x + anchorRect.width - width : x + (anchorRect.width / 2) - (width / 2);
	} else if (props.anchor.x === 'left') {
		left = x - width - POPUP_GAP;
	} else if (props.anchor.x === 'right') {
		left = x + anchorRect.width + POPUP_GAP;
	}

	if (props.anchor.y === 'center') {
		top = y + (anchorRect.height / 2) - (height / 2);
	} else if (props.anchor.y === 'top') {
		top = y - height - POPUP_GAP;
	} else if (props.anchor.y === 'bottom') {
		top = y + anchorRect.height + POPUP_GAP;
	}

	const viewportLeft = fixed.value ? 0 : window.scrollX;
	const viewportTop = (fixed.value ? 0 : window.scrollY) + MARGIN;
	const viewportRight = viewportLeft + window.innerWidth - SCROLLBAR_THICKNESS;
	const viewportBottom = (fixed.value ? 0 : window.scrollY) + window.innerHeight - SCROLLBAR_THICKNESS - MARGIN;
	let availableHeight = Math.max(0, viewportBottom - viewportTop);

	if (props.noOverlap && props.anchor.x === 'center' && props.anchor.y !== 'center') {
		const spaceAbove = Math.max(0, Math.min(y - POPUP_GAP, viewportBottom) - viewportTop);
		const spaceBelow = Math.max(0, viewportBottom - Math.max(y + anchorRect.height + POPUP_GAP, viewportTop));
		const opensAbove = props.anchor.y === 'top'
			? height <= spaceAbove || (height > spaceBelow && spaceAbove >= spaceBelow)
			: height > spaceBelow && (height <= spaceAbove || spaceAbove > spaceBelow);
		availableHeight = opensAbove ? spaceAbove : spaceBelow;
		top = opensAbove ? y - POPUP_GAP - Math.min(height, availableHeight) : y + anchorRect.height + POPUP_GAP;
	}

	maxHeight.value = availableHeight;
	const visibleHeight = Math.min(height, availableHeight);
	left = Math.max(viewportLeft, Math.min(left, viewportRight - width));
	top = Math.max(viewportTop, Math.min(top, viewportBottom - visibleHeight));

	let transformOriginX: string = props.anchor.x === 'center' ? props.align : 'center';
	let transformOriginY = 'center';

	if (top >= y + anchorRect.height) {
		transformOriginY = 'top';
	} else if ((top + visibleHeight) <= y) {
		transformOriginY = 'bottom';
	}

	if (left >= x + anchorRect.width) {
		transformOriginX = 'left';
	} else if ((left + width) <= x) {
		transformOriginX = 'right';
	}

	transformOrigin.value = `${transformOriginX} ${transformOriginY}`;

	content.value.style.left = left + 'px';
	content.value.style.top = top + 'px';
};

const onOpened = () => {
	emit('opened');

	// contentの子要素にアクセスするためレンダリングの完了を待つ必要がある（nextTickが必要）
	nextTick(() => {
		// NOTE: Chromatic テストの際に undefined になる場合がある
		if (content.value == null) return;

		// モーダルコンテンツにマウスボタンが押され、コンテンツ外でマウスボタンが離されたときにモーダルバックグラウンドクリックと判定させないためにマウスイベントを監視しフラグ管理する
		const el = content.value.children[0];
		if (el == null) return;
		el.addEventListener('mousedown', ev => {
			contentClicking = true;
			window.addEventListener('mouseup', ev => {
				// click イベントより先に mouseup イベントが発生するかもしれないのでちょっと待つ
				window.setTimeout(() => {
					contentClicking = false;
				}, 100);
			}, { passive: true, once: true });
		}, { passive: true });
	});
};

const onClosed = () => {
	emit('closed');
};

const alignObserver = new ResizeObserver((entries, observer) => {
	align();
});

function onViewportChange(event: Event) {
	if (event.type === 'scroll' && event.target instanceof Node && content.value?.contains(event.target)) return;
	align();
}

function onFullscreenChange() {
	if (window.document.fullscreenElement !== fullscreenTarget) emit('click');
}

onMounted(() => {
	if (fullscreenTarget != null) window.document.addEventListener('fullscreenchange', onFullscreenChange);
	window.addEventListener('resize', onViewportChange, { passive: true });
	window.document.addEventListener('scroll', onViewportChange, { capture: true, passive: true });

	watch(() => props.anchorElement, async (anchor, previousAnchor) => {
		if (previousAnchor) alignObserver.unobserve(previousAnchor);
		if (anchor) {
			anchor.style.pointerEvents = 'none';
			alignObserver.observe(anchor);
		}
		fixed.value = (type.value === 'drawer') || (getFixedContainer(anchor) != null);

		await nextTick();

		align();
	}, { immediate: true });

	watch([showing, () => props.manualShowing], ([showing, manualShowing]) => {
		if (manualShowing === true || (manualShowing == null && showing === true)) {
			if (modalRootEl.value != null) {
				const { release } = focusTrap(modalRootEl.value, props.hasInteractionWithOtherFocusTrappedEls);

				releaseFocusTrap = release;
				modalRootEl.value.focus();
			}
		} else {
			releaseFocusTrap?.();
			focusParent(props.returnFocusTo ?? props.anchorElement, true, false);
		}
	}, { immediate: true });

	nextTick(() => {
		alignObserver.observe(content.value!);
	});
});

onUnmounted(() => {
	// The owning composer can dispose a picker directly while starting a post.
	if (props.anchorElement) props.anchorElement.style.pointerEvents = 'auto';
	releaseFocusTrap?.();
	window.document.removeEventListener('fullscreenchange', onFullscreenChange);
	alignObserver.disconnect();
	window.removeEventListener('resize', onViewportChange);
	window.document.removeEventListener('scroll', onViewportChange, true);
});

defineExpose({
	close,
});
</script>

<style lang="scss" module>
.transition_send_enterActive,
.transition_send_leaveActive {
	> .bg {
		transition: opacity 0.3s !important;
	}

	> .content {
    transform: translateY(0px);
		transition: opacity 0.3s ease-in, transform 0.3s cubic-bezier(.5,-0.5,1,.5) !important;
	}
}
.transition_send_enterFrom,
.transition_send_leaveTo {
	> .bg {
		opacity: 0;
	}

	> .content {
		pointer-events: none;
		opacity: 0;
		transform: translateY(-300px);
	}
}

.transition_modal_enterActive,
.transition_modal_leaveActive {
	> .bg {
		transition: opacity 0.2s !important;
	}

	> .content {
		transform-origin: var(--transformOrigin);
		transition: opacity 0.2s, transform 0.2s !important;
	}
}
.transition_modal_enterFrom,
.transition_modal_leaveTo {
	> .bg {
		opacity: 0;
	}

	> .content {
		pointer-events: none;
		opacity: 0;
		transform-origin: var(--transformOrigin);
		transform: scale(0.9);
	}
}

.transition_modalPopup_enterActive,
.transition_modalPopup_leaveActive {
	> .bg {
		transition: opacity 0.1s !important;
	}

	> .content {
		transform-origin: var(--transformOrigin);
		transition: opacity 0.1s cubic-bezier(0, 0, 0.2, 1), transform 0.1s cubic-bezier(0, 0, 0.2, 1) !important;
	}
}
.transition_modalPopup_enterFrom,
.transition_modalPopup_leaveTo {
	> .bg {
		opacity: 0;
	}

	> .content {
		pointer-events: none;
		opacity: 0;
		transform-origin: var(--transformOrigin);
		transform: scale(0.9);
	}
}

.transition_modalDrawer_enterActive {
	> .bg {
		transition: opacity 0.2s !important;
	}

	> .content {
		transition: transform 0.2s cubic-bezier(0,.5,0,1) !important;
	}
}
.transition_modalDrawer_leaveActive {
	> .bg {
		transition: opacity 0.2s !important;
	}

	> .content {
		transition: transform 0.2s cubic-bezier(0,.5,0,1) !important;
	}
}
.transition_modalDrawer_enterFrom,
.transition_modalDrawer_leaveTo {
	> .bg {
		opacity: 0;
	}

	> .content {
		pointer-events: none;
		transform: translateY(100%);
	}
}

.root {
	&.dialog {
		> .content {
			position: fixed;
			top: 0;
			bottom: 0;
			left: 0;
			right: 0;
			margin: auto;
			padding: 32px;
			display: flex;
			overflow: auto;

			@media (max-width: 500px) {
				padding: 16px;
			}
		}

		&.fullScreen > .content {
			bottom: auto;
			height: 100%;
			height: 100dvh;
			padding: 0;
			overflow: clip;
		}
	}

	&.popup {
		&.menu > .content {
			transform: none !important;
		}

		> .content {
			position: absolute;

			&.fixed {
				position: fixed;
			}
		}
	}

	&.drawer {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		overflow: clip;

		> .content {
			position: fixed;
			bottom: 0;
			left: 0;
			right: 0;
			margin: auto;
		}
	}
}

.bg {
	&.bgTransparent {
		background: transparent;
		-webkit-backdrop-filter: none;
		backdrop-filter: none;
	}
}
</style>
