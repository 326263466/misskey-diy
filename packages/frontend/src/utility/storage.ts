/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { readonly, ref } from 'vue';
import * as os from '@/os.js';
import { store } from '@/store.js';
import { i18n } from '@/i18n.js';

export const storagePersistenceSupported = window.isSecureContext && 'storage' in navigator;
const storagePersisted = ref(false);

export async function getStoragePersistenceStatusRef() {
	if (storagePersistenceSupported) {
		storagePersisted.value = await navigator.storage.persisted().catch(() => false);
	}

	return readonly(storagePersisted);
}

export async function enableStoragePersistence() {
	if (!storagePersistenceSupported) return;
	try {
		const persisted = await navigator.storage.persist();
		if (persisted) {
			storagePersisted.value = true;
			// 提示条或按钮会直接消失，补充结果提示
			os.toast(i18n.ts.enabled, 'success');
		} else {
			os.toast(i18n.ts.somethingHappened, 'error');
		}
	}	catch (err) {
		os.toast(i18n.ts.somethingHappened, 'error');
	}
}

export function skipStoragePersistence() {
	store.set('showStoragePersistenceSuggestion', false);
}
