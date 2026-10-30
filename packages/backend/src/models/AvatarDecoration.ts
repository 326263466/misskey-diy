/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, PrimaryColumn, Column } from 'typeorm';
import { id } from './util/id.js';

@Entity('avatar_decoration')
export class MiAvatarDecoration {
	@PrimaryColumn(id())
	public id: string;

	@Column('timestamp with time zone', {
		nullable: true,
	})
	public updatedAt: Date | null;

	@Column('varchar', {
		length: 1024,
	})
	public url: string;

	@Column('varchar', {
		length: 256,
	})
	public name: string;

	@Column('varchar', {
		length: 2048,
	})
	public description: string;

	// TODO: 定期ジョブで存在しなくなったロールIDを除去するようにする
	@Column('varchar', {
		array: true, length: 128, default: '{}',
	})
	public roleIdsThatCanBeUsedThisDecoration: string[];

	@Column('varchar', {
		length: 128, nullable: true,
	})
	public category: string | null;

	// 相对默认显示尺寸（头像的 200%）的倍数，用来让图片的透明中心贴合头像。
	@Column('double precision', {
		default: 1,
	})
	public scale: number;
}
