/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import type { Config } from '@/config.js';
import { genOpenapiSpec } from '@/server/api/openapi/gen-spec.js';
import { meta as resolveReportMeta } from '@/server/api/endpoints/admin/resolve-abuse-user-report.js';
import { meta as forwardReportMeta } from '@/server/api/endpoints/admin/forward-abuse-user-report.js';

const spec = genOpenapiSpec({ version: 'test', apiUrl: 'https://example.test/api' } as Config);

describe('OpenAPI endpoint errors', () => {
	test('documents conflicting report decisions as 409 and missing reports as 404', () => {
		const responses = spec.paths['/admin/resolve-abuse-user-report'].post.responses;
		const conflict = responses['409'].content['application/json'];
		expect(conflict.schema).toEqual({ $ref: '#/components/schemas/Error' });
		expect(conflict.examples.REPORT_ALREADY_RESOLVED.value.error).toEqual({
			message: resolveReportMeta.errors.reportAlreadyResolved.message,
			code: 'REPORT_ALREADY_RESOLVED',
			id: resolveReportMeta.errors.reportAlreadyResolved.id,
			kind: 'client',
		});
		expect(responses['404'].content['application/json'].examples.NO_SUCH_ABUSE_REPORT.value.error).toMatchObject({ code: 'NO_SUCH_ABUSE_REPORT', kind: 'server' });
		expect(responses['400'].content['application/json'].examples).not.toHaveProperty('REPORT_ALREADY_RESOLVED');
		expect(responses['400'].content['application/json'].examples).not.toHaveProperty('NO_SUCH_ABUSE_REPORT');
	});

	test('documents temporary forwarding failure as 503 while preserving ordinary errors and success', () => {
		const responses = spec.paths['/admin/forward-abuse-user-report'].post.responses;
		const unavailable = responses['503'].content['application/json'];
		expect(unavailable.schema).toEqual({ $ref: '#/components/schemas/Error' });
		expect(unavailable.examples.REPORT_FORWARD_FAILED.value.error).toEqual({
			message: forwardReportMeta.errors.reportForwardFailed.message,
			code: 'REPORT_FORWARD_FAILED',
			id: forwardReportMeta.errors.reportForwardFailed.id,
			kind: 'server',
		});
		for (const status of ['204', '400', '401', '403', '418', '500']) expect(responses).toHaveProperty(status);
		const clientExamples = responses['400'].content['application/json'].examples;
		expect(clientExamples).toHaveProperty('INVALID_PARAM');
		expect(clientExamples).toHaveProperty('CANNOT_FORWARD_LOCAL_REPORT');
		expect(clientExamples).not.toHaveProperty('REPORT_FORWARD_FAILED');
		expect(responses['500'].content['application/json'].examples).toHaveProperty('INTERNAL_ERROR');
	});

	test('uses ApiError default statuses for permission and server kinds without dropping generic examples', () => {
		const meResponses = spec.paths['/i'].post.responses;
		expect(meResponses['403'].content['application/json'].examples).toHaveProperty('USER_IS_DELETED');
		expect(meResponses['400'].content['application/json'].examples).not.toHaveProperty('USER_IS_DELETED');
		const userResponses = spec.paths['/users/show'].post.responses;
		expect(userResponses['500'].content['application/json'].examples).toHaveProperty('FAILED_TO_RESOLVE_REMOTE_USER');
		expect(userResponses['500'].content['application/json'].examples).toHaveProperty('INTERNAL_ERROR');
		expect(userResponses['400'].content['application/json'].examples).not.toHaveProperty('FAILED_TO_RESOLVE_REMOTE_USER');
	});

	test('retains binary success responses and rate-limit errors alongside declared errors', () => {
		const evidenceResponses = spec.paths['/admin/abuse-report-evidence'].post.responses;
		expect(evidenceResponses['200'].content['application/octet-stream'].schema).toEqual({ type: 'string', format: 'binary' });
		expect(evidenceResponses['401'].content['application/json'].schema).toEqual({ $ref: '#/components/schemas/Error' });
		const reportResponses = spec.paths['/users/report-abuse'].post.responses;
		expect(reportResponses['429'].content['application/json'].examples).toHaveProperty('RATE_LIMIT_EXCEEDED');
	});
});
