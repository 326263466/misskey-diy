<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div data-testid="mkw-slideshow" class="kvausudm _panel mkw-slideshow" :style="{ height: widgetProps.height + 'px' }">
	<div @click="choose">
		<p v-if="widgetProps.folderId == null">
			{{ i18n.ts.folder }}
		</p>
		<p v-if="widgetProps.folderId != null && images.length === 0 && !fetching">{{ i18n.ts.nothing }}</p>
		<div ref="slideA" class="slide a"></div>
		<div ref="slideB" class="slide b"></div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, ref, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import { useInterval } from '@@/js/use-interval.js';
import { waitForImageReveal } from '@@/js/image-fade.js';
import { useWidgetPropsManager } from './widget.js';
import type { WidgetComponentEmits, WidgetComponentExpose, WidgetComponentProps } from './widget.js';
import type { FormWithDefault, GetFormResultType } from '@/utility/form.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { selectDriveFolder } from '@/utility/drive.js';
import { prefer } from '@/preferences.js';

const name = 'slideshow';

const widgetPropsDef = {
	height: {
		type: 'number',
		label: i18n.ts._widgetOptions.height,
		default: 300,
	},
	folderId: {
		type: 'string',
		default: null as string | null,
		hidden: true,
	},
} satisfies FormWithDefault;

type WidgetProps = GetFormResultType<typeof widgetPropsDef>;

const props = defineProps<WidgetComponentProps<WidgetProps>>();
const emit = defineEmits<WidgetComponentEmits<WidgetProps>>();

const { widgetProps, configure, save } = useWidgetPropsManager(name,
	widgetPropsDef,
	props,
	emit,
);

const images = ref<Misskey.entities.DriveFile[]>([]);
const fetching = ref(true);
const slideA = useTemplateRef('slideA');
const slideB = useTemplateRef('slideB');
let changeSequence = 0;
let fetchSequence = 0;
let swapTimeout: number | undefined;

const change = async () => {
	if (images.value.length === 0 || slideA.value == null || slideB.value == null) return;

	const sequence = ++changeSequence;
	window.clearTimeout(swapTimeout);
	const index = Math.floor(Math.random() * images.value.length);
	const image = new Image();
	image.src = images.value[index].url;
	try {
		await image.decode();
	} catch {
		// 加载失败时保留上一张，不把空白背景切进来。
	}
	if (prefer.s.animation) await waitForImageReveal(image);
	if (sequence !== changeSequence || slideA.value == null || slideB.value == null || image.naturalWidth === 0) return;
	const img = `url(${JSON.stringify(image.src)})`;
	if (!prefer.s.animation || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
		slideA.value.style.backgroundImage = img;
		slideB.value.classList.remove('anime');
		return;
	}

	slideB.value.style.backgroundImage = img;

	slideB.value.classList.add('anime');
	swapTimeout = window.setTimeout(() => {
		// 既にこのウィジェットがunmountされていたら要素がない
		if (sequence !== changeSequence || slideA.value == null || slideB.value == null) return;

		slideA.value.style.backgroundImage = img;

		slideB.value.classList.remove('anime');
	}, 1000);
};

const fetch = () => {
	if (slideA.value == null || slideB.value == null) return;
	fetching.value = true;
	const sequence = ++fetchSequence;
	changeSequence++;
	window.clearTimeout(swapTimeout);

	misskeyApi('drive/files', {
		folderId: widgetProps.folderId,
		type: 'image/*',
		limit: 100,
	}).then(res => {
		if (sequence !== fetchSequence || slideA.value == null || slideB.value == null) return;
		images.value = res;
		fetching.value = false;
		slideA.value.style.backgroundImage = '';
		slideB.value.style.backgroundImage = '';
		slideB.value.classList.remove('anime');
		void change();
	});
};

const choose = () => {
	selectDriveFolder(null).then(({ folders, canceled }) => {
		if (canceled || folders[0] == null) {
			return;
		}
		widgetProps.folderId = folders[0].id;
		save();
		fetch();
	});
};

useInterval(change, 10000, {
	immediate: false,
	afterMounted: true,
});

onMounted(() => {
	if (widgetProps.folderId != null) {
		fetch();
	}
});

onUnmounted(() => {
	changeSequence++;
	fetchSequence++;
	window.clearTimeout(swapTimeout);
});

defineExpose<WidgetComponentExpose>({
	name,
	configure,
	id: props.widget ? props.widget.id : null,
});
</script>

<style lang="scss" scoped>
.kvausudm {
	position: relative;

	> div {
		width: 100%;
		height: 100%;
		cursor: pointer;

		> p {
			display: block;
			margin: 1em;
			text-align: center;
			color: var(--MI_THEME-fgTransparentWeak);
		}

		> * {
			pointer-events: none;
		}

		> .slide {
			position: absolute;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			background-size: cover;
			background-position: center;

			&.b {
				opacity: 0;
			}

			&.anime {
				transition: opacity 1s;
				opacity: 1;
			}
		}
	}
}
</style>
