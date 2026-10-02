<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<component :is="prefer.s.enablePullToRefresh ? MkPullToRefresh : 'div'" :refresher="() => reload()">
	<div class="_pageBody">
		<div ref="rootEl" class="ftskorzw" :class="{ wide: !narrow }" style="container-type: inline-size;">
			<div class="main _gaps">
				<div class="profile _gaps">
					<MkAccountMoved v-if="user.movedTo" :movedTo="user.movedTo"/>
					<MkRemoteCaution v-if="user.host != null" :href="user.url ?? user.uri!"/>
					<MkInfo v-if="user.host == null && user.username.includes('.')">{{ i18n.ts.isSystemAccount }}</MkInfo>

					<div :key="user.id" class="main _panel">
						<div ref="bannerEl" class="banner-container">
							<div class="banner" :style="style"></div>
							<div class="fade"></div>
							<div class="title">
								<div class="name" :class="$style.nameRow">
									<MkUserName :class="$style.displayName" :user="user" :nowrap="true"/>
									<button v-if="$i && memo" type="button" class="_button" :class="$style.memoButton" :aria-label="i18n.ts.editMemo" :disabled="isMemoBusy" @click="editMemo">#{{ memo }}</button>
								</div>
								<div class="bottom" :class="$style.bannerUserInfo">
									<span class="username" :class="$style.bannerUsername"><MkAcct :user="user" :detail="true"/></span>
									<span v-if="user.isLocked"><i class="ti ti-lock"></i></span>
									<span v-if="user.isBot"><i class="ti ti-robot"></i></span>
									<button v-if="$i && !memo" type="button" class="_button add-note-button" :disabled="isMemoBusy" @click="editMemo">
										<i class="ti ti-edit"></i> {{ i18n.ts.addMemo }}
									</button>
								</div>
							</div>
							<span v-if="$i && $i.id != user.id && user.isFollowed" class="followed">{{ i18n.ts.followsYou }}</span>
							<div class="actions">
								<button v-tooltip="i18n.ts.more" class="menu _button" :aria-label="i18n.ts.more" @click="menu"><i class="ti ti-dots"></i></button>
								<MkFollowButton v-if="$i?.id != user.id" v-model:user="user" :inline="true" :transparent="false" :full="true" class="koudoku"/>
							</div>
						</div>
						<MkAvatar class="avatar" :user="user" indicator/>
						<div class="title">
							<div class="name" :class="[$style.nameRow, $style.centeredNameRow]">
								<MkUserName :class="$style.displayName" :user="user" :nowrap="true"/>
								<button v-if="$i && memo" type="button" class="_button" :class="$style.memoButton" :aria-label="i18n.ts.editMemo" :disabled="isMemoBusy" @click="editMemo">#{{ memo }}</button>
							</div>
							<div class="bottom">
								<span class="username"><MkAcct :user="user" :detail="true"/></span>
								<span v-if="user.isLocked"><i class="ti ti-lock"></i></span>
								<span v-if="user.isBot"><i class="ti ti-robot"></i></span>
							</div>
						</div>
						<div v-if="user.followedMessage != null" class="followedMessage">
							<MkFukidashi class="fukidashi" :tail="narrow ? 'none' : 'left'" negativeMargin>
								<div class="messageHeader">{{ i18n.ts.messageToFollower }}</div>
								<div><MkSparkle><Mfm :plain="true" :text="user.followedMessage" :author="user" class="_selectable"/></MkSparkle></div>
							</MkFukidashi>
						</div>
						<div v-if="user.roles.length > 0" class="roles">
							<span v-for="role in user.roles" :key="role.id" v-tooltip="role.description" class="role" :style="{ '--color': role.color ?? '' }">
								<MkA v-adaptive-bg :to="`/roles/${role.id}`">
									<img v-if="role.iconUrl" style="height: 1.3em; vertical-align: -22%;" :src="role.iconUrl"/>
									{{ role.name }}
								</MkA>
							</span>
						</div>
						<div v-if="iAmModerator" class="moderationNote">
							<MkModerationNote v-model="moderationNote" :save="saveModerationNote"/>
						</div>
						<div class="description">
							<span class="descriptionLabel">{{ i18n.ts._profile.description }}</span>
							<MkOmit>
								<Mfm v-if="user.description" :text="user.description" :isNote="false" :author="user" class="_selectable"/>
								<p v-else class="empty">{{ i18n.ts.noAccountDescription }}</p>
							</MkOmit>
						</div>
						<div class="fields system">
							<dl v-if="user.location" class="field">
								<dt class="name"><i class="ti ti-map-pin ti-fw"></i> {{ i18n.ts.location }}</dt>
								<dd class="value">{{ user.location }}</dd>
							</dl>
							<dl v-if="user.company" class="field">
								<dt class="name"><i class="ti ti-building ti-fw" aria-hidden="true"></i> {{ i18n.ts._profile.company }}</dt>
								<dd class="value">{{ user.company }}</dd>
							</dl>
							<dl v-if="user.jobTitle" class="field">
								<dt class="name"><i class="ti ti-briefcase ti-fw" aria-hidden="true"></i> {{ i18n.ts._profile.jobTitle }}</dt>
								<dd class="value">{{ user.jobTitle }}</dd>
							</dl>
							<dl v-if="user.birthday" class="field">
								<dt class="name"><i class="ti ti-cake ti-fw"></i> {{ i18n.ts.birthday }}</dt>
								<dd class="value">{{ user.birthday.replace('-', '/').replace('-', '/') }} ({{ i18n.tsx.yearsOld({ age }) }})</dd>
							</dl>
							<dl class="field">
								<dt class="name"><i class="ti ti-calendar ti-fw"></i> {{ i18n.ts.registeredDate }}</dt>
								<dd class="value">{{ dateString(user.createdAt) }} (<MkTime :time="user.createdAt"/>)</dd>
							</dl>
						</div>
						<div v-if="user.fields.length > 0" class="fields">
							<dl v-for="(field, i) in user.fields" :key="i" class="field">
								<dt class="name">
									<Mfm :text="field.name" :author="user" :plain="true" :colored="false" class="_selectable"/>
								</dt>
								<dd class="value">
									<Mfm :text="field.value" :author="user" :colored="false" class="_selectable"/>
									<i v-if="user.verifiedLinks.includes(field.value)" v-tooltip:dialog="i18n.ts.verifiedLink" class="ti ti-circle-check" :class="$style.verifiedLink"></i>
								</dd>
							</dl>
						</div>
						<div class="status">
							<MkA :to="userPage(user, 'notes')">
								<span>{{ i18n.ts.notes }}</span>
								<b>{{ number(user.notesCount) }}</b>
							</MkA>
							<MkA v-if="isFollowingVisibleForMe(user)" :to="userPage(user, 'following')">
								<span>{{ i18n.ts.following }}</span>
								<b>{{ number(user.followingCount) }}</b>
							</MkA>
							<MkA v-if="isFollowersVisibleForMe(user)" :to="userPage(user, 'followers')">
								<span>{{ i18n.ts.followers }}</span>
								<b>{{ number(user.followersCount) }}</b>
							</MkA>
						</div>
					</div>
				</div>

				<div class="contents _gaps">
					<div v-if="user.pinnedNotes.length > 0" class="_gaps">
						<MkNote v-for="note in user.pinnedNotes" :key="note.id" class="note _panel" :note="note" :pinned="true"/>
					</div>
					<MkInfo v-else-if="$i && $i.id === user.id">{{ i18n.ts.userPagePinTip }}</MkInfo>
					<template v-if="narrow">
						<MkLazy>
							<XFiles :key="user.id" :user="user" @showMore="emit('showMoreFiles')"/>
						</MkLazy>
						<MkLazy>
							<XActivity :key="user.id" :user="user"/>
						</MkLazy>
					</template>
					<div v-if="!disableNotes">
						<MkLazy>
							<XTimeline ref="timelineEl" :user="user"/>
						</MkLazy>
					</div>
				</div>
			</div>
			<div v-if="!narrow" class="sub _gaps" style="container-type: inline-size;">
				<XFiles :key="user.id" :user="user" @showMore="emit('showMoreFiles')"/>
				<XActivity :key="user.id" :user="user"/>
			</div>
		</div>
	</div>
