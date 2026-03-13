import { Hono, type Context, type Next } from 'hono';
import { handle } from 'hono/vercel';
import { cors } from 'hono/cors';
import { eq, sql as rawSql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  pgTable, text, timestamp, boolean, integer, jsonb, uuid,
} from 'drizzle-orm/pg-core';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { scrypt, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

// ═════════════════════════════════════════════════════════════════════════════
// ── Database Schema ──────────────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash'),
  avatarUrl: text('avatar_url'),
  githubId: text('github_id').unique(),
  googleId: text('google_id').unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const tutorialProgress = pgTable('tutorial_progress', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  completedSteps: jsonb('completed_steps').$type<string[]>().notNull().default([]),
  completedTutorials: jsonb('completed_tutorials').$type<string[]>().notNull().default([]),
  quizScores: jsonb('quiz_scores').$type<[string, boolean][]>().notNull().default([]),
  exerciseAttempts: jsonb('exercise_attempts').$type<[string, number][]>().notNull().default([]),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const learnerProfiles = pgTable('learner_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  totalXP: integer('total_xp').notNull().default(0),
  xpLog: jsonb('xp_log').$type<[number, number, string][]>().notNull().default([]),
  completedTutorials: jsonb('completed_tutorials').$type<string[]>().notNull().default([]),
  exercisesPassed: integer('exercises_passed').notNull().default(0),
  firstTryExercises: integer('first_try_exercises').notNull().default(0),
  quizCorrect: integer('quiz_correct').notNull().default(0),
  quizTotal: integer('quiz_total').notNull().default(0),
  quizStreak: integer('quiz_streak').notNull().default(0),
  bestQuizStreak: integer('best_quiz_streak').notNull().default(0),
  examplesRun: jsonb('examples_run').$type<string[]>().notNull().default([]),
  earnedBadges: jsonb('earned_badges').$type<string[]>().notNull().default([]),
  xpAwardedSteps: jsonb('xp_awarded_steps').$type<string[]>().notNull().default([]),
  xpAwardedExamples: jsonb('xp_awarded_examples').$type<string[]>().notNull().default([]),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const userPreferences = pgTable('user_preferences', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  theme: text('theme').notNull().default('dark'),
  onboardingSeen: boolean('onboarding_seen').notNull().default(false),
  splitterSizes: jsonb('splitter_sizes').$type<Record<string, number>>().notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ═════════════════════════════════════════════════════════════════════════════
// ── Database Connection (lazy) ───────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

const schema = { users, sessions, tutorialProgress, learnerProfiles, userPreferences };

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function getDb() {
  if (!_db) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new Error('DATABASE_URL or POSTGRES_URL environment variable is required');
    const sql = postgres(url, { max: 5, idle_timeout: 20, connect_timeout: 10 });
    _db = drizzle(sql, { schema });
  }
  return _db;
}

// Proxy so we can use `db.select(...)` etc. without calling getDb() everywhere
const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    return (getDb() as any)[prop];
  },
});

// ═════════════════════════════════════════════════════════════════════════════
// ── Auth Utilities ───────────────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

const scryptAsync = promisify(scrypt);
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret-change-me');
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 30;

interface TokenPayload extends JWTPayload {
  sub: string;
  email: string;
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return salt + ':' + derivedKey.toString('hex');
}

async function verifyPassword(password: string, hashed: string): Promise<boolean> {
  const [salt, key] = hashed.split(':');
  if (!salt || !key) return false;
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return timingSafeEqual(Buffer.from(key, 'hex'), derivedKey);
}

async function createAccessToken(userId: string, email: string): Promise<string> {
  return new SignJWT({ sub: userId, email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(JWT_SECRET);
}

async function verifyAccessToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as TokenPayload;
  } catch {
    return null;
  }
}

function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function getRefreshTokenExpiry(): Date {
  const d = new Date();
  d.setDate(d.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
  return d;
}

// ═════════════════════════════════════════════════════════════════════════════
// ── Auth Middleware ───────────────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

declare module 'hono' {
  interface ContextVariableMap {
    user: TokenPayload;
  }
}

async function requireAuth(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }
  const token = authHeader.slice(7);
  const payload = await verifyAccessToken(token);
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
  c.set('user', payload);
  await next();
}

// ═════════════════════════════════════════════════════════════════════════════
// ── Hono App & Routes ────────────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

const app = new Hono().basePath('/api');

