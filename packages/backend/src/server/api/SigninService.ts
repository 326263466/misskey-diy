/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Misskey from 'misskey-js';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import type { SigninsRepository, UserProfilesRepository } from '@/models/_.js';
import { IdService } from '@/core/IdService.js';
import type { MiLocalUser } from '@/models/User.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { SigninEntityService } from '@/core/entities/SigninEntityService.js';
import { bindThis } from '@/decorators.js';
import { EmailService } from '@/core/EmailService.js';
import { NotificationService } from '@/core/NotificationService.js';
import { escapeHtml } from '@/misc/escape-html.js';
import { formatUserAgent } from '@/misc/parse-user-agent.js';
import { assessSigninRisk, normalizeIp, SIGNIN_USER_AGENT_MAX_LENGTH } from '@/misc/signin-risk.js';
import type { SigninFingerprint, SigninRisk } from '@/misc/signin-risk.js';
import type { FastifyRequest, FastifyReply } from 'fastify';

// 足够覆盖常用设备和网络，同时限制单次查询量。
const SIGNIN_HISTORY_LIMIT = 1000;

@Injectable()
export class SigninService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.signinsRepository)
		private signinsRepository: SigninsRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private signinEntityService: SigninEntityService,
		private emailService: EmailService,
		private notificationService: NotificationService,
		private idService: IdService,
		private globalEventService: GlobalEventService,
	) {
	}

	@bindThis
	public signin(request: FastifyRequest, reply: FastifyReply, user: MiLocalUser) {
		setImmediate(async () => {
			const rawUserAgent = request.headers['user-agent'];
			const userAgent = typeof rawUserAgent === 'string' && rawUserAgent !== '' ? rawUserAgent : null;

			// 必须在写入本次记录前读取，否则本次登录会被当成已知设备和网络。
			const history = await this.fetchSigninHistory(user.id);

			const record = await this.signinsRepository.insertOne({
				id: this.idService.gen(),
				userId: user.id,
				ip: request.ip,
				headers: request.headers as any,
				success: true,
			});

			this.globalEventService.publishMainStream(user.id, 'signin', await this.signinEntityService.pack(record));

			const risk = assessSigninRisk({ ip: request.ip, userAgent }, history);
			if (risk == null) return;

			const ip = normalizeIp(request.ip);
			const shortUserAgent = userAgent?.slice(0, SIGNIN_USER_AGENT_MAX_LENGTH) ?? null;

			this.notificationService.createNotification(user.id, 'login', {
				ip,
				userAgent: shortUserAgent,
				...risk,
			});

			const profile = await this.userProfilesRepository.findOneByOrFail({ userId: user.id });
			if (profile.email && profile.emailVerified) {
				this.sendAlertEmail(profile.email, risk, ip, shortUserAgent);
			}
		});

		reply.code(200);
		return {
			finished: true,
			id: user.id,
			i: user.token!,
		} satisfies Misskey.entities.SigninFlowResponse;
	}

	@bindThis
	private async fetchSigninHistory(userId: MiLocalUser['id']): Promise<SigninFingerprint[]> {
		return await this.signinsRepository.query(
			'SELECT "ip", "headers"->>\'user-agent\' AS "userAgent" FROM "signin" WHERE "userId" = $1 AND "success" = TRUE ORDER BY "id" DESC LIMIT $2',
			[userId, SIGNIN_HISTORY_LIMIT],
		) as SigninFingerprint[];
	}

	@bindThis
	private sendAlertEmail(email: string, risk: SigninRisk, ip: string | null, userAgent: string | null) {
		const reason = risk.newNetwork && risk.newDevice
			? '新的设备和网络'
			: risk.newDevice ? '新的设备' : '新的网络';
		const securityUrl = `${this.config.url}/settings/security`;
		const lines = [
			`你的账户已在${reason}上登录。`,
			`IP 地址：${ip ?? '未知'}`,
			// UA 可被攻击者任意填写，只展示固定名单识别出的名称。
			`设备：${formatUserAgent(userAgent) ?? '未知设备'}`,
			'如非本人操作，请立即修改密码，并重新生成登录 Token 使所有设备退出登录。',
		];

		this.emailService.sendEmail(email, '新设备或网络登录提醒',
			[...lines.map(line => escapeHtml(line)), `<a href="${escapeHtml(securityUrl)}">前往安全设置</a>`].join('<br>'),
			[...lines, `安全设置：${securityUrl}`].join('\n'));
	}
}
