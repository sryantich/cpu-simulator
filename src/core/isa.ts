/**
 * ARM-inspired Instruction Set Architecture
 *
 * 32-bit fixed-width instructions (simplified ARM-like encoding)
 *
 * Instruction format:
 * [31:28] Condition code (4 bits)
 * [27:24] Opcode category (4 bits)
 * [23:0]  Operands (24 bits, varies by instruction type)
 *
 * Register names:
 * R0-R12  : General purpose
 * R13/SP  : Stack pointer
 * R14/LR  : Link register
 * R15/PC  : Program counter
 *
 * Special registers:
 * CPSR    : Current program status register
 *   [31] N (negative)
 *   [30] Z (zero)
 *   [29] C (carry)
 *   [28] V (overflow)
 *   [7]  I (IRQ disable)
 *   [6]  F (FIQ disable)
 *   [4:0] Mode (0=User, 1=Kernel/SVC, 2=IRQ, 3=FIQ)
 */

// ── Condition Codes ──────────────────────────────────────────────
export enum Condition {
  EQ = 0b0000,  // Equal (Z=1)
  NE = 0b0001,  // Not equal (Z=0)
  CS = 0b0010,  // Carry set / unsigned higher or same (C=1)
  CC = 0b0011,  // Carry clear / unsigned lower (C=0)
  MI = 0b0100,  // Minus / negative (N=1)
  PL = 0b0101,  // Plus / positive (N=0)
  VS = 0b0110,  // Overflow (V=1)
  VC = 0b0111,  // No overflow (V=0)
  HI = 0b1000,  // Unsigned higher (C=1 && Z=0)
  LS = 0b1001,  // Unsigned lower or same (C=0 || Z=1)
  GE = 0b1010,  // Signed greater or equal (N==V)
  LT = 0b1011,  // Signed less than (N!=V)
  GT = 0b1100,  // Signed greater than (Z=0 && N==V)
  LE = 0b1101,  // Signed less or equal (Z=1 || N!=V)
  AL = 0b1110,  // Always
  NV = 0b1111,  // Never (used for special instructions)
}

export const CONDITION_NAMES: Record<number, string> = {
  [Condition.EQ]: 'EQ', [Condition.NE]: 'NE', [Condition.CS]: 'CS',
  [Condition.CC]: 'CC', [Condition.MI]: 'MI', [Condition.PL]: 'PL',
  [Condition.VS]: 'VS', [Condition.VC]: 'VC', [Condition.HI]: 'HI',
  [Condition.LS]: 'LS', [Condition.GE]: 'GE', [Condition.LT]: 'LT',
  [Condition.GT]: 'GT', [Condition.LE]: 'LE', [Condition.AL]: 'AL',
  [Condition.NV]: 'NV',
};

// ── Opcodes ──────────────────────────────────────────────────────
// Category encoding in bits [27:24], sub-opcode in operand bits

export enum Opcode {
  // ── Data Processing (category 0x0-0x1) ──
  // Format: [31:28] cond | [27:24] 0x0 | [23:21] op | [20] S | [19:16] Rn | [15:12] Rd | [11:0] operand2
  MOV = 0x00,  // Rd = operand2
  MVN = 0x01,  // Rd = ~operand2
  ADD = 0x02,  // Rd = Rn + operand2
  SUB = 0x03,  // Rd = Rn - operand2
  MUL = 0x04,  // Rd = Rn * operand2
  DIV = 0x05,  // Rd = Rn / operand2
  MOD = 0x06,  // Rd = Rn % operand2
  AND = 0x07,  // Rd = Rn & operand2
  ORR = 0x08,  // Rd = Rn | operand2
  EOR = 0x09,  // Rd = Rn ^ operand2
  LSL = 0x0A,  // Rd = Rn << operand2
  LSR = 0x0B,  // Rd = Rn >>> operand2
  ASR = 0x0C,  // Rd = Rn >> operand2
  CMP = 0x0D,  // Rn - operand2 (flags only)
  CMN = 0x0E,  // Rn + operand2 (flags only)
  TST = 0x0F,  // Rn & operand2 (flags only)
  ADC = 0x10,  // Rd = Rn + operand2 + C
  SBC = 0x11,  // Rd = Rn - operand2 - !C
  RSB = 0x12,  // Rd = operand2 - Rn
  BIC = 0x13,  // Rd = Rn & ~operand2
  TEQ = 0x14,  // Rn ^ operand2 (flags only, like TST but XOR)
  ROR = 0x15,  // Rd = Rn rotated right by operand2
  RRX = 0x16,  // Rd = (C << 31) | (Rn >>> 1) -- rotate right extended
  CLZ = 0x17,  // Rd = count leading zeros of Rn
  MLA = 0x18,  // Rd = Rn * operand2 + Ra (multiply-accumulate, Ra encoded in shift field)

