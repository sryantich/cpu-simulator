/**
 * Assembler - Converts assembly text to machine code
 *
 * Supports our ARM-like ISA with labels, directives, and comments.
 *
 * Syntax:
 *   label:          ; define a label
 *   MOV R0, #42     ; immediate
 *   ADD R1, R0, R2  ; register operands
 *   LDR R3, [R4, #8] ; memory with offset
 *   B label         ; branch to label
 *   BL function     ; branch with link
 *   .word 0x1234    ; data directive
 *   .ascii "hello"  ; string data
 *   .space 16       ; reserve bytes
 */

import {
  Opcode, Condition, REG, REG_NAMES, CONDITION_NAMES,
  encodeDataProc, encodeMemory, encodeMemoryReg, encodeBranch, encodeBX, encodeBLX,
  encodeStack, encodeSWI, encodeSystem, encodeWideImm,
  encodeShiftedReg, ShiftType, SHIFT_NAMES,
  decode, OPCODE_NAMES,
} from '../core/isa.ts';

export interface AssemblerError {
  line: number;
  column: number;
  message: string;
  source: string;
}

export interface AssemblerResult {
  success: boolean;
  machineCode: number[];
  binary: Uint8Array;
  errors: AssemblerError[];
  labels: Map<string, number>;
  sourceMap: Map<number, number>; // address -> line number
  listing: string; // human-readable listing
}

interface ParsedLine {
  label: string | null;
  mnemonic: string | null;
  condition: Condition;
  setFlags: boolean;
  operands: string[];
  original: string;
  lineNum: number;
}

// Register name lookup
const REG_MAP: Record<string, number> = {};
for (let i = 0; i < REG_NAMES.length; i++) {
  REG_MAP[REG_NAMES[i].toUpperCase()] = i;
}
REG_MAP['FP'] = 11;
REG_MAP['IP'] = 12;
REG_MAP['SP'] = 13;
REG_MAP['LR'] = 14;
REG_MAP['PC'] = 15;

// Condition suffix lookup
const COND_MAP: Record<string, Condition> = {};
for (const [val, name] of Object.entries(CONDITION_NAMES)) {
  COND_MAP[name] = Number(val) as Condition;
}

// Mnemonic to opcode lookup
const MNEMONIC_MAP: Record<string, Opcode> = {};
for (const [name, val] of Object.entries(Opcode)) {
  if (typeof val === 'number') {
    MNEMONIC_MAP[name.toUpperCase()] = val;
  }
}

// Shift type lookup
const SHIFT_MAP: Record<string, ShiftType> = {
  'LSL': ShiftType.LSL,
  'LSR': ShiftType.LSR,
  'ASR': ShiftType.ASR,
  'ROR': ShiftType.ROR,
};

export class Assembler {
  private labels = new Map<string, number>();
  private errors: AssemblerError[] = [];
  private sourceMap = new Map<number, number>();
  private baseAddress: number;

  constructor(baseAddress: number = 0) {
    this.baseAddress = baseAddress;
  }

