/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { IsNull } from 'typeorm';
import type { DataSource } from 'typeorm';
import type { Config } from '@/config.js';
import type { MiMeta } from '@/models/Meta.js';
import { MiProductImage } from '@/models/ProductImage.js';
import { MiDriveFile } from '@/models/DriveFile.js';
import { MiUser } from '@/models/User.js';
import { DI } from '@/di-symbols.js';
import Logger from '@/logger.js';
import { DownloadService } from '@/core/DownloadService.js';
import { InternalStorageService } from '@/core/InternalStorageService.js';
import { S3Service } from '@/core/S3Service.js';
import { canTrade, NotAllowedError } from '@/core/commerce/types.js';

export const PRODUCT_IMAGE_MAX_SIZE = 10 * 1024 * 1024;
const IMAGE_DRAFT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const IMAGE_DRAFT_LIMIT = 20;
const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];

@Injectable()
export class ProductImageService {
	public static InvalidImageError = class extends Error {};
	public static ImageLimitError = class extends Error {};
	public static ImageInUseError = class extends Error {};
	private logger = new Logger('product-images');

	constructor(
		@Inject(DI.db) private db: DataSource,
		@Inject(DI.config) private config: Config,
		@Inject(DI.meta) private meta: MiMeta,
		private downloadService: DownloadService,
		private internalStorageService: InternalStorageService,
		private s3Service: S3Service,
	) {}

	public pack(image: MiProductImage) {
		return { id: image.id, url: image.url, type: image.type, size: image.size };
	}

	public async findReady(imageId: string) {
		if (!/^[a-f0-9]{32}$/.test(imageId)) return null;
		return this.db.getRepository(MiProductImage).findOneBy({ id: imageId, ready: true, deletingAt: IsNull() });
	}

	public filePath(image: MiProductImage) {
		if (!/^product-images\/[a-f0-9]{32}\.webp$/.test(image.storageKey)) throw new Error('Invalid product image storage key.');
		return resolve(this.config.rootDir, 'files', image.storageKey);
	}

