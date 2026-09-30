/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import type * as Misskey from 'misskey-js';
import { apiUrl, url as instanceUrl } from '@@/js/config.js';
import MkAbuseReport from '@/components/MkAbuseReport.vue';
import { i18n } from '@/i18n.js';

const mocks = vi.hoisted(() => ({ api: vi.fn(), apiWithDialog: vi.fn(), routerInit: vi.fn(), fetch: vi.fn(), alert: vi.fn(), me: { token: 'admin-test-token' } as { token: string } | null }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/os.js', () => ({ apiWithDialog: mocks.apiWithDialog, popupMenu: vi.fn(), alert: mocks.alert }));
vi.mock('@/i.js', () => ({ get $i() { return mocks.me; } }));
vi.mock('@/router.js', () => ({ createRouter: () => ({ init: mocks.routerInit }) }));
vi.mock('@/components/global/RouterView.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/MkFolder.vue', async () => {
	const { defineComponent, h } = await import('vue');
	return { default: defineComponent({
		emits: ['opened'],
		setup(_props, { slots, emit }) {
			return () => h('div', [
				h('button', { 'data-testid': 'open-folder', onClick: () => emit('opened') }, slots.label?.()),
				slots.default?.(), slots.footer?.(),
			]);
		},
	}) };
});
vi.mock('@/components/MkButton.vue', () => ({ default: { template: '<button><slot/></button>' } }));
vi.mock('@/components/MkTextarea.vue', () => ({ default: { template: '<textarea/>' } }));

type Report = Misskey.entities.AdminAbuseUserReportsResponse[number];

function makeSnapshotFile(): NonNullable<Report['snapshot']>['files'][number] {
	return { id: 'file1', name: 'original.png', type: 'image/png', size: 1024, url: 'https://files.example/original.png', comment: 'Saved alternative text', sha256: 'a'.repeat(64) };
}

function makeSnapshot(overrides: Partial<NonNullable<Report['snapshot']>> = {}): NonNullable<Report['snapshot']> {
	return {
		version: 1,
		capturedAt: '2026-09-21T00:00:00Z',
		type: 'note',
		sourceUrl: `${instanceUrl}/notes/note1`,
		user: { id: 'target', username: 'original-user', host: 'remote.example', name: 'Original name' },
		content: 'Original content\nSecond line\nThird line\nFinal evidence',
		files: [],
		...overrides,
	};
}

function makeReport(overrides: Partial<Report> = {}): Report {
	return {
		id: 'report1', createdAt: '2026-09-21T00:00:00Z', resolved: false, resolvedAs: null,
		targetUserId: 'target', reporterId: 'reporter', moderationNote: '', forwarded: false,
		targetUser: { id: 'target', username: 'target', host: null },
		reporter: { id: 'reporter', username: 'reporter', host: null },
		reason: 'spam', snapshot: makeSnapshot(), comment: 'Additional explanation',
		...overrides,
	} as Report;
}

function renderReport(report = makeReport()) {
	return render(MkAbuseReport, {
		props: { report },
		global: {
			stubs: {
				MkAcct: { props: ['user'], template: '<span>@{{ user.username }}</span>' },
				MkAvatar: true,
				MkTime: true,
				MkA: { props: ['to'], template: '<a :href="to"><slot/></a>' },
				Mfm: { props: ['text', 'linkNavigationBehavior'], template: '<span :data-navigation="linkNavigationBehavior">{{ text }}</span>' },
			},
			directives: { tooltip: () => {} },
		},
	});
}

async function openReport(view: ReturnType<typeof renderReport>) {
	await fireEvent.click(view.getAllByTestId('open-folder')[0]);
	await nextTick();
}

describe('admin abuse report details', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.me = { token: 'admin-test-token' };
		vi.stubGlobal('fetch', mocks.fetch);
		mocks.api.mockResolvedValue({ id: 'note1', userId: 'target', user: { id: 'target' }, text: 'Reported note text', cw: null, files: [], isHidden: false });
		mocks.apiWithDialog.mockResolvedValue(undefined);
	});
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	test('allows one resolution request and updates the displayed decision only after success', async () => {
		let completeRequest!: () => void;
		mocks.apiWithDialog.mockReturnValue(new Promise<void>(resolve => { completeRequest = resolve; }));
		const view = renderReport();
		const accept = view.getByRole('button', { name: `${i18n.ts._abuseUserReport.resolve} (${i18n.ts._abuseUserReport.accept})` }) as HTMLButtonElement;
		const reject = view.getByRole('button', { name: `${i18n.ts._abuseUserReport.resolve} (${i18n.ts._abuseUserReport.reject})` }) as HTMLButtonElement;
		await fireEvent.click(accept);
		await fireEvent.click(reject);
		expect(accept.disabled).toBe(true);
		expect(reject.disabled).toBe(true);
		expect(mocks.apiWithDialog).toHaveBeenCalledOnce();
		expect(mocks.apiWithDialog).toHaveBeenCalledWith('admin/resolve-abuse-user-report', { reportId: 'report1', resolvedAs: 'accept' });
		expect(view.getByText(i18n.ts.unresolved)).toBeTruthy();
		completeRequest();
		await vi.waitFor(() => expect(view.emitted('resolved')).toEqual([['report1']]));
		expect(view.getByText(`${i18n.ts.resolved} · ${i18n.ts._abuseUserReport.accept}`)).toBeTruthy();
		expect(view.queryByRole('button', { name: `${i18n.ts._abuseUserReport.resolve} (${i18n.ts._abuseUserReport.reject})` })).toBeNull();
	});

	test('keeps resolution available after an API failure without showing a false success', async () => {
		mocks.apiWithDialog.mockRejectedValueOnce({ code: 'REPORT_ALREADY_RESOLVED' });
		const view = renderReport();
		const accept = view.getByRole('button', { name: `${i18n.ts._abuseUserReport.resolve} (${i18n.ts._abuseUserReport.accept})` }) as HTMLButtonElement;
		await fireEvent.click(accept);
		await vi.waitFor(() => expect(accept.disabled).toBe(false));
		expect(view.getByText(i18n.ts.unresolved)).toBeTruthy();
		expect(view.emitted('resolved')).toBeUndefined();
		expect(view.emitted('refresh')).toHaveLength(1);
		await fireEvent.click(accept);
		await vi.waitFor(() => expect(view.emitted('resolved')).toEqual([['report1']]));
	});

	test('blocks repeated forwarding while pending and reflects accepted queueing without a reload', async () => {
		let completeRequest!: () => void;
		mocks.apiWithDialog.mockReturnValue(new Promise<void>(resolve => { completeRequest = resolve; }));
		const view = renderReport(makeReport({ targetUser: { id: 'target', username: 'target', host: 'remote.example' } as Report['targetUser'] }));
		const forward = view.getByRole('button', { name: i18n.ts._abuseUserReport.forward }) as HTMLButtonElement;
		await fireEvent.click(forward);
		await fireEvent.click(forward);
		expect(forward.disabled).toBe(true);
		expect(mocks.apiWithDialog).toHaveBeenCalledOnce();
		expect(mocks.apiWithDialog).toHaveBeenCalledWith('admin/forward-abuse-user-report', { reportId: 'report1' });
		completeRequest();
		await vi.waitFor(() => expect(view.getByRole('button', { name: i18n.ts._abuseUserReport.forwarded })).toBeTruthy());
		expect((view.getByRole('button', { name: i18n.ts._abuseUserReport.forwarded }) as HTMLButtonElement).disabled).toBe(true);
		expect(mocks.apiWithDialog).toHaveBeenCalledOnce();
	});

	test('allows retrying a failed forwarding request without marking it as queued', async () => {
		mocks.apiWithDialog.mockRejectedValueOnce(new Error('queue unavailable'));
		const view = renderReport(makeReport({ targetUser: { id: 'target', username: 'target', host: 'remote.example' } as Report['targetUser'] }));
		const forward = view.getByRole('button', { name: i18n.ts._abuseUserReport.forward }) as HTMLButtonElement;
		await fireEvent.click(forward);
		await vi.waitFor(() => expect(forward.disabled).toBe(false));
		expect(view.queryByRole('button', { name: i18n.ts._abuseUserReport.forwarded })).toBeNull();
		await fireEvent.click(forward);
		await vi.waitFor(() => expect(view.getByRole('button', { name: i18n.ts._abuseUserReport.forwarded })).toBeTruthy());
	});

	test('keeps the snapshot readable after both accounts are deleted without opening live profiles', async () => {
		const view = renderReport(makeReport({ targetUser: null, reporter: null }));
		await openReport(view);
		expect(view.getAllByText('@original-user@remote.example')).toHaveLength(2);
		expect(view.getByText(`${i18n.ts.reporter}: #reporter`)).toBeTruthy();
		expect(view.getByText('Original content Second line Third line Final evidence')).toBeTruthy();
		expect(view.queryByRole('button', { name: i18n.ts._abuseUserReport.forward })).toBeNull();
		expect(mocks.routerInit).not.toHaveBeenCalled();
		expect(mocks.api).not.toHaveBeenCalled();
	});

	test('identifies a deleted target by its saved ID when no snapshot was captured', async () => {
		const view = renderReport(makeReport({ targetUser: null, reporter: null, snapshot: null }));
		await openReport(view);
		expect(view.getByText('#target')).toBeTruthy();
		expect(view.getByText(i18n.ts._abuseUserReport.snapshotUnavailable)).toBeTruthy();
		expect(mocks.routerInit).not.toHaveBeenCalled();
	});

	test.each(['edited', 'deleted'] as const)('retains the complete saved content and author after the original is %s', async state => {
		if (state === 'deleted') mocks.api.mockRejectedValue(new Error('deleted'));
		else mocks.api.mockResolvedValue({ id: 'note1', text: 'Edited content', userId: 'target', files: [] });
		const snapshot = makeSnapshot();
		const view = renderReport(makeReport({ snapshot }));
		await openReport(view);
		expect(mocks.api).not.toHaveBeenCalled();
		expect(view.getByRole('heading', { name: i18n.ts._abuseUserReport.snapshot })).toBeTruthy();
		expect(view.getByText('Original content Second line Third line Final evidence').textContent).toBe(snapshot.content);
		expect(view.getByText('Original name')).toBeTruthy();
		expect(view.getByText('@original-user@remote.example')).toBeTruthy();
		expect(view.container.querySelector(`mk-time-stub[time="${snapshot.capturedAt}"][mode="absolute"]`)).toBeTruthy();
		expect(view.queryByText('Edited content')).toBeNull();
	});

	test('uses the server Boost snapshot instead of the text embedded in the report comment', async () => {
		const view = renderReport(makeReport({
			comment: `${i18n.ts._abuseReport._reasons.spam}\nBoost: Reporter supplied text\nNote: ${instanceUrl}/notes/note1\n-----\n`,
			snapshot: makeSnapshot({ type: 'boost', content: 'Saved Boost text' }),
		}));
		await openReport(view);
		expect(mocks.api).not.toHaveBeenCalled();
		expect(view.getByText('Saved Boost text')).toBeTruthy();
		expect(view.getByText(new RegExp('Reporter supplied text'))).toBeTruthy();
	});

	test('keeps saved evidence separate from an arbitrary report description', async () => {
		const view = renderReport(makeReport({ snapshot: makeSnapshot(), comment: 'Unknown reason\nOriginal description' }));
		await openReport(view);
		expect(mocks.api).not.toHaveBeenCalled();
		expect(view.getByText('Original content Second line Third line Final evidence')).toBeTruthy();
		expect(view.getByText('Unknown reason Original description')).toBeTruthy();
	});

	test('renders archived attachment metadata without linking or automatically fetching original media', async () => {
		const view = renderReport(makeReport({ snapshot: makeSnapshot({
			sourceUrl: 'javascript:alert(1)',
			files: [makeSnapshotFile()],
		}) }));
		await openReport(view);
		expect(view.getByRole('button', { name: `${i18n.ts.download}: original.png` })).toBeTruthy();
		expect(view.getByText('image/png · 1KB')).toBeTruthy();
		expect(view.getByText('Saved alternative text')).toBeTruthy();
		expect(view.getByText('a'.repeat(64))).toBeTruthy();
		expect(view.container.querySelector('a[href]')).toBeNull();
		expect(view.container.querySelector('img, video, audio, iframe')).toBeNull();
		expect(mocks.api).not.toHaveBeenCalled();
		expect(mocks.fetch).not.toHaveBeenCalled();
	});

	test('downloads immutable evidence through the authenticated admin endpoint and revokes its object URL', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout'] });
		const file = makeSnapshotFile();
		const response = new Response(new Blob(['Archived evidence'], { type: file.type }));
		mocks.fetch.mockResolvedValue(response);
		const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:https://example.test/evidence');
		const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
		const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
			expect(this.href).toBe('blob:https://example.test/evidence');
			expect(this.download).toBe('original.png');
		});
		const view = renderReport(makeReport({ snapshot: makeSnapshot({ files: [file] }) }));
		await fireEvent.click(view.getByRole('button', { name: `${i18n.ts.download}: original.png` }));
		await vi.waitFor(() => expect(click).toHaveBeenCalledOnce());
		expect(mocks.fetch).toHaveBeenCalledWith(`${apiUrl}/admin/abuse-report-evidence`, {
			method: 'POST',
			body: JSON.stringify({ reportId: 'report1', fileId: 'file1', i: 'admin-test-token' }),
			credentials: 'omit', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
		});
		expect(await (createUrl.mock.calls[0][0] as Blob).text()).toBe('Archived evidence');
		expect(mocks.fetch.mock.calls[0][0]).not.toContain('admin-test-token');
		expect(view.container.querySelector('a[href*="files.example"]')).toBeNull();
		await vi.runAllTimersAsync();
		expect(revokeUrl).toHaveBeenCalledWith('blob:https://example.test/evidence');
	});

	test('does not request archived evidence without an authenticated account', async () => {
		mocks.me = null;
		const view = renderReport(makeReport({ snapshot: makeSnapshot({ files: [makeSnapshotFile()] }) }));
		const button = view.getByRole('button', { name: `${i18n.ts.download}: original.png` }) as HTMLButtonElement;
		expect(button.disabled).toBe(true);
		await fireEvent.click(button);
		expect(mocks.fetch).not.toHaveBeenCalled();
	});

	test('shows an error and creates no downloadable file when the server rejects access', async () => {
		mocks.fetch.mockResolvedValue(new Response(null, { status: 403 }));
		const createUrl = vi.spyOn(URL, 'createObjectURL');
		const view = renderReport(makeReport({ snapshot: makeSnapshot({ files: [makeSnapshotFile()] }) }));
		await fireEvent.click(view.getByRole('button', { name: `${i18n.ts.download}: original.png` }));
		await vi.waitFor(() => expect(mocks.alert).toHaveBeenCalledWith({ type: 'error', text: i18n.ts._abuseUserReport.evidenceDownloadFailed }));
		expect(createUrl).not.toHaveBeenCalled();
	});

	test.each(['local', 'remote'] as const)('never reconstructs missing snapshots from %s report comments or current content', async source => {
		const report = makeReport({
			snapshot: null,
			reason: null,
			comment: `Spam or advertising\nLocal Note: ${instanceUrl}/notes/note1\n-----\nLegacy explanation`,
			reporter: { id: 'reporter', username: 'reporter', host: source === 'remote' ? 'remote.example' : null } as Report['reporter'],
		});
		const view = renderReport(report);
		await openReport(view);
		expect(mocks.api).not.toHaveBeenCalled();
		expect(view.getByText(i18n.ts._abuseUserReport.snapshotUnavailable)).toBeTruthy();
		expect(view.queryByRole('heading', { name: i18n.ts._abuseUserReport.snapshot })).toBeNull();
		expect(view.queryByText('Reported note text')).toBeNull();
		expect(view.getByText(i18n.ts._abuseUserReport.reasonNotProvided)).toBeTruthy();
		expect(view.getByText(/Legacy explanation/).textContent).toBe(report.comment);
	});

	test('shows the reason code translated independently from the complete description', async () => {
		const description = `User explanation\n${i18n.ts._abuseReport._reasons.spam}\n-----\nNote: arbitrary text`;
		const view = renderReport(makeReport({ reason: 'harassment', comment: description }));
		await openReport(view);
		expect(view.getByText(i18n.ts._abuseReport._reasons.harassment)).toBeTruthy();
		expect(view.getByText(/User explanation/).textContent).toBe(description);
		expect(view.getAllByRole('heading').map(heading => heading.textContent)).toEqual([
			i18n.ts._abuseUserReport.snapshot, i18n.ts._abuseReport.selectReason, i18n.ts._abuseReport.description,
		]);
		expect(mocks.api).not.toHaveBeenCalled();
	});

	test('shows the empty description state without mixing in saved evidence', async () => {
		const view = renderReport(makeReport({ comment: '' }));
		await openReport(view);
		expect(view.getByText(i18n.ts._abuseUserReport.noDescription)).toBeTruthy();
		expect(view.getByText('Original content Second line Third line Final evidence')).toBeTruthy();
	});
});