// ── Global error handler ─────────────────────────────────────────────────────
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

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
  try {
    await db.execute(rawSql`SELECT 1`);
    return c.json({ ok: true, db: 'connected' });
  } catch {
    return c.json({ ok: false, db: 'unreachable' }, 500);
  }
});

// ── Auth: Register ───────────────────────────────────────────────────────────
app.post('/auth/register', async (c) => {
  const body = await c.req.json<{
    email: string;
    password: string;
    displayName: string;
  }>();

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

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, body.email.toLowerCase()))
    .limit(1);
  if (existing.length > 0) {
    return c.json({ error: 'An account with this email already exists' }, 409);
  }

  const pwHash = await hashPassword(body.password);
  const [user] = await db
    .insert(users)
    .values({
      email: body.email.toLowerCase(),
      displayName: body.displayName,
      passwordHash: pwHash,
    })
    .returning({ id: users.id, email: users.email, displayName: users.displayName });

  await Promise.all([
    db.insert(tutorialProgress).values({ userId: user.id }),
    db.insert(learnerProfiles).values({ userId: user.id }),
    db.insert(userPreferences).values({ userId: user.id }),
  ]);

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
    if (session) {
      await db.delete(sessions).where(eq(sessions.id, session.id));
    }
    return c.json({ error: 'Invalid or expired refresh token' }, 401);
  }

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
      totalXP: 0, xpLog: [], completedTutorials: [],
      exercisesPassed: 0, firstTryExercises: 0,
      quizCorrect: 0, quizTotal: 0, quizStreak: 0, bestQuizStreak: 0,
      examplesRun: [], earnedBadges: [], xpAwardedSteps: [], xpAwardedExamples: [],
    });
  }

  return c.json({
    totalXP: row.totalXP, xpLog: row.xpLog,
    completedTutorials: row.completedTutorials,
    exercisesPassed: row.exercisesPassed, firstTryExercises: row.firstTryExercises,
    quizCorrect: row.quizCorrect, quizTotal: row.quizTotal,
    quizStreak: row.quizStreak, bestQuizStreak: row.bestQuizStreak,
    examplesRun: row.examplesRun, earnedBadges: row.earnedBadges,
    xpAwardedSteps: row.xpAwardedSteps, xpAwardedExamples: row.xpAwardedExamples,
  });
});

