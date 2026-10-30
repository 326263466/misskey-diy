/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { StoryObj } from '@storybook/vue3';
import { http, HttpResponse } from 'msw';
import { note } from '../../.storybook/fakes.js';
import { commonHandlers } from '../../.storybook/mocks.js';
import MkNoteRecommendations from './MkNoteRecommendations.vue';

export const Default = {
	render: args => ({ components: { MkNoteRecommendations }, setup: () => ({ args }), template: '<MkNoteRecommendations v-bind="args"/>' }),
	args: { excludeId: 'current-note' },
	parameters: { msw: { handlers: [...commonHandlers, http.post('/api/notes/featured', () => HttpResponse.json([
		note('related-1'), note('related-2'), note('related-3'),
	]))] } },
} satisfies StoryObj<typeof MkNoteRecommendations>;
