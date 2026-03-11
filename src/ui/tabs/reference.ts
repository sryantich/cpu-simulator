/**
 * ISA Reference Tab - Searchable instruction set cheat sheet
 *
 * Provides a comprehensive, interactive reference for all supported
 * instructions with syntax, flags affected, ARM equivalence notes,
 * and examples.
 */

import type { Simulator } from '../../core/simulator.ts';
import { el } from '../helpers.ts';

// ── Instruction reference data ───────────────────────────────────

interface InstructionRef {
  mnemonic: string;
  syntax: string;
  description: string;
  operation: string;
  category: string;
  flags: string;       // e.g. "NZCV" or "----" or "NZC-"
  armMatch: boolean;    // true if identical to real ARM
  armNote?: string;     // divergence note
  example: string;
}

const ISA_REFERENCE: InstructionRef[] = [
  // ── Data Processing ──
  { mnemonic: 'MOV', syntax: 'MOV{cond}{S} Rd, operand2', description: 'Move value to register', operation: 'Rd = operand2', category: 'Data Processing', flags: 'NZC-', armMatch: true, example: 'MOV R0, #42\nMOV R1, R0' },
  { mnemonic: 'MVN', syntax: 'MVN{cond}{S} Rd, operand2', description: 'Move NOT (bitwise complement)', operation: 'Rd = ~operand2', category: 'Data Processing', flags: 'NZC-', armMatch: true, example: 'MVN R0, #0    ; R0 = -1\nMVN R1, R0   ; R1 = 0' },
  { mnemonic: 'ADD', syntax: 'ADD{cond}{S} Rd, Rn, operand2', description: 'Add', operation: 'Rd = Rn + operand2', category: 'Data Processing', flags: 'NZCV', armMatch: true, example: 'ADD R2, R0, R1\nADD R3, R0, #10' },
  { mnemonic: 'SUB', syntax: 'SUB{cond}{S} Rd, Rn, operand2', description: 'Subtract', operation: 'Rd = Rn - operand2', category: 'Data Processing', flags: 'NZCV', armMatch: true, example: 'SUB R2, R0, R1\nSUB R3, R0, #5' },
  { mnemonic: 'RSB', syntax: 'RSB{cond}{S} Rd, Rn, operand2', description: 'Reverse subtract', operation: 'Rd = operand2 - Rn', category: 'Data Processing', flags: 'NZCV', armMatch: true, example: 'RSB R0, R0, #0  ; negate R0' },
  { mnemonic: 'MUL', syntax: 'MUL{cond}{S} Rd, Rn, operand2', description: 'Multiply', operation: 'Rd = Rn * operand2', category: 'Data Processing', flags: 'NZ--', armMatch: true, example: 'MUL R2, R0, R1' },
  { mnemonic: 'DIV', syntax: 'DIV{cond} Rd, Rn, operand2', description: 'Signed divide', operation: 'Rd = Rn / operand2', category: 'Data Processing', flags: '----', armMatch: false, armNote: 'ARM: SDIV (ARMv7+ only, not all cores)', example: 'DIV R2, R0, R1' },
  { mnemonic: 'MOD', syntax: 'MOD{cond} Rd, Rn, operand2', description: 'Modulo (remainder)', operation: 'Rd = Rn % operand2', category: 'Data Processing', flags: '----', armMatch: false, armNote: 'ARM: No direct equivalent. Use MLS (Rn - (Rn/op2)*op2)', example: 'MOD R2, R0, R1' },
  { mnemonic: 'AND', syntax: 'AND{cond}{S} Rd, Rn, operand2', description: 'Bitwise AND', operation: 'Rd = Rn & operand2', category: 'Data Processing', flags: 'NZC-', armMatch: true, example: 'AND R2, R0, #0xFF  ; mask low byte' },
  { mnemonic: 'ORR', syntax: 'ORR{cond}{S} Rd, Rn, operand2', description: 'Bitwise OR', operation: 'Rd = Rn | operand2', category: 'Data Processing', flags: 'NZC-', armMatch: true, example: 'ORR R0, R0, #0x80  ; set bit 7' },
  { mnemonic: 'EOR', syntax: 'EOR{cond}{S} Rd, Rn, operand2', description: 'Bitwise Exclusive OR', operation: 'Rd = Rn ^ operand2', category: 'Data Processing', flags: 'NZC-', armMatch: true, example: 'EOR R0, R0, R1  ; toggle bits' },
  { mnemonic: 'BIC', syntax: 'BIC{cond}{S} Rd, Rn, operand2', description: 'Bit clear (AND NOT)', operation: 'Rd = Rn & ~operand2', category: 'Data Processing', flags: 'NZC-', armMatch: true, example: 'BIC R0, R0, #0x80  ; clear bit 7' },
  { mnemonic: 'LSL', syntax: 'LSL{cond}{S} Rd, Rn, operand2', description: 'Logical shift left', operation: 'Rd = Rn << operand2', category: 'Data Processing', flags: 'NZC-', armMatch: true, example: 'LSL R0, R0, #2  ; multiply by 4' },
  { mnemonic: 'LSR', syntax: 'LSR{cond}{S} Rd, Rn, operand2', description: 'Logical shift right (unsigned)', operation: 'Rd = Rn >>> operand2', category: 'Data Processing', flags: 'NZC-', armMatch: true, example: 'LSR R0, R0, #1  ; unsigned divide by 2' },
  { mnemonic: 'ASR', syntax: 'ASR{cond}{S} Rd, Rn, operand2', description: 'Arithmetic shift right (signed)', operation: 'Rd = Rn >> operand2', category: 'Data Processing', flags: 'NZC-', armMatch: true, example: 'ASR R0, R0, #1  ; signed divide by 2' },
  { mnemonic: 'ROR', syntax: 'ROR{cond}{S} Rd, Rn, operand2', description: 'Rotate right', operation: 'Rd = Rn rotated right by operand2', category: 'Data Processing', flags: 'NZC-', armMatch: true, example: 'ROR R0, R0, #8  ; rotate right 8 bits' },
  { mnemonic: 'RRX', syntax: 'RRX{cond}{S} Rd, Rn', description: 'Rotate right extended through carry', operation: 'Rd = (C << 31) | (Rn >>> 1); C = Rn[0]', category: 'Data Processing', flags: 'NZC-', armMatch: true, example: 'RRX R0, R0  ; 33-bit rotate through carry' },
  { mnemonic: 'CLZ', syntax: 'CLZ{cond} Rd, Rn', description: 'Count leading zeros', operation: 'Rd = number of leading 0 bits in Rn', category: 'Data Processing', flags: '----', armMatch: true, armNote: 'ARMv5+', example: 'CLZ R1, R0  ; if R0=0x0F, R1=28' },
  { mnemonic: 'MLA', syntax: 'MLA{cond}{S} Rd, Rn, Rm, Ra', description: 'Multiply-accumulate', operation: 'Rd = Rn * Rm + Ra', category: 'Data Processing', flags: 'NZ--', armMatch: true, example: 'MLA R0, R1, R2, R3  ; R0 = R1*R2+R3' },
  { mnemonic: 'ADC', syntax: 'ADC{cond}{S} Rd, Rn, operand2', description: 'Add with carry', operation: 'Rd = Rn + operand2 + C', category: 'Data Processing', flags: 'NZCV', armMatch: true, example: '; 64-bit add: ADDS R0,R0,R2; ADC R1,R1,R3' },
  { mnemonic: 'SBC', syntax: 'SBC{cond}{S} Rd, Rn, operand2', description: 'Subtract with carry (borrow)', operation: 'Rd = Rn - operand2 - !C', category: 'Data Processing', flags: 'NZCV', armMatch: true, example: '; 64-bit sub: SUBS R0,R0,R2; SBC R1,R1,R3' },

  // ── Comparison (flags-only) ──
  { mnemonic: 'CMP', syntax: 'CMP{cond} Rn, operand2', description: 'Compare (subtract, flags only)', operation: 'flags = Rn - operand2', category: 'Comparison', flags: 'NZCV', armMatch: true, example: 'CMP R0, #10\nBEQ equal_label' },
  { mnemonic: 'CMN', syntax: 'CMN{cond} Rn, operand2', description: 'Compare negative (add, flags only)', operation: 'flags = Rn + operand2', category: 'Comparison', flags: 'NZCV', armMatch: true, example: 'CMN R0, #1  ; same as CMP R0, #-1' },
  { mnemonic: 'TST', syntax: 'TST{cond} Rn, operand2', description: 'Test bits (AND, flags only)', operation: 'flags = Rn & operand2', category: 'Comparison', flags: 'NZC-', armMatch: true, example: 'TST R0, #0x80  ; test bit 7' },
  { mnemonic: 'TEQ', syntax: 'TEQ{cond} Rn, operand2', description: 'Test equivalence (XOR, flags only)', operation: 'flags = Rn ^ operand2', category: 'Comparison', flags: 'NZC-', armMatch: true, example: 'TEQ R0, R1  ; test if equal\nBEQ same_value' },

  // ── Memory Access ──
  { mnemonic: 'LDR', syntax: 'LDR{cond} Rd, [Rn{, #off}]{!}', description: 'Load word (32-bit) from memory', operation: 'Rd = mem[Rn + offset]', category: 'Memory', flags: '----', armMatch: true, armNote: 'Supports pre-index (!), post-index, and register offset with shift', example: 'LDR R0, [R1, #4]     ; pre-index\nLDR R0, [R1, #4]!    ; pre-index + writeback\nLDR R0, [R1], #4     ; post-index\nLDR R0, [R1, R2]     ; register offset\nLDR R0, [R1, R2, LSL #2] ; scaled register' },
  { mnemonic: 'STR', syntax: 'STR{cond} Rd, [Rn{, #off}]{!}', description: 'Store word (32-bit) to memory', operation: 'mem[Rn + offset] = Rd', category: 'Memory', flags: '----', armMatch: true, example: 'STR R0, [R1, #4]\nSTR R0, [SP, #-4]!' },
  { mnemonic: 'LDRB', syntax: 'LDRB{cond} Rd, [Rn, #offset]', description: 'Load byte (8-bit, zero-extended)', operation: 'Rd = mem_byte[Rn + offset]', category: 'Memory', flags: '----', armMatch: true, example: 'LDRB R0, [R1]' },
  { mnemonic: 'STRB', syntax: 'STRB{cond} Rd, [Rn, #offset]', description: 'Store byte (8-bit)', operation: 'mem_byte[Rn + offset] = Rd[7:0]', category: 'Memory', flags: '----', armMatch: true, example: 'STRB R0, [R1]' },
  { mnemonic: 'LDRH', syntax: 'LDRH{cond} Rd, [Rn, #offset]', description: 'Load halfword (16-bit, zero-extended)', operation: 'Rd = mem_half[Rn + offset]', category: 'Memory', flags: '----', armMatch: true, example: 'LDRH R0, [R1, #2]' },
  { mnemonic: 'STRH', syntax: 'STRH{cond} Rd, [Rn, #offset]', description: 'Store halfword (16-bit)', operation: 'mem_half[Rn + offset] = Rd[15:0]', category: 'Memory', flags: '----', armMatch: true, example: 'STRH R0, [R1, #2]' },
  { mnemonic: 'LDRSB', syntax: 'LDRSB{cond} Rd, [Rn, #offset]', description: 'Load signed byte (sign-extended to 32-bit)', operation: 'Rd = sign_extend(mem_byte[Rn + offset])', category: 'Memory', flags: '----', armMatch: true, example: 'LDRSB R0, [R1]  ; if byte=0xFF, R0=0xFFFFFFFF (-1)' },
  { mnemonic: 'LDRSH', syntax: 'LDRSH{cond} Rd, [Rn, #offset]', description: 'Load signed halfword (sign-extended to 32-bit)', operation: 'Rd = sign_extend(mem_half[Rn + offset])', category: 'Memory', flags: '----', armMatch: true, example: 'LDRSH R0, [R1]  ; if half=0x8000, R0=0xFFFF8000' },

  // ── Branch ──
  { mnemonic: 'B', syntax: 'B{cond} label', description: 'Branch (PC-relative jump)', operation: 'PC = label', category: 'Branch', flags: '----', armMatch: true, example: 'B loop_start\nBEQ equal_case\nBLT less_than' },
  { mnemonic: 'BL', syntax: 'BL{cond} label', description: 'Branch with Link (function call)', operation: 'LR = PC + 4; PC = label', category: 'Branch', flags: '----', armMatch: true, example: 'BL my_function' },
  { mnemonic: 'BX', syntax: 'BX{cond} Rn', description: 'Branch to register (return)', operation: 'PC = Rn', category: 'Branch', flags: '----', armMatch: true, armNote: 'ARM BX also switches Thumb mode; here it is a simple register branch', example: 'BX LR  ; return from function' },
  { mnemonic: 'BLX', syntax: 'BLX{cond} Rn', description: 'Branch with link and exchange (indirect call)', operation: 'LR = PC + 4; PC = Rn', category: 'Branch', flags: '----', armMatch: true, armNote: 'ARM BLX also switches Thumb mode; here it is an indirect function call via register', example: 'MOV R4, #func_addr\nBLX R4  ; call function at R4' },

  // ── Stack ──
  { mnemonic: 'PUSH', syntax: 'PUSH{cond} {reglist}', description: 'Push registers onto stack', operation: 'SP -= 4*N; mem[SP..] = regs', category: 'Stack', flags: '----', armMatch: true, example: 'PUSH {R4-R7, LR}' },
  { mnemonic: 'POP', syntax: 'POP{cond} {reglist}', description: 'Pop registers from stack', operation: 'regs = mem[SP..]; SP += 4*N', category: 'Stack', flags: '----', armMatch: true, example: 'POP {R4-R7, PC}  ; return via PC' },

  // ── System ──
  { mnemonic: 'SWI', syntax: 'SWI{cond} #N', description: 'Software interrupt (syscall)', operation: 'Trigger supervisor call #N', category: 'System', flags: '----', armMatch: true, armNote: 'ARM also uses SVC mnemonic (SWI is legacy)', example: 'MOV R0, #65  ; char\nSWI #11      ; putchar' },
  { mnemonic: 'NOP', syntax: 'NOP', description: 'No operation', operation: '(nothing)', category: 'System', flags: '----', armMatch: true, example: 'NOP' },
  { mnemonic: 'HALT', syntax: 'HALT', description: 'Halt CPU execution', operation: 'CPU state = HALTED', category: 'System', flags: '----', armMatch: false, armNote: 'ARM has no HALT; typically uses WFI or UDF', example: 'HALT' },
  { mnemonic: 'MRS', syntax: 'MRS{cond} Rd, CPSR', description: 'Read status register', operation: 'Rd = CPSR', category: 'System', flags: '----', armMatch: true, example: 'MRS R0, CPSR' },
  { mnemonic: 'MSR', syntax: 'MSR{cond} CPSR, Rn', description: 'Write status register', operation: 'CPSR = Rn', category: 'System', flags: 'NZCV', armMatch: true, example: 'MSR CPSR, R0' },
  { mnemonic: 'WFI', syntax: 'WFI', description: 'Wait for interrupt', operation: 'CPU state = WAITING', category: 'System', flags: '----', armMatch: true, example: 'WFI  ; sleep until IRQ' },

  // ── Wide Immediate ──
  { mnemonic: 'MOVW', syntax: 'MOVW{cond} Rd, #imm16', description: 'Move 16-bit immediate to low halfword', operation: 'Rd[15:0] = imm16; Rd[31:16] = 0', category: 'Wide Immediate', flags: '----', armMatch: true, armNote: 'ARMv6T2+', example: 'MOVW R0, #0x1234' },
  { mnemonic: 'MOVT', syntax: 'MOVT{cond} Rd, #imm16', description: 'Move 16-bit immediate to high halfword', operation: 'Rd[31:16] = imm16; Rd[15:0] unchanged', category: 'Wide Immediate', flags: '----', armMatch: true, armNote: 'ARMv6T2+', example: 'MOVW R0, #0x5678\nMOVT R0, #0x1234\n; R0 = 0x12345678' },
];

