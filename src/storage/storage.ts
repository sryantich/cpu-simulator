/**
 * Block storage device - 4MB simulated disk
 *
 * Simple block device with 512-byte sectors.
 * Supports read/write operations and DMA transfers.
 * Data persists in an ArrayBuffer (could be backed by IndexedDB later).
 */

import type { CPUConfig } from '../core/cpu-config.ts';
import { MMIO } from '../core/cpu-config.ts';
import type { EventBus } from '../core/events.ts';
import type { Memory } from '../memory/memory.ts';

export class Storage {
  private data: ArrayBuffer;
  private view: DataView;
  private config: CPUConfig;
  private bus: EventBus;
  private memory: Memory;

  /** Controller state */
  private command = 0;
  private blockNumber = 0;
  private status = 0; // bit 0: busy, bit 1: error, bit 2: done
  private busy = false;
  private transferCycles = 0;

  constructor(config: CPUConfig, bus: EventBus, memory: Memory) {
    this.config = config;
    this.bus = bus;
    this.memory = memory;
    this.data = new ArrayBuffer(config.storageSize);
    this.view = new DataView(this.data);
    this.dmaBufferData = new Uint8Array(config.storageBlockSize);

    // Register MMIO for storage controller
    memory.registerMMIO({
      name: 'storage',
      startAddress: MMIO.STORAGE_BASE,
      endAddress: MMIO.STORAGE_STATUS + 3,
      read: (addr) => this.mmioRead(addr),
      write: (addr, val) => this.mmioWrite(addr, val),
    });

    // Register MMIO for DMA buffer (read/write directly)
    memory.registerMMIO({
      name: 'storage-dma',
      startAddress: MMIO.STORAGE_DMA_BASE,
      endAddress: MMIO.STORAGE_DMA_END,
      read: (addr) => this.dmaRead(addr),
      write: (addr, val) => this.dmaWrite(addr, val),
    });
  }

  private mmioRead(address: number): number {
    switch (address) {
      case MMIO.STORAGE_CMD:
        return this.command;
      case MMIO.STORAGE_BLOCK:
        return this.blockNumber;
      case MMIO.STORAGE_STATUS:
        return this.status;
      default:
        return 0;
    }
  }

  private mmioWrite(address: number, value: number): void {
    switch (address) {
      case MMIO.STORAGE_CMD:
        this.command = value;
        if (value === 1) this.startRead();
        else if (value === 2) this.startWrite();
        break;
      case MMIO.STORAGE_BLOCK:
        this.blockNumber = value;
        break;
    }
  }

  /** DMA buffer reads go to storage data */
  private dmaBufferData: Uint8Array;

  private dmaRead(address: number): number {
    const offset = address - MMIO.STORAGE_DMA_BASE;
    return this.dmaBufferData[offset] || 0;
  }

  private dmaWrite(address: number, value: number): void {
    const offset = address - MMIO.STORAGE_DMA_BASE;
    this.dmaBufferData[offset] = value & 0xFF;
  }

  /** Start a block read: copy storage -> DMA buffer */
  private startRead(): void {
    const blockSize = this.config.storageBlockSize;
    const offset = this.blockNumber * blockSize;

    if (offset + blockSize > this.config.storageSize) {
      this.status = 0b010; // error
      this.bus.emit('storage:error', { block: this.blockNumber, type: 'read', reason: 'out_of_range' });
      return;
    }

    this.status = 0b001; // busy
    this.busy = true;
    this.bus.emit('storage:read_start', { block: this.blockNumber });

    // Copy from storage to DMA buffer
    const src = new Uint8Array(this.data, offset, blockSize);
    this.dmaBufferData.set(src);

    // Simulate transfer delay (a few cycles)
    this.transferCycles = 4;
  }

  /** Start a block write: copy DMA buffer -> storage */
  private startWrite(): void {
    const blockSize = this.config.storageBlockSize;
    const offset = this.blockNumber * blockSize;

    if (offset + blockSize > this.config.storageSize) {
      this.status = 0b010; // error
      this.bus.emit('storage:error', { block: this.blockNumber, type: 'write', reason: 'out_of_range' });
      return;
    }

    this.status = 0b001; // busy
    this.busy = true;
    this.bus.emit('storage:write_start', { block: this.blockNumber });

    // Copy from DMA buffer to storage
    const dst = new Uint8Array(this.data, offset, blockSize);
    dst.set(this.dmaBufferData.subarray(0, blockSize));

    this.transferCycles = 4;
  }

  /** Called each CPU cycle to simulate transfer latency */
  tick(): void {
    if (!this.busy) return;

    this.transferCycles--;
    if (this.transferCycles <= 0) {
      this.busy = false;
      this.status = 0b100; // done
      this.command = 0;
      this.bus.emit('storage:complete', { block: this.blockNumber });
    }
  }

  /** Direct access for loading OS images, etc. */
  writeBlock(blockNumber: number, data: Uint8Array): void {
    const blockSize = this.config.storageBlockSize;
    const offset = blockNumber * blockSize;
    const dst = new Uint8Array(this.data, offset, blockSize);
    dst.set(data.subarray(0, blockSize));
  }

  readBlock(blockNumber: number): Uint8Array {
    const blockSize = this.config.storageBlockSize;
    const offset = blockNumber * blockSize;
    return new Uint8Array(this.data.slice(offset, offset + blockSize));
  }

  /** Write raw bytes at byte offset (for initial loading) */
  writeBytes(offset: number, data: Uint8Array): void {
    new Uint8Array(this.data, offset, data.length).set(data);
  }

  /** Get raw buffer for visualization */
  getRawBuffer(): ArrayBuffer {
    return this.data;
  }

  get totalBlocks(): number {
    return Math.floor(this.config.storageSize / this.config.storageBlockSize);
  }

  reset(): void {
    new Uint8Array(this.data).fill(0);
    this.command = 0;
    this.blockNumber = 0;
    this.status = 0;
    this.busy = false;
    this.transferCycles = 0;
    this.dmaBufferData.fill(0);
  }
}
