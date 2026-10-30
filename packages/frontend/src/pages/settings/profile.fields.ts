/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, ref } from 'vue';
import { CONTENT_LIMITS } from 'misskey-js';
import { genId } from '@/utility/id.js';
import { enqueueProfileSave } from '@/utility/profile-save.js';

type ProfileField = { name: string; value: string };

export function useProfileFields(options: {
	websiteLabel: string;
	getFields: () => ProfileField[];
	save: (fields: ProfileField[]) => Promise<void>;
}) {
	const fieldLimit = 16;
	const websiteLabels = new Set(['website', 'homepage', '个人网站', options.websiteLabel.trim().toLowerCase()]);
	const initialFields = options.getFields();
	// 只提取首个网站字段，不合并同名资料或把其他链接误当作个人网站。
	const initialWebsiteIndex = initialFields.findIndex(field => websiteLabels.has(field.name.trim().toLowerCase()));
	const initialWebsite = initialFields[initialWebsiteIndex];
	const websiteFieldName = initialWebsite?.name ?? options.websiteLabel;
	const hasWebsite = ref(initialWebsite != null);
	const website = ref(initialWebsite?.value ?? '');
	const fields = ref(initialFields.filter((_, index) => index !== initialWebsiteIndex)
		.map(field => ({ id: genId(), name: field.name, value: field.value })));
	const websiteSaving = ref(false);
	const fieldsSaving = ref(false);

	function getWebsiteIndex(savedFields: ProfileField[]): number {
		return hasWebsite.value ? savedFields.findIndex(field => field.name === websiteFieldName) : -1;
	}

	function getSavedWebsite(): ProfileField | undefined {
		const savedFields = options.getFields();
		return savedFields[getWebsiteIndex(savedFields)];
	}

	const websiteChanged = computed(() => website.value.trim() !== (getSavedWebsite()?.value ?? ''));
	const websiteError = computed(() => {
		const value = website.value.trim();
		if (!websiteChanged.value || value === '') return null;
		if (Array.from(value).length > CONTENT_LIMITS.profileFieldValue) return 'length';
		if (!URL.canParse(value) || !['http:', 'https:'].includes(new URL(value).protocol)) return 'url';
		if (options.getFields().length + (getSavedWebsite() == null ? 1 : 0) > fieldLimit) return 'limit';
		return null;
	});
	const canSaveWebsite = computed(() => !websiteSaving.value && websiteChanged.value && websiteError.value == null);
	const additionalFieldLimit = computed(() => fieldLimit - (getSavedWebsite() == null ? 0 : 1));
	const canAddField = computed(() => !fieldsSaving.value && fields.value.length < additionalFieldLimit.value);
	const normalizedFields = computed(() => fields.value
		.map(field => ({ name: field.name.trim(), value: field.value.trim() }))
		.filter(field => field.name !== '' && field.value !== ''));

	function areFieldsValid(update: ProfileField[]): boolean {
		if (update.length > fieldLimit) return false;
		const savedFields = options.getFields();
		return update.every(field => {
			const existing = savedFields.find(saved => saved.name === field.name);
			return (existing != null || Array.from(field.name).length <= CONTENT_LIMITS.profileFieldName)
				&& (existing?.value === field.value || Array.from(field.value).length <= CONTENT_LIMITS.profileFieldValue);
		});
	}

	const validFields = computed(() => normalizedFields.value.length <= additionalFieldLimit.value && areFieldsValid(normalizedFields.value));

	function addField() {
		if (!canAddField.value) return;
		fields.value.push({ id: genId(), name: '', value: '' });
	}

	function deleteField(id: string) {
		if (fieldsSaving.value) return;
		fields.value = fields.value.filter(field => field.id !== id);
	}

	function moveField(id: string, offset: -1 | 1) {
		if (fieldsSaving.value) return;
		const index = fields.value.findIndex(field => field.id === id);
		const target = index + offset;
		if (index < 0 || target < 0 || target >= fields.value.length) return;
		const update = [...fields.value];
		const [field] = update.splice(index, 1);
		update.splice(target, 0, field);
		fields.value = update;
	}

	async function saveWebsite(): Promise<boolean> {
		if (!canSaveWebsite.value) return false;
		const value = website.value.trim();
		websiteSaving.value = true;
		try {
			return await enqueueProfileSave(async () => {
				// 在队列中读取已保存资料，避免带入另一个表单的草稿或覆盖它刚完成的保存。
				const savedFields = options.getFields();
				const websiteIndex = getWebsiteIndex(savedFields);
				const update = savedFields.map(field => ({ name: field.name, value: field.value }));
				if (websiteIndex >= 0) update.splice(websiteIndex, 1);
				if (value !== '') update.splice(websiteIndex >= 0 ? websiteIndex : 0, 0, { name: websiteFieldName, value });
				if (!areFieldsValid(update)) return false;
				await options.save(update);
				hasWebsite.value = value !== '';
				website.value = value;
				return true;
			});
		} catch {
			return false;
		} finally {
			websiteSaving.value = false;
		}
	}

	async function saveFields(): Promise<boolean> {
		if (fieldsSaving.value || !validFields.value) return false;
		const draft = normalizedFields.value.map(field => ({ ...field }));
		fieldsSaving.value = true;
		try {
			return await enqueueProfileSave(async () => {
				const savedFields = options.getFields();
				const websiteIndex = getWebsiteIndex(savedFields);
				const update = [...draft];
				if (websiteIndex >= 0) update.splice(Math.min(websiteIndex, update.length), 0, { ...savedFields[websiteIndex] });
				if (!areFieldsValid(update)) return false;
				await options.save(update);
				return true;
			});
		} catch {
			return false;
		} finally {
			fieldsSaving.value = false;
		}
	}

	return {
		website, websiteChanged, websiteError, websiteSaving, canSaveWebsite,
		fields, validFields, fieldsSaving, canAddField, fieldLimit,
		addField, deleteField, moveField, saveWebsite, saveFields,
	};
}
