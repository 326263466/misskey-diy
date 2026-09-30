/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Paginator } from '@/utility/paginator.js';

export class NotificationPaginator extends Paginator<'i/notifications' | 'i/notifications-grouped'> {
	public override async init(): Promise<void> {
		const selectedDate = this.initialDate;
		// Start at the beginning of retained history when no date is selected.
		// The notification API accepts dates independently of the server's ID format.
		if (this.order.value === 'oldest' && selectedDate == null) this.initialDate = 1;
		this.initialDirection = this.order.value === 'oldest' ? 'newer' : 'older';
		const pending = super.init();
		this.initialDate = selectedDate;
		await pending;
		// Notification endpoints already return ascending results for since queries.
		this.items.value.sort((a, b) => this.order.value === 'oldest' ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id));
	}
}
