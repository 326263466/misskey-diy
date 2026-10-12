<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions">
	<template #header-actions>
		<MkPaginationControl v-if="currentPaginator" :key="tab" :paginator="currentPaginator" compact/>
	</template>
	<div class="_pageBody">
		<!-- 指定用户可见但未 @ 的帖子不会产生通知，只能按帖子列表查看。 -->
		<div v-if="tab === 'directNotes'">
			<MkNotesTimeline :paginator="directNotesPaginator" :withControl="false" pageEmpty/>
		</div>
		<div v-else>
			<MkStreamingNotificationsTimeline :key="tab" ref="notificationsTimeline" :class="$style.notifications" :excludeTypes="excludeTypes" pageEmpty/>
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
import { useRouter } from '@/router.js';
import { Paginator } from '@/utility/paginator.js';
import {
	getNotificationCategoryIcon,
	getNotificationCategoryLabel,
	getNotificationTypeIcon,
	getNotificationTypeLabel,
	getUncategorizedNotificationTypes,
	isNotificationCategory,
	notificationCategories,
} from '@/utility/notification-types.js';
import type { NotificationCategory } from '@/utility/notification-types.js';

type NotificationListTab = 'all' | NotificationCategory;

const props = withDefaults(defineProps<{
	initialTab?: string;
}>(), {
	initialTab: 'all',
});

const router = useRouter();
// 地址统一用小写连字符：/my/notifications/direct-notes
const tab = computed<NotificationListTab | 'directNotes'>(() => {
	if (props.initialTab === 'direct-notes') return 'directNotes';
	return isNotificationCategory(props.initialTab) ? props.initialTab : 'all';
});

function openTab(value: NotificationListTab) {
	router.pushByPath(value === 'all' ? '/my/notifications' : `/my/notifications/${value}`);
}

const notificationsTimeline = useTemplateRef('notificationsTimeline');
// 每个分类各自记住筛选，切换分类后再回来仍保持。
const filters = ref<Record<NotificationListTab, NotificationType | null>>({ all: null, mentions: null, reactions: null, follows: null, system: null });
const currentFilter = computed(() => tab.value === 'directNotes' ? null : filters.value[tab.value]);
const excludeTypes = computed(() => {
	if (currentFilter.value) return notificationTypes.filter(type => type !== currentFilter.value);
	if (tab.value === 'all' || tab.value === 'directNotes') return null;
	const included: readonly NotificationType[] = notificationCategories[tab.value];
	return notificationTypes.filter(type => !included.includes(type));
});

const directNotesPaginator = markRaw(new Paginator('notes/mentions', {
	limit: 10,
	params: {
		visibility: 'specified',
	},
}));

const currentPaginator = computed(() => tab.value === 'directNotes' ? directNotesPaginator : notificationsTimeline.value?.paginator);

// 选中某个分类的子类型时跳到该分类，左侧菜单和内容保持一致。
function typeItems(target: NotificationListTab, types: readonly NotificationType[]): MenuItem[] {
	return types.map(type => ({
		text: getNotificationTypeLabel(type),
		icon: getNotificationTypeIcon(type),
		active: tab.value === target && filters.value[target] === type,
		action: () => {
			filters.value[target] = type;
			if (tab.value !== target) openTab(target);
		},
	}));
}

function setFilter(ev: PointerEvent) {
	if (tab.value === 'directNotes') return;
	const current = tab.value;
	const items: MenuItem[] = [{
		text: i18n.ts.all,
		icon: 'ti ti-inbox',
		active: currentFilter.value == null,
		action: () => {
			filters.value[current] = null;
		},
	}, { type: 'divider' }];
	if (current !== 'all') {
		items.push(...typeItems(current, notificationCategories[current]));
	} else {
		for (const category of Object.keys(notificationCategories) as NotificationCategory[]) {
			items.push({
				type: 'parent',
				text: getNotificationCategoryLabel(category),
				icon: getNotificationCategoryIcon(category),
				children: [{
					text: i18n.ts.all,
					icon: 'ti ti-inbox',
					action: () => {
						filters.value[category] = null;
						openTab(category);
					},
				}, { type: 'divider' }, ...typeItems(category, notificationCategories[category])],
			});
		}
		items.push(...typeItems('all', getUncategorizedNotificationTypes(notificationTypes)));
	}
	os.popupMenu(items, ev.currentTarget ?? ev.target);
}

const headerActions = computed<PageHeaderItem[]>(() => ([tab.value !== 'directNotes' ? {
	text: i18n.ts.filter,
	icon: 'ti ti-filter',
	highlighted: currentFilter.value != null,
	handler: setFilter,
} : undefined, tab.value !== 'directNotes' ? {
	text: i18n.ts.markAllAsRead,
	icon: 'ti ti-checks',
	handler: () => {
		os.apiWithDialog('notifications/mark-all-as-read', {});
	},
} : undefined] as (PageHeaderItem | undefined)[]).filter(x => x !== undefined));

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
