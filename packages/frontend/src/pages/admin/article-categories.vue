<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard>
	<div class="_pageBody _gaps_m" :aria-busy="saving">
		<h2 :class="$style.sectionTitle">{{ i18n.ts._article.categories }}</h2>
		<p :class="$style.description">{{ i18n.ts._article.categorySettingsDescription }}</p>
		<div v-for="(category, index) in form.state.articleCategories" :key="category.id" :class="$style.category">
			<MkInput v-model="category.name" :counterMaxLength="CONTENT_LIMITS.articleCategory" :disabled="saving" :class="$style.name">
				<template #label>{{ i18n.ts._article.categoryName }}</template>
			</MkInput>
			<div class="_buttons" :class="$style.actions">
				<MkButton small :disabled="saving || index === 0" :aria-label="i18n.ts._article.moveCategoryUp" :title="i18n.ts._article.moveCategoryUp" @click="moveCategory(index, -1)"><i class="ti ti-arrow-up"></i></MkButton>
				<MkButton small :disabled="saving || index === form.state.articleCategories.length - 1" :aria-label="i18n.ts._article.moveCategoryDown" :title="i18n.ts._article.moveCategoryDown" @click="moveCategory(index, 1)"><i class="ti ti-arrow-down"></i></MkButton>
				<MkButton small danger :disabled="saving" @click="removeCategory(category.id)">{{ i18n.ts.remove }}</MkButton>
			</div>
		</div>
		<MkButton :disabled="saving || form.state.articleCategories.length >= 50" @click="addCategory"><i class="ti ti-plus"></i> {{ i18n.ts._article.addCategory }}</MkButton>
		<section class="_gaps_m" :class="$style.tagSection" :aria-busy="tagSaving">
			<div :class="$style.tagHeader">
				<h2 :class="$style.sectionTitle">{{ i18n.ts._article.tags }} <span :class="$style.tagCount">{{ tags.length }}/500</span></h2>
				<MkButton small :disabled="tagSaving || tags.length >= 500" @click="addTag"><i class="ti ti-plus" aria-hidden="true"></i> {{ i18n.ts._article.addTag }}</MkButton>
			</div>
			<p :class="$style.description">{{ i18n.ts._article.tagSettingsDescription }}</p>
			<div v-if="tags.length" :class="$style.tagList">
				<div v-for="tag in tags" :key="tag" :class="$style.tag">
					<span :class="$style.tagName">#{{ tag }}</span>
					<div class="_buttons" :class="$style.tagActions">
						<MkButton small :disabled="tagSaving" :aria-label="`${i18n.ts.edit} ${tag}`" @click="editTag(tag)"><i class="ti ti-pencil" aria-hidden="true"></i> {{ i18n.ts.edit }}</MkButton>
						<MkButton small danger :disabled="tagSaving" :aria-label="`${i18n.ts.remove} ${tag}`" @click="removeTag(tag)"><i class="ti ti-trash" aria-hidden="true"></i> {{ i18n.ts.remove }}</MkButton>
					</div>
				</div>
			</div>
			<p v-else :class="$style.description">{{ i18n.ts.nothing }}</p>
		</section>
	</div>
	<template #footer>
		<div class="_pageFooter _buttons">
			<MkButton primary :disabled="saving || !form.modified.value || !valid" :wait="saving" @click="save"><i class="ti ti-check"></i> {{ i18n.ts.save }}</MkButton>
			<MkButton :disabled="saving || !form.modified.value" @click="form.discard">{{ i18n.ts.cancel }}</MkButton>
		</div>
	</template>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { CONTENT_LIMITS } from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import { useForm } from '@/composables/use-form.js';
import { i18n } from '@/i18n.js';
import { fetchInstance, instance } from '@/instance.js';
import { definePage } from '@/page.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { isAccountSessionErrorHandled } from '@/utility/account-session-error.js';
import * as os from '@/os.js';

const meta = await misskeyApi('admin/meta');
const saving = ref(false);
const tagSaving = ref(false);
const tags = ref(meta.articleTags);
const form = useForm({ articleCategories: meta.articleCategories }, async state => {
	await misskeyApi('admin/update-meta', { articleCategories: state.articleCategories });
});
const valid = computed(() => form.state.articleCategories.length <= 50 && form.state.articleCategories.every(category => {
	const name = category.name.trim();
	return name.length > 0 && !name.includes('\u0000') && (Array.from(name).length <= CONTENT_LIMITS.articleCategory
		|| form.savedState.articleCategories.some(previous => previous.id === category.id && previous.name === name));
}));

function addCategory() {
	if (saving.value || form.state.articleCategories.length >= 50) return;
	form.state.articleCategories.push({ id: crypto.randomUUID(), name: '' });
}

