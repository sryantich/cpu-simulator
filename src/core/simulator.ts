/**
 * Simulator - Main orchestrator that connects all components
 *
 * Creates and manages:
 * - CPU, Memory, Storage, I/O devices
 * - Kernel
 * - Clock/timing
 * - Assembler/Compiler integration
 */

import { type CPUConfig, DEFAULT_CONFIG } from '../core/cpu-config.ts';
import { EventBus } from '../core/events.ts';
import { CPU, CPUState, type CPUSnapshot } from '../core/cpu.ts';
import { Memory } from '../memory/memory.ts';
import { Storage } from '../storage/storage.ts';
import { UART, Timer, InterruptController, Display } from '../io/devices.ts';
import { Kernel } from '../kernel/kernel.ts';
import { Assembler, type AssemblerResult, disassembleRange } from '../assembler/assembler.ts';
import { compile, type CompilerResult } from '../compiler/compiler.ts';

export interface SimulatorState {
  running: boolean;
  speed: number; // cycles per second
  cpu: CPUSnapshot;
  cycle: number;
  timer: { count: number; compare: number; enabled: boolean; autoReload: boolean };
  irq: { pending: number; enableMask: number };
}

export class Simulator {
  readonly config: CPUConfig;
  readonly bus: EventBus;
  readonly cpu: CPU;
  readonly memory: Memory;
  readonly storage: Storage;
  readonly uart: UART;
  readonly timer: Timer;
  readonly irqController: InterruptController;
  readonly display: Display;
  readonly kernel: Kernel;

  private running = false;
  private tickTimer: number | null = null;
  private speed: number; // Hz

  constructor(config?: Partial<CPUConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.speed = this.config.clockSpeedHz;

    // Create event bus
    this.bus = new EventBus();

    // Create memory
    this.memory = new Memory(this.config, this.bus);

    // Create I/O devices
    this.uart = new UART(this.bus, this.memory);
    this.timer = new Timer(this.bus, this.memory);
    this.irqController = new InterruptController(this.bus, this.memory);
    this.display = new Display(this.bus, this.memory);

    // Create CPU
    this.cpu = new CPU(this.config, this.memory, this.bus);
    this.cpu.setInterruptController(this.irqController);

    // Create storage
    this.storage = new Storage(this.config, this.bus, this.memory);

    // Create kernel
    this.kernel = new Kernel(this.cpu, this.memory, this.bus, this.config);
  }

  /** Boot the system */
  boot(): void {
    this.kernel.boot();
    this.bus.emit('sim:boot', {});
  }

  /** Run one clock cycle */
  step(): boolean {
    const ok = this.cpu.tick();
    this.timer.tick();
    this.storage.tick();
    this.bus.emit('sim:step', { cycle: this.cpu.getCycle() });
    return ok;
  }

  /** Start continuous execution */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.bus.emit('sim:start', {});
    this.scheduleNextTick();
  }

  /** Run N steps synchronously (for fast testing / batch execution).
   *  Returns the number of steps actually executed (may be < n if CPU halts). */
  runBatch(n: number): number {
    let executed = 0;
    for (let i = 0; i < n; i++) {
      if (!this.step()) break;
      executed++;
    }
    return executed;
  }

  /** Stop execution */
  stop(): void {
    this.running = false;
    if (this.tickTimer !== null) {
      clearTimeout(this.tickTimer);
      this.tickTimer = null;
    }
    this.bus.emit('sim:stop', {});
  }

  /** Toggle running state */
  toggle(): void {
    if (this.running) this.stop();
    else this.start();
  }

  private scheduleNextTick(): void {
    if (!this.running) return;

    const interval = 1000 / this.speed;
    this.tickTimer = window.setTimeout(() => {
      if (!this.running) return;

      const ok = this.step();
      if (!ok) {
        this.stop();
        return;
      }
      this.scheduleNextTick();
    }, interval);
  }

  /** Set simulation speed */
  setSpeed(hz: number): void {
    this.speed = Math.max(0.5, Math.min(1000, hz));
    // Restart timer if running
    if (this.running) {
      if (this.tickTimer !== null) clearTimeout(this.tickTimer);
      this.scheduleNextTick();
    }
    this.bus.emit('sim:speed_change', { speed: this.speed });
  }

  getSpeed(): number {
    return this.speed;
  }

  /** Assemble and load program */
  assembleAndLoad(source: string, address?: number): AssemblerResult {
    const addr = address ?? this.config.userBaseAddress;
    const assembler = new Assembler(addr);
    const result = assembler.assemble(source);

    if (result.success) {
      this.memory.loadBlock(addr, result.binary);
      this.cpu.setPC(addr);
      // If CPU is in WAITING state (e.g. kernel idle loop after boot),
      // force it to RUNNING so the loaded program actually executes
      if (this.cpu.getState() === CPUState.WAITING) {
        this.cpu.setState(CPUState.RUNNING);
      }
      this.bus.emit('sim:program_loaded', { address: addr, size: result.binary.length, source: 'assembly' });
    }

    return result;
  }

  /** Compile TinyC and load program */
  compileAndLoad(source: string, address?: number): CompilerResult {
    const addr = address ?? this.config.userBaseAddress;
    const result = compile(source, addr);

    if (result.success && result.assemblerResult) {
      this.memory.loadBlock(addr, result.assemblerResult.binary);
      this.cpu.setPC(addr);
      // If CPU is in WAITING state (e.g. kernel idle loop after boot),
      // force it to RUNNING so the loaded program actually executes
      if (this.cpu.getState() === CPUState.WAITING) {
        this.cpu.setState(CPUState.RUNNING);
      }
      this.bus.emit('sim:program_loaded', { address: addr, size: result.assemblerResult.binary.length, source: 'tinyc' });
    }

    return result;
  }

  /** Disassemble memory range */
  disassemble(start: number, count: number): { address: number; word: number; text: string }[] {
    return disassembleRange(this.memory, start, count);
  }

  /** Get full simulator state */
  getState(): SimulatorState {
    return {
      running: this.running,
      speed: this.speed,
      cpu: this.cpu.getSnapshot(),
      cycle: this.cpu.getCycle(),
      timer: this.timer.getState(),
      irq: this.irqController.getState(),
    };
  }

  isRunning(): boolean {
    return this.running;
  }

  /** Full reset */
  reset(): void {
    this.stop();
    this.cpu.reset();
    this.memory.reset();
    this.storage.reset();
    this.uart.reset();
    this.timer.reset();
    this.irqController.reset();
    this.display.reset();
    this.kernel.reset();
    this.bus.reset();
    this.bus.emit('sim:reset', {});
  }
}
