/**
 * Minimal Kernel for the CPU Simulator
 *
 * Provides:
 * - Boot sequence and IVT setup
 * - System call interface
 * - Process scheduler (round-robin)
 * - Basic memory management
 * - TTY/UART driver integration
 *
 * Syscalls:
 *   0: exit(code)
 *   1: write(fd, buf_ptr, len)    - write bytes to fd (1=stdout)
 *   2: read(fd, buf_ptr, len)     - read bytes from fd (0=stdin)
 *   3: yield()                    - yield to scheduler
 *   4: getpid()                   - get current process ID
 *   5: sleep(cycles)              - sleep for N cycles
 *   6: brk(addr)                  - set program break (heap)
 *   7: fork()                     - fork process (simplified)
 *   8: exec(addr)                 - execute program at address
 *  10: open_display()             - enable display
 *  11: put_char(ch)               - write char to display
 *  12: get_time()                 - get timer count
 *  20: storage_read(block)        - read storage block into DMA buf
 *  21: storage_write(block)       - write DMA buf to storage block
 */

import type { CPU } from '../core/cpu.ts';
import { CPUMode, CPSR_I, REG } from '../core/isa.ts';
import type { Memory } from '../memory/memory.ts';
import type { EventBus } from '../core/events.ts';
import type { CPUConfig } from '../core/cpu-config.ts';
import { MMIO, IRQ } from '../core/cpu-config.ts';
import { Assembler } from '../assembler/assembler.ts';
import {
  encodeDataProc, encodeBranch, encodeSWI, encodeSystem, encodeMemory, encodeWideImm,
  Condition, Opcode,
} from '../core/isa.ts';

// ── Process Control Block ────────────────────────────────────────

export interface PCB {
  pid: number;
  name: string;
  state: 'ready' | 'running' | 'blocked' | 'sleeping' | 'terminated';
  pc: number;
  sp: number;
  registers: number[];
  cpsr: number;
  priority: number;
  sleepUntil: number;
  memoryStart: number;
  memoryEnd: number;
  exitCode: number;
}

// ── Kernel ───────────────────────────────────────────────────────

export class Kernel {
  private cpu: CPU;
  private memory: Memory;
  private bus: EventBus;
  private config: CPUConfig;

  private processes: Map<number, PCB> = new Map();
  private currentPid = 0;
  private nextPid = 1;
  private schedulerEnabled = false;
  private booted = false;
  private kernelLog: string[] = [];

  constructor(cpu: CPU, memory: Memory, bus: EventBus, config: CPUConfig) {
    this.cpu = cpu;
    this.memory = memory;
    this.bus = bus;
    this.config = config;

    // Listen for SWI events
    bus.on('cpu:swi', (data) => {
      const { number } = data as { number: number; pc: number };
      this.handleSyscall(number);
    });

    // Listen for timer interrupts for scheduler
    bus.on('irq:raise', (data) => {
      const { irq } = data as { irq: number };
      if (irq === IRQ.TIMER && this.schedulerEnabled) {
        this.schedule();
      }
    });
  }

  /** Boot the kernel: set up IVT, kernel code, and initial process */
  boot(): void {
    this.kernelLog = [];
    this.log('Kernel booting...');

    // Reset CPU and memory
    this.cpu.reset();

    // Build kernel code
    const kernelAsm = this.generateKernelCode();
    const assembler = new Assembler(this.config.kernelBaseAddress);
    const result = assembler.assemble(kernelAsm);

    if (!result.success) {
      this.log(`Kernel assembly errors: ${result.errors.map(e => e.message).join(', ')}`);
      // Fall back to direct machine code setup
      this.setupKernelDirect();
    } else {
      // Load kernel binary into memory
      this.memory.loadBlock(this.config.kernelBaseAddress, result.binary);
      this.log(`Kernel loaded: ${result.binary.length} bytes at 0x${this.config.kernelBaseAddress.toString(16)}`);
    }

    // Set up interrupt vector table using label addresses from the assembler
    this.setupIVT(result.success ? result.labels : null);

    // Set CPU to start at kernel entry point
    this.cpu.setPC(this.config.kernelBaseAddress + 0x40); // Skip IVT
    this.cpu.setCPSR(CPUMode.SVC | CPSR_I); // SVC mode, IRQs disabled initially

    this.booted = true;
    this.log('Kernel boot complete');
    this.bus.emit('kernel:boot', { log: this.kernelLog });
  }

