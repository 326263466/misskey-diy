/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, test, expect, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ZipArchive } from 'archiver';
import sharp from 'sharp';
import { IsNull } from 'typeorm';
import type { DataSource } from 'typeorm';
import type { Config } from '@/config.js';
import { CoreModule } from '@/core/CoreModule.js';
import { CustomEmojiService } from '@/core/CustomEmojiService.js';
import { DownloadService } from '@/core/DownloadService.js';
import { DriveService } from '@/core/DriveService.js';
import { IdService } from '@/core/IdService.js';
import { InternalStorageService } from '@/core/InternalStorageService.js';
import { RoleService } from '@/core/RoleService.js';
import { DI } from '@/di-symbols.js';
import { GlobalModule } from '@/GlobalModule.js';
import type { DriveFilesRepository, EmojisRepository, RoleAssignmentsRepository, RolesRepository, UsersRepository, UserProfilesRepository } from '@/models/_.js';
import { MiEmoji } from '@/models/Emoji.js';
import { MiDriveFileReference } from '@/models/DriveFileReference.js';
import type { MiLocalUser } from '@/models/User.js';
import { allSettled } from '@/misc/promise-tracker.js';
import { QueueLoggerService } from '@/queue/QueueLoggerService.js';
import { ImportCustomEmojisProcessorService } from '@/queue/processors/ImportCustomEmojisProcessorService.js';
import AddEmojiEndpoint from '@/server/api/endpoints/admin/emoji/add.js';
import { DriveFileLifecycle1791215330183 } from '../../migration/1791215330183-DriveFileLifecycle.js';

