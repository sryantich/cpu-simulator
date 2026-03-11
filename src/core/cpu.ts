/**
 * CPU Core - The heart of the simulator
 *
 * ARM-inspired 32-bit processor with:
 * - 16 general purpose registers (R0-R15)
 * - CPSR (status register with condition flags)
 * - 5-stage pipeline (fetch, decode, execute, memory access, writeback)
 * - Interrupt handling
 * - User/Supervisor modes
 */

import type { CPUConfig } from './cpu-config.ts';
import { IRQ } from './cpu-config.ts';
import {
  type DecodedInstruction, Opcode, Condition, REG,
  decode, OPCODE_NAMES, REG_NAMES,
  CPSR_N, CPSR_Z, CPSR_C, CPSR_V, CPSR_I, CPSR_F,
  CPUMode, ShiftType,
} from './isa.ts';
import type { EventBus } from './events.ts';
import type { Memory } from '../memory/memory.ts';
import type { InterruptController } from '../io/devices.ts';

// ── Pipeline Stage ──────────────────────────────────────────────

export enum PipelineStage {
  FETCH = 0,
  DECODE = 1,
  EXECUTE = 2,
  MEMORY = 3,
  WRITEBACK = 4,
}

export const PIPELINE_STAGE_NAMES = ['Fetch', 'Decode', 'Execute', 'Memory', 'Writeback'];

export interface PipelineEntry {
  stage: PipelineStage;
  instruction: DecodedInstruction | null;
  pc: number;
  stalled: boolean;
  flushed: boolean;
}

// ── CPU State ───────────────────────────────────────────────────

export enum CPUState {
  RUNNING = 'running',
  HALTED = 'halted',
  WAITING = 'waiting', // WFI
  FAULT = 'fault',
  RESET = 'reset',
}

export interface CPUSnapshot {
  registers: number[];
  cpsr: number;
  mode: CPUMode;
  state: CPUState;
  cycle: number;
  pipeline: PipelineEntry[];
  pc: number;
  sp: number;
  lr: number;
  flags: { N: boolean; Z: boolean; C: boolean; V: boolean; I: boolean; F: boolean };
  lastInstruction: DecodedInstruction | null;
  instructionCount: number;
}

// ── CPU Core ─────────────────────────────────────────────────────

export class CPU {
  /** General purpose registers R0-R15 */
  private registers: Int32Array;
  /** Banked registers for different modes (saved on mode switch) */
  private bankedRegisters: Map<CPUMode, { sp: number; lr: number; cpsr: number }>;
  /** Current program status register */
  private cpsr = 0;
  /** Pipeline slots */
  private pipeline: PipelineEntry[];
  /** Current state */
  private state = CPUState.RESET;
  /** Cycle counter */
  private cycle = 0;
  /** Total instructions executed */
  private instructionCount = 0;
  /** Last executed instruction (for UI) */
  private lastInstruction: DecodedInstruction | null = null;

  private config: CPUConfig;
  private memory: Memory;
  private bus: EventBus;
  private irqController: InterruptController | null = null;

  /** Breakpoints (set of addresses) */
  private breakpoints = new Set<number>();
  /** Step mode */
  private stepping = false;

  constructor(config: CPUConfig, memory: Memory, bus: EventBus) {
    this.config = config;
    this.memory = memory;
    this.bus = bus;

    this.registers = new Int32Array(config.numRegisters);
    this.bankedRegisters = new Map();
    this.bankedRegisters.set(CPUMode.USER, { sp: 0, lr: 0, cpsr: 0 });
    this.bankedRegisters.set(CPUMode.SVC, { sp: 0, lr: 0, cpsr: 0 });
    this.bankedRegisters.set(CPUMode.IRQ, { sp: 0, lr: 0, cpsr: 0 });
    this.bankedRegisters.set(CPUMode.FIQ, { sp: 0, lr: 0, cpsr: 0 });

    // Initialize pipeline
    this.pipeline = [];
    for (let i = 0; i < config.pipelineStages; i++) {
      this.pipeline.push({
        stage: i as PipelineStage,
        instruction: null,
        pc: 0,
        stalled: false,
        flushed: false,
      });
    }

    this.reset();
  }

  setInterruptController(irq: InterruptController): void {
    this.irqController = irq;
  }

  // ── Reset ─────────────────────────────────────────────────────

