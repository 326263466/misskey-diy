<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div
	v-if="display"
	v-tooltip="tooltip ? display.text : null"
	:class="[$style.root, { [$style.passive]: !tooltip }]"
	role="img"
	:aria-label="display.text"
	@click.stop.prevent
	@auxclick.stop.prevent
	@pointerdown.stop
>
	<MkStatusIcon :class="$style.icon" :status="display.status" :icon="display.icon" plain/>
</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type * as Misskey from 'misskey-js';
import MkStatusIcon from '@/components/MkStatusIcon.vue';
import { $i } from '@/i.js';
import { getUserStatusDisplay } from '@/utility/user-status.js';

const props = withDefaults(defineProps<{
	user: Misskey.entities.User;
	tooltip?: boolean;
}>(), {
	tooltip: true,
});

const display = computed(() => getUserStatusDisplay(
	$i && props.user.id === $i.id && props.user.host === $i.host ? $i : props.user,
));
</script>

<style lang="scss" module>
.root {
	display: inline-flex;
	width: var(--MI-statusIconSize, 1em);
	aspect-ratio: 1 / 1;
	border-radius: 120%;
	box-shadow: 0 0 0 2px var(--MI_THEME-panel);
	line-height: 1;
	cursor: default;
}

// 没有提示时只作展示，点击交给外层按钮。
.passive {
	pointer-events: none;
}

.icon {
	--MI-statusIconSize: 100%;
}
</style>
