/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick, ref } from 'vue';
import { compile } from '@@/js/theme.js';
import lightBase from '@@/themes/_light.json5';
import lightTheme from '@@/themes/l-light.json5';
import darkBase from '@@/themes/_dark.json5';
import darkTheme from '@@/themes/d-dark.json5';
import type { App } from 'vue';
import '@tabler/icons-webfont/dist/tabler-icons.css';
import '@/style.scss';
import PageWithHeader from '@/components/global/PageWithHeader.vue';
import MkPageHeader from '@/components/global/MkPageHeader.vue';
import MkStickyContainer from '@/components/global/MkStickyContainer.vue';
import MkCondensedLine from '@/components/global/MkCondensedLine.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkColorInput from '@/components/MkColorInput.vue';
import MkRadios from '@/components/MkRadios.vue';
import MkButton from '@/components/MkButton.vue';
import FormSection from '@/components/form/section.vue';
import FormSplit from '@/components/form/split.vue';
import FormLink from '@/components/form/link.vue';
import FormSlot from '@/components/form/slot.vue';
import MkAsUi from '@/components/MkAsUi.vue';
import MkFeatureBanner from '@/components/MkFeatureBanner.vue';
import themePageSource from '@/pages/settings/theme.vue?raw';
import { adaptiveBorderDirective } from '@/directives/adaptive-border.js';
import { panelDirective } from '@/directives/panel.js';
import { themeManager } from '@/theme.js';
import { prefer } from '@/preferences.js';

vi.mock('json5', () => ({ default: {} }));
vi.mock('@/preferences.js', () => ({ prefer: { s: { animation: true, enableHorizontalSwipe: false }, r: { enableHorizontalSwipe: { value: true }, animation: { value: true } } } }));
vi.mock('@/router.js', () => ({ useRouter: () => ({ useListener: vi.fn() }) }));
vi.mock('@/accounts.js', () => ({ getAccountMenu: vi.fn() }));
vi.mock('@/i.js', () => ({ $i: null }));
vi.mock('@/os.js', () => ({ pageFolderTeleportCount: { value: 0 }, popup: vi.fn(), claimZIndex: () => 1 }));
vi.mock('@/theme.js', () => ({ themeManager: { currentCompiledTheme: { panel: '' }, on: vi.fn(), off: vi.fn() } }));
vi.mock('@/utility/device-kind.js', () => ({ deviceKind: 'desktop' }));
vi.mock('@/local-storage.js', () => ({ miLocalStorage: { getItem: () => null, setItem: vi.fn() } }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { goBack: 'Back' } } }));
vi.mock('@/components/MkDatePicker.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkEmojiInputOverlay.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkPostForm.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/global/MkA.vue', () => ({ default: { render: () => null } }));
vi.mock('@/utility/autocomplete.js', () => ({ Autocomplete: class { destroy() {} } }));

const fixtures: { app: App; host: HTMLElement }[] = [];

test.each([0, 8, 24])('script containers preserve their own %i px inset inside form folders', async padding => {
	const host = document.createElement('div');
	host.className = '_panel _panelPadding';
	host.style.width = '500px';
	document.body.append(host);
	const inner = { id: 'inner', type: 'folder' as const, title: 'Inner', opened: true, children: [] };
	const container = { id: 'container', type: 'container' as const, padding, borderWidth: 1, children: ['inner'] };
	const app = createApp({ render: () => h(MkAsUi, {
		component: { id: 'outer', type: 'folder', title: 'Outer', opened: true, children: ['container'] },
		components: [ref(container), ref(inner)],
	}) });
	app.component('MkStickyContainer', MkStickyContainer);
	app.component('MkCondensedLine', MkCondensedLine);
	app.mount(host);
	fixtures.push({ app, host });
	await settle();
	const headers = host.querySelectorAll<HTMLElement>('[data-testid="folder-header"]');
	expect(headers).toHaveLength(2);
	const innerFolder = headers[1].closest('[role="group"]')!;
	const border = innerFolder.parentElement!.parentElement!;
	expect(getComputedStyle(border).paddingLeft).toBe(`${padding}px`);
	expect(innerFolder.getBoundingClientRect().left).toBe(border.getBoundingClientRect().left + padding + 1);
	expect(innerFolder.getBoundingClientRect().right).toBe(border.getBoundingClientRect().right - padding - 1);
});

