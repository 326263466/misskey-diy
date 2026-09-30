/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { defineComponent, h, nextTick, ref, withDirectives } from 'vue';
import type { Ref } from 'vue';
import { tooltipDirective } from '@/directives/tooltip.js';

type TooltipPopupProps = {
	showing: Ref<boolean>;
	text: string;
	asMfm?: boolean;
	direction: string;
	anchorElement: HTMLElement;
};

const mocks = vi.hoisted(() => ({
	popup: vi.fn<(component: unknown, props: TooltipPopupProps, events: { closed: () => void }) => { dispose: () => void }>(),
	alert: vi.fn(),
}));

vi.mock('@/os.js', () => mocks);
vi.mock('@/utility/touch.js', () => ({ isTouchUsing: false }));

function renderTooltip(initialText: string | null | undefined, options: {
	dialog?: boolean;
	modifiers?: Record<string, boolean>;
} = {}) {
	const text = ref(initialText);
	const parentClick = vi.fn();
	const view = render(defineComponent({
		setup() {
			return () => h('div', { onClick: parentClick }, [
				withDirectives(h('button', { type: 'button' }, 'Trigger'), [
					[tooltipDirective, text.value, options.dialog ? 'dialog' : undefined, options.modifiers ?? {}],
				]),
			]);
		},
	}));
	return { ...view, text, parentClick, trigger: view.getByRole('button', { name: 'Trigger' }) };
}

function enter(trigger: HTMLElement) {
	trigger.dispatchEvent(new MouseEvent('mouseenter'));
}

function leave(trigger: HTMLElement) {
	trigger.dispatchEvent(new MouseEvent('mouseleave'));
}