  reset(): void {
    this.registers.fill(0);
    this.registers[REG.SP] = this.config.stackStartAddress;
    this.registers[REG.PC] = this.config.kernelBaseAddress;

    // Start in supervisor mode with interrupts disabled
    this.cpsr = CPUMode.SVC | CPSR_I | CPSR_F;
    this.state = CPUState.RESET;
    this.cycle = 0;
    this.instructionCount = 0;
    this.lastInstruction = null;

    for (const entry of this.pipeline) {
      entry.instruction = null;
      entry.pc = 0;
      entry.stalled = false;
      entry.flushed = false;
    }

    this.bus.emit('cpu:reset', {});
  }

  // ── Main Execution ────────────────────────────────────────────

  /**
   * Execute one clock cycle.
   * Returns false if halted/faulted.
   */
  tick(): boolean {
    if (this.state === CPUState.HALTED || this.state === CPUState.FAULT) {
      return false;
    }

    this.cycle++;
    this.bus.setCycle(this.cycle);

    // Check for interrupts
    if (this.state === CPUState.WAITING) {
      if (this.irqController?.hasPending()) {
        this.state = CPUState.RUNNING;
      } else {
        this.bus.emit('cpu:tick', { cycle: this.cycle, state: this.state });
        return true;
      }
    }

    // Handle pending interrupts
    if (this.irqController?.hasPending() && !(this.cpsr & CPSR_I)) {
      const irq = this.irqController.getNextInterrupt();
      if (irq >= 0) {
        this.handleInterrupt(irq);
      }
    }

    if (this.state === CPUState.RESET) {
      this.state = CPUState.RUNNING;
    }

    // Fetch-decode-execute (simplified: one instruction per cycle for clarity)
    const pc = this.registers[REG.PC];

    // Check breakpoint
    if (this.breakpoints.has(pc)) {
      this.bus.emit('cpu:breakpoint', { address: pc });
      this.state = CPUState.HALTED;
      return false;
    }

    // Fetch
    const word = this.memory.readWord(pc);
    this.bus.emit('cpu:fetch', { pc, word });

    // Update pipeline visualization (shift entries)
    for (let i = this.pipeline.length - 1; i > 0; i--) {
      this.pipeline[i] = { ...this.pipeline[i - 1], stage: i as PipelineStage };
    }

    // Decode
    const instruction = decode(word);
    this.pipeline[0] = {
      stage: PipelineStage.FETCH,
      instruction,
      pc,
      stalled: false,
      flushed: false,
    };
    this.bus.emit('cpu:decode', { pc, instruction, mnemonic: OPCODE_NAMES[instruction.opcode] });

    // Check condition
    if (!this.evaluateCondition(instruction.condition)) {
      // Condition not met, skip execution
      this.registers[REG.PC] = pc + 4;
      this.bus.emit('cpu:skip', { pc, condition: instruction.condition });
      this.bus.emit('cpu:tick', { cycle: this.cycle, state: this.state });
      return true;
    }

    // Execute
    this.executeInstruction(instruction, pc);
    this.lastInstruction = instruction;
    this.instructionCount++;

    this.bus.emit('cpu:tick', {
      cycle: this.cycle,
      state: this.state,
      pc: this.registers[REG.PC],
      instruction: OPCODE_NAMES[instruction.opcode],
    });

    return this.state === CPUState.RUNNING || this.state === CPUState.WAITING;
  }

  // ── Condition Evaluation ──────────────────────────────────────

  private evaluateCondition(cond: Condition): boolean {
    const N = !!(this.cpsr & CPSR_N);
    const Z = !!(this.cpsr & CPSR_Z);
    const C = !!(this.cpsr & CPSR_C);
    const V = !!(this.cpsr & CPSR_V);

    switch (cond) {
      case Condition.EQ: return Z;
      case Condition.NE: return !Z;
      case Condition.CS: return C;
      case Condition.CC: return !C;
      case Condition.MI: return N;
      case Condition.PL: return !N;
      case Condition.VS: return V;
      case Condition.VC: return !V;
      case Condition.HI: return C && !Z;
      case Condition.LS: return !C || Z;
      case Condition.GE: return N === V;
      case Condition.LT: return N !== V;
      case Condition.GT: return !Z && N === V;
      case Condition.LE: return Z || N !== V;
      case Condition.AL: return true;
      case Condition.NV: return false;
    }
  }

