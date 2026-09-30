/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { defineComponent, h, ref } from 'vue';
import * as mfm from 'mfm-js';
import type * as Misskey from 'misskey-js';
import MkCwButton from '@/components/MkCwButton.vue';
import MkNotePreview from '@/components/MkNotePreview.vue';
import MkNoteSimple from '@/components/MkNoteSimple.vue';
import MkNoteTags from '@/components/MkNoteTags.vue';
import { i18n } from '@/i18n.js';

vi.mock('@/components/MkNoteHeader.vue', () => ({ default: { props: ['note'], template: '<header>{{ note.user.username }}</header>' } }));
vi.mock('@/components/MkSubNoteContent.vue', () => ({ default: { props: ['note'], template: '<p>{{ note.text }}</p>' } }));

const user = { id: 'author', username: 'author', host: null } as Misskey.entities.User;
const global = {
	stubs: {
		MkAvatar: true,
		MkUserName: true,
		MkA: { props: ['to'], template: '<a :href="to"><slot/></a>' },
		Mfm: defineComponent({
			props: ['text', 'parsedNodes'],
			setup: props => () => h('span', props.parsedNodes == null ? props.text : mfm.toString(props.parsedNodes)),
		}),
	},
};

afterEach(cleanup);

describe('CW disclosure', () => {
	test('shows only the public summary and metadata, with an accessible controlled toggle', async () => {
		const parentClick = vi.fn();
		const parentKeydown = vi.fn();
		const shown = ref(false);
		const view = render(defineComponent({
			setup: () => () => h('article', { onClick: parentClick, onKeydown: parentKeydown }, h(MkCwButton, {
				modelValue: shown.value,
				'onUpdate:modelValue': value => { shown.value = value; },
				text: 'Hidden text',
				files: [{ id: 'file' }] as Misskey.entities.DriveFile[],
			}, { default: () => 'Public summary' })),
		}));
		const button = view.getByRole('button', { name: i18n.ts._cw.showContent });
		expect(button.getAttribute('aria-expanded')).toBe('false');
		expect(view.getByText('Public summary')).toBeTruthy();
		expect(view.queryByText('Hidden text')).toBeNull();
		expect(view.getByText(`${i18n.tsx._cw.chars({ count: 11 })} / ${i18n.tsx._cw.files({ count: 1 })}`)).toBeTruthy();
		await fireEvent.click(button);
		expect(shown.value).toBe(true);
		expect(button.getAttribute('aria-expanded')).toBe('true');
		expect(button.textContent).toContain(i18n.ts._cw.hideContent);
		await fireEvent.keyDown(button, { key: 'Enter' });
		await fireEvent.keyDown(button, { key: ' ' });
		expect(parentClick).not.toHaveBeenCalled();
		expect(parentKeydown).not.toHaveBeenCalled();
		await fireEvent.click(button);
		expect(shown.value).toBe(false);
	});

	test('provides a readable state for notes with no public summary or text', async () => {
		const view = render(MkCwButton, { props: { modelValue: false, text: null } });
		expect(view.getByText(i18n.ts._cw.contentHidden)).toBeTruthy();
		await view.rerender({ modelValue: true });
		expect(view.getByText(i18n.ts._cw.contentShown)).toBeTruthy();
	});

	test.each(['Public summary', ''])('preview keeps body and topics hidden until expanded (summary: %s)', async cw => {
		const view = render(MkNotePreview, {
			props: { text: 'Hidden body\n#秘密话题', files: [], useCw: true, cw, user },
			global,
		});
		const body = view.getByText('Hidden body');
		expect(body.parentElement?.style.display).toBe('none');
		expect(view.queryByRole('link', { name: '#秘密话题' })).toBeNull();
		expect(view.getByText(cw || i18n.ts._cw.contentHidden)).toBeTruthy();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._cw.showContent }));
		expect(body.parentElement?.style.display).not.toBe('none');
		expect(view.getByRole('link', { name: '#秘密话题' }).getAttribute('href')).toBe(`/tags/${encodeURIComponent('秘密话题')}`);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._cw.hideContent }));
		expect(body.parentElement?.style.display).toBe('none');
		expect(view.queryByRole('link', { name: '#秘密话题' })).toBeNull();
	});

	test('ordinary previews show topic chips and keep literal hashes in the body', () => {
		const view = render(MkNotePreview, {
			props: { text: '`#literal`\n#Topic', files: [], useCw: false, cw: null, user },
			global,
		});
		expect(view.queryByRole('button', { name: i18n.ts._cw.showContent })).toBeNull();
		expect(view.getByText('`#literal`')).toBeTruthy();
		expect(view.getByRole('link', { name: '#Topic' })).toBeTruthy();
		expect(view.queryByRole('link', { name: '#literal' })).toBeNull();
	});

	test('quoted notes hide their topic links together with their content', async () => {
		const note = { id: 'note', user, text: 'Quoted body', cw: 'Quoted summary', tags: ['Spoiler'] } as Misskey.entities.Note;
		const view = render(MkNoteSimple, { props: { note }, global });
		const body = view.getByText('Quoted body');
		expect(body.parentElement?.style.display).toBe('none');
		expect(view.queryByRole('link', { name: '#Spoiler' })).toBeNull();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._cw.showContent }));
		expect(body.parentElement?.style.display).not.toBe('none');
		expect(view.getByRole('link', { name: '#Spoiler' })).toBeTruthy();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._cw.hideContent }));
		expect(view.queryByRole('link', { name: '#Spoiler' })).toBeNull();
	});
});

describe('published topic chips', () => {
	test('preserves complete labels and destinations for long and Unicode topics', async () => {
		const tags = ['A_very_long_topic_tag_that_may_be_visually_truncated', '日常记录'];
		const parentClick = vi.fn();
		const view = render(defineComponent({ setup: () => () => h('article', { onClick: parentClick }, h(MkNoteTags, { tags })) }), { global });
		for (const tag of tags) {
			const link = view.getByRole('link', { name: `#${tag}` });
			expect(link.getAttribute('title')).toBe(`#${tag}`);
			expect(link.getAttribute('href')).toBe(`/tags/${encodeURIComponent(tag)}`);
			await fireEvent.click(link);
		}
		expect(parentClick).not.toHaveBeenCalled();
	});
});
