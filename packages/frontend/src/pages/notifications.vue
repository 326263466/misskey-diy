<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :actions="headerActions" :tabs="headerTabs" :swipable="true">
	<template #header-actions>
		<MkPaginationControl v-if="currentPaginator" :key="tab" :paginator="currentPaginator" compact/>
	</template>
	<div class="_pageBody">
		<div v-if="tab === 'all' || tab === 'system'">
			<MkStreamingNotificationsTimeline :key="tab" ref="notificationsTimeline" :class="$style.notifications" :excludeTypes="excludeTypes"/>
		</div>
		<div v-else-if="tab === 'mentions'">
			<MkNotesTimeline :paginator="mentionsPaginator" :withControl="false"/>
		</div>
		<div v-else-if="tab === 'directNotes'">
			<MkNotesTimeline :paginator="directNotesPaginator" :withControl="false"/>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, markRaw, ref, useTemplateRef } from 'vue';
import { notificationTypes } from 'misskey-js';
import type { PageHeaderItem } from '@/types/page-header.js';
import type { MenuItem } from '@/types/menu.js';
import type { NotificationType } from '@/utility/notification-types.js';
import MkStreamingNotificationsTimeline from '@/components/MkStreamingNotificationsTimeline.vue';
import MkNotesTimeline from '@/components/MkNotesTimeline.vue';
import MkPaginationControl from '@/components/MkPaginationControl.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { Paginator } from '@/utility/paginator.js';
import { getNotificationTypeIcon, getNotificationTypeLabel, isSystemNotificationType, systemNotificationTypes } from '@/utility/notification-types.js';

const props = withDefaults(defineProps<{
	initialTab?: string;
}>(), {
	initialTab: 'all',
});

const tab = ref(['all', 'system', 'mentions', 'directNotes'].includes(props.initialTab) ? props.initialTab : 'all');
const notificationsTimeline = useTemplateRef('notificationsTimeline');
const allFilter = ref<NotificationType | null>(null);
const systemFilter = ref<NotificationType | null>(null);
const currentFilter = computed({
	get: () => tab.value === 'system' ? systemFilter.value : allFilter.value,
	set: (type: NotificationType | null) => {
		if (tab.value === 'system') systemFilter.value = type;
		else allFilter.value = type;
	},
});
const excludeTypes = computed(() => {
	if (currentFilter.value) return notificationTypes.filter(type => type !== currentFilter.value);
	return tab.value === 'system' ? notificationTypes.filter(type => !isSystemNotificationType(type)) : null;
});

const mentionsPaginator = markRaw(new Paginator('notes/mentions', {
	limit: 10,
}));

const directNotesPaginator = markRaw(new Paginator('notes/mentions', {
	limit: 10,
	params: {
		visibility: 'specified',
	},
}));

const currentPaginator = computed(() => {
	if (tab.value === 'mentions') return mentionsPaginator;
	if (tab.value === 'directNotes') return directNotesPaginator;
	return notificationsTimeline.value?.paginator;
});

function setFilter(ev: PointerEvent) {
	const systemTypeItems = systemNotificationTypes.map(type => ({
		text: getNotificationTypeLabel(type),
		icon: getNotificationTypeIcon(type),
		active: tab.value === 'system' && systemFilter.value === type,
		action: () => {
			systemFilter.value = type;
			tab.value = 'system';
		},
	}));
	const items: MenuItem[] = [{
		text: i18n.ts.all,
		icon: 'ti ti-inbox',
		active: currentFilter.value == null,
		action: () => {
			currentFilter.value = null;
		},
	}, { type: 'divider' }];
	if (tab.value === 'system') {
		items.push(...systemTypeItems);
	} else {
		items.push({
			type: 'parent',
			text: i18n.ts.system,
			icon: 'ti ti-shield-check',
			children: [{
				text: i18n.ts.all,
				icon: 'ti ti-inbox',
				action: () => {
					systemFilter.value = null;
					tab.value = 'system';
				},
			}, { type: 'divider' }, ...systemTypeItems],
		}, ...notificationTypes.filter(type => !isSystemNotificationType(type)).map(type => ({
			text: getNotificationTypeLabel(type),
			icon: getNotificationTypeIcon(type),
			active: allFilter.value === type,
			action: () => {
				allFilter.value = type;
			},
		})));
	}
	os.popupMenu(items, ev.currentTarget ?? ev.target);
}

const headerActions = computed<PageHeaderItem[]>(() => ([tab.value === 'all' || tab.value === 'system' ? {
	text: i18n.ts.filter,
	icon: 'ti ti-filter',
	highlighted: currentFilter.value != null,
	handler: setFilter,
} : undefined, tab.value === 'all' || tab.value === 'system' ? {
	text: i18n.ts.markAllAsRead,
	icon: 'ti ti-check',
	handler: () => {
		os.apiWithDialog('notifications/mark-all-as-read', {});
	},
} : undefined] as (PageHeaderItem | undefined)[]).filter(x => x !== undefined));

const headerTabs = computed(() => [{
	key: 'all',
	title: i18n.ts.all,
	icon: 'ti ti-inbox',
}, {
	key: 'system',
	title: i18n.ts.system,
	icon: 'ti ti-shield-check',
}, {
	key: 'mentions',
	title: i18n.ts.mentions,
	icon: 'ti ti-at',
}, {
	key: 'directNotes',
	title: i18n.ts.directNotes,
	icon: 'ti ti-mail',
}]);

definePage(() => ({
	title: i18n.ts.notifications,
	icon: 'ti ti-bell',
}));
</script>

<style module lang="scss">
.notifications {
	border-radius: var(--MI-radius);
	overflow: clip;
}
</style>
