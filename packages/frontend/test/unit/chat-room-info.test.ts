/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import RoomInfo from '@/pages/chat/room.info.vue';

const mocks = vi.hoisted(() => ({ api: vi.fn(), success: vi.fn() }));
vi.mock('@/os.js', () => ({ apiWithDialog: mocks.api, success: mocks.success }));
vi.mock('@/i.js', () => ({ ensureSignin: () => ({ id: 'owner' }) }));
vi.mock('@/router.js', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { name: 'Name', description: 'Description', save: 'Save', saved: 'Saved', _chat: { deleteRoom: 'Delete' } } } }));
vi.mock('@/components/MkButton.vue', () => ({ default: { template: '<button><slot/></button>' } }));
vi.mock('@/components/MkInput.vue', () => ({ default: { template: '<input/>' } }));
vi.mock('@/components/MkTextarea.vue', () => ({ default: { template: '<textarea/>' } }));
vi.mock('@/components/MkSwitch.vue', () => ({ default: { template: '<div/>' } }));

afterEach(() => { cleanup(); vi.resetAllMocks(); });
const room = { id: 'room', ownerId: 'owner', name: 'Group', description: '', memberCount: 1 };

test('saving updates the parent title and confirms success', async () => {
	const updated = { ...room, name: 'Updated' };
	mocks.api.mockResolvedValue(updated);
	const view = render(RoomInfo, { props: { room: room as never } });
	await fireEvent.click(view.getByText('Save'));
	await waitFor(() => expect(mocks.success).toHaveBeenCalledExactlyOnceWith('Saved'));
	expect(view.emitted().updated).toEqual([[updated]]);
});

test('a failed save permits retry without a false success notification', async () => {
	mocks.api.mockRejectedValue(new Error('request failed'));
	const view = render(RoomInfo, { props: { room: room as never } });
	await fireEvent.click(view.getByText('Save'));
	await waitFor(() => expect((view.getByText('Save') as HTMLButtonElement).disabled).toBe(false));
	expect(mocks.success).not.toHaveBeenCalled();
	expect(view.emitted().updated).toBeUndefined();
});
