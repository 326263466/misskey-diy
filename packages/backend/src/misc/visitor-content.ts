/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiMeta } from '@/models/Meta.js';

export function getVisitorContentVisibility(meta: Pick<MiMeta, 'clientOptions' | 'ugcVisibilityForVisitor'>): MiMeta['ugcVisibilityForVisitor'] {
	return meta.clientOptions?.openGuestAccess === true ? 'all' : meta.ugcVisibilityForVisitor;
}
