/**
 * Onboarding — First-time welcome modal with guided tour
 *
 * Shows a multi-step overlay that highlights key UI areas and explains
 * the simulator's capabilities. Uses localStorage to remember if the
 * user has already seen the tour.
 */

import { el } from './helpers.ts';

const STORAGE_KEY = 'cpu-sim-onboarding-seen';

// ── Tour steps ───────────────────────────────────────────────────

interface TourStep {
  title: string;
  body: string;
  /** CSS selector of the element to spotlight (optional) */
  highlight?: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    title: 'Welcome to CPU Simulator',
    body: 'This is an interactive ARM-like 32-bit CPU simulator with 32KB RAM, a 3-stage pipeline, and 5 peripheral devices.\n\nYou can write assembly or C code, step through execution, and watch the CPU state change in real time.',
  },
  {
    title: 'Code Editor',
    body: 'Write ARM assembly or TinyC here. The editor supports syntax highlighting, and you can load example programs from the dropdown.\n\nClick "Assemble & Load" to compile your code into memory.',
    highlight: '.editor-section',
  },
  {
    title: 'Execution Controls',
    body: 'Use these controls to run your program:\n\n- Boot: Initialize the kernel\n- Run/Pause: Start or pause continuous execution\n- Step: Execute one instruction at a time\n- Reset: Clear everything and start over\n\nKeyboard shortcuts: Space (run/pause), S (step), Ctrl+R (reset), Ctrl+B (boot).',
    highlight: '.control-bar',
  },
  {
    title: 'CPU State & Pipeline',
    body: 'Switch to the CPU State tab to see all 16 registers, CPSR flags (N, Z, C, V), and the 3-stage pipeline (Fetch, Decode, Execute).\n\nRegisters that change are highlighted. Hover over any element for details.',
    highlight: '[data-tab="cpu"]',
  },
  {
    title: 'ISA Reference',
    body: 'The ISA Reference tab documents all 49+ instructions across 7 categories, barrel shifter operations, and memory addressing modes.\n\nUse it as a quick lookup while writing code.',
    highlight: '[data-tab="reference"]',
  },
  {
    title: 'Interactive Tutorials',
    body: 'The Learn tab has 7 guided tutorials with hands-on exercises and quizzes — from "Your First Program" to advanced topics like the barrel shifter.\n\nStart here if you\'re new to assembly!',
    highlight: '[data-tab="learn"]',
  },
  {
    title: 'You\'re Ready!',
    body: 'Hover over any UI element for tooltips. Use number keys 1-8 to switch tabs quickly.\n\nHappy hacking!',
  },
];

// ── Modal creation ───────────────────────────────────────────────

export function showOnboarding(force = false): void {
  if (!force && localStorage.getItem(STORAGE_KEY)) return;

  let currentStep = 0;
  let spotlightEl: HTMLElement | null = null;

  // Overlay
  const overlay = el('div', { className: 'onboarding-overlay' });

  // Modal
  const modal = el('div', { className: 'onboarding-modal' });

  // Content containers
  const titleEl = el('h2', { className: 'onboarding-title' });
  const bodyEl = el('div', { className: 'onboarding-body' });
  const progressEl = el('div', { className: 'onboarding-progress' });

  // Buttons
  const skipBtn = el('button', { className: 'btn', text: 'Skip Tour' });
  const prevBtn = el('button', { className: 'btn', text: 'Back' });
  const nextBtn = el('button', { className: 'btn btn-primary', text: 'Next' });

  const btnBar = el('div', {
    className: 'onboarding-buttons',
    children: [skipBtn, el('div', { style: { flex: '1' } }), prevBtn, nextBtn],
  });

  modal.appendChild(titleEl);
  modal.appendChild(bodyEl);
  modal.appendChild(progressEl);
  modal.appendChild(btnBar);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Force reflow then add visible class for transition
  overlay.offsetHeight;
  overlay.classList.add('visible');

  function renderStep() {
    const step = TOUR_STEPS[currentStep];

    titleEl.textContent = step.title;

    // Render body with line breaks
    bodyEl.innerHTML = '';
    const paragraphs = step.body.split('\n\n');
    for (const p of paragraphs) {
      bodyEl.appendChild(el('p', { text: p }));
    }

    // Progress dots
    progressEl.innerHTML = '';
    for (let i = 0; i < TOUR_STEPS.length; i++) {
      const dot = el('span', {
        className: `onboarding-dot${i === currentStep ? ' active' : ''}${i < currentStep ? ' done' : ''}`,
      });
      progressEl.appendChild(dot);
    }

    // Button states
    prevBtn.style.display = currentStep === 0 ? 'none' : '';
    nextBtn.textContent = currentStep === TOUR_STEPS.length - 1 ? 'Get Started' : 'Next';

    // Spotlight
    clearSpotlight();
    if (step.highlight) {
      const target = document.querySelector(step.highlight) as HTMLElement | null;
      if (target) {
        target.classList.add('onboarding-spotlight');
        spotlightEl = target;
      }
    }
  }

  function clearSpotlight() {
    if (spotlightEl) {
      spotlightEl.classList.remove('onboarding-spotlight');
      spotlightEl = null;
    }
  }

  function close() {
    clearSpotlight();
    overlay.classList.remove('visible');
    setTimeout(() => {
      overlay.remove();
    }, 200);
    localStorage.setItem(STORAGE_KEY, '1');
  }

  skipBtn.addEventListener('click', close);

  prevBtn.addEventListener('click', () => {
    if (currentStep > 0) {
      currentStep--;
      renderStep();
    }
  });

  nextBtn.addEventListener('click', () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      currentStep++;
      renderStep();
    } else {
      close();
    }
  });

  // Close on Escape
  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', onKeydown);
    }
  }
  document.addEventListener('keydown', onKeydown);

  renderStep();
}
