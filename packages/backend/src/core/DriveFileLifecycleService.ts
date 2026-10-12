/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { DataSource, EntityManager } from 'typeorm';
import { DI } from '@/di-symbols.js';
import { MiDriveFile } from '@/models/DriveFile.js';
import { bindThis } from '@/decorators.js';

export const DRIVE_FILE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class DriveFileLifecycleService {
	public static NoSuchFileError = class extends Error {};
	public static FileInUseError = class extends Error {};
	public static FileDeletingError = class extends Error {};
	public static DraftClosedError = class extends Error {};
	public static InvalidImagesError = class extends Error {};

	public static isInvalidImagesError(error: unknown): boolean {
		return error instanceof DriveFileLifecycleService.InvalidImagesError ||
			(error != null && typeof error === 'object' && 'constraint' in error && error.constraint === 'CHK_drive_file_reference_available');
	}

	constructor(
		@Inject(DI.db)
		private db: DataSource,
	) {}

	public async validateImages(manager: EntityManager, userId: string, fileIds: string[], existingIds: string[] = []): Promise<void> {
		if (fileIds.length > 16 || new Set(fileIds).size !== fileIds.length) throw new DriveFileLifecycleService.InvalidImagesError();
		if (fileIds.length === 0) return;
		const files = await manager.findBy(MiDriveFile, { id: In(fileIds) });
		if (files.length !== fileIds.length || files.some(file => file.deletingAt || !file.type.startsWith('image/') || (file.userId !== userId && !existingIds.includes(file.id)))) {
			throw new DriveFileLifecycleService.InvalidImagesError();
		}
		// 写入时由公共引用触发器锁定文件，阻止清理和发布之间的竞态。
	}

	private async lockFile(manager: EntityManager, fileId: string): Promise<MiDriveFile | null> {
		return manager.getRepository(MiDriveFile).findOne({
			where: { id: fileId },
			lock: { mode: 'pessimistic_write' },
		});
	}

	private async hasReferences(manager: EntityManager, fileId: string): Promise<boolean> {
		const rows: { exists: boolean }[] = await manager.query(
			'SELECT EXISTS (SELECT 1 FROM "drive_file_reference" WHERE "fileId" = $1) AS "exists"', [fileId],
		);
		return rows[0].exists;
	}

	private async isDraftClosed(manager: EntityManager, userId: string, draftId: string): Promise<boolean> {
		const rows: { closed: boolean }[] = await manager.query(
			'SELECT "data"->>\'closed\' = \'true\' AS closed FROM "drive_file_draft" WHERE "userId" = $1 AND "draftId" = $2', [userId, draftId],
		);
		return rows[0]?.closed === true;
	}

	@bindThis
	public async reuseFile(fileId: string, isManaged: boolean): Promise<MiDriveFile | null> {
		return this.db.transaction(async manager => {
			const file = await this.lockFile(manager, fileId);
			if (!file || file.deletingAt) return null;
			// 从网盘主动上传同一文件表示保留；内容上传不能降低已有文件的保留级别。
			if (!isManaged && file.isManaged && !file.isPinned) {
				await manager.update(MiDriveFile, file.id, { isPinned: true });
				file.isPinned = true;
				file.cleanupAt = null;
			} else if (file.cleanupAt) {
				file.cleanupAt = new Date(Date.now() + DRIVE_FILE_RETENTION_MS);
				await manager.update(MiDriveFile, file.id, { cleanupAt: file.cleanupAt });
			}
			return file;
		});
	}

	@bindThis
	public async updateFile(fileId: string, values: Partial<MiDriveFile>): Promise<void> {
		await this.db.transaction(async manager => {
			const file = await this.lockFile(manager, fileId);
			if (!file) throw new DriveFileLifecycleService.NoSuchFileError();
			if (file.deletingAt) throw new DriveFileLifecycleService.FileDeletingError();
			// 历史文件的用途尚未核实，不能通过取消保留转为自动回收。
			await manager.update(MiDriveFile, file.id, {
				...values,
				...(values.isPinned !== undefined && !file.isManaged ? { isPinned: true } : {}),
			});
		});
	}

	@bindThis
	public async reserveUpload(userId: string, draftId: string, fileId: string): Promise<void> {
		const parentHash = createHash('sha256').update(draftId).digest('hex').slice(0, 16);
		const reservationId = `upload:${fileId}:${parentHash}`;
		await this.db.transaction(async manager => {
			await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`drive-draft:${userId}:${draftId}`]);
			if (await this.isDraftClosed(manager, userId, draftId)) throw new DriveFileLifecycleService.DraftClosedError();
			const file = await manager.getRepository(MiDriveFile).findOneBy({ id: fileId, userId });
			if (!file || file.deletingAt) throw new DriveFileLifecycleService.FileDeletingError();
			// 上传返回前先单独登记，旧草稿快照不能覆盖尚未收到的新附件。
			await manager.query(`
				INSERT INTO "drive_file_draft" ("userId", "draftId", "data") VALUES ($1, $2, $3::jsonb)
				ON CONFLICT ("userId", "draftId") DO UPDATE SET "data" = EXCLUDED."data", "updatedAt" = now()
			`, [userId, reservationId, JSON.stringify({ fileIds: [fileId], text: null, uploadParentId: draftId })]);
		}).catch(error => {
			if (error != null && typeof error === 'object' && 'constraint' in error && error.constraint === 'CHK_drive_file_reference_available') {
				throw new DriveFileLifecycleService.FileDeletingError();
			}
			throw error;
		});
	}

	@bindThis
	public async saveDraft(userId: string, draftId: string, fileIds: string[], text: string | null, remove: boolean): Promise<void> {
		try {
			await this.db.transaction(async manager => {
				// 同一草稿的首次保存、更新和删除也需要串行，避免尚无草稿行时的竞争。
				await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`drive-draft:${userId}:${draftId}`]);
				if (remove) {
					// 保留关闭标记，让晚到的上传和旧快照无法重新登记已放弃的附件。
					await manager.query(`
						INSERT INTO "drive_file_draft" ("userId", "draftId", "data") VALUES ($1, $2, $3::jsonb)
						ON CONFLICT ("userId", "draftId") DO UPDATE SET "data" = EXCLUDED."data", "updatedAt" = now()
					`, [userId, draftId, JSON.stringify({ fileIds: [], text: null, closed: true })]);
					await manager.query('DELETE FROM "drive_file_draft" WHERE "userId" = $1 AND "data"->>\'uploadParentId\' = $2', [userId, draftId]);
					return;
				}
				if (await this.isDraftClosed(manager, userId, draftId)) return;
				const uniqueIds = [...new Set(fileIds)].sort();
				for (const fileId of uniqueIds) {
					const file = await manager.getRepository(MiDriveFile).findOneBy({ id: fileId, userId });
					if (!file) throw new DriveFileLifecycleService.NoSuchFileError();
					if (file.deletingAt) throw new DriveFileLifecycleService.FileDeletingError();
				}
				await manager.query(`
					INSERT INTO "drive_file_draft" ("userId", "draftId", "data") VALUES ($1, $2, $3::jsonb)
					ON CONFLICT ("userId", "draftId") DO UPDATE SET "data" = EXCLUDED."data", "updatedAt" = now()
				`, [userId, draftId, JSON.stringify({ fileIds: uniqueIds, text })]);
				// 只确认本次快照已覆盖的上传，正文中的文件 URL 同样由真实引用表核验。
				await manager.query(`
					DELETE FROM "drive_file_draft" AS reservation
					WHERE reservation."userId" = $1 AND reservation."data"->>'uploadParentId' = $2
					AND EXISTS (
						SELECT 1 FROM "drive_file_reference" AS reference
						WHERE reference."sourceType" = 'drive_file_draft' AND reference."sourceId" = $3
						AND reference."fileId" = reservation."data"->'fileIds'->>0
					)
				`, [userId, draftId, `${userId}:${draftId}`]);
			});
		} catch (error) {
			if (error != null && typeof error === 'object' && 'constraint' in error && error.constraint === 'CHK_drive_file_reference_available') {
				throw new DriveFileLifecycleService.FileDeletingError();
			}
			throw error;
		}
	}

	@bindThis
	public async beginDelete(fileId: string, force = false): Promise<MiDriveFile | null> {
		return this.db.transaction(async manager => {
			const file = await this.lockFile(manager, fileId);
			if (!file) return null;
			if (file.deletingAt) {
				// 显式删除可以重试此前失败的操作；存储删除和元数据删除均可重复执行。
				if (force) return file;
				throw new DriveFileLifecycleService.FileDeletingError();
			}
			if (!force && await this.hasReferences(manager, file.id)) throw new DriveFileLifecycleService.FileInUseError();
			file.deletingAt = new Date();
			await manager.update(MiDriveFile, file.id, { deletingAt: file.deletingAt });
			return file;
		});
	}
}
