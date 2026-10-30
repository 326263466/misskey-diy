/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, inject, ref } from 'vue';
import type { InjectionKey, Ref } from 'vue';
import type { SuperMenuDef } from '@/components/MkSuperMenu.vue';
import { DI } from '@/di.js';
import { i18n } from '@/i18n.js';
import { useRouter } from '@/router.js';

export type FeatureNavigationItem = {
	/** 与子路由的 name 一致 */
	key: string;
	title: string;
	icon: string;
	to: string;
	/** 不在菜单和顶部标签中显示，但路由匹配仍生效 */
	hidden?: boolean;
	/** 左侧菜单分组，相邻的同组项合为一组；顶部标签不分组 */
	group?: FeatureNavigationGroup;
};

export type FeatureNavigationGroup = 'explore' | 'mine';

// 分组按固定 key 判断，标题只用于显示，避免文案缺失时每项各成一组。
const groupTitles: Record<FeatureNavigationGroup, () => string> = {
	explore: () => i18n.ts.explore,
	mine: () => i18n.ts.mine,
};

export function featureNavigationMenu(items: readonly FeatureNavigationItem[], active: string): SuperMenuDef[] {
	const groups: SuperMenuDef[] = [];
	let last: FeatureNavigationItem | null = null;
	for (const item of items) {
		if (item.hidden) continue;
		if (last == null || last.group !== item.group) groups.push({ title: item.group ? groupTitles[item.group]() : undefined, items: [] });
		groups[groups.length - 1].items.push({
			icon: item.icon,
			text: item.title,
			to: item.to,
			active: active === item.key,
		});
		last = item;
	}
	return groups;
}

export const featureNavigationKey = Symbol() as InjectionKey<{
	items: readonly FeatureNavigationItem[];
	active: Readonly<Ref<string>>;
}>;

// 每个菜单项是独立子路由，切换时子页面会重建，因此这里只读取一次当前项。
export function useFeatureNavigationTab() {
	const router = useRouter();
	const navigation = inject(featureNavigationKey);
	if (navigation == null) throw new Error('feature navigation layout not provided');
	const narrow = inject(DI.pageNavigationNarrow, ref(true));
	const current = navigation.active.value;

	const tab = computed<string>({
		get: () => current,
		set: key => {
			const item = navigation.items.find(item => item.key === key);
			if (item != null) router.pushByPath(item.to);
		},
	});

	// 左侧菜单收起时改用顶部标签
	const headerTabs = computed(() => narrow.value ? navigation.items.filter(item => !item.hidden).map(({ key, title, icon }) => ({ key, title, icon })) : []);

	return { tab, headerTabs };
}
