/**
 * Memory subsystem: 32KB RAM with memory-mapped I/O support
 *
 * Provides byte-addressable memory with word-aligned access helpers.
 * MMIO regions are handled via callbacks to I/O devices.
 */

import type { CPUConfig } from '../core/cpu-config.ts';
import { MMIO } from '../core/cpu-config.ts';
import type { EventBus } from '../core/events.ts';

export type MMIOReadHandler = (address: number) => number;
export type MMIOWriteHandler = (address: number, value: number) => void;

export interface MMIODevice {
  startAddress: number;
  endAddress: number;
  read: MMIOReadHandler;
  write: MMIOWriteHandler;
  name: string;
}

export interface PageTableEntry {
  physicalPage: number;
  valid: boolean;
  readable: boolean;
  writable: boolean;
  executable: boolean;
  userAccessible: boolean;
  dirty: boolean;
  accessed: boolean;
}

export class Memory {
  private ram: DataView;
  private rawBuffer: ArrayBuffer;
  private mmioDevices: MMIODevice[] = [];
  private config: CPUConfig;
  private bus: EventBus;
  private pageTable: PageTableEntry[] = [];
  private mmuActive = false;

  /** Access counters for visualization */
  private readCounts: Uint32Array;
  private writeCounts: Uint32Array;

  constructor(config: CPUConfig, bus: EventBus) {
    this.config = config;
    this.bus = bus;
    this.rawBuffer = new ArrayBuffer(config.memorySize);
    this.ram = new DataView(this.rawBuffer);
    this.readCounts = new Uint32Array(config.memorySize);
    this.writeCounts = new Uint32Array(config.memorySize);

    // Initialize page table
    const numPages = Math.ceil(config.memorySize / config.pageSize);
    for (let i = 0; i < numPages; i++) {
      this.pageTable.push({
        physicalPage: i,
        valid: true,
        readable: true,
        writable: true,
        executable: true,
        userAccessible: i * config.pageSize >= config.userBaseAddress,
        dirty: false,
        accessed: false,
      });
    }
  }

  /** Register a memory-mapped I/O device */
  registerMMIO(device: MMIODevice): void {
    this.mmioDevices.push(device);
    this.mmioDevices.sort((a, b) => a.startAddress - b.startAddress);
  }

  /** Remove a memory-mapped I/O device */
  unregisterMMIO(name: string): void {
    this.mmioDevices = this.mmioDevices.filter(d => d.name !== name);
  }

  /** Check if address is in MMIO range */
  private isMMIO(address: number): boolean {
    return address >= this.config.mmioBaseAddress && address < this.config.memorySize;
  }

  /** Find MMIO device for address */
  private findMMIODevice(address: number): MMIODevice | undefined {
    return this.mmioDevices.find(d =>
      address >= d.startAddress && address <= d.endAddress
    );
  }

  /** Enable/disable MMU */
  setMMUActive(active: boolean): void {
    this.mmuActive = active;
    this.bus.emit('mmu:toggle', { active });
  }

  isMMUActive(): boolean {
    return this.mmuActive;
  }

  /** Check memory access permissions */
  checkAccess(address: number, write: boolean, userMode: boolean): { allowed: boolean; fault: string | null } {
    if (!this.mmuActive) return { allowed: true, fault: null };

    const pageIndex = Math.floor(address / this.config.pageSize);
    if (pageIndex >= this.pageTable.length) {
      return { allowed: false, fault: 'PAGE_FAULT: address out of range' };
    }

    const entry = this.pageTable[pageIndex];
    if (!entry.valid) {
      return { allowed: false, fault: 'PAGE_FAULT: invalid page' };
    }
    if (userMode && !entry.userAccessible) {
      return { allowed: false, fault: 'PROTECTION_FAULT: kernel page accessed from user mode' };
    }
    if (write && !entry.writable) {
      return { allowed: false, fault: 'PROTECTION_FAULT: write to read-only page' };
    }
    if (!write && !entry.readable) {
      return { allowed: false, fault: 'PROTECTION_FAULT: page not readable' };
    }

    entry.accessed = true;
    if (write) entry.dirty = true;

    return { allowed: true, fault: null };
  }

  /** Read a byte */
  readByte(address: number): number {
    if (address < 0 || address >= this.config.memorySize) {
      this.bus.emit('memory:fault', { address, type: 'out_of_bounds', operation: 'read' });
      return 0;
    }

    if (this.isMMIO(address)) {
      const device = this.findMMIODevice(address);
      if (device) {
        const value = device.read(address);
        this.bus.emit('mmio:read', { address, value, device: device.name });
        return value & 0xFF;
      }
    }

    this.readCounts[address]++;
    this.bus.emit('memory:read', { address, size: 1 });
    return this.ram.getUint8(address);
  }