  // ── Instruction Execution ─────────────────────────────────────

  private executeInstruction(inst: DecodedInstruction, pc: number): void {
    const opcodeCategory = inst.opcode >> 4;

    switch (opcodeCategory) {
      case 0x0:
      case 0x1:
        this.executeDataProcessing(inst, pc);
        break;
      case 0x2:
        this.executeMemory(inst, pc);
        break;
      case 0x3:
        this.executeBranch(inst, pc);
        break;
      case 0x4:
        this.executeStack(inst, pc);
        break;
      case 0x5:
        this.executeSystem(inst, pc);
        break;
      case 0x6:
        this.executeWideImm(inst, pc);
        break;
      default:
        this.bus.emit('cpu:undefined', { pc, opcode: inst.opcode });
        this.handleInterrupt(IRQ.UNDEFINED);
        break;
    }
  }

  /** Get operand2 value (register or immediate), applying barrel shifter */
  private getOperand2(inst: DecodedInstruction): { value: number; carry: boolean } {
    const oldCarry = !!(this.cpsr & CPSR_C);
    if (inst.isImmediate) {
      return { value: inst.operand2, carry: oldCarry };
    }
    const rm = this.registers[inst.operand2 & 0xF];
    const shiftAmt = inst.shiftByReg
      ? (this.registers[inst.shiftReg] & 0xFF)
      : inst.shiftAmount;
    if (shiftAmt === 0) {
      return { value: rm, carry: oldCarry };
    }
    return this.applyBarrelShifter(rm, inst.shiftType, shiftAmt, oldCarry);
  }

  /**
   * ARM barrel shifter: apply a shift/rotate operation to a value.
   * Returns the shifted value and the carry-out bit.
   */
  private applyBarrelShifter(
    value: number, type: ShiftType, amount: number, carryIn: boolean
  ): { value: number; carry: boolean } {
    amount &= 0xFF; // clamp to byte
    let result: number;
    let carry = carryIn;

    switch (type) {
      case ShiftType.LSL:
        if (amount === 0) { result = value; }
        else if (amount < 32) {
          carry = !!((value >>> (32 - amount)) & 1);
          result = (value << amount) | 0;
        } else if (amount === 32) {
          carry = !!(value & 1);
          result = 0;
        } else {
          carry = false;
          result = 0;
        }
        break;

      case ShiftType.LSR:
        if (amount === 0) { result = value; }
        else if (amount < 32) {
          carry = !!((value >>> (amount - 1)) & 1);
          result = value >>> amount;
        } else if (amount === 32) {
          carry = !!(value & 0x80000000);
          result = 0;
        } else {
          carry = false;
          result = 0;
        }
        break;

      case ShiftType.ASR:
        if (amount === 0) { result = value; }
        else if (amount < 32) {
          carry = !!((value >> (amount - 1)) & 1);
          result = value >> amount;
        } else {
          carry = !!(value & 0x80000000);
          result = value >> 31; // All sign bits
        }
        break;

      case ShiftType.ROR:
        if (amount === 0) { result = value; }
        else {
          const rot = amount & 31;
          if (rot === 0) {
            // Rotate by 32 = no change but carry = bit 31
            carry = !!(value & 0x80000000);
            result = value;
          } else {
            result = ((value >>> rot) | (value << (32 - rot))) | 0;
            carry = !!((value >>> (rot - 1)) & 1);
          }
        }
        break;

      default:
        result = value;
    }

    return { value: result | 0, carry };
  }

  /** Update CPSR flags after an arithmetic/logic operation */
  private updateFlags(result: number, carry?: boolean, overflow?: boolean): void {
    // Clear NZCV
    this.cpsr &= ~(CPSR_N | CPSR_Z | CPSR_C | CPSR_V);
    // N flag
    if (result & 0x80000000) this.cpsr |= CPSR_N;
    // Z flag
    if ((result & 0xFFFFFFFF) === 0) this.cpsr |= CPSR_Z;
    // C flag
    if (carry !== undefined && carry) this.cpsr |= CPSR_C;
    // V flag
    if (overflow !== undefined && overflow) this.cpsr |= CPSR_V;
  }

