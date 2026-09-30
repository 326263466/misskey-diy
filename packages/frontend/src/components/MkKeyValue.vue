<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.root, { [$style.oneline]: oneline }]">
	<div :class="$style.key">
		<slot name="key"></slot>
	</div>
	<div :class="$style.value" class="_selectable">
		<slot name="value"></slot>
		<button v-if="copy" v-tooltip="i18n.ts.copy" class="_textButton" style="margin-left: 0.5em;" :aria-label="i18n.ts.copy" @click="copy_"><i class="ti ti-copy"></i></button>
	</div>
</div>
</template>

<script lang="ts" setup>
import { } from 'vue';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';

const props = withDefaults(defineProps<{
	copy?: string | null;
	oneline?: boolean;
}>(), {
	copy: null,
	oneline: false,
});

const copy_ = () => {
	copyToClipboard(props.copy);
};
</script>

<style lang="scss" module>
.root {
	&.oneline {
		display: flex;
		// 标签按内容自适应宽度, 与数据之间只保留固定间距,
		// 不再用 30%/70% 分栏导致短标签后出现大片空白
		gap: 16px;

		.key {
			flex-shrink: 0;
			font-size: 1em;
			padding: 0;
		}

		.value {
			flex: 1;
			min-width: 0;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}
	}
}

.key {
	font-size: 0.85em;
	padding: 0 0 0.25em 0;
	opacity: 0.75;
}
</style>
