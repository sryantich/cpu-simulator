/**
 * Kernel Tab - Process list, kernel log, syscall history
 */

import type { Simulator } from '../../core/simulator.ts';
import { el, hex } from '../helpers.ts';

export function createKernelTab(sim: Simulator): { element: HTMLElement; update: () => void } {
  const container = el('div', { className: 'tab-content kernel-tab' });

  // Process list
  const procSection = el('div', { className: 'section' });
  const procTitle = el('h3', { text: 'Processes', className: 'section-title' });
  const procList = el('div', { className: 'process-list', id: 'process-list' });
  procSection.appendChild(procTitle);
  procSection.appendChild(procList);

  // Kernel log
  const logSection = el('div', { className: 'section' });
  const logTitle = el('h3', { text: 'Kernel Log', className: 'section-title' });
  const logView = el('pre', { className: 'kernel-log', id: 'kernel-log' });
  logSection.appendChild(logTitle);
  logSection.appendChild(logView);

  // Syscall history
  const syscallSection = el('div', { className: 'section' });
  const syscallTitle = el('h3', { text: 'Syscall History', className: 'section-title' });
  const syscallList = el('div', { className: 'syscall-list', id: 'syscall-list' });
  syscallSection.appendChild(syscallTitle);
  syscallSection.appendChild(syscallList);

  container.appendChild(procSection);
  container.appendChild(logSection);
  container.appendChild(syscallSection);

  let syscallHistory: { number: number; r0: number; r1: number; r2: number; cycle: number }[] = [];

  sim.bus.on('kernel:syscall', (data) => {
    const d = data as { number: number; r0: number; r1: number; r2: number };
    syscallHistory.push({ ...d, cycle: sim.cpu.getCycle() });
    if (syscallHistory.length > 100) syscallHistory.shift();
  });

  // Clear syscall history on reset
  sim.bus.on('sim:reset', () => {
    syscallHistory = [];
  });

  const SYSCALL_NAMES: Record<number, string> = {
    0: 'exit', 1: 'write', 2: 'read', 3: 'yield', 4: 'getpid',
    5: 'sleep', 6: 'brk', 7: 'fork', 8: 'exec',
    10: 'open_display', 11: 'put_char', 12: 'get_time',
    20: 'storage_read', 21: 'storage_write',
  };

  function update() {
    // Process list
    const processes = sim.kernel.getProcesses();
    procList.innerHTML = '';

    if (processes.length === 0) {
      procList.appendChild(el('div', { className: 'empty-state', text: '(no processes — boot the kernel first)' }));
    }

    for (const proc of processes) {
      const stateClass = proc.state === 'running' ? 'proc-running' :
        proc.state === 'ready' ? 'proc-ready' :
        proc.state === 'terminated' ? 'proc-terminated' : 'proc-blocked';

      const procEl = el('div', {
        className: `process-item ${stateClass}`,
        children: [
          el('span', { className: 'proc-pid', text: `PID ${proc.pid}` }),
          el('span', { className: 'proc-name', text: proc.name }),
          el('span', { className: 'proc-state', text: proc.state }),
          el('span', { className: 'proc-pc', text: `PC: ${hex(proc.pc, 4)}` }),
          el('span', { className: 'proc-sp', text: `SP: ${hex(proc.sp, 4)}` }),
        ],
      });
      procList.appendChild(procEl);
    }

    // Kernel log
    const log = sim.kernel.getLog();
    logView.textContent = log.slice(-30).join('\n') || '(kernel not booted)';
    logView.scrollTop = logView.scrollHeight;

    // Syscall history
    syscallList.innerHTML = '';
    if (syscallHistory.length === 0) {
      syscallList.appendChild(el('div', { className: 'empty-state', text: '(no syscalls yet)' }));
    }
    for (const sc of syscallHistory.slice(-20).reverse()) {
      const name = SYSCALL_NAMES[sc.number] || `syscall_${sc.number}`;
      syscallList.appendChild(el('div', {
        className: 'syscall-item',
        children: [
          el('span', { className: 'syscall-cycle', text: `@${sc.cycle}` }),
          el('span', { className: 'syscall-name', text: name }),
          el('span', { className: 'syscall-args', text: `(${hex(sc.r0, 4)}, ${hex(sc.r1, 4)}, ${hex(sc.r2, 4)})` }),
        ],
      }));
    }
  }

  return { element: container, update };
}
