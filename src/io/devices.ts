/**
 * I/O Devices: UART, Timer, Interrupt Controller, Display
 *
 * Each device interfaces with the CPU through memory-mapped I/O.
 * The event bus simulates the physical interrupt lines.
 */

import { MMIO, IRQ } from '../core/cpu-config.ts';
import type { EventBus } from '../core/events.ts';
import type { Memory } from '../memory/memory.ts';

// ── UART (Serial / TTY) ──────────────────────────────────────────

export class UART {
  private rxBuffer: number[] = [];
  private txBuffer: number[] = [];
  private rxInterruptEnabled = false;
  private txInterruptEnabled = false;
  private bus: EventBus;

  /** Callbacks for external I/O (the web terminal) */
  onTransmit: ((char: number) => void) | null = null;

  constructor(bus: EventBus, memory: Memory) {
    this.bus = bus;

    memory.registerMMIO({
      name: 'uart',
      startAddress: MMIO.UART_BASE,
      endAddress: MMIO.UART_CONTROL + 3,
      read: (addr) => this.read(addr),
      write: (addr, val) => this.write(addr, val),
    });
  }

  private read(address: number): number {
    switch (address) {
      case MMIO.UART_DATA: {
        const byte = this.rxBuffer.shift() ?? 0;
        this.bus.emit('uart:rx_read', { byte });
        return byte;
      }
      case MMIO.UART_STATUS: {
        let status = 0;
        if (this.rxBuffer.length > 0) status |= 1; // RX ready
        status |= 2; // TX always ready
        return status;
      }
      case MMIO.UART_CONTROL: {
        let ctrl = 0;
        if (this.rxInterruptEnabled) ctrl |= 1;
        if (this.txInterruptEnabled) ctrl |= 2;
        return ctrl;
      }
      default:
        return 0;
    }
  }

  private write(address: number, value: number): void {
    switch (address) {
      case MMIO.UART_DATA:
        this.txBuffer.push(value & 0xFF);
        this.bus.emit('uart:tx', { byte: value & 0xFF, char: String.fromCharCode(value & 0xFF) });
        if (this.onTransmit) this.onTransmit(value & 0xFF);
        break;
      case MMIO.UART_CONTROL:
        this.rxInterruptEnabled = !!(value & 1);
        this.txInterruptEnabled = !!(value & 2);
        break;
    }
  }

  /** Called by the web terminal when user types */
  receiveChar(charCode: number): void {
    this.rxBuffer.push(charCode & 0xFF);
    this.bus.emit('uart:rx', { byte: charCode & 0xFF });
    if (this.rxInterruptEnabled) {
      this.bus.emit('irq:raise', { irq: IRQ.UART_RX });
    }
  }

  /** Check if there is data to read */
  hasData(): boolean {
    return this.rxBuffer.length > 0;
  }

  reset(): void {
    this.rxBuffer = [];
    this.txBuffer = [];
    this.rxInterruptEnabled = false;
    this.txInterruptEnabled = false;
  }
}

// ── Timer ────────────────────────────────────────────────────────

export class Timer {
  private count = 0;
  private compare = 0;
  private enabled = false;
  private autoReload = false;
  private bus: EventBus;

  constructor(bus: EventBus, memory: Memory) {
    this.bus = bus;

    memory.registerMMIO({
      name: 'timer',
      startAddress: MMIO.TIMER_BASE,
      endAddress: MMIO.TIMER_CONTROL + 3,
      read: (addr) => this.read(addr),
      write: (addr, val) => this.write(addr, val),
    });
  }

  private read(address: number): number {
    switch (address) {
      case MMIO.TIMER_COUNT: return this.count;
      case MMIO.TIMER_COMPARE: return this.compare;
      case MMIO.TIMER_CONTROL:
        return (this.enabled ? 1 : 0) | (this.autoReload ? 2 : 0);
      default: return 0;
    }
  }