	public async upload(userId: string, path: string) {
		if (!canTrade(await this.db.getRepository(MiUser).findOneBy({ id: userId }))) throw new NotAllowedError();
		if ((await fs.stat(path)).size > PRODUCT_IMAGE_MAX_SIZE) throw new ProductImageService.InvalidImageError();
		let data: Buffer;
		try {
			// 不让 sharp 缓存源文件句柄，保证导入后的临时文件可立即清理。
			const input = sharp(await fs.readFile(path), { animated: true, limitInputPixels: 64_000_000 });
			const metadata = await input.metadata();
			if (!metadata.format || !['jpeg', 'png', 'webp', 'avif', 'heif', 'gif'].includes(metadata.format)) throw new Error('Unsupported product image.');
			// 独立编码去掉源文件元数据，保留动图，不复用网盘文件或其存储键。
			data = await input.rotate().resize(2048, 2048, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
		} catch {
			throw new ProductImageService.InvalidImageError();
		}
		if (data.length === 0 || data.length > PRODUCT_IMAGE_MAX_SIZE) throw new ProductImageService.InvalidImageError();
		const imageId = randomUUID().replaceAll('-', '');
		const storedInternal = !this.meta.useObjectStorage;
		const prefix = this.meta.objectStoragePrefix ? `${this.meta.objectStoragePrefix}/` : '';
		const storageKey = `${storedInternal ? '' : prefix}product-images/${imageId}.webp`;
		const baseUrl = this.meta.objectStorageBaseUrl ?? `${this.meta.objectStorageUseSSL ? 'https' : 'http'}://${this.meta.objectStorageEndpoint}${this.meta.objectStoragePort ? `:${this.meta.objectStoragePort}` : ''}/${this.meta.objectStorageBucket}`;
		const url = storedInternal ? `${this.config.url}/product-images/${imageId}` : `${baseUrl.replace(/\/$/, '')}/${storageKey}`;
		if (url.length > 2048) throw new ProductImageService.InvalidImageError();
		const image = await this.db.transaction(async manager => {
			const user = await manager.findOne(MiUser, { where: { id: userId }, lock: { mode: 'for_no_key_update' } });
			if (!canTrade(user)) throw new NotAllowedError();
			if (await manager.countBy(MiProductImage, { userId, productId: IsNull() }) >= IMAGE_DRAFT_LIMIT) throw new ProductImageService.ImageLimitError();
			const staged = manager.create(MiProductImage, {
				id: imageId, userId, productId: null, createdAt: new Date(), expiresAt: new Date(Date.now() + IMAGE_DRAFT_RETENTION_MS),
				deletingAt: null, ready: false, storedInternal, storageKey, url, type: 'image/webp', size: data.length,
			});
			return manager.save(staged);
		});
		try {
			if (storedInternal) {
				await fs.mkdir(resolve(this.config.rootDir, 'files', 'product-images'), { recursive: true });
				await fs.writeFile(this.filePath(image), data, { flag: 'wx' });
			} else {
				await this.s3Service.upload(this.meta, {
					Bucket: this.meta.objectStorageBucket!, Key: storageKey, Body: data, ContentType: image.type,
					CacheControl: 'max-age=31536000, immutable', ...(this.meta.objectStorageSetPublicRead ? { ACL: 'public-read' as const } : {}),
				});
			}
			await this.db.getRepository(MiProductImage).update(image.id, { ready: true });
			image.ready = true;
			return this.pack(image);
		} catch (error) {
			await this.db.getRepository(MiProductImage).update(image.id, { expiresAt: new Date() });
			await this.deleteUnused(image.id, userId).catch(cleanupError => this.logger.warn('商品图片上传失败，等待重试清理。', { imageId: image.id, error: cleanupError }));
			throw error;
		}
	}

	public async import(userId: string, source: { fileId?: string; url?: string }) {
		if (!!source.fileId === !!source.url) throw new ProductImageService.InvalidImageError();
		if (!canTrade(await this.db.getRepository(MiUser).findOneBy({ id: userId }))) throw new NotAllowedError();
		if (source.fileId) {
			const file = await this.db.getRepository(MiDriveFile).findOneBy({ id: source.fileId, userId });
			if (!file || file.isSensitive || file.size > PRODUCT_IMAGE_MAX_SIZE || !imageTypes.includes(file.type)) throw new ProductImageService.InvalidImageError();
			// 不跨网络或编码持有源文件锁；并发删除原图时允许本次导入失败。
			if (file.storedInternal) return this.upload(userId, this.internalStorageService.resolvePath(file.accessKey!));
			return this.importUrl(userId, file.webpublicUrl ?? file.url);
		}
		return this.importUrl(userId, source.url!);
	}

	private async importUrl(userId: string, url: string) {
		try {
			const parsed = new URL(url);
			if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Invalid image URL.');
		} catch { throw new ProductImageService.InvalidImageError(); }
		const dir = await fs.mkdtemp(join(tmpdir(), 'misskey-product-image-'));
		const path = join(dir, 'source');
		try {
			try {
				await this.downloadService.downloadUrl(url, path, PRODUCT_IMAGE_MAX_SIZE);
			} catch {
				throw new ProductImageService.InvalidImageError();
			}
			return await this.upload(userId, path);
		} finally {
			await fs.rm(path, { force: true });
			await fs.rmdir(dir);
		}
	}

	public async deleteUnused(imageId: string, userId?: string) {
		const image = await this.db.transaction(async manager => {
			const row = await manager.findOne(MiProductImage, { where: { id: imageId, ...(userId ? { userId } : {}) }, lock: { mode: 'pessimistic_write' } });
			if (!row) return null;
			if (row.productId) throw new ProductImageService.ImageInUseError();
			// 删除标记和绑定使用同一行锁；失败记录留给后台重试，不能再被商品采用。
			if (!row.deletingAt) {
				row.deletingAt = new Date();
				await manager.update(MiProductImage, row.id, { deletingAt: row.deletingAt, expiresAt: row.deletingAt });
			}
			return row;
		});
		if (!image) return;
		if (image.storedInternal) await fs.rm(this.filePath(image), { force: true });
		else await this.s3Service.delete(this.meta, { Bucket: this.meta.objectStorageBucket!, Key: image.storageKey });
		await this.db.getRepository(MiProductImage).delete(image.id);
	}

	public async cleanupExpired(userId?: string) {
		let cursor: string | null = null;
		const now = new Date();
		while (true) {
			const images: MiProductImage[] = await this.db.getRepository(MiProductImage).createQueryBuilder('image')
				.where('image.productId IS NULL')
				.andWhere('(image.expiresAt IS NULL OR image.expiresAt <= :now)', { now })
				.andWhere(userId ? 'image.userId = :userId' : 'true', { userId })
				.andWhere(cursor ? 'image.id > :cursor' : 'true', { cursor })
				.orderBy('image.id', 'ASC').take(100).getMany();
			for (const image of images) {
				try { await this.deleteUnused(image.id, userId); } catch (error) {
					if (!(error instanceof ProductImageService.ImageInUseError)) this.logger.warn('商品旧图片清理失败，将在后台重试。', { imageId: image.id, error });
				}
			}
			if (images.length < 100) return;
			// 失败项保留到下次重试，不阻塞本轮后续图片的清理。
			cursor = images[images.length - 1].id;
		}
	}
}