  assemble(source: string): AssemblerResult {
    this.labels.clear();
    this.errors = [];
    this.sourceMap.clear();

    const lines = source.split('\n');
    const parsed = this.parseLines(lines);

    // First pass: collect labels
    let address = this.baseAddress;
    for (const line of parsed) {
      if (line.label) {
        this.labels.set(line.label, address);
      }
      if (line.mnemonic) {
        if (line.mnemonic === '.WORD') {
          address += 4 * Math.max(1, line.operands.length);
        } else if (line.mnemonic === '.HALF') {
          address += 2 * Math.max(1, line.operands.length);
        } else if (line.mnemonic === '.BYTE') {
          address += Math.max(1, line.operands.length);
        } else if (line.mnemonic === '.ASCII' || line.mnemonic === '.ASCIZ') {
          const str = this.parseString(line.operands.join(','));
          address += str.length + (line.mnemonic === '.ASCIZ' ? 1 : 0);
          // Align to 4 bytes
          address = (address + 3) & ~3;
        } else if (line.mnemonic === '.SPACE') {
          const size = this.parseImmediate(line.operands[0] || '0');
          address += size;
          address = (address + 3) & ~3;
        } else if (line.mnemonic === '.ALIGN') {
          const align = this.parseImmediate(line.operands[0] || '4');
          address = (address + align - 1) & ~(align - 1);
        } else {
          address += 4; // All instructions are 4 bytes
        }
      }
    }

    // Second pass: generate machine code
    address = this.baseAddress;
    const machineCode: number[] = [];
    const listing: string[] = [];

    for (const line of parsed) {
      if (line.label && !line.mnemonic) {
        listing.push(`                    ${line.label}:`);
        continue;
      }
      if (!line.mnemonic) continue;

      const startAddr = address;

      if (line.mnemonic.startsWith('.')) {
        // Directive
        const words = this.assembleDirective(line, address);
        for (const w of words) {
          machineCode.push(w);
          this.sourceMap.set(address, line.lineNum);
          address += 4;
        }
        if (words.length > 0) {
          listing.push(`  0x${startAddr.toString(16).padStart(4, '0')}: ${words.map(w => '0x' + (w >>> 0).toString(16).padStart(8, '0')).join(' ')}  ${line.original.trim()}`);
        }
      } else {
        // Instruction
        const word = this.assembleInstruction(line, address);
        machineCode.push(word);
        this.sourceMap.set(address, line.lineNum);
        listing.push(`  0x${address.toString(16).padStart(4, '0')}: 0x${(word >>> 0).toString(16).padStart(8, '0')}  ${line.original.trim()}`);
        address += 4;
      }
    }

    // Convert to binary
    const binary = new Uint8Array(machineCode.length * 4);
    const view = new DataView(binary.buffer);
    for (let i = 0; i < machineCode.length; i++) {
      view.setUint32(i * 4, machineCode[i] >>> 0, true); // little-endian
    }

    return {
      success: this.errors.length === 0,
      machineCode,
      binary,
      errors: this.errors,
      labels: new Map(this.labels),
      sourceMap: this.sourceMap,
      listing: listing.join('\n'),
    };
  }

  private parseLines(lines: string[]): ParsedLine[] {
    return lines.map((line, idx) => this.parseLine(line, idx + 1));
  }

  private parseLine(line: string, lineNum: number): ParsedLine {
    const result: ParsedLine = {
      label: null, mnemonic: null, condition: Condition.AL,
      setFlags: false, operands: [], original: line, lineNum,
    };

    // Remove comments
    let text = line.replace(/;.*$/, '').replace(/\/\/.*$/, '').trim();
    if (!text) return result;

    // Check for label
    const labelMatch = text.match(/^(\w+):\s*(.*)/);
    if (labelMatch) {
      result.label = labelMatch[1];
      text = labelMatch[2].trim();
      if (!text) return result;
    }

    // Split mnemonic and operands
    const parts = text.match(/^(\S+)\s*(.*)/);
    if (!parts) return result;

    let mnemonic = parts[1].toUpperCase();
    const operandStr = parts[2].trim();

    // Check for condition suffix and S flag
    if (mnemonic.startsWith('.')) {
      result.mnemonic = mnemonic;
    } else {
      // Parse mnemonic: base + optional condition suffix + optional S flag
      // Try all combinations in priority order to avoid ambiguity
      // (e.g. BLS = B + LS, not BL + S; ADDSEQ = ADDS + EQ is invalid but ADDEQS = ADD + EQ + S)
      let baseMnemonic = mnemonic;
      let found = false;

      // 1. Try exact match
      if (MNEMONIC_MAP[baseMnemonic] !== undefined) {
        found = true;
      }

      // 2. Try base + condition (2 chars)
      if (!found && baseMnemonic.length > 2) {
        const condStr = baseMnemonic.slice(-2);
        const basePart = baseMnemonic.slice(0, -2);
        if (COND_MAP[condStr] !== undefined && MNEMONIC_MAP[basePart] !== undefined) {
          result.condition = COND_MAP[condStr];
          baseMnemonic = basePart;
          found = true;
        }
      }

      // 3. Try base + S flag
      if (!found && baseMnemonic.endsWith('S') && baseMnemonic.length > 1) {
        const withoutS = baseMnemonic.slice(0, -1);
        if (MNEMONIC_MAP[withoutS] !== undefined) {
          result.setFlags = true;
          baseMnemonic = withoutS;
          found = true;
        }
      }

      // 4. Try base + condition + S flag (e.g. ADDEQS = ADD + EQ + S)
      if (!found && baseMnemonic.endsWith('S') && baseMnemonic.length > 3) {
        const withoutS = baseMnemonic.slice(0, -1);
        const condStr = withoutS.slice(-2);
        const basePart = withoutS.slice(0, -2);
        if (COND_MAP[condStr] !== undefined && MNEMONIC_MAP[basePart] !== undefined) {
          result.condition = COND_MAP[condStr];
          result.setFlags = true;
          baseMnemonic = basePart;
          found = true;
        }
      }

      if (MNEMONIC_MAP[baseMnemonic] !== undefined) {
        result.mnemonic = baseMnemonic;
      } else {
        result.mnemonic = mnemonic; // Keep original for error reporting
      }
    }

    // Parse operands
    if (operandStr) {
      result.operands = this.splitOperands(operandStr);
    }

    return result;
  }

