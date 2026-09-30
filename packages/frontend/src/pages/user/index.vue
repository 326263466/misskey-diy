<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="layoutEl" class="_pageLayout" :class="{ _pageLayoutWithSidebar: !narrow }">
	<nav v-if="user && !narrow" class="_pageNavigation" :aria-label="i18n.ts.profile">
		<MkSuperMenu :def="menuDef"/>
	</nav>
	<PageWithHeader v-model:tab="tab" class="_pageContent" :tabs="narrow ? profileTabs : []" :actions="headerActions" :swipable="narrow" :hideTitle="true" :displayBackButton="narrow">
		<div v-if="user" data-profile-content>
			<XHome v-if="tab === 'home'" :user="user" :singleColumn="true" @showMoreFiles="() => { tab = 'files'; }"/>
			<XNotes v-else-if="tab === 'notes'" :user="user"/>
			<XFiles v-else-if="tab === 'files'" :user="user"/>
			<XActivity v-else-if="tab === 'activity'" :user="user"/>
			<XAchievements v-else-if="tab === 'achievements'" :user="user"/>
			<XReactions v-else-if="tab === 'reactions'" :user="user"/>
			<XClips v-else-if="tab === 'clips'" :user="user"/>
			<XLists v-else-if="tab === 'lists'" :user="user"/>
			<XPages v-else-if="tab === 'pages'" :user="user"/>
			<XFlashs v-else-if="tab === 'flashs'" :user="user"/>
			<XGallery v-else-if="tab === 'gallery'" :user="user"/>
			<XRaw v-else-if="tab === 'raw'" :user="user"/>
		</div>
		<MkError v-else-if="error" @retry="fetchUser()"/>
		<MkLoading v-else/>
	</PageWithHeader>
</div>
</template>

<script lang="ts" setup>
import { defineAsyncComponent, computed, watch, ref, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import type { SuperMenuDef } from '@/components/MkSuperMenu.vue';
import { acct as getAcct } from '@/filters/user.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import { useRouter } from '@/router.js';
import MkSuperMenu from '@/components/MkSuperMenu.vue';
import { serverContext, assertServerContext } from '@/server-context.js';
import { useScrollPositionKeeper } from '@/composables/use-scroll-position-keeper.js';
import { useUserStatistics } from '@/composables/use-user-statistics.js';
import { useUserProfile } from '@/composables/use-user-profile.js';

const XHome = defineAsyncComponent(() => import('./home.vue'));
const XNotes = defineAsyncComponent(() => import('./notes.vue'));
const XFiles = defineAsyncComponent(() => import('./files.vue'));
const XActivity = defineAsyncComponent(() => import('./activity.vue'));
const XAchievements = defineAsyncComponent(() => import('./achievements.vue'));
const XReactions = defineAsyncComponent(() => import('./reactions.vue'));
const XClips = defineAsyncComponent(() => import('./clips.vue'));
const XLists = defineAsyncComponent(() => import('./lists.vue'));
const XPages = defineAsyncComponent(() => import('./pages.vue'));
const XFlashs = defineAsyncComponent(() => import('./flashs.vue'));
const XGallery = defineAsyncComponent(() => import('./gallery.vue'));
const XRaw = defineAsyncComponent(() => import('./raw.vue'));

// contextは非ログイン状態の情報しかないためログイン時は利用できない
const CTX_USER = !$i && assertServerContext(serverContext, 'user') ? serverContext.user : null;

const props = withDefaults(defineProps<{
	acct: string;
	page?: string;
}>(), {
	page: 'home',
});

const router = useRouter();

// URL の :page から復元するため、未知の値はプロフィールトップに落とす
const PROFILE_PAGES = ['home', 'notes', 'files', 'activity', 'achievements', 'reactions', 'clips', 'lists', 'pages', 'flashs', 'gallery', 'raw'] as const;

function pathForTab(key: string): string {
	// トップは /@acct を正規のURLとして扱う (/@acct/home は別パスになってしまう)
	return key === 'home' ? `/@${props.acct}` : `/@${props.acct}/${key}`;
}

// タブの状態はURLが持つ。リロードしても同じタブが開くよう、
// 切り替えはコントロールパネルや設定と同じくルーター遷移で行う
const tab = computed<string>({
	get: () => (PROFILE_PAGES as readonly string[]).includes(props.page) ? props.page : 'home',
	set: (key) => {
		if (key === tab.value) return;
		router.pushByPath(pathForTab(key));
	},
});

const layoutEl = useTemplateRef('layoutEl');
useScrollPositionKeeper(layoutEl);
const narrow = ref(window.innerWidth < 800);

watch(layoutEl, (el, _previous, onCleanup) => {
	if (el == null) return;
	const updateLayout = () => {
		narrow.value = el.clientWidth < 800;
	};
	updateLayout();
	const observer = new ResizeObserver(updateLayout);
	observer.observe(el);
	onCleanup(() => observer.disconnect());
}, { flush: 'post' });

const sourceUser = ref<null | Misskey.entities.UserDetailed>(CTX_USER);
const user = useUserProfile(sourceUser);
useUserStatistics(sourceUser, { active: computed(() => false) });
const error = ref<any>(null);

function fetchUser(): void {
	if (props.acct == null) return;

	const { username, host } = Misskey.acct.parse(props.acct);

	if (CTX_USER && CTX_USER.username === username && CTX_USER.host === host) {
		sourceUser.value = CTX_USER;
		return;
	}

	sourceUser.value = null;
	misskeyApi('users/show', {
		username,
		host,
	}).then(u => {
		sourceUser.value = u;
	}).catch(err => {
		error.value = err;
	});
}

watch(() => props.acct, fetchUser, {
	immediate: true,
});

const headerActions = computed(() => []);

const profileTabs = computed(() => user.value ? [{
	key: 'home',
	title: i18n.ts.overview,
	icon: 'ti ti-home',
}, {
	key: 'notes',
	title: i18n.ts.notes,
	icon: 'ti ti-pencil',
}, {
	key: 'files',
	title: i18n.ts.files,
	icon: 'ti ti-photo',
}, {
	key: 'activity',
	title: i18n.ts.activity,
	icon: 'ti ti-chart-line',
}, ...(user.value.host == null ? [{
	key: 'achievements',
	title: i18n.ts.achievements,
	icon: 'ti ti-medal',
}] : []), ...($i && ($i.id === user.value.id || $i.isAdmin || $i.isModerator)) || user.value.publicReactions ? [{
	key: 'reactions',
	title: i18n.ts.reaction,
	icon: 'ti ti-mood-happy',
}] : [], {
	key: 'clips',
	title: i18n.ts.clips,
	icon: 'ti ti-paperclip',
}, {
	key: 'lists',
	title: i18n.ts.lists,
	icon: 'ti ti-list',
}, {
	key: 'pages',
	title: i18n.ts.pages,
	icon: 'ti ti-news',
}, {
	key: 'flashs',
	title: 'Play',
	icon: 'ti ti-player-play',
}, {
	key: 'gallery',
	title: i18n.ts.gallery,
	icon: 'ti ti-icons',
}, {
	key: 'raw',
	title: i18n.ts.rawData,
	icon: 'ti ti-code',
}] : []);

// コントロールパネルや設定と同じく実リンクにする (URLが状態を持つのでリロードや共有でも同じタブが開く)
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

