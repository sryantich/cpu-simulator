/**
 * Main Application - Wires up the simulator, UI tabs, and controls
 */

import './style.css';
import { Simulator } from './core/simulator.ts';
import { el } from './ui/helpers.ts';
import { createTerminalTab } from './ui/tabs/terminal.ts';
import { createCPUTab } from './ui/tabs/cpu-state.ts';
import { createDebuggerTab } from './ui/tabs/debugger.ts';
import { createMemoryTab } from './ui/tabs/memory.ts';
import { createKernelTab } from './ui/tabs/kernel.ts';
import { createIOTab } from './ui/tabs/io-bus.ts';
import { createReferenceTab } from './ui/tabs/reference.ts';
import { createLearningTab } from './ui/tabs/learning.ts';
import { CPUState } from './core/cpu.ts';
import { tooltip } from './ui/tooltip.ts';
import { showOnboarding } from './ui/onboarding.ts';

// ── Create Simulator ─────────────────────────────────────────────

const sim = new Simulator({
  clockSpeedHz: 4,
});

// Expose simulator for testing/debugging from browser console & Playwright
(window as unknown as Record<string, unknown>).__sim = sim;

// ── Theme Toggle ─────────────────────────────────────────────────

function getStoredTheme(): 'dark' | 'light' {
  try {
    const stored = localStorage.getItem('cpu-sim-theme');
    if (stored === 'light' || stored === 'dark') return stored;
  } catch { /* ignore */ }
  return 'dark';
}

function applyTheme(theme: 'dark' | 'light') {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  try { localStorage.setItem('cpu-sim-theme', theme); } catch { /* ignore */ }
}

let currentTheme = getStoredTheme();
applyTheme(currentTheme);

// ── Build UI ─────────────────────────────────────────────────────

const app = document.getElementById('app')!;
app.innerHTML = '';

// Theme toggle button
const themeBtn = el('button', { className: 'theme-toggle', text: currentTheme === 'dark' ? '\u263E' : '\u2600', onClick: () => {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  applyTheme(currentTheme);
  themeBtn.textContent = currentTheme === 'dark' ? '\u263E' : '\u2600';
}});
tooltip(themeBtn, () => `Switch to ${currentTheme === 'dark' ? 'light' : 'dark'} theme`);

// Header bar
const header = el('header', { className: 'app-header', children: [
  el('div', { className: 'header-left', children: [
    el('h1', { className: 'app-title', text: 'CPU Simulator' }),
    el('span', { className: 'app-subtitle', text: 'ARM-like 32-bit | 32KB RAM | 4MB Storage' }),
  ]}),
  el('div', { className: 'header-right', id: 'header-controls', children: [
    themeBtn,
  ]}),
]});

// Control bar
const controlBar = el('div', { className: 'control-bar', id: 'control-bar' });

const bootBtn = el('button', { className: 'btn btn-primary', text: 'Boot', onClick: () => {
  sim.boot();
  updateAll();
}});

const runBtn = el('button', { className: 'btn btn-success', text: 'Run', id: 'run-btn', onClick: () => {
  const state = sim.cpu.getState();
  if (state === CPUState.HALTED || state === CPUState.FAULT || state === CPUState.WAITING) {
    sim.cpu.setState(CPUState.RUNNING);
  }
  sim.toggle();
  updateRunButton();
}});

const stepBtn = el('button', { className: 'btn', text: 'Step', onClick: () => {
  const state = sim.cpu.getState();
  if (state === CPUState.HALTED || state === CPUState.FAULT || state === CPUState.WAITING) {
    sim.cpu.setState(CPUState.RUNNING);
  }
  sim.step();
  updateAll();
}});

const resetBtn = el('button', { className: 'btn btn-danger', text: 'Reset', onClick: () => {
  sim.reset();
  updateAll();
}});

