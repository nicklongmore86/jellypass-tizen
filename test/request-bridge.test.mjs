import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');

function listen(server, port = 0) {
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => resolve(server.address().port));
    });
}

function close(server) {
    return new Promise((resolve) => server.close(resolve));
}

async function availablePort() {
    const server = http.createServer();
    const port = await listen(server);
    await close(server);
    return port;
}

async function waitForHealth(url) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
        try {
            const response = await fetch(url);
            if (response.ok) return;
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Bridge did not become healthy.');
}

test('request bridge keeps the Jellyseerr session server-side and limits relayed operations', async () => {
    const fake = http.createServer(async (request, response) => {
        if (request.url === '/api/v1/auth/jellyfin' && request.method === 'POST') {
            response.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': 'connect.sid=test-session; HttpOnly; Path=/' });
            response.end(JSON.stringify({ jellyfinUserId: 'abc123' }));
            return;
        }
        if (request.url === '/api/v1/discover/trending' && request.headers.cookie === 'connect.sid=test-session') {
            response.writeHead(200, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ results: [{ id: 1, title: 'Verified' }] }));
            return;
        }
        response.writeHead(401, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ message: 'Unauthorized' }));
    });
    const fakePort = await listen(fake);
    const bridgePort = await availablePort();
    const bridge = spawn(process.execPath, [path.join(root, 'bridge/server.mjs')], {
        env: { ...process.env, PORT: String(bridgePort), JELLYSEERR_URL: `http://127.0.0.1:${fakePort}` },
        stdio: 'ignore'
    });

    try {
        const origin = `http://127.0.0.1:${bridgePort}`;
        await waitForHealth(`${origin}/jellyquest-bridge/health`);
        const sessionResponse = await fetch(`${origin}/jellyquest-bridge/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: 'Alex', id: 'abc123' })
        });
        assert.equal(sessionResponse.status, 200);
        const { token } = await sessionResponse.json();
        assert.match(token, /^[a-f0-9]{64}$/);

        const proxyResponse = await fetch(`${origin}/jellyquest-bridge/proxy`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: '/api/v1/discover/trending', options: {} })
        });
        assert.equal(proxyResponse.status, 200);
        assert.equal((await proxyResponse.json()).data.results[0].title, 'Verified');

        const blocked = await fetch(`${origin}/jellyquest-bridge/proxy`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: '/api/v1/settings/main', options: {} })
        });
        assert.equal(blocked.status, 403);
    } finally {
        bridge.kill('SIGTERM');
        await close(fake);
    }
});
