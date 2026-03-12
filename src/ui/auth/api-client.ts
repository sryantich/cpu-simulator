/**
 * API Client - handles authenticated requests with automatic token refresh
 */

const API_BASE = '/api';
const STORAGE_KEY_ACCESS = 'cpu-sim-access-token';
const STORAGE_KEY_REFRESH = 'cpu-sim-refresh-token';

// ── Token storage ────────────────────────────────────────────────────────────
export function getAccessToken(): string | null {
  try { return localStorage.getItem(STORAGE_KEY_ACCESS); } catch { return null; }
}

export function getRefreshToken(): string | null {
  try { return localStorage.getItem(STORAGE_KEY_REFRESH); } catch { return null; }
}

export function storeTokens(access: string, refresh: string) {
  try {
    localStorage.setItem(STORAGE_KEY_ACCESS, access);
    localStorage.setItem(STORAGE_KEY_REFRESH, refresh);
  } catch { /* ignore */ }
}

export function clearTokens() {
  try {
    localStorage.removeItem(STORAGE_KEY_ACCESS);
    localStorage.removeItem(STORAGE_KEY_REFRESH);
  } catch { /* ignore */ }
}

// ── Fetch wrapper with auto-refresh ──────────────────────────────────────────
let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      clearTokens();
      return false;
    }
    const data = await res.json();
    storeTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

/**
 * Make an authenticated API request. Automatically retries once with a
 * refreshed token if the server returns 401.
 */
export async function apiFetch<T = unknown>(
  path: string,
  opts: RequestInit = {},
): Promise<{ ok: boolean; status: number; data: T }> {
  const headers = new Headers(opts.headers);
  if (!headers.has('Content-Type') && opts.body) {
    headers.set('Content-Type', 'application/json');
  }

  const accessToken = getAccessToken();
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  let res = await fetch(`${API_BASE}${path}`, { ...opts, headers });

  // If 401 and we have a refresh token, try to refresh
  if (res.status === 401 && getRefreshToken()) {
    // Dedup concurrent refresh attempts
    if (!refreshPromise) {
      refreshPromise = tryRefresh().finally(() => { refreshPromise = null; });
    }
    const refreshed = await refreshPromise;
    if (refreshed) {
      // Retry the original request with the new token
      const newHeaders = new Headers(opts.headers);
      if (!newHeaders.has('Content-Type') && opts.body) {
        newHeaders.set('Content-Type', 'application/json');
      }
      newHeaders.set('Authorization', `Bearer ${getAccessToken()}`);
      res = await fetch(`${API_BASE}${path}`, { ...opts, headers: newHeaders });
    }
  }

  const data = await res.json().catch(() => null) as T;
  return { ok: res.ok, status: res.status, data };
}
