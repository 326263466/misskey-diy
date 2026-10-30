<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard>
	<div class="_pageBody _gaps_m" :aria-busy="saving">
		<template v-if="section === 'categories'">
			<MkPaginationBar v-slot="{ items, pageSize }" v-model:page="categoryPage" :items="categories" :disabled="saving" class="_adminPanel">
				<div class="_adminToolbar">
					<p :class="$style.description">{{ i18n.ts._article.categorySettingsDescription }}</p>
					<div class="_adminToolbarActions"><MkButton small primary :disabled="saving || form.state.articleCategories.length >= 50" @click="addCategory($event, pageSize)"><i class="ti ti-plus" aria-hidden="true"></i> {{ i18n.ts._article.addCategory }}</MkButton></div>
				</div>
				<div class="_adminTableContainer">
					<table class="_adminTable">
						<thead>
							<tr>
								<th scope="col" class="_adminTableNumber">{{ i18n.ts.sort }}</th>
								<th scope="col">{{ i18n.ts._article.categoryName }}</th>
								<th scope="col" class="_adminTableActions">{{ i18n.ts.operations }}</th>
							</tr>
						</thead>
						<tbody>
							<tr v-for="{ category, index } in items" :key="category.id">
								<td class="_adminTableNumber">{{ index + 1 }}</td>
								<td class="_adminTableMain"><button type="button" class="_button _textButton" :disabled="saving" @click="openCategory(category.id, $event)">{{ category.name || i18n.ts.notSet }}</button></td>
								<td class="_adminTableActions">
									<div class="_adminTableTools">
										<button type="button" class="_button _textButton" :disabled="saving || index === 0" :aria-label="i18n.ts._article.moveCategoryUp" :title="i18n.ts._article.moveCategoryUp" @click="moveCategory(index, -1)"><i class="ti ti-arrow-up" aria-hidden="true"></i></button>
										<button type="button" class="_button _textButton" :disabled="saving || index === form.state.articleCategories.length - 1" :aria-label="i18n.ts._article.moveCategoryDown" :title="i18n.ts._article.moveCategoryDown" @click="moveCategory(index, 1)"><i class="ti ti-arrow-down" aria-hidden="true"></i></button>
										<button type="button" class="_button _textButton" :disabled="saving" @click="openCategory(category.id, $event)"><i class="ti ti-pencil" aria-hidden="true"></i> {{ i18n.ts.edit }}</button>
										<button type="button" class="_button _textButton" :class="$style.remove" :disabled="saving" @click="removeCategory(category.id)"><i class="ti ti-trash" aria-hidden="true"></i> {{ i18n.ts.remove }}</button>
									</div>
								</td>
							</tr>
							<tr v-if="form.state.articleCategories.length === 0"><td colspan="3" class="_adminTableEmpty">{{ i18n.ts.nothing }}</td></tr>
						</tbody>
					</table>
				</div>
			</MkPaginationBar>
		</template>
		<section v-if="section === 'tags'" class="_gaps_m" :aria-busy="tagSaving">
			<MkPaginationBar v-slot="{ items }" :items="tags" :disabled="tagSaving" class="_adminPanel">
				<div class="_adminToolbar">
					<span :class="$style.tagCount">{{ tags.length }}/500</span>
					<div class="_adminToolbarActions"><MkButton small primary :disabled="tagSaving || tags.length >= 500" @click="addTag"><i class="ti ti-plus" aria-hidden="true"></i> {{ i18n.ts._article.addTag }}</MkButton></div>
				</div>
				<div class="_adminTableContainer">
					<table class="_adminTable">
						<thead>
							<tr>
								<th scope="col">{{ i18n.ts._article.tags }}</th>
								<th scope="col" class="_adminTableActions">{{ i18n.ts.operations }}</th>
							</tr>
						</thead>
						<tbody>
							<tr v-for="tag in items" :key="tag">
								<td class="_adminTableMain">#{{ tag }}</td>
								<td class="_adminTableActions">
									<div class="_adminTableTools">
										<button type="button" class="_button _textButton" :disabled="tagSaving" :aria-label="`${i18n.ts.edit} ${tag}`" @click="editTag(tag)"><i class="ti ti-pencil" aria-hidden="true"></i> {{ i18n.ts.edit }}</button>
										<button type="button" class="_button _textButton" :class="$style.remove" :disabled="tagSaving" :aria-label="`${i18n.ts.remove} ${tag}`" @click="removeTag(tag)"><i class="ti ti-trash" aria-hidden="true"></i> {{ i18n.ts.remove }}</button>
									</div>
								</td>
							</tr>
							<tr v-if="tags.length === 0"><td colspan="2" class="_adminTableEmpty">{{ i18n.ts.nothing }}</td></tr>
						</tbody>
					</table>
				</div>
			</MkPaginationBar>
		</section>
	</div>
	<template v-if="section === 'categories'" #footer>
		<div class="_pageFooter _buttons">
			<MkButton primary :disabled="saving || !form.modified.value || !valid" :wait="saving" @click="save"><i class="ti ti-check"></i> {{ i18n.ts.save }}</MkButton>
			<MkButton :disabled="saving || !form.modified.value" @click="form.discard">{{ i18n.ts.cancel }}</MkButton>
		</div>
	</template>