// ── Condition codes reference ────────────────────────────────────

interface ConditionRef {
  suffix: string;
  meaning: string;
  flags: string;
}

const CONDITION_REFERENCE: ConditionRef[] = [
  { suffix: 'EQ', meaning: 'Equal', flags: 'Z=1' },
  { suffix: 'NE', meaning: 'Not equal', flags: 'Z=0' },
  { suffix: 'CS/HS', meaning: 'Carry set / Unsigned higher or same', flags: 'C=1' },
  { suffix: 'CC/LO', meaning: 'Carry clear / Unsigned lower', flags: 'C=0' },
  { suffix: 'MI', meaning: 'Minus (negative)', flags: 'N=1' },
  { suffix: 'PL', meaning: 'Plus (positive or zero)', flags: 'N=0' },
  { suffix: 'VS', meaning: 'Overflow set', flags: 'V=1' },
  { suffix: 'VC', meaning: 'Overflow clear', flags: 'V=0' },
  { suffix: 'HI', meaning: 'Unsigned higher', flags: 'C=1 and Z=0' },
  { suffix: 'LS', meaning: 'Unsigned lower or same', flags: 'C=0 or Z=1' },
  { suffix: 'GE', meaning: 'Signed greater or equal', flags: 'N=V' },
  { suffix: 'LT', meaning: 'Signed less than', flags: 'N!=V' },
  { suffix: 'GT', meaning: 'Signed greater than', flags: 'Z=0 and N=V' },
  { suffix: 'LE', meaning: 'Signed less or equal', flags: 'Z=1 or N!=V' },
  { suffix: 'AL', meaning: 'Always (default)', flags: '(unconditional)' },
];

