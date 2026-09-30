/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { AbuseReportEvidenceService } from '@/core/AbuseReportEvidenceService.js';
import EvidenceEndpoint, { meta } from '@/server/api/endpoints/admin/abuse-report-evidence.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiLocalUser } from '@/models/User.js';

const roots: string[] = [];

async function bytes(stream: Readable): Promise<Buffer> {
	const chunks: Buffer[] = [];
	for await (const chunk of stream) chunks.push(Buffer.from(chunk));
	return Buffer.concat(chunks);
}

async function setup(storage: 'local' | 'object' = 'local', objectStoragePrefix = 'drive') {
	const root = await mkdtemp(join(tmpdir(), 'misskey-evidence-test-'));
	roots.push(root);
	const original = Buffer.from('original immutable image bytes');
	const source = join(root, 'source');
	await writeFile(source, original);
	const objects = new Map<string, Buffer>([['original', original]]);
	const client = {
		send: vi.fn(async (command: { input: { Key?: string } }) => {
			const data = objects.get(command.input.Key!);
			if (data == null) throw new Error('NoSuchKey');
			return { Body: Readable.from(data) };
		}),
		destroy: vi.fn(),
	};
	const s3 = {
		getS3Client: vi.fn(() => client),
		upload: vi.fn(async (_meta: unknown, params: { Key: string; Body: Readable }) => { objects.set(params.Key, await bytes(params.Body)); }),
		delete: vi.fn(async (_meta: unknown, params: { Key: string }) => { objects.delete(params.Key); }),
	};
	const internalStorage = { read: vi.fn(() => createReadStream(source)) };
	const download = { downloadUrl: vi.fn(async (_url: string, path: string) => { await writeFile(path, original); }) };
	const config = { rootDir: root, maxFileSize: 1024 };
	const service = new AbuseReportEvidenceService(config as never, { useObjectStorage: storage === 'object', objectStorageBucket: 'bucket', objectStoragePrefix, objectStorageSetPublicRead: true } as never, internalStorage as never, download as never, s3 as never);
	const file = {
		id: 'file', name: 'image.png', type: 'image/png', storedInternal: storage === 'local', isLink: false,
		accessKey: 'original', size: original.length, md5: createHash('md5').update(original).digest('hex'), url: 'https://example.com/original',
	} as MiDriveFile;
	return { service, root, original, source, objects, client, s3, internalStorage, download, file, config };
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('AbuseReportEvidenceService', () => {
	test.each(['local', 'object'] as const)('preserves encrypted %s evidence after the original is overwritten and deleted', async storage => {
		const { service, root, original, source, objects, file, s3, config } = await setup(storage);
		const archive = await service.archive(file);
		await writeFile(source, 'changed');
		await rm(source);
		objects.delete('original');
		const ciphertext = storage === 'local' ? await readFile(join(root, 'files', '.private', archive.key)) : objects.get(archive.key)!;
		expect(ciphertext.equals(original)).toBe(false);
		expect(ciphertext.includes(original)).toBe(false);
		expect(archive.sha256).toBe(createHash('sha256').update(original).digest('hex'));
		config.maxFileSize = 1;
		expect(await bytes(await service.read(archive))).toEqual(original);
		if (storage === 'object') {
			expect(s3.upload.mock.calls[0][1]).not.toHaveProperty('ACL', 'public-read');
			expect(archive.key).toMatch(/^drive\/abuse-report-evidence\//);
		}
		await service.delete(archive);
		await expect(service.read(archive)).rejects.toThrow();
	});

	test('rejects a changed remote source instead of silently archiving different content', async () => {
		const { service, file, download, s3 } = await setup();
		file.storedInternal = false;
		file.isLink = true;
		file.uri = 'https://remote.example/image.png';
		download.downloadUrl.mockImplementation(async (_url, path) => { await writeFile(path, 'changed remote image'); });
		await expect(service.archive(file)).rejects.toThrow('REPORT_EVIDENCE_UNAVAILABLE');
		expect(download.downloadUrl).toHaveBeenCalledWith(file.uri, expect.any(String));
		expect(s3.upload).not.toHaveBeenCalled();
	});

	test('supports nested object storage prefixes without permitting prefixed local archive paths', async () => {
		const { service, file, original } = await setup('object', 'instance/media');
		const archive = await service.archive(file);
		expect(archive.key).toMatch(/^instance\/media\/abuse-report-evidence\//);
		expect(await bytes(await service.read(archive))).toEqual(original);
		await expect(service.read({ ...archive, storage: 'local' })).rejects.toThrow('INVALID_REPORT_EVIDENCE');
		await service.delete(archive);
		await expect(service.read(archive)).rejects.toThrow();
	});

	test('archives remote media only from the stored drive URL using the safe downloader', async () => {
		const { service, file, download, original } = await setup();
		file.storedInternal = false;
		file.isLink = true;
		file.uri = 'https://remote.example/image.png';
		const archive = await service.archive(file);
		expect(download.downloadUrl).toHaveBeenCalledWith(file.uri, expect.any(String));
		expect(await bytes(await service.read(archive))).toEqual(original);
	});

	test('enforces the actual byte limit even when source metadata understates the size', async () => {
		const { service, file, config, internalStorage } = await setup();
		config.maxFileSize = 4;
		file.size = 1;
		await expect(service.archive(file)).rejects.toThrow('REPORT_EVIDENCE_UNAVAILABLE');
		expect(internalStorage.read).toHaveBeenCalledOnce();
	});

	test('rejects evidence tampering before exposing any plaintext stream', async () => {
		const { service, file, root } = await setup();
		const archive = await service.archive(file);
		const path = join(root, 'files', '.private', archive.key);
		const data = await readFile(path);
		data[0] ^= 0xff;
		await writeFile(path, data);
		await expect(service.read(archive)).rejects.toThrow();
	});

	test('rejects archive path traversal before attempting to read or delete files', async () => {
		const { service, file } = await setup();
		const archive = await service.archive(file);
		archive.key = '../../source';
		await expect(service.read(archive)).rejects.toThrow('INVALID_REPORT_EVIDENCE');
		await expect(service.delete(archive)).rejects.toThrow('INVALID_REPORT_EVIDENCE');
	});

	test('removes a possibly completed object upload when storage reports a failure', async () => {
		const { service, file, s3, objects } = await setup('object');
		s3.upload.mockImplementation(async (_meta, params) => {
			objects.set(params.Key, await bytes(params.Body));
			throw new Error('connection lost');
		});
		await expect(service.archive(file)).rejects.toThrow('REPORT_EVIDENCE_UNAVAILABLE');
		expect(s3.delete).toHaveBeenCalledOnce();
		expect(objects.size).toBe(1);
	});

	test('serves only the requested report attachment through the moderator endpoint', async () => {
		const { service, file, original } = await setup();
		const archive = await service.archive(file);
		const reports = { findOneBy: vi.fn().mockResolvedValue({ snapshot: { files: [{ id: file.id, archive }] } }) };
		const endpoint = new EvidenceEndpoint(reports as never, service);
		expect(meta.requireCredential).toBe(true);
		expect(meta.requireModerator).toBe(true);
		expect(meta.kind).toBe('read:admin:abuse-user-reports');
		const stream = await endpoint.exec({ reportId: 'report', fileId: file.id }, { id: 'moderator' } as MiLocalUser, null);
		expect(await bytes(stream)).toEqual(original);
		await expect(endpoint.exec({ reportId: 'report', fileId: 'other' }, { id: 'moderator' } as MiLocalUser, null)).rejects.toMatchObject({ code: 'NO_SUCH_REPORT_EVIDENCE' });
		reports.findOneBy.mockResolvedValue(null);
		await expect(endpoint.exec({ reportId: 'missing', fileId: file.id }, { id: 'moderator' } as MiLocalUser, null)).rejects.toMatchObject({ code: 'NO_SUCH_REPORT_EVIDENCE' });
	});
});
