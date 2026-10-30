<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="layoutEl" class="_pageLayout" :class="{ _pageLayoutWithSidebar: !narrow }">
	<nav v-if="user" v-show="!narrow" class="_pageNavigation" :aria-label="i18n.ts.profilePage">
		<MkSuperMenu :def="menuDef" :searchIndex="searchIndex"/>
	</nav>
	<PageWithHeader v-model:tab="tab" class="_pageContent" :tabs="narrow ? profileTabs : []" :actions="headerActions" :swipable="narrow" :hideTitle="true" :displayBackButton="narrow">
		<div v-if="user" :id="`profile-${tab}`" data-profile-content>
			<MkInfo v-if="contentBlocked && socialTabs.has(tab)">{{ i18n.ts.blockedContent }}</MkInfo>
			<NestedRouterView v-else :initialRoute="initialRoute" :hideLoading="tab === 'home'"/>
		</div>
		<MkError v-else-if="error" page @retry="fetchUser()"/>
		<MkLoading v-else-if="tab !== 'home'" page/>
	</PageWithHeader>
</div>
</template>

<script lang="ts" setup>
import { computed, inject, watch, ref, shallowRef, provide, useTemplateRef, onBeforeUnmount } from 'vue';
import * as Misskey from 'misskey-js';
import { userPageContext } from './context.js';
import type { SuperMenuDef } from '@/components/MkSuperMenu.vue';
import type { SearchIndexItem } from '@/utility/inapp-search.js';
import { acct as getAcct } from '@@/js/user.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import { useRouter } from '@/router.js';
import MkSuperMenu from '@/components/MkSuperMenu.vue';
import MkInfo from '@/components/MkInfo.vue';
import { getUserBlockingState } from '@/utility/user-blocking.js';
import { serverContext, assertServerContext } from '@/server-context.js';
import { useUserStatistics } from '@/composables/use-user-statistics.js';
import { publishUserProfileUpdate, useUserProfile } from '@/composables/use-user-profile.js';
import { useGlobalEvent } from '@/events.js';
import { DI } from '@/di.js';

// contextは非ログイン状態の情報しかないためログイン時は利用できない
const CTX_USER = !$i && assertServerContext(serverContext, 'user') ? serverContext.user : null;

const props = defineProps<{
	acct: string;
}>();

const router = useRouter();
const parentPageActive = inject(DI.pageActive, ref(true));

// The user request may finish after this layout has been cached by navigation.
const initialRoute = router.current.route.path === '/@:acct' && router.current.props.get('acct') === props.acct
	? router.current
	: router.resolve(`/@${props.acct}`)!;
const currentRoute = shallowRef(initialRoute);
const ownsCurrentRoute = computed(() => router.currentRef.value.route.path === initialRoute.route.path && router.currentRef.value.props.get('acct') === props.acct);
provide(DI.pageActive, computed(() => parentPageActive.value && ownsCurrentRoute.value));

// Unknown child pages keep the existing fallback to the profile overview.
const PROFILE_PAGES = ['home', 'notes', 'pages', 'files', 'gallery', 'clips', 'reactions', 'lists', 'flashs', 'activity', 'achievements', 'raw'] as const;
const socialTabs = new Set(['notes', 'files', 'reactions', 'activity']);

function pathForTab(key: string): string {
	// トップは /@acct を正規のURLとして扱う (/@acct/home は別パスになってしまう)
	return key === 'home' ? `/@${props.acct}` : `/@${props.acct}/${key}`;
}

const tab = computed<string>({
	get: () => {
		const page = currentRoute.value.child?.props.get('page');
		return typeof page === 'string' && (PROFILE_PAGES as readonly string[]).includes(page) ? page : 'home';
	},
	set: (key) => {
		if (key === tab.value || !parentPageActive.value || !ownsCurrentRoute.value) return;
		router.pushByPath(pathForTab(key));
	},
});

const layoutEl = useTemplateRef('layoutEl');
const narrow = ref(window.innerWidth < 800);

watch(layoutEl, (el, _previous, onCleanup) => {
	if (el == null) return;
	const updateLayout = () => {
		if (el.clientWidth) narrow.value = el.clientWidth < 800;
	};
	updateLayout();
	const observer = new ResizeObserver(updateLayout);
	observer.observe(el);
	onCleanup(() => observer.disconnect());
}, { flush: 'post' });

const sourceUser = ref<null | Misskey.entities.UserDetailed>(CTX_USER);
const user = useUserProfile(sourceUser);
provide(userPageContext, { user, refreshUser, showMoreFiles: () => { tab.value = 'files'; } });
const contentBlocked = computed(() => user.value != null && $i?.id !== user.value.id
	&& ((getUserBlockingState(user.value.id) ?? user.value.isBlocking) || user.value.isBlocked));
