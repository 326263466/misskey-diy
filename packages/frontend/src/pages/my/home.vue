<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader contentCard :hideHeader="!navigationNarrow">
	<div :class="$style.root">
		<header :class="$style.welcome">
			<MkAvatar :user="account" :link="false" :preview="false" :class="$style.avatar"/>
			<div :class="$style.welcomeText">
				<h1>{{ i18n.tsx.welcomeBackWithName({ name: account.name || account.username }) }}</h1>
				<p>{{ i18n.ts._myCenter.homeDescription }}</p>
				<MkA :to="profilePath" :class="$style.profileLink">{{ i18n.ts.profilePage }}</MkA>
			</div>
		</header>

		<section :class="$style.section" :aria-busy="loading">
			<div :class="$style.heading">
				<h2>{{ i18n.ts._myCenter.dataOverview }}</h2>
				<MkButton small :disabled="loading" :wait="loading" @click="refresh">{{ i18n.ts.reload }}</MkButton>
			</div>
			<dl :class="$style.metrics">
				<div v-for="metric in metrics" :key="metric.label">
					<dt>{{ metric.label }}</dt>
					<dd>{{ formatNumber(metric.value) }}</dd>
				</div>
			</dl>
			<p :class="$style.caption">{{ i18n.ts._myCenter.articleStatsScope }}</p>
			<p v-if="!loading && (!userCounts || !articleStats)" :class="$style.error" role="status">{{ i18n.ts._myCenter.overviewLoadFailed }}</p>
		</section>

		<section :class="$style.section" :aria-busy="loading">
			<div :class="$style.heading">
				<h2>{{ i18n.ts._myCenter.recentArticles }}</h2>
				<MkA :to="userPage(account, 'pages')" :class="$style.sectionLink">{{ i18n.ts.articlesAndPages }}</MkA>
			</div>
			<ul v-if="recentArticles?.length" :class="$style.articleList">
				<li v-for="article in recentArticles" :key="article.id">
					<MkA :to="`/articles/${article.id}`" :class="$style.articleTitle">{{ article.title }}</MkA>
					<p v-if="article.summary" :class="$style.articleSummary">{{ article.summary }}</p>
					<div :class="$style.articleMeta">
						<MkTime :time="article.createdAt" mode="detail"/>
						<span>{{ i18n.ts._article.views }} {{ formatNumber(article.articleViews) }}</span>
						<span>{{ i18n.ts.numberOfLikes }} {{ formatNumber(article.likedCount) }}</span>
					</div>
				</li>
			</ul>
			<p v-else-if="loading" :class="$style.empty" role="status">{{ i18n.ts.loading }}</p>
			<p v-else-if="recentArticles == null" :class="$style.error" role="status">{{ i18n.ts._myCenter.recentArticlesLoadFailed }}</p>
			<MkResult v-else type="empty" :text="i18n.ts._myCenter.noRecentArticles"/>
		</section>

		<div :class="[$style.section, $style.shortcuts]">
			<section :class="$style.wallet" :aria-busy="loading">
				<div :class="$style.heading">
					<h2>{{ i18n.ts._wallet.title }}</h2>
					<MkA to="/my/wallet" :class="$style.sectionLink">{{ i18n.ts._wallet.overview }}</MkA>
				</div>
				<dl :class="$style.balances">
					<div><dt>{{ i18n.ts._wallet.balance }}</dt><dd>{{ formatNumber(wallet?.balance) }}</dd></div>
					<div><dt>{{ i18n.ts._wallet.reservedBalance }}</dt><dd>{{ formatNumber(wallet?.reservedBalance) }}</dd></div>
				</dl>
				<p v-if="!loading && !wallet" :class="$style.error" role="status">{{ i18n.ts._wallet.loadFailed }}</p>
				<div :class="$style.walletLinks">
					<MkA to="/my/checkin">{{ i18n.ts._checkin.dailyCheckin }}</MkA>
					<MkA to="/my/wallet/transactions">{{ i18n.ts._wallet.transactions }}</MkA>
				</div>
			</section>
			<section>
				<h2>{{ i18n.ts._myCenter.quickLinks }}</h2>
				<ul :class="$style.quickLinks">
					<li v-for="link in quickLinks" :key="link.to">
						<MkA :to="link.to"><i :class="link.icon" aria-hidden="true"></i><span>{{ link.label }}</span></MkA>
					</li>
				</ul>
			</section>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, inject, onActivated, onBeforeUnmount, onDeactivated, ref, watch } from 'vue';
