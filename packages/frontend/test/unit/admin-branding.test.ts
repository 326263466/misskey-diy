/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { h, nextTick, Suspense } from 'vue';
import locales from 'i18n';
import Branding from '@/pages/admin/branding.vue';
import { i18n, updateI18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({
	meta: {
		clientOptions: {}, iconUrl: null, app192IconUrl: null, app512IconUrl: null,
		bannerUrl: null, backgroundImageUrl: null, themeColor: null,
		defaultLightTheme: null, defaultDarkTheme: null,
		serverErrorImageUrl: null, infoImageUrl: null, notFoundImageUrl: null,
		repositoryUrl: 'https://github.com/misskey-dev/misskey' as string | null,
		feedbackUrl: 'https://github.com/misskey-dev/misskey/issues/new' as string | null,
		manifestJsonOverride: '',
	},
	save: vi.fn(), refresh: vi.fn(), alert: vi.fn(),
}));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: async () => mocks.meta }));
vi.mock('@/instance.js', () => ({ instance: { name: 'Test' }, fetchInstance: mocks.refresh }));
vi.mock('@/os.js', () => ({ apiWithDialog: mocks.save, alert: mocks.alert }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/components/MkInput.vue', () => ({ default: {
	props: ['modelValue'], emits: ['update:modelValue'],
	template: '<div><label><slot name="label"/><input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"/></label><slot name="caption"/></div>',
} }));
vi.mock('@/components/MkTextarea.vue', () => ({ default: {
	props: ['modelValue'], emits: ['update:modelValue'],
	template: '<label><slot name="label"/><textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"/></label>',
} }));
vi.mock('@/components/MkButton.vue', () => ({ default: {
	props: ['wait'], emits: ['click'],
	template: '<button :disabled="wait" @click="$emit(\'click\')"><slot/></button>',
} }));
vi.mock('@/components/MkColorInput.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkRadios.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkSwitch.vue', () => ({ default: { render: () => null } }));

beforeEach(() => {
	vi.resetAllMocks();
	updateI18n(locales['zh-CN']);
	mocks.save.mockResolvedValue({});
	mocks.refresh.mockResolvedValue({});
	mocks.meta.repositoryUrl = 'https://github.com/misskey-dev/misskey';
	mocks.meta.feedbackUrl = 'https://github.com/misskey-dev/misskey/issues/new';
});
afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

async function mountSetting() {
	const wrapper = { inheritAttrs: false, template: '<div><slot/></div>' };
	const view = render({ render: () => h('div', [h(Suspense, null, { default: () => h(Branding) })]) }, {
		global: { components: {
			PageWithHeader: { template: '<div><slot/><slot name="footer"/></div>' },
			SearchMarker: wrapper, SearchLabel: wrapper,
		} },
	});
	await waitFor(() => expect(view.getByRole('button', { name: '保存' })).toBeTruthy());
	return view;
}

test('uses technical names and explains when each result image appears', async () => {
	const view = await mountSetting();
	for (const label of ['Logo URL', 'APP Icon URL（192 × 192）', 'APP Icon URL（512 × 512）', 'Banner URL', '404 页面图片 URL', '空状态图片 URL', '错误提示图片 URL']) {
		expect(view.getByLabelText(label)).toBeTruthy();
	}
	expect(view.getByText('访问不存在的页面或找不到内容时显示的图片。留空使用默认图标。')).toBeTruthy();
	expect(view.getByText('列表没有内容、搜索没有结果等空状态下显示的图片。留空使用默认图标。')).toBeTruthy();
	expect(view.getByText('页面加载失败或发生错误时显示的图片。留空使用默认错误提示。')).toBeTruthy();
});

test.each([false, true])('only removes inherited links and preserves custom links (custom: %s)', async custom => {
	if (custom) {
		mocks.meta.repositoryUrl = 'https://example.com/source';
		mocks.meta.feedbackUrl = 'https://example.com/feedback';
	}
	const view = await mountSetting();
	const repository = view.getByLabelText(i18n.ts.repositoryUrl) as HTMLInputElement;
	const feedback = view.getByLabelText(i18n.ts.feedbackUrl) as HTMLInputElement;
	expect(repository.value).toBe(custom ? mocks.meta.repositoryUrl : '');
	expect(feedback.value).toBe(custom ? mocks.meta.feedbackUrl : '');
	expect(mocks.save).not.toHaveBeenCalled();
	await fireEvent.click(view.getByRole('button', { name: '保存' }));
	expect(mocks.save).toHaveBeenCalledWith('admin/update-meta', expect.objectContaining({
		repositoryUrl: custom ? mocks.meta.repositoryUrl : null,
		feedbackUrl: custom ? mocks.meta.feedbackUrl : null,
	}));
});

