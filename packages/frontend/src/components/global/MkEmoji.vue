<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<img v-if="shouldMute" :class="$style.root" src="/client-assets/unknown.png" :alt="props.emoji" :title="noTooltip ? '' : undefined" decoding="async" @pointerenter="computeTitle" @click="onClick"/>
<img v-else-if="url" :key="url" ref="imageEl" :class="$style.root" :src="url" :alt="props.emoji" :title="noTooltip ? '' : undefined" decoding="async" @error="onImageError" @pointerenter="computeTitle" @click="onClick"/>
<span v-else :alt="props.emoji" :title="noTooltip ? '' : undefined" @pointerenter="computeTitle" @click="onClick"><slot name="fallback">{{ colorizedNativeEmoji }}</slot></span>
</template>

<script lang="ts" setup>
import { computed, inject, ref, useTemplateRef, watch } from 'vue';
import { colorizeEmoji, getEmojiName } from '@@/js/emojilist.js';
import { char2fluentEmojiFilePath, char2twemojiFilePath } from '@@/js/emoji-base.js';
import type { MenuItem } from '@/types/menu.js';
import * as os from '@/os.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import { DI } from '@/di.js';
import { mute as muteEmoji, unmute as unmuteEmoji, checkMuted as checkMutedEmoji } from '@/utility/emoji-mute.js';
import { addToEmojiPalette } from '@/utility/emoji-palette.js';

const props = defineProps<{
	emoji: string;
	menu?: boolean;
	menuReaction?: boolean;
	ignoreMuted?: boolean;
	noTooltip?: boolean;
}>();

const react = inject(DI.mfmEmojiReactCallback, null);

const imageEl = useTemplateRef('imageEl');
const failedUrls = ref(new Set<string>());
const url = computed(() => {
	if (prefer.s.emojiStyle === 'native') return null;
	const twemoji = char2twemojiFilePath(props.emoji);
	const candidates = prefer.s.emojiStyle === 'twemoji' ? [twemoji] : [char2fluentEmojiFilePath(props.emoji), twemoji];
	return candidates.find(candidate => !failedUrls.value.has(candidate)) ?? null;
});
const colorizedNativeEmoji = computed(() => colorizeEmoji(props.emoji));
const isMuted = checkMutedEmoji(props.emoji);
const shouldMute = computed(() => isMuted.value && !props.ignoreMuted);

watch([() => props.emoji, () => prefer.s.emojiStyle], () => {
	failedUrls.value = new Set();
}, { flush: 'sync' });

function onImageError(event: Event): void {
	if (event.currentTarget !== imageEl.value) return;
	const failedUrl = (event.target as HTMLImageElement).getAttribute('src');
	// 旧图源的延迟报错不应跳过当前图源
	if (failedUrl == null || failedUrl !== url.value) return;
	failedUrls.value = new Set([...failedUrls.value, failedUrl]);
}

// Searching from an array with 2000 items for every emoji felt like too energy-consuming, so I decided to do it lazily on pointerenter
function computeTitle(event: PointerEvent): void {
	(event.target as HTMLElement).title = props.noTooltip ? '' : getEmojiName(props.emoji);
}

function mute() {
	os.confirm({
		type: 'question',
		title: i18n.tsx.muteX({ x: props.emoji }),
	}).then(({ canceled }) => {
		if (canceled) {
			return;
		}
		muteEmoji(props.emoji);
	});
}

function unmute() {
	os.confirm({
		type: 'question',
		title: i18n.tsx.unmuteX({ x: props.emoji }),
	}).then(({ canceled }) => {
		if (canceled) {
			return;
		}
		unmuteEmoji(props.emoji);
	});
}

function onClick(ev: PointerEvent) {
	if (props.menu) {
		const menuItems: MenuItem[] = [];

		menuItems.push({
			type: 'label',
			text: props.emoji,
		}, {
			text: i18n.ts.copy,
			icon: 'ti ti-copy',
			action: () => {
				copyToClipboard(props.emoji);
			},
		});

		if (props.menuReaction && react) {
			menuItems.push({
				text: i18n.ts.doReaction,
				icon: 'ti ti-plus',
				action: () => {
					react(props.emoji);
				},
			});
		}

		menuItems.push({
			type: 'divider',
		});

		if (isMuted.value) {
			menuItems.push({
				text: i18n.ts.emojiUnmute,
				icon: 'ti ti-mood-smile',
				action: () => {
					unmute();
				},
			});
		} else {
			menuItems.push({
				text: i18n.ts.emojiMute,
				icon: 'ti ti-mood-off',
				action: () => {
					mute();
				},
			});
		}

		menuItems.push({
			text: i18n.ts.addToEmojiPalette,
			icon: 'ti ti-palette',
			action: () => {
				addToEmojiPalette(props.emoji);
			},
		});

		os.popupMenu(menuItems, ev.currentTarget ?? ev.target);
	}
}
</script>

<style lang="scss" module>
.root {
	height: 1.25em;
	vertical-align: -0.25em;
}
</style>
