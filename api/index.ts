import { Hono, type Context } from 'hono';
import { handle } from 'hono/vercel';
import { cors } from 'hono/cors';
import { eq, sql as rawSql } from 'drizzle-orm';
import { db } from '../src/db/index';
import {
  users,
  sessions,
  tutorialProgress,
  learnerProfiles,
  userPreferences,
} from '../src/db/schema';
import {
  hashPassword,
  verifyPassword,
  createAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  getRefreshTokenExpiry,
} from '../src/auth/jwt';
import { requireAuth } from '../src/auth/middleware';

const app = new Hono().basePath('/api');

// ── CORS ─────────────────────────────────────────────────────────────────────
app.use(
  '*',
  cors({
    origin: (origin) => origin || '*',
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
);

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', async (c) => {
  const envCheck = {
    DATABASE_URL: !!process.env.DATABASE_URL,
    POSTGRES_URL: !!process.env.POSTGRES_URL,
    JWT_SECRET: !!process.env.JWT_SECRET,
    APP_URL: !!process.env.APP_URL,
  };
  try {
    await db.execute(rawSql`SELECT 1`);
    return c.json({ ok: true, env: envCheck, db: 'connected' });
  } catch (e: any) {
    return c.json({ ok: false, env: envCheck, db: e.message }, 500);
  }
});

// ── Auth: Register ───────────────────────────────────────────────────────────
app.post('/auth/register', async (c) => {
  const body = await c.req.json<{
    email: string;
    password: string;
    displayName: string;
  }>();

  // Validate
  if (!body.email || !body.password || !body.displayName) {
    return c.json({ error: 'email, password, and displayName are required' }, 400);
  }
  if (body.password.length < 8) {
    return c.json({ error: 'Password must be at least 8 characters' }, 400);
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(body.email)) {
    return c.json({ error: 'Invalid email address' }, 400);
  }

  // Check for existing user
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, body.email.toLowerCase()))
    .limit(1);
  if (existing.length > 0) {
    return c.json({ error: 'An account with this email already exists' }, 409);
  }

  // Create user
  const passwordHash = await hashPassword(body.password);
  const [user] = await db
    .insert(users)
    .values({
      email: body.email.toLowerCase(),
      displayName: body.displayName,
      passwordHash,
    })
    .returning({ id: users.id, email: users.email, displayName: users.displayName });

  // Initialize empty progress/profile/preferences
  await Promise.all([
    db.insert(tutorialProgress).values({ userId: user.id }),
    db.insert(learnerProfiles).values({ userId: user.id }),
    db.insert(userPreferences).values({ userId: user.id }),
  ]);

  // Issue tokens
  const accessToken = await createAccessToken(user.id, user.email);
  const refreshToken = generateRefreshToken();
  await db.insert(sessions).values({
    userId: user.id,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: getRefreshTokenExpiry(),
  });

  return c.json({
    user: { id: user.id, email: user.email, displayName: user.displayName },
    accessToken,
    refreshToken,
  }, 201);
});

// ── Auth: Login ──────────────────────────────────────────────────────────────
app.post('/auth/login', async (c) => {
  const body = await c.req.json<{ email: string; password: string }>();
  if (!body.email || !body.password) {
    return c.json({ error: 'email and password are required' }, 400);
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, body.email.toLowerCase()))
    .limit(1);

  if (!user || !user.passwordHash) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  const valid = await verifyPassword(body.password, user.passwordHash);
  if (!valid) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  // Issue tokens
  const accessToken = await createAccessToken(user.id, user.email);
  const refreshToken = generateRefreshToken();
  await db.insert(sessions).values({
    userId: user.id,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: getRefreshTokenExpiry(),
  });

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    },
    accessToken,
    refreshToken,
  });
});

