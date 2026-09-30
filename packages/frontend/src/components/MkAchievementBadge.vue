<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.iconFrame, $style[`iconFrame_${badge.frame}`]]" aria-hidden="true">
	<div :class="$style.iconInner" :style="{ background: badge.bg ?? '' }">
		<img :class="$style.iconImg" :src="badge.img" alt="">
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { ACHIEVEMENT_BADGES } from '@/utility/achievements.js';

const props = defineProps<{
	name: keyof typeof ACHIEVEMENT_BADGES;
}>();

const badge = computed(() => ACHIEVEMENT_BADGES[props.name]);
</script>

<style lang="scss" module>
@keyframes shine {
	0% { translate: -30px; }
	100% { translate: -130px; }
}

.iconFrame {
	position: relative;
	width: 58px;
	height: 58px;
	padding: 6px;
	border-radius: 100%;
	box-sizing: border-box;
	pointer-events: none;
	user-select: none;
	filter: drop-shadow(0px 2px 2px #00000044);
	box-shadow: 0 1px 0px #ffffff88 inset;
	overflow: clip;
}
.iconFrame_bronze {
	background: linear-gradient(0deg, #703827, #d37566);

	> .iconInner {
		background: linear-gradient(0deg, #d37566, #703827);
	}
}
.iconFrame_silver {
	background: linear-gradient(0deg, #7c7c7c, #e1e1e1);

	> .iconInner {
		background: linear-gradient(0deg, #e1e1e1, #7c7c7c);
	}
}
.iconFrame_gold {
	background: linear-gradient(0deg, rgba(255,182,85,1) 0%, rgba(233,133,0,1) 49%, rgba(255,243,93,1) 51%, rgba(255,187,25,1) 100%);

	> .iconInner {
		background: linear-gradient(0deg, #ffee20, #eb7018);
	}

	&::before {
		content: "";
		display: block;
		position: absolute;
    top: 30px;
    width: 200px;
    height: 8px;
    rotate: -45deg;
    translate: -30px;
		background: #ffffff88;
		animation: shine 2s infinite;
	}
}
.iconFrame_platinum {
	background: linear-gradient(0deg, rgba(154,154,154,1) 0%, rgba(226,226,226,1) 49%, rgba(255,255,255,1) 51%, rgba(195,195,195,1) 100%);

	> .iconInner {
		background: linear-gradient(0deg, #e1e1e1, #7c7c7c);
	}

	&::before {
		content: "";
		display: block;
		position: absolute;
    top: 30px;
    width: 200px;
    height: 8px;
    rotate: -45deg;
    translate: -30px;
		background: #ffffffee;
		animation: shine 2s infinite;
	}
}

.iconInner {
	position: relative;
	width: 100%;
	height: 100%;
	border-radius: 100%;
	box-shadow: 0 1px 0px #ffffff88 inset;
}

.iconImg {
	width: calc(100% - 12px);
	height: calc(100% - 12px);
	position: absolute;
	top: 0;
	right: 0;
	bottom: 0;
	left: 0;
	margin: auto;
	filter: drop-shadow(0px 1px 2px #000000aa);
}

</style>