  // ── Memory (category 0x2) ──
  // Format: [31:28] cond | [27:24] 0x2 | [23:22] op | [21] pre/post | [20] W | [19:16] Rn | [15:12] Rd | [11:0] offset
  LDR = 0x20,  // Load word: Rd = mem[Rn + offset]
  STR = 0x21,  // Store word: mem[Rn + offset] = Rd
  LDRB = 0x22, // Load byte
  STRB = 0x23, // Store byte
  LDRH = 0x24, // Load halfword
  STRH = 0x25, // Store halfword
  LDRSB = 0x26, // Load signed byte (sign-extend to 32 bits)
  LDRSH = 0x27, // Load signed halfword (sign-extend to 32 bits)

  // ── Branch (category 0x3) ──
  // Format: [31:28] cond | [27:24] 0x3 | [23] link | [22:0] signed offset
  B = 0x30,    // Branch
  BL = 0x31,   // Branch with link (call)
  BX = 0x32,   // Branch exchange (return via register)
  BLX = 0x33,  // Branch with link and exchange (call via register)

  // ── Stack (category 0x4) ──
  PUSH = 0x40, // Push register(s) onto stack
  POP = 0x41,  // Pop register(s) from stack

  // ── System (category 0x5) ──
  SWI = 0x50,  // Software interrupt (syscall)
  NOP = 0x51,  // No operation
  HALT = 0x52, // Halt CPU
  MRS = 0x53,  // Move status register to register
  MSR = 0x54,  // Move register to status register
  WFI = 0x55,  // Wait for interrupt

  // ── Immediate load (category 0x6) ──
  // For loading large immediates
  MOVW = 0x60, // Move 16-bit immediate to lower halfword
  MOVT = 0x61, // Move 16-bit immediate to upper halfword
}

export const OPCODE_NAMES: Record<number, string> = {};
for (const [name, value] of Object.entries(Opcode)) {
  if (typeof value === 'number') {
    OPCODE_NAMES[value] = name;
  }
}

// ── Instruction encoding helpers ─────────────────────────────────

/** Named register indices */
export const REG = {
  R0: 0, R1: 1, R2: 2, R3: 3,
  R4: 4, R5: 5, R6: 6, R7: 7,
  R8: 8, R9: 9, R10: 10, R11: 11,
  R12: 12, FP: 11,
  SP: 13, LR: 14, PC: 15,
} as const;

export const REG_NAMES: string[] = [
  'R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7',
  'R8', 'R9', 'R10', 'R11', 'R12', 'SP', 'LR', 'PC',
];

// ── CPSR flag positions ──────────────────────────────────────────
export const CPSR_N = 1 << 31; // Negative
export const CPSR_Z = 1 << 30; // Zero
export const CPSR_C = 1 << 29; // Carry
export const CPSR_V = 1 << 28; // Overflow
export const CPSR_I = 1 << 7;  // IRQ disable
export const CPSR_F = 1 << 6;  // FIQ disable

export enum CPUMode {
  USER = 0,
  SVC = 1,   // Supervisor / kernel
  IRQ = 2,
  FIQ = 3,
}

// ── Barrel Shifter Types ─────────────────────────────────────────
/**
 * ARM barrel shifter operations applied to operand2 in data processing
 * instructions. When isImmediate=false, operand2 can include a shift:
 *   ADD R0, R1, R2, LSL #3   ; R0 = R1 + (R2 << 3)
 *
 * Encoding in the 11-bit operand2 field (when isImmediate=false):
 *   [3:0]  Rm (source register)
 *   [4]    0 = shift by immediate, 1 = shift by register
 *   [6:5]  Shift type (ShiftType enum)
 *   [10:7] Shift amount (imm4, 0-15) or Rs register (when bit4=1)
 */
export enum ShiftType {
  LSL = 0b00, // Logical shift left
  LSR = 0b01, // Logical shift right
  ASR = 0b10, // Arithmetic shift right
  ROR = 0b11, // Rotate right
}

