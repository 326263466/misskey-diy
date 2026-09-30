/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { userDetailed } from '../../.storybook/fakes.js';
import ModLog from '@/pages/admin/modlog.ModLog.vue';
import { i18n } from '@/i18n.js';

vi.mock('v-code-diff', () => ({ CodeDiff: { template: '<div/>' } }));
vi.mock('@/components/MkFolder.vue', () => ({ default: { template: '<section><slot name="label"/><slot/></section>' } }));

afterEach(cleanup);

test('renders the recipient and audited card change in the moderation log', () => {
	const view = render(ModLog, {
		props: { log: {
			id: 'log-id', createdAt: '2026-09-29T00:00:00.000Z', userId: 'admin', user: userDetailed('admin', 'admin', null),
			type: 'grantCheckinCards', info: { userId: 'recipient', userUsername: 'alice', userHost: null, amount: 5, before: 3, after: 8 },
		} },
		global: { stubs: {
			MkA: { props: ['to'], template: '<a :href="to"><slot/></a>' },
			MkTime: true,
		} },
	});
	expect(view.getByText(i18n.ts._moderationLogTypes.grantCheckinCards)).toBeTruthy();
	expect(view.getByRole('link', { name: '@alice' }).getAttribute('href')).toBe('/admin/user/recipient');
	expect(view.getByText(i18n.tsx._checkin.grantLogSummary({ amount: 5, before: 3, after: 8 }))).toBeTruthy();
});
