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
			<div class="_imageContainer" :class="$style.banner">
				<img v-if="user.bannerUrl" class="_imageBackground" :src="prefer.s.disableShowingAnimatedImages ? getStaticImageUrl(user.bannerUrl) : user.bannerUrl" alt=""/>
			</div>
			<div :class="$style.actions">
				<MkFollowButton v-if="user.id !== $i?.id" :user="user" :class="[$style.action, $style.follow]" @update:user="sourceUser = $event"/>
				<button v-tooltip="i18n.ts.more" class="_button" :class="[$style.action, $style.menu]" :aria-label="i18n.ts.more" @click="showMenu"><i class="ti ti-dots" aria-hidden="true"></i></button>
			</div>
			<div :class="$style.main">
				<MkA :to="userPage(user)" :class="$style.avatarLink">
					<MkAvatar :class="$style.avatar" :user="user" indicator/>
				</MkA>
				<div :class="$style.title">
					<div :class="$style.nameRow">
						<MkA :class="$style.name" :to="userPage(user)"><MkUserName :user="user" :nowrap="false"/></MkA>
						<span v-if="$i && user.memo" v-tooltip="`${i18n.ts.memo}: ${user.memo}`" :class="$style.memo">{{ user.memo }}</span>
					</div>
					<div :class="$style.username">
						<MkAcct :user="user"/>
						<span v-if="$i && $i.id != user.id && user.isFollowed" :class="$style.followed">{{ i18n.ts.followsYou }}</span>
					</div>
					<MkUserWork :user="user" :class="$style.work"/>
				</div>
				<div :class="$style.description">
					<Mfm v-if="user.description" :class="$style.mfm" :text="user.description" :author="user"/>
					<span v-else :class="$style.noDescription">{{ i18n.ts.noAccountDescription }}</span>
				</div>
				<div :class="$style.status">
					<MkA :class="$style.statusItem" :to="userPage(user, 'notes')">
						<b>{{ number(user.notesCount) }}</b>{{ i18n.ts.notes }}
					</MkA>
					<MkA v-if="isFollowingVisibleForMe(user)" :class="$style.statusItem" :to="userPage(user, 'following')">
						<b>{{ number(user.followingCount) }}</b>{{ i18n.ts.following }}
					</MkA>
					<MkA v-if="isFollowersVisibleForMe(user)" :class="$style.statusItem" :to="userPage(user, 'followers')">
						<b>{{ number(user.followersCount) }}</b>{{ i18n.ts.followers }}
					</MkA>
				</div>
			</div>
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
import { userName, userPage } from '@@/js/user.js';
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
import { usePopupDismissal } from '@/composables/use-popup-dismissal.js';

const props = withDefaults(defineProps<{
	showing: boolean;
	q: string | Misskey.entities.UserDetailed;
	source: HTMLElement;
	interactive?: boolean;
	closeOnBackdrop?: boolean;
}>(), {
	interactive: false,
	closeOnBackdrop: true,
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
		onBackdropClick: onOutsideClick,
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

function onOutsideClick(event: MouseEvent) {
	if (!props.showing || !props.closeOnBackdrop) return;
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

usePopupDismissal({
	element: () => rootEl.value,
	isShowing: () => props.showing,
	useHistory: () => props.interactive,
	onEscape: () => {
		if (menuShown) return false;
		if (props.interactive) props.source.focus({ preventScroll: true });
		emit('close');
		return true;
	},
	onClickOutside: onOutsideClick,
});

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
	nextTick(() => {
		setPosition();
		if (props.interactive) rootEl.value?.focus({ preventScroll: true });
	});
});

onUnmounted(() => {
	ro.disconnect();
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
	height: 84px;
	background: linear-gradient(135deg, color-mix(in srgb, var(--MI_THEME-accent) 55%, var(--MI_THEME-popup)), color-mix(in srgb, var(--MI_THEME-accent) 20%, var(--MI_THEME-popup)));
}

.main {
	padding: 0 16px 14px;
}

.avatarLink {
	position: relative;
	z-index: 1;
	display: block;
	width: fit-content;
	margin-top: -32px;
}

.avatar {
	display: block;
	width: 64px;
	height: 64px;
	box-shadow: 0 0 0 3px var(--MI_THEME-popup);
}

.title {
	margin-top: 10px;
	min-width: 0;
}

.nameRow {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 2px 8px;
	min-width: 0;
}

.name {
	font-size: 1.05em;
	font-weight: bold;
	word-break: break-all;
}

// 备注用浅色标签和用户名区分，样式与“关注了你”一致。
.memo {
	max-width: 12em;
	padding: 1px 6px;
	border-radius: 4px;
	font-size: .8em;
	line-height: 1.5;
	color: var(--MI_THEME-fgTransparent);
	background: var(--MI_THEME-buttonBg);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.username {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
	margin-top: 2px;
	font-size: .85em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.followed {
	padding: 1px 6px;
	border-radius: 4px;
	font-size: .9em;
	color: var(--MI_THEME-fgTransparent);
	background: var(--MI_THEME-buttonBg);
}

.work {
	margin-top: 6px;
}

.description {
	margin-top: 10px;
	font-size: .9em;
	line-height: 1.6;
	color: var(--MI_THEME-fgTransparent);
}

.mfm {
	display: -webkit-box;
	-webkit-line-clamp: 3;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.noDescription {
	color: var(--MI_THEME-fgTransparentWeak);
}

.status {
	display: flex;
	flex-wrap: wrap;
	gap: 4px 16px;
	margin-top: 12px;
	padding-top: 12px;
	border-top: var(--MI-divider);
	font-size: .85em;
}

.statusItem {
	color: var(--MI_THEME-fgTransparentWeak);

	b {
		margin-right: 4px;
		color: var(--MI_THEME-fg);
		font-variant-numeric: tabular-nums;
	}

	&:hover {
		color: var(--MI_THEME-fg);
	}
}

// 与源码一致，操作按钮浮在横幅右上角。
.actions {
	position: absolute;
	top: 8px;
	right: 8px;
	z-index: 2;
	display: flex;
	align-items: center;
	gap: 6px;
}

// 横幅上的按钮比默认尺寸小一号；关注按钮的状态配色由 MkFollowButton 统一提供。
.actions > .action.action {
	height: 26px;
	border-radius: 999px;
	font-size: 12px;
}

.actions > .follow.follow {
	min-width: 56px;
	padding: 0 12px;
}

.actions > .menu.menu {
	display: inline-grid;
	place-items: center;
	width: 26px;
	font-size: 14px;
	color: var(--MI_THEME-fg);
	background: var(--MI_THEME-buttonBg);
	transition: background-color .15s ease;

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: 2px;
	}
}

@media (prefers-reduced-motion: reduce) {
	.actions > .menu.menu { transition: none; }
}
</style>