  private write(address: number, value: number): void {
    switch (address) {
      case MMIO.TIMER_COUNT:
        this.count = value;
        break;
      case MMIO.TIMER_COMPARE:
        this.compare = value;
        break;
      case MMIO.TIMER_CONTROL:
        this.enabled = !!(value & 1);
        this.autoReload = !!(value & 2);
        if (!this.enabled) this.count = 0;
        break;
    }
  }

  /** Called every CPU cycle */
  tick(): void {
    if (!this.enabled) return;

    this.count++;
    if (this.compare > 0 && this.count >= this.compare) {
      this.bus.emit('irq:raise', { irq: IRQ.TIMER });
      this.bus.emit('timer:fire', { count: this.count, compare: this.compare });
      if (this.autoReload) {
        this.count = 0;
      } else {
        this.enabled = false;
      }
    }
  }

  getState(): { count: number; compare: number; enabled: boolean; autoReload: boolean } {
    return { count: this.count, compare: this.compare, enabled: this.enabled, autoReload: this.autoReload };
  }

  reset(): void {
    this.count = 0;
    this.compare = 0;
    this.enabled = false;
    this.autoReload = false;
  }
}

// ── Interrupt Controller ─────────────────────────────────────────

export class InterruptController {
  private pending = 0;     // Bitmask of pending interrupts
  private enableMask = 0;  // Bitmask of enabled interrupts
  private bus: EventBus;

  constructor(bus: EventBus, memory: Memory) {
    this.bus = bus;

    memory.registerMMIO({
      name: 'irq-controller',
      startAddress: MMIO.IRQ_BASE,
      endAddress: MMIO.IRQ_ACK + 3,
      read: (addr) => this.read(addr),
      write: (addr, val) => this.write(addr, val),
    });

    // Listen for IRQ raise events from devices
    bus.on('irq:raise', (data) => {
      const { irq } = data as { irq: number };
      this.raiseInterrupt(irq);
    });
  }

  private read(address: number): number {
    switch (address) {
      case MMIO.IRQ_PENDING: return this.pending & this.enableMask;
      case MMIO.IRQ_ENABLE: return this.enableMask;
      default: return 0;
    }
  }

  private write(address: number, value: number): void {
    switch (address) {
      case MMIO.IRQ_ENABLE:
        this.enableMask = value;
        break;
      case MMIO.IRQ_ACK:
        this.pending &= ~value; // Clear acknowledged interrupts
        this.bus.emit('irq:ack', { bits: value });
        break;
    }
  }

  raiseInterrupt(irq: number): void {
    this.pending |= (1 << irq);
    this.bus.emit('irq:pending_change', { pending: this.pending, enabled: this.enableMask });
  }

  clearInterrupt(irq: number): void {
    this.pending &= ~(1 << irq);
  }

  /** Returns highest priority pending & enabled interrupt, or -1 */
  getNextInterrupt(): number {
    const active = this.pending & this.enableMask;
    if (active === 0) return -1;
    // Find lowest set bit (highest priority)
    for (let i = 0; i < 16; i++) {
      if (active & (1 << i)) return i;
    }
    return -1;
  }

  hasPending(): boolean {
    return (this.pending & this.enableMask) !== 0;
  }

  getState(): { pending: number; enableMask: number } {
    return { pending: this.pending, enableMask: this.enableMask };
  }

  reset(): void {
    this.pending = 0;
    this.enableMask = 0;
  }
}

// ── Display (Text Mode Framebuffer) ──────────────────────────────

export class Display {
  private enabled = false;
  private cursorVisible = true;
  private cursorX = 0;
  private cursorY = 0;
  private cols = 40;
  private rows = 20;
  private framebuffer: Uint8Array;
  private bus: EventBus;

  /** Callback for UI updates */
  onUpdate: (() => void) | null = null;

  constructor(bus: EventBus, memory: Memory) {
    this.bus = bus;
    this.framebuffer = new Uint8Array(this.cols * this.rows);
    this.framebuffer.fill(0x20); // Fill with spaces

    // Control registers
    memory.registerMMIO({
      name: 'display-ctrl',
      startAddress: MMIO.DISPLAY_BASE,
      endAddress: MMIO.DISPLAY_ROWS + 3,
      read: (addr) => this.readControl(addr),
      write: (addr, val) => this.writeControl(addr, val),
    });

    // Framebuffer memory
    memory.registerMMIO({
      name: 'display-fb',
      startAddress: MMIO.DISPLAY_FB_BASE,
      endAddress: MMIO.DISPLAY_FB_END,
      read: (addr) => this.readFB(addr),
      write: (addr, val) => this.writeFB(addr, val),
    });
  }

