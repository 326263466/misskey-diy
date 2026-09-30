/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import test from 'node:test';
import { assertDevPortsAvailable } from './lib/dev-server.mjs';

async function listen(server, port = 0) {
	await new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen({ port, host: '0.0.0.0', exclusive: true }, resolve);
	});
	return server.address().port;
}

async function close(server) {
	await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

test('an occupied development port blocks startup without stopping its server', async () => {
	const server = createServer();
	const port = await listen(server);
	try {
		await assert.rejects(assertDevPortsAvailable([port]), error => {
			assert.match(error.message, new RegExp(`port ${port} is already in use`));
			assert.equal(error.cause.code, 'EADDRINUSE');
			return true;
		});
		assert.equal(server.listening, true);
	} finally {
		await close(server);
	}
});

test('a successful preflight releases the port for the development server', async () => {
	const server = createServer();
	const port = await listen(server);
	await close(server);
	await assertDevPortsAvailable([port]);
	await listen(server, port);
	await close(server);
});

test('a later occupied port leaves earlier checked ports available', async () => {
	const firstServer = createServer();
	const firstPort = await listen(firstServer);
	const secondServer = createServer();
	const secondPort = await listen(secondServer);
	await close(firstServer);
	try {
		await assert.rejects(assertDevPortsAvailable([firstPort, secondPort]));
		await listen(firstServer, firstPort);
	} finally {
		await close(secondServer);
		if (firstServer.listening) await close(firstServer);
	}
});
