/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { StoryObj } from '@storybook/vue3';
import MkArticlePreview from './MkArticlePreview.vue';
import { file, userDetailed } from '../../.storybook/fakes.js';

export const Default = {
	args: { article: { id: 'article-example', title: '把一次前端优化整理成可复用的实践', summary: '从发现问题、定位原因到验证效果，用清晰的步骤记录这次改进。', articleTags: ['前端', 'Vue', '工程实践'], userId: 'author', user: userDetailed(), createdAt: new Date().toISOString(), likedCount: 12, eyeCatchingImage: null } as never },
	render: args => ({ components: { MkArticlePreview }, setup: () => ({ args }), template: '<MkArticlePreview v-bind="args"/>' }),
} satisfies StoryObj<typeof MkArticlePreview>;

export const WithCover = {
	...Default,
	args: { article: { ...Default.args.article as object, id: 'article-with-cover', eyeCatchingImage: file(), title: '在复杂项目中维护清晰的组件边界：一次完整的设计、实现和优化记录', summary: '标题和摘要都保持单行，内容较长时使用省略号，封面与底部信息在同一行内紧凑排列。' } as never },
} satisfies StoryObj<typeof MkArticlePreview>;
