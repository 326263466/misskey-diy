<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<Transition :name="prefer.s.animation && !page ? '_transition_zoom' : ''" :appear="!page">
	<div :class="[$style.root, { [$style.page]: page }]" class="_gaps" :aria-busy="loading || undefined">
		<div v-if="type === 'empty' && loading" :class="[$style.loadingIcon, { [$style.imagePlaceholder]: !!instance.infoImageUrl }]">
			<MkLoading em :class="$style.spinner"/>
		</div>
		<img v-else-if="type === 'empty' && instance.infoImageUrl" :src="instance.infoImageUrl" draggable="false" :class="$style.img"/>
		<MkSystemIcon v-else-if="type === 'empty'" type="info" :class="$style.icon"/>
		<img v-if="type === 'notFound' && instance.notFoundImageUrl" :src="instance.notFoundImageUrl" draggable="false" :class="$style.img"/>
		<MkSystemIcon v-else-if="type === 'notFound'" type="question" :class="$style.icon"/>
		<img v-if="type === 'error' && instance.serverErrorImageUrl" :src="instance.serverErrorImageUrl" draggable="false" :class="$style.img"/>
		<MkSystemIcon v-else-if="type === 'error'" type="error" :class="$style.icon"/>

		<template v-if="type !== 'empty' || !loading">
			<div v-if="text" style="color: var(--MI_THEME-fgTransparentWeak);">{{ text }}</div>
			<slot></slot>
		</template>
	</div>
</Transition>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { instance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';

const props = defineProps<{
	type: 'empty' | 'notFound' | 'error';
	text?: string;
	page?: boolean;
	loading?: boolean;
}>();

const text = computed(() => props.text ?? (props.type === 'notFound' ? i18n.ts.notFound : props.type === 'error' ? i18n.ts.somethingHappened : null));
</script>

<style lang="scss" module>
@use "../../styles/page-state.scss";

.root {
	position: relative;
	justify-content: center;
	box-sizing: border-box;
	text-align: center;
	padding: 32px;
}

.page {
	@include page-state.surface;
}

.img {
	vertical-align: bottom;
	height: 128px;
	margin: 0 auto 16px;
	border-radius: 16px;
}

.icon {
	@include page-state.icon;
}

.loadingIcon {
	@include page-state.icon;
	display: grid;
	place-items: center;

	&.imagePlaceholder {
		width: 128px;
		height: 128px;
		margin-bottom: 16px;
	}
}

.spinner {
	font-size: 38px;
}

</style>