  private executeDataProcessing(inst: DecodedInstruction, pc: number): void {
    const rn = this.registers[inst.rn];
    const { value: op2, carry: shifterCarry } = this.getOperand2(inst);
    let result = 0;
    let carry = shifterCarry;
    let overflow = false;

    switch (inst.opcode) {
      case Opcode.MOV:
        result = op2;
        break;
      case Opcode.MVN:
        result = ~op2;
        break;
      case Opcode.ADD: {
        const sum = (rn >>> 0) + (op2 >>> 0);
        result = sum | 0;
        carry = sum > 0xFFFFFFFF;
        overflow = ((rn ^ result) & (op2 ^ result) & 0x80000000) !== 0;
        break;
      }
      case Opcode.ADC: {
        const c = (this.cpsr & CPSR_C) ? 1 : 0;
        const sum = (rn >>> 0) + (op2 >>> 0) + c;
        result = sum | 0;
        carry = sum > 0xFFFFFFFF;
        overflow = ((rn ^ result) & (op2 ^ result) & 0x80000000) !== 0;
        break;
      }
      case Opcode.SUB: {
        const diff = (rn >>> 0) - (op2 >>> 0);
        result = diff | 0;
        carry = (rn >>> 0) >= (op2 >>> 0); // borrow = !carry
        overflow = ((rn ^ op2) & (rn ^ result) & 0x80000000) !== 0;
        break;
      }
      case Opcode.SBC: {
        const c = (this.cpsr & CPSR_C) ? 1 : 0;
        const diff = (rn >>> 0) - (op2 >>> 0) - (1 - c);
        result = diff | 0;
        carry = diff >= 0;
        overflow = ((rn ^ op2) & (rn ^ result) & 0x80000000) !== 0;
        break;
      }
      case Opcode.RSB: {
        const diff = (op2 >>> 0) - (rn >>> 0);
        result = diff | 0;
        carry = (op2 >>> 0) >= (rn >>> 0);
        overflow = ((op2 ^ rn) & (op2 ^ result) & 0x80000000) !== 0;
        break;
      }
      case Opcode.MUL:
        result = Math.imul(rn, op2);
        break;
      case Opcode.MLA: {
        // Multiply-accumulate: Rd = Rn * Rm + Ra
        const ra = this.registers[inst.ra];
        result = (Math.imul(rn, op2) + ra) | 0;
        break;
      }
      case Opcode.DIV:
        if (op2 === 0) {
          this.bus.emit('cpu:divide_by_zero', { pc });
          result = 0;
        } else {
          result = (rn / op2) | 0;
        }
        break;
      case Opcode.MOD:
        if (op2 === 0) {
          result = 0;
        } else {
          result = rn % op2;
        }
        break;
      case Opcode.AND:
        result = rn & op2;
        break;
      case Opcode.ORR:
        result = rn | op2;
        break;
      case Opcode.EOR:
        result = rn ^ op2;
        break;
      case Opcode.BIC:
        result = rn & ~op2;
        break;
      case Opcode.LSL:
        result = rn << (op2 & 31);
        carry = (op2 > 0) ? !!((rn >>> (32 - (op2 & 31))) & 1) : !!(this.cpsr & CPSR_C);
        break;
      case Opcode.LSR:
        result = (rn >>> (op2 & 31));
        carry = (op2 > 0) ? !!((rn >>> ((op2 & 31) - 1)) & 1) : !!(this.cpsr & CPSR_C);
        break;
      case Opcode.ASR:
        result = rn >> (op2 & 31);
        carry = (op2 > 0) ? !!((rn >>> ((op2 & 31) - 1)) & 1) : !!(this.cpsr & CPSR_C);
        break;
      case Opcode.ROR: {
        const rot = op2 & 31;
        if (rot === 0) {
          result = rn;
        } else {
          result = ((rn >>> rot) | (rn << (32 - rot))) | 0;
          carry = !!((rn >>> (rot - 1)) & 1);
        }
        break;
      }
      case Opcode.RRX: {
        // Rotate right extended: (C << 31) | (Rn >>> 1), single bit
        const oldC = (this.cpsr & CPSR_C) ? 1 : 0;
        carry = !!(rn & 1);
        result = ((oldC << 31) | (rn >>> 1)) | 0;
        break;
      }
      case Opcode.CLZ: {
        // Count leading zeros of Rn
        result = Math.clz32(rn >>> 0);
        break;
      }
      case Opcode.CMP: {
        const diff = (rn >>> 0) - (op2 >>> 0);
        result = diff | 0;
        carry = (rn >>> 0) >= (op2 >>> 0);
        overflow = ((rn ^ op2) & (rn ^ result) & 0x80000000) !== 0;
        this.updateFlags(result, carry, overflow);
        this.registers[REG.PC] = pc + 4;
        this.bus.emit('cpu:execute', { op: 'CMP', rn, op2, result, flags: this.getFlags() });
        return; // CMP doesn't write to Rd
      }
      case Opcode.CMN: {
        const sum = (rn >>> 0) + (op2 >>> 0);
        result = sum | 0;
        carry = sum > 0xFFFFFFFF;
        overflow = ((rn ^ result) & (op2 ^ result) & 0x80000000) !== 0;
        this.updateFlags(result, carry, overflow);
        this.registers[REG.PC] = pc + 4;
        this.bus.emit('cpu:execute', { op: 'CMN', rn, op2, result, flags: this.getFlags() });
        return;
      }
      case Opcode.TST: {
        result = rn & op2;
        this.updateFlags(result, shifterCarry);
        this.registers[REG.PC] = pc + 4;
        this.bus.emit('cpu:execute', { op: 'TST', rn, op2, result, flags: this.getFlags() });
        return;
      }
      case Opcode.TEQ: {
        result = rn ^ op2;
        this.updateFlags(result, shifterCarry);
        this.registers[REG.PC] = pc + 4;
        this.bus.emit('cpu:execute', { op: 'TEQ', rn, op2, result, flags: this.getFlags() });
        return;
      }
      default:
        this.bus.emit('cpu:undefined', { pc, opcode: inst.opcode });
        this.registers[REG.PC] = pc + 4;
        return;
    }

    // Write result to destination register
    if (inst.rd === REG.PC) {
      this.registers[REG.PC] = result;

      // ARM special case: writing to PC with S bit in privileged mode
      // restores CPSR from banked SPSR (returns from exception handler)
      const currentMode = this.cpsr & 0x1F;
      if (inst.setFlags && currentMode !== CPUMode.USER) {
        const banked = this.bankedRegisters.get(currentMode as CPUMode)!;
        // Save current (exception) mode's SP/LR before switching
        banked.sp = this.registers[REG.SP];
        banked.lr = this.registers[REG.LR];
        // Restore CPSR (includes mode bits) from saved CPSR
        this.cpsr = banked.cpsr;
        // Restore the destination mode's banked SP/LR
        const restoredMode = this.cpsr & 0x1F;
        const restoredBanked = this.bankedRegisters.get(restoredMode as CPUMode)!;
        this.registers[REG.SP] = restoredBanked.sp;
        this.registers[REG.LR] = restoredBanked.lr;
      }

      this.flushPipeline();
    } else {
      this.registers[inst.rd] = result;
      this.registers[REG.PC] = pc + 4;
    }

    if (inst.setFlags && inst.rd !== REG.PC) {
      this.updateFlags(result, carry, overflow);
    }

    this.bus.emit('cpu:execute', {
      op: OPCODE_NAMES[inst.opcode],
      rd: inst.rd,
      rn: inst.rn,
      op2,
      result,
      flags: inst.setFlags ? this.getFlags() : undefined,
    });
  }

