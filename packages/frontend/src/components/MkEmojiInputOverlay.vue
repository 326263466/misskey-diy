<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-if="active" :class="$style.viewport" :style="viewportStyle" aria-hidden="true" data-emoji-input-overlay>
	<div :class="$style.mirror" :style="mirrorStyle"><template v-for="(part, index) in parts" :key="index"><span v-if="part.emoji" :class="$style.emoji"><span :class="$style.glyph">{{ part.text }}</span><MkEmoji :class="$style.image" :emoji="part.text" ignoreMuted><template #fallback>{{ part.text }}</template></MkEmoji></span><template v-else>{{ part.text }}</template></template>{{ '\u200b' }}</div>
</div>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, ref, useCssModule, watch } from 'vue';
import MkEmoji from '@/components/global/MkEmoji.vue';
import { prefer } from '@/preferences.js';
import { splitUnicodeEmoji } from '@/utility/unicode-emoji.js';

const props = defineProps<{
	inputElement: HTMLTextAreaElement | HTMLInputElement | null;
	text: string | null;
	disabled?: boolean;
}>();

const styles = useCssModule();
const source = ref(props.text ?? '');
const viewportStyle = ref<Record<string, string>>({});
const mirrorStyle = ref<Record<string, string>>({});
const parts = computed(() => splitUnicodeEmoji(source.value));
const active = computed(() => props.inputElement != null && !props.disabled && prefer.s.emojiStyle !== 'native' && parts.value.some(part => part.emoji));

// These properties affect the native glyph advances and line breaks. The image
// never participates in layout: its hidden Unicode glyph keeps that exact space.
const typographyProperties = [
	'color', 'direction', 'font-family', 'font-size', 'font-stretch', 'font-style',
	'font-weight', 'font-kerning', 'font-feature-settings', 'font-variation-settings',
	'font-variant', 'font-optical-sizing', 'letter-spacing', 'line-height', 'tab-size',
	'text-align', 'text-indent', 'text-transform', 'text-rendering', 'text-autospace',
	'word-spacing', 'word-break', 'overflow-wrap', 'unicode-bidi',
	'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
] as const;

let attachedInput: HTMLTextAreaElement | HTMLInputElement | null = null;
let resizeObserver: ResizeObserver | null = null;
let mutationObserver: MutationObserver | null = null;
let frame: number | null = null;
let disposed = false;

function sync() {
	const input = attachedInput;
	if (input == null || disposed) return;
	// v-model intentionally does not update during composition. The DOM value
	// also includes display-only formatting supplied by the surrounding editor.
	source.value = input.value;
	if (input.classList.contains(styles.maskedInput) !== active.value) input.classList.toggle(styles.maskedInput, active.value);
	if (!active.value) return;
	const computedStyle = window.getComputedStyle(input);
	const singleLine = input instanceof HTMLInputElement;
	const typography: Record<string, string> = {};
	for (const property of typographyProperties) typography[property] = computedStyle.getPropertyValue(property);
	viewportStyle.value = {
		left: `${input.offsetLeft + input.clientLeft}px`,
		top: `${input.offsetTop + input.clientTop}px`,
		width: `${input.clientWidth}px`,
		height: `${input.clientHeight}px`,
		opacity: computedStyle.opacity,
		display: singleLine ? 'flex' : 'block',
		alignItems: 'center',
		direction: computedStyle.direction,
	};
	// Flex centers the actual line box, including asymmetric padding, without
	// guessing font metrics for line-height: normal. Its direction also anchors
	// overflowing single-line RTL text to the same starting edge as the input.
	mirrorStyle.value = {
		...typography,
		width: singleLine ? 'max-content' : `${input.clientWidth}px`,
		minWidth: singleLine ? '100%' : '0',
		whiteSpace: singleLine ? 'pre' : computedStyle.whiteSpace || (input instanceof HTMLTextAreaElement && input.wrap === 'off' ? 'pre' : 'pre-wrap'),
		transform: `translate(${-input.scrollLeft}px, ${-input.scrollTop}px)`,
	};
}

function scheduleSync() {
	if (disposed || frame != null) return;
	frame = window.requestAnimationFrame(() => {
		frame = null;
		sync();
	});
}

function onInputEvent() {
	sync();
	// The browser can scroll the caret into view after dispatching input/select.
	scheduleSync();
}

const inputEvents = ['input', 'scroll', 'select', 'keyup', 'click', 'focus', 'compositionupdate', 'compositionend'] as const;

function detach() {
	attachedInput?.classList.remove(styles.maskedInput);
	for (const event of inputEvents) attachedInput?.removeEventListener(event, onInputEvent);
	resizeObserver?.disconnect();
	mutationObserver?.disconnect();
	resizeObserver = null;
	mutationObserver = null;
	attachedInput = null;
	if (frame != null) window.cancelAnimationFrame(frame);
	frame = null;
}

watch(() => props.inputElement, input => {
	detach();
	attachedInput = input;
	if (input == null) return;
	for (const event of inputEvents) input.addEventListener(event, onInputEvent);
	if (typeof ResizeObserver !== 'undefined') {
		resizeObserver = new ResizeObserver(scheduleSync);
		resizeObserver.observe(input);
		if (input.parentElement) resizeObserver.observe(input.parentElement);
	}
	if (typeof MutationObserver !== 'undefined') {
		mutationObserver = new MutationObserver(scheduleSync);
		for (let element: HTMLElement | null = input; element != null; element = element.parentElement) {
			mutationObserver.observe(element, { attributes: true, attributeFilter: ['class', 'style', 'dir', 'wrap', 'disabled', 'readonly'] });
		}
	}
	sync();
}, { immediate: true, flush: 'post' });

// Read after the owning component has patched its input; never assign .value
// or selection, including when an unrelated update happens during IME input.
watch([() => props.text, () => props.disabled, () => prefer.s.emojiStyle], sync, { flush: 'post' });

window.addEventListener('resize', scheduleSync);
window.document.fonts?.addEventListener('loadingdone', scheduleSync);
void window.document.fonts?.ready.then(scheduleSync);

onBeforeUnmount(() => {
	disposed = true;
	detach();
	window.removeEventListener('resize', scheduleSync);
	window.document.fonts?.removeEventListener('loadingdone', scheduleSync);
});
</script>

<style lang="scss" module>
.maskedInput {
	-webkit-text-fill-color: transparent !important;
	caret-color: currentColor;
}

.maskedInput::selection {
	-webkit-text-fill-color: transparent;
}

.viewport {
	position: absolute;
	overflow: hidden;
	pointer-events: none;
	user-select: none;
}

.mirror {
	display: block;
	flex-shrink: 0;
	box-sizing: border-box;
	margin: 0;
	border: 0;
	background: transparent;
}

.emoji {
	position: relative;
}

.glyph {
	visibility: hidden;
}

.emoji > .image {
	position: absolute;
	left: 0;
	top: 0;
}

.emoji > span.image {
	right: 0;
	bottom: 0;
	display: flex;
	align-items: center;
}

.emoji > img.image {
	top: 50%;
	width: 100%;
	height: 1.25em;
	max-width: none;
	object-fit: contain;
	transform: translateY(-50%);
	vertical-align: baseline;
}
</style>
