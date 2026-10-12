<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
<div class="_panel _card" :class="$style.panel">
	<div>
		<MkA v-if="articleCategories" class="_button" :class="[$style.item, { [$style.itemActive]: !activeCategory }]" to="/" :aria-current="!activeCategory ? 'page' : undefined">
			<span :class="$style.itemText">{{ i18n.ts._article.allCategories }}</span>
		</MkA>
		<MkA v-else-if="chatConversations" class="_button" :class="[$style.item, { [$style.itemActive]: chatHomeActive }]" to="/chat" :aria-current="chatHomeActive ? 'page' : undefined">
			<i class="ti-fw ti ti-message-circle" :class="$style.itemIcon" aria-hidden="true"></i>
			<span :class="$style.itemText">{{ i18n.ts.chat }}</span>
		</MkA>
		<MkA v-else class="_button" :class="$style.item" :activeClass="$style.itemActive" to="/community-ranking">
			<i class="ti-fw ti ti-trophy" :class="$style.itemIcon"></i>
			<span :class="$style.itemText">{{ i18n.ts.communityRanking }}</span>
		</MkA>
	</div>
	<nav :aria-label="articleCategories ? i18n.ts._article.categories : chatConversations ? i18n.ts._chat.history : i18n.ts.menu">
		<template v-if="articleCategories">
			<MkA
				v-for="category in categories"
				:key="category.id"
				class="_button"
				:class="[$style.item, { [$style.itemActive]: activeCategory === category.id }]"
				:to="`/articles/category/${encodeURIComponent(category.id)}`"
				:aria-current="activeCategory === category.id ? 'page' : undefined"
			>
				<span :class="$style.itemText">{{ category.name }}</span>
			</MkA>
		</template>
		<XChatHistories v-else-if="chatConversations" v-slot="{ history, initializing, failed, retry }" all>
			<MkA v-for="item in history" :key="item.id" class="_button" :class="[$style.item, { [$style.itemActive]: activeConversation === item.id }]" :to="item.to" :aria-current="activeConversation === item.id ? 'page' : undefined">
				<i v-if="item.room" class="ti-fw ti ti-users" :class="$style.itemIcon" aria-hidden="true"></i>
				<MkAvatar v-else-if="item.other" :user="item.other" :preview="false" :class="[$style.itemIcon, $style.chatAvatar]"/>
				<span :class="$style.itemText"><template v-if="item.room">{{ item.room.name }}</template><MkUserName v-else-if="item.other" :user="item.other"/></span>
				<span v-if="item.message && !item.isMe && !item.message.isRead" :class="$style.itemIndicator"><i class="_indicatorCircle" :aria-label="i18n.ts.unread"></i></span>
			</MkA>
			<MkLoading v-if="initializing"/>
			<button v-else-if="failed && history.length === 0" type="button" class="_button" :class="$style.item" @click="retry"><i class="ti-fw ti ti-refresh" :class="$style.itemIcon" aria-hidden="true"></i><span :class="$style.itemText">{{ i18n.ts.retry }}</span></button>
			<div v-else-if="history.length === 0" :class="$style.chatState">{{ i18n.ts._chat.noHistory }}</div>
		</XChatHistories>
		<template v-else>
			<component
				:is="navbarItemDef[item].to ? 'MkA' : 'button'"
				v-for="item in menu"
				:key="item"
				class="_button"
				:class="$style.item"
				:activeClass="$style.itemActive"
				:to="navbarItemDef[item].to"
				v-on="navbarItemDef[item].action ? { click: navbarItemDef[item].action } : {}"
			>
				<i class="ti-fw" :class="[$style.itemIcon, navbarItemDef[item].icon]"></i>
				<span :class="$style.itemText">{{ navbarItemDef[item].title }}</span>
				<span v-if="navbarItemDef[item].indicated" :class="$style.itemIndicator" class="_blink">
					<span v-if="navbarItemDef[item].indicateValue" class="_indicateCounter" :class="$style.itemIndicateValueIcon">{{ navbarItemDef[item].indicateValue }}</span>
					<i v-else class="_indicatorCircle"></i>
				</span>
			</component>
		</template>
	</nav>