  private executeMemory(inst: DecodedInstruction, pc: number): void {
    const base = this.registers[inst.rn];

    // Calculate offset: immediate or register (with optional shift)
    let offset: number;
    if (inst.regOffset) {
      const rm = this.registers[inst.operand2 & 0xF];
      if (inst.shiftAmount > 0) {
        const shifted = this.applyBarrelShifter(rm, inst.shiftType, inst.shiftAmount, false);
        offset = shifted.value;
      } else {
        offset = rm;
      }
    } else {
      offset = inst.operand2; // signed immediate from decode
    }

    // Pre-index: address = base + offset (default)
    // Post-index: address = base (offset applied to writeback only)
    const address = inst.preIndex ? ((base + offset) >>> 0) : (base >>> 0);
    const writeback = inst.setFlags; // setFlags reused as writeback flag for memory

    // Check memory access permissions
    const userMode = (this.cpsr & 0x1F) === CPUMode.USER;
    const isWrite = inst.opcode === Opcode.STR || inst.opcode === Opcode.STRB || inst.opcode === Opcode.STRH;
    const access = this.memory.checkAccess(address, isWrite, userMode);
    if (!access.allowed) {
      this.bus.emit('cpu:fault', { pc, address, fault: access.fault });
      this.handleInterrupt(isWrite ? IRQ.DATA_ABORT : IRQ.PREFETCH_ABORT);
      return;
    }

    switch (inst.opcode) {
      case Opcode.LDR: {
        const value = this.memory.readWord(address);
        this.registers[inst.rd] = value;
        this.bus.emit('cpu:execute', { op: 'LDR', rd: inst.rd, address, value });
        break;
      }
      case Opcode.STR: {
        const value = this.registers[inst.rd];
        this.memory.writeWord(address, value);
        this.bus.emit('cpu:execute', { op: 'STR', rd: inst.rd, address, value });
        break;
      }
      case Opcode.LDRB: {
        const value = this.memory.readByte(address);
        this.registers[inst.rd] = value;
        this.bus.emit('cpu:execute', { op: 'LDRB', rd: inst.rd, address, value });
        break;
      }
      case Opcode.STRB: {
        const value = this.registers[inst.rd] & 0xFF;
        this.memory.writeByte(address, value);
        this.bus.emit('cpu:execute', { op: 'STRB', rd: inst.rd, address, value });
        break;
      }
      case Opcode.LDRH: {
        const value = this.memory.readHalf(address);
        this.registers[inst.rd] = value;
        this.bus.emit('cpu:execute', { op: 'LDRH', rd: inst.rd, address, value });
        break;
      }
      case Opcode.STRH: {
        const value = this.registers[inst.rd] & 0xFFFF;
        this.memory.writeHalf(address, value);
        this.bus.emit('cpu:execute', { op: 'STRH', rd: inst.rd, address, value });
        break;
      }
      case Opcode.LDRSB: {
        // Load byte and sign-extend to 32 bits
        let value = this.memory.readByte(address);
        if (value & 0x80) value |= 0xFFFFFF00; // sign extend
        this.registers[inst.rd] = value;
        this.bus.emit('cpu:execute', { op: 'LDRSB', rd: inst.rd, address, value });
        break;
      }
      case Opcode.LDRSH: {
        // Load halfword and sign-extend to 32 bits
        let value = this.memory.readHalf(address);
        if (value & 0x8000) value |= 0xFFFF0000; // sign extend
        this.registers[inst.rd] = value;
        this.bus.emit('cpu:execute', { op: 'LDRSH', rd: inst.rd, address, value });
        break;
      }
    }

    // Writeback: update base register with base + offset
    if (writeback) {
      const writebackAddr = (base + offset) >>> 0;
      this.registers[inst.rn] = writebackAddr;
    }

    this.registers[REG.PC] = pc + 4;
  }