describe('CustomEmojiService', () => {
	let app: TestingModule;
	let service: CustomEmojiService;

	let emojisRepository: EmojisRepository;
	let idService: IdService;
	let tempDir: string;

	beforeAll(async () => {
		tempDir = await fs.promises.mkdtemp(join(tmpdir(), 'misskey-emoji-test-'));
		app = await Test
			.createTestingModule({
				imports: [
					GlobalModule,
					CoreModule,
				],
				providers: [
					AddEmojiEndpoint,
					ImportCustomEmojisProcessorService,
					QueueLoggerService,
				],
			})
			.overrideProvider(InternalStorageService)
			.useFactory({
				factory: (config: Config) => new InternalStorageService({ ...config, rootDir: tempDir }),
				inject: [DI.config],
			})
			.compile();
		app.enableShutdownHooks();

		service = app.get<CustomEmojiService>(CustomEmojiService);
		emojisRepository = app.get<EmojisRepository>(DI.emojisRepository);
		idService = app.get<IdService>(IdService);
	});

	afterAll(async () => {
		await allSettled();
		await app?.close();
		if (tempDir) await fs.promises.rm(tempDir, { recursive: true, force: true });
	});

	describe('表情上传与 ZIP 导入', () => {
		let db: DataSource;
		let drive: DriveService;
		let files: DriveFilesRepository;
		let users: UsersRepository;
		let admin: MiLocalUser;
		let regularUser: MiLocalUser;
		let adminRoleId: string;
		let add: AddEmojiEndpoint;
		let importer: ImportCustomEmojisProcessorService;
		const imagePath = fileURLToPath(new URL('../resources/192.png', import.meta.url));

		beforeAll(async () => {
			db = app.get<DataSource>(DI.db);
			drive = app.get(DriveService);
			files = app.get(DI.driveFilesRepository);
			users = app.get(DI.usersRepository);
			add = app.get(AddEmojiEndpoint);
			importer = app.get(ImportCustomEmojisProcessorService);
			const runner = db.createQueryRunner();
			try {
				await new DriveFileLifecycle1791215330183().installTracking(runner);
			} finally {
				await runner.release();
			}

			async function createUser() {
				const id = idService.gen();
				await users.insert({ id, username: `emoji${id}`, usernameLower: `emoji${id}` });
				await app.get<UserProfilesRepository>(DI.userProfilesRepository).insert({ userId: id });
				return await users.findOneByOrFail({ id }) as MiLocalUser;
			}

			admin = await createUser();
			regularUser = await createUser();
			adminRoleId = idService.gen();
			await app.get<RolesRepository>(DI.rolesRepository).insert({
				id: adminRoleId, updatedAt: new Date(), lastUsedAt: new Date(),
				name: '表情测试管理员', description: '', isAdministrator: true,
			});
			await app.get<RoleAssignmentsRepository>(DI.roleAssignmentsRepository).insert({
				id: idService.gen(), userId: admin.id, roleId: adminRoleId,
			});
			expect(await app.get(RoleService).isAdministrator(admin)).toBe(true);
		});

		afterEach(async () => {
			await allSettled();
			await emojisRepository.createQueryBuilder().delete().execute();
			for (const file of await files.find()) await drive.deleteFileSync(file);
		});

		afterAll(async () => {
			if (admin) await users.delete(admin.id);
			if (regularUser) await users.delete(regularUser.id);
			if (adminRoleId) await app.get<RolesRepository>(DI.rolesRepository).delete(adminRoleId);
		});

		async function createArchive(records?: Array<{ fileName: string; name: string; category: string }>, user = admin, sourcePath = imagePath) {
			const archivePath = join(tempDir, `${idService.gen()}.zip`);
			await new Promise<void>((resolve, reject) => {
				const output = fs.createWriteStream(archivePath);
				const archive = new ZipArchive({ zlib: { level: 0 } });
				output.once('close', resolve);
				output.once('error', reject);
				archive.once('error', reject);
				archive.pipe(output);
				if (records) {
					archive.append(JSON.stringify({
						metaVersion: 2,
						host: 'example.test',
						exportedAt: new Date().toISOString(),
						emojis: records.map(record => ({
							fileName: record.fileName,
							downloaded: true,
							emoji: {
								name: record.name,
								category: record.category,
								aliases: ['测试表情'],
								license: 'CC0',
								isSensitive: false,
								localOnly: true,
							},
						})),
					}), { name: 'meta.json' });
				}
				for (const fileName of new Set(records?.map(record => record.fileName) ?? ['emoji.png'])) {
					archive.file(sourcePath, { name: fileName });
				}
				void archive.finalize().catch(reject);
			});
			const uploaded = await drive.addFile({ user, path: archivePath, name: 'emojis.zip', force: true });
			// 只替换 HTTP 下载；上传、ZIP 解包、数据库写入和引用触发器均执行真实逻辑。
			vi.spyOn(app.get(DownloadService), 'downloadUrl').mockImplementation(async (url, destination) => {
				expect(url).toBe(uploaded.url);
				await fs.promises.copyFile(archivePath, destination);
				return { filename: 'emojis.zip' };
			});
			return { data: { fileId: uploaded.id, user: { id: admin.id } } } as Parameters<ImportCustomEmojisProcessorService['process']>[0];
		}

		test('普通用户的默认上传策略拒绝 ZIP，管理员可正常上传', async () => {
			await expect(createArchive([], regularUser)).rejects.toThrow('Unallowed file type: application/zip');
			expect(await files.count()).toBe(0);
			const job = await createArchive([]);
			const file = await files.findOneByOrFail({ id: job.data.fileId });
			expect(file).toMatchObject({ userId: admin.id, type: 'application/zip' });
		});

		test('手动添加保留分类和文件引用，重复名称不会产生第二条表情', async () => {
			const file = await drive.addFile({ user: admin, path: imagePath, name: 'manual.png' });
			const request = { name: 'manual_emoji', fileId: file.id, category: '原分类', aliases: ['测试'] };
			const result = await add.exec(request, admin, null);
			const emoji = await emojisRepository.findOneByOrFail({ id: result.id });
			expect(emoji).toMatchObject({ name: 'manual_emoji', category: '原分类', aliases: ['测试'], originalUrl: file.url });
			expect(await db.getRepository(MiDriveFileReference).countBy({ fileId: file.id, sourceType: 'emoji', sourceId: emoji.id })).toBe(1);
			await expect(add.exec(request, admin, null)).rejects.toMatchObject({ code: 'DUPLICATE_NAME' });
			expect(await emojisRepository.countBy({ name: request.name, host: IsNull() })).toBe(1);
		});

		test.each(['奶龙思考', 'emoji-name'])('手动添加拒绝不受支持的表情名：%s', async name => {
			const file = await drive.addFile({ user: admin, path: imagePath, name: 'invalid-name.png' });
			await expect(add.exec({ name, fileId: file.id }, admin, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
			expect(await emojisRepository.count()).toBe(0);
		});

		test('导入 Misskey ZIP 时保留分类和别名、建立文件引用，跳过非法名称', async () => {
			const records = [
				{ fileName: 'first.png', name: 'import_first', category: '第一类' },
				{ fileName: 'second.png', name: 'import_second', category: '第二类' },
				{ fileName: 'invalid.png', name: '奶龙思考', category: '第三类' },
			];
			await importer.process(await createArchive(records));
			const emojis = await emojisRepository.find({ order: { name: 'ASC' } });
			expect(emojis).toHaveLength(2);
			for (const [index, emoji] of emojis.entries()) {
				expect(emoji).toMatchObject({
					name: records[index].name,
					category: records[index].category,
					aliases: ['测试表情'],
					license: 'CC0',
					localOnly: true,
				});
				const file = await files.findOneByOrFail({ url: emoji.originalUrl });
				expect(await db.getRepository(MiDriveFileReference).countBy({ fileId: file.id, sourceType: 'emoji', sourceId: emoji.id })).toBe(1);
			}
		});

		test('只有图片而没有根目录 meta.json 的 ZIP 明确失败且不写入表情', async () => {
			await expect(importer.process(await createArchive())).rejects.toThrow('meta.json not found in the archive');
			expect(await emojisRepository.count()).toBe(0);
		});

		test('WebP 表情导入后释放临时文件，后续条目继续导入', async () => {
			const webpPath = join(tempDir, 'source.webp');
			await sharp(imagePath).webp().toFile(webpPath);
			const job = await createArchive([
				{ fileName: 'first.webp', name: 'webp_first', category: 'WebP' },
				{ fileName: 'second.webp', name: 'webp_second', category: 'WebP' },
			], admin, webpPath);
			const uploadPaths: string[] = [];
			const addFile = drive.addFile.bind(drive);
			vi.spyOn(drive, 'addFile').mockImplementation(async options => {
				uploadPaths.push(options.path);
				return addFile(options);
			});
			await importer.process(job);
			expect((await emojisRepository.find({ order: { name: 'ASC' } })).map(emoji => emoji.name)).toEqual(['webp_first', 'webp_second']);
			expect(uploadPaths).toHaveLength(2);
			for (const path of uploadPaths) await expect(fs.promises.stat(path)).rejects.toMatchObject({ code: 'ENOENT' });
		});
	});

	describe('fetchEmojis', () => {
		async function insert(data: Partial<MiEmoji>[]) {
			for (const d of data) {
				const id = idService.gen();
				await emojisRepository.insert({
					id: id,
					updatedAt: new Date(),
					...d,
				});
			}
		}

		function call(params: Parameters<CustomEmojiService['fetchEmojis']>['0']) {
			return service.fetchEmojis(
				params,
				{
					// テスト向けに
					sortKeys: ['+id'],
				},
			);
		}

		function defaultData(suffix: string, override?: Partial<MiEmoji>): Partial<MiEmoji> {
			return {
				name: `emoji${suffix}`,
				host: null,
				category: 'default',
				originalUrl: `https://example.com/emoji${suffix}.png`,
				publicUrl: `https://example.com/emoji${suffix}.png`,
				type: 'image/png',
				aliases: [`emoji${suffix}`],
				license: 'CC0',
				isSensitive: false,
				localOnly: false,
				roleIdsThatCanBeUsedThisEmojiAsReaction: [],
				...override,
			};
		}

		afterEach(async () => {
			await emojisRepository.createQueryBuilder().delete().execute();
		});

		describe('単独', () => {
			test('updatedAtFrom', async () => {
				await insert([
					defaultData('001', { updatedAt: new Date('2021-01-01T00:00:00.000Z') }),
					defaultData('002', { updatedAt: new Date('2021-01-02T00:00:00.000Z') }),
					defaultData('003', { updatedAt: new Date('2021-01-03T00:00:00.000Z') }),
				]);

				const actual = await call({
					query: {
						updatedAtFrom: '2021-01-02T00:00:00.000Z',
					},
				});

				expect(actual.allCount).toBe(2);
				expect(actual.emojis[0].name).toBe('emoji002');
				expect(actual.emojis[1].name).toBe('emoji003');
			});

			test('updatedAtTo', async () => {
				await insert([
					defaultData('001', { updatedAt: new Date('2021-01-01T00:00:00.000Z') }),
					defaultData('002', { updatedAt: new Date('2021-01-02T00:00:00.000Z') }),
					defaultData('003', { updatedAt: new Date('2021-01-03T00:00:00.000Z') }),
				]);

				const actual = await call({
					query: {
						updatedAtTo: '2021-01-02T00:00:00.000Z',
					},
				});

				expect(actual.allCount).toBe(2);
				expect(actual.emojis[0].name).toBe('emoji001');
				expect(actual.emojis[1].name).toBe('emoji002');
			});

			describe('name', () => {
				test('single', async () => {
					await insert([
						defaultData('001'),
						defaultData('002'),
					]);

					const actual = await call({
						query: {
							name: 'emoji001',
						},
					});

					expect(actual.allCount).toBe(1);
					expect(actual.emojis[0].name).toBe('emoji001');
				});

				test('multi', async () => {
					await insert([
						defaultData('001'),
						defaultData('002'),
					]);

					const actual = await call({
						query: {
							name: 'emoji001 emoji002',
						},
					});

					expect(actual.allCount).toBe(2);
					expect(actual.emojis[0].name).toBe('emoji001');
					expect(actual.emojis[1].name).toBe('emoji002');
				});

				test('keyword', async () => {
					await insert([
						defaultData('001'),
						defaultData('002'),
						defaultData('003', { name: 'em003' }),
					]);

					const actual = await call({
						query: {
							name: 'oji',
						},
					});

					expect(actual.allCount).toBe(2);
					expect(actual.emojis[0].name).toBe('emoji001');
					expect(actual.emojis[1].name).toBe('emoji002');
				});

				test('escape', async () => {
					await insert([
						defaultData('001'),
					]);

					const actual = await call({
						query: {
							name: '%',
						},
					});

					expect(actual.allCount).toBe(0);
				});
			});

			describe('host', () => {
				test('single', async () => {
					await insert([
						defaultData('001', { host: 'example.com' }),
						defaultData('002', { host: 'example.com' }),
						defaultData('003', { host: '1.example.com' }),
						defaultData('004', { host: '2.example.com' }),
					]);

					const actual = await call({
						query: {
							host: 'example.com',
							hostType: 'remote',
						},
					});

					expect(actual.allCount).toBe(4);
				});

				test('multi', async () => {
					await insert([
						defaultData('001', { host: 'example.com' }),
						defaultData('002', { host: 'example.com' }),
						defaultData('003', { host: '1.example.com' }),
						defaultData('004', { host: '2.example.com' }),
					]);

					const actual = await call({
						query: {
							host: '1.example.com 2.example.com',
							hostType: 'remote',
						},
					});

					expect(actual.allCount).toBe(2);
					expect(actual.emojis[0].name).toBe('emoji003');
					expect(actual.emojis[1].name).toBe('emoji004');
				});

				test('keyword', async () => {
					await insert([
						defaultData('001', { host: 'example.com' }),
						defaultData('002', { host: 'example.com' }),
						defaultData('003', { host: '1.example.com' }),
						defaultData('004', { host: '2.example.com' }),
					]);

					const actual = await call({
						query: {
							host: 'example',
							hostType: 'remote',
						},
					});

					expect(actual.allCount).toBe(4);
				});

				test('escape', async () => {
					await insert([
						defaultData('001', { host: 'example.com' }),
					]);

					const actual = await call({
						query: {
							host: '%',
							hostType: 'remote',
						},
					});

					expect(actual.allCount).toBe(0);
				});
			});

			describe('uri', () => {
				test('single', async () => {
					await insert([
						defaultData('001', { uri: 'uri001' }),
						defaultData('002', { uri: 'uri002' }),
						defaultData('003', { uri: 'uri003' }),
					]);

					const actual = await call({
						query: {
							uri: 'uri002',
						},
					});

					expect(actual.allCount).toBe(1);
					expect(actual.emojis[0].name).toBe('emoji002');
				});

				test('multi', async () => {
					await insert([
						defaultData('001', { uri: 'uri001' }),
						defaultData('002', { uri: 'uri002' }),
						defaultData('003', { uri: 'uri003' }),
					]);

					const actual = await call({
						query: {
							uri: 'uri001 uri003',
						},
					});

					expect(actual.allCount).toBe(2);
					expect(actual.emojis[0].name).toBe('emoji001');
					expect(actual.emojis[1].name).toBe('emoji003');
				});

				test('keyword', async () => {
					await insert([
						defaultData('001', { uri: 'uri001' }),
						defaultData('002', { uri: 'uri002' }),
						defaultData('003', { uri: 'uri003' }),
					]);

					const actual = await call({
						query: {
							uri: 'ri',
						},
					});

					expect(actual.allCount).toBe(3);
				});

				test('escape', async () => {
					await insert([
						defaultData('001', { uri: 'uri001' }),
					]);

					const actual = await call({
						query: {
							uri: '%',
						},
					});

					expect(actual.allCount).toBe(0);
				});
			});

			describe('publicUrl', () => {
				test('single', async () => {
					await insert([
						defaultData('001', { publicUrl: 'publicUrl001' }),
						defaultData('002', { publicUrl: 'publicUrl002' }),
						defaultData('003', { publicUrl: 'publicUrl003' }),
					]);

					const actual = await call({
						query: {
							publicUrl: 'publicUrl002',
						},
					});

					expect(actual.allCount).toBe(1);
					expect(actual.emojis[0].name).toBe('emoji002');
				});

				test('multi', async () => {
					await insert([
						defaultData('001', { publicUrl: 'publicUrl001' }),
						defaultData('002', { publicUrl: 'publicUrl002' }),
						defaultData('003', { publicUrl: 'publicUrl003' }),
					]);

					const actual = await call({
						query: {
							publicUrl: 'publicUrl001 publicUrl003',
						},
					});

					expect(actual.allCount).toBe(2);
					expect(actual.emojis[0].name).toBe('emoji001');
					expect(actual.emojis[1].name).toBe('emoji003');
				});

				test('keyword', async () => {
					await insert([
						defaultData('001', { publicUrl: 'publicUrl001' }),
						defaultData('002', { publicUrl: 'publicUrl002' }),
						defaultData('003', { publicUrl: 'publicUrl003' }),
					]);

					const actual = await call({
						query: {
							publicUrl: 'Url',
						},
					});

					expect(actual.allCount).toBe(3);
				});

				test('escape', async () => {
					await insert([
						defaultData('001', { publicUrl: 'publicUrl001' }),
					]);

					const actual = await call({
						query: {
							publicUrl: '%',
						},
					});

					expect(actual.allCount).toBe(0);
				});
			});

			describe('type', () => {
				test('single', async () => {
					await insert([
						defaultData('001', { type: 'type001' }),
						defaultData('002', { type: 'type002' }),
						defaultData('003', { type: 'type003' }),
					]);

					const actual = await call({
						query: {
							type: 'type002',
						},
					});

					expect(actual.allCount).toBe(1);
					expect(actual.emojis[0].name).toBe('emoji002');
				});

				test('multi', async () => {
					await insert([
						defaultData('001', { type: 'type001' }),
						defaultData('002', { type: 'type002' }),
						defaultData('003', { type: 'type003' }),
					]);

					const actual = await call({
						query: {
							type: 'type001 type003',
						},
					});

					expect(actual.allCount).toBe(2);
					expect(actual.emojis[0].name).toBe('emoji001');
					expect(actual.emojis[1].name).toBe('emoji003');
				});

				test('keyword', async () => {
					await insert([
						defaultData('001', { type: 'type001' }),
						defaultData('002', { type: 'type002' }),
						defaultData('003', { type: 'type003' }),
					]);

					const actual = await call({
						query: {
							type: 'pe',
						},
					});

					expect(actual.allCount).toBe(3);
				});

				test('escape', async () => {
					await insert([
						defaultData('001', { type: 'type001' }),
					]);

					const actual = await call({
						query: {
							type: '%',
						},
					});

					expect(actual.allCount).toBe(0);
				});
			});

			describe('aliases', () => {
				test('single', async () => {
					await insert([
						defaultData('001', { aliases: ['alias001', 'alias002'] }),
						defaultData('002', { aliases: ['alias002'] }),
						defaultData('003', { aliases: ['alias003'] }),
					]);

					const actual = await call({
						query: {
							aliases: 'alias002',
						},
					});

					expect(actual.allCount).toBe(2);
					expect(actual.emojis[0].name).toBe('emoji001');
					expect(actual.emojis[1].name).toBe('emoji002');
				});

				test('multi', async () => {
					await insert([
						defaultData('001', { aliases: ['alias001', 'alias002'] }),
						defaultData('002', { aliases: ['alias002', 'alias004'] }),
						defaultData('003', { aliases: ['alias003'] }),
						defaultData('004', { aliases: ['alias004'] }),
					]);

					const actual = await call({
						query: {
							aliases: 'alias001 alias004',
						},
					});

					expect(actual.allCount).toBe(3);
					expect(actual.emojis[0].name).toBe('emoji001');
					expect(actual.emojis[1].name).toBe('emoji002');
					expect(actual.emojis[2].name).toBe('emoji004');
				});

				test('keyword', async () => {
					await insert([
						defaultData('001', { aliases: ['alias001', 'alias002'] }),
						defaultData('002', { aliases: ['alias002', 'alias004'] }),
						defaultData('003', { aliases: ['alias003'] }),
						defaultData('004', { aliases: ['alias004'] }),
					]);

					const actual = await call({
						query: {
							aliases: 'ias',
						},
					});

					expect(actual.allCount).toBe(4);
				});

				test('escape', async () => {
					await insert([
						defaultData('001', { aliases: ['alias001', 'alias002'] }),
					]);

					const actual = await call({
						query: {
							aliases: '%',
						},
					});

					expect(actual.allCount).toBe(0);
				});
			});

			describe('category', () => {
				test('single', async () => {
					await insert([
						defaultData('001', { category: 'category001' }),
						defaultData('002', { category: 'category002' }),
						defaultData('003', { category: 'category003' }),
					]);

					const actual = await call({
						query: {
							category: 'category002',
						},
					});

					expect(actual.allCount).toBe(1);
					expect(actual.emojis[0].name).toBe('emoji002');
				});

				test('multi', async () => {
					await insert([
						defaultData('001', { category: 'category001' }),
						defaultData('002', { category: 'category002' }),
						defaultData('003', { category: 'category003' }),
					]);

					const actual = await call({
						query: {
							category: 'category001 category003',
						},
					});

					expect(actual.allCount).toBe(2);
					expect(actual.emojis[0].name).toBe('emoji001');
					expect(actual.emojis[1].name).toBe('emoji003');
				});

				test('keyword', async () => {
					await insert([
						defaultData('001', { category: 'category001' }),
						defaultData('002', { category: 'category002' }),
						defaultData('003', { category: 'category003' }),
					]);

					const actual = await call({
						query: {
							category: 'egory',
						},
					});

					expect(actual.allCount).toBe(3);
				});

				test('escape', async () => {
					await insert([
						defaultData('001', { category: 'category001' }),
					]);

					const actual = await call({
						query: {
							category: '%',
						},
					});

					expect(actual.allCount).toBe(0);
				});
			});

			describe('license', () => {
				test('single', async () => {
					await insert([
						defaultData('001', { license: 'license001' }),
						defaultData('002', { license: 'license002' }),
						defaultData('003', { license: 'license003' }),
					]);

					const actual = await call({
						query: {
							license: 'license002',
						},
					});

					expect(actual.allCount).toBe(1);
					expect(actual.emojis[0].name).toBe('emoji002');
				});

				test('multi', async () => {
					await insert([
						defaultData('001', { license: 'license001' }),
						defaultData('002', { license: 'license002' }),
						defaultData('003', { license: 'license003' }),
					]);

					const actual = await call({
						query: {
							license: 'license001 license003',
						},
					});

					expect(actual.allCount).toBe(2);
					expect(actual.emojis[0].name).toBe('emoji001');
					expect(actual.emojis[1].name).toBe('emoji003');
				});

				test('keyword', async () => {
					await insert([
						defaultData('001', { license: 'license001' }),
						defaultData('002', { license: 'license002' }),
						defaultData('003', { license: 'license003' }),
					]);

					const actual = await call({
						query: {
							license: 'cense',
						},
					});

					expect(actual.allCount).toBe(3);
				});

				test('escape', async () => {
					await insert([
						defaultData('001', { license: 'license001' }),
					]);

					const actual = await call({
						query: {
							license: '%',
						},
					});

					expect(actual.allCount).toBe(0);
				});
			});

			describe('isSensitive', () => {
				test('true', async () => {
					await insert([
						defaultData('001', { isSensitive: true }),
						defaultData('002', { isSensitive: false }),
						defaultData('003', { isSensitive: true }),
					]);

					const actual = await call({
						query: {
							isSensitive: true,
						},
					});

					expect(actual.allCount).toBe(2);
					expect(actual.emojis[0].name).toBe('emoji001');
					expect(actual.emojis[1].name).toBe('emoji003');
				});

				test('false', async () => {
					await insert([
						defaultData('001', { isSensitive: true }),
						defaultData('002', { isSensitive: false }),
						defaultData('003', { isSensitive: true }),
					]);

					const actual = await call({
						query: {
							isSensitive: false,
						},
					});

					expect(actual.allCount).toBe(1);
					expect(actual.emojis[0].name).toBe('emoji002');
				});

				test('null', async () => {
					await insert([
						defaultData('001', { isSensitive: true }),
						defaultData('002', { isSensitive: false }),
						defaultData('003', { isSensitive: true }),
					]);

					const actual = await call({
						query: {},
					});

					expect(actual.allCount).toBe(3);
				});
			});

			describe('localOnly', () => {
				test('true', async () => {
					await insert([
						defaultData('001', { localOnly: true }),
						defaultData('002', { localOnly: false }),
						defaultData('003', { localOnly: true }),
					]);

					const actual = await call({
						query: {
							localOnly: true,
						},
					});

					expect(actual.allCount).toBe(2);
					expect(actual.emojis[0].name).toBe('emoji001');
					expect(actual.emojis[1].name).toBe('emoji003');
				});

				test('false', async () => {
					await insert([
						defaultData('001', { localOnly: true }),
						defaultData('002', { localOnly: false }),
						defaultData('003', { localOnly: true }),
					]);

					const actual = await call({
						query: {
							localOnly: false,
						},
					});

					expect(actual.allCount).toBe(1);
					expect(actual.emojis[0].name).toBe('emoji002');
				});

				test('null', async () => {
					await insert([
						defaultData('001', { localOnly: true }),
						defaultData('002', { localOnly: false }),
						defaultData('003', { localOnly: true }),
					]);

					const actual = await call({
						query: {},
					});

					expect(actual.allCount).toBe(3);
				});
			});

			describe('roleId', () => {
				test('single', async () => {
					await insert([
						defaultData('001', { roleIdsThatCanBeUsedThisEmojiAsReaction: ['role001'] }),
						defaultData('002', { roleIdsThatCanBeUsedThisEmojiAsReaction: ['role002'] }),
						defaultData('003', { roleIdsThatCanBeUsedThisEmojiAsReaction: ['role003'] }),
					]);

					const actual = await call({
						query: {
							roleIds: ['role002'],
						},
					});

					expect(actual.allCount).toBe(1);
					expect(actual.emojis[0].name).toBe('emoji002');
				});

				test('multi', async () => {
					await insert([
						defaultData('001', { roleIdsThatCanBeUsedThisEmojiAsReaction: ['role001'] }),
						defaultData('002', { roleIdsThatCanBeUsedThisEmojiAsReaction: ['role002', 'role003'] }),
						defaultData('003', { roleIdsThatCanBeUsedThisEmojiAsReaction: ['role003'] }),
						defaultData('004', { roleIdsThatCanBeUsedThisEmojiAsReaction: ['role004'] }),
					]);

					const actual = await call({
						query: {
							roleIds: ['role001', 'role003'],
						},
					});

					expect(actual.allCount).toBe(3);
					expect(actual.emojis[0].name).toBe('emoji001');
					expect(actual.emojis[1].name).toBe('emoji002');
					expect(actual.emojis[2].name).toBe('emoji003');
				});
			});
		});
	});
});