test.each([320, 760])('form group titles share the field inset at %i px without accumulating nested padding', async width => {
	await page.viewport(900, 900);
	const host = document.createElement('div');
	host.style.cssText = `width:${width}px;margin:18px;color:#222;--MI_THEME-panel:#fff;--MI_THEME-panelHighlight:#f2f3f5;--MI_THEME-fg:#222;--MI_THEME-fgTransparentWeak:#798390;--MI_THEME-bg:#f2f3f5;--MI_THEME-divider:#ddd;`;
	document.body.append(host);
	const marker = (text: string) => h('span', { 'data-label': text }, text);
	const app = createApp({ render: () => h('div', { class: '_panel _panelPadding _gaps_m' }, [
		h(MkInput, { modelValue: '自动', 'data-field': '' }, { label: () => '语言' }),
		h(FormSlot, {}, {
			default: () => h(MkFolder, {}, { label: () => marker('编辑附加信息'), icon: () => h('i', { 'data-leading-icon': '', class: 'ti ti-list' }) }),
			caption: () => '可以在个人资料中以表格形式展示附加信息。',
		}),
		h(MkInput, { modelValue: '', 'data-field': '' }, { label: () => '新关注者消息' }),
		h(MkFolder, { defaultOpen: true }, {
			label: () => marker('高级设置'),
			default: () => h('div', { class: '_gaps_m' }, [
				h(MkInput, { modelValue: '', 'data-field': '' }, { label: () => '展开后的内容' }),
				h(MkFolder, { defaultOpen: true }, {
					label: () => marker('二级设置'),
					default: () => h(MkInput, { modelValue: '', 'data-field': '' }, { label: () => '二级内容' }),
				}),
			]),
		}),
		h(FormLink, {}, { default: () => '二维码', icon: () => h('i', { 'data-leading-icon': '', class: 'ti ti-qrcode' }) }),
	]) });
	app.component('MkStickyContainer', MkStickyContainer);
	app.component('MkCondensedLine', MkCondensedLine);
	app.directive('adaptive-border', adaptiveBorderDirective);
	app.mount(host);
	fixtures.push({ app, host });
	await settle();
	const card = host.firstElementChild!;
	const box = card.getBoundingClientRect();
	for (const item of host.querySelectorAll('[data-field], [data-label="高级设置"], [data-label="二级设置"], [data-leading-icon]')) {
		expect(item.getBoundingClientRect().left).toBe(box.left + 18);
	}
	for (const field of host.querySelectorAll('[data-field]')) expect(field.getBoundingClientRect().right).toBe(box.right - 18);
	for (const header of host.querySelectorAll('[data-testid="folder-header"]')) expect(getComputedStyle(header).borderRadius).toBe('0px');
	expect(getComputedStyle(card).borderRadius).not.toBe('0px');
	expect(host.scrollWidth).toBe(width);
	await page.screenshot({ element: host, path: `../e2e/artifacts/component-browser/settings-label-alignment-${width}.png` });
});

test.each(['#ffffff', '#292929'])('feature banners keep their card surface inside a %s parent', async panel => {
	themeManager.currentCompiledTheme.panel = panel;
	const host = document.createElement('div');
	host.style.cssText = `background:${panel};--MI_THEME-panel:${panel};--MI_THEME-bg:#123456;`;
	document.body.append(host);
	const app = createApp({ render: () => h(MkFeatureBanner, { icon: 'data:,', color: '#1682ff' }, () => 'Feature details') });
	app.directive('panel', panelDirective);
	app.mount(host);
	fixtures.push({ app, host });
	await nextTick();
	const card = host.firstElementChild!;
	expect(getComputedStyle(card).backgroundColor).toBe(getComputedStyle(host).backgroundColor);
	expect(getComputedStyle(card).padding).toBe('18px');
});

