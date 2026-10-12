/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { assessSigninRisk, getDeviceKey, getNetworkKey, normalizeIp } from '@/misc/signin-risk.js';

const chrome = (version: number) => `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version}.0.0.0 Safari/537.36`;
const firefox = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0';

describe('登录风险判断', () => {
	const history = [{ ip: '203.0.113.24', userAgent: chrome(128) }];

	test('没有成功登录记录时视为首次登录，不提醒', () => {
		expect(assessSigninRisk({ ip: '198.51.100.7', userAgent: firefox }, [])).toBeNull();
	});

	test('同一网段的同一设备不提醒，浏览器升级也不算新设备', () => {
		expect(assessSigninRisk({ ip: '203.0.200.1', userAgent: chrome(129) }, history)).toBeNull();
	});

	test('网络或设备任一陌生都提醒，并标明原因', () => {
		expect(assessSigninRisk({ ip: '198.51.100.7', userAgent: chrome(129) }, history)).toEqual({ newNetwork: true, newDevice: false });
		expect(assessSigninRisk({ ip: '203.0.113.24', userAgent: firefox }, history)).toEqual({ newNetwork: false, newDevice: true });
		expect(assessSigninRisk({ ip: '198.51.100.7', userAgent: null }, history)).toEqual({ newNetwork: true, newDevice: true });
	});
});

describe('网络和设备归类', () => {
	test('IPv4 按 /16、IPv6 按 /64 归为同一网络，IPv4 映射地址按 IPv4 处理', () => {
		expect(getNetworkKey('203.0.113.24')).toBe(getNetworkKey('203.0.1.1'));
		expect(getNetworkKey('203.0.113.24')).not.toBe(getNetworkKey('203.1.113.24'));
		expect(getNetworkKey('2001:db8:85a3:1::1')).toBe(getNetworkKey('2001:db8:85a3:1:ffff::2'));
		expect(getNetworkKey('2001:db8:85a3:1::1')).not.toBe(getNetworkKey('2001:db8:85a3:2::1'));
		expect(getNetworkKey('::ffff:203.0.113.24')).toBe(getNetworkKey('203.0.113.24'));
	});

	test('App 升级、构建号和网络类型变化不算新设备，换浏览器才算', () => {
		const wechat = (version: string, build: string, netType: string) => `Mozilla/5.0 (Linux; Android 14; V2309A Build/${build}; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36 XWEB/1160117 MMWEBSDK/20240404 MMWEBID/1234 MicroMessenger/${version} WeChat/arm64 Weixin NetType/${netType} Language/zh_CN ABI/arm64`;
		expect(getDeviceKey(wechat('8.0.49.2600(0x2800313B)', 'UP1A.231005.007', 'WIFI'))).toBe(getDeviceKey(wechat('8.0.50.2701(0x28003253)', 'AP3A.240905.015', '4G')));
		expect(getDeviceKey(chrome(128))).not.toBe(getDeviceKey(firefox));
		expect(getDeviceKey('ExampleApp/1.2.3 (0x1800322c) abcdef1234')).toBe(getDeviceKey('ExampleApp/1.3.0 (0x18003137) 99887766aa'));
	});

	test('只接受合法 IP，伪造的转发头内容不会原样展示', () => {
		expect(normalizeIp('::ffff:203.0.113.24')).toBe('203.0.113.24');
		expect(normalizeIp('2001:0db8:0000:0000:0000:0000:0000:0001')).toBe('2001:db8::1');
		expect(normalizeIp('[click](https://example.com)')).toBeNull();
	});
});
