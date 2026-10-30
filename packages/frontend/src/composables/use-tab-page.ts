/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, defineComponent, h, inject, onActivated, onDeactivated, provide, ref } from 'vue';
import type { Component } from 'vue';
import { DI } from '@/di.js';

export type TabPageHandle<T> = { content?: T | null };

export const TabPage = defineComponent((props: {
	component: Component | string;
	pageProps?: Record<string, unknown>;
	identity: string;
	isSelected: (identity: string) => boolean;
}, { expose }) => {
	const parentActive = inject(DI.pageActive, ref(true));
	const activated = ref(true);
	const content = ref<unknown>();
	const active = computed(() => parentActive.value && activated.value && props.isSelected(props.identity));
	provide(DI.pageActive, active);
	onActivated(() => { activated.value = true; });
	onDeactivated(() => { activated.value = false; });
	expose({ content });
	// 缓存实例保留自己的组件和参数；匹配函数只跟踪当前标签，不替换隐藏标签的内容。
	return () => h('div', { style: 'display: contents', 'data-route-active': active.value ? 'true' : 'false' }, [h(props.component, { ...props.pageProps, ref: content })]);
}, { name: 'TabPage', props: ['component', 'pageProps', 'identity', 'isSelected'] });
