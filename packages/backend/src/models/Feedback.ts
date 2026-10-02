/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

export const feedbackCategories = ['bug', 'feature', 'other'] as const;
export type FeedbackCategory = typeof feedbackCategories[number];
export const feedbackStatuses = ['open', 'inProgress', 'resolved', 'closed'] as const;
export type FeedbackStatus = typeof feedbackStatuses[number];

@Entity('feedback')
@Index('IDX_feedback_status_id', ['status', 'id'])
@Index('IDX_feedback_category_id', ['category', 'id'])
@Index('IDX_feedback_user_id', ['userId', 'id'])
@Index('IDX_feedback_updated_id', ['updatedAt', 'id'])
export class MiFeedback {
	@PrimaryColumn(id())
	public id: string;

	@Column('timestamp with time zone')
	public updatedAt: Date;

	@Column('varchar', { length: 120 })
	public title: string;

	@Column('varchar', { length: 10000 })
	public description: string;

	@Column('varchar', { length: 16 })
	public category: FeedbackCategory;

	@Column('varchar', { length: 16, default: 'open' })
	public status: FeedbackStatus;

	@Column('varchar', { length: 10000, nullable: true })
	public response: string | null;

	@Column(id())
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser, { onDelete: 'CASCADE' })
	@JoinColumn()
	public user: MiUser | null;
}