  private readControl(address: number): number {
    switch (address) {
      case MMIO.DISPLAY_CONTROL:
        return (this.enabled ? 1 : 0) | (this.cursorVisible ? 2 : 0);
      case MMIO.DISPLAY_CURSOR_X: return this.cursorX;
      case MMIO.DISPLAY_CURSOR_Y: return this.cursorY;
      case MMIO.DISPLAY_COLS: return this.cols;
      case MMIO.DISPLAY_ROWS: return this.rows;
      default: return 0;
    }
  }

  private writeControl(address: number, value: number): void {
    switch (address) {
      case MMIO.DISPLAY_CONTROL:
        this.enabled = !!(value & 1);
        this.cursorVisible = !!(value & 2);
        break;
      case MMIO.DISPLAY_CURSOR_X:
        this.cursorX = value % this.cols;
        break;
      case MMIO.DISPLAY_CURSOR_Y:
        this.cursorY = value % this.rows;
        break;
    }
    this.bus.emit('display:update', this.getState());
    if (this.onUpdate) this.onUpdate();
  }

  private readFB(address: number): number {
    const offset = address - MMIO.DISPLAY_FB_BASE;
    if (offset < this.framebuffer.length) {
      return this.framebuffer[offset];
    }
    return 0;
  }

  private writeFB(address: number, value: number): void {
    const offset = address - MMIO.DISPLAY_FB_BASE;
    if (offset < this.framebuffer.length) {
      this.framebuffer[offset] = value & 0xFF;
      this.bus.emit('display:pixel', { offset, value: value & 0xFF });
      if (this.onUpdate) this.onUpdate();
    }
  }

  /** Write a character at cursor position and advance */
  putChar(ch: number): void {
    if (ch === 10) { // newline
      this.cursorX = 0;
      this.cursorY++;
    } else if (ch === 13) { // carriage return
      this.cursorX = 0;
    } else if (ch === 8) { // backspace
      if (this.cursorX > 0) this.cursorX--;
    } else {
      const offset = this.cursorY * this.cols + this.cursorX;
      if (offset < this.framebuffer.length) {
        this.framebuffer[offset] = ch & 0xFF;
      }
      this.cursorX++;
      if (this.cursorX >= this.cols) {
        this.cursorX = 0;
        this.cursorY++;
      }
    }

    // Scroll if needed
    if (this.cursorY >= this.rows) {
      this.scroll();
      this.cursorY = this.rows - 1;
    }
  }

  private scroll(): void {
    // Move everything up one row
    this.framebuffer.copyWithin(0, this.cols);
    // Clear last row
    this.framebuffer.fill(0x20, (this.rows - 1) * this.cols);
    this.bus.emit('display:scroll', {});
  }

  getFramebuffer(): Uint8Array {
    return this.framebuffer;
  }

  getState(): {
    enabled: boolean; cursorVisible: boolean; cursorX: number; cursorY: number;
    cols: number; rows: number;
  } {
    return {
      enabled: this.enabled, cursorVisible: this.cursorVisible,
      cursorX: this.cursorX, cursorY: this.cursorY,
      cols: this.cols, rows: this.rows,
    };
  }

  /** Get text content as string */
  getText(): string {
    const lines: string[] = [];
    for (let y = 0; y < this.rows; y++) {
      let line = '';
      for (let x = 0; x < this.cols; x++) {
        line += String.fromCharCode(this.framebuffer[y * this.cols + x]);
      }
      lines.push(line.trimEnd());
    }
    return lines.join('\n');
  }

  reset(): void {
    this.enabled = false;
    this.cursorVisible = true;
    this.cursorX = 0;
    this.cursorY = 0;
    this.framebuffer.fill(0x20);
  }
}
