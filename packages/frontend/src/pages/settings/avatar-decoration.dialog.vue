<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="dialog"
	:closeOnBackdrop="!saving"
	:width="400"
	:height="450"
	@close="cancel"
	@closed="emit('closed')"
>
	<template #header>{{ i18n.ts.avatarDecorations }}</template>

	<div>
		<div class="_spacer _spacerCard">
			<div style="text-align: center;">
				<div :class="$style.name">{{ decoration.name }}</div>
				<MkAvatar style="width: 64px; height: 64px; margin-bottom: 20px;" :user="$i" :decorations="decorationsForPreview" forceShowDecoration/>
			</div>
			<div class="_gaps_s">
				<MkRange v-model="angle" :disabled="saving" continuousUpdate :min="-0.5" :max="0.5" :step="0.025" :textConverter="(v) => `${Math.floor(v * 360)}°`">
					<template #label>{{ i18n.ts.angle }}</template>
				</MkRange>
				<MkRange v-model="offsetX" :disabled="saving" continuousUpdate :min="-0.25" :max="0.25" :step="0.025" :textConverter="(v) => `${Math.floor(v * 100)}%`">
					<template #label>X {{ i18n.ts.position }}</template>
				</MkRange>
				<MkRange v-model="offsetY" :disabled="saving" continuousUpdate :min="-0.25" :max="0.25" :step="0.025" :textConverter="(v) => `${Math.floor(v * 100)}%`">
					<template #label>Y {{ i18n.ts.position }}</template>
				</MkRange>
				<MkSwitch v-model="flipH" :disabled="saving">
					<template #label>{{ i18n.ts.flip }}</template>
				</MkSwitch>
			</div>
		</div>

		<div :class="$style.footer" class="_buttonsCenter">
			<MkButton v-if="usingIndex != null" :disabled="saving" primary rounded @click="save('update')"><i class="ti ti-check"></i> {{ i18n.ts.update }}</MkButton>
			<MkButton v-if="usingIndex != null" :disabled="saving" rounded @click="save('detach')"><i class="ti ti-x"></i> {{ i18n.ts.detach }}</MkButton>
			<MkButton v-else :disabled="unavailable || locked || saving" primary rounded @click="save('attach')"><i class="ti ti-check"></i> {{ i18n.ts.attach }}</MkButton>
		</div>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { useTemplateRef, ref, computed } from 'vue';
import MkButton from '@/components/MkButton.vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import { i18n } from '@/i18n.js';
import MkRange from '@/components/MkRange.vue';
import { ensureSignin } from '@/i.js';

const $i = ensureSignin();

const props = defineProps<{
	usingIndex: number | null;
	decoration: {
		id: string;
		url: string;
		name: string;
		roleIdsThatCanBeUsedThisDecoration: string[];
	};
}>();

const emit = defineEmits<{
	(ev: 'closed'): void;
	(ev: 'attach', payload: {
		angle: number;
		flipH: boolean;
		offsetX: number;
		offsetY: number;
	}, complete: (saved: boolean) => void): void;
	(ev: 'update', payload: {
		angle: number;
		flipH: boolean;
		offsetX: number;
		offsetY: number;
	}, complete: (saved: boolean) => void): void;
	(ev: 'detach', complete: (saved: boolean) => void): void;
}>();

const dialog = useTemplateRef('dialog');
const saving = ref(false);
const unavailable = computed(() => $i.policies.avatarDecorationLimit <= 0);
const locked = computed(() => props.decoration.roleIdsThatCanBeUsedThisDecoration.length > 0 && !$i.roles.some(r => props.decoration.roleIdsThatCanBeUsedThisDecoration.includes(r.id)));
const angle = ref((props.usingIndex != null ? $i.avatarDecorations[props.usingIndex]?.angle : null) ?? 0);
const flipH = ref((props.usingIndex != null ? $i.avatarDecorations[props.usingIndex]?.flipH : null) ?? false);
const offsetX = ref((props.usingIndex != null ? $i.avatarDecorations[props.usingIndex]?.offsetX : null) ?? 0);
const offsetY = ref((props.usingIndex != null ? $i.avatarDecorations[props.usingIndex]?.offsetY : null) ?? 0);

const decorationsForPreview = computed(() => {
	const decoration = {
		id: props.decoration.id,
		url: props.decoration.url,
		angle: angle.value,
		flipH: flipH.value,
		offsetX: offsetX.value,
		offsetY: offsetY.value,
		blink: true,
	};
	const decorations = [...$i.avatarDecorations];
	if (props.usingIndex != null) {
		decorations[props.usingIndex] = decoration;
	} else {
		return [decoration];
	}
	return decorations;
});

function cancel() {
	if (saving.value) return;
	dialog.value?.close();
}

async function save(action: 'attach' | 'update' | 'detach') {
	if (saving.value || (action === 'attach' && (unavailable.value || locked.value))) return;
	saving.value = true;
	const payload = {
		angle: angle.value,
		flipH: flipH.value,
		offsetX: offsetX.value,
		offsetY: offsetY.value,
	};
	try {
		const saved = await new Promise<boolean>(resolve => {
			if (action === 'attach') emit('attach', payload, resolve);
			else if (action === 'update') emit('update', payload, resolve);
			else emit('detach', resolve);
		});
		if (saved) dialog.value?.close();
	} finally {
		saving.value = false;
	}
}
</script>

<style lang="scss" module>
.name {
	position: relative;
	z-index: 10;
	font-weight: bold;
	margin-bottom: 28px;
}

.footer {
	position: sticky;
	bottom: 0;
	left: 0;
	padding: var(--MI-cardPadding, 18px);
	border-top: var(--MI-divider);
	-webkit-backdrop-filter: var(--MI-blur, blur(15px));
	backdrop-filter: var(--MI-blur, blur(15px));
}
</style>
