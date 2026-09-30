/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const CUSTOM_STATUS_TEXT_LIMIT = 8;

export const customStatusIconKeys = [
	'coffee', 'music', 'gamepad', 'briefcase', 'book', 'moon', 'heart', 'plane',
	'food', 'home', 'pet', 'code', 'focus', 'film', 'car', 'vacation',
	'exercise', 'sun', 'cloud', 'battery', 'chat', 'celebrate', 'gift', 'handshake',
] as const;

export type CustomStatusIcon = typeof customStatusIconKeys[number];

export const customStatusIcons = ['coffee', 'food', 'moon', 'briefcase', 'book', 'focus', 'music', 'gamepad', 'exercise', 'car', 'plane', 'vacation'] as const;

export const customStatusGroups = [
	{ id: 'daily', icons: ['coffee', 'food', 'moon'] },
	{ id: 'focus', icons: ['briefcase', 'book', 'focus'] },
	{ id: 'relax', icons: ['music', 'gamepad', 'exercise'] },
	{ id: 'travel', icons: ['car', 'plane', 'vacation'] },
] as const satisfies readonly { id: string; icons: readonly CustomStatusIcon[] }[];

export type StatusIconStatus = 'online' | 'active' | 'offline' | 'unknown' | 'away' | 'busy' | 'doNotDisturb' | 'invisible' | 'custom';
export type CustomStatus = { icon: CustomStatusIcon; text: string };
