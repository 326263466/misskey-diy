/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as fs from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, test, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import {
	DeleteObjectCommand,
	DeleteObjectCommandOutput,
	InvalidObjectState,
	NoSuchKey,
	S3Client,
} from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { GlobalModule } from '@/GlobalModule.js';
import { DriveService } from '@/core/DriveService.js';
import { InternalStorageService } from '@/core/InternalStorageService.js';
import { CoreModule } from '@/core/CoreModule.js';
import { DeleteDriveFilesProcessorService } from '@/queue/processors/DeleteDriveFilesProcessorService.js';
import type { TestingModule } from '@nestjs/testing';

describe('DriveService', () => {
	let app: TestingModule;
	let driveService: DriveService;
	const s3Mock = mockClient(S3Client);

	beforeAll(async () => {
		app = await Test.createTestingModule({
			imports: [GlobalModule, CoreModule],
			providers: [DriveService],
		}).compile();
		app.enableShutdownHooks();
		driveService = app.get<DriveService>(DriveService);
	});

	beforeEach(async () => {
		s3Mock.reset();
	});

	afterAll(async () => {
		await app.close();
	});

	describe('Object storage', () => {
		test('delete a file', async () => {
			s3Mock.on(DeleteObjectCommand)
				.resolves({} as DeleteObjectCommandOutput);

			await driveService.deleteObjectStorageFile('peace of the world');
		});

		test('delete a file then unexpected error', async () => {
			s3Mock.on(DeleteObjectCommand)
				.rejects(new InvalidObjectState({ $metadata: {}, message: '' }));

			await expect(driveService.deleteObjectStorageFile('unexpected')).rejects.toThrow(Error);
		});

		test('delete a file with no valid key', async () => {
			// Some S3 implementations returns 404 Not Found on deleting with a non-existent key
			s3Mock.on(DeleteObjectCommand)
				.rejects(new NoSuchKey({ $metadata: {}, message: 'allowed error.' }));

			await driveService.deleteObjectStorageFile('lol no way');
		});
	});
});

describe('legacy automatic attachment cleanup jobs', () => {
	const user = { id: 'author' };
	test.each([
		{ fileIds: [] },
		{ fileIds: ['unverified-file'] },
		{ fileIds: [], fileUrls: ['https://example.test/files/upload'] },
		{ fileUrls: ['https://example.test/files/upload'] },
		{ fileIds: null },
	])('finishes targeted $fileIds jobs without deleting or enumerating files', async (target) => {
		const files = { countBy: vi.fn(), find: vi.fn() };
		const drive = { deleteFileSync: vi.fn() };
		const service = new DeleteDriveFilesProcessorService(
			{ findOneBy: vi.fn().mockResolvedValue(user) } as never, files as never, drive as never,
			{ logger: { createSubLogger: () => ({ info: vi.fn(), succ: vi.fn() }) } } as never,
		);
		const updateProgress = vi.fn();
		await service.process({ data: { user, ...target }, updateProgress } as never);
		expect(files.countBy).not.toHaveBeenCalled();
		expect(files.find).not.toHaveBeenCalled();
		expect(drive.deleteFileSync).not.toHaveBeenCalled();
		expect(updateProgress).toHaveBeenCalledWith(100);
	});
});

describe('explicit local file deletion', () => {
	test.each(['EACCES', 'EPERM'])('preserves metadata on local %s failures and permits retry after partial removal', async (code) => {
		const failure = Object.assign(new Error('local file unavailable'), { code });
		const missing = Object.assign(new Error('already removed'), { code: 'ENOENT' });
		const unlink = vi.spyOn(fs.promises, 'unlink').mockResolvedValueOnce(undefined).mockRejectedValueOnce(failure);
		const service = Object.create(DriveService.prototype) as DriveService;
		const file = {
			id: 'file', storedInternal: true, accessKey: 'original',
			thumbnailUrl: 'https://example.test/thumbnail', thumbnailAccessKey: 'thumbnail',
			webpublicUrl: 'https://example.test/webpublic', webpublicAccessKey: 'webpublic',
		};
		const postProcess = vi.fn().mockResolvedValue(undefined);
		Object.defineProperties(service, {
			driveFileLifecycleService: { value: { beginDelete: vi.fn().mockResolvedValue(file) } },
			internalStorageService: { value: new InternalStorageService({ rootDir: import.meta.dirname } as never) },
			deletePostProcess: { value: postProcess },
		});

		await expect(service.deleteFileSync(file as never)).rejects.toBe(failure);
		expect(postProcess).not.toHaveBeenCalled();

		unlink.mockRejectedValueOnce(missing).mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);
		await service.deleteFileSync(file as never);
		expect(postProcess).toHaveBeenCalledOnce();
	});
});