  private generateKernelCode(): string {
    return `
; ════════════════════════════════════
; Kernel Entry Point
; ════════════════════════════════════

; Skip past IVT area (64 bytes = 16 words)
.space 64

; ── Kernel Init ──
kernel_init:
  ; Set up kernel stack
  MOVW SP, #${this.config.stackStartAddress}
  
  ; Enable display
  MOVW R0, #${MMIO.DISPLAY_CONTROL}
  MOV R1, #3
  STR R1, [R0]

  ; Enable timer (auto-reload, compare=100)
  MOVW R0, #${MMIO.TIMER_COMPARE}
  MOV R1, #100
  STR R1, [R0]
  MOVW R0, #${MMIO.TIMER_CONTROL}
  MOV R1, #3
  STR R1, [R0]

  ; Enable interrupts in IRQ controller
  MOVW R0, #${MMIO.IRQ_ENABLE}
  MOVW R1, #0xFFFF
  STR R1, [R0]

  ; Print boot message via UART
  MOVW R0, #${MMIO.UART_DATA}
  MOV R1, #79     ; 'O'
  STRB R1, [R0]
  MOV R1, #75     ; 'K'
  STRB R1, [R0]
  MOV R1, #10     ; newline
  STRB R1, [R0]

  ; Jump to idle loop (or user program)
  B idle_loop

; ── SWI Handler ──
swi_handler:
  ; SWI number is encoded in the instruction
  ; R0-R3 contain syscall arguments
  ; We handle it in the host via event bus
  ; Return from exception: MOVS PC, LR restores CPSR and mode
  MOVS PC, LR

; ── IRQ Handler ──
irq_handler:
  ; Acknowledge interrupt
  MOVW R0, #${MMIO.IRQ_ACK}
  MOVW R1, #0xFFFF
  STR R1, [R0]
  ; Return from exception: MOVS PC, LR restores CPSR and mode
  MOVS PC, LR

; ── Idle Loop ──
idle_loop:
  WFI
  B idle_loop

; ── Halt Handler ──
halt_handler:
  HALT
`.trim();
  }

  /** Direct machine code setup as fallback */
  private setupKernelDirect(): void {
    const code: number[] = [];

    // Simple kernel: set SP, then idle loop
    // MOVW SP, #stackStartAddress
    code.push(encodeWideImm(Condition.AL, Opcode.MOVW, REG.SP, this.config.stackStartAddress & 0xFFFF));
    // WFI
    code.push(encodeSystem(Condition.AL, Opcode.WFI));
    // B -1 (loop back to WFI)
    code.push(encodeBranch(Condition.AL, Opcode.B, -2));

    // SWI handler (at known offset): return from exception
    // MOVS PC, LR — restores CPSR and mode from banked registers
    code.push(encodeDataProc(Condition.AL, Opcode.MOV, REG.PC, 0, REG.LR, false, true));

    // Load into memory
    this.memory.loadWords(this.config.kernelBaseAddress + 0x40, code);
    this.log('Kernel loaded via direct machine code');
  }

