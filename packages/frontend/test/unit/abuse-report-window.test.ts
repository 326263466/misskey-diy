/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import type * as Misskey from 'misskey-js';
import MkAbuseReportWindow from '@/components/MkAbuseReportWindow.vue';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({
	apiWithDialog: vi.fn(),
	alert: vi.fn(),
	closeModal: vi.fn(),
	emitModalEvent: null as ((event: 'close' | 'click' | 'esc') => void) | null,
}));
vi.mock('@/os.js', () => ({ apiWithDialog: mocks.apiWithDialog, alert: mocks.alert }));
vi.mock('@/components/MkModalWindow.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({
		emits: ['close', 'closed', 'click', 'esc'],
		setup(_props, { slots, expose, emit }) {
			mocks.emitModalEvent = event => emit(event);
			expose({ close: () => {
				mocks.closeModal();
				emit('closed');
			} });
			return () => h('div', [slots.header?.(), slots.default?.(), slots.footer?.()]);
		},
	}) };
});
vi.mock('@/components/MkButton.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({
		props: { disabled: Boolean, wait: Boolean },
		emits: ['click'],
		setup(props, { slots, emit }) {
			return () => h('button', {
				type: 'button',
				disabled: props.disabled || props.wait,
				onClick: (event: MouseEvent) => emit('click', event),
			}, slots.default?.());
		},
	}) };
});

function renderReport(props: Partial<Pick<InstanceType<typeof MkAbuseReportWindow>['$props'], 'context' | 'reportTarget'>> = {}) {
	return render(MkAbuseReportWindow, {
		props: {
			user: { id: 'reported-user', username: 'reported', host: null } as Misskey.entities.UserLite,
			reportTarget: { reportType: 'user' },
			...props,
		},
		global: { stubs: {
			I18n: { template: '<span><slot name="name"/></span>' },
			MkAcct: { props: ['user'], template: '<span>@{{ user.username }}</span>' },
			Mfm: { props: ['text', 'linkNavigationBehavior'], template: '<span :data-navigation="linkNavigationBehavior">{{ text }}</span>' },
		} },
	});
}

async function selectReason(view: ReturnType<typeof renderReport>, reason = i18n.ts._abuseReport._reasons.spam) {
	await fireEvent.click(view.getByRole('radio', { name: reason }));
}

