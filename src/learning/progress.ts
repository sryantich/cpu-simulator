/**
 * Progress & Reward System — XP, Levels, Badges, Learning Paths
 *
 * Tracks learner progression through the CPU simulator's learning content.
 * Awards XP for completing exercises, quizzes, tutorials, and running examples.
 * Badges are earned by reaching milestones. Learning paths group tutorials
 * into tracks that unlock sequentially.
 *
 * All state persists to localStorage under 'cpu-sim-learner-profile'.
 */

// ── XP Constants ─────────────────────────────────────────────────

/** XP awarded for various actions */
export const XP_AWARDS = {
  /** Complete an explanation step (just reading) */
  EXPLANATION_READ: 5,
  /** Pass an exercise on first attempt */
  EXERCISE_FIRST_TRY: 50,
  /** Pass an exercise on second attempt */
  EXERCISE_SECOND_TRY: 35,
  /** Pass an exercise on third+ attempt */
  EXERCISE_LATER: 20,
  /** Answer a quiz correctly on first try */
  QUIZ_CORRECT_FIRST: 30,
  /** Answer a quiz correctly after retry */
  QUIZ_CORRECT_RETRY: 15,
  /** Answer a quiz incorrectly (still get some XP for trying) */
  QUIZ_INCORRECT: 5,
  /** Complete all steps of a tutorial (bonus) */
  TUTORIAL_COMPLETE: 100,
  /** Run an example program for the first time */
  EXAMPLE_RUN: 10,
  /** Complete an entire learning track */
  TRACK_COMPLETE: 250,
} as const;

/** Level thresholds — XP required to reach each level */
export const LEVELS: { level: number; title: string; xpRequired: number }[] = [
  { level: 1,  title: 'Newcomer',          xpRequired: 0 },
  { level: 2,  title: 'Bit Pusher',        xpRequired: 50 },
  { level: 3,  title: 'Register Wrangler',  xpRequired: 150 },
  { level: 4,  title: 'Flag Bearer',        xpRequired: 300 },
  { level: 5,  title: 'Loop Master',        xpRequired: 500 },
  { level: 6,  title: 'Memory Walker',      xpRequired: 750 },
  { level: 7,  title: 'Stack Surgeon',      xpRequired: 1050 },
  { level: 8,  title: 'Bit Wizard',         xpRequired: 1400 },
  { level: 9,  title: 'Interrupt Handler',   xpRequired: 1800 },
  { level: 10, title: 'Syscall Sage',       xpRequired: 2300 },
  { level: 11, title: 'Kernel Hacker',      xpRequired: 2900 },
  { level: 12, title: 'OS Architect',       xpRequired: 3600 },
];

// ── Badges ───────────────────────────────────────────────────────

export interface Badge {
  id: string;
  name: string;
  description: string;
  /** Unicode symbol displayed as badge icon */
  icon: string;
  /** Category for grouping in the UI */
  category: 'tutorial' | 'exercise' | 'quiz' | 'exploration' | 'mastery';
  /** Function that checks if the badge is earned */
  check: (profile: LearnerProfile) => boolean;
}