  /** Set up Interrupt Vector Table */
  private setupIVT(labels: Map<string, number> | null): void {
    const ivt = this.config.ivtAddress;
    const kernelBase = this.config.kernelBaseAddress + 0x40;

    // Use actual label addresses if available, otherwise fall back to kernelBase
    const swiHandler = labels?.get('swi_handler') ?? kernelBase;
    const irqHandler = labels?.get('irq_handler') ?? kernelBase;
    const haltHandler = labels?.get('halt_handler') ?? kernelBase;
    const kernelInit = labels?.get('kernel_init') ?? kernelBase;

    // Each vector points to a handler address
    // Vector 0: Reset -> kernel_init
    this.memory.writeWord(ivt + IRQ.RESET * 4, kernelInit);
    // Vector 1: Undefined -> halt
    this.memory.writeWord(ivt + IRQ.UNDEFINED * 4, haltHandler);
    // Vector 2: SWI -> swi_handler
    this.memory.writeWord(ivt + IRQ.SWI * 4, swiHandler);
    // Vector 6: IRQ -> irq_handler
    this.memory.writeWord(ivt + IRQ.IRQ * 4, irqHandler);
    // Vector 8: Timer -> irq_handler
    this.memory.writeWord(ivt + IRQ.TIMER * 4, irqHandler);

    this.log('IVT configured');
  }

  /** Handle a system call */
  private handleSyscall(number: number): void {
    const r0 = this.cpu.getRegister(0);
    const r1 = this.cpu.getRegister(1);
    const r2 = this.cpu.getRegister(2);

    this.bus.emit('kernel:syscall', { number, r0, r1, r2 });
    this.log(`Syscall ${number}: R0=${r0}, R1=${r1}, R2=${r2}`);

    switch (number) {
      case 0: // exit
        this.bus.emit('kernel:process_exit', { pid: this.currentPid, code: r0 });
        this.log(`Process ${this.currentPid} exited with code ${r0}`);
        if (this.processes.has(this.currentPid)) {
          this.processes.get(this.currentPid)!.state = 'terminated';
          this.processes.get(this.currentPid)!.exitCode = r0;
        }
        break;

      case 1: { // write(fd, buf_ptr, len)
        const fd = r0;
        const bufPtr = r1;
        const len = r2;
        if (fd === 1 || fd === 2) {
          // stdout/stderr: write to UART
          for (let i = 0; i < len; i++) {
            const byte = this.memory.readByte(bufPtr + i);
            this.memory.writeByte(MMIO.UART_DATA, byte);
          }
        }
        this.cpu.setRegister(0, len); // return bytes written
        break;
      }

      case 2: { // read(fd, buf_ptr, len)
        // Simplified: read from UART
        const uartStatus = this.memory.readByte(MMIO.UART_STATUS);
        if (uartStatus & 1) {
          const byte = this.memory.readByte(MMIO.UART_DATA);
          if (r1 > 0) {
            this.memory.writeByte(r1, byte);
          }
          this.cpu.setRegister(0, 1);
        } else {
          this.cpu.setRegister(0, 0);
        }
        break;
      }

      case 3: // yield
        this.schedule();
        break;

      case 4: // getpid
        this.cpu.setRegister(0, this.currentPid);
        break;

      case 5: // sleep(cycles)
        if (this.processes.has(this.currentPid)) {
          const proc = this.processes.get(this.currentPid)!;
          proc.state = 'sleeping';
          proc.sleepUntil = this.cpu.getCycle() + r0;
        }
        this.schedule();
        break;

      case 6: // brk(addr)
        // Simplified: just return the requested address if valid
        this.cpu.setRegister(0, r0 < this.config.mmioBaseAddress ? r0 : -1);
        break;

      case 10: // open_display
        this.memory.writeWord(MMIO.DISPLAY_CONTROL, 3); // enable + cursor
        this.cpu.setRegister(0, 0);
        break;

      case 11: // put_char
        this.memory.writeByte(MMIO.UART_DATA, r0 & 0xFF);
        this.cpu.setRegister(0, 0);
        break;

      case 12: // get_time
        this.cpu.setRegister(0, this.memory.readWord(MMIO.TIMER_COUNT));
        break;

      case 20: // storage_read(block)
        this.memory.writeWord(MMIO.STORAGE_BLOCK, r0);
        this.memory.writeWord(MMIO.STORAGE_CMD, 1); // read command
        this.cpu.setRegister(0, 0);
        break;

      case 21: // storage_write(block)
        this.memory.writeWord(MMIO.STORAGE_BLOCK, r0);
        this.memory.writeWord(MMIO.STORAGE_CMD, 2); // write command
        this.cpu.setRegister(0, 0);
        break;

      default:
        this.log(`Unknown syscall: ${number}`);
        this.cpu.setRegister(0, -1);
    }
  }