// ── Auth: Refresh token ──────────────────────────────────────────────────────
app.post('/auth/refresh', async (c) => {
  const body = await c.req.json<{ refreshToken: string }>();
  if (!body.refreshToken) {
    return c.json({ error: 'refreshToken is required' }, 400);
  }

  const tokenHash = hashRefreshToken(body.refreshToken);
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);

  if (!session || session.expiresAt < new Date()) {
    // Clean up expired session if it exists
    if (session) {
      await db.delete(sessions).where(eq(sessions.id, session.id));
    }
    return c.json({ error: 'Invalid or expired refresh token' }, 401);
  }

  // Rotate: delete old session, create new one
  await db.delete(sessions).where(eq(sessions.id, session.id));

  const [user] = await db
    .select({ id: users.id, email: users.email, displayName: users.displayName, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user) {
    return c.json({ error: 'User not found' }, 401);
  }

  const accessToken = await createAccessToken(user.id, user.email);
  const newRefreshToken = generateRefreshToken();
  await db.insert(sessions).values({
    userId: user.id,
    tokenHash: hashRefreshToken(newRefreshToken),
    expiresAt: getRefreshTokenExpiry(),
  });

  return c.json({
    user: { id: user.id, email: user.email, displayName: user.displayName, avatarUrl: user.avatarUrl },
    accessToken,
    refreshToken: newRefreshToken,
  });
});

// ── Auth: Logout ─────────────────────────────────────────────────────────────
app.post('/auth/logout', async (c) => {
  const body = await c.req.json<{ refreshToken?: string }>().catch(() => ({} as { refreshToken?: string }));
  if (body.refreshToken) {
    const tokenHash = hashRefreshToken(body.refreshToken);
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
  }
  return c.json({ ok: true });
});

// ── Auth: Get current user ───────────────────────────────────────────────────
app.get('/auth/me', requireAuth, async (c) => {
  const { sub } = c.get('user');
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(eq(users.id, sub))
    .limit(1);

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json({ user });
});

// ── Progress: Get tutorial progress ──────────────────────────────────────────
app.get('/progress/tutorial', requireAuth, async (c) => {
  const { sub } = c.get('user');
  const [row] = await db
    .select()
    .from(tutorialProgress)
    .where(eq(tutorialProgress.userId, sub))
    .limit(1);

  if (!row) {
    return c.json({
      completedSteps: [],
      completedTutorials: [],
      quizScores: [],
      exerciseAttempts: [],
    });
  }

  return c.json({
    completedSteps: row.completedSteps,
    completedTutorials: row.completedTutorials,
    quizScores: row.quizScores,
    exerciseAttempts: row.exerciseAttempts,
  });
});

// ── Progress: Save tutorial progress ─────────────────────────────────────────
app.put('/progress/tutorial', requireAuth, async (c) => {
  const { sub } = c.get('user');
  const body = await c.req.json<{
    completedSteps: string[];
    completedTutorials: string[];
    quizScores: [string, boolean][];
    exerciseAttempts: [string, number][];
  }>();

  await db
    .insert(tutorialProgress)
    .values({
      userId: sub,
      completedSteps: body.completedSteps ?? [],
      completedTutorials: body.completedTutorials ?? [],
      quizScores: body.quizScores ?? [],
      exerciseAttempts: body.exerciseAttempts ?? [],
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: tutorialProgress.userId,
      set: {
        completedSteps: body.completedSteps ?? [],
        completedTutorials: body.completedTutorials ?? [],
        quizScores: body.quizScores ?? [],
        exerciseAttempts: body.exerciseAttempts ?? [],
        updatedAt: new Date(),
      },
    });

  return c.json({ ok: true });
});

