/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import 'reflect-metadata';
import { EventEmitter } from 'node:events';

process.title = 'Misskey Cli';

Error.stackTraceLimit = Infinity;
EventEmitter.defaultMaxListeners = 128;

// 与服务入口一致，先初始化 Reflect，再加载使用装饰器的模块。
const { NestFactory } = await import('@nestjs/core');
const { CommandModule } = await import('@/cli/CommandModule.js');
const { NestLogger } = await import('@/NestLogger.js');
const { CommandService } = await import('@/cli/CommandService.js');
const { SearchIndexService } = await import('@/core/SearchIndexService.js');

const app = await NestFactory.createApplicationContext(CommandModule, {
	logger: new NestLogger(),
});

const commandService = app.get(CommandService);

const command = process.argv[2] ?? 'help';

switch (command) {
	case 'help': {
		console.log('Available commands:');
		console.log('  help - Displays this help message');
		console.log('  reset-captcha - Resets the captcha');
		console.log('  rebuild-search - Rebuilds note, article and user search indexes');
		break;
	}
	case 'ping': {
		await commandService.ping();
		break;
	}
	case 'reset-captcha': {
		await commandService.resetCaptcha();
		console.log('Captcha has been reset.');
		break;
	}
	case 'rebuild-search': {
		await app.get(SearchIndexService).rebuild();
		console.log('Search indexes rebuilt.');
		break;
	}
	default: {
		console.error(`Unrecognized command: ${command}`);
		console.error('Use "help" to see available commands.');
		process.exit(1);
	}
}

await app.close();
process.exit(0);