  /** Round-robin scheduler */
  private schedule(): void {
    if (!this.schedulerEnabled || this.processes.size === 0) return;

    // Save current process state
    if (this.processes.has(this.currentPid)) {
      const current = this.processes.get(this.currentPid)!;
      if (current.state === 'running') {
        current.state = 'ready';
      }
      const snapshot = this.cpu.getSnapshot();
      current.registers = snapshot.registers;
      current.cpsr = snapshot.cpsr;
      current.pc = snapshot.pc;
      current.sp = snapshot.sp;
    }

    // Wake sleeping processes
    const cycle = this.cpu.getCycle();
    for (const proc of this.processes.values()) {
      if (proc.state === 'sleeping' && cycle >= proc.sleepUntil) {
        proc.state = 'ready';
      }
    }

    // Find next ready process
    const pids = [...this.processes.keys()].sort();
    const currentIdx = pids.indexOf(this.currentPid);
    let nextPid = -1;

    for (let i = 1; i <= pids.length; i++) {
      const candidateIdx = (currentIdx + i) % pids.length;
      const candidate = this.processes.get(pids[candidateIdx])!;
      if (candidate.state === 'ready') {
        nextPid = pids[candidateIdx];
        break;
      }
    }

    if (nextPid < 0) return; // No ready process

    // Switch to next process
    const next = this.processes.get(nextPid)!;
    next.state = 'running';
    const previousPid = this.currentPid;
    this.currentPid = nextPid;

    // Restore registers
    for (let i = 0; i < next.registers.length; i++) {
      this.cpu.setRegister(i, next.registers[i]);
    }
    this.cpu.setCPSR(next.cpsr);
    this.cpu.setPC(next.pc);

    this.bus.emit('kernel:context_switch', { from: previousPid, to: nextPid });
  }

  /** Create a new process */
  createProcess(name: string, entryPoint: number, memStart: number, memEnd: number): number {
    const pid = this.nextPid++;
    const pcb: PCB = {
      pid,
      name,
      state: 'ready',
      pc: entryPoint,
      sp: memEnd - 4,
      registers: new Array(16).fill(0),
      cpsr: CPUMode.USER,
      priority: 0,
      sleepUntil: 0,
      memoryStart: memStart,
      memoryEnd: memEnd,
      exitCode: 0,
    };
    pcb.registers[REG.SP] = pcb.sp;
    pcb.registers[REG.PC] = entryPoint;

    this.processes.set(pid, pcb);
    this.bus.emit('kernel:process_create', { pid, name, entryPoint });
    this.log(`Process ${pid} created: '${name}' at 0x${entryPoint.toString(16)}`);
    return pid;
  }

  /** Load and run a user program */
  loadProgram(name: string, binary: Uint8Array, address?: number): number {
    const addr = address ?? this.config.userBaseAddress;
    this.memory.loadBlock(addr, binary);
    return this.createProcess(name, addr, addr, addr + binary.length + 256);
  }

  enableScheduler(): void {
    this.schedulerEnabled = true;
    this.log('Scheduler enabled');
  }

  disableScheduler(): void {
    this.schedulerEnabled = false;
    this.log('Scheduler disabled');
  }

  getProcesses(): PCB[] {
    return [...this.processes.values()];
  }

  getCurrentPid(): number {
    return this.currentPid;
  }

  getLog(): string[] {
    return this.kernelLog;
  }

  isBooted(): boolean {
    return this.booted;
  }

  private log(msg: string): void {
    const entry = `[kernel] ${msg}`;
    this.kernelLog.push(entry);
    this.bus.emit('kernel:log', { message: entry });
  }

  reset(): void {
    this.processes.clear();
    this.currentPid = 0;
    this.nextPid = 1;
    this.schedulerEnabled = false;
    this.booted = false;
    this.kernelLog = [];
  }
}