export const SHIFT_NAMES: Record<number, string> = {
  [ShiftType.LSL]: 'LSL',
  [ShiftType.LSR]: 'LSR',
  [ShiftType.ASR]: 'ASR',
  [ShiftType.ROR]: 'ROR',
};

// ── Instruction encoding/decoding ────────────────────────────────

export interface DecodedInstruction {
  raw: number;
  condition: Condition;
  opcode: Opcode;
  /** Set flags? (S bit) */
  setFlags: boolean;
  /** Destination register */
  rd: number;
  /** First operand register */
  rn: number;
  /** Second operand: register index or immediate */
  operand2: number;
  /** Is operand2 an immediate value? */
  isImmediate: boolean;
  /** For branches: signed offset */
  branchOffset: number;
  /** For branches: link bit */
  link: boolean;
  /** For push/pop: register bitmask */
  regList: number;
  /** For SWI: the syscall number */
  swiNumber: number;
  /** Barrel shifter: shift type applied to Rm */
  shiftType: ShiftType;
  /** Barrel shifter: shift amount (0 = no shift) */
  shiftAmount: number;
  /** Barrel shifter: is shift amount from a register? */
  shiftByReg: boolean;
  /** Barrel shifter: register containing shift amount (when shiftByReg=true) */
  shiftReg: number;
  /** For MLA: accumulate register */
  ra: number;
  /** For memory: pre-index with writeback (!) */
  preIndex: boolean;
  /** For memory: post-index */
  postIndex: boolean;
  /** For memory: register offset (instead of immediate) */
  regOffset: boolean;
}

/**
 * Encode a data-processing instruction
 * [31:28] cond | [27] isImm | [26:20] opcode(7) | [19:16] Rn | [15:12] Rd | [11] S | [10:0] operand2/imm
 */
export function encodeDataProc(
  cond: Condition, opcode: Opcode, rd: number, rn: number,
  operand2: number, isImmediate: boolean, setFlags: boolean
): number {
  let inst = (cond & 0xF) << 28;
  inst |= (isImmediate ? 1 : 0) << 27;
  inst |= (opcode & 0x7F) << 20;
  inst |= (rn & 0xF) << 16;
  inst |= (rd & 0xF) << 12;
  inst |= (setFlags ? 1 : 0) << 11;
  inst |= (operand2 & 0x7FF);
  return inst >>> 0;
}

/**
 * Encode a memory instruction
 * [31:28] cond | [27] 0 | [26:20] opcode(7) | [19:16] Rn | [15:12] Rd | [11:0] offset/addressing
 *
 * Offset field [11:0]:
 *   [11]   P  : 1=pre-index (default), 0=post-index
 *   [10]   W  : 1=writeback (! syntax), 0=no writeback
 *   [9]    R  : 0=immediate offset, 1=register offset
 *   When R=0: [8:0] 9-bit signed immediate offset (-256 to 255)
 *   When R=1: [3:0] Rm, [4] 0=no shift, [6:5] shift type, [8:7] shift amount (2 bits)
 */
export function encodeMemory(
  cond: Condition, opcode: Opcode, rd: number, rn: number, offset: number,
  preIndex: boolean = true, writeback: boolean = false
): number {
  let inst = (cond & 0xF) << 28;
  inst |= (opcode & 0x7F) << 20;
  inst |= (rn & 0xF) << 16;
  inst |= (rd & 0xF) << 12;
  // P bit
  if (preIndex) inst |= (1 << 11);
  // W bit
  if (writeback) inst |= (1 << 10);
  // R=0 (immediate offset), 9-bit signed
  inst |= (offset & 0x1FF);
  return inst >>> 0;
}

/**
 * Encode a memory instruction with register offset
 * Same layout as encodeMemory but with R=1 and Rm+shift in low bits
 */
export function encodeMemoryReg(
  cond: Condition, opcode: Opcode, rd: number, rn: number,
  rm: number, shiftType: ShiftType = ShiftType.LSL, shiftAmount: number = 0,
  preIndex: boolean = true, writeback: boolean = false
): number {
  let inst = (cond & 0xF) << 28;
  inst |= (opcode & 0x7F) << 20;
  inst |= (rn & 0xF) << 16;
  inst |= (rd & 0xF) << 12;
  // P bit
  if (preIndex) inst |= (1 << 11);
  // W bit
  if (writeback) inst |= (1 << 10);
  // R=1 (register offset)
  inst |= (1 << 9);
  // Shift amount (2 bits), shift type (2 bits), shift flag, Rm
  inst |= (shiftAmount & 0x3) << 7;
  inst |= (shiftType & 0x3) << 5;
  if (shiftAmount > 0) inst |= (1 << 4);
  inst |= (rm & 0xF);
  return inst >>> 0;
}