import type { entities } from 'misskey-js';
import { userPage } from '@@/js/user.js';
import MkA from '@/components/global/MkA.vue';
import MkAvatar from '@/components/global/MkAvatar.vue';
import MkTime from '@/components/global/MkTime.vue';
import MkButton from '@/components/MkButton.vue';
import { DI } from '@/di.js';
import { ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { misskeyApi } from '@/utility/misskey-api.js';

const account = ensureSignin();
const profilePath = userPage(account);
const userCounts = ref<entities.UsersShowPartialBulkResponse[number] | null>(null);
const articleStats = ref<entities.ArticlesStatsResponse | null>(null);
const wallet = ref<entities.IWalletResponse | null>(null);
const recentArticles = ref<entities.ArticlesListResponse | null>(null);
const loading = ref(false);
const pageActive = inject(DI.pageActive, ref(true));
const navigationNarrow = inject('pageNavigationNarrow', ref(false));
let active = true;
let generation = 0;

const metrics = computed(() => [
	{ label: i18n.ts.notesCount, value: userCounts.value?.notesCount },
	{ label: i18n.ts._myCenter.publicArticles, value: articleStats.value?.articlesCount },
	{ label: i18n.ts._myCenter.articleViews, value: articleStats.value?.articleViewsCount },
	{ label: i18n.ts.followersCount, value: userCounts.value?.followersCount },
]);

const quickLinks = [
	{ label: i18n.ts.drive, icon: 'ti ti-cloud', to: '/my/drive' },
	{ label: i18n.ts._marketplace.myProducts, icon: 'ti ti-package', to: '/my/products' },
	{ label: i18n.ts._myCenter.purchases, icon: 'ti ti-receipt', to: '/my/orders' },
	{ label: i18n.ts._benefits.title, icon: 'ti ti-ticket', to: '/my/benefits' },
];

function isCount(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function formatNumber(value: number | undefined): string {
	return isCount(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—';
}

async function refresh() {
	if (!active || !pageActive.value || loading.value) return;
	const request = ++generation;
	loading.value = true;
	// 各项独立加载，单个接口失败不隐藏其他已取得的真实数据。
	const [counts, articles, balance, recent] = await Promise.allSettled([
		misskeyApi('users/show-partial-bulk', { userIds: [account.id] }),
		misskeyApi('articles/stats', { userId: account.id }),
		misskeyApi('i/wallet'),
		misskeyApi('articles/list', { userId: account.id, sort: 'latest', limit: 3 }),
	]);
	if (!active || !pageActive.value || request !== generation) return;

	const countsValue = counts.status === 'fulfilled' && Array.isArray(counts.value) ? counts.value.find(user => user.id === account.id) : null;
	const articlesValue = articles.status === 'fulfilled' ? articles.value : null;
	const walletValue = balance.status === 'fulfilled' ? balance.value : null;
	userCounts.value = countsValue && isCount(countsValue.notesCount) && isCount(countsValue.followersCount) ? countsValue : null;
	articleStats.value = articlesValue && isCount(articlesValue.articlesCount) && isCount(articlesValue.articleViewsCount) ? articlesValue : null;
	wallet.value = walletValue && isCount(walletValue.balance) && isCount(walletValue.reservedBalance) ? walletValue : null;
	recentArticles.value = recent.status === 'fulfilled' && Array.isArray(recent.value) ? recent.value : null;
	loading.value = false;
}

function invalidate() {
	generation++;
	loading.value = false;
}

function deactivate() {
	active = false;
	invalidate();
}

watch(pageActive, value => { if (value) void refresh(); else invalidate(); });
onActivated(() => {
	const wasInactive = !active;
	active = true;
	if (wasInactive) void refresh();
});
onDeactivated(deactivate);
onBeforeUnmount(deactivate);
void refresh();

definePage(() => ({ title: i18n.ts.home, icon: 'ti ti-home' }));
</script>

<style lang="scss" module>
.root { min-width: 0; container-type: inline-size; }
.root h1, .root h2, .root p { margin: 0; }
.root h1, .root h2 { color: var(--MI_THEME-fgHighlighted); }
.root h1 { font-size: 1.5em; font-weight: 600; line-height: 1.4; overflow-wrap: anywhere; }
.root h2 { font-size: 1.25em; font-weight: 500; line-height: 1.5; }
.welcome { display: flex; align-items: center; gap: var(--MI-margin); padding-bottom: var(--MI-margin); }
.avatar { flex-shrink: 0; width: 64px; height: 64px; }
.welcomeText { display: grid; min-width: 0; gap: var(--MI-marginHalf); }
.welcomeText p, .caption, .empty, .articleSummary { color: var(--MI_THEME-fgTransparentWeak); line-height: 1.7; }
.welcomeText p, .caption, .profileLink, .sectionLink { font-size: .9em; }
.profileLink { justify-self: start; color: var(--MI_THEME-accent); }
.section { margin-top: var(--MI-margin); padding-top: var(--MI-margin); border-top: var(--MI-divider); }
.heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--MI-marginHalf); }
.sectionLink { color: var(--MI_THEME-fgTransparentWeak); }
.metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--MI-margin); margin: var(--MI-margin) 0; }
.metrics > div { min-width: 0; padding: var(--MI-margin); border-radius: var(--MI-radius); background: var(--MI_THEME-panelHighlight); }
.metrics dt, .balances dt { color: var(--MI_THEME-fgTransparent); font-size: .9em; }
.metrics dd, .balances dd { margin: var(--MI-marginHalf) 0 0; font-size: 1.8em; line-height: 1.35; font-weight: 600; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.root .error { margin-top: var(--MI-marginHalf); color: var(--MI_THEME-error); font-size: .9em; line-height: 1.7; }
.articleList { margin: var(--MI-marginHalf) 0 0; padding: 0; list-style: none; }
.articleList li { padding-block: var(--MI-margin); }
.articleList li + li { border-top: var(--MI-divider); }
.articleTitle { display: block; font-weight: 600; line-height: 1.6; overflow-wrap: anywhere; }
.root .articleSummary { margin-top: var(--MI-marginHalf); font-size: .9em; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.articleMeta { display: flex; align-items: center; flex-wrap: wrap; gap: var(--MI-marginHalf) var(--MI-margin); margin-top: var(--MI-marginHalf); color: var(--MI_THEME-fgTransparentWeak); font-size: .85em; }
.root .empty { padding-block: calc(var(--MI-margin) * 2); font-size: .9em; }
.shortcuts { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: var(--MI-margin); }
.wallet { padding-right: var(--MI-margin); border-right: var(--MI-divider); }
.balances { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--MI-margin); margin: var(--MI-margin) 0; }
.balances dd { font-size: 1.5em; }
.walletLinks { display: flex; align-items: center; flex-wrap: wrap; gap: var(--MI-marginHalf) var(--MI-margin); font-size: .9em; }
.quickLinks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--MI-margin); padding: 0; margin: var(--MI-margin) 0 0; list-style: none; }
.quickLinks a { display: flex; align-items: center; gap: var(--MI-marginHalf); font-size: .9em; }
.quickLinks i { color: var(--MI_THEME-fgTransparentWeak); }
.root a:is(:hover, :focus-visible) { color: var(--MI_THEME-accent); text-decoration: none; }
.root a:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: 3px; }

@container (max-width: 600px) {
	.metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	.shortcuts { grid-template-columns: minmax(0, 1fr); }
	.wallet { padding: 0 0 var(--MI-margin); border-right: 0; border-bottom: var(--MI-divider); }
}

@container (max-width: 400px) {
	.avatar { width: 48px; height: 48px; }
	.root h1 { font-size: 1.25em; }
}
</style>
