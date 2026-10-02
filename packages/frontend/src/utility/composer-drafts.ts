/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// A draft open in another composer must not be offered for restoration.
export const activeComposerDrafts = new Set<string>();