/**
 * Encode a branch instruction
 * [31:28] cond | [27] 0 | [26:20] opcode(7) | [19:0] signed offset (in words)
 */
export function encodeBranch(
  cond: Condition, opcode: Opcode, offset: number
): number {
  let inst = (cond & 0xF) << 28;
  inst |= (opcode & 0x7F) << 20;
  // Offset is in words (4-byte units), sign-extended to 20 bits
  inst |= (offset & 0xFFFFF);
  return inst >>> 0;
}

/**
 * Encode a BX (branch exchange) instruction
 */
export function encodeBX(cond: Condition, rn: number): number {
  let inst = (cond & 0xF) << 28;
  inst |= (Opcode.BX & 0x7F) << 20;
  inst |= (rn & 0xF) << 16;
  return inst >>> 0;
}

/**
 * Encode a BLX (branch with link and exchange) instruction
 */
export function encodeBLX(cond: Condition, rn: number): number {
  let inst = (cond & 0xF) << 28;
  inst |= (Opcode.BLX & 0x7F) << 20;
  inst |= (rn & 0xF) << 16;
  return inst >>> 0;
}

/**
 * Encode a barrel-shifted register operand2 (11-bit field).
 * Returns the raw 11-bit value to pass as operand2 to encodeDataProc.
 *
 *   [3:0]  Rm (register)
 *   [4]    0=shift by imm, 1=shift by reg
 *   [6:5]  Shift type
 *   [10:7] Shift amount (imm, 0-15) or Rs register
 */
export function encodeShiftedReg(
  rm: number, shiftType: ShiftType, shiftAmount: number, shiftByReg: boolean = false
): number {
  let op2 = rm & 0xF;
  op2 |= (shiftByReg ? 1 : 0) << 4;
  op2 |= (shiftType & 0x3) << 5;
  op2 |= (shiftAmount & 0xF) << 7;
  return op2;
}

/**
 * Encode push/pop
 * [31:28] cond | [27] 0 | [26:20] opcode(7) | [15:0] register bitmask
 */
export function encodeStack(cond: Condition, opcode: Opcode, regList: number): number {
  let inst = (cond & 0xF) << 28;
  inst |= (opcode & 0x7F) << 20;
  inst |= (regList & 0xFFFF);
  return inst >>> 0;
}

/**
 * Encode SWI (software interrupt / syscall)
 * [31:28] cond | [27] 0 | [26:20] opcode(7) | [19:0] syscall number
 */
export function encodeSWI(cond: Condition, swiNumber: number): number {
  let inst = (cond & 0xF) << 28;
  inst |= (Opcode.SWI & 0x7F) << 20;
  inst |= (swiNumber & 0xFFFFF);
  return inst >>> 0;
}

/**
 * Encode NOP / HALT / WFI
 */
export function encodeSystem(cond: Condition, opcode: Opcode): number {
  let inst = (cond & 0xF) << 28;
  inst |= (opcode & 0x7F) << 20;
  return inst >>> 0;
}

/**
 * Encode MOVW/MOVT (immediate 16-bit load)
 * [31:28] cond | [27] 1 | [26:20] opcode(7) | [19:16] Rd | [15:0] imm16
 */
export function encodeWideImm(
  cond: Condition, opcode: Opcode, rd: number, imm16: number
): number {
  let inst = (cond & 0xF) << 28;
  inst |= 1 << 27;
  inst |= (opcode & 0x7F) << 20;
  inst |= (rd & 0xF) << 16;
  inst |= (imm16 & 0xFFFF);
  return inst >>> 0;
}

/**
 * Decode a 32-bit instruction word
 */