</PageWithHeader>
<Teleport to="#misskey-popups" defer>
	<MkModalWindow v-if="editingCategory" ref="categoryWindow" :width="600" :height="360" autoHeight :closeOnBackdrop="false" headerIcon="ti ti-category" role="dialog" tabindex="-1" aria-modal="true" :aria-label="i18n.ts._article.categoryName" @closed="onCategoryDialogClosed">
		<template #header>{{ i18n.ts.edit }} · {{ i18n.ts._article.categoryName }}</template>
		<div :class="$style.categoryEditor">
			<MkInput v-model="editingCategory.name" :counterMaxLength="CONTENT_LIMITS.articleCategory" :disabled="saving" autofocus>
				<template #label>{{ i18n.ts._article.categoryName }}</template>
			</MkInput>
		</div>
		<template #footer><div class="_buttons"><MkButton primary :disabled="saving" @click="categoryWindow?.close()">{{ i18n.ts.done }}</MkButton></div></template>
	</MkModalWindow>
</Teleport>
</template>

<script lang="ts" setup>
import { computed, inject, nextTick, onActivated, onDeactivated, ref, useTemplateRef, watch } from 'vue';
import { CONTENT_LIMITS } from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkPaginationBar from '@/components/MkPaginationBar.vue';
import { useForm } from '@/composables/use-form.js';
import { i18n } from '@/i18n.js';
import { fetchInstance, instance } from '@/instance.js';
import { definePage } from '@/page.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { isAccountSessionErrorHandled } from '@/utility/account-session-error.js';
import { DI } from '@/di.js';
import * as os from '@/os.js';

const props = withDefaults(defineProps<{
	section?: 'categories' | 'tags';
}>(), {
	section: 'categories',
});

const pageActive = inject(DI.pageActive, ref(true));
const componentActive = ref(true);
const meta = await misskeyApi('admin/meta');
const saving = ref(false);
const tagSaving = ref(false);
const tags = ref(meta.articleTags);
const form = useForm({ articleCategories: meta.articleCategories }, async state => {
	await misskeyApi('admin/update-meta', { articleCategories: state.articleCategories });
});
const editingCategoryId = ref<string | null>(null);
const editingCategory = computed(() => form.state.articleCategories.find(category => category.id === editingCategoryId.value));
const categoryWindow = useTemplateRef('categoryWindow');
const categoryTrigger = ref<HTMLElement | null>(null);

function onCategoryDialogClosed() {
	editingCategoryId.value = null;
	const target = categoryTrigger.value;
	categoryTrigger.value = null;
	if (!target || !pageActive.value || !componentActive.value) return;
	nextTick(() => {
		if (pageActive.value && componentActive.value && target.isConnected) target.focus({ preventScroll: true });
	});
}

function dismissCategoryDialog() {
	categoryTrigger.value = null;
	editingCategoryId.value = null;
}

watch(pageActive, value => {
	if (!value) dismissCategoryDialog();
}, { flush: 'sync' });
onActivated(() => { componentActive.value = true; });
onDeactivated(() => {
	componentActive.value = false;
	dismissCategoryDialog();
});

const categoryPage = ref(1);
const categories = computed(() => form.state.articleCategories.map((category, index) => ({ category, index })));
const valid = computed(() => form.state.articleCategories.length <= 50 && form.state.articleCategories.every(category => {
	const name = category.name.trim();
	return name.length > 0 && !name.includes('\u0000') && (Array.from(name).length <= CONTENT_LIMITS.articleCategory
		|| form.savedState.articleCategories.some(previous => previous.id === category.id && previous.name === name));
}));

function addCategory(ev: Event, pageSize: number) {
	if (saving.value || form.state.articleCategories.length >= 50) return;
	const id = crypto.randomUUID();
	form.state.articleCategories.push({ id, name: '' });
	categoryPage.value = Math.ceil(form.state.articleCategories.length / pageSize);
	openCategory(id, ev);
}

function openCategory(id: string, ev: Event) {
	if (saving.value || !pageActive.value || !componentActive.value) return;
	categoryTrigger.value = ev.currentTarget instanceof HTMLElement ? ev.currentTarget : null;
	editingCategoryId.value = id;
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

definePage(() => ({
	title: props.section === 'tags' ? i18n.ts._article.tags : i18n.ts._article.categories,
	icon: props.section === 'tags' ? 'ti ti-hash' : 'ti ti-category',
}));
</script>

<style lang="scss" module>
.description {
	margin: 0;
	color: var(--MI_THEME-fgTransparentWeak);
}

.categoryEditor {
	padding: var(--MI-margin);
}

.remove {
	color: var(--MI_THEME-error);
}

.tagCount {
	color: var(--MI_THEME-fgTransparentWeak);
}
</style>
