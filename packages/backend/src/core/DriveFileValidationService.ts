/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { MiDriveFile } from '@/models/DriveFile.js';

@Injectable()
export class DriveFileValidationService {
	public static InvalidImagesError = class extends Error {};

	public async validateImages(manager: EntityManager, userId: string, fileIds: string[], existingIds: string[] = []): Promise<void> {
		if (fileIds.length > 16 || new Set(fileIds).size !== fileIds.length) throw new DriveFileValidationService.InvalidImagesError();
		if (fileIds.length === 0) return;
		const files = await manager.findBy(MiDriveFile, { id: In(fileIds) });
		if (files.length !== fileIds.length || files.some(file => !file.type.startsWith('image/') || (file.userId !== userId && !existingIds.includes(file.id)))) {
			throw new DriveFileValidationService.InvalidImagesError();
		}
	}
}