// ── Tab creation ─────────────────────────────────────────────────

export function createReferenceTab(_sim: Simulator): { element: HTMLElement; update: () => void } {
  const container = el('div', { className: 'tab-content reference-tab' });

  // Summary bar
  const armCount = ISA_REFERENCE.filter(i => i.armMatch).length;
  const totalCount = ISA_REFERENCE.length;
  const summary = el('div', { className: 'ref-summary', children: [
    el('div', { className: 'ref-summary-item', children: [
      el('span', { className: 'ref-summary-count', text: String(totalCount) }),
      el('span', { text: ' instructions' }),
    ]}),
    el('div', { className: 'ref-summary-item', children: [
      el('span', { className: 'ref-summary-count', text: String(armCount) }),
      el('span', { text: ' ARM-identical' }),
    ]}),
    el('div', { className: 'ref-summary-item', children: [
      el('span', { className: 'ref-summary-count', text: '15' }),
      el('span', { text: ' condition codes' }),
    ]}),
    el('div', { className: 'ref-summary-item', children: [
      el('span', { className: 'ref-summary-count', text: '16' }),
      el('span', { text: ' registers (R0-R15)' }),
    ]}),
  ]});

  // Search bar
  const searchBar = el('div', { className: 'reference-search-bar' });
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'reference-search-input';
  searchInput.placeholder = 'Search instructions... (e.g. "add", "branch", "memory")';

  // Category filter buttons
  const categories = [...new Set(ISA_REFERENCE.map(i => i.category))];
  const filterBtns: HTMLElement[] = [];

  const allBtn = el('button', { className: 'reference-filter-btn active', text: 'All' });
  filterBtns.push(allBtn);

  for (const cat of categories) {
    const btn = el('button', { className: 'reference-filter-btn', text: cat });
    filterBtns.push(btn);
  }

  // Add special reference section buttons
  const shifterBtn = el('button', { className: 'reference-filter-btn', text: 'Barrel Shifter' });
  filterBtns.push(shifterBtn);
  const condBtn = el('button', { className: 'reference-filter-btn', text: 'Conditions' });
  filterBtns.push(condBtn);

  searchBar.appendChild(searchInput);
  for (const btn of filterBtns) {
    searchBar.appendChild(btn);
  }

  // Content area
  const content = el('div', { className: 'reference-content' });

  // State
  let activeFilter = 'All';
  let expandedMnemonic: string | null = null;

  function renderInstructions() {
    content.innerHTML = '';
    const query = searchInput.value.toLowerCase().trim();

    // Show condition codes if that filter is active
    if (activeFilter === 'Conditions') {
      renderConditionCodes(content, query);
      return;
    }

    // Show barrel shifter reference if that filter is active
    if (activeFilter === 'Barrel Shifter') {
      renderBarrelShifter(content, query);
      return;
    }

    // Group by category
    const grouped = new Map<string, InstructionRef[]>();
    for (const inst of ISA_REFERENCE) {
      // Filter by category
      if (activeFilter !== 'All' && inst.category !== activeFilter) continue;
      // Filter by search
      if (query) {
        const searchable = `${inst.mnemonic} ${inst.description} ${inst.operation} ${inst.category} ${inst.syntax}`.toLowerCase();
        if (!searchable.includes(query)) continue;
      }

      const list = grouped.get(inst.category) || [];
      list.push(inst);
      grouped.set(inst.category, list);
    }

    if (grouped.size === 0) {
      content.appendChild(el('div', { className: 'empty-state', text: 'No instructions match your search.' }));
      return;
    }

    for (const [category, instructions] of grouped) {
      const section = el('div', { className: 'reference-category' });
      section.appendChild(el('div', { className: 'reference-category-header', text: category }));

      for (const inst of instructions) {
        const isExpanded = expandedMnemonic === inst.mnemonic;
        const row = el('div', { className: `reference-instruction ${isExpanded ? 'ref-expanded' : ''}` });

        const mnemonicEl = el('span', { className: 'ref-mnemonic', text: inst.mnemonic });
        const syntaxEl = el('span', { className: 'ref-syntax', text: inst.syntax });
        const descEl = el('span', { className: 'ref-description', children: [
          inst.description + ' ',
          inst.armMatch
            ? el('span', { className: 'ref-arm-match', text: '[ARM]' })
            : el('span', { className: 'ref-arm-diverge', text: '[custom]' }),
        ]});

        row.appendChild(mnemonicEl);
        row.appendChild(syntaxEl);
        row.appendChild(descEl);

        // Expanded detail
        if (isExpanded) {
          const detail = el('div', { className: 'ref-detail' });

          detail.appendChild(el('div', { className: 'ref-detail-row', children: [
            el('span', { className: 'ref-detail-label', text: 'Operation:' }),
            el('span', { className: 'ref-detail-value', text: inst.operation }),
          ]}));

          // Flags
          const flagsEl = el('div', { className: 'ref-detail-row', children: [
            el('span', { className: 'ref-detail-label', text: 'Flags:' }),
            el('span', { className: 'ref-flags', children:
              'NZCV'.split('').map((f, i) => {
                const affected = inst.flags[i] !== '-';
                return el('span', {
                  className: affected ? 'ref-flag-affected' : 'ref-flag-unchanged',
                  text: f,
                });
              }),
            }),
          ]});
          detail.appendChild(flagsEl);

          if (inst.armNote) {
            detail.appendChild(el('div', { className: 'ref-detail-row', children: [
              el('span', { className: 'ref-detail-label', text: 'ARM note:' }),
              el('span', { className: 'ref-detail-value', text: inst.armNote }),
            ]}));
          }

          detail.appendChild(el('div', { className: 'ref-detail-row', children: [
            el('span', { className: 'ref-detail-label', text: 'Example:' }),
            el('pre', { className: 'ref-detail-value', text: inst.example, style: { margin: '0', whiteSpace: 'pre-wrap' } }),
          ]}));

          row.appendChild(detail);
        }

        row.addEventListener('click', () => {
          expandedMnemonic = isExpanded ? null : inst.mnemonic;
          renderInstructions();
        });

        section.appendChild(row);
      }

      content.appendChild(section);
    }
  }

  function renderBarrelShifter(container: HTMLElement, query: string) {
    // Overview section
    const overview = el('div', { className: 'reference-category' });
    overview.appendChild(el('div', { className: 'reference-category-header', text: 'Barrel Shifter' }));

    const introText = 'In ARM, the second operand (operand2) of data processing instructions can optionally include a shift or rotate operation applied to a register. This is called the "barrel shifter" and executes in the same cycle as the instruction — no extra cost.';
    if (!query || introText.toLowerCase().includes(query)) {
      overview.appendChild(el('div', { className: 'ref-detail', style: { margin: '8px 16px' }, children: [
        el('div', { className: 'ref-detail-row', children: [
          el('span', { className: 'ref-detail-value', text: introText }),
        ]}),
      ]}));
    }
    container.appendChild(overview);

    // Shift types table
    const shifterOps: { name: string; syntax: string; operation: string; example: string }[] = [
      { name: 'LSL', syntax: 'Rm, LSL #n  /  Rm, LSL Rs', operation: 'Rm << n (logical shift left)', example: 'ADD R0, R1, R2, LSL #3  ; R0 = R1 + (R2 * 8)' },
      { name: 'LSR', syntax: 'Rm, LSR #n  /  Rm, LSR Rs', operation: 'Rm >>> n (logical shift right, zero-fill)', example: 'MOV R0, R1, LSR #4  ; R0 = R1 / 16 (unsigned)' },
      { name: 'ASR', syntax: 'Rm, ASR #n  /  Rm, ASR Rs', operation: 'Rm >> n (arithmetic shift right, sign-extend)', example: 'MOV R0, R1, ASR #1  ; R0 = R1 / 2 (signed)' },
      { name: 'ROR', syntax: 'Rm, ROR #n  /  Rm, ROR Rs', operation: 'Rotate right: bits shifted out re-enter at top', example: 'MOV R0, R1, ROR #8  ; rotate right 8 bits' },
    ];

    const typesSection = el('div', { className: 'reference-category' });
    typesSection.appendChild(el('div', { className: 'reference-category-header', text: 'Shift Types' }));

    let shiftTypesCount = 0;
    for (const op of shifterOps) {
      if (query) {
        const searchable = `${op.name} ${op.syntax} ${op.operation} ${op.example} barrel shift`.toLowerCase();
        if (!searchable.includes(query)) continue;
      }

      const row = el('div', { className: 'reference-instruction' });
      row.appendChild(el('span', { className: 'ref-mnemonic', text: op.name }));
      row.appendChild(el('span', { className: 'ref-syntax', text: op.syntax }));
      row.appendChild(el('span', { className: 'ref-description', text: op.operation }));

      const detail = el('div', { className: 'ref-detail' });
      detail.appendChild(el('div', { className: 'ref-detail-row', children: [
        el('span', { className: 'ref-detail-label', text: 'Example:' }),
        el('pre', { className: 'ref-detail-value', text: op.example, style: { margin: '0', whiteSpace: 'pre-wrap' } }),
      ]}));
      row.appendChild(detail);
      typesSection.appendChild(row);
      shiftTypesCount++;
    }
    if (shiftTypesCount > 0) container.appendChild(typesSection);

    // Usage patterns
    const patternsSection = el('div', { className: 'reference-category' });
    patternsSection.appendChild(el('div', { className: 'reference-category-header', text: 'Common Patterns' }));

    const patterns = [
      { title: 'Multiply by constant', code: 'ADD R0, R1, R1, LSL #2  ; R0 = R1 * 5 (R1 + R1*4)\nRSB R0, R1, R1, LSL #3  ; R0 = R1 * 7 (R1*8 - R1)' },
      { title: 'Array indexing', code: 'LDR R0, [R1, R2, LSL #2]  ; word array: R0 = mem[R1 + R2*4]\n; (register offset addressing required)' },
      { title: 'Bit manipulation', code: 'AND R0, R1, R2, LSR #8  ; mask after shifting\nORR R0, R0, R1, LSL #16 ; pack value into upper half' },
      { title: 'Carry flag from shift', code: 'MOVS R0, R1, LSL #1  ; C flag = old bit 31 of R1\nADC R2, R2, #0       ; add the carry into R2' },
    ];

    const allPatternsMatch = !query || 'common patterns barrel shift multiply array'.includes(query);
    let patternCount = 0;
    if (allPatternsMatch || query) {
      for (const pat of patterns) {
        if (query && !pat.title.toLowerCase().includes(query) && !pat.code.toLowerCase().includes(query)) continue;
        const row = el('div', { className: 'ref-detail', style: { margin: '8px 16px' } });
        row.appendChild(el('div', { className: 'ref-detail-row', children: [
          el('span', { className: 'ref-detail-label', text: pat.title + ':' }),
          el('pre', { className: 'ref-detail-value', text: pat.code, style: { margin: '0', whiteSpace: 'pre-wrap' } }),
        ]}));
        patternsSection.appendChild(row);
        patternCount++;
      }
    }
    if (patternCount > 0) container.appendChild(patternsSection);

    // Notes
    const notesSection = el('div', { className: 'ref-detail', style: { margin: '12px 16px' } });
    const notes = [
      { label: 'Applies to:', value: 'All data processing instructions (ADD, SUB, MOV, CMP, AND, ORR, etc.)' },
      { label: 'Shift amount:', value: 'Immediate (0-15) or register value (low byte used)' },
      { label: 'Carry out:', value: 'When S flag set, the barrel shifter carry-out updates the C flag for logical operations (MOV, MVN, AND, ORR, EOR, BIC, TST, TEQ)' },
      { label: 'ARM note:', value: 'Identical to ARM barrel shifter. ARM supports shift amounts 0-31 by immediate; our encoding uses 4 bits (0-15).' },
    ];
    for (const note of notes) {
      if (query && !note.label.toLowerCase().includes(query) && !note.value.toLowerCase().includes(query)) continue;
      notesSection.appendChild(el('div', { className: 'ref-detail-row', children: [
        el('span', { className: 'ref-detail-label', text: note.label }),
        el('span', { className: 'ref-detail-value', text: note.value }),
      ]}));
    }
    container.appendChild(notesSection);
  }

  function renderConditionCodes(container: HTMLElement, query: string) {
    const section = el('div', { className: 'reference-category' });
    section.appendChild(el('div', { className: 'reference-category-header', text: 'Condition Code Suffixes' }));

    for (const cond of CONDITION_REFERENCE) {
      if (query) {
        const searchable = `${cond.suffix} ${cond.meaning} ${cond.flags}`.toLowerCase();
        if (!searchable.includes(query)) continue;
      }

      const row = el('div', { className: 'reference-instruction' });
      row.appendChild(el('span', { className: 'ref-mnemonic', text: cond.suffix }));
      row.appendChild(el('span', { className: 'ref-syntax', text: cond.flags }));
      row.appendChild(el('span', { className: 'ref-description', text: cond.meaning }));
      section.appendChild(row);
    }

    container.appendChild(section);

    // Usage note
    container.appendChild(el('div', { className: 'ref-detail', style: { margin: '12px 16px' }, children: [
      el('div', { className: 'ref-detail-row', children: [
        el('span', { className: 'ref-detail-label', text: 'Usage:' }),
        el('span', { className: 'ref-detail-value', text: 'Append to any mnemonic: MOVEQ, ADDNE, BLT, SUBGT, etc.' }),
      ]}),
      el('div', { className: 'ref-detail-row', children: [
        el('span', { className: 'ref-detail-label', text: 'S suffix:' }),
        el('span', { className: 'ref-detail-value', text: 'Append S to set flags: ADDS, SUBS, MOVS, ANDS, etc.' }),
      ]}),
      el('div', { className: 'ref-detail-row', children: [
        el('span', { className: 'ref-detail-label', text: 'Combined:' }),
        el('span', { className: 'ref-detail-value', text: 'Condition + S: ADDEQS, SUBNES (S flag + condition)' }),
      ]}),
    ]}));
  }

  // Filter button handlers
  for (const btn of filterBtns) {
    btn.addEventListener('click', () => {
      activeFilter = btn.textContent || 'All';
      for (const b of filterBtns) b.classList.remove('active');
      btn.classList.add('active');
      renderInstructions();
    });
  }

  // Search handler — auto-switch to "All" when typing a query
  searchInput.addEventListener('input', () => {
    if (searchInput.value.trim() && activeFilter !== 'All') {
      activeFilter = 'All';
      for (const b of filterBtns) b.classList.remove('active');
      allBtn.classList.add('active');
    }
    renderInstructions();
  });

  // Assemble
  container.appendChild(summary);
  container.appendChild(searchBar);
  container.appendChild(content);

  // Initial render
  renderInstructions();

  return { element: container, update: () => {} };
}
