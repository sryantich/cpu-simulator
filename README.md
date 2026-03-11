# CPU Simulator

A browser-based ARM-inspired 32-bit CPU simulator and interactive learning tool. Built with TypeScript and Vite -- zero runtime dependencies, pure vanilla DOM.

## Features

### CPU & Architecture
- **32-bit RISC ISA** with 49+ instructions, 16 ARM-identical condition codes
- **16 registers** (R0-R15) with ARM conventions (SP, LR, PC), CPSR with NZCV flags
- **4 processor modes** (User, FIQ, IRQ, SVC) with banked registers
- **Barrel shifter** with LSL, LSR, ASR, ROR, RRX shift operations
- **32KB RAM** with MMU, memory-mapped I/O

### Peripherals (MMIO)
- UART (serial terminal)
- Timer with interrupt support
- IRQ Controller
- 40x20 character display
- 4MB block storage device

### Toolchain
- **Two-pass assembler** with labels, directives, and full ISA support
- **Disassembler** for inspecting memory
- **TinyC compiler** -- a C-subset language that compiles to the simulator's assembly

### Kernel
- Boot sequence with interrupt vector table
- 13+ system calls (print, read, malloc, free, spawn, exit, etc.)
- Round-robin process scheduler

### Learning System
- **11 tutorials** covering registers through kernel programming
- **14 hands-on exercises** with validation
- **7 quizzes** to test understanding
- **23 example programs** from Hello World to a mini shell
- XP, badges, learning tracks, and level progression

### UI
- 8 tabbed views: Code & Debug, Terminal, CPU State, Memory, Kernel, I/O Bus, ISA Reference, Learn
- Syntax-highlighted code editor with breakpoint support
- Run / Pause / Step / Reset controls with keyboard shortcuts
- Dark and light themes
- Responsive layout (desktop, tablet, mobile)
- Onboarding walkthrough for new users

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

Open `http://localhost:5173` in your browser.

## Project Structure

```
src/
  core/         CPU, simulator, ISA definitions, event bus
  assembler/    Two-pass assembler and disassembler
  compiler/     TinyC compiler (C-subset -> assembly)
  kernel/       Boot, IVT, syscalls, scheduler
  memory/       RAM, MMU, MMIO routing
  io/           Peripheral devices (UART, Timer, IRQ, Display, Storage)
  storage/      Block storage device
  learning/     Tutorials, exercises, quizzes, examples, progress tracking
  ui/           Tab views, helpers, syntax highlighting, tooltips, themes
  main.ts       App entry point
  style.css     All styles (~3700 lines, dark/light themes, responsive)
```

## Tech Stack

- **TypeScript** -- strict mode, ES2022 target
- **Vite** -- dev server and bundler
- **Zero runtime dependencies** -- pure vanilla DOM with a custom `el()` helper

## License

All rights reserved.
