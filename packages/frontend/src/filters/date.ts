/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { dateTimeFormat, dateOnlyFormat } from '@@/js/intl-const.js';

export default (d: Date | number | undefined) => dateTimeFormat.format(d);
export const dateString = (d: string) => dateTimeFormat.format(new Date(d));
export const dateOnly = (d: Date | number | undefined) => dateOnlyFormat.format(d);
