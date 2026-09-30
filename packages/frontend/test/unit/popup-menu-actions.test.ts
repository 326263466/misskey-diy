/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import { popupMenu, popups } from '@/os.js';
import { hotkeyDirective } from '@/directives/hotkey.js';

vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: vi.fn() }));
vi.mock('@/preferences.js', () => ({ prefer: { s: {} } }));
vi.mock('@/utility/please-login.js', () => ({ pleaseLogin: vi.fn() }));
vi.mock('@/utility/show-moved-dialog.js', () => ({ showMovedDialog: vi.fn() }));
vi.mock('@/utility/touch.js', () => ({ isTouchUsing: false, lastPointerType: 'mouse' }));
vi.mock('@/components/MkPostFormDialog.vue', () => ({ default: { name: 'PostFormDialog' } }));
vi.mock('@/components/MkWaitingDialog.vue', () => ({ default: { name: 'WaitingDialog' } }));
vi.mock('@/components/MkPageWindow.vue', () => ({ default: { name: 'PageWindow' } }));
vi.mock('@/components/MkToast.vue', () => ({ default: { name: 'Toast' } }));
vi.mock('@/components/MkDialog.vue', () => ({ default: { name: 'Dialog' } }));
vi.mock('@/components/MkContextMenu.vue', () => ({ default: { name: 'ContextMenu' } }));
vi.mock('@/components/MkModal.vue', () => ({
	default: {
		emits: ['click', 'close', 'closed'],
		methods: { close(this: { $emit: (event: 'close') => void }) { this.$emit('close'); } },
		template: '<div><slot type="popup"/><button @click="$emit(\'closed\')">Finish transition</button></div>',
	},
}));

let anchor: HTMLButtonElement;

function renderPopups() {
	return render({
		setup: () => ({ popups }),
		template: '<component :is="popup.component" v-for="popup in popups" :key="popup.id" v-bind="popup.props" v-on="popup.events"/>',
	}, {
		global: {
			directives: { hotkey: hotkeyDirective },
			stubs: { MkEllipsis: true, MkAvatar: true, MkA: true, MkUserName: true },
		},
	});
}

beforeEach(() => {
	popups.value = [];
	anchor = window.document.createElement('button');
	window.document.body.appendChild(anchor);
});

afterEach(() => {
	cleanup();
	popups.value = [];
	anchor.remove();
});

describe('popup menu action lifecycle', () => {
	test('notifies the caller before the closing transition without waiting for or canceling the action', async () => {
		const view = renderPopups();
		const onAction = vi.fn();
		const onClosing = vi.fn();
		const onClosed = vi.fn();
		const completed = vi.fn();
		const actionFinished = vi.fn();
		let finishAction!: () => void;
		const pendingAction = new Promise<void>(resolve => { finishAction = resolve; });
		const closed = popupMenu([{
			text: 'Open another dialog',
			action: async () => {
				await pendingAction;
				actionFinished();
			},
		}], anchor, { onAction, onClosing, onClosed }).then(completed);
		await nextTick();
		await fireEvent.click(await view.findByRole('menuitem', { name: 'Open another dialog' }));
		expect(onAction).toHaveBeenCalledOnce();
		expect(onClosing).toHaveBeenCalledOnce();
		expect(onClosed).not.toHaveBeenCalled();
		expect(completed).not.toHaveBeenCalled();
		expect(actionFinished).not.toHaveBeenCalled();

		await fireEvent.click(view.getByRole('button', { name: 'Finish transition' }));
		await closed;
		expect(onClosed).toHaveBeenCalledOnce();
		expect(completed).toHaveBeenCalledOnce();
		expect(popups.value).toHaveLength(0);
		finishAction();
		await pendingAction;
		expect(actionFinished).toHaveBeenCalledOnce();
	});

	test('keeps cancellation separate from selecting an action', async () => {
		const view = renderPopups();
		const onAction = vi.fn();
		const action = vi.fn();
		const closed = popupMenu([{ text: 'Action', action }], anchor, { onAction });
		const menu = await view.findByRole('menu');
		await fireEvent.keyDown(menu.querySelector('._popup')!, { key: 'Escape' });
		expect(onAction).not.toHaveBeenCalled();
		expect(action).not.toHaveBeenCalled();
		await fireEvent.click(view.getByRole('button', { name: 'Finish transition' }));
		await closed;
		expect(onAction).not.toHaveBeenCalled();
	});
});
