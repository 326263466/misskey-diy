/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import type { App } from 'vue';
import '@tabler/icons-webfont/dist/tabler-icons.css';
import '@/style.scss';
import ProfileSettings from '@/pages/settings/profile.vue';
import SearchMarker from '@/components/global/SearchMarker.vue';
import SearchLabel from '@/components/global/SearchLabel.vue';

vi.hoisted(() => { vi.stubGlobal('_LANGS_', []); vi.stubGlobal('_VERSION_', 'test'); vi.stubGlobal('_DEV_', false); });
vi.mock('@@/js/intl-const.js', () => ({ versatileLang: 'zh-CN' }));
vi.mock('misskey-js', () => ({}));
vi.mock('@/i.js', () => ({ ensureSignin: () => ({
	id: 'self', username: 'alice', name: 'Alice', description: null, followedMessage: null,
	location: '上海', birthday: '1990-01-01', company: '示例科技', jobTitle: '产品设计师', fields: [], lang: null,
}) }));
vi.mock('@/os.js', () => ({ apiWithDialog: vi.fn() }));
vi.mock('@/accounts.js', () => ({ updateCurrentAccountPartial: vi.fn() }));
vi.mock('@/utility/drive.js', () => ({ chooseDriveFile: vi.fn() }));
vi.mock('@/utility/achievements.js', () => ({ claimAchievement: vi.fn() }));
vi.mock('@/utility/autocomplete.js', () => ({ Autocomplete: class { detach() {} } }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/store.js', async () => {
	const { ref } = await import('vue');
	return { store: { model: () => ref(null) } };
});
vi.mock('@/components/MkEmojiInputOverlay.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkTextarea.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkSelect.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkSwitch.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkFolder.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkDraggable.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkInfo.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/global/MkA.vue', () => ({ default: { render: () => null } }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: {
	profile: '个人资料', location: '所在地', birthday: '生日', save: '保存', decorate: '装饰',
	_datePicker: { title: '选择日期' },
	_profile: {
		changeBanner: '更换横幅', changeAvatar: '更换头像', name: '昵称', nameDescription: '',
		company: '公司', jobTitle: '职位', companyPlaceholder: '公司或组织名称', jobTitlePlaceholder: '你的职位',
		metadataDescription: '', followedMessage: '关注后的消息', followedMessageDescription: '', followedMessageDescriptionForLockedAccount: '',
	},
} } }));

let app: App | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
	app?.unmount();
	host?.remove();
});

test.each([
	{ viewport: 1000, width: 760, columns: 2 },
	{ viewport: 1000, width: 420, columns: 1 },
	{ viewport: 390, width: 340, columns: 1 },
])('profile field pairs use $columns columns at container $width in viewport $viewport', async ({ viewport, width, columns }) => {
	await page.viewport(viewport, 900);
	host = document.createElement('div');
	host.style.cssText = `width:${width}px;margin:20px auto;font-size:14px;color:#444;--MI_THEME-fg:#444;--MI_THEME-panel:#fff;--MI_THEME-bg:#f2f3f5;--MI_THEME-inputBg:#fff;--MI_THEME-inputBorder:#ccd0d5;--MI_THEME-accent:#86b300;--MI_THEME-divider:#8884;--MI_THEME-fgOnAccent:#fff;--MI_THEME-buttonBg:#e4e7eb;--MI_THEME-buttonHoverBg:#d9dde2;--MI-radius:12px;`;
	document.body.append(host);
	app = createApp({ render: () => h(ProfileSettings) });
	app.component('SearchMarker', SearchMarker);
	app.component('SearchLabel', SearchLabel);
	app.component('SearchText', SearchLabel);
	for (const name of ['MkAvatar', 'MkA', 'MkCondensedLine']) app.component(name, { render: () => null });
	app.directive('adaptive-border', () => {});
	app.directive('panel', () => {});
	app.mount(host);
	await nextTick();
	await document.fonts.ready;
	await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
	const company = page.getByRole('textbox', { name: '公司', exact: true });
	const title = page.getByRole('textbox', { name: '职位', exact: true });
	const location = page.getByRole('textbox', { name: '所在地', exact: true });
	const birthday = page.getByRole('textbox', { name: '生日', exact: true }).element();
	for (const [first, second] of [[company.element(), title.element()], [location.element(), birthday]]) {
		const a = first.getBoundingClientRect();
		const b = second.getBoundingClientRect();
		if (columns === 2) {
			expect(Math.abs(a.top - b.top)).toBeLessThan(1);
			expect(b.left).toBeGreaterThan(a.right);
		} else {
			expect(b.top).toBeGreaterThan(a.bottom);
			expect(Math.abs(a.left - b.left)).toBeLessThan(1);
		}
		expect(a.width).toBeGreaterThan(150);
	}
	expect(host.scrollWidth).toBe(host.clientWidth);
	expect(company.element().getAttribute('maxlength')).toBe('128');
	expect(title.element().getAttribute('maxlength')).toBe('128');
	await company.click();
	await userEvent.keyboard('{Tab}');
	await expect.element(title).toHaveFocus();
	const focusedStyle = getComputedStyle(title.element());
	expect(focusedStyle.borderTopWidth).toBe('1px');
	await expect.poll(() => getComputedStyle(title.element()).borderTopColor).toBe('rgb(134, 179, 0)');
	expect(focusedStyle.outlineStyle).toBe('none');
	expect(focusedStyle.boxShadow).toBe('none');
	await page.screenshot({ element: host, path: `../e2e/artifacts/component-browser/profile-fields-${width}.png` });
});
