<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkButton inline :wait="busy" @click="edit">
	<i class="ti ti-note"></i> {{ model ? i18n.ts.moderationNote : i18n.ts.addModerationNote }}
</MkButton>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';

const model = defineModel<string>({ required: true });
const props = defineProps<{
	save: (text: string) => Promise<unknown>;
}>();

const busy = ref(false);
let draft: string | null = null;

async function edit() {
	if (busy.value) return;
	busy.value = true;
	try {
		const { canceled, result } = await os.form(i18n.ts.moderationNote, {
			text: {
				type: 'string',
				multiline: true,
				label: i18n.ts.moderationNote,
				description: i18n.ts.moderationNoteDescription,
				default: draft ?? model.value,
			},
		});
		if (canceled) {
			draft = null;
			return;
		}
		const text = result.text ?? '';
		if (text !== model.value) {
			draft = text;
			await props.save(text);
			model.value = text;
		}
		draft = null;
	} catch {
		// The caller reports API failures; retain the draft for another attempt.
	} finally {
		busy.value = false;
	}
}
</script>