// ── Progress: Get learner profile ────────────────────────────────────────────
app.get('/progress/profile', requireAuth, async (c) => {
  const { sub } = c.get('user');
  const [row] = await db
    .select()
    .from(learnerProfiles)
    .where(eq(learnerProfiles.userId, sub))
    .limit(1);

  if (!row) {
    return c.json({
      totalXP: 0,
      xpLog: [],
      completedTutorials: [],
      exercisesPassed: 0,
      firstTryExercises: 0,
      quizCorrect: 0,
      quizTotal: 0,
      quizStreak: 0,
      bestQuizStreak: 0,
      examplesRun: [],
      earnedBadges: [],
      xpAwardedSteps: [],
      xpAwardedExamples: [],
    });
  }

  return c.json({
    totalXP: row.totalXP,
    xpLog: row.xpLog,
    completedTutorials: row.completedTutorials,
    exercisesPassed: row.exercisesPassed,
    firstTryExercises: row.firstTryExercises,
    quizCorrect: row.quizCorrect,
    quizTotal: row.quizTotal,
    quizStreak: row.quizStreak,
    bestQuizStreak: row.bestQuizStreak,
    examplesRun: row.examplesRun,
    earnedBadges: row.earnedBadges,
    xpAwardedSteps: row.xpAwardedSteps,
    xpAwardedExamples: row.xpAwardedExamples,
  });
});

// ── Progress: Save learner profile ───────────────────────────────────────────
app.put('/progress/profile', requireAuth, async (c) => {
  const { sub } = c.get('user');
  const body = await c.req.json<{
    totalXP: number;
    xpLog: [number, number, string][];
    completedTutorials: string[];
    exercisesPassed: number;
    firstTryExercises: number;
    quizCorrect: number;
    quizTotal: number;
    quizStreak: number;
    bestQuizStreak: number;
    examplesRun: string[];
    earnedBadges: string[];
    xpAwardedSteps: string[];
    xpAwardedExamples: string[];
  }>();

  // Cap xpLog at 200 entries (same as frontend)
  const xpLog = (body.xpLog ?? []).slice(-200);

  await db
    .insert(learnerProfiles)
    .values({
      userId: sub,
      totalXP: body.totalXP ?? 0,
      xpLog,
      completedTutorials: body.completedTutorials ?? [],
      exercisesPassed: body.exercisesPassed ?? 0,
      firstTryExercises: body.firstTryExercises ?? 0,
      quizCorrect: body.quizCorrect ?? 0,
      quizTotal: body.quizTotal ?? 0,
      quizStreak: body.quizStreak ?? 0,
      bestQuizStreak: body.bestQuizStreak ?? 0,
      examplesRun: body.examplesRun ?? [],
      earnedBadges: body.earnedBadges ?? [],
      xpAwardedSteps: body.xpAwardedSteps ?? [],
      xpAwardedExamples: body.xpAwardedExamples ?? [],
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: learnerProfiles.userId,
      set: {
        totalXP: body.totalXP ?? 0,
        xpLog,
        completedTutorials: body.completedTutorials ?? [],
        exercisesPassed: body.exercisesPassed ?? 0,
        firstTryExercises: body.firstTryExercises ?? 0,
        quizCorrect: body.quizCorrect ?? 0,
        quizTotal: body.quizTotal ?? 0,
        quizStreak: body.quizStreak ?? 0,
        bestQuizStreak: body.bestQuizStreak ?? 0,
        examplesRun: body.examplesRun ?? [],
        earnedBadges: body.earnedBadges ?? [],
        xpAwardedSteps: body.xpAwardedSteps ?? [],
        xpAwardedExamples: body.xpAwardedExamples ?? [],
        updatedAt: new Date(),
      },
    });

  return c.json({ ok: true });
});

// ── Preferences: Get ─────────────────────────────────────────────────────────
app.get('/preferences', requireAuth, async (c) => {
  const { sub } = c.get('user');
  const [row] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, sub))
    .limit(1);

  if (!row) {
    return c.json({ theme: 'dark', onboardingSeen: false, splitterSizes: {} });
  }

  return c.json({
    theme: row.theme,
    onboardingSeen: row.onboardingSeen,
    splitterSizes: row.splitterSizes,
  });
});