describe('abuse report form', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.apiWithDialog.mockResolvedValue(undefined);
		mocks.alert.mockResolvedValue(undefined);
	});
	afterEach(cleanup);

	test('identifies the account even when reporting a user without content context', () => {
		const view = renderReport();
		expect(view.getByText(i18n.ts._abuseUserReport.reportedUser)).toBeTruthy();
		expect(view.getByText('@reported')).toBeTruthy();
		expect(view.getByText(i18n.ts._abuseUserReport.accountReportHint)).toBeTruthy();
	});

	test.each(['note', 'chat'] as const)('identifies a %s report as content evidence rather than an account report', async reportType => {
		const view = renderReport({ reportTarget: { reportType, targetId: 'content-id' } });
		expect(view.getByText(i18n.ts._abuseUserReport.contentReportHint)).toBeTruthy();
		expect(view.queryByText(i18n.ts._abuseUserReport.accountReportHint)).toBeNull();
		await selectReason(view);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._abuseReport.submit }));
		expect(mocks.apiWithDialog).toHaveBeenCalledWith('users/report-abuse', expect.objectContaining({ reportType, targetId: 'content-id' }), undefined);
	});

	test('requires a nonblank explanation for the other reason', async () => {
		const view = renderReport();
		await selectReason(view, i18n.ts._abuseReport._reasons.other);
		const button = view.getByRole('button', { name: i18n.ts._abuseReport.submit }) as HTMLButtonElement;
		const detail = view.getByRole('textbox') as HTMLTextAreaElement;
		expect(button.disabled).toBe(true);
		expect(detail.required).toBe(true);
		expect(detail.maxLength).toBe(2048);
		expect(detail.placeholder).toBe(i18n.ts._abuseReport.otherDescriptionHint);
		await fireEvent.update(detail, ' \n\t ');
		await fireEvent.click(button);
		expect(mocks.apiWithDialog).not.toHaveBeenCalled();
		await fireEvent.update(detail, '  Specific violation  ');
		expect(button.disabled).toBe(false);
		await fireEvent.click(button);
		expect(mocks.apiWithDialog).toHaveBeenCalledWith('users/report-abuse', expect.objectContaining({ reason: 'other', comment: 'Specific violation' }), undefined);
	});

	test('blocks duplicate submission and dismissal until success is confirmed, then closes once', async () => {
		let completeRequest!: () => void;
		let confirmSuccess!: () => void;
		mocks.apiWithDialog.mockReturnValue(new Promise<void>(resolve => { completeRequest = resolve; }));
		mocks.alert.mockReturnValue(new Promise<void>(resolve => { confirmSuccess = resolve; }));
		const view = renderReport();
		await selectReason(view);
		const button = view.getByRole('button', { name: i18n.ts._abuseReport.submit }) as HTMLButtonElement;
		await fireEvent.click(button);
		await fireEvent.click(button);
		mocks.emitModalEvent?.('close');
		mocks.emitModalEvent?.('click');
		mocks.emitModalEvent?.('esc');
		expect(mocks.apiWithDialog).toHaveBeenCalledOnce();
		expect(button.disabled).toBe(true);
		expect((view.getByRole('group') as HTMLFieldSetElement).disabled).toBe(true);
		expect((view.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(true);
		expect(mocks.alert).not.toHaveBeenCalled();
		expect(mocks.closeModal).not.toHaveBeenCalled();
		completeRequest();
		await vi.waitFor(() => expect(mocks.alert).toHaveBeenCalledWith({ type: 'success', text: i18n.ts.abuseReported }));
		expect(mocks.closeModal).not.toHaveBeenCalled();
		expect(button.disabled).toBe(true);
		confirmSuccess();
		await vi.waitFor(() => expect(mocks.closeModal).toHaveBeenCalledOnce());
		expect(view.emitted('closed')).toHaveLength(1);
	});

	test('retains the form after API failure and reuses the same request ID for an identical retry', async () => {
		mocks.apiWithDialog.mockRejectedValueOnce(new Error('network failure'));
		const view = renderReport();
		await selectReason(view, i18n.ts._abuseReport._reasons.harassment);
		await fireEvent.update(view.getByRole('textbox'), 'Keep this evidence');
		const button = view.getByRole('button', { name: i18n.ts._abuseReport.submit }) as HTMLButtonElement;
		await fireEvent.click(button);
		await vi.waitFor(() => expect(button.disabled).toBe(false));
		expect((view.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Keep this evidence');
		expect((view.getByRole('radio', { name: i18n.ts._abuseReport._reasons.harassment }) as HTMLInputElement).checked).toBe(true);
		expect(mocks.alert).not.toHaveBeenCalled();
		expect(mocks.closeModal).not.toHaveBeenCalled();
		expect(view.emitted('closed')).toBeUndefined();
		await fireEvent.click(button);
		expect(mocks.apiWithDialog.mock.calls[1][1]).toEqual(mocks.apiWithDialog.mock.calls[0][1]);
	});

	test.each(['reason', 'description', 'target'] as const)('uses a fresh request ID after the %s changes', async field => {
		mocks.apiWithDialog.mockRejectedValue(new Error('network failure'));
		const view = renderReport();
		await selectReason(view);
		const button = view.getByRole('button', { name: i18n.ts._abuseReport.submit }) as HTMLButtonElement;
		await fireEvent.click(button);
		await vi.waitFor(() => expect(button.disabled).toBe(false));
		if (field === 'reason') await selectReason(view, i18n.ts._abuseReport._reasons.harassment);
		if (field === 'description') await fireEvent.update(view.getByRole('textbox'), 'Updated explanation');
		if (field === 'target') await view.rerender({ reportTarget: { reportType: 'note', targetId: 'another-note' } });
		await fireEvent.click(button);
		expect(mocks.apiWithDialog.mock.calls[1][1].requestId).not.toBe(mocks.apiWithDialog.mock.calls[0][1].requestId);
	});

	test.each([
		{ reportType: 'user' },
		{ reportType: 'note', targetId: 'reported-note' },
		{ reportType: 'boost', targetId: 'boost-parent', reaction: 'text:Original Boost\nABC 123' },
		{ reportType: 'chat', targetId: 'reported-message' },
		{ reportType: 'page', targetId: 'reported-page' },
		{ reportType: 'gallery', targetId: 'reported-gallery' },
		{ reportType: 'play', targetId: 'reported-play' },
	] as const)('submits the structured $reportType target with separate reason and description', async reportTarget => {
		const view = renderReport({ reportTarget });
		await selectReason(view);
		await fireEvent.update(view.getByRole('textbox'), '  Report description\n-----\nLocal Note: arbitrary user text  ');
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._abuseReport.submit }));
		expect(mocks.apiWithDialog).toHaveBeenCalledWith('users/report-abuse', {
			userId: 'reported-user', requestId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
			reason: 'spam',
			comment: 'Report description\n-----\nLocal Note: arbitrary user text',
			...reportTarget,
		}, undefined);
	});

	test('shows original context and an empty description with a required report reason', async () => {
		const view = renderReport({
			reportTarget: { reportType: 'note', targetId: 'reported' },
			context: { label: i18n.ts._abuseReport._linkLabels.note, text: 'Original content', url: 'https://example.test/notes/reported' },
		});
		expect((view.getByRole('button', { name: i18n.ts._abuseReport.submit }) as HTMLButtonElement).disabled).toBe(true);
		expect(view.getAllByRole('button')).toHaveLength(1);
		expect(view.getAllByRole('radio')).toHaveLength(6);
		expect(view.queryByRole('radio', { name: i18n.ts._abuseReport._reasons.sensitivePolitics })).toBeNull();
		expect(view.getByRole('dialog', { name: i18n.ts.reportAbuse })).toBeTruthy();
		expect(view.getByText('Original content').closest('textarea, input, [contenteditable="true"]')).toBeNull();
		expect(view.getByText(`${i18n.ts._abuseReport._linkLabels.note}: https://example.test/notes/reported`).getAttribute('data-navigation')).toBe('window');
		const detail = view.getByRole('textbox') as HTMLTextAreaElement;
		expect(detail.value).toBe('');
		expect(detail.placeholder).toBe(i18n.ts._abuseReport.descriptionHint);
		expect(view.getByLabelText(i18n.ts._abuseReport.description)).toBe(detail);
		await selectReason(view);
		expect((view.getByRole('button', { name: i18n.ts._abuseReport.submit }) as HTMLButtonElement).disabled).toBe(false);
		expect(mocks.apiWithDialog).not.toHaveBeenCalled();
	});

	test('shows both source links without storing displayed content in the description', async () => {
		const view = renderReport({
			reportTarget: { reportType: 'note', targetId: 'reported' },
			context: {
				label: i18n.ts._abuseReport._linkLabels.localNote,
				text: 'Displayed remote content',
				url: 'https://example.test/notes/reported',
				sourceUrl: 'https://remote.example/posts/original',
			},
		});
		expect(view.getByText(`${i18n.ts._abuseReport._linkLabels.note}: https://remote.example/posts/original`).getAttribute('data-navigation')).toBe('window');
		expect(view.getByText(`${i18n.ts._abuseReport._linkLabels.localNote}: https://example.test/notes/reported`).getAttribute('data-navigation')).toBe('window');
		await selectReason(view);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._abuseReport.submit }));
		expect(mocks.apiWithDialog).toHaveBeenCalledWith('users/report-abuse', {
			userId: 'reported-user', requestId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i), reportType: 'note', targetId: 'reported', reason: 'spam', comment: '',
		}, undefined);
	});

	test('labels Boost context separately from the parent note and submits the raw reaction', async () => {
		const view = renderReport({
			reportTarget: { reportType: 'boost', targetId: 'parent', reaction: 'text:888' },
			context: { label: i18n.ts._boost.title, text: '888', url: 'https://example.test/notes/parent' },
		});
		expect(view.getByText('888')).toBeTruthy();
		expect(view.getByText(`${i18n.ts._boost.title}: https://example.test/notes/parent`).getAttribute('data-navigation')).toBe('window');
		await selectReason(view);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._abuseReport.submit }));
		expect(mocks.apiWithDialog).toHaveBeenCalledWith('users/report-abuse', {
			userId: 'reported-user', requestId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i), reportType: 'boost', targetId: 'parent', reaction: 'text:888', reason: 'spam', comment: '',
		}, undefined);
	});

	test('preserves the description when changing reasons and keeps both fields separate', async () => {
		const view = renderReport();
		await selectReason(view);
		await fireEvent.update(view.getByRole('textbox'), 'Keep this explanation');
		await selectReason(view, i18n.ts._abuseReport._reasons.harassment);
		expect((view.getByRole('radio', { name: i18n.ts._abuseReport._reasons.spam }) as HTMLInputElement).checked).toBe(false);
		expect((view.getByRole('radio', { name: i18n.ts._abuseReport._reasons.harassment }) as HTMLInputElement).checked).toBe(true);
		expect((view.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Keep this explanation');
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._abuseReport.submit }));
		expect(mocks.apiWithDialog).toHaveBeenCalledWith('users/report-abuse', {
			userId: 'reported-user', requestId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i), reportType: 'user', reason: 'harassment', comment: 'Keep this explanation',
		}, undefined);
	});
});
