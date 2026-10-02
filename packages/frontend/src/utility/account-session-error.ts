/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const handledErrors = new WeakSet<object>();

export function getAccountSessionErrorReason(error: unknown): 'suspended' | 'deleted' | 'revoked' | null {
	if (typeof error !== 'object' || error === null) return null;
	const { code, id } = error as { code?: unknown; id?: unknown };
	if (code === 'YOUR_ACCOUNT_SUSPENDED' || id === 'a8c724b3-6e9c-4b46-b1a8-bc3ed6258370') return 'suspended';
	if (code === 'USER_IS_DELETED' || id === 'e5b3b9f0-2b8f-4b9f-9c1f-8c5c1b2e1b1a') return 'deleted';
	if (code === 'AUTHENTICATION_FAILED' || id === 'b0a7f5f8-dc2f-4171-b91f-de88ad238e14') return 'revoked';
	return null;
}

export function markAccountSessionErrorHandled(error: object): void {
	handledErrors.add(error);
}

export function isAccountSessionErrorHandled(error: unknown): boolean {
	return typeof error === 'object' && error !== null && handledErrors.has(error);
}