describe('tooltip directive', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		mocks.popup.mockReset();
		mocks.popup.mockReturnValue({ dispose: vi.fn() });
		mocks.alert.mockReset();
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
	});

	test.each([undefined, null, ''])('does not show an empty tooltip or intercept a dialog click for %s', async (text) => {
		const view = renderTooltip(text, { dialog: true });
		enter(view.trigger);
		await vi.advanceTimersByTimeAsync(600);
		const click = new MouseEvent('click', { bubbles: true, cancelable: true });
		view.trigger.dispatchEvent(click);

		expect(mocks.popup).not.toHaveBeenCalled();
		expect(mocks.alert).not.toHaveBeenCalled();
		expect(click.defaultPrevented).toBe(false);
		expect(view.parentClick).toHaveBeenCalledOnce();
	});

	test.each([undefined, null, ''])('closes the visible tooltip when changed to %s', async (disabledText) => {
		const view = renderTooltip('Hint');
		enter(view.trigger);
		await vi.advanceTimersByTimeAsync(600);
		const { showing } = mocks.popup.mock.calls[0][1];
		leave(view.trigger);
		view.text.value = disabledText;
		await nextTick();

		expect(showing.value).toBe(false);
		expect(vi.getTimerCount()).toBe(0);
	});

	test('does not reuse a pending show after disabling and enabling the tooltip', async () => {
		const view = renderTooltip('Before');
		enter(view.trigger);
		await vi.advanceTimersByTimeAsync(50);
		view.text.value = undefined;
		await nextTick();
		view.text.value = 'After';
		await nextTick();
		await vi.advanceTimersByTimeAsync(600);
		expect(mocks.popup).not.toHaveBeenCalled();

		enter(view.trigger);
		await vi.advanceTimersByTimeAsync(600);
		expect(mocks.popup).toHaveBeenCalledOnce();
		expect(mocks.popup.mock.calls[0][1].text).toBe('After');
	});

	test('does not arm a delayed show while the tooltip is disabled', async () => {
		const view = renderTooltip('');
		enter(view.trigger);
		view.text.value = 'Enabled';
		await nextTick();
		await vi.advanceTimersByTimeAsync(600);
		expect(mocks.popup).not.toHaveBeenCalled();
	});

	test('uses the X hover delay and closes immediately on leave', async () => {
		const view = renderTooltip('Hint');
		enter(view.trigger);
		await vi.advanceTimersByTimeAsync(599);
		expect(mocks.popup).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		const { showing } = mocks.popup.mock.calls[0][1];
		expect(showing.value).toBe(true);

		leave(view.trigger);
		expect(showing.value).toBe(false);
	});

	test('cancels a brief hover without showing a late tooltip', async () => {
		const view = renderTooltip('Hint');
		enter(view.trigger);
		await vi.advanceTimersByTimeAsync(599);
		leave(view.trigger);
		await vi.advanceTimersByTimeAsync(600);
		expect(mocks.popup).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});

	test('shows immediately for keyboard focus and closes on blur', () => {
		const view = renderTooltip('Hint');
		vi.spyOn(view.trigger, 'matches').mockReturnValue(true);
		view.trigger.dispatchEvent(new FocusEvent('focusin'));
		expect(mocks.popup).toHaveBeenCalledOnce();
		const { showing } = mocks.popup.mock.calls[0][1];
		view.trigger.dispatchEvent(new FocusEvent('focusout'));
		expect(showing.value).toBe(false);
	});

	test.each(['scroll', 'Escape', 'click', 'blur', 'touchcancel'])('dismisses a pending or visible tooltip on %s', async (event) => {
		const view = renderTooltip('Hint');
		const dismiss = () => {
			if (event === 'Escape') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
			else if (event === 'scroll' || event === 'blur') window.dispatchEvent(new Event(event));
			else view.trigger.dispatchEvent(new Event(event));
		};
		enter(view.trigger);
		dismiss();
		await vi.advanceTimersByTimeAsync(600);
		expect(mocks.popup).not.toHaveBeenCalled();
		enter(view.trigger);
		await vi.advanceTimersByTimeAsync(600);
		const { showing } = mocks.popup.mock.calls[0][1];
		dismiss();
		expect(showing.value).toBe(false);
		expect(vi.getTimerCount()).toBe(0);
	});

	test.each(['left', 'right', 'top', 'bottom'])('keeps noDelay, MFM, %s placement and click dismissal', (direction) => {
		const view = renderTooltip('Hint', { modifiers: { noDelay: true, mfm: true, [direction]: true } });
		enter(view.trigger);
		expect(mocks.popup).toHaveBeenCalledOnce();
		const props = mocks.popup.mock.calls[0][1];
		expect(props).toMatchObject({ text: 'Hint', asMfm: true, direction, anchorElement: view.trigger });
		expect(props.showing.value).toBe(true);

		view.trigger.click();
		expect(props.showing.value).toBe(false);
	});

	test('keeps dialog clicks active only while a message is available', async () => {
		const view = renderTooltip('Details', { dialog: true });
		const enabledClick = new MouseEvent('click', { bubbles: true, cancelable: true });
		view.trigger.dispatchEvent(enabledClick);
		expect(mocks.alert).toHaveBeenCalledExactlyOnceWith({ type: 'info', text: 'Details' });
		expect(enabledClick.defaultPrevented).toBe(true);
		expect(view.parentClick).not.toHaveBeenCalled();

		view.text.value = '';
		await nextTick();
		const disabledClick = new MouseEvent('click', { bubbles: true, cancelable: true });
		view.trigger.dispatchEvent(disabledClick);
		expect(mocks.alert).toHaveBeenCalledOnce();
		expect(disabledClick.defaultPrevented).toBe(false);
		expect(view.parentClick).toHaveBeenCalledOnce();
	});

	test('preserves text selection while the tooltip is disabled', async () => {
		const view = renderTooltip('Hint');
		const enabledSelection = new Event('selectstart', { cancelable: true });
		view.trigger.dispatchEvent(enabledSelection);
		expect(enabledSelection.defaultPrevented).toBe(true);

		view.text.value = undefined;
		await nextTick();
		const disabledSelection = new Event('selectstart', { cancelable: true });
		view.trigger.dispatchEvent(disabledSelection);
		expect(disabledSelection.defaultPrevented).toBe(false);
	});

	test('closes the tooltip and removes its event listeners on unmount', () => {
		const view = renderTooltip('Hint', { modifiers: { noDelay: true } });
		enter(view.trigger);
		const { showing } = mocks.popup.mock.calls[0][1];
		view.unmount();
		expect(showing.value).toBe(false);

		document.body.appendChild(view.trigger);
		enter(view.trigger);
		expect(mocks.popup).toHaveBeenCalledOnce();
		view.trigger.remove();
	});
});
