/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { InjectionKey, Ref, ComputedRef } from 'vue';
import type { PageMetadata } from '@/page.js';
import type { Router } from '@/router.js';

export const DI = {
	routerCurrentDepth: Symbol() as InjectionKey<number>,
	router: Symbol() as InjectionKey<Router>,
	pageActive: Symbol() as InjectionKey<Readonly<Ref<boolean>>>,
	pageSidebar: Symbol() as InjectionKey<Readonly<Ref<HTMLElement | null>>>,
	detailActionsLoading: Symbol() as InjectionKey<Ref<boolean>>,
	mock: Symbol() as InjectionKey<boolean>,
	pageMetadata: Symbol() as InjectionKey<Ref<PageMetadata | null>>,
	viewId: Symbol() as InjectionKey<string>,
	currentStickyTop: Symbol() as InjectionKey<Ref<number>>,
	currentStickyBottom: Symbol() as InjectionKey<Ref<number>>,
	mfmEmojiReactCallback: Symbol() as InjectionKey<(emoji: string) => void>,
	inModal: Symbol() as InjectionKey<boolean>,
	inAppSearchMarkerId: Symbol() as InjectionKey<Ref<string | null>>,
	inChannel: Symbol() as InjectionKey<ComputedRef<string | null> | null>, // 現在開いているチャンネルのID
	mkLightboxItemMediaEl: Symbol() as InjectionKey<Ref<HTMLVideoElement | HTMLAudioElement | null>>,
	// 左侧菜单布局收窄时为 true，子页面改用顶部标签切换
	pageNavigationNarrow: Symbol() as InjectionKey<Readonly<Ref<boolean>>>,
};