export const BADGES: Badge[] = [
  // ── Tutorial milestones ────────────────────────────────────────
  {
    id: 'first-steps',
    name: 'First Steps',
    description: 'Complete your first tutorial',
    icon: '\u{1F463}',  // footprints
    category: 'tutorial',
    check: (p) => p.completedTutorials.length >= 1,
  },
  {
    id: 'beginner-grad',
    name: 'Beginner Graduate',
    description: 'Complete all beginner tutorials',
    icon: '\u{1F393}',  // graduation cap
    category: 'tutorial',
    check: (p) => {
      const beginnerIds = ['first-program', 'arithmetic', 'flags-conditions', 'loops'];
      return beginnerIds.every(id => p.completedTutorials.includes(id));
    },
  },
  {
    id: 'intermediate-grad',
    name: 'Intermediate Graduate',
    description: 'Complete all intermediate tutorials',
    icon: '\u{1F3C5}',  // medal
    category: 'tutorial',
    check: (p) => {
      const intermediateIds = ['memory', 'functions', 'bitwise'];
      return intermediateIds.every(id => p.completedTutorials.includes(id));
    },
  },
  {
    id: 'kernel-ready',
    name: 'Kernel Ready',
    description: 'Complete all kernel track tutorials',
    icon: '\u{1F9E0}',  // brain
    category: 'tutorial',
    check: (p) => {
      const kernelIds = ['interrupts-exceptions', 'syscalls-deep', 'process-scheduling', 'memory-management'];
      return kernelIds.every(id => p.completedTutorials.includes(id));
    },
  },

  // ── Exercise milestones ────────────────────────────────────────
  {
    id: 'first-solve',
    name: 'Problem Solver',
    description: 'Pass your first exercise',
    icon: '\u{2705}',  // check mark
    category: 'exercise',
    check: (p) => p.exercisesPassed >= 1,
  },
  {
    id: 'five-exercises',
    name: 'Getting Warmed Up',
    description: 'Pass 5 exercises',
    icon: '\u{1F4AA}',  // flexed bicep
    category: 'exercise',
    check: (p) => p.exercisesPassed >= 5,
  },
  {
    id: 'ten-exercises',
    name: 'Exercise Enthusiast',
    description: 'Pass 10 exercises',
    icon: '\u{1F525}',  // fire
    category: 'exercise',
    check: (p) => p.exercisesPassed >= 10,
  },
  {
    id: 'perfect-exercise',
    name: 'First Try!',
    description: 'Pass an exercise on the first attempt',
    icon: '\u{1F31F}',  // star
    category: 'exercise',
    check: (p) => p.firstTryExercises >= 1,
  },
  {
    id: 'five-perfect',
    name: 'Sharpshooter',
    description: 'Pass 5 exercises on first attempt',
    icon: '\u{1F3AF}',  // dart
    category: 'exercise',
    check: (p) => p.firstTryExercises >= 5,
  },

  // ── Quiz milestones ────────────────────────────────────────────
  {
    id: 'quiz-ace',
    name: 'Quiz Ace',
    description: 'Answer 5 quiz questions correctly',
    icon: '\u{1F4A1}',  // light bulb
    category: 'quiz',
    check: (p) => p.quizCorrect >= 5,
  },
  {
    id: 'perfect-quiz-streak',
    name: 'Perfect Streak',
    description: 'Answer 3 quizzes in a row correctly on first try',
    icon: '\u{26A1}',   // lightning
    category: 'quiz',
    check: (p) => p.quizStreak >= 3,
  },

  // ── Exploration badges ─────────────────────────────────────────
  {
    id: 'explorer',
    name: 'Code Explorer',
    description: 'Run 5 different example programs',
    icon: '\u{1F50D}',  // magnifying glass
    category: 'exploration',
    check: (p) => p.examplesRun.length >= 5,
  },
  {
    id: 'completionist',
    name: 'Completionist',
    description: 'Run all example programs',
    icon: '\u{1F30D}',  // globe
    category: 'exploration',
    check: (p) => p.examplesRun.length >= 20,
  },

  // ── Mastery badges ─────────────────────────────────────────────
  {
    id: 'level-5',
    name: 'Loop Master',
    description: 'Reach level 5',
    icon: '\u{1F451}',  // crown
    category: 'mastery',
    check: (p) => getLevel(p.totalXP).level >= 5,
  },
  {
    id: 'level-10',
    name: 'Syscall Sage',
    description: 'Reach level 10',
    icon: '\u{1F48E}',  // gem
    category: 'mastery',
    check: (p) => getLevel(p.totalXP).level >= 10,
  },
  {
    id: 'os-architect',
    name: 'OS Architect',
    description: 'Reach the maximum level',
    icon: '\u{1F3C6}',  // trophy
    category: 'mastery',
    check: (p) => getLevel(p.totalXP).level >= 12,
  },
];

// ── Learning Paths (Tracks) ──────────────────────────────────────

export interface LearningTrack {
  id: string;
  name: string;
  description: string;
  /** Unicode icon */
  icon: string;
  /** Tutorial IDs in order. Completing one unlocks the next. */
  tutorialIds: string[];
  /** Track is visible but locked until prerequisite track is complete */
  prerequisiteTrackId?: string;
}