export function decode(word: number): DecodedInstruction {
  const condition = ((word >>> 28) & 0xF) as Condition;
  const isImmBit = (word >>> 27) & 1;
  const opcodeRaw = (word >>> 20) & 0x7F;
  const rn = (word >>> 16) & 0xF;
  const rd = (word >>> 12) & 0xF;
  const sBit = (word >>> 11) & 1;

  const result: DecodedInstruction = {
    raw: word,
    condition,
    opcode: opcodeRaw as Opcode,
    setFlags: false,
    rd: 0,
    rn: 0,
    operand2: 0,
    isImmediate: false,
    branchOffset: 0,
    link: false,
    regList: 0,
    swiNumber: 0,
    shiftType: ShiftType.LSL,
    shiftAmount: 0,
    shiftByReg: false,
    shiftReg: 0,
    ra: 0,
    preIndex: false,
    postIndex: false,
    regOffset: false,
  };

  const opcodeCategory = opcodeRaw >> 4;

  switch (opcodeCategory) {
    case 0x0: // Data processing & extended
    case 0x1:
      result.opcode = opcodeRaw as Opcode;
      result.rd = rd;
      result.rn = rn;
      result.setFlags = sBit === 1;
      result.isImmediate = isImmBit === 1;
      result.operand2 = word & 0x7FF;
      if (result.isImmediate) {
        // Sign-extend immediates that could be negative
        if (result.operand2 & 0x400) {
          result.operand2 |= ~0x7FF;
        }
      } else {
        // Barrel shifter encoding in operand2 field:
        //   [3:0]  Rm (register)
        //   [4]    0=shift by imm, 1=shift by reg
        //   [6:5]  Shift type
        //   [10:7] Shift amount (imm) or Rs (reg)
        const raw11 = result.operand2;
        result.operand2 = raw11 & 0xF;           // Rm
        result.shiftByReg = !!((raw11 >> 4) & 1);
        result.shiftType = ((raw11 >> 5) & 0x3) as ShiftType;
        if (result.shiftByReg) {
          result.shiftReg = (raw11 >> 7) & 0xF;
        } else {
          result.shiftAmount = (raw11 >> 7) & 0xF;
        }
        // For MLA: Ra is stored in shiftAmount/shiftReg position (bits [10:7])
        if (opcodeRaw === Opcode.MLA) {
          result.ra = (raw11 >> 7) & 0xF;
        }
      }
      break;

    case 0x2: // Memory
      result.opcode = opcodeRaw as Opcode;
      result.rd = rd;
      result.rn = rn;
      // Addressing mode bits
      result.preIndex = !!((word >> 11) & 1);  // P bit
      const wBit = (word >> 10) & 1;           // W bit
      result.regOffset = !!((word >> 9) & 1);  // R bit
      // Post-index means P=0 (always writeback implied)
      result.postIndex = !result.preIndex;
      if (result.regOffset) {
        // Register offset: [3:0] Rm, [4] shift flag, [6:5] shift type, [8:7] shift amount
        result.operand2 = word & 0xF; // Rm
        const hasShift = (word >> 4) & 1;
        result.shiftType = ((word >> 5) & 0x3) as ShiftType;
        result.shiftAmount = hasShift ? ((word >> 7) & 0x3) : 0;
      } else {
        // 9-bit signed immediate offset
        result.operand2 = word & 0x1FF;
        if (result.operand2 & 0x100) {
          result.operand2 |= ~0x1FF; // sign extend
        }
      }
      // Store writeback: pre+W or post-index (post always writes back)
      result.setFlags = !!(wBit || result.postIndex); // reuse setFlags as "writeback" for memory ops
      break;

    case 0x3: // Branch
      result.opcode = opcodeRaw as Opcode;
      result.link = opcodeRaw === Opcode.BL || opcodeRaw === Opcode.BLX;
      if (opcodeRaw === Opcode.BX || opcodeRaw === Opcode.BLX) {
        result.rn = rn;
      } else {
        // 20-bit signed offset (in words)
        let offset = word & 0xFFFFF;
        if (offset & 0x80000) {
          offset |= ~0xFFFFF; // sign extend
        }
        result.branchOffset = offset;
      }
      break;

    case 0x4: // Stack
      result.opcode = opcodeRaw as Opcode;
      result.regList = word & 0xFFFF;
      break;

    case 0x5: // System
      result.opcode = opcodeRaw as Opcode;
      if (opcodeRaw === Opcode.SWI) {
        result.swiNumber = word & 0xFFFFF;
      } else if (opcodeRaw === Opcode.MRS || opcodeRaw === Opcode.MSR) {
        result.rd = rd;
        result.rn = rn;
      }
      break;

    case 0x6: // Wide immediate
      result.opcode = opcodeRaw as Opcode;
      result.rd = rn; // Rd is in rn position for wide imm
      result.operand2 = word & 0xFFFF;
      result.isImmediate = true;
      break;

    default:
      result.opcode = Opcode.NOP;
      break;
  }

  return result;
}
