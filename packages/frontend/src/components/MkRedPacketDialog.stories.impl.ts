/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/no-default-export */
import { HttpResponse, http } from 'msw';
import type { StoryObj } from '@storybook/vue3';
import { commonHandlers } from '../../.storybook/mocks.js';
import MkRedPacketDialog from './MkRedPacketDialog.vue';

export const Default = {
	render() { return { components: { MkRedPacketDialog }, template: '<MkRedPacketDialog/>' }; },
	parameters: { layout: 'fullscreen', msw: { handlers: [...commonHandlers, http.post('/api/i/wallet', () => HttpResponse.json({ balance: 1000, points: 100, reservedBalance: 0, exchangeEnabled: true, exchangeRate: 1 }))] } },
} satisfies StoryObj<typeof MkRedPacketDialog>;