  private splitOperands(str: string): string[] {
    const operands: string[] = [];
    let current = '';
    let depth = 0;
    let inString = false;

    for (const ch of str) {
      if (ch === '"') inString = !inString;
      if (inString) { current += ch; continue; }
      if (ch === '[' || ch === '{') depth++;
      if (ch === ']' || ch === '}') depth--;
      if (ch === ',' && depth === 0) {
        operands.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) operands.push(current.trim());
    return operands;
  }

  private parseRegister(str: string): number {
    const upper = str.trim().toUpperCase();
    if (REG_MAP[upper] !== undefined) return REG_MAP[upper];
    this.errors.push({ line: 0, column: 0, message: `Unknown register: ${str}`, source: str });
    return 0;
  }

  private parseImmediate(str: string): number {
    let s = str.trim();
    if (s.startsWith('#')) s = s.substring(1);

    // Check for label reference
    if (this.labels.has(s)) {
      return this.labels.get(s)!;
    }

    // Check for character literal
    if (s.startsWith("'") && s.endsWith("'")) {
      return s.charCodeAt(1);
    }

    // Numeric
    if (s.startsWith('0x') || s.startsWith('0X')) {
      return parseInt(s, 16);
    }
    if (s.startsWith('0b') || s.startsWith('0B')) {
      return parseInt(s.substring(2), 2);
    }
    return parseInt(s, 10) || 0;
  }

  private parseString(str: string): number[] {
    const bytes: number[] = [];
    let s = str.trim();
    if (s.startsWith('"')) s = s.substring(1);
    if (s.endsWith('"')) s = s.substring(0, s.length - 1);

    for (let i = 0; i < s.length; i++) {
      if (s[i] === '\\' && i + 1 < s.length) {
        switch (s[i + 1]) {
          case 'n': bytes.push(10); break;
          case 'r': bytes.push(13); break;
          case 't': bytes.push(9); break;
          case '\\': bytes.push(92); break;
          case '0': bytes.push(0); break;
          default: bytes.push(s.charCodeAt(i + 1));
        }
        i++;
      } else {
        bytes.push(s.charCodeAt(i));
      }
    }
    return bytes;
  }

  private assembleDirective(line: ParsedLine, address: number): number[] {
    const words: number[] = [];
    switch (line.mnemonic) {
      case '.WORD':
        for (const op of line.operands) {
          words.push(this.parseImmediate(op));
        }
        break;
      case '.HALF':
        // Pack two halfwords per word
        for (let i = 0; i < line.operands.length; i += 2) {
          const low = this.parseImmediate(line.operands[i]) & 0xFFFF;
          const high = i + 1 < line.operands.length ? (this.parseImmediate(line.operands[i + 1]) & 0xFFFF) : 0;
          words.push((high << 16) | low);
        }
        break;
      case '.BYTE': {
        // Pack 4 bytes per word
        const bytes = line.operands.map(op => this.parseImmediate(op) & 0xFF);
        for (let i = 0; i < bytes.length; i += 4) {
          let w = 0;
          for (let j = 0; j < 4 && i + j < bytes.length; j++) {
            w |= bytes[i + j] << (j * 8);
          }
          words.push(w);
        }
        break;
      }
      case '.ASCII':
      case '.ASCIZ': {
        const bytes = this.parseString(line.operands.join(','));
        if (line.mnemonic === '.ASCIZ') bytes.push(0);
        for (let i = 0; i < bytes.length; i += 4) {
          let w = 0;
          for (let j = 0; j < 4 && i + j < bytes.length; j++) {
            w |= bytes[i + j] << (j * 8);
          }
          words.push(w);
        }
        break;
      }
      case '.SPACE': {
        const size = this.parseImmediate(line.operands[0] || '0');
        const numWords = Math.ceil(size / 4);
        for (let i = 0; i < numWords; i++) words.push(0);
        break;
      }
      case '.ALIGN':
        // Padding handled in first pass
        break;
    }
    return words;
  }

  private assembleInstruction(line: ParsedLine, address: number): number {
    const mnemonic = line.mnemonic!;
    const opcode = MNEMONIC_MAP[mnemonic];

    if (opcode === undefined) {
      this.errors.push({
        line: line.lineNum, column: 0,
        message: `Unknown mnemonic: ${mnemonic}`,
        source: line.original,
      });
      return encodeSystem(Condition.AL, Opcode.NOP);
    }

    const category = opcode >> 4;

    switch (category) {
      case 0x0:
      case 0x1:
        return this.assembleDataProc(line, opcode, address);
      case 0x2:
        return this.assembleMem(line, opcode, address);
      case 0x3:
        return this.assembleBranch(line, opcode, address);
      case 0x4:
        return this.assembleStackOp(line, opcode);
      case 0x5:
        return this.assembleSystemOp(line, opcode);
      case 0x6:
        return this.assembleWideImm(line, opcode);
      default:
        return encodeSystem(Condition.AL, Opcode.NOP);
    }
  }

  private assembleDataProc(line: ParsedLine, opcode: Opcode, _address: number): number {
    const ops = line.operands;

    // CLZ: two operands (Rd, Rn) — no operand2
    if (opcode === Opcode.CLZ) {
      const rd = this.parseRegister(ops[0] || 'R0');
      const rn = this.parseRegister(ops[1] || 'R0');
      return encodeDataProc(line.condition, opcode, rd, rn, 0, false, line.setFlags);
    }

    // RRX: two operands (Rd, Rn) — single-bit rotate through carry
    if (opcode === Opcode.RRX) {
      const rd = this.parseRegister(ops[0] || 'R0');
      const rn = this.parseRegister(ops[1] || 'R0');
      return encodeDataProc(line.condition, opcode, rd, rn, 0, false, line.setFlags);
    }

    // MLA: four operands (Rd, Rn, Rm, Ra)
    if (opcode === Opcode.MLA) {
      const rd = this.parseRegister(ops[0] || 'R0');
      const rn = this.parseRegister(ops[1] || 'R0');
      const rm = this.parseRegister(ops[2] || 'R0');
      const ra = this.parseRegister(ops[3] || 'R0');
      // Encode Ra in the shift amount field (bits [10:7]) of operand2
      const op2 = encodeShiftedReg(rm, ShiftType.LSL, ra, false);
      return encodeDataProc(line.condition, opcode, rd, rn, op2, false, line.setFlags);
    }

    // CMP, CMN, TST, TEQ: two operands (Rn, operand2) + optional barrel shift
    if (opcode === Opcode.CMP || opcode === Opcode.CMN ||
        opcode === Opcode.TST || opcode === Opcode.TEQ) {
      const rn = this.parseRegister(ops[0] || 'R0');
      const { op2, isImm } = this.parseOperand2(ops, 1);
      return encodeDataProc(line.condition, opcode, 0, rn, op2, isImm, true);
    }

    // MOV, MVN: two operands (Rd, operand2) + optional barrel shift
    if (opcode === Opcode.MOV || opcode === Opcode.MVN) {
      const rd = this.parseRegister(ops[0] || 'R0');
      const { op2, isImm } = this.parseOperand2(ops, 1);
      return encodeDataProc(line.condition, opcode, rd, 0, op2, isImm, line.setFlags);
    }

    // Three operands: Rd, Rn, operand2 + optional barrel shift
    const rd = this.parseRegister(ops[0] || 'R0');
    const rn = this.parseRegister(ops[1] || 'R0');
    const { op2, isImm } = this.parseOperand2(ops, 2);
    return encodeDataProc(line.condition, opcode, rd, rn, op2, isImm, line.setFlags);
  }

  /**
   * Parse operand2 from the operands array starting at the given index.
   * Handles: #immediate, Rm, or Rm followed by a shift (e.g. "LSL #3", "LSR R4")
   *
   * For register operands, returns the 11-bit barrel-shifter encoded value.
   * When a shift is present (ops[startIdx+1] like "LSL #3"), it's encoded
   * into the operand2 field.
   */
  private parseOperand2(ops: string[], startIdx: number): { op2: number; isImm: boolean } {
    const op2Str = (ops[startIdx] || '#0').trim();

    // Immediate value
    if (op2Str.startsWith('#')) {
      return { op2: this.parseImmediate(op2Str), isImm: true };
    }

    // Register, possibly with barrel shift
    const rm = this.parseRegister(op2Str);

    // Check if there's a shift specifier in the next operand
    const shiftStr = (ops[startIdx + 1] || '').trim().toUpperCase();
    if (shiftStr && SHIFT_MAP[shiftStr.split(/\s+/)[0]] !== undefined) {
      return { op2: this.parseShiftedRegister(rm, shiftStr), isImm: false };
    }

    // Plain register (no shift = encodeShiftedReg with LSL #0)
    return { op2: encodeShiftedReg(rm, ShiftType.LSL, 0, false), isImm: false };
  }

  /**
   * Parse a shift specifier string like "LSL #3", "LSR R4", "ROR #8"
   * and encode it with the given register into the 11-bit operand2 field.
   */
  private parseShiftedRegister(rm: number, shiftStr: string): number {
    // Parse "LSL #3" or "LSL R4" etc.
    const parts = shiftStr.trim().split(/\s+/);
    const shiftName = parts[0].toUpperCase();
    const shiftType = SHIFT_MAP[shiftName];
    if (shiftType === undefined) {
      this.errors.push({ line: 0, column: 0, message: `Unknown shift type: ${shiftName}`, source: shiftStr });
      return encodeShiftedReg(rm, ShiftType.LSL, 0, false);
    }

    const amountStr = (parts[1] || '#0').trim();
    if (amountStr.startsWith('#')) {
      // Shift by immediate
      const amount = this.parseImmediate(amountStr);
      return encodeShiftedReg(rm, shiftType, amount & 0xF, false);
    } else {
      // Shift by register
      const rs = this.parseRegister(amountStr);
      return encodeShiftedReg(rm, shiftType, rs, true);
    }
  }

  private assembleMem(line: ParsedLine, opcode: Opcode, _address: number): number {
    const rd = this.parseRegister(line.operands[0] || 'R0');

    // Rejoin operands after Rd for memory address parsing
    const memStr = line.operands.slice(1).join(',').trim();

    // ── Post-index: [Rn], #offset  or  [Rn], Rm ──
    // Pattern: "[Rn]" followed by something outside the brackets
    const postMatch = memStr.match(/^\[\s*(\w+)\s*\]\s*,\s*(.+)$/);
    if (postMatch) {
      const rn = this.parseRegister(postMatch[1]);
      const afterStr = postMatch[2].trim();
      if (afterStr.startsWith('#') || afterStr.startsWith('-')) {
        const offset = this.parseImmediate(afterStr);
        return encodeMemory(line.condition, opcode, rd, rn, offset, false, false);
      } else {
        // Register offset post-index: [Rn], Rm  or  [Rn], Rm, LSL #n
        const parts = afterStr.split(',').map(s => s.trim());
        const rm = this.parseRegister(parts[0]);
        let shiftType = ShiftType.LSL;
        let shiftAmount = 0;
        if (parts[1]) {
          const sp = parts[1].trim().split(/\s+/);
          shiftType = SHIFT_MAP[sp[0].toUpperCase()] ?? ShiftType.LSL;
          shiftAmount = this.parseImmediate(sp[1] || '#0') & 0x3;
        }
        return encodeMemoryReg(line.condition, opcode, rd, rn, rm, shiftType, shiftAmount, false, false);
      }
    }

    // ── Pre-index: [Rn, #offset]! or [Rn, Rm]! or [Rn, Rm, LSL #n]! ──
    // ── Normal:    [Rn, #offset]  or [Rn, Rm]  or [Rn, Rm, LSL #n]  ──
    // ── Simple:    [Rn]                                              ──
    const writeback = memStr.endsWith('!');
    const cleanMem = writeback ? memStr.slice(0, -1).trim() : memStr;

    // Match bracket contents
    const bracketMatch = cleanMem.match(/^\[\s*(.+?)\s*\]$/);
    if (bracketMatch) {
      const inner = bracketMatch[1].trim();
      // Split inner contents by comma
      const innerParts = inner.split(',').map(s => s.trim());
      const rn = this.parseRegister(innerParts[0]);

      if (innerParts.length === 1) {
        // [Rn] - no offset
        return encodeMemory(line.condition, opcode, rd, rn, 0, true, writeback);
      }

      // Check if second part is an immediate
      const secondPart = innerParts[1].trim();
      if (secondPart.startsWith('#') || secondPart.startsWith('-') || /^-?\d/.test(secondPart)) {
        // [Rn, #offset] or [Rn, #offset]!
        const offset = this.parseImmediate(secondPart);
        return encodeMemory(line.condition, opcode, rd, rn, offset, true, writeback);
      }

      // Register offset: [Rn, Rm] or [Rn, Rm, LSL #n]
      const rm = this.parseRegister(secondPart);
      let shiftType = ShiftType.LSL;
      let shiftAmount = 0;
      if (innerParts.length >= 3) {
        // Parse shift: "LSL #2"
        const shiftParts = innerParts[2].trim().split(/\s+/);
        shiftType = SHIFT_MAP[shiftParts[0].toUpperCase()] ?? ShiftType.LSL;
        shiftAmount = this.parseImmediate(shiftParts[1] || '#0') & 0x3;
      }
      return encodeMemoryReg(line.condition, opcode, rd, rn, rm, shiftType, shiftAmount, true, writeback);
    }

    // ── Fallback: label reference or direct address ──
    // Try label reference: LDR R0, =label
    const eqMatch = (line.operands[1] || '').match(/^=(\w+)/);
    if (eqMatch) {
      const labelAddr = this.labels.get(eqMatch[1]);
      if (labelAddr !== undefined) {
        return encodeWideImm(line.condition, Opcode.MOVW, rd, labelAddr & 0xFFFF);
      }
    }
    // Direct address
    const addr = this.parseImmediate(line.operands[1] || '0');
    return encodeMemory(line.condition, opcode, rd, 0, addr, true, false);
  }

  private assembleBranch(line: ParsedLine, opcode: Opcode, address: number): number {
    if (opcode === Opcode.BX) {
      const rn = this.parseRegister(line.operands[0] || 'LR');
      return encodeBX(line.condition, rn);
    }

    if (opcode === Opcode.BLX) {
      const rn = this.parseRegister(line.operands[0] || 'R0');
      return encodeBLX(line.condition, rn);
    }

    const target = line.operands[0]?.trim() || '';
    let targetAddr: number;

    if (this.labels.has(target)) {
      targetAddr = this.labels.get(target)!;
    } else {
      targetAddr = this.parseImmediate(target);
    }

    // Calculate offset in words from (current + 4)
    const offset = (targetAddr - (address + 4)) >> 2;
    return encodeBranch(line.condition, opcode, offset);
  }

  private assembleStackOp(line: ParsedLine, opcode: Opcode): number {
    // Parse register list: {R0, R1, R2-R5, LR}
    let regList = 0;
    const listStr = line.operands.join(',').replace(/[{}]/g, '').trim();
    const parts = listStr.split(',');

    for (const part of parts) {
      const trimmed = part.trim();
      const rangeMatch = trimmed.match(/(\w+)\s*-\s*(\w+)/);
      if (rangeMatch) {
        const start = this.parseRegister(rangeMatch[1]);
        const end = this.parseRegister(rangeMatch[2]);
        for (let i = start; i <= end; i++) {
          regList |= (1 << i);
        }
      } else if (trimmed) {
        regList |= (1 << this.parseRegister(trimmed));
      }
    }

    return encodeStack(line.condition, opcode, regList);
  }

  private assembleSystemOp(line: ParsedLine, opcode: Opcode): number {
    if (opcode === Opcode.SWI) {
      const num = this.parseImmediate(line.operands[0] || '0');
      return encodeSWI(line.condition, num);
    }
    if (opcode === Opcode.MRS) {
      const rd = this.parseRegister(line.operands[0] || 'R0');
      return encodeDataProc(line.condition, opcode, rd, 0, 0, false, false);
    }
    if (opcode === Opcode.MSR) {
      const rn = this.parseRegister(line.operands[0] || 'R0');
      return encodeDataProc(line.condition, opcode, 0, rn, 0, false, false);
    }
    return encodeSystem(line.condition, opcode);
  }

  private assembleWideImm(line: ParsedLine, opcode: Opcode): number {
    const rd = this.parseRegister(line.operands[0] || 'R0');
    const imm = this.parseImmediate(line.operands[1] || '0');
    return encodeWideImm(line.condition, opcode, rd, imm);
  }
}

// ── Disassembler ─────────────────────────────────────────────────

export function disassemble(word: number, address?: number): string {
  const inst = decode(word);
  const condStr = inst.condition === Condition.AL ? '' : CONDITION_NAMES[inst.condition] || '';
  const opName = OPCODE_NAMES[inst.opcode] || '???';
  const category = inst.opcode >> 4;

  switch (category) {
    case 0x0:
    case 0x1: {
      // Build operand2 string with barrel shifter
      let op2Str: string;
      if (inst.isImmediate) {
        op2Str = `#${inst.operand2}`;
      } else {
        op2Str = REG_NAMES[inst.operand2 & 0xF];
        // Show barrel shift if present
        if (inst.shiftAmount > 0 && !inst.shiftByReg) {
          op2Str += `, ${SHIFT_NAMES[inst.shiftType]} #${inst.shiftAmount}`;
        } else if (inst.shiftByReg) {
          op2Str += `, ${SHIFT_NAMES[inst.shiftType]} ${REG_NAMES[inst.shiftReg]}`;
        }
      }

      // CLZ: Rd, Rn (no operand2)
      if (inst.opcode === Opcode.CLZ) {
        return `CLZ${condStr}${inst.setFlags ? 'S' : ''} ${REG_NAMES[inst.rd]}, ${REG_NAMES[inst.rn]}`;
      }
      // RRX: Rd, Rn (no operand2)
      if (inst.opcode === Opcode.RRX) {
        return `RRX${condStr}${inst.setFlags ? 'S' : ''} ${REG_NAMES[inst.rd]}, ${REG_NAMES[inst.rn]}`;
      }
      // MLA: Rd, Rn, Rm, Ra
      if (inst.opcode === Opcode.MLA) {
        const rm = REG_NAMES[inst.operand2 & 0xF];
        const ra = REG_NAMES[inst.ra];
        return `MLA${condStr}${inst.setFlags ? 'S' : ''} ${REG_NAMES[inst.rd]}, ${REG_NAMES[inst.rn]}, ${rm}, ${ra}`;
      }
      // Compare/test: two operands
      if (inst.opcode === Opcode.CMP || inst.opcode === Opcode.CMN ||
          inst.opcode === Opcode.TST || inst.opcode === Opcode.TEQ) {
        return `${opName}${condStr} ${REG_NAMES[inst.rn]}, ${op2Str}`;
      }
      // MOV/MVN: two operands
      if (inst.opcode === Opcode.MOV || inst.opcode === Opcode.MVN) {
        return `${opName}${condStr}${inst.setFlags ? 'S' : ''} ${REG_NAMES[inst.rd]}, ${op2Str}`;
      }
      // Default: three operands
      return `${opName}${condStr}${inst.setFlags ? 'S' : ''} ${REG_NAMES[inst.rd]}, ${REG_NAMES[inst.rn]}, ${op2Str}`;
    }
    case 0x2: {
      const writeback = inst.setFlags; // reused as writeback flag
      if (inst.regOffset) {
        // Register offset
        const rmName = REG_NAMES[inst.operand2 & 0xF];
        let shiftStr = '';
        if (inst.shiftAmount > 0) {
          shiftStr = `, ${SHIFT_NAMES[inst.shiftType]} #${inst.shiftAmount}`;
        }
        if (inst.postIndex) {
          // Post-index: [Rn], Rm{, shift}
          return `${opName}${condStr} ${REG_NAMES[inst.rd]}, [${REG_NAMES[inst.rn]}], ${rmName}${shiftStr}`;
        }
        // Pre-index: [Rn, Rm{, shift}]{!}
        const wb = writeback ? '!' : '';
        return `${opName}${condStr} ${REG_NAMES[inst.rd]}, [${REG_NAMES[inst.rn]}, ${rmName}${shiftStr}]${wb}`;
      }
      // Immediate offset
      const offsetStr = inst.operand2 !== 0 ? `, #${inst.operand2}` : '';
      if (inst.postIndex) {
        // Post-index: [Rn], #offset
        return `${opName}${condStr} ${REG_NAMES[inst.rd]}, [${REG_NAMES[inst.rn]}], #${inst.operand2}`;
      }
      const wb = writeback ? '!' : '';
      return `${opName}${condStr} ${REG_NAMES[inst.rd]}, [${REG_NAMES[inst.rn]}${offsetStr}]${wb}`;
    }
    case 0x3: {
      if (inst.opcode === Opcode.BX) {
        return `BX${condStr} ${REG_NAMES[inst.rn]}`;
      }
      if (inst.opcode === Opcode.BLX) {
        return `BLX${condStr} ${REG_NAMES[inst.rn]}`;
      }
      if (address !== undefined) {
        const target = address + 4 + inst.branchOffset * 4;
        return `${opName}${condStr} 0x${target.toString(16)}`;
      }
      return `${opName}${condStr} ${inst.branchOffset >= 0 ? '+' : ''}${inst.branchOffset}`;
    }
    case 0x4: {
      const regs: string[] = [];
      for (let i = 0; i < 16; i++) {
        if (inst.regList & (1 << i)) regs.push(REG_NAMES[i]);
      }
      return `${opName}${condStr} {${regs.join(', ')}}`;
    }
    case 0x5: {
      if (inst.opcode === Opcode.SWI) return `SWI${condStr} #${inst.swiNumber}`;
      if (inst.opcode === Opcode.MRS) return `MRS${condStr} ${REG_NAMES[inst.rd]}, CPSR`;
      if (inst.opcode === Opcode.MSR) return `MSR${condStr} CPSR, ${REG_NAMES[inst.rn]}`;
      return `${opName}${condStr}`;
    }
    case 0x6: {
      return `${opName}${condStr} ${REG_NAMES[inst.rd]}, #0x${(inst.operand2 & 0xFFFF).toString(16)}`;
    }
    default:
      return `??? (0x${(word >>> 0).toString(16).padStart(8, '0')})`;
  }
}

/** Disassemble a range of memory */
export function disassembleRange(
  memory: { readWord(addr: number): number },
  start: number,
  count: number
): { address: number; word: number; text: string }[] {
  const result: { address: number; word: number; text: string }[] = [];
  for (let i = 0; i < count; i++) {
    const addr = start + i * 4;
    const word = memory.readWord(addr);
    result.push({
      address: addr,
      word,
      text: disassemble(word, addr),
    });
  }
  return result;
}
