/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

export type AbuseReportResolveType = 'accept' | 'reject';

export const abuseReportReasons = ['spam', 'scam', 'sexualContent', 'violence', 'harassment', 'hateSpeech', 'privacyViolation', 'impersonation', 'misinformation', 'copyrightViolation', 'inciting', 'other'] as const;
export type AbuseReportReason = typeof abuseReportReasons[number];

export type AbuseReportEvidenceArchive = {
	storage: 'local' | 'object';
	key: string;
	sha256: string;
	size: number;
	encryptionKey: string;
	iv: string;
	authTag: string;
};

export type AbuseReportSnapshot = {
	version: 1;
	capturedAt: string;
	type: 'user' | 'note' | 'boost' | 'chat' | 'page' | 'gallery' | 'play';
	sourceUrl: string;
	user: {
		id: string;
		username: string;
		host: string | null;
		name: string | null;
	};
	content: string;
	files: {
		id: string;
		name: string;
		type: string;
		size: number;
		url: string;
		comment: string | null;
		archive: AbuseReportEvidenceArchive;
	}[];
};

@Entity('abuse_user_report')
@Index('IDX_abuse_user_report_reporter_request', ['reporterId', 'requestId'], { unique: true })
export class MiAbuseUserReport {
	@PrimaryColumn(id())
	public id: string;

	@Index()
	@Column(id())
	public targetUserId: MiUser['id'];

	@ManyToOne(() => MiUser, {
		createForeignKeyConstraints: false,
	})
	@JoinColumn()
	public targetUser: MiUser | null;

	@Index()
	@Column(id())
	public reporterId: MiUser['id'];

	@ManyToOne(() => MiUser, {
		createForeignKeyConstraints: false,
	})
	@JoinColumn()
	public reporter: MiUser | null;

	@Column('varchar', { length: 36, nullable: true })
	public requestId: string | null;

	@Column('varchar', { length: 64, nullable: true })
	public requestFingerprint: string | null;

	@Column({
		...id(),
		nullable: true,
	})
	public assigneeId: MiUser['id'] | null;

	@ManyToOne(() => MiUser, {
		onDelete: 'SET NULL',
	})
	@JoinColumn()
	public assignee: MiUser | null;

	@Index()
	@Column('boolean', {
		default: false,
	})
	public resolved: boolean;

	/**
	 * リモートサーバーに転送したかどうか
	 */
	@Column('boolean', {
		default: false,
	})
	public forwarded: boolean;

	@Column('text')
	public comment: string;

	@Column('varchar', { length: 256, nullable: true })
	public reason: AbuseReportReason | null;

	@Column('jsonb', { nullable: true })
	public snapshot: AbuseReportSnapshot | null;

	@Column('varchar', {
		length: 8192, default: '',
	})
	public moderationNote: string;

	/**
	 * accept 是認 ... 通報内容が正当であり、肯定的に対応された
	 * reject 否認 ... 通報内容が正当でなく、否定的に対応された
	 * null ... その他
	 */
	@Column('varchar', {
		length: 128, nullable: true,
	})
	public resolvedAs: AbuseReportResolveType | null;

	//#region Denormalized fields
	@Index()
	@Column('varchar', {
		length: 128, nullable: true,
		comment: '[Denormalized]',
	})
	public targetUserHost: string | null;

	@Index()
	@Column('varchar', {
		length: 128, nullable: true,
		comment: '[Denormalized]',
	})
	public reporterHost: string | null;
	//#endregion
}
