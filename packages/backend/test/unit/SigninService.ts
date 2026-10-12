/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { SigninService } from '@/server/api/SigninService.js';

const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

function setup(history: { ip: string; userAgent: string | null }[]) {
	const signins = {
		query: vi.fn().mockResolvedValue(history),
		insertOne: vi.fn(async (record: Record<string, unknown>) => record),
	};
	const profiles = { findOneByOrFail: vi.fn().mockResolvedValue({ email: 'user@example.com', emailVerified: true }) };
	const notifications = { createNotification: vi.fn() };
	const email = { sendEmail: vi.fn() };
	const events = { publishMainStream: vi.fn() };
	const service = new SigninService(
		{ url: 'https://example.com' } as never,
		signins as never,
		profiles as never,
		{ pack: vi.fn().mockResolvedValue({}) } as never,
		email as never,
		notifications as never,
		{ gen: () => 'signin-id' } as never,
		events as never,
	);
	const signin = async (ip: string) => {
		const reply = { code: vi.fn() };
		service.signin({ ip, headers: { 'user-agent': chrome } } as never, reply as never, { id: 'user', token: 'token' } as never);
		await vi.waitFor(() => expect(events.publishMainStream).toHaveBeenCalled());
		await new Promise(resolve => setImmediate(resolve));
	};
	return { signins, notifications, email, signin };
}

describe('SigninService', () => {
	test('先读取历史再写入本次记录，熟悉的设备和网络不提醒', async () => {
		const { signins, notifications, email, signin } = setup([{ ip: '203.0.113.24', userAgent: chrome }]);
		await signin('203.0.200.1');
		expect(signins.query.mock.invocationCallOrder[0]).toBeLessThan(signins.insertOne.mock.invocationCallOrder[0]);
		expect(notifications.createNotification).not.toHaveBeenCalled();
		expect(email.sendEmail).not.toHaveBeenCalled();
	});

	test('首次登录不提醒', async () => {
		const { notifications, email, signin } = setup([]);
		await signin('203.0.113.24');
		expect(notifications.createNotification).not.toHaveBeenCalled();
		expect(email.sendEmail).not.toHaveBeenCalled();
	});

	test('陌生网络登录时发通知和邮件，并带上规范化的 IP', async () => {
		const { notifications, email, signin } = setup([{ ip: '203.0.113.24', userAgent: chrome }]);
		await signin('::ffff:198.51.100.7');
		expect(notifications.createNotification).toHaveBeenCalledExactlyOnceWith('user', 'login', {
			ip: '198.51.100.7', userAgent: chrome, newNetwork: true, newDevice: false,
		});
		expect(email.sendEmail).toHaveBeenCalledOnce();
		const text = email.sendEmail.mock.calls[0][3];
		expect(text).toContain('198.51.100.7');
		expect(text).toContain('Chrome 129 · Windows');
		expect(text).not.toContain(chrome);
	});
});