// ── Progress: Save learner profile ───────────────────────────────────────────
app.put('/progress/profile', requireAuth, async (c) => {
  const { sub } = c.get('user');
  const body = await c.req.json<{
    totalXP: number; xpLog: [number, number, string][];
    completedTutorials: string[]; exercisesPassed: number; firstTryExercises: number;
    quizCorrect: number; quizTotal: number; quizStreak: number; bestQuizStreak: number;
    examplesRun: string[]; earnedBadges: string[];
    xpAwardedSteps: string[]; xpAwardedExamples: string[];
  }>();

  const xpLog = (body.xpLog ?? []).slice(-200);

  const values = {
    userId: sub,
    totalXP: body.totalXP ?? 0, xpLog,
    completedTutorials: body.completedTutorials ?? [],
    exercisesPassed: body.exercisesPassed ?? 0, firstTryExercises: body.firstTryExercises ?? 0,
    quizCorrect: body.quizCorrect ?? 0, quizTotal: body.quizTotal ?? 0,
    quizStreak: body.quizStreak ?? 0, bestQuizStreak: body.bestQuizStreak ?? 0,
    examplesRun: body.examplesRun ?? [], earnedBadges: body.earnedBadges ?? [],
    xpAwardedSteps: body.xpAwardedSteps ?? [], xpAwardedExamples: body.xpAwardedExamples ?? [],
    updatedAt: new Date(),
  };

  await db
    .insert(learnerProfiles)
    .values(values)
    .onConflictDoUpdate({
      target: learnerProfiles.userId,
      set: { ...values, userId: undefined } as any,
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

// ═════════════════════════════════════════════════════════════════════════════
// ── OAuth ────────────────────────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

const APP_URL = process.env.APP_URL || 'http://localhost:5173';

async function findOrCreateOAuthUser(
  provider: 'github' | 'google',
  providerId: string,
  email: string,
  displayName: string,
  avatarUrl: string | null
) {
  const providerCol = provider === 'github' ? users.githubId : users.googleId;

  const [byProvider] = await db
    .select().from(users).where(eq(providerCol, providerId)).limit(1);

  if (byProvider) {
    await db.update(users).set({
      avatarUrl: avatarUrl ?? byProvider.avatarUrl,
      displayName: displayName || byProvider.displayName,
      updatedAt: new Date(),
    }).where(eq(users.id, byProvider.id));
    return { id: byProvider.id, email: byProvider.email, displayName: byProvider.displayName, avatarUrl };
  }

  const [byEmail] = await db
    .select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);

  if (byEmail) {
    await db.update(users).set({
      [provider === 'github' ? 'githubId' : 'googleId']: providerId,
      avatarUrl: avatarUrl ?? byEmail.avatarUrl,
      updatedAt: new Date(),
    }).where(eq(users.id, byEmail.id));
    return { id: byEmail.id, email: byEmail.email, displayName: byEmail.displayName, avatarUrl };
  }

  const [newUser] = await db.insert(users).values({
    email: email.toLowerCase(),
    displayName,
    avatarUrl,
    [provider === 'github' ? 'githubId' : 'googleId']: providerId,
  }).returning({ id: users.id, email: users.email, displayName: users.displayName });

  await Promise.all([
    db.insert(tutorialProgress).values({ userId: newUser.id }),
    db.insert(learnerProfiles).values({ userId: newUser.id }),
    db.insert(userPreferences).values({ userId: newUser.id }),
  ]);

  return { id: newUser.id, email: newUser.email, displayName: newUser.displayName, avatarUrl };
}

async function issueTokensAndRedirect(c: Context, user: { id: string; email: string }) {
  const accessToken = await createAccessToken(user.id, user.email);
  const refreshToken = generateRefreshToken();
  await db.insert(sessions).values({
    userId: user.id,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: getRefreshTokenExpiry(),
  });
  const params = new URLSearchParams({ access_token: accessToken, refresh_token: refreshToken });
  return c.redirect(`${APP_URL}/auth/callback#${params.toString()}`);
}

// ── GitHub OAuth ─────────────────────────────────────────────────────────────
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
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: clientId, client_secret: clientSecret, code,
        redirect_uri: `${APP_URL}/api/auth/github/callback`,
      }),
    });
    const tokenData = await tokenRes.json() as { access_token?: string; error?: string };
    if (!tokenData.access_token) {
      return c.json({ error: 'Failed to get GitHub access token', detail: tokenData.error }, 400);
    }

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

    const primaryEmail = ghEmails.find((e) => e.primary && e.verified)?.email
      ?? ghEmails.find((e) => e.verified)?.email;
    if (!primaryEmail) {
      return c.redirect(`${APP_URL}/auth/callback#error=no_verified_email`);
    }

    const user = await findOrCreateOAuthUser('github', String(ghUser.id), primaryEmail, ghUser.name || ghUser.login, ghUser.avatar_url ?? null);
    return issueTokensAndRedirect(c, user);
  } catch (err) {
    console.error('GitHub OAuth error:', err);
    return c.redirect(`${APP_URL}/auth/callback#error=oauth_failed`);
  }
});

// ── Google OAuth ─────────────────────────────────────────────────────────────
app.get('/auth/google', (c) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return c.json({ error: 'Google OAuth not configured' }, 500);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${APP_URL}/api/auth/google/callback`,
    response_type: 'code', scope: 'openid email profile',
    access_type: 'offline', prompt: 'consent',
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
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: `${APP_URL}/api/auth/google/callback`,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json() as { access_token?: string; error?: string };
    if (!tokenData.access_token) {
      return c.json({ error: 'Failed to get Google access token', detail: tokenData.error }, 400);
    }

    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const gUser = await userRes.json() as {
      id: string; email: string; verified_email: boolean; name: string; picture?: string;
    };

    if (!gUser.email || !gUser.verified_email) {
      return c.redirect(`${APP_URL}/auth/callback#error=no_verified_email`);
    }

    const user = await findOrCreateOAuthUser('google', gUser.id, gUser.email, gUser.name, gUser.picture ?? null);
    return issueTokensAndRedirect(c, user);
  } catch (err) {
    console.error('Google OAuth error:', err);
    return c.redirect(`${APP_URL}/auth/callback#error=oauth_failed`);
  }
});

// ── Auth: Delete account ─────────────────────────────────────────────────────
app.delete('/auth/account', requireAuth, async (c) => {
  const { sub } = c.get('user');
  await db.delete(users).where(eq(users.id, sub));
  return c.json({ ok: true });
});

// ═════════════════════════════════════════════════════════════════════════════
// ── Vercel Serverless Handler Exports ────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const DELETE = handle(app);
export const PATCH = handle(app);
export const OPTIONS = handle(app);

export default app;
