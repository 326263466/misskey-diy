/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import MkNoteTags from '@/components/MkNoteTags.vue';

function renderTags(tags: string[], channel?: { id: string; name: string }) {
	return render(MkNoteTags, {
		props: { tags, channel },
		global: { stubs: { MkA: { props: ['to'], template: '<a :href="to"><slot/></a>' } } },
	});
}

describe('note channel and topics', () => {
	afterEach(cleanup);

	test('places the channel link before topic links with their own destinations', () => {
		const view = renderTags(['Vue', '日常'], { id: 'channel-id', name: 'Frontend' });
		const links = view.getAllByRole('link');
		expect(links.map(link => link.getAttribute('aria-label'))).toEqual(['Frontend', '#Vue', '#日常']);
		expect(links.map(link => link.getAttribute('href'))).toEqual(['/channels/channel-id', '/tags/Vue', `/tags/${encodeURIComponent('日常')}`]);
	});

	test('shows the channel even when there are no topics', () => {
		const view = renderTags([], { id: 'channel-id', name: 'Channel' });
		expect(view.getByRole('link', { name: 'Channel' }).getAttribute('href')).toBe('/channels/channel-id');
	});

	test('keeps ordinary topics and hides an empty row', () => {
		const view = renderTags(['Vue']);
		expect(view.getAllByRole('link')).toHaveLength(1);
		view.unmount();
		expect(renderTags([]).queryByRole('navigation')).toBeNull();
	});
});
