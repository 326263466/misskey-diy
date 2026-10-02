/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { SummalyResult } from '@misskey-dev/summaly';
import type { Response } from 'node-fetch';
import type { Config } from '@/config.js';
import type { HttpRequestService } from '@/core/HttpRequestService.js';
import type { LoggerService } from '@/core/LoggerService.js';
import type { UtilityService } from '@/core/UtilityService.js';
import type { MiMeta } from '@/models/Meta.js';
import { UrlPreviewService } from '@/server/web/UrlPreviewService.js';

const summaly = vi.hoisted(() => vi.fn());
vi.mock('@misskey-dev/summaly', () => ({ summaly }));

function summary(): SummalyResult {
	return {
		url: 'https://example.com/article',
		title: 'Example article',
		description: 'An example description',
		icon: 'https://example.com/favicon.ico',
		thumbnail: 'https://example.com/thumbnail.jpg',
		thumbnailStyle: null,
		sitename: 'Example',
		player: { url: null, width: null, height: null },
		sensitive: false,
		activityPub: null,
		fediverseCreator: null,
	};
}

describe('URL preview fetching', () => {
	let server: FastifyInstance;
	let service: UrlPreviewService;
	let meta: MiMeta;
	const send = vi.fn();
	const httpAgent = {};
	const httpsAgent = {};

	beforeEach(async () => {
		vi.stubGlobal('_SUMMALY_VERSION_', 'test');
		summaly.mockReset().mockResolvedValue(summary());
		send.mockReset();
		meta = {
			urlPreviewEnabled: true,
			urlPreviewAllowRedirect: true,
			urlPreviewTimeout: 10000,
			urlPreviewMaximumContentLength: 10 * 1024 * 1024,
			urlPreviewRequireContentLength: false,
			urlPreviewSummaryProxyUrl: null,
			urlPreviewUserAgent: null,
			urlPreviewSensitiveList: [],
		} as unknown as MiMeta;
		service = new UrlPreviewService(
			{ url: 'https://misskey.example', mediaProxy: 'https://media.example' } as Config,
			meta,
			{ httpAgent, httpsAgent, send } as unknown as HttpRequestService,
			{ isKeyWordIncluded: vi.fn().mockReturnValue(false) } as unknown as UtilityService,
			{ getLogger: () => ({ info: vi.fn(), succ: vi.fn(), warn: vi.fn() }) } as unknown as LoggerService,
		);
		server = Fastify();
		server.get<{ Querystring: { url: string; lang?: string } }>('/url', (request, reply) => service.handle(request, reply));
		await server.ready();
	});

	afterEach(async () => {
		await server.close();
		service.dispose();
		vi.unstubAllGlobals();
	});

	function preview(lang = 'en-US') {
		return server.inject({ method: 'GET', url: '/url', query: { url: 'https://example.com/article', lang } });
	}

	test('fetches directly without a summary proxy and retains the configured agents and limits', async () => {
		const response = await preview('zh-TW');

		expect(response.statusCode).toBe(200);
		expect(summaly).toHaveBeenCalledExactlyOnceWith('https://example.com/article', expect.objectContaining({
			lang: 'zh-TW',
			agent: { http: httpAgent, https: httpsAgent },
			followRedirects: true,
			operationTimeout: 10000,
			contentLengthLimit: 10 * 1024 * 1024,
			contentLengthRequired: false,
		}));
		expect(send).not.toHaveBeenCalled();
	});

	test('does not cache a temporary failure and allows the next request to recover', async () => {
		summaly.mockRejectedValueOnce(new Error('upstream timeout'));
		const failed = await preview();

		expect(failed.statusCode).toBe(422);
		expect(failed.headers['cache-control']).toBe('no-store');
		expect(failed.json()).toMatchObject({ error: { code: 'URL_PREVIEW_FAILED' } });
		expect(failed.body).not.toContain('upstream timeout');

		const recovered = await preview();
		expect(recovered.statusCode).toBe(200);
		expect(recovered.json()).toMatchObject({ title: 'Example article' });
		expect(summaly).toHaveBeenCalledTimes(2);
	});

	test('fills an empty page description from the homepage without replacing the page title or URL', async () => {
		summaly.mockResolvedValueOnce({ ...summary(), description: '  ', sitename: 'example.com' });
		summaly.mockResolvedValueOnce({ ...summary(), url: 'https://example.com/', title: 'Example homepage', sitename: 'Example community', description: 'About this community' });

		const response = await preview();
		expect(response.json()).toMatchObject({ url: summary().url, title: summary().title, sitename: 'Example community', description: 'About this community' });
		expect(summaly).toHaveBeenNthCalledWith(2, 'https://example.com/', expect.objectContaining({ lang: 'en-US' }));
	});

	test('retains the original preview if the homepage lookup fails', async () => {
		summaly.mockResolvedValueOnce({ ...summary(), description: null });
		summaly.mockRejectedValueOnce(new Error('homepage unavailable'));

		const response = await preview();
		expect(response.statusCode).toBe(200);
		expect(response.json()).toMatchObject({ title: summary().title, description: null });
	});

	test('uses the configured proxy for homepage fallback too', async () => {
		meta.urlPreviewSummaryProxyUrl = 'https://summary.example';
		send.mockResolvedValueOnce({ json: async () => ({ ...summary(), description: null }) });
		send.mockResolvedValueOnce({ json: async () => ({ ...summary(), url: 'https://example.com/', description: 'Website information' }) });

		expect((await preview()).json().description).toBe('Website information');
		expect(new URL(send.mock.calls[1][0]).searchParams.get('url')).toBe('https://example.com/');
		expect(summaly).not.toHaveBeenCalled();
	});

	test('does not copy information from a homepage redirected to a different site', async () => {
		summaly.mockResolvedValueOnce({ ...summary(), description: null });
		summaly.mockResolvedValueOnce({ ...summary(), url: 'https://other.example/', description: 'Another site' });

		expect((await preview()).json().description).toBeNull();
	});

	test('does not fetch the homepage again when the link already points to it', async () => {
		summaly.mockResolvedValueOnce({ ...summary(), url: 'https://example.com/', description: null });
		await server.inject({ method: 'GET', url: '/url', query: { url: 'https://example.com/' } });
		expect(summaly).toHaveBeenCalledTimes(1);
	});

	test('uses the final destination homepage for a redirected link', async () => {
		summaly.mockResolvedValueOnce({ ...summary(), url: 'https://destination.example/post', description: null });
		summaly.mockResolvedValueOnce({ ...summary(), url: 'https://destination.example/', description: 'Destination website' });

		expect((await preview()).json().description).toBe('Destination website');
		expect(summaly).toHaveBeenNthCalledWith(2, 'https://destination.example/', expect.anything());
	});

	test('defaults preview requests without a language to Simplified Chinese', async () => {
		await server.inject({ method: 'GET', url: '/url', query: { url: 'https://example.com/article' } });
		expect(summaly).toHaveBeenCalledWith('https://example.com/article', expect.objectContaining({ lang: 'zh-CN' }));
	});

	test('still caches successful previews without wrapping media URLs more than once', async () => {
		const first = await preview();
		const second = await preview();

		expect(first.headers['cache-control']).toBe('max-age=86400, immutable');
		expect(second.json()).toEqual(first.json());
		expect(new URL(first.json().thumbnail).searchParams.get('url')).toBe(summary().thumbnail);
		expect(summaly).toHaveBeenCalledTimes(1);
	});

	test('uses the configured preview timeout when a summary proxy is selected', async () => {
		meta.urlPreviewSummaryProxyUrl = 'https://summary.example';
		meta.urlPreviewTimeout = 15000;
		send.mockResolvedValue({ json: async () => summary() } as Response);

		const response = await preview();

		expect(response.statusCode).toBe(200);
		expect(summaly).not.toHaveBeenCalled();
		expect(send).toHaveBeenCalledExactlyOnceWith(expect.any(String), {
			headers: { Accept: 'application/json, */*' },
			timeout: 15000,
			size: 1024 * 256,
			isLocalAddressAllowed: true,
		});
		const proxyUrl = new URL(send.mock.calls[0][0]);
		expect(proxyUrl.origin).toBe('https://summary.example');
		expect(proxyUrl.searchParams.get('operationTimeout')).toBe('15000');
	});

	test('does not cache proxy failures or bypass an explicitly selected proxy', async () => {
		meta.urlPreviewSummaryProxyUrl = 'https://summary.example';
		send.mockRejectedValueOnce(new Error('proxy unavailable'));
		send.mockResolvedValueOnce({ json: async () => summary() } as Response);

		const failed = await preview();
		expect(failed.statusCode).toBe(422);
		expect(failed.headers['cache-control']).toBe('no-store');
		expect((await preview()).statusCode).toBe(200);
		expect(send).toHaveBeenCalledTimes(2);
		expect(summaly).not.toHaveBeenCalled();
	});

	test.each([
		{ url: 'file:///private' },
		{ player: { url: 'javascript:alert(1)', width: null, height: null } },
	])('continues to reject unsafe summary URLs', async (unsafe) => {
		summaly.mockResolvedValueOnce({ ...summary(), ...unsafe });
		const response = await preview();

		expect(response.statusCode).toBe(422);
		expect(response.headers['cache-control']).toBe('no-store');
	});
});
