<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow ref="dialogEl" :width="480" :height="680" autoHeight :closeOnBackdrop="false" :closeButtonRight="true" headerIcon="ti ti-chart-arrows" @close="cancel" @closed="emit('closed')">
	<template #header>{{ i18n.ts.poll }}</template>
	<div :class="$style.content">
		<MkPollEditor v-model="draft"/>
		<p v-if="validationMessage" role="status" :class="$style.validation">{{ validationMessage }}</p>
	</div>
	<template #footer>
		<div :class="$style.actions">
			<MkButton v-if="poll != null" danger :class="$style.remove" @click="remove">{{ i18n.ts._poll.removePoll }}</MkButton>
			<MkButton @click="cancel">{{ i18n.ts.cancel }}</MkButton>
			<MkButton primary :disabled="validationMessage != null" @click="save">{{ i18n.ts.save }}</MkButton>
		</div>
	</template>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { computed, ref, useTemplateRef, watch } from 'vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkPollEditor from '@/components/MkPollEditor.vue';
import type { PollEditorModelValue } from '@/components/MkPollEditor.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	poll: PollEditorModelValue | null;
}>();

const emit = defineEmits<{
	(ev: 'done', value: PollEditorModelValue | null): void;
	(ev: 'closed'): void;
}>();

const dialogEl = useTemplateRef('dialogEl');
const draft = ref<PollEditorModelValue>(props.poll == null
	? { choices: ['', ''], multiple: false, expiresAt: null, expiredAfter: null }
	: { ...props.poll, choices: [...props.poll.choices] });
const normalized = computed(() => ({ ...draft.value, choices: draft.value.choices.map(choice => choice.trim()).filter(Boolean) }));
const submitError = ref<string | null>(null);
const validationMessage = computed(() => validate(normalized.value) ?? submitError.value);
let closing = false;

watch(draft, () => { submitError.value = null; }, { deep: true });

function validate(value: PollEditorModelValue): string | null {
	if (value.choices.length < 2) return i18n.ts._poll.noOnlyOneChoice;
	if (value.choices.length > 10) return i18n.ts._poll.noMore;
	if (value.choices.some(choice => [...choice].length > 50)) return i18n.ts._poll.choiceTooLong;
	if (new Set(value.choices).size !== value.choices.length) return i18n.ts._poll.duplicateChoices;
	if (value.expiresAt != null && (!Number.isSafeInteger(value.expiresAt) || !Number.isFinite(new Date(value.expiresAt).getTime()) || value.expiresAt <= Date.now())) return i18n.ts._poll.invalidExpiration;
	if (value.expiredAfter != null && (!Number.isSafeInteger(value.expiredAfter) || value.expiredAfter < 1 || !Number.isFinite(new Date(Date.now() + value.expiredAfter).getTime()))) return i18n.ts._poll.invalidExpiration;
	return null;
}

function save() {
	if (closing) return;
	// 弹窗打开期间也可能到期，保存时重新检查当前时间。
	submitError.value = validate(normalized.value);
	if (submitError.value != null) return;
	closing = true;
	emit('done', { ...normalized.value, choices: [...normalized.value.choices] });
	dialogEl.value?.close();
}

function remove() {
	if (closing || props.poll == null) return;
	closing = true;
	emit('done', null);
	dialogEl.value?.close();
}

function cancel() {
	if (closing) return;
	closing = true;
	dialogEl.value?.close();
}
</script>

<style lang="scss" module>
.content { padding: 20px; }
.validation { margin: 18px 0 0; font-size: 0.85em; color: var(--MI_THEME-error); }
.actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
.remove { margin-right: auto; }
</style>