function moveCategory(index: number, direction: -1 | 1) {
	if (saving.value) return;
	const next = index + direction;
	if (next < 0 || next >= form.state.articleCategories.length) return;
	const [category] = form.state.articleCategories.splice(index, 1);
	form.state.articleCategories.splice(next, 0, category);
}

async function removeCategory(id: string) {
	if (saving.value) return;
	if (form.savedState.articleCategories.some(category => category.id === id)) {
		const { canceled } = await os.confirm({ type: 'warning', text: i18n.ts._article.deleteCategoryConfirm });
		if (canceled || saving.value) return;
	}
	form.state.articleCategories = form.state.articleCategories.filter(category => category.id !== id);
}

async function addTag() {
	if (tagSaving.value || tags.value.length >= 500) return;
	const { canceled, result } = await os.inputText({ title: i18n.ts._article.addTag, minLength: 1, maxLength: CONTENT_LIMITS.articleTag });
	if (canceled || tagSaving.value) return;
	await updateTag('create', result);
}

async function editTag(tag: string) {
	if (tagSaving.value) return;
	const { canceled, result } = await os.inputText({ title: i18n.ts._article.editTag, default: tag, minLength: 1, maxLength: CONTENT_LIMITS.articleTag });
	if (canceled || tagSaving.value || result === tag) return;
	await updateTag('update', tag, result);
}

async function removeTag(tag: string) {
	if (tagSaving.value) return;
	const { canceled } = await os.confirm({ type: 'warning', text: i18n.tsx._article.deleteTagConfirm({ tag }) });
	if (canceled || tagSaving.value) return;
	await updateTag('delete', tag);
}

async function updateTag(action: 'create' | 'update' | 'delete', name: string, newName?: string) {
	if (tagSaving.value) return;
	tagSaving.value = true;
	try {
		tags.value = await misskeyApi('admin/article-tags/update', { action, name, newName });
	} catch (error) {
		if (isAccountSessionErrorHandled(error)) return;
		const code = (error as { code?: string } | null)?.code;
		const refreshed = await misskeyApi('admin/meta').then(updated => {
			tags.value = updated.articleTags;
			return true;
		}).catch(() => false);
		const message = code === 'ARTICLE_TAG_ALREADY_EXISTS' ? i18n.ts._article.tagAlreadyExists
			: code === 'NO_SUCH_ARTICLE_TAG' && refreshed ? i18n.ts._article.tagNotFound
				: code === 'INVALID_ARTICLE_TAG' || code === 'TOO_MANY_ARTICLE_TAGS' ? i18n.ts._article.invalidTagSettings
					: i18n.ts.somethingHappened;
		os.toast(message, 'error');
	} finally {
		tagSaving.value = false;
	}
}

async function save() {
	if (saving.value || !form.modified.value || !valid.value) return;
	saving.value = true;
	try {
		form.state.articleCategories = form.state.articleCategories.map(category => ({ ...category, name: category.name.trim() }));
		await form.save();
		instance.articleCategories = form.savedState.articleCategories.map(category => ({ ...category }));
		os.toast(i18n.ts.saved, 'success');
		await fetchInstance(true).catch(() => {});
	} catch (error) {
		if (!isAccountSessionErrorHandled(error)) os.toast(i18n.ts.somethingHappened, 'error');
	} finally {
		saving.value = false;
	}
}

definePage(() => ({ title: i18n.ts._article.categoryAndTagSettings, icon: 'ti ti-category' }));
</script>

<style lang="scss" module>
.sectionTitle {
	margin: 0;
	font-size: 1em;
}

.description {
	margin: 0;
	color: var(--MI_THEME-fgTransparentWeak);
}

.category {
	display: flex;
	align-items: flex-end;
	flex-wrap: wrap;
	gap: var(--MI-marginHalf);
}

.name {
	flex: 1 1 200px;
	min-width: 0;
}

.actions {
	padding-bottom: 7px;
}

.tagSection {
	margin-top: var(--MI-margin);
	padding-top: var(--MI-margin);
	border-top: var(--MI-divider);
}

.tagHeader {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: var(--MI-marginHalf);
}

.tagCount {
	margin-left: 0.5em;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.85em;
	font-weight: normal;
}

.tagList {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
	gap: var(--MI-marginHalf) var(--MI-margin);
}

.tag {
	display: flex;
	align-items: center;
	gap: var(--MI-marginHalf);
	min-width: 0;
	padding-block: 4px;
}

.tagName {
	flex: 1;
	min-width: 0;
	overflow-wrap: anywhere;
}

.tagActions {
	flex-shrink: 0;
}
</style>