// ── Preferences: Save ────────────────────────────────────────────────────────
app.put('/preferences', requireAuth, async (c) => {
  const { sub } = c.get('user');
  const body = await c.req.json<{
    theme?: string;
    onboardingSeen?: boolean;
    splitterSizes?: Record<string, number>;
  }>();

  // Build update set — only include provided fields
  const updateSet: Record<string, unknown> = { updatedAt: new Date() };
  if (body.theme !== undefined) updateSet.theme = body.theme;
  if (body.onboardingSeen !== undefined) updateSet.onboardingSeen = body.onboardingSeen;
  if (body.splitterSizes !== undefined) updateSet.splitterSizes = body.splitterSizes;

  await db
    .insert(userPreferences)
    .values({
      userId: sub,
      theme: body.theme ?? 'dark',
      onboardingSeen: body.onboardingSeen ?? false,
      splitterSizes: body.splitterSizes ?? {},
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: updateSet,
    });

  return c.json({ ok: true });
});

// ── OAuth helpers ────────────────────────────────────────────────────────────

const APP_URL = process.env.APP_URL || 'http://localhost:5173';

/**
 * After OAuth: find existing user by provider ID or email, or create new.
 * Returns user { id, email, displayName, avatarUrl }.
 */
async function findOrCreateOAuthUser(
  provider: 'github' | 'google',
  providerId: string,
  email: string,
  displayName: string,
  avatarUrl: string | null
) {
  const providerCol = provider === 'github' ? users.githubId : users.googleId;

  // 1. Check by provider ID
  const [byProvider] = await db
    .select()
    .from(users)
    .where(eq(providerCol, providerId))
    .limit(1);

  if (byProvider) {
    // Update avatar/display name if changed
    await db.update(users).set({
      avatarUrl: avatarUrl ?? byProvider.avatarUrl,
      displayName: displayName || byProvider.displayName,
      updatedAt: new Date(),
    }).where(eq(users.id, byProvider.id));
    return { id: byProvider.id, email: byProvider.email, displayName: byProvider.displayName, avatarUrl };
  }

  // 2. Check by email — link provider to existing account
  const [byEmail] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (byEmail) {
    await db.update(users).set({
      [provider === 'github' ? 'githubId' : 'googleId']: providerId,
      avatarUrl: avatarUrl ?? byEmail.avatarUrl,
      updatedAt: new Date(),
    }).where(eq(users.id, byEmail.id));
    return { id: byEmail.id, email: byEmail.email, displayName: byEmail.displayName, avatarUrl };
  }

  // 3. Create new user
  const [newUser] = await db.insert(users).values({
    email: email.toLowerCase(),
    displayName,
    avatarUrl,
    [provider === 'github' ? 'githubId' : 'googleId']: providerId,
  }).returning({ id: users.id, email: users.email, displayName: users.displayName });

  // Initialize empty progress/profile/preferences
  await Promise.all([
    db.insert(tutorialProgress).values({ userId: newUser.id }),
    db.insert(learnerProfiles).values({ userId: newUser.id }),
    db.insert(userPreferences).values({ userId: newUser.id }),
  ]);

  return { id: newUser.id, email: newUser.email, displayName: newUser.displayName, avatarUrl };
}

/**
 * Issue tokens and redirect to frontend with tokens in URL hash.
 * The frontend reads the hash, stores the tokens, and clears the URL.
 */
