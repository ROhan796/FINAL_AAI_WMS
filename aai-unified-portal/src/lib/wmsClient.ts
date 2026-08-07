/**
 * Server-side WMS Backend client with automatic JWT token management.
 * Supports two service accounts:
 *   - Operator (read-only dashboard access)
 *   - Supervisor (write operations: acknowledge/resolve incidents)
 *
 * Tokens are cached in module-level memory — NEVER sent to the browser.
 * Uses Node.js https module.
 */

import https from 'https';
import http from 'http';

const WMS_BASE_URL = process.env.WMS_BACKEND_URL ?? process.env.NEXT_PUBLIC_WMS_API_URL ?? '';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const OPERATOR_USER = process.env.WMS_JWT_OPERATOR_USER ?? '';
const OPERATOR_PASS = process.env.WMS_JWT_OPERATOR_PASS ?? '';
const SUPERVISOR_USER = process.env.WMS_JWT_SUPERVISOR_USER ?? '';
const SUPERVISOR_PASS = process.env.WMS_JWT_SUPERVISOR_PASS ?? '';

interface TokenCache {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/** Per-role token caches so operator reads don't interfere with supervisor writes. */
const caches: Record<string, TokenCache | null> = {
  operator: null,
  supervisor: null,
};

const httpsAgent = new https.Agent({
  rejectUnauthorized: !IS_PRODUCTION,
  keepAlive: true,
  maxSockets: 10,
  maxFreeSockets: 5,
  timeout: 30000,
});

const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 10,
  maxFreeSockets: 5,
  timeout: 30000,
});

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function rawRequest(
  method: string,
  url: string,
  body?: string,
  authHeader?: string,
  retries = 0,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const mod = isHttps ? https : http;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Connection: 'keep-alive',
    };
    if (authHeader) headers['Authorization'] = authHeader;

    const agent = isHttps ? httpsAgent : httpAgent;

    const req = mod.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method,
        headers,
        agent,
        ...(isHttps ? { rejectUnauthorized: !IS_PRODUCTION } : {}),
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode || 0, body: data }));
      },
    );

    req.on('error', async (err: NodeJS.ErrnoException) => {
      if (retries < MAX_RETRIES && (err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED')) {
        console.warn(`[WMS Client] ${err.code} on ${method} ${url}, retry ${retries + 1}/${MAX_RETRIES}`);
        await sleep(RETRY_DELAY_MS * (retries + 1));
        try {
          const result = await rawRequest(method, url, body, authHeader, retries + 1);
          resolve(result);
        } catch (retryErr) {
          reject(retryErr);
        }
      } else {
        reject(err);
      }
    });

    req.setTimeout(15000, () => req.destroy(new Error('Request timed out')));

    if (body) req.write(body);
    req.end();
  });
}

// ── Token management (per role) ─────────────────────────────────────────────

async function loginAs(role: 'operator' | 'supervisor'): Promise<TokenCache> {
  const user = role === 'supervisor' ? SUPERVISOR_USER : OPERATOR_USER;
  const pass = role === 'supervisor' ? SUPERVISOR_PASS : OPERATOR_PASS;

  if (!user || !pass) {
    throw new Error(`[WMS Client] Missing credentials for role "${role}"`);
  }

  const res = await rawRequest('POST', `${WMS_BASE_URL}/auth/login`, JSON.stringify({ username: user, password: pass }));

  if (res.status !== 200) {
    throw new Error(`[WMS Client] Login failed for ${role}: ${res.status} ${res.body}`);
  }

  const data = JSON.parse(res.body);
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + 13 * 60 * 1000,
  };
}

async function refreshRoleTokens(role: 'operator' | 'supervisor', refreshToken: string): Promise<TokenCache> {
  const res = await rawRequest('POST', `${WMS_BASE_URL}/auth/refresh`, JSON.stringify({ refresh_token: refreshToken }));
  if (res.status !== 200) return loginAs(role);
  const data = JSON.parse(res.body);
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + 13 * 60 * 1000,
  };
}

async function getToken(role: 'operator' | 'supervisor'): Promise<string> {
  const now = Date.now();
  let cache = caches[role];

  if (!cache) {
    cache = await loginAs(role);
    caches[role] = cache;
  }

  if (now >= cache.expiresAt) {
    cache = await refreshRoleTokens(role, cache.refreshToken);
    caches[role] = cache;
  }

  return cache.accessToken;
}

function invalidateToken(role: 'operator' | 'supervisor') {
  caches[role] = null;
}

// ── Typed errors that carry the upstream status code ─────────────────────────

export class WmsApiError extends Error {
  constructor(
    public readonly upstreamStatus: number,
    message: string,
  ) {
    super(message);
    this.name = 'WmsApiError';
  }
}

// ── Authenticated request helpers ────────────────────────────────────────────

async function authedRequest(
  method: string,
  role: 'operator' | 'supervisor',
  path: string,
  body?: unknown,
): Promise<{ status: number; data: any }> {
  const token = await getToken(role);
  const res = await rawRequest(
    method,
    `${WMS_BASE_URL}${path}`,
    body !== undefined ? JSON.stringify(body) : undefined,
    `Bearer ${token}`,
  );

  // On 401 → invalidate and retry once (token may have expired between check and use)
  if (res.status === 401) {
    invalidateToken(role);
    const freshToken = await getToken(role);
    const retryRes = await rawRequest(
      method,
      `${WMS_BASE_URL}${path}`,
      body !== undefined ? JSON.stringify(body) : undefined,
      `Bearer ${freshToken}`,
    );
    if (retryRes.status >= 400) {
      throw new WmsApiError(retryRes.status, `WMS API error: ${retryRes.status} on ${path}`);
    }
    return { status: retryRes.status, data: JSON.parse(retryRes.body) };
  }

  if (res.status >= 400) {
    throw new WmsApiError(res.status, `WMS API error: ${res.status} on ${path}`);
  }

  return { status: res.status, data: JSON.parse(res.body) };
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function wmsGet<T>(path: string): Promise<T> {
  const { data } = await authedRequest('GET', 'operator', path);
  return data as T;
}

export async function wmsPost<T>(path: string, body: unknown): Promise<T> {
  const { data } = await authedRequest('POST', 'operator', path, body);
  return data as T;
}

export async function wmsPut<T>(path: string, body: unknown): Promise<T> {
  const { data } = await authedRequest('PUT', 'operator', path, body);
  return data as T;
}

/** POST with supervisor credentials — for write operations (acknowledge, resolve, etc.). */
export async function wmsPostSupervisor<T>(path: string, body: unknown): Promise<T> {
  const { data } = await authedRequest('POST', 'supervisor', path, body);
  return data as T;
}