useUserStatistics(sourceUser, { active: computed(() => false) });
const error = ref<any>(null);
// 连续调整角色或切换用户时，旧请求不能覆盖新资料。
let userRequestVersion = 0;
onBeforeUnmount(() => { userRequestVersion++; });

// 初回読込時専用（使える場合はサーバーコンテキストから取得する）
function fetchUser(): void {
	const requestVersion = ++userRequestVersion;
	if (props.acct == null) return;

	const acct = props.acct;
	const { username, host } = Misskey.acct.parse(acct);

	if (CTX_USER && CTX_USER.username === username && CTX_USER.host === host) {
		sourceUser.value = CTX_USER;
		return;
	}

	sourceUser.value = null;
	misskeyApi('users/show', {
		username,
		host,
	}).then(u => {
		if (props.acct !== acct || requestVersion !== userRequestVersion) return;
		sourceUser.value = u;
	}).catch(err => {
		if (props.acct !== acct || requestVersion !== userRequestVersion) return;
		error.value = err;
	});
}

watch(() => props.acct, fetchUser, {
	immediate: true,
});

watch(router.currentRef, resolved => {
	if (resolved.route.path === initialRoute.route.path && resolved.props.get('acct') === props.acct) currentRoute.value = resolved;
});

// 再読込時専用（強制fetch）
async function refreshUser(): Promise<void> {
	if (props.acct == null) return;

	const requestVersion = ++userRequestVersion;
	const acct = props.acct;
	const previousProfile = user.value;
	const { username, host } = Misskey.acct.parse(acct);
	const refreshedUser = await misskeyApi('users/show', { username, host });
	if (props.acct !== acct || requestVersion !== userRequestVersion) return;
	// Preserve any profile edit confirmed while this request was in flight.
	if (user.value === previousProfile) publishUserProfileUpdate(refreshedUser.id, refreshedUser);
	sourceUser.value = refreshedUser;
}

useGlobalEvent('userRolesUpdated', userId => {
	if (user.value?.id !== userId) return;
	void refreshUser().catch(console.error);
});
useGlobalEvent('userBlockingChanged', userId => {
	if (user.value?.id === userId) void refreshUser().catch(console.error);
});

const headerActions = computed(() => []);

const profileTabs = computed(() => user.value ? [{
	key: 'home',
	title: i18n.ts.overview,
	icon: 'ti ti-home',
}, {
	key: 'notes',
	title: i18n.ts.notes,
	icon: 'ti ti-notes',
}, {
	key: 'pages',
	// 此标签页同时列出文章和自定义页面。
	title: i18n.ts.articlesAndPages,
	icon: 'ti ti-file-description',
}, {
	key: 'files',
	title: i18n.ts.withFiles,
	icon: 'ti ti-paperclip',
}, {
	key: 'gallery',
	title: i18n.ts.gallery,
	icon: 'ti ti-library-photo',
}, {
	key: 'clips',
	title: i18n.ts.clips,
	icon: 'ti ti-bookmarks',
}, ...($i && ($i.id === user.value.id || $i.isAdmin || $i.isModerator)) || user.value.publicReactions ? [{
	key: 'reactions',
	title: i18n.ts.reactionHistory,
	icon: 'ti ti-mood-happy',
}] : [], {
	key: 'lists',
	title: i18n.ts.lists,
	icon: 'ti ti-users-group',
}, {
	key: 'flashs',
	title: i18n.ts.play,
	icon: 'ti ti-apps',
}, {
	key: 'activity',
	title: i18n.ts.activity,
	icon: 'ti ti-chart-line',
}, ...(user.value.host == null ? [{
	key: 'achievements',
	title: i18n.ts.achievements,
	icon: 'ti ti-medal',
}] : []), {
	key: 'raw',
	title: i18n.ts.rawData,
	icon: 'ti ti-code',
}] : []);

// 搜索范围与当前可见菜单一致，结果跳转到当前用户的对应页面。
const searchIndex = computed<SearchIndexItem[]>(() => profileTabs.value.map(item => ({
	id: `profile-${item.key}`,
	path: pathForTab(item.key),
	label: item.title,
	keywords: [item.key],
	texts: [],
	icon: item.icon,
})));

// 菜单使用真实链接，刷新或分享后保留当前页面。
const menuDef = computed<SuperMenuDef[]>(() => [{
	items: profileTabs.value.map(item => ({
		type: 'link' as const,
		to: pathForTab(item.key),
		icon: item.icon,
		text: item.title,
		active: tab.value === item.key,
	})),
}]);

definePage(() => ({
	title: i18n.ts.user,
	icon: 'ti ti-user',
	...user.value ? {
		title: user.value.name ? `${user.value.name} (@${user.value.username})` : `@${user.value.username}`,
		subtitle: `@${getAcct(user.value)}`,
		userName: user.value,
		avatar: user.value,
		path: `/@${user.value.username}`,
		share: {
			title: user.value.name,
		},
	} : {},
}));
</script>
