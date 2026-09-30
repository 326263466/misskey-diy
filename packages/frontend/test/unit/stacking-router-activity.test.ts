/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { defineComponent, h, inject, nextTick, ref } from 'vue';
import StackingRouterView from '@/components/global/StackingRouterView.vue';
import { DI } from '@/di.js';
import type { Router } from '@/router.js';

vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: false, numberOfPageCache: 4 } } }));
vi.mock('@/pages/_loading_.vue', () => ({ default: { template: '<div/>' } }));

const Page = defineComponent({
	props: { page: { type: String, required: true } },
	setup(props) {
		const active = inject(DI.pageActive)!;
		return () => h('output', { 'data-testid': props.page }, String(active.value));
	},
});

function mountRouter() {
	const activity = ref(true);
	const listeners = new Map<string, (event: unknown) => void>();
	let path = '/first';
	const route = { path: '/:page', component: Page };
	const router = {
		current: { route, props: new Map([['page', 'first']]) },
		getCurrentFullPath: () => path,
		useListener: (event: string, handler: (event: unknown) => void) => listeners.set(event, handler),
	};
	const view = render(StackingRouterView, {
		props: { router: router as unknown as Router },
		global: { provide: { [DI.pageActive as symbol]: activity } },
	});
	const navigate = async (page: string) => {
		path = `/${page}`;
		listeners.get('change')!({ resolved: { route, props: new Map([['page', page]]) } });
		await nextTick();
	};
	return { ...view, activity, navigate };
}

afterEach(cleanup);

describe('stacking router page activity', () => {
	test('pauses the retained page under a new page and resumes it when returning', async () => {
		const view = mountRouter();
		expect(view.getByTestId('first').textContent).toBe('true');
		await view.navigate('second');
		expect(view.getByTestId('first').textContent).toBe('false');
		expect(view.getByTestId('second').textContent).toBe('true');
		await view.navigate('first');
		expect(view.queryByTestId('second')).toBeNull();
		expect(view.getByTestId('first').textContent).toBe('true');
	});

	test('inherits inactivity from an outer page without activating covered pages on resume', async () => {
		const view = mountRouter();
		await view.navigate('second');
		view.activity.value = false;
		await nextTick();
		expect(view.getByTestId('first').textContent).toBe('false');
		expect(view.getByTestId('second').textContent).toBe('false');
		view.activity.value = true;
		await nextTick();
		expect(view.getByTestId('first').textContent).toBe('false');
		expect(view.getByTestId('second').textContent).toBe('true');
	});
});
