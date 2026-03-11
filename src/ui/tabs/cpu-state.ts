/**
 * CPU State Tab - Visual register state, flags, pipeline
 */

import type { Simulator } from '../../core/simulator.ts';
import { el, hex } from '../helpers.ts';
import { REG_NAMES, OPCODE_NAMES } from '../../core/isa.ts';
import { PIPELINE_STAGE_NAMES } from '../../core/cpu.ts';
import { tooltip } from '../tooltip.ts';

/** Descriptions for each register index */
const REG_TIPS: Record<number, string> = {
  0: 'R0 — General purpose / function return value',
  1: 'R1 — General purpose / 2nd argument',
  2: 'R2 — General purpose / 3rd argument',
  3: 'R3 — General purpose / 4th argument',
  4: 'R4 — General purpose (callee-saved)',
  5: 'R5 — General purpose (callee-saved)',
  6: 'R6 — General purpose (callee-saved)',
  7: 'R7 — General purpose (callee-saved)',
  8: 'R8 — General purpose (callee-saved)',
  9: 'R9 — General purpose (callee-saved)',
  10: 'R10 — General purpose (callee-saved)',
  11: 'R11/FP — Frame pointer',
  12: 'R12 — Intra-procedure scratch register',
  13: 'R13/SP — Stack pointer (grows downward)',
  14: 'R14/LR — Link register (return address after BL)',
  15: 'R15/PC — Program counter (next instruction address)',
};

const FLAG_TIPS: Record<string, string> = {
  N: 'Negative — Set when result bit 31 is 1 (signed negative)',
  Z: 'Zero — Set when result is exactly 0',
  C: 'Carry — Set on unsigned overflow, shift-out, or borrow inverse',
  V: 'Overflow — Set on signed overflow (pos+pos=neg or neg+neg=pos)',
  I: 'IRQ Disable — When set, maskable interrupts are blocked',
  F: 'FIQ Disable — When set, fast interrupts are blocked',
};

const PIPE_TIPS: Record<string, string> = {
  Fetch: 'Fetch — Reads the next instruction word from memory at PC',
  Decode: 'Decode — Interprets opcode, reads registers, resolves operands',
  Execute: 'Execute — Performs the ALU operation or computes memory address',
  Memory: 'Memory — Reads from or writes to data memory (LDR/STR)',
  Writeback: 'Writeback — Writes the result back to the destination register',
};

/** Format CPSR as grouped 4-bit nibbles for readability */
function formatCPSR(cpsr: number): string {
  const b = ((cpsr >>> 0).toString(2)).padStart(32, '0');
  // Split into 8 nibbles: NZCV | rsvd | rsvd | rsvd | rsvd | IF_T | mode_hi | mode_lo
  return b.replace(/(.{4})/g, '$1 ').trim();
}

