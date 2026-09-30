/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import type { App } from 'vue';
import ChannelEditor from '@/pages/channel-editor.vue';

const mocks = vi.hoisted(() => ({ api: vi.fn(), toast: vi.fn(), confirm: vi.fn(), push: vi.fn() }));
vi.mock('@@/themes/_light.json5', () => ({ default: { props: { accent: '#86b300' } } }));
vi.mock('@/os.js', () => ({ apiWithDialog: mocks.api, toast: mocks.toast, confirm: mocks.confirm }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/utility/drive.js', () => ({ selectFile: vi.fn() }));
vi.mock('@/router.js', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/i.js', () => ({ $i: null }));
vi.mock('@/local-storage.js', () => ({ miLocalStorage: { getItemAsJson: () => null } }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { unarchive: 'Unarchive', preview: 'Preview', processing: 'Processing', error: 'Error', save: 'Save', create: 'Create', archive: 'Archive', archived: 'Archived', saved: 'Saved', _channel: {} }, tsx: { channelArchiveConfirmTitle: () => 'Archive channel' } } }));
vi.mock('@/components/MkInput.vue', async () => {
	const { h, defineComponent } = await import('vue');
	return { default: defineComponent({ props: ['modelValue'], emits: ['update:modelValue'], setup: (props, { emit }) => () => h('input', { value: props.modelValue, onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value) }) }) };
});
vi.mock('@/components/MkTextarea.vue', async () => {
	const { h, defineComponent } = await import('vue');
	return { default: defineComponent({ setup: () => () => h('div', [h('textarea')]) }) };
});
vi.mock('@/components/MkButton.vue', async () => {
	const { h, defineComponent } = await import('vue');
	return { default: defineComponent({ setup: (_, { slots }) => () => h('button', slots.default?.()) }) };
});
vi.mock('@/components/MkSwitch.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkFolder.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkDraggable.vue', () => ({ default: { render: () => null } }));

let app: App | undefined;
let host: HTMLDivElement;
const saved = { id: 'first', name: 'Existing', description: 'Description', bannerId: null, bannerUrl: '/test-banner.png', color: '#39a7d8', isSensitive: true, allowRenoteToExternal: false, pinnedNoteIds: ['pinned'], isArchived: false, usersCount: 12, notesCount: 34, lastNotedAt: '2026-09-01T00:00:00Z' };

async function settle() {
	await nextTick();
	await new Promise(resolve => setTimeout(resolve, 0));
	await nextTick();
}

async function mount() {
	const channelId = ref('first');
	mocks.api.mockResolvedValue(saved);
	host = document.createElement('div');
	document.body.append(host);
	app = createApp({ render: () => h(ChannelEditor, { channelId: channelId.value }) });
	app.component('PageWithHeader', defineComponent({ props: ['actions'], setup: (props, { slots }) => () => h('div', [h('button', { onClick: props.actions[0].handler }, props.actions[0].text), slots.default?.()]) }));
	// The application registers this translation component under the same name.
	// eslint-disable-next-line vue/multi-word-component-names
	app.component('I18n', defineComponent({ setup: (_, { slots }) => () => h('span', slots.n?.()) }));
	app.component('MkTime', defineComponent({ props: ['time'], setup: props => () => h('time', props.time) }));
	app.directive('adaptive-border', () => {});
	app.mount(host);
	await settle();
	return channelId;
}

function button(label: string) {
	return [...host.querySelectorAll('button')].find(item => item.textContent?.trim() === label)!;
}

afterEach(() => {
	app?.unmount();
	host?.remove();
	vi.resetAllMocks();
});

test('loads the stored color and reloads when switching channels', async () => {
	const channelId = await mount();
	expect(host.querySelector<HTMLInputElement>('input[type=color]')!.value).toBe('#39a7d8');
	mocks.api.mockResolvedValueOnce({ ...saved, id: 'second', color: '#abc' });
	channelId.value = 'second';
	await settle();
	expect(mocks.api).toHaveBeenLastCalledWith('channels/show', { channelId: 'second' });
	expect(host.querySelector<HTMLInputElement>('input[type=color]')!.value).toBe('#aabbcc');
});

test('save sends existing settings, blocks double submit and confirms success', async () => {
	await mount();
	let complete!: (result: typeof saved) => void;
	mocks.api.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
	button('Save').click();
	button('Save').click();
	await settle();
	expect(button('Processing').disabled).toBe(true);
	expect(mocks.api).toHaveBeenCalledTimes(2);
	expect(mocks.api).toHaveBeenLastCalledWith('channels/update', expect.objectContaining({ color: saved.color, isSensitive: true, allowRenoteToExternal: false, pinnedNoteIds: ['pinned'] }));
	complete(saved);
	await settle();
	expect(mocks.toast).toHaveBeenCalledWith('Saved');
	expect(host.querySelector('[role=status]')?.textContent).toContain('Saved');
	expect(button('Save').disabled).toBe(false);
});