const speedLabel = el('span', { className: 'speed-label', text: `Speed: ${sim.getSpeed()} Hz` });
const speedSlider = document.createElement('input');
speedSlider.type = 'range';
speedSlider.className = 'speed-slider';
speedSlider.min = '0.5';
speedSlider.max = '1000';
speedSlider.step = '1';
speedSlider.value = sim.getSpeed().toString();
speedSlider.addEventListener('input', () => {
  const val = parseFloat(speedSlider.value);
  sim.setSpeed(val);
  speedLabel.textContent = `Speed: ${val} Hz`;
});

const cycleCounter = el('span', { className: 'cycle-counter', id: 'cycle-counter', text: 'Cycle: 0' });
const stateIndicator = el('span', { className: 'state-indicator', id: 'state-indicator', text: 'RESET' });

controlBar.appendChild(bootBtn);
controlBar.appendChild(runBtn);
controlBar.appendChild(stepBtn);
controlBar.appendChild(resetBtn);
controlBar.appendChild(el('div', { className: 'control-spacer' }));
controlBar.appendChild(speedLabel);
controlBar.appendChild(speedSlider);
controlBar.appendChild(el('div', { className: 'control-spacer' }));
controlBar.appendChild(cycleCounter);
controlBar.appendChild(stateIndicator);

// Control bar tooltips
tooltip(bootBtn, 'Initialize kernel, IVT, and boot sequence (Ctrl+B)');
tooltip(runBtn, () => sim.isRunning() ? 'Pause execution (Space)' : 'Start continuous execution (Space)');
tooltip(stepBtn, 'Execute one instruction (S or N)');
tooltip(resetBtn, 'Reset CPU, memory, and all peripherals (Ctrl+R)');
tooltip(speedSlider, 'Adjust execution speed in Hz');
tooltip(cycleCounter, 'Total clock cycles since last reset');
tooltip(stateIndicator, () => {
  const s = sim.cpu.getState();
  const descs: Record<string, string> = {
    reset: 'CPU is in initial state — boot or assemble to begin',
    running: 'CPU is actively executing instructions',
    halted: 'CPU hit a HALT instruction or completed',
    fault: 'CPU encountered an error (e.g. invalid instruction)',
  };
  return descs[s] || s;
});

// Tab system
const tabs = [
  { id: 'debugger', label: 'Code & Debug', shortLabel: 'Debug', tip: 'Write assembly/TinyC, assemble, and step through code (1)' },
  { id: 'terminal', label: 'Terminal', shortLabel: 'Term', tip: 'UART serial output from your programs (2)' },
  { id: 'cpu', label: 'CPU State', shortLabel: 'CPU', tip: 'View registers, CPSR flags, and pipeline state (3)' },
  { id: 'memory', label: 'Memory', shortLabel: 'Mem', tip: 'Inspect and search 32KB RAM contents (4)' },
  { id: 'kernel', label: 'Kernel', shortLabel: 'Kern', tip: 'Kernel log, process table, and syscall activity (5)' },
  { id: 'io', label: 'I/O Bus', shortLabel: 'I/O', tip: 'Peripheral devices: UART, Timer, IRQ, Display, Storage (6)' },
  { id: 'reference', label: 'ISA Reference', shortLabel: 'ISA', tip: 'Instruction set reference with encoding details (7)' },
  { id: 'learn', label: 'Learn', shortLabel: 'Learn', tip: 'Interactive tutorials, exercises, and quizzes (8)' },
];

const tabBar = el('nav', { className: 'tab-bar' });
const tabContent = el('div', { className: 'tab-content-area' });

// Create tab buttons
for (const tab of tabs) {
  const tabBtn = el('button', {
    className: 'tab-btn',
    attrs: { 'data-tab': tab.id },
    children: [
      el('span', { className: 'tab-label-full', text: tab.label }),
      el('span', { className: 'tab-label-short', text: tab.shortLabel }),
    ],
    onClick: () => switchTab(tab.id),
  });
  tooltip(tabBtn, tab.tip);
  tabBar.appendChild(tabBtn);
}

// Create tab content panels
const tabPanels: Map<string, { element: HTMLElement; update: () => void }> = new Map();

