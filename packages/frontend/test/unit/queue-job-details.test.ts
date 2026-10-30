/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { ref } from 'vue';
import locales from 'i18n';
import type * as Misskey from 'misskey-js';
import JobDetails from '@/pages/admin/job-queue.job-details.vue';
import JobQueue from '@/pages/admin/job-queue.vue';
import { i18n, updateI18n } from '@/i18n.js';
import { DI } from '@/di.js';

const mocks = vi.hoisted(() => ({ api: vi.fn(), confirm: vi.fn(), toast: vi.fn(), apiWithDialog: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/os.js', () => ({ confirm: mocks.confirm, toast: mocks.toast, apiWithDialog: mocks.apiWithDialog }));
vi.mock('@/components/MkButton.vue', () => ({ default: { props: ['disabled', 'wait'], template: '<button type="button" :disabled="disabled || wait"><slot/></button>' } }));
vi.mock('@/components/MkTabs.vue', () => ({
	default: {
		props: ['tab', 'tabs'],
		emits: ['update:tab'],
		template: '<div role="tablist"><button v-for="item in tabs" :key="item.key" type="button" role="tab" :aria-selected="tab === item.key" @click="$emit(\'update:tab\', item.key)">{{ item.title }}</button></div>',
	},
}));
vi.mock('@/components/MkFolder.vue', () => ({ default: {
	props: ['defaultOpen'], emits: ['opened', 'closed'],
	data(this: { defaultOpen?: boolean }) { return { opened: Boolean(this.defaultOpen), openedAtLeastOnce: Boolean(this.defaultOpen) }; },
	template: '<section><button type="button" @click="openedAtLeastOnce = true; opened = !opened; $emit(opened ? \'opened\' : \'closed\')"><slot name="label"/></button><div v-if="openedAtLeastOnce" v-show="opened"><slot name="header"/><slot/><slot name="footer"/></div></section>',
} }));
vi.mock('@/components/MkCode.vue', () => ({ default: { props: ['code'], template: '<pre>{{ code }}</pre>' } }));
vi.mock('@/components/MkKeyValue.vue', () => ({ default: { template: '<dl><dt><slot name="key"/></dt><dd><slot name="value"/></dd></dl>' } }));
vi.mock('@/components/MkTl.vue', () => ({ default: { props: ['events'], template: '<div><div v-for="item in events" :key="item.id"><slot name="right" :event="item.data"/></div></div>' } }));
vi.mock('@/components/MkInput.vue', () => ({ default: { props: ['modelValue'], emits: ['update:modelValue'], template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"/>' } }));
vi.mock('@/pages/admin/job-queue.chart.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/page.js', () => ({ definePage: vi.fn() }));
vi.mock('@@/js/use-interval.js', () => ({ useInterval: vi.fn() }));

function job(patch: Record<string, unknown> = {}): Misskey.entities.QueueJob {
	return {
		id: 'job-1', name: 'Original job', data: { value: 'old' }, opts: { attempts: 3 },
		timestamp: 1000, processedOn: 2000, finishedOn: 3000, progress: 100,
		attempts: 1, delay: 0, failedReason: '', stacktrace: [], returnValue: null, isFailed: false,
		...patch,
	} as unknown as Misskey.entities.QueueJob;
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>(done => { resolve = done; });
	return { promise, resolve };
}

function details(currentJob = job(), options: { visible?: boolean; pageActive?: ReturnType<typeof ref<boolean>> } = {}) {
	const updated = vi.fn();
	const removed = vi.fn();
	const busyChanged = vi.fn();
	const view = render(JobDetails, {
		props: { job: currentJob, queueType: 'db', visible: options.visible, onUpdated: updated, onRemoved: removed, onBusyChanged: busyChanged },
		global: { provide: options.pageActive ? { [DI.pageActive]: options.pageActive } : {}, stubs: { MkTime: { props: ['time'], template: '<time>{{ time }}</time>' } } },
	});
	return { ...view, updated, removed, busyChanged };
}

beforeEach(() => {
	updateI18n(locales['zh-CN']);
	mocks.api.mockReset();
	mocks.confirm.mockReset().mockResolvedValue({ canceled: false });
	mocks.toast.mockReset();
	mocks.apiWithDialog.mockReset();
});

afterEach(() => {
	cleanup();
	updateI18n(locales['en-US']);
});

describe('queue job details', () => {
	test('automatically loads logs and distinguishes loading, empty, failure and log contents', async () => {
		const pending = deferred<string[]>();
		mocks.api.mockReturnValueOnce(pending.promise);
		const view = details();
		expect(mocks.api).not.toHaveBeenCalled();
		await fireEvent.click(view.getByRole('tab', { name: i18n.ts._queue.logs }));
		expect(mocks.api).toHaveBeenCalledWith('admin/queue/show-job-logs', { queue: 'db', jobId: 'job-1' }, undefined, expect.any(AbortSignal));
		expect(view.getByRole('status').textContent).toContain(i18n.ts.loading);
		pending.resolve([]);
		await waitFor(() => expect(view.getByRole('status').textContent).toContain(i18n.ts._queue.noLogs));
		expect(view.getByText(i18n.ts._queue.noLogsDescription)).toBeTruthy();

		mocks.api.mockRejectedValueOnce(new Error('Log request failed'));
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._queue.loadLogs }));
		await waitFor(() => expect(view.getByRole('alert').textContent).toBe(i18n.ts._queue.logsLoadFailed));
		expect(view.queryByText(i18n.ts._queue.noLogs)).toBeNull();

		mocks.api.mockResolvedValueOnce(['worker started', 'worker finished']);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._queue.loadLogs }));
		await waitFor(() => expect(view.getByText('worker finished')).toBeTruthy());
		expect(view.queryByRole('alert')).toBeNull();
	});

	test('refresh emits confirmed details, refreshes the active logs and retains them on a later failure', async () => {
		const refreshed = job({ name: 'Refreshed job', data: { value: 'new' } });
		mocks.api.mockResolvedValueOnce(['old log']);
		const view = details();
		await fireEvent.click(view.getByRole('tab', { name: i18n.ts._queue.logs }));
		await waitFor(() => expect(view.getByText('old log')).toBeTruthy());
		mocks.api.mockResolvedValueOnce(refreshed).mockResolvedValueOnce(['new log']);
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._queue.refreshView }));
		await waitFor(() => expect(view.getByRole('status').textContent).toBe(i18n.ts._queue.refreshed));
		expect(view.updated).toHaveBeenCalledWith(refreshed);
		expect(view.getByText('Refreshed job')).toBeTruthy();
		expect(view.getByText('new log')).toBeTruthy();
		expect(mocks.api.mock.calls.map(([endpoint]) => endpoint)).toEqual([
			'admin/queue/show-job-logs', 'admin/queue/show-job', 'admin/queue/show-job-logs',
		]);

		mocks.api.mockRejectedValueOnce(new Error('Refresh failed'));
		await fireEvent.click(view.getByRole('button', { name: i18n.ts._queue.refreshView }));
		await waitFor(() => expect(view.getByRole('alert').textContent).toBe(i18n.ts._queue.refreshFailed));
		expect(view.updated).toHaveBeenCalledOnce();
		expect(view.getByText('Refreshed job')).toBeTruthy();
		expect(view.getByText('new log')).toBeTruthy();
	});

	test.each(['finished', 'delayed'] as const)('%s retry waits for confirmation and the mutation before refreshing, without duplicate submissions', async state => {
		const current = state === 'finished' ? job({ delay: 5000 }) : job({ finishedOn: undefined, delay: 5000, isFailed: true });
		const confirmed = deferred<{ canceled: boolean }>();
		const mutation = deferred<void>();
		const waiting = job({ name: 'Waiting job', finishedOn: undefined, processedOn: undefined, progress: 0 });
		mocks.confirm.mockReturnValueOnce(confirmed.promise);
		mocks.api.mockReturnValueOnce(mutation.promise).mockResolvedValueOnce(waiting);
		const view = details(current);
		const button = view.getByRole('button', { name: state === 'finished' ? i18n.ts.retry : i18n.ts._queue.promoteJob });
		await fireEvent.click(button);
		await fireEvent.click(button);
		expect(mocks.confirm).toHaveBeenCalledOnce();
		expect(mocks.api).not.toHaveBeenCalled();
		expect((button as HTMLButtonElement).disabled).toBe(true);
		expect(view.busyChanged.mock.calls.map(([value]) => value)).toEqual([false, true]);
		confirmed.resolve({ canceled: false });
		await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('admin/queue/retry-job', { queue: 'db', jobId: 'job-1' }));
		expect(mocks.api).toHaveBeenCalledOnce();
		expect(view.updated).not.toHaveBeenCalled();
		mutation.resolve();
		await waitFor(() => expect(view.updated).toHaveBeenCalledWith(waiting));
		await waitFor(() => expect(view.getByRole('status').textContent).toBe(i18n.ts._queue.jobsPromoted));
		expect(mocks.api.mock.calls.map(([endpoint]) => endpoint)).toEqual(['admin/queue/retry-job', 'admin/queue/show-job']);
		expect(view.getByText('Waiting job')).toBeTruthy();
		expect((view.getByRole('button', { name: i18n.ts._queue.promoteJob }) as HTMLButtonElement).disabled).toBe(true);
		expect(view.busyChanged.mock.calls.map(([value]) => value)).toEqual([false, true, false]);
		view.unmount();
		expect(view.busyChanged.mock.lastCall).toEqual([false]);
	});

	test.each(['mutation', 'refresh'] as const)('shows an inline %s failure without replacing the confirmed job or reporting success', async failure => {
		if (failure === 'mutation') mocks.api.mockRejectedValueOnce(new Error('Retry rejected'));
		else mocks.api.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Refresh rejected'));
		const view = details();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.retry }));
		await waitFor(() => expect(view.getByRole('alert').textContent).toBe(failure === 'mutation' ? i18n.ts._queue.operationFailed : i18n.ts._queue.operationRefreshFailed));
		expect(view.updated).not.toHaveBeenCalled();
		expect(view.getByText('Original job')).toBeTruthy();
		expect(view.queryByRole('status')).toBeNull();
		expect((view.getByRole('button', { name: i18n.ts.retry }) as HTMLButtonElement).disabled).toBe(failure === 'refresh');
	});

	test.each([undefined, 2000])('does not allow waiting or active jobs to retry even with an earlier failure (%s)', async processedOn => {
		const view = details(job({ finishedOn: undefined, processedOn, isFailed: true, failedReason: 'Earlier attempt failed' }));
		expect(view.getByText(processedOn == null ? i18n.ts._queue.waiting : i18n.ts._queue.active)).toBeTruthy();
		const button = view.getByRole('button', { name: i18n.ts._queue.promoteJob });
		expect((button as HTMLButtonElement).disabled).toBe(true);
		await fireEvent.click(button);
		expect(mocks.confirm).not.toHaveBeenCalled();
		expect(mocks.api).not.toHaveBeenCalled();
	});

	test('canceling a retry never mutates or refreshes the job', async () => {
		mocks.confirm.mockResolvedValueOnce({ canceled: true });
		const view = details();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.retry }));
		await waitFor(() => expect((view.getByRole('button', { name: i18n.ts.retry }) as HTMLButtonElement).disabled).toBe(false));
		expect(mocks.confirm).toHaveBeenCalledOnce();
		expect(mocks.api).not.toHaveBeenCalled();
		expect(view.updated).not.toHaveBeenCalled();
	});

	test('canceling or failing a deletion keeps the job; only an awaited success emits removal', async () => {
		mocks.confirm.mockResolvedValueOnce({ canceled: true });
		const view = details();
		const button = view.getByRole('button', { name: i18n.ts._queue.removeJob });
		await fireEvent.click(button);
		await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
		expect(mocks.api).not.toHaveBeenCalled();
		expect(view.removed).not.toHaveBeenCalled();

		mocks.api.mockRejectedValueOnce(new Error('Delete rejected'));
		await fireEvent.click(button);
		await waitFor(() => expect(view.getByRole('alert').textContent).toBe(i18n.ts._queue.operationFailed));
		expect(view.removed).not.toHaveBeenCalled();
		expect(view.getByText('Original job')).toBeTruthy();

		const mutation = deferred<void>();
		mocks.api.mockReturnValueOnce(mutation.promise);
		await fireEvent.click(button);
		await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(2));
		await fireEvent.click(button);
		expect(view.removed).not.toHaveBeenCalled();
		expect(mocks.confirm).toHaveBeenCalledTimes(3);
		mutation.resolve();
		await waitFor(() => expect(view.removed).toHaveBeenCalledWith('job-1'));
		expect(view.getByRole('status').textContent).toBe(i18n.ts.deleteSucceeded);
		expect(mocks.api.mock.calls.map(([endpoint]) => endpoint)).toEqual(['admin/queue/remove-job', 'admin/queue/remove-job']);
		expect((button as HTMLButtonElement).disabled).toBe(true);
	});

	test('hiding logs cancels requests and ignores late results before reloading on activation', async () => {
		const active = ref(true);
		const first = deferred<string[]>();
		mocks.api.mockReturnValueOnce(first.promise);
		const view = details(job(), { visible: false, pageActive: active });
		await fireEvent.click(view.getByRole('tab', { name: i18n.ts._queue.logs }));
		expect(mocks.api).not.toHaveBeenCalled();
		await view.rerender({ visible: true });
		await waitFor(() => expect(mocks.api).toHaveBeenCalledOnce());
		const signal = mocks.api.mock.calls[0][3] as AbortSignal;
		active.value = false;
		await waitFor(() => expect(signal.aborted).toBe(true));
		first.resolve(['late log']);
		await Promise.resolve();
		expect(view.queryByText('late log')).toBeNull();
		mocks.api.mockResolvedValueOnce(['fresh log']);
		active.value = true;
		await waitFor(() => expect(view.getByText('fresh log')).toBeTruthy());
	});

	test.each(['visibility', 'activation'] as const)('ignores a detail response from before %s changed', async change => {
		const active = ref(true);
		const pending = deferred<Misskey.entities.QueueJob>();
		mocks.api.mockReturnValueOnce(pending.promise);
		const view = details(job(), { pageActive: active });
		const refreshButton = view.getByRole('button', { name: i18n.ts._queue.refreshView });
		await fireEvent.click(refreshButton);
		expect(mocks.api).toHaveBeenCalledWith('admin/queue/show-job', { queue: 'db', jobId: 'job-1' });
		if (change === 'visibility') await view.rerender({ visible: false });
		else active.value = false;
		await waitFor(() => expect((refreshButton as HTMLButtonElement).disabled).toBe(true));
		active.value = true;
		await view.rerender({ visible: true, job: job({ name: 'Latest job' }) });
		pending.resolve(job({ name: 'Stale job' }));
		await waitFor(() => expect((refreshButton as HTMLButtonElement).disabled).toBe(false));
		expect(view.getByText('Latest job')).toBeTruthy();
		expect(view.queryByText('Stale job')).toBeNull();
		expect(view.updated).not.toHaveBeenCalled();
		expect(view.queryByRole('status')).toBeNull();
	});

	test.each(['target', 'visibility'] as const)('does not submit a confirmed action after its %s changed', async change => {
		const confirmation = deferred<{ canceled: boolean }>();
		mocks.confirm.mockReturnValueOnce(confirmation.promise);
		const view = details();
		await fireEvent.click(view.getByRole('button', { name: i18n.ts.retry }));
		await view.rerender(change === 'target' ? { job: job({ id: 'job-2' }), queueType: 'inbox' } : { visible: false });
		confirmation.resolve({ canceled: false });
		await waitFor(() => expect(view.busyChanged.mock.lastCall).toEqual([false]));
		expect(mocks.api).not.toHaveBeenCalled();
	});
});

