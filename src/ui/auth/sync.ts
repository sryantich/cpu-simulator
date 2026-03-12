/**
 * Progress Sync - Bridges localStorage data with the server API
 *
 * Strategy:
 * - On login/register: upload current localStorage data to server (merge favoring
 *   the richer dataset)
 * - On app load (already logged in): pull from server, write to localStorage
 * - On progress change (while logged in): debounced push to server
 */

import { apiFetch } from './api-client';
import { isLoggedIn, onAuthChange } from './auth-state';

// ── localStorage key constants ───────────────────────────────────────────────
const LS_TUTORIAL = 'cpu-sim-tutorial-progress';
const LS_PROFILE = 'cpu-sim-learner-profile';
const LS_THEME = 'cpu-sim-theme';
const LS_ONBOARDING = 'cpu-sim-onboarding-seen';

// ── Debounce timer ───────────────────────────────────────────────────────────
let pushTimer: ReturnType<typeof setTimeout> | null = null;
const PUSH_DELAY = 3000; // 3 seconds after last change

// ── Read from localStorage ───────────────────────────────────────────────────
function readLocalTutorial(): unknown {
  try {
    const raw = localStorage.getItem(LS_TUTORIAL);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function readLocalProfile(): unknown {
  try {
    const raw = localStorage.getItem(LS_PROFILE);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// ── Push to server ───────────────────────────────────────────────────────────
async function pushTutorialProgress(): Promise<void> {
  const data = readLocalTutorial();
  if (!data) return;
  await apiFetch('/progress/tutorial', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

async function pushLearnerProfile(): Promise<void> {
  const data = readLocalProfile();
  if (!data) return;
  await apiFetch('/progress/profile', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

async function pushPreferences(): Promise<void> {
  const theme = localStorage.getItem(LS_THEME) || 'dark';
  const onboardingSeen = localStorage.getItem(LS_ONBOARDING) === '1';

  // Collect splitter sizes
  const splitterSizes: Record<string, number> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('cpu-sim-splitter-')) {
      const id = key.replace('cpu-sim-splitter-', '');
      const val = parseFloat(localStorage.getItem(key) || '');
      if (!isNaN(val)) splitterSizes[id] = val;
    }
  }

  await apiFetch('/preferences', {
    method: 'PUT',
    body: JSON.stringify({ theme, onboardingSeen, splitterSizes }),
  });
}

/** Push all localStorage data to the server */
async function pushAll(): Promise<void> {
  if (!isLoggedIn()) return;
  await Promise.all([
    pushTutorialProgress(),
    pushLearnerProfile(),
    pushPreferences(),
  ]);
}

// ── Pull from server ─────────────────────────────────────────────────────────
async function pullTutorialProgress(): Promise<void> {
  const { ok, data } = await apiFetch<{
    completedSteps: string[];
    completedTutorials: string[];
    quizScores: [string, boolean][];
    exerciseAttempts: [string, number][];
  }>('/progress/tutorial');

  if (ok && data) {
    localStorage.setItem(LS_TUTORIAL, JSON.stringify(data));
  }
}

async function pullLearnerProfile(): Promise<void> {
  const { ok, data } = await apiFetch('/progress/profile');
  if (ok && data) {
    localStorage.setItem(LS_PROFILE, JSON.stringify(data));
  }
}

async function pullPreferences(): Promise<void> {
  const { ok, data } = await apiFetch<{
    theme: string;
    onboardingSeen: boolean;
    splitterSizes: Record<string, number>;
  }>('/preferences');

  if (ok && data) {
    if (data.theme) localStorage.setItem(LS_THEME, data.theme);
    if (data.onboardingSeen) localStorage.setItem(LS_ONBOARDING, '1');
    if (data.splitterSizes) {
      for (const [id, val] of Object.entries(data.splitterSizes)) {
        localStorage.setItem(`cpu-sim-splitter-${id}`, String(val));
      }
    }
  }
}

/** Pull all server data into localStorage */
async function pullAll(): Promise<void> {
  if (!isLoggedIn()) return;
  await Promise.all([
    pullTutorialProgress(),
    pullLearnerProfile(),
    pullPreferences(),
  ]);
}

// ── Merge strategy on login ──────────────────────────────────────────────────
// If the server has data (user logged in before), prefer server data.
// If the server is empty but localStorage has data (first login), push local → server.
async function mergeOnLogin(): Promise<void> {
  const { ok, data: serverProfile } = await apiFetch<{
    totalXP: number;
  }>('/progress/profile');

  if (ok && serverProfile && serverProfile.totalXP > 0) {
    // Server has progress — pull it (server wins)
    await pullAll();
  } else {
    // Server is empty — push local data up
    await pushAll();
  }
}

// ── Debounced push on localStorage changes ───────────────────────────────────
export function schedulePush(): void {
  if (!isLoggedIn()) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushAll().catch(() => { /* silent fail */ });
    pushTimer = null;
  }, PUSH_DELAY);
}

// ── Initialize sync ──────────────────────────────────────────────────────────
export function initSync(): void {
  // On auth change: merge/clear
  onAuthChange((user) => {
    if (user) {
      mergeOnLogin().catch(() => { /* silent */ });
    }
    // On logout: we keep localStorage as-is (offline fallback)
  });

  // If already logged in at startup, pull latest from server
  if (isLoggedIn()) {
    pullAll().catch(() => { /* silent */ });
  }

  // Listen for localStorage changes from other tabs
  window.addEventListener('storage', (e) => {
    if (e.key?.startsWith('cpu-sim-') && isLoggedIn()) {
      schedulePush();
    }
  });

  // Listen for same-tab data changes (fired by saveProgress/saveProfile)
  window.addEventListener('cpu-sim-data-changed', () => {
    if (isLoggedIn()) {
      schedulePush();
    }
  });
}
