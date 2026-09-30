/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, defineAsyncComponent } from 'vue';
import type * as Misskey from 'misskey-js';
import type { MenuItem } from '@/types/menu.js';
import { updateCurrentAccountPartial } from '@/accounts.js';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import { apiWithDialog, popup } from '@/os.js';
import type { CustomStatus } from '@/utility/status-icons.js';
import type { AutoReplyStatus } from '@/utility/status-auto-reply.js';

async function updateStatus(params: Misskey.entities.IUpdateRequest): Promise<void> {
	const user = await apiWithDialog('i/update', params);
	updateCurrentAccountPartial({
		hideOnlineStatus: user.hideOnlineStatus,
		onlineStatusOverride: user.onlineStatusOverride,
		onlineStatus: user.onlineStatus,
		customStatus: user.customStatus,
		onlineStatusAutoReplies: user.onlineStatusAutoReplies,
	});
}

export function saveCustomStatus(customStatus: CustomStatus | null): Promise<void> {
	return updateStatus(customStatus
		? { onlineStatusOverride: 'online', customStatus }
		: { customStatus: null });
}

function editCustomStatus(): void {
	const { dispose } = popup(defineAsyncComponent(() => import('@/components/MkCustomStatusDialog.vue')), {
		initialStatus: $i?.customStatus,
		save: saveCustomStatus,
	}, { closed: () => dispose() });
}

export function saveOnlineStatusWithAutoReply(status: AutoReplyStatus, reply: string | null): Promise<void> {
	return updateStatus({
		onlineStatusOverride: status,
		customStatus: null,
		onlineStatusAutoReplies: { [status]: reply },
	});
}

function configureAutoReply(status: AutoReplyStatus): void {
	const { dispose } = popup(defineAsyncComponent(() => import('@/components/MkAutoReplyDialog.vue')), {
		status,
		initialReply: $i?.onlineStatusAutoReplies?.[status],
		save: (reply) => saveOnlineStatusWithAutoReply(status, reply),
	}, { closed: () => dispose() });
}

export function getOnlineStatusMenu(): MenuItem {
	const choices = [
		{ value: 'online', text: i18n.ts.online },
		{ value: 'away', text: i18n.ts._onlineStatus.away },
		{ value: 'busy', text: i18n.ts._onlineStatus.busy },
		{ value: 'doNotDisturb', text: i18n.ts._onlineStatus.doNotDisturb },
		{ value: 'invisible', text: i18n.ts._onlineStatus.invisible },
	] as const;
	const selected = computed(() => $i?.onlineStatusOverride ?? 'online');
	const customStatus = computed(() => $i?.customStatus ?? null);
	const customSelected = computed(() => selected.value === 'online' && customStatus.value !== null);
	return {
		type: 'parent',
		text: i18n.ts.onlineStatus,
		caption: computed(() => $i ? selected.value === 'online' && customStatus.value
			? customStatus.value.text
			: choices.find(choice => choice.value === selected.value)?.text : undefined),
		icon: 'ti ti-user-circle',
		children: [{
			type: 'grid',
			text: i18n.ts.onlineStatus,
			columns: 3,
			items: [...choices.map(choice => ({
				text: choice.text,
				status: choice.value,
				active: computed(() => selected.value === choice.value && !(choice.value === 'online' && customSelected.value)),
				actionOnActive: choice.value === 'away' || choice.value === 'busy' || choice.value === 'doNotDisturb',
				action: () => choice.value === 'away' || choice.value === 'busy' || choice.value === 'doNotDisturb'
					? configureAutoReply(choice.value)
					: updateStatus(choice.value === 'invisible'
						? { onlineStatusOverride: 'invisible' }
						: { onlineStatusOverride: choice.value, customStatus: null }),
			})), {
				text: i18n.ts.custom,
				status: 'custom',
				active: customSelected,
				actionOnActive: true,
				action: editCustomStatus,
			}],
		}],
	};
}