async function queuePage() {
	let jobs = [job()];
	const stats = {
		name: 'db', isPaused: false, qualifiedName: 'db',
		counts: { active: 0, delayed: 0, wait: 0 }, metrics: { completed: { data: [] }, failed: { data: [] } },
		db: { processId: 1, port: 6379, runId: 'redis', clients: { connected: 1, blocked: 0 }, memory: { peak: 0, total: 0, used: 0 }, uptime: 1 },
	};
	mocks.api.mockImplementation((endpoint: string) => {
		if (endpoint === 'admin/queue/queues') return Promise.resolve([]);
		if (endpoint === 'admin/queue/queue-stats') return Promise.resolve(stats);
		if (endpoint === 'admin/queue/jobs') return Promise.resolve([...jobs]);
		if (endpoint === 'admin/queue/show-job') return Promise.resolve(jobs[0]);
		if (endpoint === 'admin/queue/remove-job') { jobs = []; return Promise.resolve(); }
		return Promise.resolve([]);
	});
	mocks.apiWithDialog.mockImplementation(async () => { jobs = []; });
	const view = render(JobQueue, {
		global: { stubs: {
			PageWithHeader: {
				props: ['tab', 'tabs'], emits: ['update:tab'],
				template: '<main><div><button v-for="item in tabs" :key="item.key" type="button" @click="$emit(\'update:tab\', item.key)">{{ item.title }}</button></div><slot/></main>',
			},
			MkTime: { props: ['time'], template: '<time>{{ time }}</time>' },
			MkLoading: { template: '<p>loading</p>' },
			MkError: { template: '<p>error</p>' },
		} },
	});
	await fireEvent.click(view.getByRole('button', { name: i18n.ts._queue._types.db }));
	await waitFor(() => expect(view.getByRole('button', { name: /#job-1/ })).toBeTruthy());
	return { view, setJobs: (items: Misskey.entities.QueueJob[]) => { jobs = items; } };
}

describe('actual queue page wiring', () => {
	test('disables bulk deletion with a search and cancels confirmation when the filter changes', async () => {
		const { view } = await queuePage();
		const deletion = view.getAllByRole('button', { name: i18n.ts._queue.removeJobs }).at(-1)!;
		await fireEvent.update(view.getByRole('searchbox'), 'job');
		expect((deletion as HTMLButtonElement).disabled).toBe(true);
		await fireEvent.click(deletion);
		expect(mocks.confirm).not.toHaveBeenCalled();
		expect(mocks.apiWithDialog).not.toHaveBeenCalled();
		await fireEvent.update(view.getByRole('searchbox'), '');
		const pending = deferred<{ canceled: boolean }>();
		mocks.confirm.mockReturnValueOnce(pending.promise);
		await fireEvent.click(deletion);
		expect(mocks.confirm.mock.lastCall?.[0].text).toContain(i18n.ts._queue._types.db);
		await fireEvent.click(view.getByRole('tab', { name: i18n.ts._queue.failed }));
		pending.resolve({ canceled: false });
		await waitFor(() => expect((deletion as HTMLButtonElement).disabled).toBe(false));
		expect(mocks.apiWithDialog).not.toHaveBeenCalled();
	});

	test('awaits a single bulk mutation before refreshing and keeps the list on failure', async () => {
		const { view } = await queuePage();
		const pending = deferred<void>();
		mocks.apiWithDialog.mockReturnValueOnce(pending.promise);
		const before = mocks.api.mock.calls.filter(([endpoint]) => endpoint === 'admin/queue/jobs').length;
		const deletion = view.getAllByRole('button', { name: i18n.ts._queue.removeJobs }).at(-1)!;
		await fireEvent.click(deletion);
		await waitFor(() => expect(mocks.apiWithDialog).toHaveBeenCalledOnce());
		await fireEvent.click(deletion);
		expect(mocks.apiWithDialog).toHaveBeenCalledExactlyOnceWith('admin/queue/clear', { queue: 'db', state: '*' });
		expect(mocks.api.mock.calls.filter(([endpoint]) => endpoint === 'admin/queue/jobs')).toHaveLength(before);
		pending.resolve();
		await waitFor(() => expect(mocks.api.mock.calls.filter(([endpoint]) => endpoint === 'admin/queue/jobs')).toHaveLength(before + 1));
		await waitFor(() => expect((deletion as HTMLButtonElement).disabled).toBe(false));
		mocks.apiWithDialog.mockRejectedValueOnce(new Error('Clear failed'));
		await fireEvent.click(deletion);
		await waitFor(() => expect((deletion as HTMLButtonElement).disabled).toBe(false));
		expect(mocks.api.mock.calls.filter(([endpoint]) => endpoint === 'admin/queue/jobs')).toHaveLength(before + 1);
		expect(view.getByRole('button', { name: /#job-1/ })).toBeTruthy();
	});

	test('uses the real job wrapper to refresh details and remove a job only after success', async () => {
		const { view, setJobs } = await queuePage();
		await fireEvent.click(view.getByRole('button', { name: /#job-1/ }));
		expect(view.queryByRole('tab', { name: i18n.ts._queue.dataEdit })).toBeNull();
		setJobs([job({ name: 'Updated job' })]);
		await fireEvent.click(view.getAllByRole('button', { name: i18n.ts._queue.refreshView })[0]);
		await waitFor(() => expect(view.getByRole('button', { name: /#job-1 Updated job/ })).toBeTruthy());
		const deletion = view.getAllByRole('button', { name: i18n.ts._queue.removeJobs }).at(-1)!;
		const pending = deferred<{ canceled: boolean }>();
		mocks.confirm.mockReturnValueOnce(pending.promise);
		await fireEvent.click(view.getAllByRole('button', { name: i18n.ts._queue.removeJob })[0]);
		expect((deletion as HTMLButtonElement).disabled).toBe(true);
		pending.resolve({ canceled: false });
		await waitFor(() => expect(view.queryByRole('button', { name: /#job-1/ })).toBeNull());
	});
});
