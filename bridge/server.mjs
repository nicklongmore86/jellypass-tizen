import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';

const port = Number(process.env.PORT || 8080);
const jellyseerrUrl = new URL(process.env.JELLYSEERR_URL || 'http://jellyseerr:5055');
const bridgeHtml = fs.readFileSync(new URL('./bridge.html', import.meta.url));
const sessions = new Map();
const sessionLifetime = 12 * 60 * 60 * 1000;

function json(response, status, value) {
    const body = JSON.stringify(value);
    response.writeHead(status, {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body)
    });
    response.end(body);
}

async function body(request) {
    let value = '';
    for await (const chunk of request) {
        value += chunk;
        if (value.length > 65536) throw new Error('Request body is too large.');
    }
    return value ? JSON.parse(value) : {};
}

function cookieFrom(response) {
    const values = typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie() : [response.headers.get('set-cookie')].filter(Boolean);
    return values.map((value) => value.split(';', 1)[0]).join('; ');
}

async function jellyseerr(path, options = {}, cookie = '') {
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    if (cookie) headers.Cookie = cookie;
    const response = await fetch(new URL(path, jellyseerrUrl), {
        method: options.method || 'GET',
        headers,
        body: options.body
    });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text || `Jellyseerr returned ${response.status}.` }; }
    return { response, data, cookie: cookieFrom(response) || cookie };
}

function allowedRequest(path, options) {
    const method = String(options.method || 'GET').toUpperCase();
    const allowedPath = /^\/api\/v1\/(?:media(?:\?|$)|request(?:\?|$)|search\?|movie\/\d+(?:\?|$)|tv\/\d+(?:\?|$)|discover\/)/.test(path);
    return allowedPath && (method === 'GET' || (method === 'POST' && path === '/api/v1/request'));
}

function bearer(request) {
    const match = String(request.headers.authorization || '').match(/^Bearer ([a-f0-9]{64})$/);
    return match && match[1];
}

function pruneSessions() {
    const now = Date.now();
    for (const [token, session] of sessions) if (session.expires < now) sessions.delete(token);
}

const server = http.createServer(async (request, response) => {
    try {
        if (request.method === 'GET' && request.url === '/jellyquest-bridge/bridge.html') {
            response.writeHead(200, {
                'Cache-Control': 'no-store',
                'Content-Security-Policy': "default-src 'self'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors *",
                'Content-Type': 'text/html; charset=utf-8',
                'Content-Length': bridgeHtml.length
            });
            response.end(bridgeHtml);
            return;
        }
        if (request.method === 'GET' && request.url === '/jellyquest-bridge/health') {
            json(response, 200, { ok: true });
            return;
        }
        if (request.method === 'POST' && request.url === '/jellyquest-bridge/session') {
            const input = await body(request);
            if (typeof input.user !== 'string' || input.user.length < 1 || input.user.length > 128
                    || typeof input.id !== 'string' || !/^[a-fA-F0-9-]{1,64}$/.test(input.id)) {
                json(response, 400, { error: 'Invalid Jellyfin profile.' });
                return;
            }
            const auth = await jellyseerr('/api/v1/auth/jellyfin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: input.user, password: '', email: input.user })
            });
            if (!auth.response.ok || String(auth.data.jellyfinUserId || '').toLowerCase() !== input.id.toLowerCase() || !auth.cookie) {
                json(response, 401, { error: 'Jellyseerr rejected this Jellyfin profile.' });
                return;
            }
            const token = crypto.randomBytes(32).toString('hex');
            sessions.set(token, { cookie: auth.cookie, expires: Date.now() + sessionLifetime });
            pruneSessions();
            json(response, 200, { token });
            return;
        }
        if (request.method === 'POST' && request.url === '/jellyquest-bridge/proxy') {
            const token = bearer(request);
            const session = token && sessions.get(token);
            if (!session || session.expires < Date.now()) {
                if (token) sessions.delete(token);
                json(response, 401, { error: 'Request bridge session expired.' });
                return;
            }
            const input = await body(request);
            if (typeof input.path !== 'string' || !allowedRequest(input.path, input.options || {})) {
                json(response, 403, { error: 'That Jellyseerr operation is not allowed.' });
                return;
            }
            const result = await jellyseerr(input.path, input.options || {}, session.cookie);
            session.cookie = result.cookie;
            session.expires = Date.now() + sessionLifetime;
            if (!result.response.ok || result.response.status === 202) {
                json(response, result.response.status >= 400 ? result.response.status : 409, {
                    error: result.data.message || `Jellyseerr returned ${result.response.status}.`
                });
                return;
            }
            json(response, 200, { data: result.data });
            return;
        }
        json(response, 404, { error: 'Not found.' });
    } catch (error) {
        json(response, 500, { error: error.message || 'Request bridge failed.' });
    }
});

server.listen(port, '0.0.0.0', () => {
    console.info(`JellyQuest request bridge listening on ${port}`);
});