export const TRACKS: LearningTrack[] = [
  {
    id: 'fundamentals',
    name: 'Assembly Fundamentals',
    description: 'Learn the basics: registers, arithmetic, flags, and loops. The foundation for everything else.',
    icon: '\u{1F3D7}',   // building construction
    tutorialIds: ['first-program', 'arithmetic', 'flags-conditions', 'loops'],
  },
  {
    id: 'intermediate',
    name: 'Intermediate Concepts',
    description: 'Memory operations, function calls, and bit manipulation. Required for kernel programming.',
    icon: '\u{2699}',     // gear
    tutorialIds: ['memory', 'functions', 'bitwise'],
    prerequisiteTrackId: 'fundamentals',
  },
  {
    id: 'kernel',
    name: 'Kernel Programming',
    description: 'Build a working kernel: interrupts, syscalls, scheduling, and memory management.',
    icon: '\u{1F9E9}',   // puzzle
    tutorialIds: ['interrupts-exceptions', 'syscalls-deep', 'process-scheduling', 'memory-management'],
    prerequisiteTrackId: 'intermediate',
  },
];

// ── Learner Profile ──────────────────────────────────────────────

export interface LearnerProfile {
  /** Total XP earned across all activities */
  totalXP: number;
  /** XP history: [timestamp, amount, reason] */
  xpLog: [number, number, string][];
  /** IDs of completed tutorials */
  completedTutorials: string[];
  /** Total exercises passed */
  exercisesPassed: number;
  /** Exercises passed on first try */
  firstTryExercises: number;
  /** Total quiz questions answered correctly */
  quizCorrect: number;
  /** Total quiz questions answered */
  quizTotal: number;
  /** Current streak of first-try correct quiz answers */
  quizStreak: number;
  /** Best quiz streak ever */
  bestQuizStreak: number;
  /** Example program IDs that have been run */
  examplesRun: string[];
  /** Badge IDs that have been awarded */
  earnedBadges: string[];
  /** Steps where XP has already been awarded (prevent double-counting) */
  xpAwardedSteps: string[];
  /** Examples where XP has already been awarded */
  xpAwardedExamples: string[];
}

// ── Profile management ───────────────────────────────────────────

const PROFILE_KEY = 'cpu-sim-learner-profile';

export function createProfile(): LearnerProfile {
  return {
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
  };
}

export function loadProfile(): LearnerProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return createProfile();
    const data = JSON.parse(raw);
    return {
      totalXP: data.totalXP ?? 0,
      xpLog: data.xpLog ?? [],
      completedTutorials: data.completedTutorials ?? [],
      exercisesPassed: data.exercisesPassed ?? 0,
      firstTryExercises: data.firstTryExercises ?? 0,
      quizCorrect: data.quizCorrect ?? 0,
      quizTotal: data.quizTotal ?? 0,
      quizStreak: data.quizStreak ?? 0,
      bestQuizStreak: data.bestQuizStreak ?? 0,
      examplesRun: data.examplesRun ?? [],
      earnedBadges: data.earnedBadges ?? [],
      xpAwardedSteps: data.xpAwardedSteps ?? [],
      xpAwardedExamples: data.xpAwardedExamples ?? [],
    };
  } catch {
    return createProfile();
  }
}

export function saveProfile(profile: LearnerProfile): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // Silently fail
  }
}

export function resetProfile(): void {
  try {
    localStorage.removeItem(PROFILE_KEY);
  } catch {
    // ignore
  }
}

// ── XP operations ────────────────────────────────────────────────

export interface XPEvent {
  amount: number;
  reason: string;
  newTotal: number;
  levelUp: boolean;
  oldLevel: number;
  newLevel: number;
  newBadges: Badge[];
}

/** Award XP and check for level-ups and new badges. Returns event details. */
export function awardXP(profile: LearnerProfile, amount: number, reason: string): XPEvent {
  const oldLevel = getLevel(profile.totalXP).level;
  profile.totalXP += amount;
  profile.xpLog.push([Date.now(), amount, reason]);

  // Keep log capped at 200 entries
  if (profile.xpLog.length > 200) {
    profile.xpLog = profile.xpLog.slice(-200);
  }

  const newLevelInfo = getLevel(profile.totalXP);
  const levelUp = newLevelInfo.level > oldLevel;

  // Check for new badges
  const newBadges = checkNewBadges(profile);

  saveProfile(profile);

  return {
    amount,
    reason,
    newTotal: profile.totalXP,
    levelUp,
    oldLevel,
    newLevel: newLevelInfo.level,
    newBadges,
  };
}