test('the header preview shows the real channel card with live draft fields and saved counters', async () => {
	await mount();
	button('Preview').click();
	await settle();
	const preview = host.querySelector('section')!;
	expect(preview.querySelector('a')).toBeNull();
	expect(preview.textContent).toContain('Existing');
	expect(preview.textContent).toContain('Description');
	expect(preview.textContent).toContain('12');
	expect(preview.textContent).toContain('34');
	expect(preview.querySelector('time')?.textContent).toBe(saved.lastNotedAt);
	expect((preview.querySelector('.banner') as HTMLElement).style.backgroundImage).toContain('/test-banner.png');
	const input = host.querySelector<HTMLInputElement>('input:not([type=color])')!;
	input.value = 'Draft channel';
	input.dispatchEvent(new Event('input', { bubbles: true }));
	await settle();
	expect(preview.textContent).toContain('Draft channel');
	const textarea = host.querySelector('textarea')!;
	const textareaStyle = getComputedStyle(textarea);
	expect(parseFloat(textareaStyle.height)).toBeCloseTo(2 * parseFloat(textareaStyle.lineHeight) + 26, 0);
});

test('archive updates state without deleting and gives feedback', async () => {
	await mount();
	mocks.confirm.mockResolvedValueOnce({ canceled: false });
	mocks.api.mockResolvedValueOnce({ ...saved, isArchived: true });
	button('Archive').click();
	await settle();
	expect(mocks.api).toHaveBeenLastCalledWith('channels/update', { channelId: 'first', isArchived: true });
	expect(button('Unarchive').disabled).toBe(false);
	expect(mocks.toast).toHaveBeenCalledWith('Archived');
	expect(mocks.push).toHaveBeenCalledWith('/channels/:channelId', { params: { channelId: 'first' } });
});

test('an archived channel can be reopened without recreating or deleting it', async () => {
	const channelId = await mount();
	mocks.api.mockResolvedValueOnce({ ...saved, id: 'archived', isArchived: true });
	channelId.value = 'archived';
	await settle();
	mocks.confirm.mockResolvedValueOnce({ canceled: false });
	mocks.api.mockResolvedValueOnce({ ...saved, id: 'archived', isArchived: false });
	button('Unarchive').click();
	await settle();
	expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ okText: 'Unarchive' }));
	expect(mocks.api).toHaveBeenLastCalledWith('channels/update', { channelId: 'archived', isArchived: false });
	expect(button('Archive').disabled).toBe(false);
	expect(mocks.push).toHaveBeenCalledWith('/channels/:channelId', { params: { channelId: 'archived' } });
});

test('failed save retains the form and permits retry without a success message', async () => {
	await mount();
	mocks.api.mockRejectedValueOnce(new Error('Save failed'));
	button('Save').click();
	await settle();
	expect(mocks.toast).not.toHaveBeenCalled();
	expect(button('Save').disabled).toBe(false);
	expect(host.querySelector('[role=status]')?.textContent).toContain('Error');
	expect(host.querySelector<HTMLInputElement>('input[type=color]')!.value).toBe(saved.color);
});

test.each(['Save', 'Archive'])('late %s response cannot overwrite a different channel', async (action) => {
	const channelId = await mount();
	mocks.confirm.mockResolvedValueOnce({ canceled: false });
	let complete!: (result: typeof saved) => void;
	mocks.api.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
	button(action).click();
	await settle();
	expect(button('Processing').disabled).toBe(true);
	expect(button(action === 'Save' ? 'Archive' : 'Save').disabled).toBe(true);
	mocks.api.mockResolvedValueOnce({ ...saved, id: 'second', color: '#abcdef' });
	channelId.value = 'second';
	await settle();
	complete({ ...saved, isArchived: action === 'Archive' });
	await settle();
	expect(host.querySelector<HTMLInputElement>('input[type=color]')!.value).toBe('#abcdef');
	expect(mocks.toast).not.toHaveBeenCalled();
	expect(mocks.push).not.toHaveBeenCalled();
});

test('an archive confirmation cannot apply to another channel, even after returning to the original', async () => {
	const channelId = await mount();
	let confirm!: (result: { canceled: boolean }) => void;
	mocks.confirm.mockImplementationOnce(() => new Promise(resolve => { confirm = resolve; }));
	button('Archive').click();
	channelId.value = 'second';
	await settle();
	channelId.value = 'first';
	await settle();
	confirm({ canceled: false });
	await settle();
	expect(mocks.api.mock.calls.every(([endpoint]) => endpoint === 'channels/show')).toBe(true);
	expect(mocks.toast).not.toHaveBeenCalled();
});