const debuggerTab = createDebuggerTab(sim);
tabPanels.set('debugger', debuggerTab);

const terminalTab = createTerminalTab(sim);
tabPanels.set('terminal', terminalTab);

const cpuTab = createCPUTab(sim);
tabPanels.set('cpu', cpuTab);

const memoryTab = createMemoryTab(sim);
tabPanels.set('memory', memoryTab);

const kernelTab = createKernelTab(sim);
tabPanels.set('kernel', kernelTab);

const ioTab = createIOTab(sim);
tabPanels.set('io', ioTab);

const referenceTab = createReferenceTab(sim);
tabPanels.set('reference', referenceTab);

const learningTab = createLearningTab(sim);
tabPanels.set('learn', learningTab);

for (const [id, panel] of tabPanels) {
  const wrapper = el('div', { className: 'tab-panel', attrs: { 'data-panel': id } });
  wrapper.appendChild(panel.element);
  tabContent.appendChild(wrapper);
}

// Assemble the layout
app.appendChild(header);
app.appendChild(controlBar);
app.appendChild(tabBar);
app.appendChild(tabContent);

// ── Tab switching ────────────────────────────────────────────────

let activeTab = 'debugger';

function switchTab(tabId: string) {
  activeTab = tabId;

  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
  });

  // Update tab panels
  document.querySelectorAll('.tab-panel').forEach(panel => {
    (panel as HTMLElement).classList.toggle('active', panel.getAttribute('data-panel') === tabId);
  });

  // Update the active tab content
  tabPanels.get(tabId)?.update();
}

// Initialize with first tab
switchTab('debugger');

// ── Update loop ──────────────────────────────────────────────────

function updateRunButton() {
  const btn = document.getElementById('run-btn')!;
  if (sim.isRunning()) {
    btn.textContent = 'Pause';
    btn.className = 'btn btn-warning';
  } else {
    btn.textContent = 'Run';
    btn.className = 'btn btn-success';
  }
}

function updateAll() {
  // Update header info
  const state = sim.cpu.getState();
  cycleCounter.textContent = `Cycle: ${sim.cpu.getCycle()}`;
  stateIndicator.textContent = state.toUpperCase();
  stateIndicator.className = `state-indicator state-${state}`;
  updateRunButton();

  // Update active tab
  tabPanels.get(activeTab)?.update();
}

// Periodic UI update when running
sim.bus.on('sim:step', () => {
  updateAll();
});

sim.bus.on('sim:stop', () => {
  updateAll();
});

sim.bus.on('cpu:halt', () => {
  updateAll();
});

sim.bus.on('cpu:breakpoint', () => {
  updateAll();
});

// Initial update
updateAll();

// ── Keyboard shortcuts ──────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  // Don't capture when typing in inputs
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

  if (e.key === ' ' || e.key === 'p') {
    e.preventDefault();
    if (sim.cpu.getState() === CPUState.HALTED) {
      sim.cpu.setState(CPUState.RUNNING);
    }
    sim.toggle();
    updateAll();
  }
  if (e.key === 's' || e.key === 'n') {
    e.preventDefault();
    if (sim.cpu.getState() === CPUState.HALTED) {
      sim.cpu.setState(CPUState.RUNNING);
    }
    sim.step();
    updateAll();
  }
  if (e.key === 'r' && e.ctrlKey) {
    e.preventDefault();
    sim.reset();
    updateAll();
  }
  if (e.key === 'b' && e.ctrlKey) {
    e.preventDefault();
    sim.boot();
    updateAll();
  }

  // Tab switching with number keys
  const tabNum = parseInt(e.key);
  if (tabNum >= 1 && tabNum <= tabs.length) {
    switchTab(tabs[tabNum - 1].id);
  }
});

// Expose simulator globally for console debugging
(window as unknown as Record<string, unknown>).sim = sim;

// ── Show onboarding on first visit ──────────────────────────────
showOnboarding();
