/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, shallowReactive, toValue } from 'vue';
import type { ComputedRef, MaybeRefOrGetter } from 'vue';
import type * as Misskey from 'misskey-js';

const publicProfileFields = [
	'name', 'description', 'location', 'birthday', 'lang', 'company', 'jobTitle',
	'fields', 'verifiedLinks', 'avatarUrl', 'avatarBlurhash', 'avatarDecorations',
	'bannerUrl', 'bannerBlurhash', 'isBot', 'isCat', 'emojis',
] as const satisfies readonly (keyof Misskey.entities.UserDetailed)[];

type UserProfilePatch = Partial<Pick<Misskey.entities.UserDetailed, typeof publicProfileFields[number]>>;
type ProfileSource = { id?: string } | null | undefined;

// Keep confirmed public edits for existing snapshots and pages opened later in this session.
// Private account data, presence and relationship/statistic fields belong to their own stores.
const confirmedProfiles = shallowReactive(new Map<string, UserProfilePatch>());

function sameRecord(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) return true;
	if (left == null || right == null || typeof left !== 'object' || typeof right !== 'object') return false;
	const previous = left as Record<string, unknown>;
	const incoming = right as Record<string, unknown>;
	const keys = Object.keys(incoming);
	return Object.keys(previous).length === keys.length && keys.every(key => Object.hasOwn(previous, key) && Object.is(previous[key], incoming[key]));
}

// Public profile collections contain primitives or flat records. Compare only these
// small values, never deep-watch or serialize the entire account or timeline.
function sameProfileValue(left: unknown, right: unknown): boolean {
	if (Array.isArray(left) || Array.isArray(right)) {
		return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => sameRecord(value, right[index]));
	}
	return sameRecord(left, right);
}

export function publishUserProfileUpdate(userId: string, accountData: Partial<Misskey.entities.UserDetailed>): void {
	if (!userId || (accountData.id != null && accountData.id !== userId)) return;
	const patch = Object.fromEntries(publicProfileFields
		.filter(field => Object.hasOwn(accountData, field) && accountData[field] !== undefined)
		.map(field => [field, accountData[field]])) as UserProfilePatch;
	if (Object.keys(patch).length === 0) return;

	// Detach nested values so editing a form cannot mutate already-confirmed profile data.
	if (patch.fields) patch.fields = patch.fields.map(({ name, value }) => ({ name, value }));
	if (patch.verifiedLinks) patch.verifiedLinks = [...patch.verifiedLinks];
	if (patch.emojis) patch.emojis = { ...patch.emojis };
	if (patch.avatarDecorations) {
		patch.avatarDecorations = patch.avatarDecorations.map(({ id, url, angle, flipH, offsetX, offsetY }) => ({ id, url, angle, flipH, offsetX, offsetY }));
	}
	const previous = confirmedProfiles.get(userId);
	const changed = Object.fromEntries(Object.entries(patch).filter(([field, value]) => (
		!sameProfileValue(previous?.[field as keyof UserProfilePatch], value)
	))) as UserProfilePatch;
	// A save response and its streaming echo commonly contain identical data. Keep
	// the same Map entry and nested references so subscribers do no rendering work.
	if (Object.keys(changed).length === 0) return;
	confirmedProfiles.set(userId, { ...previous, ...changed });
}

export function useUserProfile<T extends ProfileSource>(source: MaybeRefOrGetter<T>): ComputedRef<T> {
	return computed(() => {
		const user = toValue(source);
		if (user?.id == null) return user;
		const patch = confirmedProfiles.get(user.id);
		return patch == null ? user : { ...user, ...patch };
	});
}