async function issueTokensAndRedirect(
  c: Context,
  user: { id: string; email: string }
) {
  const accessToken = await createAccessToken(user.id, user.email);
  const refreshToken = generateRefreshToken();
  await db.insert(sessions).values({
    userId: user.id,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: getRefreshTokenExpiry(),
  });

  // Redirect to frontend — tokens in hash fragment (never sent to server)
  const params = new URLSearchParams({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  return c.redirect(`${APP_URL}/auth/callback#${params.toString()}`);
}

// ── OAuth: GitHub ────────────────────────────────────────────────────────────

app.get('/auth/github', (c) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) return c.json({ error: 'GitHub OAuth not configured' }, 500);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${APP_URL}/api/auth/github/callback`,
    scope: 'user:email',
    state: crypto.randomUUID(),
  });
  return c.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
});

app.get('/auth/github/callback', async (c) => {
  const code = c.req.query('code');
  if (!code) return c.json({ error: 'Missing code parameter' }, 400);

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) return c.json({ error: 'GitHub OAuth not configured' }, 500);

  try {
    // Exchange code for access token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: `${APP_URL}/api/auth/github/callback`,
      }),
    });
    const tokenData = await tokenRes.json() as { access_token?: string; error?: string };
    if (!tokenData.access_token) {
      return c.json({ error: 'Failed to get GitHub access token', detail: tokenData.error }, 400);
    }

    // Fetch user info
    const [userRes, emailsRes] = await Promise.all([
      fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': 'cpu-simulator' },
      }),
      fetch('https://api.github.com/user/emails', {
        headers: { Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': 'cpu-simulator' },
      }),
    ]);
    const ghUser = await userRes.json() as { id: number; login: string; name?: string; avatar_url?: string };
    const ghEmails = await emailsRes.json() as { email: string; primary: boolean; verified: boolean }[];

    // Find primary verified email
    const primaryEmail = ghEmails.find((e) => e.primary && e.verified)?.email
      ?? ghEmails.find((e) => e.verified)?.email;
    if (!primaryEmail) {
      return c.redirect(`${APP_URL}/auth/callback#error=no_verified_email`);
    }

    const user = await findOrCreateOAuthUser(
      'github',
      String(ghUser.id),
      primaryEmail,
      ghUser.name || ghUser.login,
      ghUser.avatar_url ?? null
    );

    return issueTokensAndRedirect(c, user);
  } catch (err) {
    console.error('GitHub OAuth error:', err);
    return c.redirect(`${APP_URL}/auth/callback#error=oauth_failed`);
  }
});

// ── OAuth: Google ────────────────────────────────────────────────────────────

app.get('/auth/google', (c) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return c.json({ error: 'Google OAuth not configured' }, 500);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${APP_URL}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
    state: crypto.randomUUID(),
  });
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

app.get('/auth/google/callback', async (c) => {
  const code = c.req.query('code');
  if (!code) return c.json({ error: 'Missing code parameter' }, 400);

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return c.json({ error: 'Google OAuth not configured' }, 500);

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${APP_URL}/api/auth/google/callback`,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json() as { access_token?: string; error?: string };
    if (!tokenData.access_token) {
      return c.json({ error: 'Failed to get Google access token', detail: tokenData.error }, 400);
    }

    // Fetch user info
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const gUser = await userRes.json() as {
      id: string; email: string; verified_email: boolean; name: string; picture?: string;
    };

    if (!gUser.email || !gUser.verified_email) {
      return c.redirect(`${APP_URL}/auth/callback#error=no_verified_email`);
    }

    const user = await findOrCreateOAuthUser(
      'google',
      gUser.id,
      gUser.email,
      gUser.name,
      gUser.picture ?? null
    );

    return issueTokensAndRedirect(c, user);
  } catch (err) {
    console.error('Google OAuth error:', err);
    return c.redirect(`${APP_URL}/auth/callback#error=oauth_failed`);
  }
});

// ── Auth: Delete account ─────────────────────────────────────────────────────
app.delete('/auth/account', requireAuth, async (c) => {
  const { sub } = c.get('user');
  // Cascading deletes handle sessions, progress, profile, preferences
  await db.delete(users).where(eq(users.id, sub));
  return c.json({ ok: true });
});

// ── Vercel serverless handler exports ─────────────────────────────────────────
export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const DELETE = handle(app);
export const PATCH = handle(app);
export const OPTIONS = handle(app);

export default app;