test.each(['#ffffff', '#292929'])('text previews retain a card surface inside a %s parent', async panel => {
	themeManager.currentCompiledTheme.panel = panel;
	const host = document.createElement('div');
	host.style.cssText = `background:${panel};--MI_THEME-panel:${panel};--MI_THEME-bg:#123456;`;
	document.body.append(host);
	const app = createApp({ render: () => h(MkTextarea, { modelValue: 'Preview content', mfmPreview: true }) });
	// eslint-disable-next-line vue/multi-word-component-names
	app.component('Mfm', { render: () => h('span', { 'data-preview-text': '' }, 'Preview content') });
	app.directive('panel', panelDirective);
	app.directive('adaptive-border', adaptiveBorderDirective);
	app.mount(host);
	fixtures.push({ app, host });
	host.querySelector<HTMLButtonElement>('._textButton')!.click();
	await nextTick();
	const card = host.querySelector('[data-preview-text]')!.parentElement!;
	expect(getComputedStyle(card).display).not.toBe('none');
	expect(getComputedStyle(card).backgroundColor).toBe(getComputedStyle(host).backgroundColor);
	expect(getComputedStyle(card).padding).toBe('18px');
});

afterEach(() => {
	prefer.s.enableHorizontalSwipe = false;
	for (const { app, host } of fixtures.splice(0)) {
		app.unmount();
		host.remove();
	}
});

test.each([false, true])('standalone cards have one inset with horizontal swipe set to %s', async enableHorizontalSwipe => {
	prefer.s.enableHorizontalSwipe = enableHorizontalSwipe;
	const host = document.createElement('div');
	host.style.cssText = 'width:320px;height:640px;container-type:size;';
	document.body.append(host);
	const app = createApp({ render: () => h(PageWithHeader, {
		contentCard: true, hideHeader: true, tab: 'first', tabs: [{ key: 'first', title: 'First' }, { key: 'second', title: 'Second' }],
	}, {
		default: () => h('div', { class: '_pageBody' }, h('div', { 'data-content': '' }, 'Content')),
	}) });
	app.component('MkStickyContainer', MkStickyContainer);
	app.component('MkPageHeader', MkPageHeader);
	app.mount(host);
	fixtures.push({ app, host });
	await settle();
	const body = host.querySelector<HTMLElement>('[data-page-body]')!;
	const content = host.querySelector<HTMLElement>('[data-content]')!;
	expect(content.getBoundingClientRect().left - body.getBoundingClientRect().left).toBe(18);
	expect(body.getBoundingClientRect().right - content.getBoundingClientRect().right).toBe(18);
	expect(content.getBoundingClientRect().top - body.getBoundingClientRect().top).toBe(18);
	expect(body.getBoundingClientRect().height).toBe(640);
	if (enableHorizontalSwipe) {
		expect(body.firstElementChild!.getBoundingClientRect().bottom).toBe(body.getBoundingClientRect().bottom - 18);
	}
});

async function settle() {
	await nextTick();
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
	await nextTick();
}

