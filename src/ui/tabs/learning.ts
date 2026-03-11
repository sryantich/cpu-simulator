/**
 * Learning Tab - Tutorials, exercises with validation, and quizzes
 *
 * Renders a sidebar with tutorial navigation and a content area
 * that shows explanations, interactive exercises, and quizzes.
 * Exercises embed a code editor with assemble-and-run + validation.
 */

import type { Simulator } from '../../core/simulator.ts';
import { el } from '../helpers.ts';
import { CPUState } from '../../core/cpu.ts';
import { createHighlightedEditor } from '../syntax-highlight.ts';
import { showXPNotification } from '../xp-notification.ts';
import {
  TUTORIALS,
  createProgress,
  loadProgress,
  saveProgress,
  resetProgress,
  isTutorialComplete,
  getTutorialProgress,
  type Tutorial,
  type TutorialStep,
  type ExplanationStep,
  type ExerciseStep,
  type QuizStep,
  type TutorialProgress,
} from '../../learning/tutorials.ts';
import {
  loadProfile,
  saveProfile,
  resetProfile,
  awardStepXP,
  awardXP,
  getLevel,
  getNextLevel,
  getLevelProgress,
  getBadgesWithStatus,
  checkNewBadges,
  isTrackUnlocked,
  getTrackProgress,
  isTrackComplete,
  getNextTutorialInTrack,
  XP_AWARDS,
  TRACKS,
  BADGES,
  type LearnerProfile,
  type XPEvent,
  type Badge,
} from '../../learning/progress.ts';

// ── Tab creation ─────────────────────────────────────────────────

