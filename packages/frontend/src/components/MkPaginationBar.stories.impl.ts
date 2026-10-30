/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/no-default-export */
import { ref } from 'vue';
import type { StoryObj } from '@storybook/vue3';
import MkPaginationBar, { DEFAULT_PAGE_SIZE } from './MkPaginationBar.vue';

export const Default = {
	render(args) {
		return {
			components: { MkPaginationBar },
			setup() {
				const page = ref(args.page ?? 1);
				const pageSize = ref(args.pageSize ?? DEFAULT_PAGE_SIZE);
				return { args, page, pageSize };
			},
			template: '<MkPaginationBar v-bind="args" v-model:page="page" v-model:pageSize="pageSize"/>',
		};
	},
	args: {
		items: Array.from({ length: 294 }, (_, id) => ({ id })),
		page: 1,
		pageSize: DEFAULT_PAGE_SIZE,
	},
	parameters: { layout: 'centered' },
} satisfies StoryObj<typeof MkPaginationBar>;

export const ServerPage = {
	...Default,
	args: { items: Array.from({ length: DEFAULT_PAGE_SIZE }, (_, id) => ({ id })), total: 294, page: 1, pageSize: DEFAULT_PAGE_SIZE },
} satisfies StoryObj<typeof MkPaginationBar>;

export const UnknownTotal = {
	...Default,
	args: { items: Array.from({ length: 60 }, (_, id) => ({ id })), page: 3, pageSize: DEFAULT_PAGE_SIZE, hasMore: true, loadMore: async () => false },
} satisfies StoryObj<typeof MkPaginationBar>;

export const Disabled = {
	...Default,
	args: { items: Array.from({ length: 100 }, (_, id) => ({ id })), page: 2, pageSize: DEFAULT_PAGE_SIZE, disabled: true },
} satisfies StoryObj<typeof MkPaginationBar>;