export function createCPUTab(sim: Simulator): { element: HTMLElement; update: () => void } {
  const container = el('div', { className: 'tab-content cpu-tab' });

  // Registers section
  const regSection = el('div', { className: 'section' });
  const regTitle = el('h3', { text: 'Registers', className: 'section-title' });
  const regGrid = el('div', { className: 'register-grid', id: 'reg-grid' });
  regSection.appendChild(regTitle);
  regSection.appendChild(regGrid);

  // Flags section
  const flagSection = el('div', { className: 'section' });
  const flagTitle = el('h3', { text: 'CPSR Flags', className: 'section-title' });
  const flagGrid = el('div', { className: 'flag-grid', id: 'flag-grid' });
  flagSection.appendChild(flagTitle);
  flagSection.appendChild(flagGrid);

  // Pipeline section
  const pipeSection = el('div', { className: 'section' });
  const pipeTitle = el('h3', { text: 'Pipeline', className: 'section-title' });
  const pipeGrid = el('div', { className: 'pipeline-grid', id: 'pipeline-grid' });
  pipeSection.appendChild(pipeTitle);
  pipeSection.appendChild(pipeGrid);

  // Status section
  const statusSection = el('div', { className: 'section' });
  const statusTitle = el('h3', { text: 'Status', className: 'section-title' });
  const statusInfo = el('div', { className: 'status-info', id: 'status-info' });
  statusSection.appendChild(statusTitle);
  statusSection.appendChild(statusInfo);

  container.appendChild(regSection);
  container.appendChild(flagSection);
  container.appendChild(pipeSection);
  container.appendChild(statusSection);

  let prevRegisters: number[] = [];

  function update() {
    const snapshot = sim.cpu.getSnapshot();

    // Update registers
    regGrid.innerHTML = '';
    for (let i = 0; i < snapshot.registers.length; i++) {
      const val = snapshot.registers[i];
      const changed = prevRegisters[i] !== undefined && prevRegisters[i] !== val;
      const regEl = el('div', {
        className: `register ${changed ? 'register-changed' : ''}`,
        children: [
          el('span', { className: 'reg-name', text: REG_NAMES[i] || `R${i}` }),
          el('span', { className: 'reg-value', text: hex(val) }),
          el('span', { className: 'reg-decimal', text: `(${val})` }),
        ],
      });
      if (REG_TIPS[i]) tooltip(regEl, REG_TIPS[i]);
      regGrid.appendChild(regEl);
    }
    prevRegisters = [...snapshot.registers];

    // Update flags
    flagGrid.innerHTML = '';
    const flags = snapshot.flags;
    const flagNames = [
      { name: 'N', desc: 'Negative', value: flags.N },
      { name: 'Z', desc: 'Zero', value: flags.Z },
      { name: 'C', desc: 'Carry', value: flags.C },
      { name: 'V', desc: 'Overflow', value: flags.V },
      { name: 'I', desc: 'IRQ Disable', value: flags.I },
      { name: 'F', desc: 'FIQ Disable', value: flags.F },
    ];
    for (const f of flagNames) {
      const flagEl = el('div', {
        className: `flag ${f.value ? 'flag-set' : 'flag-clear'}`,
        children: [
          el('span', { className: 'flag-name', text: f.name }),
          el('span', { className: 'flag-desc', text: f.desc }),
          el('span', { className: 'flag-value', text: f.value ? '1' : '0' }),
        ],
      });
      if (FLAG_TIPS[f.name]) tooltip(flagEl, FLAG_TIPS[f.name]);
      flagGrid.appendChild(flagEl);
    }

    // Update pipeline
    pipeGrid.innerHTML = '';
    for (let i = 0; i < snapshot.pipeline.length; i++) {
      const entry = snapshot.pipeline[i];
      const stageName = PIPELINE_STAGE_NAMES[i] || `Stage ${i}`;
      const instText = entry.instruction
        ? OPCODE_NAMES[entry.instruction.opcode] || '???'
        : '(empty)';
      const pipeEl = el('div', {
        className: `pipeline-stage ${entry.flushed ? 'pipe-flushed' : ''} ${entry.stalled ? 'pipe-stalled' : ''} ${entry.instruction ? 'pipe-active' : 'pipe-empty'}`,
        children: [
          el('span', { className: 'pipe-stage-name', text: stageName }),
          el('span', { className: 'pipe-inst', text: instText }),
          el('span', { className: 'pipe-pc', text: entry.instruction ? hex(entry.pc, 4) : '' }),
        ],
      });
      if (PIPE_TIPS[stageName]) tooltip(pipeEl, PIPE_TIPS[stageName]);
      pipeGrid.appendChild(pipeEl);
    }

    // Update status
    statusInfo.innerHTML = '';
    const modeNames: Record<number, string> = { 0: 'User', 1: 'SVC', 2: 'IRQ', 3: 'FIQ' };
    const statusItems = [
      ['State', snapshot.state],
      ['Mode', modeNames[snapshot.mode] || 'Unknown'],
      ['Cycle', snapshot.cycle.toString()],
      ['Instructions', snapshot.instructionCount.toString()],
      ['PC', hex(snapshot.pc, 4)],
      ['SP', hex(snapshot.sp, 4)],
      ['LR', hex(snapshot.lr, 4)],
      ['CPSR', formatCPSR(snapshot.cpsr)],
    ];
    for (const [label, value] of statusItems) {
      statusInfo.appendChild(el('div', {
        className: 'status-item',
        children: [
          el('span', { className: 'status-label', text: label + ':' }),
          el('span', { className: 'status-value', text: value }),
        ],
      }));
    }
  }

  return { element: container, update };
}
