<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<ul :class="$style.choices">
		<li v-for="(choice, i) in choices" :key="i" :class="$style.choice">
			<MkInput :class="$style.input" small :modelValue="choice" @update:modelValue="onInput(i, $event)">
				<template #label>{{ i18n.tsx._poll.choiceN({ n: i + 1 }) }}</template>
			</MkInput>
			<button type="button" class="_button _iconButton" :class="$style.remove" :aria-label="`${i18n.ts.remove} ${i18n.tsx._poll.choiceN({ n: i + 1 })}`" @click="remove(i)">
				<i class="ti ti-x" aria-hidden="true"></i>
			</button>
		</li>
	</ul>
	<MkButton :class="$style.add" :disabled="choices.length >= 10" @click="add"><i class="ti ti-plus" aria-hidden="true"></i> {{ choices.length < 10 ? i18n.ts.add : i18n.ts._poll.noMore }}</MkButton>
	<MkSwitch v-model="multiple">{{ i18n.ts._poll.canMultipleVote }}</MkSwitch>
	<div :class="$style.expiration">
		<MkSelect v-model="expiration" :items="expirationDef" small>
			<template #label>{{ i18n.ts._poll.expiration }}</template>
		</MkSelect>
		<div v-if="expiration === 'at'" :class="$style.deadline">
			<MkInput v-model="atDate" small type="date" :class="$style.input">
				<template #label>{{ i18n.ts._poll.deadlineDate }}</template>
			</MkInput>
			<MkInput v-model="atTime" small type="time" :class="$style.input">
				<template #label>{{ i18n.ts._poll.deadlineTime }}</template>
			</MkInput>
		</div>
		<div v-else-if="expiration === 'after'" :class="$style.deadline">
			<MkInput v-model="after" small type="number" :min="1" :step="1" :class="$style.input">
				<template #label>{{ i18n.ts._poll.duration }}</template>
			</MkInput>
			<MkSelect v-model="unit" :items="unitDef" small :class="$style.input">
				<template #label>{{ i18n.ts._poll.durationUnit }}</template>
			</MkSelect>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import MkInput from './MkInput.vue';
import MkSelect from './MkSelect.vue';
import MkSwitch from './MkSwitch.vue';
import MkButton from './MkButton.vue';
import { formatDateTimeString } from '@/utility/format-time-string.js';
import { addTime } from '@/utility/time.js';
import { i18n } from '@/i18n.js';
import { useMkSelect } from '@/composables/use-mkselect.js';

export type PollEditorModelValue = {
	expiresAt: number | null;
	expiredAfter: number | null;
	choices: string[];
	multiple: boolean;
};

const props = defineProps<{
	modelValue: PollEditorModelValue;
}>();
const emit = defineEmits<{
	(ev: 'update:modelValue', v: PollEditorModelValue): void;
}>();

const choices = ref([...props.modelValue.choices]);
const multiple = ref(props.modelValue.multiple);
const {
	model: expiration,
	def: expirationDef,
} = useMkSelect({
	items: [
		{ label: i18n.ts._poll.infinite, value: 'infinite' },
		{ label: i18n.ts._poll.at, value: 'at' },
		{ label: i18n.ts._poll.after, value: 'after' },
	],
	initialValue: 'infinite',
});
const atDate = ref(formatDateTimeString(addTime(new Date(), 1, 'day'), 'yyyy-MM-dd'));
const atTime = ref('00:00');
const after = ref(1);
const {
	model: unit,
	def: unitDef,
} = useMkSelect({
	items: [
		{ label: i18n.ts._time.second, value: 'second' },
		{ label: i18n.ts._time.minute, value: 'minute' },
		{ label: i18n.ts._time.hour, value: 'hour' },
		{ label: i18n.ts._time.day, value: 'day' },
	],
	initialValue: 'day',
});

if (props.modelValue.expiresAt != null) {
	expiration.value = 'at';
	const expiresAt = new Date(props.modelValue.expiresAt);
	atDate.value = formatDateTimeString(expiresAt, 'yyyy-MM-dd');
	atTime.value = formatDateTimeString(expiresAt, 'HH:mm');
} else if (typeof props.modelValue.expiredAfter === 'number') {
	expiration.value = 'after';
	after.value = props.modelValue.expiredAfter / 1000;
	unit.value = 'second';
} else {
	expiration.value = 'infinite';
}

function onInput(i: number, value: string) {
	choices.value[i] = value;
}

function add() {
	if (choices.value.length >= 10) return;
	choices.value.push('');
}

function remove(i: number) {
	choices.value = choices.value.filter((_, _i) => _i !== i);
}

function get(): PollEditorModelValue {
	const calcAt = () => {
		const date = new Date(`${atDate.value}T${atTime.value}`);
		if (formatDateTimeString(date, 'yyyy-MM-dd') !== atDate.value || formatDateTimeString(date, 'HH:mm') !== atTime.value) return NaN;
		return date.getTime();
	};

	const calcAfter = () => {
		if (!Number.isSafeInteger(after.value) || after.value < 1) return NaN;
		const multiplier = { second: 1000, minute: 60000, hour: 3600000, day: 86400000 };
		return after.value * multiplier[unit.value];
	};

	return {
		choices: [...choices.value],
		multiple: multiple.value,
		expiresAt: expiration.value === 'at' ? calcAt() : null,
		expiredAfter: expiration.value === 'after' ? calcAfter() : null,
	};
}

watch([choices, multiple, expiration, atDate, atTime, after, unit], () => emit('update:modelValue', get()), {
	deep: true,
});
</script>

<style lang="scss" module>
.root { display: flex; flex-direction: column; gap: 18px; }
.choices { display: flex; flex-direction: column; gap: 12px; margin: 0; padding: 0; list-style: none; }
.choice { display: flex; align-items: end; gap: 8px; }
.input { flex: 1; min-width: 0; }
.remove { flex: 0 0 32px; height: 32px; margin-bottom: 2px; color: var(--MI_THEME-fgTransparentWeak); }
.add { align-self: flex-start; }
.expiration { display: flex; flex-direction: column; gap: 12px; }
.deadline { display: flex; align-items: end; gap: 12px; }
@container (max-width: 300px) { .deadline { flex-direction: column; align-items: stretch; } }
</style>
