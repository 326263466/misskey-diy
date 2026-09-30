<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<Transition
	:enterActiveClass="prefer.s.animation ? $style.transition_popup_enterActive : ''"
	:leaveActiveClass="prefer.s.animation ? $style.transition_popup_leaveActive : ''"
	:enterFromClass="prefer.s.animation ? $style.transition_popup_enterFrom : ''"
	:leaveToClass="prefer.s.animation ? $style.transition_popup_leaveTo : ''"
	appear @afterLeave="emit('closed')"
>
	<div
		v-if="showing"
		ref="rootEl"
		:class="$style.root"
		class="_popup _shadow"
		:style="{ zIndex, top: top + 'px', left: left + 'px', transformOrigin: origin }"
		:role="interactive ? 'dialog' : undefined"
		:aria-label="interactive ? (user ? userName(user) : i18n.ts.userInfo) : undefined"
		:tabindex="interactive ? -1 : undefined"
		@mouseover="!interactive && emit('mouseover')"
		@mouseleave="!interactive && !menuShown && emit('mouseleave')"
	>
		<MkError v-if="error" @retry="fetchUser()"/>
		<div v-else-if="user != null">
			<div :class="$style.banner" :style="user.bannerUrl ? { backgroundImage: `url(${prefer.s.disableShowingAnimatedImages ? getStaticImageUrl(user.bannerUrl) : user.bannerUrl})` } : ''">
				<span v-if="$i && $i.id != user.id && user.isFollowed" :class="$style.followed">{{ i18n.ts.followsYou }}</span>
			</div>
			<svg viewBox="0 0 128 128" :class="$style.avatarBack">
				<g transform="matrix(1.6,0,0,1.6,-38.4,-51.2)">
					<path d="M64,32C81.661,32 96,46.339 96,64C95.891,72.184 104,72 104,72C104,72 74.096,80 64,80C52.755,80 24,72 24,72C24,72 31.854,72.018 32,64C32,46.339 46.339,32 64,32Z" style="fill: var(--MI_THEME-popup);"/>
				</g>
			</svg>
			<MkA :to="userPage(user)">
				<MkAvatar :class="$style.avatar" :user="user" indicator/>
			</MkA>
			<div :class="$style.title">
				<MkA :class="$style.name" :to="userPage(user)"><MkUserName :user="user" :nowrap="false"/></MkA>
				<div :class="$style.username"><MkAcct :user="user"/></div>
				<MkUserWork :user="user" :class="$style.work"/>
			</div>
			<div :class="$style.description">
				<Mfm v-if="user.description" :class="$style.mfm" :text="user.description" :author="user"/>
				<div v-else style="opacity: 0.7;">{{ i18n.ts.noAccountDescription }}</div>
			</div>
			<div :class="$style.status">
				<MkA :class="$style.statusItem" :to="userPage(user, 'notes')">
					<div :class="$style.statusItemLabel">{{ i18n.ts.notes }}</div>
					<div>{{ number(user.notesCount) }}</div>
				</MkA>
				<MkA v-if="isFollowingVisibleForMe(user)" :class="$style.statusItem" :to="userPage(user, 'following')">
					<div :class="$style.statusItemLabel">{{ i18n.ts.following }}</div>
					<div>{{ number(user.followingCount) }}</div>
				</MkA>
				<MkA v-if="isFollowersVisibleForMe(user)" :class="$style.statusItem" :to="userPage(user, 'followers')">
					<div :class="$style.statusItemLabel">{{ i18n.ts.followers }}</div>
					<div>{{ number(user.followersCount) }}</div>
				</MkA>
			</div>
			<MkFollowButton v-if="$i && user.id != $i.id" :user="user" :class="$style.follow" mini @update:user="sourceUser = $event"/>
			<button v-tooltip="i18n.ts.more" class="_button" :class="[$style.menu, $style.glass]" :aria-label="i18n.ts.more" @click="showMenu"><i class="ti ti-dots"></i></button>
		</div>
		<div v-else>
			<MkLoading/>
		</div>
	</div>
</Transition>
</template>

