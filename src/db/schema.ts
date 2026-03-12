import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  uuid,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// ── Users ────────────────────────────────────────────────────────────────────
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash'), // null for OAuth-only users
  avatarUrl: text('avatar_url'),

  // OAuth provider links (store provider user IDs)
  githubId: text('github_id').unique(),
  googleId: text('google_id').unique(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Refresh tokens (for JWT auth) ────────────────────────────────────────────
export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(), // SHA-256 of the refresh token
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Tutorial progress (mirrors localStorage cpu-sim-tutorial-progress) ───────
// Stored as a single JSON blob per user — the data is tightly coupled and always
// read/written together, so a JSONB column is simpler than normalizing into
// multiple join tables for step IDs.
export const tutorialProgress = pgTable('tutorial_progress', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),

  // Serialized arrays — same shape as localStorage
  completedSteps: jsonb('completed_steps').$type<string[]>().notNull().default([]),
  completedTutorials: jsonb('completed_tutorials').$type<string[]>().notNull().default([]),
  quizScores: jsonb('quiz_scores').$type<[string, boolean][]>().notNull().default([]),
  exerciseAttempts: jsonb('exercise_attempts').$type<[string, number][]>().notNull().default([]),

  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Learner profile (mirrors localStorage cpu-sim-learner-profile) ───────────
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

// ── User preferences (theme, onboarding, splitter sizes) ─────────────────────
export const userPreferences = pgTable('user_preferences', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),

  theme: text('theme').notNull().default('dark'),
  onboardingSeen: boolean('onboarding_seen').notNull().default(false),
  splitterSizes: jsonb('splitter_sizes').$type<Record<string, number>>().notNull().default({}),

  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