export function createLearningTab(sim: Simulator): { element: HTMLElement; update: () => void } {
  const container = el('div', { className: 'tab-content learn-tab' });

  // ── State ────────────────────────────────────────────────────
  const progress: TutorialProgress = loadProgress();
  const profile: LearnerProfile = loadProfile();
  let activeTutorialId: string | null = null;
  let activeStepIndex = 0;
  let exerciseAttemptCount = 0;

  /** Sync profile completedTutorials from progress Set */
  function syncProfileTutorials() {
    for (const id of progress.completedTutorials) {
      if (!profile.completedTutorials.includes(id)) {
        profile.completedTutorials.push(id);
      }
    }
    saveProfile(profile);
  }

  // ── Sidebar ──────────────────────────────────────────────────
  const sidebar = el('div', { className: 'learn-sidebar' });
  const contentArea = el('div', { className: 'learn-content' });

  /** Refresh in-memory profile from localStorage (picks up XP earned in other tabs) */
  function refreshProfile() {
    const fresh = loadProfile();
    Object.assign(profile, fresh);
  }

  function buildSidebar() {
    sidebar.innerHTML = '';
    refreshProfile();

    // ── Compact XP / Level display ─────────────────────────────
    const levelInfo = getLevel(profile.totalXP);
    const levelPct = getLevelProgress(profile.totalXP);

    const xpWidget = el('div', { className: 'sidebar-xp-widget', children: [
      el('div', { className: 'sidebar-xp-row', children: [
        el('span', { className: 'sidebar-xp-level', text: `Lv ${levelInfo.level}` }),
        el('span', { className: 'sidebar-xp-title', text: levelInfo.title }),
        el('span', { className: 'sidebar-xp-total', text: `${profile.totalXP} XP` }),
      ]}),
      el('div', { className: 'sidebar-xp-bar', children: [
        el('div', { className: 'sidebar-xp-bar-fill', style: { width: `${levelPct}%` } }),
      ]}),
    ]});
    xpWidget.style.cursor = 'pointer';
    xpWidget.addEventListener('click', () => {
      activeTutorialId = null;
      activeStepIndex = 0;
      buildSidebar();
      renderContent();
    });
    sidebar.appendChild(xpWidget);

    // Group tutorials by difficulty
    const groups: [string, Tutorial[]][] = [
      ['Beginner', TUTORIALS.filter(t => t.difficulty === 'beginner')],
      ['Intermediate', TUTORIALS.filter(t => t.difficulty === 'intermediate')],
      ['Advanced', TUTORIALS.filter(t => t.difficulty === 'advanced')],
    ];

    for (const [label, tutorials] of groups) {
      if (tutorials.length === 0) continue;

      const section = el('div', { className: 'learn-sidebar-section' });
      const title = el('div', { className: 'learn-sidebar-title', text: label });
      section.appendChild(title);

      const items = el('div', { className: 'learn-sidebar-items' });

      for (const tut of tutorials) {
        const isComplete = isTutorialComplete(tut, progress);
        const pct = getTutorialProgress(tut, progress);
        const isActive = tut.id === activeTutorialId;

        const statusClass = isComplete
          ? 'status-completed'
          : pct > 0
          ? 'status-in-progress'
          : '';

        const statusText = isComplete ? '\u2713' : pct > 0 ? `${pct}%` : '';

        const item = el('div', {
          className: `learn-sidebar-item${isActive ? ' active' : ''}${isComplete ? ' completed' : ''}`,
          children: [
            el('span', { className: `learn-item-status ${statusClass}`, text: statusText }),
            el('span', { text: tut.title }),
          ],
        });

        item.addEventListener('click', () => {
          activeTutorialId = tut.id;
          activeStepIndex = 0;
          exerciseAttemptCount = 0;
          buildSidebar();
          renderContent();
        });

        items.appendChild(item);
      }

      section.appendChild(items);
      sidebar.appendChild(section);
    }
  }

  // ── Content rendering ────────────────────────────────────────

  function getActiveTutorial(): Tutorial | undefined {
    return TUTORIALS.find(t => t.id === activeTutorialId);
  }

  function renderContent() {
    contentArea.innerHTML = '';

    if (!activeTutorialId) {
      renderWelcome();
      return;
    }

    const tutorial = getActiveTutorial();
    if (!tutorial) return;

    const step = tutorial.steps[activeStepIndex];
    if (!step) return;

    // Step navigation header
    renderStepHeader(tutorial, step);

    // Render step content based on type
    switch (step.type) {
      case 'explanation':
        renderExplanation(step);
        break;
      case 'exercise':
        renderExercise(step);
        break;
      case 'quiz':
        renderQuiz(step);
        break;
    }

    // Navigation buttons
    renderNavigation(tutorial);
  }

  function renderWelcome() {
    const wrapper = el('div', { className: 'learn-welcome' });

    // ── Level & XP header ───────────────────────────────────────
    const levelInfo = getLevel(profile.totalXP);
    const nextLevelInfo = getNextLevel(profile.totalXP);
    const levelPct = getLevelProgress(profile.totalXP);

    const heroSection = el('div', { className: 'learn-hero' });

    const levelBadge = el('div', { className: 'level-badge', children: [
      el('span', { className: 'level-number', text: `${levelInfo.level}` }),
    ]});

    const levelDetails = el('div', { className: 'level-details', children: [
      el('div', { className: 'level-title-row', children: [
        el('span', { className: 'level-title', text: levelInfo.title }),
        el('span', { className: 'xp-total', text: `${profile.totalXP} XP` }),
      ]}),
      el('div', { className: 'level-bar-wrapper', children: [
        el('div', { className: 'level-bar', children: [
          el('div', { className: 'level-bar-fill', style: { width: `${levelPct}%` } }),
        ]}),
        nextLevelInfo
          ? el('span', { className: 'level-bar-label', text: `${nextLevelInfo.xpRequired - profile.totalXP} XP to ${nextLevelInfo.title}` })
          : el('span', { className: 'level-bar-label', text: 'Max level reached!' }),
      ]}),
    ]});

    heroSection.appendChild(levelBadge);
    heroSection.appendChild(levelDetails);
    wrapper.appendChild(heroSection);

    // ── Stats row ───────────────────────────────────────────────
    const totalSteps = TUTORIALS.reduce((n, t) => n + t.steps.length, 0);
    const completedSteps = progress.completedSteps.size;
    const completedTuts = progress.completedTutorials.size;
    const totalTuts = TUTORIALS.length;

    const totalExercises = TUTORIALS.reduce(
      (n, t) => n + t.steps.filter(s => s.type === 'exercise').length, 0
    );
    const passedExercises = TUTORIALS.reduce(
      (n, t) => n + t.steps.filter(s => s.type === 'exercise' && progress.completedSteps.has(s.id)).length, 0
    );

    const stats = el('div', { className: 'dashboard-stats' });
    stats.appendChild(makeStat('Tutorials', `${completedTuts}/${totalTuts}`));
    stats.appendChild(makeStat('Steps', `${completedSteps}/${totalSteps}`));
    stats.appendChild(makeStat('Exercises', `${passedExercises}/${totalExercises}`));
    stats.appendChild(makeStat('Quiz Score', profile.quizTotal > 0 ? `${profile.quizCorrect}/${profile.quizTotal}` : '--'));
    wrapper.appendChild(stats);

    // ── Learning Tracks ─────────────────────────────────────────
    wrapper.appendChild(el('h3', { className: 'section-heading', text: 'Learning Tracks' }));

    const tracksContainer = el('div', { className: 'learning-tracks' });
    for (const track of TRACKS) {
      const unlocked = isTrackUnlocked(track, profile);
      const complete = isTrackComplete(track, profile);
      const pct = getTrackProgress(track, profile);
      const nextTut = getNextTutorialInTrack(track, profile);

      const trackEl = el('div', {
        className: `learning-track${!unlocked ? ' locked' : ''}${complete ? ' completed' : ''}`,
      });

      const trackHeader = el('div', { className: 'track-header', children: [
        el('span', { className: 'track-icon', text: track.icon }),
        el('div', { className: 'track-info', children: [
          el('div', { className: 'track-name', text: track.name }),
          el('div', { className: 'track-desc', text: track.description }),
        ]}),
      ]});
      trackEl.appendChild(trackHeader);

      // Progress bar
      const trackBar = el('div', { className: 'track-progress', children: [
        el('div', { className: 'track-bar', children: [
          el('div', { className: 'track-bar-fill', style: { width: `${pct}%` } }),
        ]}),
        el('span', { className: 'track-pct', text: complete ? 'Complete' : `${pct}%` }),
      ]});
      trackEl.appendChild(trackBar);

      // Tutorial list within track
      const trackTuts = el('div', { className: 'track-tutorials' });
      for (const tutId of track.tutorialIds) {
        const tut = TUTORIALS.find(t => t.id === tutId);
        if (!tut) continue;
        const tutComplete = isTutorialComplete(tut, progress);
        const isCurrent = tutId === nextTut;
        const tutEl = el('div', {
          className: `track-tutorial-item${tutComplete ? ' done' : ''}${isCurrent ? ' current' : ''}${!unlocked ? ' locked' : ''}`,
          children: [
            el('span', { className: 'track-tut-status', text: tutComplete ? '\u2713' : isCurrent ? '\u25B6' : '\u25CB' }),
            el('span', { className: 'track-tut-name', text: tut.title }),
          ],
        });
        if (unlocked) {
          tutEl.style.cursor = 'pointer';
          tutEl.addEventListener('click', () => {
            activeTutorialId = tutId;
            activeStepIndex = 0;
            exerciseAttemptCount = 0;
            buildSidebar();
            renderContent();
          });
        }
        trackTuts.appendChild(tutEl);
      }
      trackEl.appendChild(trackTuts);

      if (!unlocked) {
        const prereq = TRACKS.find(t => t.id === track.prerequisiteTrackId);
        if (prereq) {
          trackEl.appendChild(el('div', {
            className: 'track-locked-msg',
            text: `Complete "${prereq.name}" to unlock`,
          }));
        }
      }

      tracksContainer.appendChild(trackEl);
    }
    wrapper.appendChild(tracksContainer);

    // ── Badges ──────────────────────────────────────────────────
    wrapper.appendChild(el('h3', { className: 'section-heading', text: 'Badges' }));

    const badgesWithStatus = getBadgesWithStatus(profile);
    const categories: [string, string][] = [
      ['tutorial', 'Tutorial'],
      ['exercise', 'Exercise'],
      ['quiz', 'Quiz'],
      ['exploration', 'Exploration'],
      ['mastery', 'Mastery'],
    ];

    const badgesGrid = el('div', { className: 'badges-container' });
    for (const [catId, catLabel] of categories) {
      const catBadges = badgesWithStatus.filter(b => b.category === catId);
      if (catBadges.length === 0) continue;

      const catSection = el('div', { className: 'badge-category' });
      catSection.appendChild(el('div', { className: 'badge-category-label', text: catLabel }));

      const grid = el('div', { className: 'badge-grid' });
      for (const b of catBadges) {
        const badgeEl = el('div', {
          className: `badge-item${b.earned ? ' earned' : ''}`,
          children: [
            el('span', { className: 'badge-icon', text: b.earned ? b.icon : '\u{1F512}' }),
            el('div', { className: 'badge-info', children: [
              el('span', { className: 'badge-name', text: b.name }),
              el('span', { className: 'badge-desc', text: b.description }),
            ]}),
          ],
        });
        grid.appendChild(badgeEl);
      }
      catSection.appendChild(grid);
      badgesGrid.appendChild(catSection);
    }
    wrapper.appendChild(badgesGrid);

    // ── Reset button ────────────────────────────────────────────
    const hasAnyProgress = completedSteps > 0 || profile.totalXP > 0;
    if (hasAnyProgress) {
      const resetBtn = el('button', {
        className: 'btn btn-danger btn-sm',
        text: 'Reset All Progress',
      });
      resetBtn.addEventListener('click', () => {
        if (confirm('Reset all tutorial progress and XP? This cannot be undone.')) {
          resetProgress();
          resetProfile();
          const fresh = createProgress();
          progress.completedSteps = fresh.completedSteps;
          progress.completedTutorials = fresh.completedTutorials;
          progress.quizScores = fresh.quizScores;
          progress.exerciseAttempts = fresh.exerciseAttempts;
          // Reset profile in-place
          Object.assign(profile, loadProfile());
          buildSidebar();
          renderContent();
        }
      });
      wrapper.appendChild(el('div', { className: 'learn-action-bar', children: [resetBtn] }));
    }

    contentArea.appendChild(wrapper);
  }

  function makeStat(label: string, value: string): HTMLElement {
    return el('div', {
      className: 'dashboard-stat',
      children: [
        el('div', { className: 'dashboard-stat-value', text: value }),
        el('div', { className: 'dashboard-stat-label', text: label }),
      ],
    });
  }

  function renderStepHeader(tutorial: Tutorial, step: TutorialStep) {
    const stepNum = activeStepIndex + 1;
    const totalSteps = tutorial.steps.length;
    const isCompleted = progress.completedSteps.has(step.id);

    // Progress dots
    const dots: HTMLElement[] = tutorial.steps.map((s, i) => {
      const dotClass = progress.completedSteps.has(s.id)
        ? 'step-dot completed'
        : i === activeStepIndex
        ? 'step-dot current'
        : 'step-dot';
      const dot = el('span', { className: dotClass });
      dot.addEventListener('click', () => {
        activeStepIndex = i;
        exerciseAttemptCount = 0;
        renderContent();
      });
      return dot;
    });

    const header = el('div', {
      className: 'learn-step-header',
      children: [
        el('div', {
          className: 'learn-step-title-row',
          children: [
            el('span', {
              className: 'learn-step-number',
              text: `Step ${stepNum} of ${totalSteps}`,
            }),
            el('span', {
              className: `learn-step-type step-type-${step.type}`,
              text: step.type.charAt(0).toUpperCase() + step.type.slice(1),
            }),
            isCompleted
              ? el('span', { className: 'learn-step-done', text: '\u2713 Done' })
              : el('span', {}),
          ],
        }),
        el('h2', { text: step.title }),
        el('div', { className: 'learn-step-dots', children: dots }),
      ],
    });
    contentArea.appendChild(header);
  }

  // ── Explanation rendering ──────────────────────────────────────

  function renderExplanation(step: ExplanationStep) {
    const body = el('div', { className: 'learn-explanation' });

    // Simple markdown-like rendering
    renderFormattedText(body, step.content);

    if (step.codeExample) {
      body.appendChild(el('div', { className: 'learn-code-block', text: step.codeExample }));
      // "Try It" button to load example into editor
      const tryBtn = el('button', {
        className: 'btn btn-primary btn-sm',
        text: 'Try in Editor',
      });
      tryBtn.addEventListener('click', () => {
        loadIntoMainEditor(step.codeExample!);
      });
      body.appendChild(el('div', { className: 'learn-action-bar', children: [tryBtn] }));
    }

    contentArea.appendChild(body);

    // Mark as completed when viewed
    markStepCompleted(step.id);
  }

  // ── Exercise rendering ─────────────────────────────────────────

  function renderExercise(step: ExerciseStep) {
    const body = el('div', { className: 'learn-exercise' });

    // Task description
    const taskBox = el('div', { className: 'exercise-task' });
    renderFormattedText(taskBox, step.instruction);
    body.appendChild(taskBox);

    // Code editor for the exercise
    const editorWrapper = el('div', { className: 'learn-editor-wrapper' });
    const exerciseEditor = createHighlightedEditor({
      className: 'learn-code-editor-hl',
      value: step.starterCode,
      language: 'asm',
      rows: Math.max(8, step.starterCode.split('\n').length + 2),
    });
    const codeEditor = exerciseEditor.textarea;
    editorWrapper.appendChild(exerciseEditor.wrapper);
    body.appendChild(editorWrapper);

    // Result display area
    const resultArea = el('div', { className: 'exercise-result-area' });

    // Hint state
    let hintsShown = 0;
    const hintContainer = el('div', { className: 'exercise-hints' });

    // Action buttons
    const btnBar = el('div', { className: 'learn-action-bar' });

    // Run & Check button
    const runBtn = el('button', { className: 'btn btn-success', text: 'Assemble, Run & Check' });
    runBtn.addEventListener('click', () => {
      runAndValidateExercise(sim, codeEditor.value, step, resultArea);
    });

    // Hint button
    const hintBtn = el('button', { className: 'btn', text: 'Show Hint' });
    hintBtn.addEventListener('click', () => {
      if (hintsShown < step.hints.length) {
        const hint = el('div', {
          className: 'exercise-hint visible',
          text: `Hint ${hintsShown + 1}: ${step.hints[hintsShown]}`,
        });
        hintContainer.appendChild(hint);
        hintsShown++;
        if (hintsShown >= step.hints.length) {
          hintBtn.textContent = 'No more hints';
          (hintBtn as HTMLButtonElement).disabled = true;
        }
      }
    });

    // Solution button (shown after 3+ failed attempts)
    const solBtn = el('button', {
      className: 'btn btn-danger btn-sm',
      text: 'Show Solution',
    });
    solBtn.style.display = 'none';
    solBtn.addEventListener('click', () => {
      codeEditor.value = step.solutionCode;
      exerciseEditor.refresh();
      const solNote = el('div', {
        className: 'exercise-hint visible',
        text: 'Solution loaded into the editor. Try to understand it, then Run & Check.',
      });
      resultArea.innerHTML = '';
      resultArea.appendChild(solNote);
    });

    // Track failed attempts to show solution button
    const checkFailCallback = () => {
      exerciseAttemptCount++;
      progress.exerciseAttempts.set(step.id, exerciseAttemptCount);
      saveProgress(progress);
      if (exerciseAttemptCount >= 3) {
        solBtn.style.display = '';
      }
    };

    // Store callback on runBtn for access in runAndValidateExercise
    (runBtn as HTMLElement & { _onFail?: () => void })._onFail = checkFailCallback;
    (runBtn as HTMLElement & { _onPass?: () => void })._onPass = () => {
      markStepCompleted(step.id);

      // Award exercise XP based on attempt count
      const attempts = exerciseAttemptCount + 1; // current attempt
      const xpAmount = attempts === 1
        ? XP_AWARDS.EXERCISE_FIRST_TRY
        : attempts === 2
        ? XP_AWARDS.EXERCISE_SECOND_TRY
        : XP_AWARDS.EXERCISE_LATER;
      const event = awardStepXP(profile, step.id, xpAmount, `Exercise: ${step.title}`);
      if (event) {
        profile.exercisesPassed++;
        if (attempts === 1) profile.firstTryExercises++;
        saveProfile(profile);
        showXPNotification(event);
      }

      buildSidebar();
    };

    btnBar.appendChild(runBtn);
    btnBar.appendChild(hintBtn);
    btnBar.appendChild(solBtn);

    body.appendChild(btnBar);
    body.appendChild(hintContainer);
    body.appendChild(resultArea);

    contentArea.appendChild(body);
  }

  function runAndValidateExercise(
    sim: Simulator,
    code: string,
    step: ExerciseStep,
    resultArea: HTMLElement,
  ) {
    resultArea.innerHTML = '';

    // Reset simulator
    sim.reset();

    // Assemble
    const asmResult = sim.assembleAndLoad(code);
    if (!asmResult.success) {
      const errMsg = asmResult.errors.map(e => `Line ${e.line}: ${e.message}`).join('\n');
      resultArea.appendChild(
        el('div', {
          className: 'exercise-result result-fail',
          text: `Assembly errors:\n${errMsg}`,
        })
      );
      // Find runBtn's fail callback
      const runBtn = resultArea.parentElement?.querySelector('.btn-success') as HTMLElement & { _onFail?: () => void };
      runBtn?._onFail?.();
      return;
    }

    // Run until HALT or cycle limit
    const maxCycles = 10000;
    let cycles = 0;
    sim.cpu.setState(CPUState.RUNNING);
    while (cycles < maxCycles) {
      const ok = sim.step();
      cycles++;
      const state = sim.cpu.getState();
      if (state === CPUState.HALTED || state === CPUState.FAULT || !ok) break;
    }

    if (cycles >= maxCycles) {
      resultArea.appendChild(
        el('div', {
          className: 'exercise-result result-fail',
          text: 'Program did not halt within 10,000 cycles. Check for infinite loops!',
        })
      );
      const runBtn = resultArea.parentElement?.querySelector('.btn-success') as HTMLElement & { _onFail?: () => void };
      runBtn?._onFail?.();
      return;
    }

    // Validate
    const validation = step.validate(sim);
    if (validation.passed) {
      resultArea.appendChild(
        el('div', {
          className: 'exercise-result result-pass',
          text: `\u2713 ${validation.message}`,
        })
      );
      const runBtn = resultArea.parentElement?.querySelector('.btn-success') as HTMLElement & { _onPass?: () => void };
      runBtn?._onPass?.();
    } else {
      resultArea.appendChild(
        el('div', {
          className: 'exercise-result result-fail',
          text: `\u2717 ${validation.message}`,
        })
      );
      const runBtn = resultArea.parentElement?.querySelector('.btn-success') as HTMLElement & { _onFail?: () => void };
      runBtn?._onFail?.();
    }
  }

  // ── Quiz rendering ─────────────────────────────────────────────

  function renderQuiz(step: QuizStep) {
    const body = el('div', { className: 'learn-quiz' });

    const questionBox = el('div', { className: 'quiz-question' });
    const questionText = el('div', { className: 'quiz-question-text' });
    renderFormattedText(questionText, step.question);
    questionBox.appendChild(questionText);

    const optionsContainer = el('div', { className: 'quiz-options' });
    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
    let answered = false;

    for (let i = 0; i < step.options.length; i++) {
      const optionEl = el('div', {
        className: 'quiz-option',
        children: [
          el('span', { className: 'quiz-option-marker', text: letters[i] }),
          el('span', { text: step.options[i] }),
        ],
      });

      optionEl.addEventListener('click', () => {
        if (answered) return;
        answered = true;

        // Mark selected
        optionEl.classList.add('selected');

        const isCorrect = i === step.correctIndex;
        const wasAlreadyAnswered = profile.xpAwardedSteps.includes(step.id);

        if (isCorrect) {
          optionEl.classList.add('correct');
          progress.quizScores.set(step.id, true);
          markStepCompleted(step.id);

          // Award quiz XP
          if (!wasAlreadyAnswered) {
            profile.quizCorrect++;
            profile.quizTotal++;
            profile.quizStreak++;
            if (profile.quizStreak > profile.bestQuizStreak) {
              profile.bestQuizStreak = profile.quizStreak;
            }
            const xpAmount = XP_AWARDS.QUIZ_CORRECT_FIRST;
            const event = awardStepXP(profile, step.id, xpAmount, `Quiz: ${step.title}`);
            if (event) showXPNotification(event);
          }

          buildSidebar();
        } else {
          optionEl.classList.add('incorrect');
          progress.quizScores.set(step.id, false);

          // Track incorrect answer
          if (!wasAlreadyAnswered) {
            profile.quizTotal++;
            profile.quizStreak = 0;
            const event = awardStepXP(profile, step.id, XP_AWARDS.QUIZ_INCORRECT, `Quiz attempt: ${step.title}`);
            if (event) showXPNotification(event);
          }

          // Highlight correct answer
          const correctEl = optionsContainer.children[step.correctIndex] as HTMLElement;
          correctEl?.classList.add('correct');
        }

        // Show explanation
        const explanation = el('div', {
          className: 'quiz-explanation',
          text: step.explanation,
        });
        questionBox.appendChild(explanation);

        // Allow proceeding even if wrong
        if (!isCorrect) {
          const retryBtn = el('button', {
            className: 'btn btn-sm',
            text: 'Retry Quiz',
          });
          retryBtn.addEventListener('click', () => {
            // Re-render the quiz from scratch (clears answered state)
            progress.completedSteps.delete(step.id);
            progress.quizScores.delete(step.id);
            saveProgress(progress);
            renderContent();
          });
          const retryRow = el('div', {
            className: 'quiz-retry-row',
            children: [
              el('span', { text: 'Incorrect — review the explanation, then retry or continue.' }),
              retryBtn,
            ],
          });
          questionBox.appendChild(retryRow);
          markStepCompleted(step.id);
          buildSidebar();
        }
      });

      optionsContainer.appendChild(optionEl);
    }

    questionBox.appendChild(optionsContainer);
    body.appendChild(questionBox);
    contentArea.appendChild(body);
  }

  // ── Navigation ─────────────────────────────────────────────────

  function renderNavigation(tutorial: Tutorial) {
    const nav = el('div', { className: 'learn-nav' });

    if (activeStepIndex > 0) {
      const prevBtn = el('button', { className: 'btn', text: '\u2190 Previous' });
      prevBtn.addEventListener('click', () => {
        activeStepIndex--;
        exerciseAttemptCount = 0;
        renderContent();
      });
      nav.appendChild(prevBtn);
    }

    // Spacer
    nav.appendChild(el('div', { style: { flex: '1' } }));

    if (activeStepIndex < tutorial.steps.length - 1) {
      const nextBtn = el('button', { className: 'btn btn-primary', text: 'Next \u2192' });
      nextBtn.addEventListener('click', () => {
        activeStepIndex++;
        exerciseAttemptCount = 0;
        renderContent();
      });
      nav.appendChild(nextBtn);
    } else {
      // Last step - show completion message
      const completeBtn = el('button', {
        className: 'btn btn-success',
        text: '\u2713 Tutorial Complete!',
      });
      completeBtn.addEventListener('click', () => {
        // Mark tutorial complete
        progress.completedTutorials.add(tutorial.id);
        saveProgress(progress);
        syncProfileTutorials();

        // Award tutorial completion bonus XP
        const tutKey = `tutorial-complete:${tutorial.id}`;
        if (!profile.xpAwardedSteps.includes(tutKey)) {
          profile.xpAwardedSteps.push(tutKey);
          const event = awardXP(profile, XP_AWARDS.TUTORIAL_COMPLETE, `Completed: ${tutorial.title}`);
          showXPNotification(event);

          // Check if a track was just completed
          for (const track of TRACKS) {
            if (isTrackComplete(track, profile)) {
              const trackKey = `track-complete:${track.id}`;
              if (!profile.xpAwardedSteps.includes(trackKey)) {
                profile.xpAwardedSteps.push(trackKey);
                const trackEvent = awardXP(profile, XP_AWARDS.TRACK_COMPLETE, `Track complete: ${track.name}`);
                showXPNotification(trackEvent);
              }
            }
          }
        }

        // Go to next tutorial or back to welcome
        const idx = TUTORIALS.indexOf(tutorial);
        if (idx < TUTORIALS.length - 1) {
          activeTutorialId = TUTORIALS[idx + 1].id;
          activeStepIndex = 0;
        } else {
          activeTutorialId = null;
        }
        exerciseAttemptCount = 0;
        buildSidebar();
        renderContent();
      });
      nav.appendChild(completeBtn);
    }

    contentArea.appendChild(nav);
  }

  // ── Helpers ────────────────────────────────────────────────────

  function markStepCompleted(stepId: string) {
    const wasNew = !progress.completedSteps.has(stepId);
    progress.completedSteps.add(stepId);
    const tutorial = getActiveTutorial();
    if (tutorial && isTutorialComplete(tutorial, progress)) {
      progress.completedTutorials.add(tutorial.id);
    }
    saveProgress(progress);
    syncProfileTutorials();

    // Award XP for explanation steps (exercises/quizzes award their own XP)
    if (wasNew) {
      const step = tutorial?.steps.find(s => s.id === stepId);
      if (step?.type === 'explanation') {
        const event = awardStepXP(profile, stepId, XP_AWARDS.EXPLANATION_READ, 'Read explanation');
        if (event) showXPNotification(event);
      }
    }
  }

  /** Simple formatted text renderer (supports **bold**, `code`, code blocks, newlines) */
  function renderFormattedText(container: HTMLElement, text: string) {
    // Split on code blocks first
    const codeBlockRegex = /```[\s\S]*?```/g;
    const parts = text.split(codeBlockRegex);
    const codeBlocks = text.match(codeBlockRegex) || [];

    for (let i = 0; i < parts.length; i++) {
      // Render text part
      renderInlineText(container, parts[i]);

      // Render code block if exists
      if (i < codeBlocks.length) {
        const code = codeBlocks[i].replace(/^```\w*\n?/, '').replace(/```$/, '').trim();
        container.appendChild(el('div', { className: 'learn-code-block', text: code }));
      }
    }
  }

  function renderInlineText(container: HTMLElement, text: string) {
    // Split into paragraphs by double newlines
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim());

    for (const para of paragraphs) {
      // Detect markdown tables (lines starting with |)
      const lines = para.split('\n').filter(l => l.trim());
      const isTable = lines.length >= 2 &&
        lines.every(l => l.trim().startsWith('|') && l.trim().endsWith('|'));

      if (isTable) {
        // Parse as HTML table
        const table = el('table', { className: 'learn-table' });
        const dataRows = lines.filter(l => !/^\|[\s\-:|]+\|$/.test(l.trim()));

        for (let ri = 0; ri < dataRows.length; ri++) {
          const cells = dataRows[ri].split('|').filter((_, ci, a) => ci > 0 && ci < a.length - 1);
          const tr = el('tr', {});
          for (const cell of cells) {
            const tag = ri === 0 ? 'th' : 'td';
            const cellEl = document.createElement(tag);
            // Process inline formatting within cells
            const cellParts = cell.trim().split(/(\*\*.*?\*\*|`[^`]+`)/g);
            for (const cp of cellParts) {
              if (cp.startsWith('**') && cp.endsWith('**')) {
                const b = document.createElement('strong');
                b.textContent = cp.slice(2, -2);
                cellEl.appendChild(b);
              } else if (cp.startsWith('`') && cp.endsWith('`')) {
                const c = document.createElement('code');
                c.textContent = cp.slice(1, -1);
                cellEl.appendChild(c);
              } else if (cp.trim()) {
                cellEl.appendChild(document.createTextNode(cp));
              }
            }
            tr.appendChild(cellEl);
          }
          table.appendChild(tr);
        }
        container.appendChild(table);
        continue;
      }

      const p = el('p', {});

      // Process inline formatting: **bold** and `code`
      const parts = para.split(/(\*\*.*?\*\*|`[^`]+`)/g);
      for (const part of parts) {
        if (part.startsWith('**') && part.endsWith('**')) {
          const bold = document.createElement('strong');
          bold.textContent = part.slice(2, -2);
          p.appendChild(bold);
        } else if (part.startsWith('`') && part.endsWith('`')) {
          const code = document.createElement('code');
          code.textContent = part.slice(1, -1);
          p.appendChild(code);
        } else {
          // Handle single newlines as line breaks within a paragraph
          const textLines = part.split('\n');
          for (let i = 0; i < textLines.length; i++) {
            if (textLines[i].trim()) {
              p.appendChild(document.createTextNode(textLines[i]));
            }
            if (i < textLines.length - 1) {
              p.appendChild(document.createElement('br'));
            }
          }
        }
      }

      container.appendChild(p);
    }
  }

  function loadIntoMainEditor(code: string) {
    const editor = document.getElementById('code-editor') as HTMLTextAreaElement;
    if (editor) {
      editor.value = code;
      // Trigger re-highlight on the main editor
      editor.dispatchEvent(new Event('input'));
    }
    // Switch to debugger tab
    const debugTab = document.querySelector('.tab-btn[data-tab="debugger"]') as HTMLElement;
    debugTab?.click();
  }

  // ── Assembly & initialization ──────────────────────────────────

  container.appendChild(sidebar);
  container.appendChild(contentArea);

  buildSidebar();
  renderContent();

  return {
    element: container,
    update: () => {
      // Refresh sidebar + dashboard to pick up XP earned elsewhere
      buildSidebar();
      if (!activeTutorialId) {
        renderContent();
      }
    },
  };
}