  private executeBranch(inst: DecodedInstruction, pc: number): void {
    if (inst.opcode === Opcode.BX) {
      // Branch to address in register
      const target = this.registers[inst.rn];
      this.registers[REG.PC] = target;
      this.flushPipeline();
      this.bus.emit('cpu:execute', { op: 'BX', target, rn: inst.rn });
      return;
    }

    if (inst.opcode === Opcode.BLX) {
      // Branch with link and exchange: save return address, branch to register
      this.registers[REG.LR] = pc + 4;
      const target = this.registers[inst.rn];
      this.registers[REG.PC] = target;
      this.flushPipeline();
      this.bus.emit('cpu:execute', { op: 'BLX', target, rn: inst.rn });
      return;
    }

    if (inst.link) {
      // Save return address
      this.registers[REG.LR] = pc + 4;
    }

    // Branch offset is in words (multiply by 4)
    const target = pc + 4 + (inst.branchOffset * 4);
    this.registers[REG.PC] = target;
    this.flushPipeline();

    this.bus.emit('cpu:execute', {
      op: inst.link ? 'BL' : 'B',
      from: pc,
      target,
      offset: inst.branchOffset,
    });
  }

  private executeStack(inst: DecodedInstruction, pc: number): void {
    let sp = this.registers[REG.SP];

    if (inst.opcode === Opcode.PUSH) {
      // Push registers (highest numbered first)
      for (let i = 15; i >= 0; i--) {
        if (inst.regList & (1 << i)) {
          sp -= 4;
          this.memory.writeWord(sp, this.registers[i]);
        }
      }
      this.registers[REG.SP] = sp;
      this.bus.emit('cpu:execute', { op: 'PUSH', regList: inst.regList, sp });
    } else if (inst.opcode === Opcode.POP) {
      // Pop registers (lowest numbered first)
      for (let i = 0; i <= 15; i++) {
        if (inst.regList & (1 << i)) {
          this.registers[i] = this.memory.readWord(sp);
          sp += 4;
        }
      }
      this.registers[REG.SP] = sp;
      this.bus.emit('cpu:execute', { op: 'POP', regList: inst.regList, sp });

      // If PC was popped, flush pipeline
      if (inst.regList & (1 << REG.PC)) {
        this.flushPipeline();
        return;
      }
    }

    this.registers[REG.PC] = pc + 4;
  }