</div>
</div>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, unref } from 'vue';
import { navbarItemDef, primaryNavItems } from '@/navbar.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import { instance } from '@/instance.js';
import { mainRouter } from '@/router.js';
import { $i } from '@/i.js';

defineProps<{ articleCategories?: boolean; chatConversations?: boolean }>();

const XChatHistories = defineAsyncComponent(() => import('@/components/MkChatHistories.vue'));

const categories = computed(() => instance.articleCategories ?? []);
const activeCategory = computed(() => mainRouter.currentRef.value.child?.props.get('categoryId'));
const chatHomeActive = computed(() => mainRouter.currentRef.value.child?.route.name === 'chat-home');
const activeConversation = computed(() => {
	const props = mainRouter.currentRef.value.child?.props;
	return props?.get('roomId') ? `room:${props.get('roomId')}` : props?.get('userId') ? `user:${props.get('userId')}` : null;
});

// header 已有的条目不在左侧菜单重复显示（通知、聊天、搜索、主要板块和"更多"按钮已由 header 提供）
// 登录后公告归入通知中心；“关于”由右下角悬浮按钮提供。
const duplicatedWithHeader = ['notifications', 'chat', 'search', ...($i != null ? ['announcements'] : []), ...primaryNavItems];
const rankingCardItems = ['checkin', 'communityRanking'];
const fixedDockItems = ['games'] as const;

// 可见性判定放在这里而不是模板的 v-if，避免与 v-for 同元素共存
// navbarItemDef 是索引签名字典，未知 key 取到的是 undefined，故用 Object.hasOwn 判定存在性
const menu = computed(() => [...new Set([...prefer.r.menu.value, ...fixedDockItems])].filter(item => {
	if (item === '-' || duplicatedWithHeader.includes(item) || rankingCardItems.includes(item)) return false;
	if (!Object.hasOwn(navbarItemDef, item)) return false;
	const def = navbarItemDef[item];
	return unref(def.show) !== false;
}));

</script>

<style lang="scss" module>
.root {
	// 宽度由父组件 universal.vue 统一指定
	height: 100%;
	box-sizing: border-box;
	overflow-y: auto;
	overscroll-behavior: contain;
	scrollbar-width: none;

	&::-webkit-scrollbar {
		display: none;
	}
}

// 排行榜入口与菜单合在同一张卡片里，卡片高度随内容收缩。
.panel {
	padding: 8px 12px;
	box-sizing: border-box;
}

.item {
	position: relative;
	display: flex;
	align-items: center;
	width: 100%;
	min-height: 44px;
	box-sizing: border-box;
	padding: 10px 12px;
	margin-bottom: 2px;
	border-radius: var(--MI-cardRadius);
	color: var(--MI_THEME-fg);
	// 与顶部 header 导航项保持同一字号
	font-size: 1em;
	text-align: left;

	// 悬停只改变文字颜色，背景色只用于选中项
	&:hover {
		text-decoration: none;
		color: var(--MI_THEME-accent);
	}

	&.itemActive {
		color: var(--MI_THEME-accent);
		background: var(--MI_THEME-accentedBg);
		font-weight: 500;
	}
}

.itemIcon {
	flex-shrink: 0;
	margin-right: 10px;
}

.itemText {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.chatAvatar {
	flex-shrink: 0;
	width: 1.25em;
	height: 1.25em;
}

.chatState {
	padding: var(--MI-marginHalf);
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: .85em;
}

.itemIndicator {
	margin-left: auto;
	padding-left: 6px;
	color: var(--MI_THEME-navIndicator);
	font-size: 8px;
}

.itemIndicateValueIcon {
	font-size: 10px;
}

</style>
