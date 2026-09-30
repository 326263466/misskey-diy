/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Readable } from 'node:stream';
import Fastify from 'fastify';
import { describe, expect, test, vi } from 'vitest';
import { ApiCallService } from '@/server/api/ApiCallService.js';
import Logger from '@/logger.js';
import { envOption } from '@/env.js';
import { logManager } from '@/logging/logging-runtime.js';
import { PrettyConsoleBackend } from '@/logging/PrettyConsoleBackend.js';
import type { LogBackend } from '@/logging/LogBackend.js';
import type { LogRecord } from '@/logging/types.js';

/** API失敗ログを確認するための最小Fastify応答を作成します。 */
function createReply() {
	return {
		code: vi.fn(),
		header: vi.fn(),
		send: vi.fn(),
	};
}

/** APIサービスの依存関係を最小限の仮実装へ差し替えます。 */
function createService() {
	const authenticateService = {
		authenticate: vi.fn().mockResolvedValue([null, null]),
	};
	const telemetryService = {
		startSpan: vi.fn((_name: string, callback: () => unknown) => callback()),
		captureMessage: vi.fn(),
	};
	const apiLoggerService = { logger: new Logger('api') };

	const service = new ApiCallService(
		{} as never,
		{} as never,
		{} as never,
		authenticateService as never,
		{} as never,
		{} as never,
		apiLoggerService as never,
		telemetryService as never,
	);
	return { service, telemetryService };
}

describe('ApiCallService structured error logging', () => {
	test('redacts API credentials and serializes the endpoint error', async () => {
		const write = vi.fn<LogBackend['write']>();
		logManager.setBackend({ write });
		const previousQuiet = envOption.quiet;
		envOption.quiet = false;
		const { service, telemetryService } = createService();
		try {
			const reply = createReply();
			const endpoint = {
				name: 'notes/show',
				meta: {},
				params: {},
				exec: vi.fn().mockRejectedValue(new TypeError('broken endpoint')),
			};
			const request = {
				method: 'POST',
				body: {
					i: 'native-token',
					password: 'password',
					options: { visible: true },
				},
				query: {},
				headers: {},
				ip: '127.0.0.1',
			};

			await service.handleRequest(endpoint as never, request as never, reply as never);

			const record = write.mock.calls[0][0] as LogRecord;
			expect(record).toMatchObject({
				eventName: 'api.endpoint.failed',
				attributes: {
					'api.endpoint': 'notes/show',
					'api.params': {
						i: '[REDACTED]',
						password: '[REDACTED]',
						options: { visible: true },
					},
				},
				error: { type: 'TypeError', message: 'broken endpoint' },
			});
			expect(record.attributes?.['error.id']).toEqual(expect.any(String));
			expect(telemetryService.captureMessage.mock.calls[0][1].extra).not.toHaveProperty('ps');
		} finally {
			service.dispose();
			envOption.quiet = previousQuiet;
			logManager.setBackend(new PrettyConsoleBackend({ output: () => undefined }));
		}
	});
});

describe('ApiCallService binary responses', () => {
	test('delivers exact bytes as a private download without content sniffing or caching', async () => {
		const { service } = createService();
		const server = Fastify();
		const original = Buffer.from([0, 255, 42, 128, 13, 10]);
		const endpoint = {
			name: 'binary-test',
			meta: { responseType: 'binary' },
			params: {},
			exec: vi.fn().mockResolvedValue(Readable.from(original)),
		};
		server.post('/evidence', async (request, reply) => {
			await service.handleRequest(endpoint as never, request as never, reply);
			return reply;
		});
		try {
			const response = await server.inject({ method: 'POST', url: '/evidence', payload: {} });
			expect(response.statusCode).toBe(200);
			expect(response.rawPayload).toEqual(original);
			expect(response.headers).toMatchObject({
				'content-type': 'application/octet-stream',
				'content-disposition': 'attachment',
				'cache-control': 'private, no-store',
				'x-content-type-options': 'nosniff',
			});
		} finally {
			await server.close();
			service.dispose();
		}
	});

	test('keeps binary endpoint authentication failures as JSON errors', async () => {
		const { service } = createService();
		const server = Fastify();
		const endpoint = {
			name: 'binary-test',
			meta: { responseType: 'binary', requireCredential: true, kind: 'read:admin:abuse-user-reports' },
			params: {},
			exec: vi.fn(),
		};
		server.post('/evidence', async (request, reply) => {
			await service.handleRequest(endpoint as never, request as never, reply);
			return reply;
		});
		try {
			const response = await server.inject({ method: 'POST', url: '/evidence', payload: {} });
			expect(response.statusCode).toBe(401);
			expect(response.json()).toMatchObject({ error: { code: 'CREDENTIAL_REQUIRED' } });
			expect(response.headers['content-type']).toContain('application/json');
			expect(response.headers['content-disposition']).toBeUndefined();
			expect(endpoint.exec).not.toHaveBeenCalled();
		} finally {
			await server.close();
			service.dispose();
		}
	});
});