  private executeSystem(inst: DecodedInstruction, pc: number): void {
    switch (inst.opcode) {
      case Opcode.SWI:
        this.bus.emit('cpu:swi', { number: inst.swiNumber, pc });
        // Save state and switch to SVC mode
        this.handleSWI(inst.swiNumber, pc);
        return;

      case Opcode.NOP:
        this.bus.emit('cpu:execute', { op: 'NOP' });
        break;

      case Opcode.HALT:
        this.state = CPUState.HALTED;
        this.bus.emit('cpu:halt', { pc, cycle: this.cycle });
        return;

      case Opcode.WFI:
        this.state = CPUState.WAITING;
        this.bus.emit('cpu:wfi', { pc });
        break;

      case Opcode.MRS:
        // Move CPSR to register
        this.registers[inst.rd] = this.cpsr;
        this.bus.emit('cpu:execute', { op: 'MRS', rd: inst.rd, cpsr: this.cpsr });
        break;

      case Opcode.MSR:
        // Move register to CPSR (only in privileged mode)
        if ((this.cpsr & 0x1F) !== CPUMode.USER) {
          this.cpsr = this.registers[inst.rn];
          this.bus.emit('cpu:execute', { op: 'MSR', rn: inst.rn, cpsr: this.cpsr });
        } else {
          this.bus.emit('cpu:fault', { pc, fault: 'MSR in user mode' });
        }
        break;
    }

    this.registers[REG.PC] = pc + 4;
  }

  private executeWideImm(inst: DecodedInstruction, pc: number): void {
    if (inst.opcode === Opcode.MOVW) {
      // Load 16-bit immediate into lower half, clear upper
      this.registers[inst.rd] = inst.operand2 & 0xFFFF;
    } else if (inst.opcode === Opcode.MOVT) {
      // Load 16-bit immediate into upper half, preserve lower
      this.registers[inst.rd] = (this.registers[inst.rd] & 0xFFFF) | ((inst.operand2 & 0xFFFF) << 16);
    }
    this.registers[REG.PC] = pc + 4;
    this.bus.emit('cpu:execute', { op: OPCODE_NAMES[inst.opcode], rd: inst.rd, value: this.registers[inst.rd] });
  }

  // ── Interrupt Handling ────────────────────────────────────────

  private handleInterrupt(irq: number): void {
    // Save current state
    const savedPC = this.registers[REG.PC];
    const savedCPSR = this.cpsr;

    // Switch to IRQ mode
    const oldMode = this.cpsr & 0x1F;
    this.bankedRegisters.get(oldMode as CPUMode)!.sp = this.registers[REG.SP];
    this.bankedRegisters.get(oldMode as CPUMode)!.lr = this.registers[REG.LR];
    this.bankedRegisters.get(oldMode as CPUMode)!.cpsr = savedCPSR;

    // Enter appropriate mode
    const newMode = (irq === IRQ.FIQ) ? CPUMode.FIQ : CPUMode.IRQ;
    this.cpsr = (this.cpsr & ~0x1F) | newMode;
    this.cpsr |= CPSR_I; // Disable further IRQs

    // Restore banked registers for new mode
    const banked = this.bankedRegisters.get(newMode)!;
    if (banked.sp) this.registers[REG.SP] = banked.sp;

    // Set LR to return address
    this.registers[REG.LR] = savedPC;

    // Jump to interrupt vector
    const vectorAddress = this.config.ivtAddress + (irq * 4);
    const handler = this.memory.readWord(vectorAddress);
    this.registers[REG.PC] = handler;
    this.flushPipeline();

    this.bus.emit('cpu:interrupt', {
      irq,
      handler,
      savedPC,
      savedCPSR,
      mode: newMode,
    });
  }