  /** Write a byte */
  writeByte(address: number, value: number): void {
    if (address < 0 || address >= this.config.memorySize) {
      this.bus.emit('memory:fault', { address, type: 'out_of_bounds', operation: 'write' });
      return;
    }

    if (this.isMMIO(address)) {
      const device = this.findMMIODevice(address);
      if (device) {
        device.write(address, value & 0xFF);
        this.bus.emit('mmio:write', { address, value: value & 0xFF, device: device.name });
        return;
      }
    }

    this.writeCounts[address]++;
    this.ram.setUint8(address, value & 0xFF);
    this.bus.emit('memory:write', { address, value: value & 0xFF, size: 1 });
  }

  /** Read a 32-bit word (little-endian) */
  readWord(address: number): number {
    if (address < 0 || address + 3 >= this.config.memorySize) {
      this.bus.emit('memory:fault', { address, type: 'out_of_bounds', operation: 'read' });
      return 0;
    }

    if (this.isMMIO(address)) {
      const device = this.findMMIODevice(address);
      if (device) {
        const value = device.read(address);
        this.bus.emit('mmio:read', { address, value, device: device.name });
        return value;
      }
    }

    this.readCounts[address]++;
    this.bus.emit('memory:read', { address, size: 4 });
    return this.ram.getUint32(address, this.config.littleEndian);
  }

  /** Write a 32-bit word */
  writeWord(address: number, value: number): void {
    if (address < 0 || address + 3 >= this.config.memorySize) {
      this.bus.emit('memory:fault', { address, type: 'out_of_bounds', operation: 'write' });
      return;
    }

    if (this.isMMIO(address)) {
      const device = this.findMMIODevice(address);
      if (device) {
        device.write(address, value);
        this.bus.emit('mmio:write', { address, value, device: device.name });
        return;
      }
    }

    this.writeCounts[address]++;
    this.ram.setUint32(address, value >>> 0, this.config.littleEndian);
    this.bus.emit('memory:write', { address, value: value >>> 0, size: 4 });
  }

  /** Read a 16-bit halfword */
  readHalf(address: number): number {
    if (address < 0 || address + 1 >= this.config.memorySize) {
      this.bus.emit('memory:fault', { address, type: 'out_of_bounds', operation: 'read' });
      return 0;
    }

    if (this.isMMIO(address)) {
      const device = this.findMMIODevice(address);
      if (device) {
        const value = device.read(address);
        this.bus.emit('mmio:read', { address, value, device: device.name });
        return value & 0xFFFF;
      }
    }

    this.readCounts[address]++;
    this.bus.emit('memory:read', { address, size: 2 });
    return this.ram.getUint16(address, this.config.littleEndian);
  }

  /** Write a 16-bit halfword */
  writeHalf(address: number, value: number): void {
    if (address < 0 || address + 1 >= this.config.memorySize) {
      this.bus.emit('memory:fault', { address, type: 'out_of_bounds', operation: 'write' });
      return;
    }

    if (this.isMMIO(address)) {
      const device = this.findMMIODevice(address);
      if (device) {
        device.write(address, value & 0xFFFF);
        this.bus.emit('mmio:write', { address, value: value & 0xFFFF, device: device.name });
        return;
      }
    }

    this.writeCounts[address]++;
    this.ram.setUint16(address, value & 0xFFFF, this.config.littleEndian);
    this.bus.emit('memory:write', { address, value: value & 0xFFFF, size: 2 });
  }

  /** Load a block of data into memory (used for loading programs) */
  loadBlock(address: number, data: Uint8Array): void {
    const dst = new Uint8Array(this.rawBuffer, address, data.length);
    dst.set(data);
    this.bus.emit('memory:load', { address, size: data.length });
  }

  /** Load 32-bit words into memory */
  loadWords(address: number, words: number[]): void {
    for (let i = 0; i < words.length; i++) {
      this.ram.setUint32(address + i * 4, words[i] >>> 0, this.config.littleEndian);
    }
    this.bus.emit('memory:load', { address, size: words.length * 4 });
  }

  /** Get raw buffer for visualization */
  getRawBuffer(): ArrayBuffer {
    return this.rawBuffer;
  }

  /** Get a snapshot of memory range */
  getSlice(start: number, length: number): Uint8Array {
    return new Uint8Array(this.rawBuffer, start, Math.min(length, this.config.memorySize - start));
  }

  /** Get access heatmap data */
  getReadCounts(): Uint32Array {
    return this.readCounts;
  }

  getWriteCounts(): Uint32Array {
    return this.writeCounts;
  }

  /** Get page table for visualization */
  getPageTable(): PageTableEntry[] {
    return this.pageTable;
  }

  /** Reset memory */
  reset(): void {
    new Uint8Array(this.rawBuffer).fill(0);
    this.readCounts.fill(0);
    this.writeCounts.fill(0);
    this.mmuActive = false;
    for (const entry of this.pageTable) {
      entry.valid = true;
      entry.dirty = false;
      entry.accessed = false;
    }
  }

  /** Get total size */
  get size(): number {
    return this.config.memorySize;
  }
}
