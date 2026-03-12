/**
 * Auth State - manages user authentication state and syncs with backend
 */

import { apiFetch, storeTokens, clearTokens, getAccessToken } from './api-client';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
}

type AuthListener = (user: AuthUser | null) => void;

let currentUser: AuthUser | null = null;
const listeners: AuthListener[] = [];

// ── Getters ──────────────────────────────────────────────────────────────────
export function getUser(): AuthUser | null {
  return currentUser;
}

export function isLoggedIn(): boolean {
  return currentUser !== null;
}

// ── Listeners ────────────────────────────────────────────────────────────────
export function onAuthChange(fn: AuthListener): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

function notifyListeners() {
  for (const fn of listeners) {
    try { fn(currentUser); } catch { /* ignore */ }
  }
}

// ── Actions ──────────────────────────────────────────────────────────────────

/** Register a new account */
export async function register(email: string, password: string, displayName: string): Promise<{ ok: boolean; error?: string }> {
  const { ok, data } = await apiFetch<{
    user: AuthUser;
    accessToken: string;
    refreshToken: string;
    error?: string;
  }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, displayName }),
  });

  if (!ok) {
    return { ok: false, error: (data as { error?: string })?.error || 'Registration failed' };
  }

  storeTokens(data.accessToken, data.refreshToken);
  currentUser = data.user;
  notifyListeners();
  return { ok: true };
}

/** Log in with email/password */
export async function login(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const { ok, data } = await apiFetch<{
    user: AuthUser;
    accessToken: string;
    refreshToken: string;
    error?: string;
  }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  if (!ok) {
    return { ok: false, error: (data as { error?: string })?.error || 'Login failed' };
  }

  storeTokens(data.accessToken, data.refreshToken);
  currentUser = data.user;
  notifyListeners();
  return { ok: true };
}

/** Log out */
export async function logout(): Promise<void> {
  try {
    await apiFetch('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: localStorage.getItem('cpu-sim-refresh-token') }),
    });
  } catch { /* best-effort */ }

  clearTokens();
  currentUser = null;
  notifyListeners();
}

/** Try to restore session from stored tokens (call on app startup) */
export async function restoreSession(): Promise<void> {
  if (!getAccessToken()) return;

  const { ok, data } = await apiFetch<{ user: AuthUser }>('/auth/me');
  if (ok && data?.user) {
    currentUser = data.user;
    notifyListeners();
  } else {
    clearTokens();
  }
}

/**
 * Handle OAuth callback: reads tokens from URL hash fragment,
 * stores them, and cleans up the URL. Call before restoreSession().
 * Returns true if tokens were found and stored.
 */
export function handleOAuthCallback(): boolean {
  if (!window.location.pathname.endsWith('/auth/callback')) return false;

  const hash = window.location.hash.slice(1); // remove '#'
  if (!hash) {
    // Check for error
    window.history.replaceState(null, '', '/');
    return false;
  }

  const params = new URLSearchParams(hash);
  const error = params.get('error');
  if (error) {
    console.warn('OAuth error:', error);
    window.history.replaceState(null, '', '/');
    return false;
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) {
    storeTokens(accessToken, refreshToken);
    // Clean up URL — go to root
    window.history.replaceState(null, '', '/');
    return true;
  }

  window.history.replaceState(null, '', '/');
  return false;
}