  private handleSWI(number: number, pc: number): void {
    const oldMode = this.cpsr & 0x1F;

    if (oldMode === CPUMode.SVC) {
      // Already in SVC mode (user program running in kernel space).
      // Don't do a full mode switch — that would corrupt the banked registers.
      // The cpu:swi event was already emitted by executeSystem() before calling us,
      // so the kernel JS handler has already run. Just advance PC past the SWI.
      this.registers[REG.PC] = pc + 4;
      return;
    }

    // Save state for cross-mode SWI (called from USER mode)
    const savedCPSR = this.cpsr;
    this.bankedRegisters.get(oldMode as CPUMode)!.sp = this.registers[REG.SP];
    this.bankedRegisters.get(oldMode as CPUMode)!.lr = this.registers[REG.LR];
    this.bankedRegisters.get(oldMode as CPUMode)!.cpsr = savedCPSR;

    // Switch to SVC mode
    this.cpsr = (this.cpsr & ~0x1F) | CPUMode.SVC;
    this.cpsr |= CPSR_I;

    // Set LR to instruction after SWI
    this.registers[REG.LR] = pc + 4;

    // Jump to SWI handler vector
    const vectorAddress = this.config.ivtAddress + (IRQ.SWI * 4);
    const handler = this.memory.readWord(vectorAddress);
    this.registers[REG.PC] = handler;
    this.flushPipeline();

    this.bus.emit('cpu:swi_enter', { number, handler, savedPC: pc + 4 });
  }

  private flushPipeline(): void {
    for (const entry of this.pipeline) {
      entry.instruction = null;
      entry.flushed = true;
    }
    this.bus.emit('cpu:pipeline_flush', {});
  }

  // ── Flag helpers ──────────────────────────────────────────────

  private getFlags(): { N: boolean; Z: boolean; C: boolean; V: boolean; I: boolean; F: boolean } {
    return {
      N: !!(this.cpsr & CPSR_N),
      Z: !!(this.cpsr & CPSR_Z),
      C: !!(this.cpsr & CPSR_C),
      V: !!(this.cpsr & CPSR_V),
      I: !!(this.cpsr & CPSR_I),
      F: !!(this.cpsr & CPSR_F),
    };
  }

  // ── Public API ────────────────────────────────────────────────

  getState(): CPUState {
    return this.state;
  }

  setState(state: CPUState): void {
    this.state = state;
    this.bus.emit('cpu:state_change', { state });
  }

  getSnapshot(): CPUSnapshot {
    return {
      registers: Array.from(this.registers),
      cpsr: this.cpsr,
      mode: (this.cpsr & 0x1F) as CPUMode,
      state: this.state,
      cycle: this.cycle,
      pipeline: this.pipeline.map(p => ({ ...p })),
      pc: this.registers[REG.PC],
      sp: this.registers[REG.SP],
      lr: this.registers[REG.LR],
      flags: this.getFlags(),
      lastInstruction: this.lastInstruction,
      instructionCount: this.instructionCount,
    };
  }

  getRegister(index: number): number {
    return this.registers[index];
  }

  setRegister(index: number, value: number): void {
    this.registers[index] = value;
    this.bus.emit('cpu:register_write', { reg: index, value, name: REG_NAMES[index] });
  }

  getCPSR(): number {
    return this.cpsr;
  }

  setCPSR(value: number): void {
    this.cpsr = value;
  }

  getCycle(): number {
    return this.cycle;
  }

  getPC(): number {
    return this.registers[REG.PC];
  }

  setPC(value: number): void {
    this.registers[REG.PC] = value;
    this.flushPipeline();
  }

  // ── Breakpoints ───────────────────────────────────────────────

  addBreakpoint(address: number): void {
    this.breakpoints.add(address);
    this.bus.emit('debug:breakpoint_add', { address });
  }

  removeBreakpoint(address: number): void {
    this.breakpoints.delete(address);
    this.bus.emit('debug:breakpoint_remove', { address });
  }

  getBreakpoints(): Set<number> {
    return this.breakpoints;
  }

  isStepping(): boolean {
    return this.stepping;
  }

  setStepping(stepping: boolean): void {
    this.stepping = stepping;
  }
}
