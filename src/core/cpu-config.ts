/**
 * CPU Configuration - All parameters are customizable/extensible
 */

export interface CPUConfig {
  /** Number of general-purpose registers (default: 16, R0-R15) */
  numRegisters: number;
  /** Word size in bits (default: 32) */
  wordSize: number;
  /** Clock speed in Hz for simulation timing (default: 1 = 1 cycle/sec) */
  clockSpeedHz: number;
  /** Enable pipelining simulation */
  pipelineEnabled: boolean;
  /** Pipeline stages */
  pipelineStages: number;
  /** Memory size in bytes (default: 32768 = 32KB) */
  memorySize: number;
  /** Storage size in bytes (default: 4194304 = 4MB) */
  storageSize: number;
  /** Storage block size in bytes */
  storageBlockSize: number;
  /** Stack grows downward from this address */
  stackStartAddress: number;
  /** Kernel memory starts at this address */
  kernelBaseAddress: number;
  /** User memory starts at this address */
  userBaseAddress: number;
  /** MMIO region start */
  mmioBaseAddress: number;
  /** Interrupt vector table address */
  ivtAddress: number;
  /** Enable MMU (memory protection) */
  mmuEnabled: boolean;
  /** Page size for MMU */
  pageSize: number;
  /** Endianness */
  littleEndian: boolean;
}

export const DEFAULT_CONFIG: CPUConfig = {
  numRegisters: 16,
  wordSize: 32,
  clockSpeedHz: 4, // 4 cycles per second - slow enough to watch
  pipelineEnabled: true,
  pipelineStages: 5, // Fetch, Decode, Execute, Memory, Writeback
  memorySize: 32768, // 32KB
  storageSize: 4194304, // 4MB
  storageBlockSize: 512,
  stackStartAddress: 0x8000, // Top of 32KB (SP points above stack, PUSH decrements first)
  kernelBaseAddress: 0x0000,
  userBaseAddress: 0x4000, // 16KB mark
  mmioBaseAddress: 0x7000, // Last 4KB is MMIO
  ivtAddress: 0x0000, // Interrupt vector table at address 0
  mmuEnabled: true,
  pageSize: 256, // 256-byte pages (128 pages in 32KB)
  littleEndian: true,
};

/**
 * Memory map (32KB / 0x0000 - 0x7FFF):
 *
 * 0x0000 - 0x003F : Interrupt Vector Table (64 bytes, 16 vectors)
 * 0x0040 - 0x3FFF : Kernel space (~16KB)
 * 0x4000 - 0x6FFF : User space (~12KB)
 * 0x7000 - 0x7EFF : Memory-mapped I/O (4KB)
 *   0x7000 - 0x700F : UART (serial/TTY)
 *   0x7010 - 0x701F : Timer
 *   0x7020 - 0x702F : Interrupt controller
 *   0x7030 - 0x703F : Storage controller
 *   0x7040 - 0x70FF : Display framebuffer control
 *   0x7100 - 0x74FF : Display framebuffer (1KB, 32x16 text mode)
 *   0x7500 - 0x76FF : Storage DMA buffer (512 bytes)
 *   0x7700 - 0x7EFF : Reserved
 * 0x7F00 - 0x7FFF : Stack (256 bytes initial)
 */
export const MMIO = {
  UART_BASE: 0x7000,
  UART_DATA: 0x7000,      // Read/write byte
  UART_STATUS: 0x7004,    // Bit 0: RX ready, Bit 1: TX ready
  UART_CONTROL: 0x7008,   // Bit 0: RX interrupt enable, Bit 1: TX interrupt enable

  TIMER_BASE: 0x7010,
  TIMER_COUNT: 0x7010,    // Current count (read)
  TIMER_COMPARE: 0x7014,  // Compare value (write) - fires interrupt when count == compare
  TIMER_CONTROL: 0x7018,  // Bit 0: enable, Bit 1: auto-reload

  IRQ_BASE: 0x7020,
  IRQ_PENDING: 0x7020,    // Pending interrupt bits (read)
  IRQ_ENABLE: 0x7024,     // Interrupt enable mask
  IRQ_ACK: 0x7028,        // Write to acknowledge/clear interrupt

  STORAGE_BASE: 0x7030,
  STORAGE_CMD: 0x7030,    // Command: 0=NOP, 1=READ, 2=WRITE
  STORAGE_BLOCK: 0x7034,  // Block number
  STORAGE_STATUS: 0x7038, // Bit 0: busy, Bit 1: error, Bit 2: done

  DISPLAY_BASE: 0x7040,
  DISPLAY_CONTROL: 0x7040, // Bit 0: enable, Bit 1: cursor visible
  DISPLAY_CURSOR_X: 0x7044,
  DISPLAY_CURSOR_Y: 0x7048,
  DISPLAY_COLS: 0x704C,
  DISPLAY_ROWS: 0x7050,
  DISPLAY_FB_BASE: 0x7100, // 32x16 characters = 512 bytes
  DISPLAY_FB_END: 0x74FF,

  STORAGE_DMA_BASE: 0x7500,
  STORAGE_DMA_END: 0x76FF,
} as const;

/** Interrupt numbers */
export const IRQ = {
  RESET: 0,
  UNDEFINED: 1,
  SWI: 2,       // Software interrupt (syscall)
  PREFETCH_ABORT: 3,
  DATA_ABORT: 4,
  RESERVED: 5,
  IRQ: 6,       // Normal interrupt
  FIQ: 7,       // Fast interrupt
  TIMER: 8,
  UART_RX: 9,
  UART_TX: 10,
  STORAGE: 11,
  KEYBOARD: 12,
} as const;
