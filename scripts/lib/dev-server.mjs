/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createServer } from 'node:net';

/**
 * Refuse to clean shared build output while a development server still uses it.
 *
 * @param {number[]} ports - Fixed ports required by the development servers.
 * @returns {Promise<void>}
 */
export async function assertDevPortsAvailable(ports) {
	for (const port of ports) {
		await new Promise((resolve, reject) => {
			const server = createServer();
			server.once('error', error => {
				if (error.code === 'EADDRINUSE') {
					reject(new Error(`Development port ${port} is already in use. Stop the previous dev session before running pnpm dev.`, { cause: error }));
				} else {
					reject(error);
				}
			});
			server.listen({ port, host: '0.0.0.0', exclusive: true }, () => {
				server.close(error => error ? reject(error) : resolve());
			});
		});
	}
}