test('disables duplicate saves while pending and shows saved for three seconds after success', async () => {
	const pending = Promise.withResolvers<void>();
	mocks.save.mockReturnValue(pending.promise);
	const view = await mountSetting();
	vi.useFakeTimers();
	const button = view.getByRole('button', { name: '保存' }) as HTMLButtonElement;
	await fireEvent.click(button);
	expect(button.textContent).toContain('保存中…');
	expect(button.disabled).toBe(true);
	await fireEvent.click(button);
	expect(mocks.save).toHaveBeenCalledTimes(1);
	expect(view.queryByText('已保存')).toBeNull();
	pending.resolve();
	await nextTick();
	await nextTick();
	expect(button.disabled).toBe(false);
	expect(button.textContent).toContain('已保存');
	expect(mocks.refresh).toHaveBeenCalledWith(true);
	await vi.advanceTimersByTimeAsync(2999);
	expect(button.textContent).toContain('已保存');
	await vi.advanceTimersByTimeAsync(1);
	expect(button.textContent).toContain('保存');
	expect(button.textContent).not.toContain('已保存');
});

test('keeps edits on failure and allows retry without showing a false success', async () => {
	mocks.save.mockRejectedValueOnce(new Error('Save failed'));
	const view = await mountSetting();
	const input = view.getByLabelText('Logo URL') as HTMLInputElement;
	await fireEvent.update(input, 'https://example.com/logo.png');
	await fireEvent.click(view.getByRole('button', { name: '保存' }));
	await waitFor(() => expect((view.getByRole('button', { name: '保存' }) as HTMLButtonElement).disabled).toBe(false));
	expect(view.queryByText('已保存')).toBeNull();
	expect(mocks.refresh).not.toHaveBeenCalled();
	expect(input.value).toBe('https://example.com/logo.png');
	await fireEvent.click(view.getByRole('button', { name: '保存' }));
	await waitFor(() => expect(view.getByText('已保存')).toBeTruthy());
	expect(mocks.save).toHaveBeenLastCalledWith('admin/update-meta', expect.objectContaining({ iconUrl: input.value }));
});

test.each(['during', 'after'])('does not show saved for edits made %s a save', async timing => {
	const pending = Promise.withResolvers<void>();
	mocks.save.mockReturnValue(pending.promise);
	const view = await mountSetting();
	await fireEvent.click(view.getByRole('button', { name: '保存' }));
	if (timing === 'after') {
		pending.resolve();
		await waitFor(() => expect(view.getByText('已保存')).toBeTruthy());
	}
	await fireEvent.update(view.getByLabelText('Logo URL'), 'https://example.com/new.png');
	pending.resolve();
	await waitFor(() => expect((view.getByRole('button', { name: '保存' }) as HTMLButtonElement).disabled).toBe(false));
	expect(view.queryByText('已保存')).toBeNull();
	expect(mocks.save).toHaveBeenCalledWith('admin/update-meta', expect.objectContaining({ iconUrl: null }));
});

test('rejects invalid manifest before saving and accepts JSON5 on retry', async () => {
	const view = await mountSetting();
	const input = view.getByLabelText(i18n.ts._serverSettings.manifestJsonOverride);
	await fireEvent.update(input, '{ broken');
	await fireEvent.click(view.getByRole('button', { name: '保存' }));
	expect(mocks.save).not.toHaveBeenCalled();
	expect(mocks.alert).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', text: i18n.ts._brandingImages.invalidManifest }));
	await fireEvent.update(input, "{ name: 'Custom APP', }");
	await fireEvent.click(view.getByRole('button', { name: '保存' }));
	expect(mocks.save).toHaveBeenCalledWith('admin/update-meta', expect.objectContaining({ manifestJsonOverride: '{"name":"Custom APP"}' }));
});

test('still shows success when only the subsequent metadata refresh fails', async () => {
	const error = new Error('Refresh failed');
	mocks.refresh.mockRejectedValue(error);
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	const view = await mountSetting();
	await fireEvent.click(view.getByRole('button', { name: '保存' }));
	await waitFor(() => expect(view.getByText('已保存')).toBeTruthy());
	expect(log).toHaveBeenCalledWith(expect.any(String), error);
});

test('cleans up the saved feedback timer on leaving the page', async () => {
	const view = await mountSetting();
	vi.useFakeTimers();
	await fireEvent.click(view.getByRole('button', { name: '保存' }));
	expect(view.getByText('已保存')).toBeTruthy();
	expect(vi.getTimerCount()).toBe(1);
	view.unmount();
	expect(vi.getTimerCount()).toBe(0);
});
