<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal ref="modal" v-slot="{ type }" :preferType="deviceKind === 'smartphone' ? 'drawer' : 'dialog'" @click="onBgClick" @closed="emit('closed')" @esc="emit('esc')">
	<div ref="rootEl" :class="[$style.root, type === 'drawer' ? $style.asDrawer : null, autoHeight ? $style.autoHeight : null]" :style="type === 'drawer' ? undefined : rootStyle">
		<div :class="[$style.header, { [$style.closeButtonRight]: closeButtonRight }]">
			<button v-if="withCloseButton" :class="$style.headerButton" class="_button" :aria-label="i18n.ts.close" data-testid="modal-window-close" @click="emit('close')"><i class="ti ti-x" aria-hidden="true"></i></button>
			<span :class="$style.title">
				<slot name="header"></slot>
			</span>
			<div v-if="withOkButton" :class="$style.headerActions">
				<MkButton primary gradate small rounded :disabled="okButtonDisabled" @click="emit('ok')">{{ i18n.ts.done }} <i class="ti ti-check"></i></MkButton>
			</div>
		</div>
		<div :class="$style.body">
			<slot></slot>
		</div>
		<div v-if="$slots.footer" :class="$style.footer">
			<slot name="footer"></slot>
		</div>
	</div>
</MkModal>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, useTemplateRef, ref } from 'vue';
import MkModal from '@/components/MkModal.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n';
import { deviceKind } from '@/utility/device-kind.js';

const props = withDefaults(defineProps<{
	withOkButton?: boolean;
	withCloseButton?: boolean;
	closeButtonRight?: boolean;
	okButtonDisabled?: boolean;
	width?: number;
	height?: number;

	/** 高さを内容に合わせ、`height` を上限としてのみ使う */
	autoHeight?: boolean;
}>(), {
	withOkButton: false,
	withCloseButton: true,
	closeButtonRight: false,
	okButtonDisabled: false,
	width: 400,
	height: 500,
	autoHeight: false,
});

const emit = defineEmits<{
	(event: 'click'): void;
	(event: 'close'): void;
	(event: 'closed'): void;
	(event: 'ok'): void;
	(event: 'esc'): void;
}>();

const modal = useTemplateRef('modal');

const rootStyle = computed(() => ({
	width: `${props.width}px`,
	...(props.autoHeight ? { maxHeight: `min(${props.height}px, 100%)` } : { height: `min(${props.height}px, 100%)` }),
}));

function close() {
	modal.value?.close();
}

function onBgClick() {
	emit('click');
}

defineExpose({
	close,
});
</script>

<style lang="scss" module>
.root {
	margin: auto;
	overflow: hidden;
	display: flex;
	flex-direction: column;
	contain: content;
	border-radius: var(--MI-radius);

	--MI_THEME-headerHeight: 40px;
	--MI_THEME-headerHeightNarrow: 40px;

	&.asDrawer {
		height: calc(100dvh - 30px);
		border-radius: 0;

		&.autoHeight {
			height: auto;
			max-height: calc(100dvh - 30px);
		}

		.body {
			padding-bottom: env(safe-area-inset-bottom, 0px);
		}

		.footer {
			padding-bottom: max(var(--MI-cardPadding, 20px), env(safe-area-inset-bottom, 0px));
		}
	}
}

.header {
	display: flex;
	align-items: center;
	flex-shrink: 0;
	min-height: var(--MI_THEME-headerHeight);
	background: var(--MI_THEME-windowHeader);
	-webkit-backdrop-filter: var(--MI-blur, blur(15px));
	backdrop-filter: var(--MI-blur, blur(15px));

	@media (max-width: 500px) {
		min-height: var(--MI_THEME-headerHeightNarrow);
	}
}

.headerButton {
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	height: var(--MI_THEME-headerHeight);
	width: var(--MI_THEME-headerHeight);

	> i {
		line-height: 1.3;
	}

	@media (max-width: 500px) {
		height: var(--MI_THEME-headerHeightNarrow);
		width: var(--MI_THEME-headerHeightNarrow);
	}
}

.title {
	flex: 1;
	min-width: 0;
	line-height: 1.3;
	padding-left: 32px;
	font-weight: bold;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	pointer-events: none;

	> i {
		vertical-align: middle;
	}

	@media (max-width: 500px) {
		padding-left: 16px;
	}
}

.headerActions {
	flex-shrink: 0;
	padding: 0 16px;
}

.headerButton + .title {
	padding-left: 0;
}

.closeButtonRight {
	.headerButton {
		order: 1;
	}

	.title {
		padding-left: 20px;
	}
}

.body {
	flex: 1;
	overflow: auto;
	background: var(--MI_THEME-bg);
	container-type: size;
}

// 内容に合わせて縮むモード。flex-basis: 0 と size containment はどちらも
// 高さを内容から切り離してしまうため、この2つだけ打ち消す
.autoHeight .body {
	flex: 0 1 auto;
	container-type: inline-size;
}

.footer {
	flex-shrink: 0;
	padding: var(--MI-cardPadding, 20px);
	overflow: clip;
	background: var(--MI_THEME-bg);
	border-top: 1px solid var(--MI_THEME-divider);
}
</style>
