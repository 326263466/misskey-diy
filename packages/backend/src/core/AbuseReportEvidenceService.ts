/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { Inject, Injectable } from '@nestjs/common';
import type { Config } from '@/config.js';
import { DI } from '@/di-symbols.js';
import type { MiDriveFile, MiMeta } from '@/models/_.js';
import type { AbuseReportEvidenceArchive } from '@/models/AbuseUserReport.js';
import { DownloadService } from '@/core/DownloadService.js';
import { InternalStorageService } from '@/core/InternalStorageService.js';
import { S3Service } from '@/core/S3Service.js';

@Injectable()
export class AbuseReportEvidenceService {
	constructor(
		@Inject(DI.config)
		private config: Config,
		@Inject(DI.meta)
		private meta: MiMeta,
		private internalStorageService: InternalStorageService,
		private downloadService: DownloadService,
		private s3Service: S3Service,
	) {
	}

	public async archive(file: MiDriveFile): Promise<AbuseReportEvidenceArchive> {
		if (file.size > this.config.maxFileSize) throw new Error('REPORT_EVIDENCE_UNAVAILABLE');
		const directory = await mkdtemp(join(tmpdir(), 'misskey-report-evidence-'));
		let archive: AbuseReportEvidenceArchive | null = null;
		try {
			const source = join(directory, 'source');
			const encrypted = join(directory, 'encrypted');
			if (file.storedInternal && file.accessKey != null) {
				await pipeline(this.internalStorageService.read(file.accessKey), this.limitSize(), createWriteStream(source, { flags: 'wx' }));
			} else if (!file.isLink && file.accessKey != null && this.meta.objectStorageBucket != null) {
				await this.downloadObject(file.accessKey, source);
			} else {
				await this.downloadService.downloadUrl(file.isLink ? file.uri ?? file.url : file.url, source);
			}

			const encryptionKey = randomBytes(32);
			const iv = randomBytes(12);
			const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
			const sha256 = createHash('sha256');
			const md5 = createHash('md5');
			let size = 0;
			const digest = new Transform({
				transform: (chunk: Buffer, encoding, callback) => {
					size += chunk.length;
					sha256.update(chunk);
					md5.update(chunk);
					callback(null, chunk);
				},
			});
			await pipeline(createReadStream(source), this.limitSize(), digest, cipher, createWriteStream(encrypted, { flags: 'wx' }));
			if (file.md5 !== md5.digest('hex')) throw new Error('REPORT_EVIDENCE_CHANGED');
			const hash = sha256.digest('hex');
			const storage = this.meta.useObjectStorage ? 'object' : 'local';
			const prefix = storage === 'object' && this.meta.objectStoragePrefix ? `${this.meta.objectStoragePrefix}/` : '';
			const key = `${prefix}abuse-report-evidence/${hash}/${randomUUID()}`;
			archive = { storage, key, sha256: hash, size, encryptionKey: encryptionKey.toString('hex'), iv: iv.toString('hex'), authTag: cipher.getAuthTag().toString('hex') };
			this.validateArchive(archive);
			if (storage === 'object') {
				if (this.meta.objectStorageBucket == null) throw new Error('REPORT_EVIDENCE_STORAGE_UNAVAILABLE');
				await this.s3Service.upload(this.meta, {
					Bucket: this.meta.objectStorageBucket,
					Key: key,
					Body: createReadStream(encrypted),
					ContentType: 'application/octet-stream',
					CacheControl: 'no-store',
				});
			} else {
				const destination = this.localPath(key);
				await mkdir(resolve(destination, '..'), { recursive: true, mode: 0o700 });
				await pipeline(createReadStream(encrypted), createWriteStream(destination, { flags: 'wx', mode: 0o600 }));
			}
			return archive;
		} catch (cause) {
			if (archive != null) await this.delete(archive).catch(() => {});
			throw new Error('REPORT_EVIDENCE_UNAVAILABLE', { cause });
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	}

	public async read(archive: AbuseReportEvidenceArchive): Promise<Readable> {
		this.validateArchive(archive);
		const directory = await mkdtemp(join(tmpdir(), 'misskey-report-evidence-'));
		let streaming = false;
		try {
			const encrypted = archive.storage === 'local' ? this.localPath(archive.key) : join(directory, 'encrypted');
			if (archive.storage === 'object') await this.downloadObject(archive.key, encrypted, archive.size);
			const plaintext = join(directory, 'plaintext');
			const decipher = createDecipheriv('aes-256-gcm', Buffer.from(archive.encryptionKey, 'hex'), Buffer.from(archive.iv, 'hex'));
			decipher.setAuthTag(Buffer.from(archive.authTag, 'hex'));
			const hash = createHash('sha256');
			let size = 0;
			const digest = new Transform({
				transform: (chunk: Buffer, encoding, callback) => {
					size += chunk.length;
					hash.update(chunk);
					callback(null, chunk);
				},
			});
			await pipeline(createReadStream(encrypted), this.limitSize(archive.size), decipher, digest, createWriteStream(plaintext, { flags: 'wx', mode: 0o600 }));
			if (hash.digest('hex') !== archive.sha256 || size !== archive.size) throw new Error('REPORT_EVIDENCE_CHANGED');
			const stream = createReadStream(plaintext);
			stream.once('close', () => { void rm(directory, { recursive: true, force: true }).catch(() => {}); });
			streaming = true;
			return stream;
		} finally {
			if (!streaming) await rm(directory, { recursive: true, force: true });
		}
	}

	public async delete(archive: AbuseReportEvidenceArchive): Promise<void> {
		this.validateArchive(archive);
		if (archive.storage === 'object') {
			await this.s3Service.delete(this.meta, { Bucket: this.meta.objectStorageBucket!, Key: archive.key });
		} else {
			await rm(this.localPath(archive.key), { force: true });
		}
	}

	private limitSize(maxSize = this.config.maxFileSize): Transform {
		let size = 0;
		return new Transform({
			transform: (chunk: Buffer, encoding, callback) => {
				size += chunk.length;
				callback(size > maxSize ? new Error('REPORT_EVIDENCE_TOO_LARGE') : null, chunk);
			},
		});
	}

	private async downloadObject(key: string, path: string, maxSize = this.config.maxFileSize): Promise<void> {
		const client = this.s3Service.getS3Client(this.meta);
		try {
			const result = await client.send(new GetObjectCommand({ Bucket: this.meta.objectStorageBucket!, Key: key }));
			if (result.Body == null) throw new Error('REPORT_EVIDENCE_STORAGE_UNAVAILABLE');
			await pipeline(result.Body as Readable, this.limitSize(maxSize), createWriteStream(path, { flags: 'wx', mode: 0o600 }));
		} finally {
			client.destroy();
		}
	}

	private localPath(key: string): string {
		if (!/^abuse-report-evidence\/[a-f0-9]{64}\/[a-f0-9-]{36}$/.test(key)) throw new Error('INVALID_REPORT_EVIDENCE');
		return resolve(this.config.rootDir, 'files', '.private', key);
	}

	private validateArchive(archive: AbuseReportEvidenceArchive): void {
		if (archive.storage === 'local') this.localPath(archive.key);
		if (archive.storage === 'object' && !/^(?:(?!\.{1,2}\/)[a-zA-Z0-9._-]+\/)*abuse-report-evidence\/[a-f0-9]{64}\/[a-f0-9-]{36}$/.test(archive.key)) throw new Error('INVALID_REPORT_EVIDENCE');
		if (!['local', 'object'].includes(archive.storage) || !/^[a-f0-9]{64}$/.test(archive.sha256) || !/^[a-f0-9]{64}$/.test(archive.encryptionKey) || !/^[a-f0-9]{24}$/.test(archive.iv) || !/^[a-f0-9]{32}$/.test(archive.authTag) || !Number.isSafeInteger(archive.size) || archive.size < 0) throw new Error('INVALID_REPORT_EVIDENCE');
	}
}
