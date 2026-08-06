/**
 * Server-side WMS Backend client with automatic JWT token management.
 * Tokens are cached in module-level memory — NEVER sent to the browser.
 * Uses the dashboard_operator service account for read-only dashboard access.
 *
 * Uses Node.js https module.
 * - Production (Render): rejectUnauthorized: true (valid TLS)
 * - Development (local): rejectUnauthorized: false (self-signed certs)
 */

import https from 'https';
import http from 'http';

const WMS_BASE_URL = process.env.WMS_BACKEND_URL ?? process.env.NEXT_PUBLIC_WMS_API_URL ?? '';
const WMS_USER = process.env.WMS_JWT_OPERATOR_USER ?? '';
const WMS_PASS = process.env.WMS_JWT_OPERATOR_PASS ?? '';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

interface TokenCache {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

// Connection keep-alive agent for HTTPS
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

function request(method: string, url: string, body?: string, authHeader?: string, retries = 0): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const mod = isHttps ? https : http;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Connection': 'keep-alive',
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
      }
    );

    req.on('error', async (err: NodeJS.ErrnoException) => {
      // Retry on ECONNRESET or connection refused
      if (retries < MAX_RETRIES && (err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED')) {
        console.warn(`[WMS Client] ${err.code} on ${method} ${url}, retrying (${retries + 1}/${MAX_RETRIES})...`);
        await sleep(RETRY_DELAY_MS * (retries + 1));
        try {
          const result = await request(method, url, body, authHeader, retries + 1);
          resolve(result);
        } catch (retryErr) {
          reject(retryErr);
        }
      } else {
        reject(err);
      }
    });

    req.setTimeout(15000, () => {
      req.destroy(new Error('Request timed out'));
    });

    if (body) req.write(body);
    req.end();
  });
}

async function login(): Promise<TokenCache> {
  const res = await request('POST', `${WMS_BASE_URL}/auth/login`, JSON.stringify({ username: WMS_USER, password: WMS_PASS }));

  if (res.status !== 200) {
    throw new Error(`WMS login failed: ${res.status} ${res.body}`);
  }

  const data = JSON.parse(res.body);
  const now = Date.now();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: now + 13 * 60 * 1000,
  };
}

async function refreshTokens(refreshToken: string): Promise<TokenCache> {
  const res = await request('POST', `${WMS_BASE_URL}/auth/refresh`, JSON.stringify({ refresh_token: refreshToken }));

  if (res.status !== 200) {
    return login();
  }

  const data = JSON.parse(res.body);
  const now = Date.now();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: now + 13 * 60 * 1000,
  };
}

async function getValidToken(): Promise<string> {
  const now = Date.now();

  if (!tokenCache) {
    tokenCache = await login();
    return tokenCache.accessToken;
  }

  if (now >= tokenCache.expiresAt) {
    tokenCache = await refreshTokens(tokenCache.refreshToken);
  }

  return tokenCache.accessToken;
}

export async function wmsGet<T>(path: string): Promise<T> {
  const token = await getValidToken();
  const res = await request('GET', `${WMS_BASE_URL}${path}`, undefined, `Bearer ${token}`);

  if (res.status === 401) {
    tokenCache = null;
    const newToken = await getValidToken();
    const retryRes = await request('GET', `${WMS_BASE_URL}${path}`, undefined, `Bearer ${newToken}`);
    if (retryRes.status !== 200) throw new Error(`WMS API error: ${retryRes.status}`);
    return JSON.parse(retryRes.body);
  }

  if (res.status !== 200) throw new Error(`WMS API error: ${res.status} on ${path}`);
  return JSON.parse(res.body);
}

export async function wmsPost<T>(path: string, body: unknown): Promise<T> {
  const token = await getValidToken();
  const res = await request('POST', `${WMS_BASE_URL}${path}`, JSON.stringify(body), `Bearer ${token}`);

  if (res.status === 401) {
    tokenCache = null;
    const newToken = await getValidToken();
    const retryRes = await request('POST', `${WMS_BASE_URL}${path}`, JSON.stringify(body), `Bearer ${newToken}`);
    if (retryRes.status !== 200) throw new Error(`WMS API error: ${retryRes.status}`);
    return JSON.parse(retryRes.body);
  }

  if (res.status !== 200) throw new Error(`WMS API error: ${res.status} on ${path}`);
  return JSON.parse(res.body);
}

export async function wmsPut<T>(path: string, body: unknown): Promise<T> {
  const token = await getValidToken();
  const res = await request('PUT', `${WMS_BASE_URL}${path}`, JSON.stringify(body), `Bearer ${token}`);

  if (res.status === 401) {
    tokenCache = null;
    const newToken = await getValidToken();
    const retryRes = await request('PUT', `${WMS_BASE_URL}${path}`, JSON.stringify(body), `Bearer ${newToken}`);
    if (retryRes.status !== 200) throw new Error(`WMS API error: ${retryRes.status}`);
    return JSON.parse(retryRes.body);
  }

  if (res.status !== 200) throw new Error(`WMS API error: ${res.status} on ${path}`);
  return JSON.parse(res.body);
}