</component>
</template>

<script lang="ts" setup>
import { defineAsyncComponent, computed, onMounted, onUnmounted, onActivated, onDeactivated, nextTick, watch, ref, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import { getScrollContainer } from '@@/js/scroll.js';
import MkNote from '@/components/MkNote.vue';
import MkFollowButton from '@/components/MkFollowButton.vue';
import MkAccountMoved from '@/components/MkAccountMoved.vue';
import MkFukidashi from '@/components/MkFukidashi.vue';
import MkRemoteCaution from '@/components/MkRemoteCaution.vue';
import MkModerationNote from '@/components/MkModerationNote.vue';
import MkOmit from '@/components/MkOmit.vue';
import MkInfo from '@/components/MkInfo.vue';
import { getUserMenu } from '@/utility/get-user-menu.js';
import number from '@/filters/number.js';
import { userPage } from '@/filters/user.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { $i, iAmModerator } from '@/i.js';
import { dateString } from '@/filters/date.js';
import { confetti } from '@/utility/confetti.js';
import { isFollowingVisibleForMe, isFollowersVisibleForMe } from '@/utility/isFfVisibleForMe.js';
import { useRouter } from '@/router.js';
import { getStaticImageUrl } from '@/utility/media-proxy.js';
import MkSparkle from '@/components/MkSparkle.vue';
import { prefer } from '@/preferences.js';
import MkPullToRefresh from '@/components/MkPullToRefresh.vue';
import { isBirthday } from '@/utility/is-birthday.js';
import { useUserStatistics } from '@/composables/use-user-statistics.js';
import { useUserStatisticsVisibility } from '@/composables/use-user-statistics-visibility.js';
import type XTimeline_TypeReferenceOnly from './index.timeline.vue';

function calcAge(birthdate: string): number {
	const date = new Date(birthdate);
	const now = new Date();

	let yearDiff = now.getFullYear() - date.getFullYear();
	const monthDiff = now.getMonth() - date.getMonth();
	const pastDate = now.getDate() < date.getDate();

	if (monthDiff < 0 || (monthDiff === 0 && pastDate)) {
		yearDiff--;
	}

	return yearDiff;
}

const XFiles = defineAsyncComponent(() => import('./index.files.vue'));
const XActivity = defineAsyncComponent(() => import('./index.activity.vue'));
const XTimeline = defineAsyncComponent(() => import('./index.timeline.vue'));

const props = withDefaults(defineProps<{
	user: Misskey.entities.UserDetailed;
	singleColumn?: boolean;
	/** Refetches the user in place. Supplied by the parent page. */
	refreshUser?: () => Promise<void>;
	/** Test only; MkNotesTimeline currently causes problems in vitest */
	disableNotes?: boolean;
}>(), {
	singleColumn: false,
	refreshUser: undefined,
	disableNotes: false,
});

const emit = defineEmits<{
	(ev: 'showMoreFiles'): void;
}>();

const router = useRouter();

const user = ref(props.user);
watch(() => props.user, value => {
	user.value = value;
});
const narrow = ref<null | boolean>(props.singleColumn ? true : null);
const rootEl = useTemplateRef('rootEl');
useUserStatistics(user, { active: useUserStatisticsVisibility(rootEl) });
const bannerEl = useTemplateRef('bannerEl');
const memo = ref(props.user.memo ?? '');
const isMemoBusy = ref(false);
const timelineEl = useTemplateRef<InstanceType<typeof XTimeline_TypeReferenceOnly>>('timelineEl');
const moderationNote = ref(props.user.moderationNote ?? '');
watch([() => props.user.id, () => props.user.moderationNote], () => {
	moderationNote.value = props.user.moderationNote ?? '';
});

async function saveModerationNote(value: string) {
	await os.apiWithDialog('admin/update-user-note', { userId: props.user.id, text: value });
}

const style = computed(() => {
	if (props.user.bannerUrl == null) return {};
	if (prefer.s.disableShowingAnimatedImages) {
		return {
			backgroundImage: `url(${ getStaticImageUrl(props.user.bannerUrl) })`,
		};
	} else {
		return {
			backgroundImage: `url(${ props.user.bannerUrl })`,
		};
	};
});

const age = computed(() => {
	return props.user.birthday ? calcAge(props.user.birthday) : NaN;
});

function menu(ev: PointerEvent) {
	const { menu, cleanup } = getUserMenu(user.value, router);
	os.popupMenu(menu, ev.currentTarget ?? ev.target).finally(cleanup);
}

async function editMemo() {
	if (isMemoBusy.value) return;
	isMemoBusy.value = true;
	const userId = props.user.id;
	const previousMemo = memo.value;
	try {
		const { canceled, result } = await os.inputText({
			title: previousMemo ? i18n.ts.editMemo : i18n.ts.addMemo,
			default: previousMemo,
		});
		if (canceled || result === previousMemo) return;

		await os.apiWithDialog('users/update-memo', { memo: result, userId });
		if (userId === props.user.id) memo.value = result;
	} catch {
		return;
	} finally {
		isMemoBusy.value = false;
	}
}

watch([() => props.user.id, () => props.user.memo], () => {
	memo.value = props.user.memo ?? '';
});

// ここでは失敗は握りつぶす（Pull to Refreshがもどらなくなるので）
async function reload() {
	await Promise.allSettled([
		props.refreshUser?.(),
		timelineEl.value?.reload(),
	]);
}

let bannerParallaxResizeObserver: ResizeObserver | null = null;

function calcBannerParallax() {
	if (!bannerEl.value || !CSS.supports('view-timeline-inset', 'auto 100px')) return;
	const elRect = bannerEl.value.getBoundingClientRect();
	const scrollEl = getScrollContainer(bannerEl.value);
	const scrollPosition = scrollEl?.scrollTop ?? window.scrollY;
	const scrollContainerHeight = scrollEl?.clientHeight ?? window.innerHeight;
	const scrollContainerTop = scrollEl?.getBoundingClientRect().top ?? 0;
	const top = scrollPosition + elRect.top - scrollContainerTop;
	const bottom = scrollContainerHeight - top;
	bannerEl.value.style.setProperty('--bannerParallaxInset', `auto ${bottom}px`);
}

function initCalcBannerParallax() {
	const scrollEl = bannerEl.value ? getScrollContainer(bannerEl.value) : null;
	if (scrollEl != null && CSS.supports('view-timeline-inset', 'auto 100px')) {
		bannerParallaxResizeObserver = new ResizeObserver(() => {
			calcBannerParallax();
		});
		bannerParallaxResizeObserver.observe(scrollEl);
	}
}

function disposeBannerParallaxResizeObserver() {
	if (bannerParallaxResizeObserver) {
		bannerParallaxResizeObserver.disconnect();
		bannerParallaxResizeObserver = null;
	}
}

onMounted(() => {
	narrow.value = props.singleColumn || rootEl.value!.clientWidth < 1000;

	if (isBirthday(user.value)) {
		confetti({
			duration: 1000 * 4,
		});
	}

	nextTick(calcBannerParallax);

	initCalcBannerParallax();
});

onActivated(() => {
	if (bannerEl.value) {
		calcBannerParallax();
		initCalcBannerParallax();
	}
});

onUnmounted(disposeBannerParallaxResizeObserver);
onDeactivated(disposeBannerParallaxResizeObserver);
</script>

<style lang="scss" scoped>
.ftskorzw {

	> .main {

		> .punished {
			font-size: 0.8em;
			padding: 16px;
		}

		> .profile {

			> .main {
				position: relative;
				overflow: clip;

				> .banner-container {
					position: relative;
					--bannerHeight: 250px;
					height: var(--bannerHeight);
					overflow: clip;

					> .banner {
						width: 100%;
						height: 100%;
						background-size: cover;
						background-color: #4c5e6d;
						background-repeat: repeat-y;
						background-position-x: center;
						background-position-y: 50%;
						will-change: background-position-y;
					}

					> .fade {
						position: absolute;
						bottom: 0;
						left: 0;
						width: 100%;
						height: 78px;
						background: linear-gradient(transparent, rgba(#000, 0.7));
					}

					> .followed {
						position: absolute;
						top: 12px;
						left: 12px;
						padding: 4px 8px;
						color: #fff;
						background: rgba(0, 0, 0, 0.7);
						font-size: 0.7em;
						border-radius: 6px;
					}

					> .actions {
						position: absolute;
						top: 12px;
						right: 12px;
						display: flex;
						align-items: center;
						-webkit-backdrop-filter: var(--MI-blur, blur(8px));
						backdrop-filter: var(--MI-blur, blur(8px));
						background: rgba(0, 0, 0, 0.2);
						padding: 8px;
						border-radius: 24px;

						> .menu {
							display: grid;
							place-items: center;
							height: 31px;
							width: 31px;
							color: #fff;
							text-shadow: 0 0 8px #000;
							font-size: 16px;
						}

						> .koudoku {
							margin-left: 4px;
						}
					}

					> .title {
						position: absolute;
						bottom: 0;
						left: 0;
						width: 100%;
						padding: 0 0 8px 154px;
						box-sizing: border-box;
						color: #fff;

						> .name {
							margin: -10px;
							padding: 10px;
							line-height: 32px;
							font-weight: bold;
							font-size: 1.8em;
							filter: drop-shadow(0 0 4px #000);
						}

						> .bottom {
							> * {
								display: inline-block;
								margin-right: 16px;
								line-height: 20px;
								opacity: 0.8;

								&.username {
									font-weight: bold;
								}
							}

							> .add-note-button {
								background: rgba(0, 0, 0, 0.2);
								color: #fff;
								-webkit-backdrop-filter: var(--MI-blur, blur(8px));
								backdrop-filter: var(--MI-blur, blur(8px));
								border-radius: 24px;
								padding: 4px 8px;
								font-size: 80%;
							}
						}
					}
				}

				> .title {
					display: none;
					text-align: center;
					padding: 50px 8px 16px 8px;
					font-weight: bold;
					border-bottom: solid 0.5px var(--MI_THEME-divider);

					> .bottom {
						color: var(--MI_THEME-fgTransparentWeak);
						> * {
							display: inline-block;
							margin-right: 8px;
						}
					}
				}

				> .avatar {
					display: block;
					position: absolute;
					top: 170px;
					left: 16px;
					z-index: 2;
					width: 120px;
					height: 120px;
					box-shadow: 1px 1px 3px rgba(#000, 0.2);
				}

				> .followedMessage {
					padding: 24px 24px 0 154px;

					> .fukidashi {
						display: block;
						--fukidashi-bg: color-mix(in srgb, var(--MI_THEME-accent), var(--MI_THEME-panel) 85%);
						--fukidashi-radius: 16px;
						font-size: 0.9em;

						.messageHeader {
							color: var(--MI_THEME-fgTransparentWeak);
							font-size: 0.85em;
						}
					}
				}

				> .roles {
					padding: 24px 24px 0 154px;
					font-size: 0.95em;
					display: flex;
					flex-wrap: wrap;
					gap: 8px;

					> .role {
						border: solid 1px var(--color, var(--MI_THEME-divider));
						border-radius: 999px;
						margin-right: 4px;
						padding: 3px 8px;
					}
				}

				> .moderationNote {
					margin: 12px 24px 0 154px;
				}

				> .description {
					color: var(--MI_THEME-fgTransparent);
					// 头像下悬 40px (170+120-250), 信息区从其下方开始
					// 签名与资料/统计同款圆片: 「签名:内容」, 同高度同格式
					display: flex;
					width: fit-content;
					max-width: 100%;
					align-items: baseline;
					gap: 6px;
					margin: 48px 24px 12px;
					padding: 6px 12px;
					// panelHighlight 始终相对卡片偏移一档 (亮色调暗/暗色调亮);
					// 用 bg 在暗色主题下比卡片更黑, 圆片会变成一个个黑洞
					background: var(--MI_THEME-panelHighlight);
					border-radius: 999px;
					font-size: 0.9em;

					> *:not(.descriptionLabel) {
						min-width: 0;
					}

					> .descriptionLabel {
						flex-shrink: 0;
						color: var(--MI_THEME-fgTransparentWeak);

						&::after {
							content: ":";
						}
					}

					.empty {
						margin: 0;
						color: var(--MI_THEME-fgTransparentWeak);
					}
				}

				> .fields {
					color: var(--MI_THEME-fgTransparentWeak);
					// 资料条目做成「内容宽度」的灰色圆角小片, 横向排列、放不下自动换行,
					// 灰底只包住内容本身, 避免通栏灰底右侧大片留白
					display: flex;
					flex-wrap: wrap;
					align-items: center;
					gap: 8px;
					margin: 0 24px 12px;
					padding: 0;
					font-size: 0.9em;

					> .field {
						display: inline-flex;
						align-items: center;
						gap: 6px;
						margin: 0;
						padding: 6px 12px;
						max-width: 100%;
						background: var(--MI_THEME-panelHighlight);
						border-radius: 999px;

						> .name {
							max-width: 160px;
							overflow: hidden;
							white-space: nowrap;
							text-overflow: ellipsis;
							font-weight: normal;
							color: var(--MI_THEME-fgTransparentWeak);

							&::after {
								content: ":";
							}
						}

						> .value {
							min-width: 0;
							max-width: 320px;
							overflow: hidden;
							white-space: nowrap;
							text-overflow: ellipsis;
							margin: 0;
						}
					}

					&.system > .field > .name {
					}
				}

				> .status {
					color: var(--MI_THEME-fgTransparent);
					display: flex;
					flex-wrap: wrap;
					gap: 8px;
					margin: 0 24px 24px;
					padding: 0;

					> a {
						display: inline-flex;
						align-items: baseline;
						gap: 6px;
						padding: 6px 12px;
						background: var(--MI_THEME-panelHighlight);
						border-radius: 999px;

						&.active {
							color: var(--MI_THEME-accent);
						}

						&:hover {
							text-decoration: none;
							background: color-mix(in srgb, var(--MI_THEME-fg) 8%, var(--MI_THEME-panelHighlight));
						}

						> span {
							color: var(--MI_THEME-fgTransparentWeak);

							&::after {
								content: ":";
							}
						}

						> b {
							font-weight: normal;
						}
					}
				}
			}
		}

		> .contents {
			> .content {
				margin-bottom: var(--MI-margin);
			}
		}
	}

	&.wide {
		display: flex;
		width: 100%;

		> .main {
			width: 100%;
			min-width: 0;
		}

		> .sub {
			max-width: 350px;
			min-width: 350px;
			margin-left: var(--MI-margin);
		}
	}
}

@container (max-width: 500px) {
	.ftskorzw {
		> .main {
			> .profile > .main {
				> .banner-container {
					--bannerHeight: 140px;
					height: var(--bannerHeight);

					> .fade {
						display: none;
					}

					> .title {
						display: none;
					}
				}

				> .title {
					display: block;
				}

				> .avatar {
					top: 90px;
					left: 0;
					right: 0;
					width: 92px;
					height: 92px;
					margin: auto;
				}

				> .followedMessage {
					padding: 16px 16px 0 16px;
				}

				> .roles {
					padding: 16px 16px 0 16px;
					justify-content: center;
				}

				> .moderationNote {
					margin: 16px 16px 0 16px;
				}

				> .description {
					margin: 16px 16px 12px;
					padding: 6px 12px;
				}

				> .fields {
					margin: 0 16px 12px;
				}

				> .status {
					margin: 0 16px 16px;
				}
			}

			> .contents {
				> .nav {
					font-size: 80%;
				}
			}
		}
	}
}

@supports (view-timeline-name: --name) {
	.ftskorzw {
		> .main {
			> .profile > .main {
				> .banner-container {
					view-timeline-name: --bannerParallax;
					view-timeline-inset: var(--bannerParallaxInset, auto);
					view-timeline-axis: block;

					> .banner {
						animation: bannerParallaxKeyframes linear both;
						animation-timeline: --bannerParallax;
						animation-range: cover;
					}
				}
			}
		}
	}
}

@keyframes bannerParallaxKeyframes {
	from {
		background-position-y: 50%;
	}
	to {
		background-position-y: calc(50% + var(--bannerHeight, 250px) / 3);
	}
}
</style>

<style lang="scss" module>
.bannerUserInfo {
	display: flex;
	align-items: center;
	min-height: 28px;

	> * {
		flex-shrink: 0;
		white-space: nowrap;
	}

	> .bannerUsername {
		flex-shrink: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}
}

.nameRow {
	display: flex;
	align-items: baseline;
	gap: 8px;
	line-height: 1.5;
}

.centeredNameRow {
	justify-content: center;

	.memoButton {
		color: var(--MI_THEME-fgTransparentWeak);
	}
}

.displayName {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
}

.memoButton {
	min-width: 0;
	max-width: 50%;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 14px;
	font-weight: normal;
	line-height: 1;
	color: inherit;
}

.tl {
	background: var(--MI_THEME-bg);
	border-radius: var(--MI-radius);
	overflow: clip;
}

.verifiedLink {
	margin-left: 4px;
	color: var(--MI_THEME-success);
}
</style>
