/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import ChatMessagePage from '@/pages/chat/message.vue';

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@/pages/chat/XMessage.vue', () => ({ default: { props: ['message'], template: '<div>{{ message.text }}</div>' } }));

function renderPage() {
	return render(ChatMessagePage, {
		props: { messageId: 'message1' },
		global: {
			stubs: {
				PageWithHeader: { template: '<main><slot/></main>' },
				MkLoading: { template: '<div role="status">Loading</div>' },
				MkError: { emits: ['retry'], template: '<button @click="$emit(\'retry\')">Retry</button>' },
			},
		},
	});
}

describe('chat message page', () => {
	beforeEach(() => mocks.api.mockReset());
	afterEach(cleanup);

	test('renders the original message', async () => {
		mocks.api.mockResolvedValue({ id: 'message1', text: 'Original message' });
		const view = renderPage();
		await view.findByText('Original message');
		expect(mocks.api).toHaveBeenCalledWith('chat/messages/show', { messageId: 'message1' });
		expect(view.queryByRole('status')).toBeNull();
	});

	test.each([{ code: 'NO_SUCH_MESSAGE' }, { code: 'INTERNAL_ERROR' }, new TypeError('Failed to fetch')])('contains a failed request and allows retry: %j', async (error) => {
		mocks.api.mockRejectedValueOnce(error).mockResolvedValueOnce({ id: 'message1', text: 'Recovered message' });
		const view = renderPage();
		const retry = await view.findByRole('button', { name: 'Retry' });
		expect(view.queryByRole('status')).toBeNull();
		await fireEvent.click(retry);
		await view.findByText('Recovered message');
		await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(2));
		expect(view.queryByRole('button')).toBeNull();
	});
});
