/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { StoryObj } from '@storybook/vue3';
import MkMarkdown from './MkMarkdown.vue';

export const Default = {
	args: { text: '# Markdown\n\n**正文**与[链接](https://example.com)。\n\n| 名称 | 内容 |\n| --- | --- |\n| 编辑器 | md-editor-v3 |\n\n- [x] 发布文章\n- [ ] 下一篇\n\n```ts\nconst article = true;\n```' },
	render: (args) => ({ components: { MkMarkdown }, setup: () => ({ args }), template: '<MkMarkdown v-bind="args"/>' }),
} satisfies StoryObj<typeof MkMarkdown>;
