<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<form class="_gaps" :aria-busy="busy" @submit.prevent="grant">
	<div class="_gaps_s" aria-live="polite">
		<MkKeyValue oneline>
			<template #key>{{ i18n.ts._checkin.points }}</template>
			<template #value>{{ points.toLocaleString() }}</template>
		</MkKeyValue>
		<MkKeyValue oneline>
			<template #key>{{ i18n.ts._checkin.makeupCards }}</template>
			<template #value>{{ makeupCards.toLocaleString() }}</template>
		</MkKeyValue>
	</div>
	<MkInput v-model="amount" type="number" :min="1" :max="10000" :step="1" required :disabled="busy || disabled">
		<template #label>{{ i18n.ts._checkin.grantAmount }}</template>
		<template #caption>{{ i18n.ts._checkin.grantAmountDescription }}</template>
	</MkInput>
	<MkButton type="submit" primary :wait="busy" :disabled="disabled || !validAmount">
		{{ i18n.ts._checkin.grantCards }}
	</MkButton>
</form>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkKeyValue from '@/components/MkKeyValue.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';

const props = defineProps<{
	userId: string;
	points: number;
	disabled?: boolean;
}>();

const emit = defineEmits<{
	(ev: 'granted'): void;
}>();

const makeupCards = defineModel<number>('makeupCards', { required: true });
const amount = ref<number | null>(1);
const busy = defineModel<boolean>('busy', { default: false });
const validAmount = computed(() => amount.value != null && Number.isInteger(amount.value) && amount.value >= 1 && amount.value <= 10000);

async function grant() {
	if (props.disabled || busy.value || !validAmount.value || amount.value == null) return;
	busy.value = true;
	const grantedAmount = amount.value;
	try {
		const result = await misskeyApi('admin/checkin/grant-cards', { userId: props.userId, amount: grantedAmount });
		makeupCards.value = result.makeupCards;
		emit('granted');
		os.toast(i18n.tsx._checkin.grantSucceeded({ amount: grantedAmount.toLocaleString() }));
	} catch (error) {
		const code = (error as { code?: string } | null)?.code;
		const text = code === 'NO_SUCH_USER' ? i18n.ts.noSuchUser
			: code === 'CHECKIN_NOT_ALLOWED' ? i18n.ts._checkin.grantNotAllowed
			: code === 'CARD_LIMIT_EXCEEDED' ? i18n.ts._checkin.cardLimitExceeded
			: i18n.ts._checkin.grantFailed;
		await os.alert({ type: 'error', text });
	} finally {
		busy.value = false;
	}
}
</script>