/** Award XP for a step, but only if not already awarded for that step */
export function awardStepXP(
  profile: LearnerProfile,
  stepId: string,
  amount: number,
  reason: string
): XPEvent | null {
  if (profile.xpAwardedSteps.includes(stepId)) return null;
  profile.xpAwardedSteps.push(stepId);
  return awardXP(profile, amount, reason);
}

/** Award XP for running an example, but only once per example */
export function awardExampleXP(
  profile: LearnerProfile,
  exampleId: string
): XPEvent | null {
  if (profile.xpAwardedExamples.includes(exampleId)) return null;
  profile.xpAwardedExamples.push(exampleId);
  if (!profile.examplesRun.includes(exampleId)) {
    profile.examplesRun.push(exampleId);
  }
  return awardXP(profile, XP_AWARDS.EXAMPLE_RUN, `Ran example: ${exampleId}`);
}

// ── Level utilities ──────────────────────────────────────────────

export function getLevel(xp: number): { level: number; title: string; xpRequired: number } {
  let result = LEVELS[0];
  for (const l of LEVELS) {
    if (xp >= l.xpRequired) result = l;
    else break;
  }
  return result;
}

export function getNextLevel(xp: number): { level: number; title: string; xpRequired: number } | null {
  const current = getLevel(xp);
  const idx = LEVELS.findIndex(l => l.level === current.level);
  if (idx < LEVELS.length - 1) return LEVELS[idx + 1];
  return null;
}

/** Get progress percentage toward next level (0-100) */
export function getLevelProgress(xp: number): number {
  const current = getLevel(xp);
  const next = getNextLevel(xp);
  if (!next) return 100; // Max level
  const range = next.xpRequired - current.xpRequired;
  const progress = xp - current.xpRequired;
  return Math.min(100, Math.round((progress / range) * 100));
}

// ── Badge utilities ──────────────────────────────────────────────

/** Check for any newly earned badges and add them to profile */
export function checkNewBadges(profile: LearnerProfile): Badge[] {
  const newBadges: Badge[] = [];
  for (const badge of BADGES) {
    if (!profile.earnedBadges.includes(badge.id) && badge.check(profile)) {
      profile.earnedBadges.push(badge.id);
      newBadges.push(badge);
    }
  }
  return newBadges;
}

/** Get all badges with their earned status */
export function getBadgesWithStatus(profile: LearnerProfile): (Badge & { earned: boolean })[] {
  return BADGES.map(b => ({ ...b, earned: profile.earnedBadges.includes(b.id) }));
}

// ── Track utilities ──────────────────────────────────────────────

/** Check if a track is unlocked (prerequisite complete or no prerequisite) */
export function isTrackUnlocked(track: LearningTrack, profile: LearnerProfile): boolean {
  if (!track.prerequisiteTrackId) return true;
  const prereq = TRACKS.find(t => t.id === track.prerequisiteTrackId);
  if (!prereq) return true;
  return prereq.tutorialIds.every(id => profile.completedTutorials.includes(id));
}

/** Get completion percentage for a track */
export function getTrackProgress(track: LearningTrack, profile: LearnerProfile): number {
  const completed = track.tutorialIds.filter(id => profile.completedTutorials.includes(id)).length;
  return Math.round((completed / track.tutorialIds.length) * 100);
}

/** Check if a track is fully complete */
export function isTrackComplete(track: LearningTrack, profile: LearnerProfile): boolean {
  return track.tutorialIds.every(id => profile.completedTutorials.includes(id));
}

/** Get the next tutorial to do in a track (first incomplete one) */
export function getNextTutorialInTrack(
  track: LearningTrack,
  profile: LearnerProfile
): string | null {
  return track.tutorialIds.find(id => !profile.completedTutorials.includes(id)) ?? null;
}