test.each([
	{ mode: 'light', width: 820 }, { mode: 'light', width: 320 },
	{ mode: 'dark', width: 820 }, { mode: 'dark', width: 320 },
])('$mode settings use a single card surface and inset controls at $width px', async ({ mode, width }) => {
	const base = mode === 'light' ? lightBase : darkBase;
	const selected = mode === 'light' ? lightTheme : darkTheme;
	const theme = compile({ ...base, ...selected, props: { ...base.props, ...selected.props } });
	Object.assign(themeManager.currentCompiledTheme!, theme);
	const host = document.createElement('div');
	host.className = '_pageLayout _pageLayoutWithSidebar';
	host.style.cssText = `width:${width}px;height:640px;margin:16px;color:var(--MI_THEME-fg);`;
	host.style.setProperty('grid-template-columns', 'minmax(0, 1fr)');
	host.style.setProperty('padding', '10px');
	for (const [key, value] of Object.entries(theme)) host.style.setProperty(`--MI_THEME-${key}`, value);
	// Embedded settings titles use normal text even when a theme accents page headers.
	host.style.setProperty('--MI_THEME-pageHeaderFg', 'var(--MI_THEME-accent)');
	document.body.append(host);
	const field = (id: string) => h(MkInput, { 'data-field': id, modelValue: 'Example' }, { label: () => id });
	const app = createApp({ render: () => h(PageWithHeader, {
		class: '_pageContent', style: 'grid-column:1', contentCard: true, overridePageMetadata: { title: 'Branding' },
	}, {
		default: () => h('div', { class: '_pageBody' }, [h('div', { class: '_gaps_m' }, [
			field('Entrance page'),
			h(MkRadios, { modelValue: 'classic', options: [{ value: 'classic', label: 'Classic' }, { value: 'simple', label: 'Simple' }] }, { label: () => 'Layout' }),
			h(MkSelect, { modelValue: 'all', items: [{ value: 'all', label: 'Everyone' }] }, { label: () => 'Visibility' }),
			h(MkTextarea, { modelValue: 'Example description' }, { label: () => 'Description' }),
			h(MkColorInput, { modelValue: '#4080ff' }, { label: () => 'Color' }),
			h(FormSection, { 'data-section': '' }, { label: () => 'Email server', description: () => 'Delivery settings', default: () => field('SMTP host') }),
			h(FormSection, { 'data-unlabelled': '' }, { default: () => field('Notifications') }),
			h(MkFolder, { defaultOpen: true }, {
				label: () => 'Information',
				default: () => h(FormSplit, { 'data-split': '' }, () => [field('Server name'), field('Description')]),
				footer: () => h('div', { 'data-folder-footer': '' }, 'Footer'),
			}),
			h(MkFoldableSection, {}, { header: () => 'Advanced', default: () => field('Options') }),
			h(MkFolder, { defaultOpen: true }, {
				label: () => 'Themes',
				default: () => h(FormSection, {}, {
					label: () => 'Installed themes',
					default: () => h('div', { class: 'themeSelect' }, [h('div', { class: 'themeItemOuter' }, h('div', { class: 'themeItemRoot', style: 'height:60px' }, 'Preview'))]),
				}),
			}),
		])]),
		footer: () => h('div', { class: '_pageFooter', 'data-footer': '' }, h(MkButton, { primary: true }, () => 'Save')),
	}) });
	app.component('MkPageHeader', MkPageHeader);
	app.component('MkStickyContainer', MkStickyContainer);
	app.component('MkCondensedLine', MkCondensedLine);
	for (const name of ['MkAvatar', 'MkUserName', 'Mfm']) app.component(name, { render: () => null });
	app.directive('tooltip', () => {});
	app.directive('adaptive-border', adaptiveBorderDirective);
	app.directive('panel', panelDirective);
	app.mount(host);
	// Exercise the actual theme grid CSS inside the same nested cards as the settings page.
	const themeStyle = document.createElement('style');
	themeStyle.textContent = themePageSource.match(/<style module>([\s\S]*?)<\/style>/)![1];
	host.append(themeStyle);
	fixtures.push({ app, host });
	await settle();
	await settle();
	const header = host.querySelector<HTMLElement>('[data-page-header]')!;
	const card = host.firstElementChild!;
	expect(getComputedStyle(card).borderBottomLeftRadius).toBe(getComputedStyle(card).borderTopLeftRadius);
	const body = host.querySelector<HTMLElement>('[data-page-body]')!;
	const content = body.firstElementChild!;
	const first = host.querySelector<HTMLElement>('[data-field]')!;
	const headerBounds = header.getBoundingClientRect();
	const bodyBounds = body.getBoundingClientRect();
	const firstBounds = first.getBoundingClientRect();
	expect(getComputedStyle(header).color).toBe(theme.fg);
	expect(getComputedStyle(card).backgroundColor).toBe(theme.panel);
	expect(getComputedStyle(body).backgroundColor).toBe(theme.panel);
	expect(getComputedStyle(body).backgroundColor).not.toBe(getComputedStyle(host).backgroundColor);
	expect(getComputedStyle(content).backgroundColor).toBe('rgba(0, 0, 0, 0)');
	expect(bodyBounds.top).toBeCloseTo(headerBounds.bottom, 1);
	expect(firstBounds.left - bodyBounds.left).toBe(18);
	expect(bodyBounds.right - firstBounds.right).toBe(18);
	expect(firstBounds.top - bodyBounds.top).toBe(18);
	for (const control of host.querySelectorAll('input:not([type="radio"]), textarea, [aria-haspopup="menu"] > [tabindex="-1"], [role="checkbox"][aria-checked="false"]')) {
		expect(getComputedStyle(control).backgroundColor).toBe(theme.bg);
	}
	expect(getComputedStyle(host.querySelector('[role="checkbox"][aria-checked="true"]')!).backgroundColor).toBe(theme.accentedBg);
	for (const selector of ['[data-section]', '[data-unlabelled]']) {
		const section = host.querySelector<HTMLElement>(selector)!;
		const main = section.lastElementChild!;
		expect(getComputedStyle(main).paddingInline).toBe('0px');
		expect(getComputedStyle(main).backgroundColor).toBe('rgba(0, 0, 0, 0)');
		expect(getComputedStyle(section).backgroundColor).toBe(theme.panel);
		expect(main.getBoundingClientRect().left).toBe(section.getBoundingClientRect().left);
		expect(main.getBoundingClientRect().right).toBe(section.getBoundingClientRect().right);
	}
	const label = host.querySelector<HTMLElement>('[data-section]')!.firstElementChild!;
	expect(getComputedStyle(label).color).toBe(theme.fg);
	const foldableField = host.querySelector<HTMLElement>('[data-field="Options"]')!;
	expect(getComputedStyle(foldableField.parentElement!).padding).toBe('18px');
	expect(getComputedStyle(foldableField.parentElement!).backgroundColor).toBe('rgba(0, 0, 0, 0)');
	expect(getComputedStyle(foldableField.parentElement!.parentElement!.parentElement!).backgroundColor).toBe(theme.panel);
	const folder = host.querySelector<HTMLElement>('[role="group"][aria-expanded]')!;
	const folderHeader = folder.querySelector<HTMLElement>('[data-testid="folder-header"]')!;
	expect(folder.getBoundingClientRect().left).toBe(bodyBounds.left);
	expect(folderHeader.querySelector('[class*="headerTextMain"]')!.getBoundingClientRect().left).toBe(firstBounds.left);
	expect(folder.getBoundingClientRect().right).toBe(bodyBounds.right);
	expect(getComputedStyle(folderHeader).backgroundColor).toBe(theme.panelHighlight);
	expect(getComputedStyle(folderHeader).paddingLeft).toBe('18px');
	expect(getComputedStyle(folderHeader).paddingRight).toBe('18px');
	const folderBody = folder.querySelector('[aria-hidden]')!;
	expect(getComputedStyle(folderBody).backgroundColor).toBe(theme.panel);
	const folderSpacer = folder.querySelector('._spacer')!;
	const split = host.querySelector('[data-split]')!;
	expect(split.getBoundingClientRect().left - folderBody.getBoundingClientRect().left).toBe(18);
	expect(getComputedStyle(folderSpacer).paddingTop).toBe('18px');
	expect(split.scrollWidth).toBe(split.clientWidth);
	const folderFooter = host.querySelector('[data-folder-footer]')!.parentElement!;
	expect(getComputedStyle(folderFooter).backgroundColor).toBe(theme.panel);
	expect(getComputedStyle(folderFooter).padding).toBe('18px');
	const folderContent = folder.querySelector('._spacer')!.parentElement!.parentElement!;
	expect(getComputedStyle(folderContent).backgroundColor).toBe('rgba(0, 0, 0, 0)');
	expect(folderContent.getBoundingClientRect().left).toBe(folderBody.getBoundingClientRect().left);
	const themeGrid = host.querySelector('.themeSelect')!;
	const themePreview = host.querySelector('.themeItemRoot')!;
	expect(themePreview.getBoundingClientRect().right).toBeLessThanOrEqual(themeGrid.getBoundingClientRect().right);
	expect(themeGrid.scrollWidth).toBe(themeGrid.clientWidth);
	for (const input of host.querySelectorAll('input')) expect(input.getBoundingClientRect().right).toBeLessThanOrEqual(bodyBounds.right - 18);
	expect(parseFloat(getComputedStyle(host.querySelector('[data-footer]')!).paddingTop)).toBeGreaterThan(0);
	await page.screenshot({ path: `../e2e/artifacts/component-browser/settings-card-${mode}-${width}.png` });
	card.scrollTop = host.querySelector<HTMLElement>('[data-section]')!.offsetTop - headerBounds.height - 18;
	await settle();
	await page.screenshot({ path: `../e2e/artifacts/component-browser/settings-groups-${mode}-${width}.png` });
	folder.querySelector('button')!.click();
	await settle();
	await settle();
	await expect.poll(() => folder.getBoundingClientRect().height).toBeCloseTo(folder.querySelector('button')!.getBoundingClientRect().height, 1);
});