<script lang="ts" setup>
import { computed, nextTick, onMounted, onUnmounted, ref, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import MkFollowButton from '@/components/MkFollowButton.vue';
import MkUserWork from '@/components/MkUserWork.vue';
import { userName, userPage } from '@/filters/user.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { calcPopupPosition } from '@/utility/popup-position.js';
import { getUserMenu } from '@/utility/get-user-menu.js';
import number from '@/filters/number.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import { $i } from '@/i.js';
import { isFollowingVisibleForMe, isFollowersVisibleForMe } from '@/utility/isFfVisibleForMe.js';
import { getStaticImageUrl } from '@/utility/media-proxy.js';
import { useUserStatistics } from '@/composables/use-user-statistics.js';
import { useUserStatisticsVisibility } from '@/composables/use-user-statistics-visibility.js';
import { useUserProfile } from '@/composables/use-user-profile.js';

const props = withDefaults(defineProps<{
	showing: boolean;
	q: string | Misskey.entities.UserDetailed;
	source: HTMLElement;
	interactive?: boolean;
}>(), {
	interactive: false,
});

const emit = defineEmits<{
	(ev: 'close'): void;
	(ev: 'closed'): void;
	(ev: 'mouseover'): void;
	(ev: 'mouseleave'): void;
}>();

const zIndex = os.claimZIndex('middle');
const rootEl = useTemplateRef('rootEl');
const sourceUser = ref<Misskey.entities.UserDetailed | null>(null);
const user = useUserProfile(sourceUser);
useUserStatistics(sourceUser, { active: useUserStatisticsVisibility(rootEl, computed(() => props.showing)) });
const top = ref(0);
const left = ref(0);
const origin = ref('center top');
const error = ref(false);
let menuShown = false;
let keepOpenAfterMenu = false;

function showMenu(ev: PointerEvent) {
	if (user.value == null || menuShown) return;
	const { menu, cleanup } = getUserMenu(user.value);
	menuShown = true;
	keepOpenAfterMenu = false;
	let actioned = false;
	if (!props.interactive) emit('mouseover');
	os.popupMenu(menu, ev.currentTarget ?? ev.target, {
		onAction: () => {
			if (actioned) return;
			actioned = true;
			if (props.showing) emit('close');
		},
	}).finally(() => {
		menuShown = false;
		cleanup();
		if (!actioned && !keepOpenAfterMenu && !props.interactive && props.showing && rootEl.value && !rootEl.value.matches(':hover') && !props.source.matches(':hover')) {
			emit('mouseleave');
		}
	});
}

async function fetchUser() {
	if (typeof props.q === 'object') {
		sourceUser.value = props.q;
		error.value = false;
	} else {
		const query: Misskey.entities.UsersShowRequest = props.q.startsWith('@') ?
			Misskey.acct.parse(props.q.substring(1)) :
			{ userId: props.q };

		// @ts-expect-error payloadの引数側の型が正常に解決されない
		misskeyApi('users/show', query).then(res => {
			if (!props.showing) return;
			sourceUser.value = res;
			error.value = false;
		}, () => {
			error.value = true;
		});
	}
}

function setPosition() {
	if (rootEl.value == null) return;

	const result = calcPopupPosition(rootEl.value, {
		anchorElement: props.source,
		direction: 'bottom',
		align: 'center',
		innerMargin: 8,
	});

	top.value = result.top;
	left.value = result.left;
	origin.value = result.transformOrigin;
}

function onOutsidePointer(event: PointerEvent) {
	if (!props.showing) return;
	const target = event.target as Node | null;
	if (rootEl.value?.contains(target) || props.source.contains(target)) {
		if (menuShown) keepOpenAfterMenu = true;
		return;
	}
	if (menuShown) {
		if (!(target instanceof Element && target.classList.contains('_modalBg'))) return;
		// 菜单遮罩覆盖了卡片，用视口坐标判断点击是否仍在卡片或触发元素内。
		const inside = [rootEl.value, props.source].some(element => {
			if (element == null) return false;
			const rect = element.getBoundingClientRect();
			return event.clientX >= rect.left && event.clientX < rect.right && event.clientY >= rect.top && event.clientY < rect.bottom;
		});
		if (inside) {
			keepOpenAfterMenu = true;
			return;
		}
	}
	emit('close');
}

function onKeydown(event: KeyboardEvent) {
	if (!props.interactive || !props.showing || menuShown || event.key !== 'Escape') return;
	event.preventDefault();
	event.stopPropagation();
	props.source.focus({ preventScroll: true });
	emit('close');
}

// 卡片内容是异步填充的，高度会变，需要重新判断上下翻转
const ro = new ResizeObserver(() => {
	setPosition();
});

onMounted(() => {
	fetchUser();

	if (rootEl.value) ro.observe(rootEl.value);
	setPosition();
	window.addEventListener('resize', setPosition);
	window.addEventListener('scroll', setPosition, true);
	// 两条打开路径都要能被外部点击关掉；Escape 只对可交互（点击打开）的卡片有意义
	window.document.addEventListener('pointerdown', onOutsidePointer);
	if (props.interactive) window.document.addEventListener('keydown', onKeydown, true);
	nextTick(() => {
		setPosition();
		if (props.interactive) rootEl.value?.focus({ preventScroll: true });
	});
});

onUnmounted(() => {
	ro.disconnect();
	window.document.removeEventListener('pointerdown', onOutsidePointer);
	window.document.removeEventListener('keydown', onKeydown, true);
	window.removeEventListener('resize', setPosition);
	window.removeEventListener('scroll', setPosition, true);
});
</script>

<style lang="scss" module>
.transition_popup_enterActive,
.transition_popup_leaveActive {
	transition: opacity 0.15s, transform 0.15s !important;
}
.transition_popup_enterFrom,
.transition_popup_leaveTo {
	opacity: 0;
	transform: scale(0.9);
}

.root {
	position: absolute;
	width: 300px;
	overflow: clip;
	transform-origin: center top;
}

.banner {
	height: 78px;
	background-color: rgba(0, 0, 0, 0.1);
	background-size: cover;
	background-position: center;
}

.followed {
	position: absolute;
	top: 12px;
	left: 12px;
	padding: 4px 8px;
	color: #fff;
	background: rgba(0, 0, 0, 0.7);
	font-size: 0.7em;
	border-radius: 6px;
}

.avatarBack {
	width: 100px;
	position: absolute;
	top: 28px;
	left: 0;
	right: 0;
	margin: 0 auto;
}

.avatar {
	display: block;
	position: absolute;
	top: 38px;
	left: 0;
	right: 0;
	margin: 0 auto;
	z-index: 2;
	width: 58px;
	height: 58px;
}

.title {
	position: relative;
	z-index: 3;
	display: block;
	padding: 8px 26px 16px 26px;
	margin-top: 16px;
	text-align: center;
}

.name {
	display: inline-block;
	font-weight: bold;
	word-break: break-all;
}

.username {
	display: block;
	font-size: 0.8em;
	opacity: 0.7;
}

.description {
	// 与个人主页信息区一致, 用画布灰做圆角内嵌底
	margin: 0 16px 12px;
	padding: 12px 16px;
	font-size: 0.8em;
	text-align: center;
	background: var(--MI_THEME-bg);
	border-radius: var(--MI-cardRadius);
}

.work {
	justify-content: center;
	margin-top: 5px;
}

.mfm {
	display: -webkit-box;
	-webkit-line-clamp: 5;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.status {
	margin: 0 16px 16px;
	padding: 12px;
	background: var(--MI_THEME-bg);
	border-radius: var(--MI-cardRadius);
}

.statusItem {
	display: inline-block;
	width: 33%;
	text-align: center;
}

.statusItemLabel {
	font-size: 0.7em;
	color: color(from var(--MI_THEME-fg) srgb r g b / 0.75);
}

.menu {
	position: absolute;
	top: 8px;
	right: 8px;
	display: grid;
	place-items: center;
	width: 31px;
	height: 31px;
	border-radius: 999px;

	&:focus-visible {
		outline-offset: 2px;
	}
}

.follow {
	--MI-followButton-fg: var(--MI_THEME-accent);
	--MI-followButton-bg: color(from var(--MI_THEME-modalBg) srgb r g b / 0.55);
	--MI-followButton-backdropFilter: var(--MI-blur, blur(8px));
	position: absolute !important;
	top: 8px;
	right: 44px;
}

.root .glass {
	color: light-dark(var(--MI_THEME-panel), var(--MI_THEME-fg));
	background: color(from var(--MI_THEME-modalBg) srgb r g b / 0.55);
	-webkit-backdrop-filter: var(--MI-blur, blur(8px));
	backdrop-filter: var(--MI-blur, blur(8px));
	text-shadow: 0 0 8px var(--MI_THEME-shadow);
}

.menu, .follow {
	:global(.ti) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.28em;
		height: 1.28em;
		line-height: 1;
		vertical-align: 0;
	}
}
</style>
