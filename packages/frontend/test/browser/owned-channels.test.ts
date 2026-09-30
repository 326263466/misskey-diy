/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick } from 'vue';
import type { App } from 'vue';
import Channels from '@/pages/channels.vue';

vi.mock('@/utility/paginator.js', () => ({ Paginator: class {
	constructor(public endpoint: string, public options: unknown) {}
} }));
vi.mock('@/i.js', () => ({ $i: null }));
vi.mock('@/router.js', () => ({ useRouter: () => ({}) }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { archived: 'Archived', _channel: { owned: 'My channels' } } } }));
vi.mock('@/components/MkChannelPreview.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkChannelList.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkInput.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkButton.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkFoldableSection.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkPagination.vue', async () => {
	const { h, defineComponent } = await import('vue');
	return { default: defineComponent({ props: ['paginator'], setup: props => () => h('div', { 'data-paginator': JSON.stringify(props.paginator) }) }) };
});
vi.mock('@/components/MkRadios.vue', async () => {
	const { h, defineComponent } = await import('vue');
	return { default: defineComponent({ props: ['options'], emits: ['update:modelValue'], setup: (props, { emit }) => () => h('div', (props.options as { value: string; label: string }[]).map(option => h('button', { onClick: () => emit('update:modelValue', option.value) }, option.label))) }) };
});

let app: App | undefined;
let host: HTMLDivElement;

afterEach(() => {
	app?.unmount();
	host?.remove();
});

test('my channels switches between independently paginated active and archived queries', async () => {
	host = document.createElement('div');
	document.body.append(host);
	app = createApp({ render: () => h(Channels, { query: '' }) });
	app.component('PageWithHeader', defineComponent({ emits: ['update:tab'], setup: (_, { emit, slots }) => () => h('div', [h('button', { onClick: () => emit('update:tab', 'owned') }, 'Owned tab'), slots.default?.()]) }));
	app.mount(host);
	const click = async (label: string) => {
		[...host.querySelectorAll('button')].find(button => button.textContent === label)!.click();
		await nextTick();
	};
	const pagination = () => JSON.parse(host.querySelector('[data-paginator]')!.getAttribute('data-paginator')!);
	await click('Owned tab');
	expect(pagination()).toEqual({ endpoint: 'channels/owned', options: { limit: 10 } });
	await click('Archived');
	expect(pagination()).toEqual({ endpoint: 'channels/owned', options: { limit: 10, params: { isArchived: true } } });
	await click('My channels');
	expect(pagination()).toEqual({ endpoint: 'channels/owned', options: { limit: 10 } });
});
