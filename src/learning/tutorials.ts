/**
 * Tutorial System - Structured lessons with exercises and validation
 *
 * Each tutorial is a multi-step guided lesson. Steps can be:
 *  - "explanation": Text + code examples (read-only)
 *  - "exercise": A task the user completes in the editor, then validates
 *  - "quiz": Multiple-choice question with explanation
 *
 * Validation checks register values, memory, or terminal output after
 * the user's program runs to HALT.
 */

import type { Simulator } from '../core/simulator.ts';
import { CPUState } from '../core/cpu.ts';

// ── Types ────────────────────────────────────────────────────────

export interface Tutorial {
  id: string;
  title: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  /** Estimated completion time in minutes */
  estimatedMinutes: number;
  steps: TutorialStep[];
}

export type TutorialStep = ExplanationStep | ExerciseStep | QuizStep;

interface StepBase {
  id: string;
  title: string;
}

export interface ExplanationStep extends StepBase {
  type: 'explanation';
  /** Markdown-like content: supports **bold**, `code`, and code blocks */
  content: string;
  /** Optional code to display as a read-only example */
  codeExample?: string;
}

export interface ExerciseStep extends StepBase {
  type: 'exercise';
  /** Instruction text describing the task */
  instruction: string;
  /** Hints (progressively revealed) */
  hints: string[];
  /** Starter code pre-filled in editor */
  starterCode: string;
  /** Solution code (shown after 3 failed attempts) */
  solutionCode: string;
  /** Validation function - returns { passed, message } */
  validate: (sim: Simulator) => ValidationResult;
}

export interface QuizStep extends StepBase {
  type: 'quiz';
  question: string;
  options: string[];
  /** Index of correct answer (0-based) */
  correctIndex: number;
  /** Explanation shown after answering */
  explanation: string;
}

export interface ValidationResult {
  passed: boolean;
  message: string;
}

// ── Validation helpers ───────────────────────────────────────────

/** Check that a register holds an expected value */
function checkReg(sim: Simulator, reg: number, expected: number): ValidationResult {
  const actual = sim.cpu.getRegister(reg);
  if (actual === expected) {
    return { passed: true, message: `R${reg} = ${expected} - Correct!` };
  }
  return { passed: false, message: `Expected R${reg} = ${expected}, but got ${actual}` };
}

/** Check multiple registers */
function checkRegs(sim: Simulator, checks: [number, number][]): ValidationResult {
  for (const [reg, expected] of checks) {
    const result = checkReg(sim, reg, expected);
    if (!result.passed) return result;
  }
  return { passed: true, message: 'All register values are correct!' };
}

/** Check that a memory word at address holds an expected value */
function checkMem(sim: Simulator, address: number, expected: number): ValidationResult {
  const actual = sim.memory.readWord(address);
  if (actual === expected) {
    return { passed: true, message: `Memory[0x${address.toString(16)}] = ${expected} - Correct!` };
  }
  return {
    passed: false,
    message: `Expected Memory[0x${address.toString(16)}] = ${expected}, but got ${actual}`,
  };
}

/** Check that the CPU halted (program ran to completion) */
function checkHalted(sim: Simulator): ValidationResult {
  if (sim.cpu.getState() === CPUState.HALTED) {
    return { passed: true, message: '' };
  }
  return { passed: false, message: 'Program has not halted yet. Make sure your code ends with HALT.' };
}

// ── Tutorial definitions ─────────────────────────────────────────

export const TUTORIALS: Tutorial[] = [

  // ═══════════════════════════════════════════════════════════════
  //  Tutorial 1: Your First Program
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'first-program',
    title: 'Your First Program',
    description: 'Learn the absolute basics: what registers are, how to use MOV, and how to run a program.',
    difficulty: 'beginner',
    estimatedMinutes: 5,
    steps: [
      {
        id: 'fp-intro',
        title: 'Welcome',
        type: 'explanation',
        content: `Welcome to the CPU Simulator! This tutorial will teach you the fundamentals of ARM assembly language by writing real programs.

**What is assembly language?**

Assembly is the lowest-level human-readable programming language. Each instruction maps directly to an operation the CPU performs. Unlike high-level languages (Python, JavaScript), you work directly with the CPU's registers and memory.

**What is a register?**

A register is a tiny, ultra-fast storage location inside the CPU. This simulator has 16 registers: **R0** through **R15**. Think of them as the CPU's scratchpad — all computation happens here.

Some registers have special roles:
- **R13 (SP)** — Stack Pointer
- **R14 (LR)** — Link Register (return address)
- **R15 (PC)** — Program Counter (next instruction address)

For now, we'll use **R0-R12** as general-purpose registers.`,
      },
      {
        id: 'fp-mov',
        title: 'The MOV Instruction',
        type: 'explanation',
        content: `The simplest instruction is **MOV** (move). It puts a value into a register.

\`MOV Rd, #value\` — Move an immediate (constant) number into register Rd
\`MOV Rd, Rs\` — Copy the value from register Rs into register Rd

The **#** symbol means "immediate value" — a number literal.`,
        codeExample: `; Put 42 into register R0
MOV R0, #42

; Copy R0's value into R1
MOV R1, R0

; Now both R0 and R1 hold 42
HALT`,
      },
      {
        id: 'fp-exercise1',
        title: 'Exercise: Load Values',
        type: 'exercise',
        instruction: `Write a program that:
1. Puts the value **10** into **R0**
2. Puts the value **20** into **R1**
3. Copies R0's value into **R2**
4. Ends with **HALT**

After running, R0 should be 10, R1 should be 20, and R2 should be 10.`,
        hints: [
          'Use MOV R0, #10 to put 10 into R0',
          'Use MOV R1, #20 for the second value',
          'Use MOV R2, R0 to copy (not MOV R2, #10)',
        ],
        starterCode: `; Your First Program
; Put values into registers
; TODO: Write your code here

HALT`,
        solutionCode: `; Your First Program
MOV R0, #10
MOV R1, #20
MOV R2, R0
HALT`,
        validate: (sim) => {
          const halted = checkHalted(sim);
          if (!halted.passed) return halted;
          return checkRegs(sim, [[0, 10], [1, 20], [2, 10]]);
        },
      },
      {
        id: 'fp-quiz1',
        title: 'Quick Check',
        type: 'quiz',
        question: 'After executing "MOV R3, #7" followed by "MOV R3, #15", what value is in R3?',
        options: ['7', '15', '22', 'Error — you can\'t write to the same register twice'],
        correctIndex: 1,
        explanation: 'MOV overwrites the register completely. The second MOV replaces the 7 with 15. Unlike variables in some languages, there\'s no "add" happening — MOV always sets the entire register value.',
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  //  Tutorial 2: Arithmetic
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'arithmetic',
    title: 'Arithmetic Operations',
    description: 'Learn ADD, SUB, and MUL to perform calculations with registers.',
    difficulty: 'beginner',
    estimatedMinutes: 8,
    steps: [
      {
        id: 'arith-intro',
        title: 'Math in Assembly',
        type: 'explanation',
        content: `In ARM assembly, arithmetic instructions generally take three operands:

\`ADD Rd, Rn, operand2\`  — Rd = Rn + operand2
\`SUB Rd, Rn, operand2\`  — Rd = Rn - operand2
\`MUL Rd, Rn, operand2\`  — Rd = Rn * operand2

**operand2** can be an immediate value (\`#5\`) or another register (\`R2\`).

The result always goes into the first register (Rd).`,
        codeExample: `; Calculate (3 + 7) * 2
MOV R0, #3
MOV R1, #7
ADD R2, R0, R1    ; R2 = 3 + 7 = 10
MOV R3, #2
MUL R4, R2, R3    ; R4 = 10 * 2 = 20
HALT`,
      },
      {
        id: 'arith-exercise1',
        title: 'Exercise: Simple Math',
        type: 'exercise',
        instruction: `Write a program that calculates **(5 + 3) - 2** and stores the result in **R0**.

Breakdown:
1. Put 5 into some register
2. Add 3 to it
3. Subtract 2 from the result
4. Make sure the final answer (6) ends up in R0`,
        hints: [
          'Start with MOV to load 5 into a register',
          'ADD can use an immediate: ADD R0, R0, #3',
          'SUB works the same: SUB R0, R0, #2',
        ],
        starterCode: `; Calculate (5 + 3) - 2, store result in R0

HALT`,
        solutionCode: `; Calculate (5 + 3) - 2, store result in R0
MOV R0, #5
ADD R0, R0, #3    ; R0 = 5 + 3 = 8
SUB R0, R0, #2    ; R0 = 8 - 2 = 6
HALT`,
        validate: (sim) => {
          const halted = checkHalted(sim);
          if (!halted.passed) return halted;
          return checkReg(sim, 0, 6);
        },
      },
      {
        id: 'arith-exercise2',
        title: 'Exercise: Temperature Conversion',
        type: 'exercise',
        instruction: `Convert a temperature from Celsius to Fahrenheit using the formula:
**F = C * 9 / 5 + 32**

Use **R0 = 20** (20°C) as input. Store the final Fahrenheit result in **R1**.

Note: We're doing integer math, so do the multiply first, then divide, to preserve precision. 20 * 9 = 180, 180 / 5 = 36, 36 + 32 = 68.

Use the **DIV** instruction for division.`,
        hints: [
          'Start with MOV R0, #20 for the Celsius value',
          'Multiply: MUL R1, R0, R2 (where R2 = 9)',
          'Divide: DIV R1, R1, R3 (where R3 = 5)',
          'Add 32: ADD R1, R1, #32',
        ],
        starterCode: `; Convert 20°C to Fahrenheit
; Formula: F = C * 9 / 5 + 32
; Input:  R0 = 20 (Celsius)
; Output: R1 = result (Fahrenheit)

HALT`,
        solutionCode: `; Convert 20°C to Fahrenheit
MOV R0, #20       ; Celsius input
MOV R2, #9
MUL R1, R0, R2    ; R1 = 20 * 9 = 180
MOV R3, #5
DIV R1, R1, R3    ; R1 = 180 / 5 = 36
ADD R1, R1, #32   ; R1 = 36 + 32 = 68
HALT`,
        validate: (sim) => {
          const halted = checkHalted(sim);
          if (!halted.passed) return halted;
          return checkReg(sim, 1, 68);
        },
      },
      {
        id: 'arith-quiz1',
        title: 'Check Your Understanding',
        type: 'quiz',
        question: 'What is the result of: MOV R0, #10 / SUB R0, R0, #15?',
        options: ['5', '-5', '0', 'Error — registers can\'t hold negative numbers'],
        correctIndex: 1,
        explanation: 'ARM registers use two\'s complement for signed integers. A 32-bit register can hold values from -2,147,483,648 to 2,147,483,647. So 10 - 15 = -5 is perfectly valid. In hex, -5 is 0xFFFFFFFB.',
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  //  Tutorial 3: Flags & Conditional Execution
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'flags-conditions',
    title: 'Flags & Conditions',
    description: 'Understand the CPSR flags (N, Z, C, V) and how conditional execution works.',
    difficulty: 'beginner',
    estimatedMinutes: 10,
    steps: [
      {
        id: 'flags-intro',
        title: 'The CPSR Flags',
        type: 'explanation',
        content: `Every ARM instruction can optionally set the **condition flags** in the CPSR (Current Program Status Register). These flags record information about the result of an operation:

- **N** (Negative) — Set if the result is negative (bit 31 = 1)
- **Z** (Zero) — Set if the result is zero
- **C** (Carry) — Set if there was a carry out (unsigned overflow)
- **V** (Overflow) — Set if there was signed overflow

**Important:** Flags are only updated when you add the **S suffix** to an instruction:
- \`ADD R0, R1, R2\`  — does NOT update flags
- \`ADDS R0, R1, R2\` — DOES update flags

The comparison instruction **CMP** always updates flags (it's like SUBS but throws away the result).`,
      },
      {
        id: 'flags-cmp',
        title: 'CMP and Branching',
        type: 'explanation',
        content: `**CMP** compares two values by subtracting them and setting flags (without storing the result).

\`CMP R0, #10\`  — Computes R0 - 10, sets flags, discards result

After CMP, you can use **conditional branches** to jump based on the result:
- \`BEQ label\` — Branch if Equal (Z=1)
- \`BNE label\` — Branch if Not Equal (Z=0)
- \`BGT label\` — Branch if Greater Than (signed)
- \`BLT label\` — Branch if Less Than (signed)
- \`BGE label\` — Branch if Greater or Equal
- \`BLE label\` — Branch if Less or Equal`,
        codeExample: `; Check if R0 equals 5
MOV R0, #5
CMP R0, #5        ; R0 - 5 = 0, Z flag set
BEQ is_five        ; branch taken (Z=1)
MOV R1, #0         ; skipped
B done
is_five:
  MOV R1, #1       ; R1 = 1 (yes, it's five)
done:
  HALT`,
      },
      {
        id: 'flags-exercise1',
        title: 'Exercise: Find the Maximum',
        type: 'exercise',
        instruction: `Write a program that finds the **maximum** of two numbers and stores it in **R2**.

- Set **R0 = 15** and **R1 = 23**
- Compare them, then use conditional branches to put the larger value into R2
- End with HALT

The answer should be R2 = 23.`,
        hints: [
          'Load both values with MOV, then use CMP R0, R1',
          'After CMP: BGT means R0 > R1, BLT means R0 < R1',
          'You need labels for each case and a common "done:" label',
        ],
        starterCode: `; Find max(15, 23), store in R2
MOV R0, #15
MOV R1, #23
; TODO: Compare and branch to find the max

HALT`,
        solutionCode: `; Find max(15, 23), store in R2
MOV R0, #15
MOV R1, #23
CMP R0, R1
BGT r0_bigger
  MOV R2, R1       ; R1 is bigger (or equal)
  B done
r0_bigger:
  MOV R2, R0       ; R0 is bigger
done:
HALT`,
        validate: (sim) => {
          const halted = checkHalted(sim);
          if (!halted.passed) return halted;
          return checkReg(sim, 2, 23);
        },
      },
      {
        id: 'flags-quiz1',
        title: 'Flag Check',
        type: 'quiz',
        question: 'After "MOVS R0, #0", which flags are set?',
        options: [
          'Z only (result is zero)',
          'N only (result is negative)',
          'Z and N',
          'No flags (MOV never sets flags)',
        ],
        correctIndex: 0,
        explanation: 'MOVS (with S suffix) updates the flags. Since the result is 0, the Z (Zero) flag is set. N is clear because bit 31 is 0. C and V are not affected by MOV.',
      },
      {
        id: 'flags-exercise2',
        title: 'Exercise: Clamp a Value',
        type: 'exercise',
        instruction: `Write a program that **clamps** a value between 0 and 100.

- Start with **R0 = 150** (the value to clamp)
- If R0 > 100, set R0 = 100
- If R0 < 0, set R0 = 0
- (If already in range, leave it unchanged)
- Store the clamped result in R0

Since 150 > 100, the expected result is R0 = 100.`,
        hints: [
          'First compare R0 with 100: CMP R0, #100',
          'If R0 > 100 (BGT), set R0 to 100',
          'Then compare with 0 and check BLT',
          'You can skip the 0-check if the value was already clamped from above',
        ],
        starterCode: `; Clamp R0 to range [0, 100]
MOV R0, #150
; TODO: Clamp the value

HALT`,
        solutionCode: `; Clamp R0 to range [0, 100]
MOV R0, #150
CMP R0, #100
BLE not_over
  MOV R0, #100
not_over:
CMP R0, #0
BGE not_under
  MOV R0, #0
not_under:
HALT`,
        validate: (sim) => {
          const halted = checkHalted(sim);
          if (!halted.passed) return halted;
          return checkReg(sim, 0, 100);
        },
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  //  Tutorial 4: Loops
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'loops',
    title: 'Loops & Counting',
    description: 'Build counting loops using branches and learn the loop pattern in assembly.',
    difficulty: 'beginner',
    estimatedMinutes: 10,
    steps: [
      {
        id: 'loops-intro',
        title: 'Loops in Assembly',
        type: 'explanation',
        content: `High-level languages have \`for\` and \`while\`. In assembly, loops are built with **labels** and **conditional branches**.

The basic loop pattern:
1. Set up a counter register
2. Place a label at the loop start
3. Do the loop body work
4. Update the counter
5. Compare and branch back to the label if not done

This is equivalent to a \`do-while\` loop.`,
        codeExample: `; Sum numbers 1 to 5
MOV R0, #0        ; R0 = sum (accumulator)
MOV R1, #1        ; R1 = counter (starts at 1)
loop:
  ADD R0, R0, R1  ; sum += counter
  ADD R1, R1, #1  ; counter++
  CMP R1, #6      ; counter <= 5?
  BLT loop        ; if counter < 6, keep going
; R0 = 1+2+3+4+5 = 15
HALT`,
      },
      {
        id: 'loops-exercise1',
        title: 'Exercise: Factorial',
        type: 'exercise',
        instruction: `Calculate **5!** (5 factorial = 5 * 4 * 3 * 2 * 1 = 120) and store the result in **R0**.

Use a loop that counts down from 5 to 1, multiplying as it goes.`,
        hints: [
          'Set R0 = 1 (accumulator), R1 = 5 (counter)',
          'Loop body: MUL R0, R0, R1 then SUB R1, R1, #1',
          'Compare R1 with 1: if R1 >= 1, loop again (BGE or keep going until R1 = 0)',
          'Check: CMP R1, #0 / BGT loop',
        ],
        starterCode: `; Calculate 5! (factorial), store in R0
; 5! = 5 * 4 * 3 * 2 * 1 = 120

HALT`,
        solutionCode: `; Calculate 5! (factorial), store in R0
MOV R0, #1        ; result = 1
MOV R1, #5        ; counter = 5
loop:
  MUL R0, R0, R1  ; result *= counter
  SUB R1, R1, #1  ; counter--
  CMP R1, #0
  BGT loop        ; if counter > 0, continue
HALT`,
        validate: (sim) => {
          const halted = checkHalted(sim);
          if (!halted.passed) return halted;
          return checkReg(sim, 0, 120);
        },
      },
      {
        id: 'loops-quiz1',
        title: 'Loop Reasoning',
        type: 'quiz',
        question: 'How many times does the loop body execute?\nMOV R0, #3\nloop:\n  SUB R0, R0, #1\n  CMP R0, #0\n  BNE loop',
        options: ['2 times', '3 times', '4 times', 'Infinite loop'],
        correctIndex: 1,
        explanation: 'R0 starts at 3. Iteration 1: R0=2, not zero → loop. Iteration 2: R0=1, not zero → loop. Iteration 3: R0=0, zero → done. So the body runs 3 times.',
      },
      {
        id: 'loops-exercise2',
        title: 'Exercise: Sum of Even Numbers',
        type: 'exercise',
        instruction: `Calculate the sum of **even numbers from 2 to 10** (2+4+6+8+10 = 30).

Store the result in **R0**.

Tip: You can count by 2s instead of 1s — just add 2 to your counter each iteration.`,
        hints: [
          'Set counter R1 = 2, sum R0 = 0',
          'Add R1 to R0 each iteration',
          'Increment R1 by 2: ADD R1, R1, #2',
          'Loop while R1 <= 10: CMP R1, #10 / BLE loop',
        ],
        starterCode: `; Sum even numbers 2 + 4 + 6 + 8 + 10
; Store result in R0

HALT`,
        solutionCode: `; Sum even numbers 2 + 4 + 6 + 8 + 10
MOV R0, #0        ; sum = 0
MOV R1, #2        ; counter = 2
loop:
  ADD R0, R0, R1  ; sum += counter
  ADD R1, R1, #2  ; counter += 2
  CMP R1, #10
  BLE loop        ; if counter <= 10, continue
HALT`,
        validate: (sim) => {
          const halted = checkHalted(sim);
          if (!halted.passed) return halted;
          return checkReg(sim, 0, 30);
        },
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  //  Tutorial 5: Memory & Load/Store
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'memory',
    title: 'Memory & Load/Store',
    description: 'Learn how to read and write memory with LDR and STR — the gateway to data structures.',
    difficulty: 'intermediate',
    estimatedMinutes: 12,
    steps: [
      {
        id: 'mem-intro',
        title: 'Registers vs Memory',
        type: 'explanation',
        content: `The CPU has only 16 registers, but there are **32,768 bytes** (32KB) of RAM. To work with larger amounts of data, you load values from memory into registers, process them, and store results back.

**LDR** (Load Register) reads a 32-bit word from memory:
\`LDR Rd, [Rn, #offset]\`  — Rd = memory[Rn + offset]

**STR** (Store Register) writes a 32-bit word to memory:
\`STR Rd, [Rn, #offset]\`  — memory[Rn + offset] = Rd

The **[Rn, #offset]** syntax is an **addressing mode**: Rn holds the base address, and #offset is added to it.

There are also byte and halfword variants:
- **LDRB / STRB** — load/store a single byte (8-bit)
- **LDRH / STRH** — load/store a halfword (16-bit)`,
      },
      {
        id: 'mem-data',
        title: 'The .data Directive',
        type: 'explanation',
        content: `You can embed data in your program using the assembler directive **.word**:

\`.word value\` — places a 32-bit value at the current address

To reference data, you need to know its address. A common pattern is to place data after the HALT instruction and use labels to reference it.`,
        codeExample: `; Store and load a value from memory
; Use a fixed address in user space
MOVW R1, #0x1000   ; R1 = base address 0x1000
MOV R0, #42
STR R0, [R1]       ; store 42 at address 0x1000
MOV R0, #0         ; clear R0
LDR R0, [R1]       ; load it back: R0 = 42 again
HALT`,
      },
      {
        id: 'mem-exercise1',
        title: 'Exercise: Swap Two Values',
        type: 'exercise',
        instruction: `Swap the values in **R0** and **R1** using memory as temporary storage.

1. Set R0 = 11, R1 = 22
2. Use address **0x1000** as temporary storage
3. After swapping, R0 should be 22 and R1 should be 11

You'll need MOVW to set up the base address, then STR and LDR to save/restore.`,
        hints: [
          'Use MOVW R2, #0x1000 to set the base address',
          'STR R0, [R2] — save R0 to memory',
          'MOV R0, R1 — put R1\'s value into R0',
          'LDR R1, [R2] — load the saved value back into R1',
        ],
        starterCode: `; Swap R0 and R1 using memory at 0x1000
MOV R0, #11
MOV R1, #22
; TODO: Swap R0 and R1

HALT`,
        solutionCode: `; Swap R0 and R1 using memory at 0x1000
MOV R0, #11
MOV R1, #22
MOVW R2, #0x1000   ; temp address
STR R0, [R2]       ; save R0
MOV R0, R1         ; R0 = R1
LDR R1, [R2]       ; R1 = saved R0
HALT`,
        validate: (sim) => {
          const halted = checkHalted(sim);
          if (!halted.passed) return halted;
          return checkRegs(sim, [[0, 22], [1, 11]]);
        },
      },
      {
        id: 'mem-exercise2',
        title: 'Exercise: Array Sum',
        type: 'exercise',
        instruction: `Sum an array of 4 numbers stored in memory and put the result in **R0**.

The array is at address **0x1000** with values: 10, 20, 30, 40.

Steps:
1. First, store the four values into memory at 0x1000, 0x1004, 0x1008, 0x100C
2. Then loop through them, loading each and adding to a sum
3. Store final sum in R0

Expected result: R0 = 100`,
        hints: [
          'Use MOVW R1, #0x1000 as base pointer',
          'Store values: MOV R0, #10 / STR R0, [R1] / MOV R0, #20 / STR R0, [R1, #4] / ...',
          'For the loop: set R2 = 0 (sum), R3 = 0 (offset), R4 = 4 (count)',
          'Each iteration: LDR R5, [R1, R3] — but our ISA only supports immediate offsets. Use ADD R1, R1, #4 to advance the pointer.',
        ],
        starterCode: `; Sum array of [10, 20, 30, 40] at address 0x1000
; Store result in R0

HALT`,
        solutionCode: `; Sum array of [10, 20, 30, 40] at address 0x1000
MOVW R1, #0x1000   ; base address
; Store the array
MOV R0, #10
STR R0, [R1]
MOV R0, #20
STR R0, [R1, #4]
MOV R0, #30
STR R0, [R1, #8]
MOV R0, #40
STR R0, [R1, #12]
; Sum the array
MOV R0, #0         ; sum = 0
MOVW R1, #0x1000   ; reset pointer
MOV R2, #4         ; count = 4
sum_loop:
  LDR R3, [R1]
  ADD R0, R0, R3
  ADD R1, R1, #4
  SUB R2, R2, #1
  CMP R2, #0
  BGT sum_loop
HALT`,
        validate: (sim) => {
          const halted = checkHalted(sim);
          if (!halted.passed) return halted;
          return checkReg(sim, 0, 100);
        },
      },
      {
        id: 'mem-quiz1',
        title: 'Memory Quiz',
        type: 'quiz',
        question: 'If R1 = 0x1000, what address does LDR R0, [R1, #8] read from?',
        options: ['0x1000', '0x1004', '0x1008', '0x0008'],
        correctIndex: 2,
        explanation: 'The addressing mode [R1, #8] means base + offset: 0x1000 + 8 = 0x1008. The offset is in bytes. Since each word is 4 bytes, #8 skips forward 2 words from the base.',
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  //  Tutorial 6: Functions & the Stack
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'functions',
    title: 'Functions & the Stack',
    description: 'Learn how BL/BX implement function calls and how PUSH/POP preserve registers.',
    difficulty: 'intermediate',
    estimatedMinutes: 15,
    steps: [
      {
        id: 'fn-intro',
        title: 'Function Calls',
        type: 'explanation',
        content: `In ARM, a function call uses two instructions:

**BL label** (Branch with Link) — calls a function:
- Saves the return address in **LR** (R14)
- Jumps to the label

**BX LR** (Branch to register) — returns from a function:
- Jumps back to the address stored in LR

This is the ARM calling convention: the caller uses BL, the callee returns with BX LR.

**Arguments** are typically passed in R0-R3, and the **return value** goes in R0.`,
        codeExample: `; A simple function call
MOV R0, #5        ; argument
BL double         ; call double(5)
; R0 is now 10
HALT

double:
  ADD R0, R0, R0  ; R0 = R0 * 2
  BX LR           ; return`,
      },
      {
        id: 'fn-stack',
        title: 'The Stack & PUSH/POP',
        type: 'explanation',
        content: `What if a function needs to call another function? The second BL would overwrite LR! The solution is the **stack**.

The stack is a region of memory pointed to by **SP** (R13). It grows **downward** (from high addresses to low).

**PUSH {regs}** — saves registers onto the stack (SP decreases)
**POP {regs}** — restores registers from the stack (SP increases)

The standard pattern for a function that calls other functions:

\`\`\`
my_func:
  PUSH {R4-R7, LR}   ; save callee-saved regs + return address
  ; ... do work, call other functions ...
  POP {R4-R7, PC}    ; restore regs, return (pop into PC = return)
\`\`\`

Popping into **PC** instead of LR directly does the return for you!`,
      },
      {
        id: 'fn-exercise1',
        title: 'Exercise: Write a Function',
        type: 'exercise',
        instruction: `Write a function **triple** that multiplies R0 by 3 and returns the result in R0.

Main program:
1. Set R0 = 7
2. Call the triple function
3. After the call, R0 should be 21
4. HALT

The function should use BX LR to return.`,
        hints: [
          'Define the function with a label: triple:',
          'Put the function AFTER the HALT so it doesn\'t execute accidentally',
          'Wait — the function is after HALT, so it won\'t run unless we call it. Place it before HALT but use B to skip over it, or place it after HALT.',
          'In the function: MOV R1, #3 / MUL R0, R0, R1 / BX LR',
        ],
        starterCode: `; Main: call triple(7), result in R0
MOV R0, #7
; TODO: Call the triple function
HALT

; TODO: Write the triple function here
`,
        solutionCode: `; Main: call triple(7), result in R0
MOV R0, #7
BL triple
HALT

triple:
  MOV R1, #3
  MUL R0, R0, R1
  BX LR`,
        validate: (sim) => {
          const halted = checkHalted(sim);
          if (!halted.passed) return halted;
          return checkReg(sim, 0, 21);
        },
      },
      {
        id: 'fn-exercise2',
        title: 'Exercise: Nested Calls with PUSH/POP',
        type: 'exercise',
        instruction: `Write two functions:
- **add_five**: adds 5 to R0 and returns
- **add_ten**: calls add_five twice to add 10 total

Main: Set R0 = 3, call add_ten. Result: R0 = 13.

Since add_ten calls add_five, it must save LR with PUSH and restore with POP.`,
        hints: [
          'add_five is simple: ADD R0, R0, #5 / BX LR',
          'add_ten must: PUSH {LR} / BL add_five / BL add_five / POP {PC}',
          'POP {PC} pops the saved LR directly into the program counter, returning',
        ],
        starterCode: `; Main: call add_ten(3), result in R0
MOV R0, #3
BL add_ten
HALT

; TODO: Write add_ten and add_five

`,
        solutionCode: `; Main: call add_ten(3), result in R0
MOV R0, #3
BL add_ten
HALT

add_ten:
  PUSH {LR}
  BL add_five
  BL add_five
  POP {PC}

add_five:
  ADD R0, R0, #5
  BX LR`,
        validate: (sim) => {
          const halted = checkHalted(sim);
          if (!halted.passed) return halted;
          return checkReg(sim, 0, 13);
        },
      },
      {
        id: 'fn-quiz1',
        title: 'Stack Quiz',
        type: 'quiz',
        question: 'Why do we need PUSH {LR} at the start of a function that calls other functions?',
        options: [
          'Because BL overwrites LR with the new return address',
          'Because the stack needs to be aligned',
          'Because R0-R3 get corrupted',
          'It\'s optional — just a convention',
        ],
        correctIndex: 0,
        explanation: 'When add_ten calls BL add_five, the CPU puts add_ten\'s return address (the instruction after BL) into LR, overwriting the original LR that pointed back to main. Without PUSH {LR}, add_ten couldn\'t return to main. PUSH saves LR on the stack so we can restore it later.',
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  //  Tutorial 7: Bitwise Operations
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'bitwise',
    title: 'Bitwise Operations',
    description: 'Master AND, ORR, EOR, BIC, and shift instructions for bit manipulation.',
    difficulty: 'intermediate',
    estimatedMinutes: 10,
    steps: [
      {
        id: 'bits-intro',
        title: 'Thinking in Bits',
        type: 'explanation',
        content: `At the hardware level, everything is bits. ARM provides powerful bitwise instructions:

- **AND Rd, Rn, op2** — bitwise AND (keep bits that are 1 in both)
- **ORR Rd, Rn, op2** — bitwise OR (set bits that are 1 in either)
- **EOR Rd, Rn, op2** — bitwise XOR (toggle bits that are 1 in op2)
- **BIC Rd, Rn, op2** — bit clear = AND NOT (clear specific bits)

**Shifts** move bits left or right:
- **LSL Rd, Rn, #n** — shift left by n (multiply by 2^n)
- **LSR Rd, Rn, #n** — logical shift right (unsigned divide by 2^n)
- **ASR Rd, Rn, #n** — arithmetic shift right (signed divide, preserves sign)

Common use cases: extracting bit fields, setting/clearing flags, fast multiply/divide by powers of 2.`,
        codeExample: `; Extract bits [7:4] from R0 (the upper nibble of the low byte)
MOV R0, #0xAB     ; R0 = 0b10101011
LSR R1, R0, #4    ; shift right 4: R1 = 0b00001010 = 0x0A
AND R1, R1, #0xF  ; mask low 4 bits: R1 = 0x0A = 10
HALT`,
      },
      {
        id: 'bits-exercise1',
        title: 'Exercise: Set, Clear, Toggle',
        type: 'exercise',
        instruction: `Starting with **R0 = 0**, perform these bit operations in order:

1. **Set** bit 3 (R0 should become 8 = 0b1000)
2. **Set** bit 0 (R0 should become 9 = 0b1001)
3. **Clear** bit 3 (R0 should become 1 = 0b0001)
4. **Toggle** bit 7 (R0 should become 129 = 0b10000001)

Final result: R0 = 129

Bit operations:
- Set bit N: ORR R0, R0, #(1 << N)
- Clear bit N: BIC R0, R0, #(1 << N)
- Toggle bit N: EOR R0, R0, #(1 << N)`,
        hints: [
          'Bit 3 = 1<<3 = 8: ORR R0, R0, #8',
          'Bit 0 = 1<<0 = 1: ORR R0, R0, #1',
          'Clear bit 3: BIC R0, R0, #8',
          'Bit 7 = 1<<7 = 128: EOR R0, R0, #128',
        ],
        starterCode: `; Bit manipulation exercise
MOV R0, #0
; TODO: Set bit 3, set bit 0, clear bit 3, toggle bit 7

HALT`,
        solutionCode: `; Bit manipulation exercise
MOV R0, #0
ORR R0, R0, #8     ; set bit 3
ORR R0, R0, #1     ; set bit 0
BIC R0, R0, #8     ; clear bit 3
EOR R0, R0, #128   ; toggle bit 7
HALT`,
        validate: (sim) => {
          const halted = checkHalted(sim);
          if (!halted.passed) return halted;
          return checkReg(sim, 0, 129);
        },
      },
      {
        id: 'bits-exercise2',
        title: 'Exercise: Multiply by 10',
        type: 'exercise',
        instruction: `Multiply **R0 = 7** by 10 using only shifts and adds — no MUL instruction!

Hint: 10 = 8 + 2 = (1<<3) + (1<<1)

So: x * 10 = x * 8 + x * 2 = (x << 3) + (x << 1)

Store the result in R0. Expected: R0 = 70.`,
        hints: [
          'First: LSL R1, R0, #3 gives R0 * 8',
          'Then: LSL R2, R0, #1 gives R0 * 2',
          'Finally: ADD R0, R1, R2 gives R0 * 10',
        ],
        starterCode: `; Multiply R0 by 10 using shifts and adds only
MOV R0, #7
; TODO: Compute R0 * 10 without MUL

HALT`,
        solutionCode: `; Multiply R0 by 10 using shifts and adds only
MOV R0, #7
LSL R1, R0, #3    ; R1 = 7 * 8 = 56
LSL R2, R0, #1    ; R2 = 7 * 2 = 14
ADD R0, R1, R2    ; R0 = 56 + 14 = 70
HALT`,
        validate: (sim) => {
          const halted = checkHalted(sim);
          if (!halted.passed) return halted;
          return checkReg(sim, 0, 70);
        },
      },
      {
        id: 'bits-quiz1',
        title: 'Bitwise Quiz',
        type: 'quiz',
        question: 'What does EOR R0, R0, R0 do?',
        options: [
          'Doubles R0',
          'Sets R0 to 0 (XOR with itself)',
          'Inverts all bits of R0',
          'Does nothing',
        ],
        correctIndex: 1,
        explanation: 'XOR (EOR) of any value with itself always produces 0, because matching bits cancel out (1 XOR 1 = 0, 0 XOR 0 = 0). This is a classic trick to zero a register — it\'s one instruction and doesn\'t need an immediate value.',
      },
     ],
  },

  // ═══════════════════════════════════════════════════════════════
  //  Tutorial 8: Interrupts & Exceptions (Kernel Track)
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'interrupts-exceptions',
    title: 'Interrupts & Exceptions',
    description: 'Understand how the CPU responds to hardware interrupts, the Interrupt Vector Table, and exception handling.',
    difficulty: 'advanced',
    estimatedMinutes: 15,
    steps: [
      {
        id: 'irq-intro',
        title: 'What Are Interrupts?',
        type: 'explanation',
        content: `Interrupts are the foundation of every operating system. They allow hardware devices to **signal the CPU** that something needs attention — without the CPU constantly polling.

When an interrupt fires:
1. The CPU **saves** its current state (PC, CPSR)
2. **Switches** to a privileged processor mode (IRQ or SVC)
3. **Disables** further interrupts (sets the I bit in CPSR)
4. **Looks up** a handler address from the **Interrupt Vector Table** (IVT)
5. **Jumps** to that handler

Our simulator has these interrupt sources:

| IRQ # | Name | Trigger |
|-------|------|---------|
| 0 | RESET | CPU reset |
| 1 | UNDEFINED | Invalid instruction |
| 2 | SWI | Software interrupt (syscall) |
| 3 | PREFETCH_ABORT | Bad instruction fetch |
| 4 | DATA_ABORT | Bad memory access |
| 6 | IRQ | General hardware IRQ |
| 7 | FIQ | Fast interrupt |
| 8 | TIMER | Timer device |
| 9 | UART_RX | UART received data |

The IVT lives at address **0x0000** — the very first 64 bytes of memory. Each entry is a 4-byte word pointing to a handler function.`,
        codeExample: `; The IVT layout (16 vectors × 4 bytes = 64 bytes)
; Address 0x0000: Vector 0 (RESET)     → kernel_init
; Address 0x0004: Vector 1 (UNDEFINED) → fault_handler
; Address 0x0008: Vector 2 (SWI)       → swi_handler
; Address 0x000C: Vector 3 (PREFETCH)  → fault_handler
; Address 0x0010: Vector 4 (DATA)      → fault_handler
; ...
; Address 0x0018: Vector 6 (IRQ)       → irq_handler
; Address 0x0020: Vector 8 (TIMER)     → timer_handler

; When IRQ #8 fires, the CPU does:
;   saved_lr = PC
;   saved_cpsr = CPSR
;   CPSR mode = IRQ, I bit set
;   PC = memory[0x0000 + 8*4] = memory[0x0020]`,
      },
      {
        id: 'irq-modes',
        title: 'Processor Modes & Banked Registers',
        type: 'explanation',
        content: `Our CPU has 4 processor modes, each with its own banked SP and LR:

| Mode | Value | Purpose |
|------|-------|---------|
| **USER** | 0 | Unprivileged — normal program execution |
| **SVC** | 1 | Supervisor — kernel/syscall handling |
| **IRQ** | 2 | Interrupt — hardware interrupt handling |
| **FIQ** | 3 | Fast interrupt — high-priority interrupts |

The current mode is stored in CPSR bits [4:0]. When an interrupt occurs:
- The CPU **banks** the current SP and LR (saves them for the current mode)
- Switches to the new mode (IRQ or SVC)
- Restores the banked SP for the new mode (so each mode has its own stack!)

This means an IRQ handler runs with a **separate stack** from user code, preventing corruption.

The **I bit** (bit 7) in CPSR controls whether IRQs are enabled:
- I = 0: IRQs enabled (CPU will respond to pending interrupts)
- I = 1: IRQs disabled (CPU ignores interrupts)

The handler must **acknowledge** the interrupt by writing to the IRQ controller's ACK register (0x7028), then return with \`MOV PC, LR\`.`,
        codeExample: `; Reading CPSR to check the current mode:
MRS R0, CPSR      ; R0 = CPSR
AND R1, R0, #0x1F ; R1 = mode bits (0=USER, 1=SVC, 2=IRQ, 3=FIQ)

; Enabling IRQs (clear the I bit):
MRS R0, CPSR
BIC R0, R0, #0x80  ; Clear bit 7 (I flag)
MSR CPSR, R0

; Disabling IRQs (set the I bit):
MRS R0, CPSR
ORR R0, R0, #0x80  ; Set bit 7 (I flag)
MSR CPSR, R0`,
      },
      {
        id: 'irq-exercise1',
        title: 'Exercise: Read the IVT',
        type: 'exercise',
        instruction: `After booting the kernel, the IVT at address 0x0000 is populated with handler addresses.

**Task:** Read the SWI vector (vector #2) from the IVT and store its value in R0. The SWI vector is at address 0x0008 (vector 2 × 4 bytes).

1. Load the address 0x0008 into a register
2. Read the word at that address using LDR
3. Store the result in R0
4. HALT

The SWI handler address should be non-zero after booting (the kernel sets it up).

**Important:** Click "Boot" first before running your code, so the IVT is populated!`,
        hints: [
          'The SWI vector is at memory address 0x0008 (IRQ #2 × 4)',
          'Use MOVW to load the address: MOVW R1, #0x0008',
          'Then load the word: LDR R0, [R1]',
        ],
        starterCode: `; Read the SWI vector from the IVT
; The IVT starts at 0x0000, each vector is 4 bytes
; SWI = vector #2, so address = 2 * 4 = 0x0008
; TODO: Load the word at address 0x0008 into R0

HALT`,
        solutionCode: `; Read the SWI vector from the IVT
MOVW R1, #0x0008    ; SWI vector address
LDR R0, [R1]        ; R0 = handler address from IVT
HALT`,
        validate: (sim) => {
          const halted = checkHalted(sim);
          if (!halted.passed) return halted;
          const val = sim.cpu.getRegister(0);
          if (val !== 0) {
            return { passed: true, message: `R0 = 0x${(val >>> 0).toString(16)} — the SWI handler address. Correct!` };
          }
          return { passed: false, message: `R0 = 0. Did you boot the kernel first? The IVT is empty until you click Boot.` };
        },
      },
      {
        id: 'irq-quiz1',
        title: 'Interrupt Flow Quiz',
        type: 'quiz',
        question: 'When a hardware interrupt fires and the CPU is in USER mode, what happens FIRST?',
        options: [
          'The CPU jumps to the handler address immediately',
          'The CPU saves its state (PC, CPSR) and switches to IRQ mode',
          'The CPU finishes executing all remaining instructions',
          'The CPU resets to address 0x0000',
        ],
        correctIndex: 1,
        explanation: 'Before jumping to the handler, the CPU must save its current state — the PC (so it knows where to return) and the CPSR (so it can restore flags and mode). It banks the current mode\'s SP and LR, switches to IRQ mode, disables further IRQs, and THEN loads the handler address from the IVT.',
      },
      {
        id: 'irq-exercise2',
        title: 'Exercise: Enable IRQs',
        type: 'exercise',
        instruction: `After boot, the kernel runs in SVC mode with IRQs disabled (the I bit in CPSR is set).

**Task:** Use MRS and MSR to enable IRQs by clearing bit 7 of the CPSR.

1. Read CPSR into R0 using \`MRS R0, CPSR\`
2. Clear bit 7 using \`BIC R0, R0, #128\` (128 = 0x80 = bit 7)
3. Write it back using \`MSR CPSR, R0\`
4. Read CPSR again into R0 to verify
5. HALT

After your code runs, R0 should have bit 7 = 0. The mode bits (low 5 bits) should still show SVC mode (value 1).

**Important:** Click "Boot" first so you're in SVC mode (MSR only works in privileged modes)!`,
        hints: [
          'MRS R0, CPSR reads the status register',
          'BIC R0, R0, #128 clears bit 7 (the I flag, 0x80)',
          'MSR CPSR, R0 writes back the modified value',
        ],
        starterCode: `; Enable IRQs by clearing the I bit in CPSR
; Bit 7 (I flag) = 0x80 = 128
; TODO: Read CPSR, clear bit 7, write back, read again into R0

HALT`,
        solutionCode: `; Enable IRQs by clearing the I bit in CPSR
MRS R0, CPSR       ; Read current CPSR
BIC R0, R0, #128   ; Clear bit 7 (I flag)
MSR CPSR, R0       ; Write back
MRS R0, CPSR       ; Read again to verify
HALT`,
        validate: (sim) => {
          const halted = checkHalted(sim);
          if (!halted.passed) return halted;
          const cpsr = sim.cpu.getCPSR();
          const ibit = (cpsr >>> 7) & 1;
          if (ibit === 0) {
            return { passed: true, message: `CPSR I bit = 0 — IRQs are now enabled! Correct!` };
          }
          return { passed: false, message: `CPSR I bit is still 1 (IRQs disabled). Did you clear bit 7? BIC R0, R0, #128 clears bit 7.` };
        },
      },
      {
        id: 'irq-quiz2',
        title: 'IVT Quiz',
        type: 'quiz',
        question: 'The IVT has 16 vectors, each 4 bytes. Where would the CPU look to find the handler for IRQ #8 (Timer)?',
        options: [
          'Address 0x0008',
          'Address 0x0020',
          'Address 0x0040',
          'Address 0x7020',
        ],
        correctIndex: 1,
        explanation: 'Each IVT entry is 4 bytes (one 32-bit word). IRQ #8 is at offset 8 × 4 = 32 = 0x20. Since the IVT starts at 0x0000, the timer handler address is at 0x0020. Don\'t confuse this with 0x7020 — that\'s the IRQ controller\'s PENDING register in MMIO space!',
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  //  Tutorial 9: Syscalls Deep Dive (Kernel Track)
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'syscalls-deep',
    title: 'Syscalls Deep Dive',
    description: 'Learn how user programs communicate with the kernel through software interrupts and the syscall interface.',
    difficulty: 'advanced',
    estimatedMinutes: 15,
    steps: [
      {
        id: 'syscall-intro',
        title: 'How Syscalls Work',
        type: 'explanation',
        content: `A **syscall** (system call) is how user programs ask the kernel for services — I/O, memory, process control. Since user code can't directly access hardware (it runs in unprivileged USER mode), it must **trap** into the kernel.

The mechanism is the **SWI** (Software Interrupt) instruction:

1. User program puts arguments in **R0, R1, R2**
2. Executes \`SWI #number\` where number identifies the syscall
3. The CPU **traps**: saves PC+4 into LR, saves CPSR, switches to SVC mode
4. The kernel's SWI handler reads the syscall number and dispatches

Our kernel implements these syscalls:

| # | Name | Args | Returns |
|---|------|------|---------|
| 0 | exit | R0=code | (terminates) |
| 1 | write | R0=fd, R1=buf, R2=len | R0=bytes written |
| 2 | read | R0=fd, R1=buf, R2=len | R0=bytes read |
| 3 | yield | — | (reschedules) |
| 4 | getpid | — | R0=pid |
| 5 | sleep | R0=cycles | (sleeps) |
| 6 | brk | R0=addr | R0=new break |
| 11 | putchar | R0=char | R0=0 |
| 12 | get_time | — | R0=timer count |

The \`SWI #11\` putchar is the simplest — it writes one character to the UART serial port (which appears in the Terminal tab).`,
        codeExample: `; Print 'A' using syscall 11 (putchar)
MOV R0, #65     ; ASCII 'A'
SWI #11         ; putchar syscall

; Get current timer count using syscall 12
SWI #12         ; R0 now holds timer tick count

; Exit with code 0
MOV R0, #0
SWI #0          ; exit syscall`,
      },
      {
        id: 'syscall-exercise1',
        title: 'Exercise: Print Your Initials',
        type: 'exercise',
        instruction: `Use the **putchar** syscall (SWI #11) to print three characters followed by a newline.

**Task:** Print "CPU" followed by a newline character.
- 'C' = ASCII 67
- 'P' = ASCII 80
- 'U' = ASCII 85
- newline = ASCII 10

After printing, store the value **4** in R0 (the number of characters you printed) and HALT.

**Important:** Boot the kernel first, then assemble and run!`,
        hints: [
          'MOV R0, #67 then SWI #11 prints "C"',
          'Repeat for P (80), U (85), and newline (10)',
          'After all prints, MOV R0, #4 and HALT',
        ],
        starterCode: `; Print "CPU" + newline using putchar syscalls
; Syscall 11 = putchar: R0 = character to print
; TODO: Print C, P, U, newline
; Then set R0 = 4 (chars printed)

HALT`,
        solutionCode: `; Print "CPU" + newline using putchar syscalls
MOV R0, #67     ; 'C'
SWI #11
MOV R0, #80     ; 'P'
SWI #11
MOV R0, #85     ; 'U'
SWI #11
MOV R0, #10     ; newline
SWI #11
MOV R0, #4      ; 4 characters printed
HALT`,
        validate: (sim) => {
          const halted = checkHalted(sim);
          if (!halted.passed) return halted;
          return checkReg(sim, 0, 4);
        },
      },
      {
        id: 'syscall-trap',
        title: 'The SWI Trap Mechanism',
        type: 'explanation',
        content: `Let's look deeper at what happens when the CPU executes \`SWI #11\`:

**Step 1: CPU hardware response**
\`\`\`
saved_cpsr = CPSR           ; save current flags & mode
CPSR.mode = SVC             ; switch to supervisor mode
CPSR.I = 1                  ; disable further IRQs
LR_svc = PC + 4             ; save return address
PC = IVT[2]                 ; jump to SWI vector (address 0x0008)
\`\`\`

**Step 2: Kernel dispatch**
The kernel receives the \`cpu:swi\` event with the syscall number. It reads R0–R2 for arguments and runs the appropriate handler.

**Step 3: Return**
The SWI handler in memory is just \`MOV PC, LR\` — it returns to the instruction after the SWI. The CPU restores the previous mode.

This is exactly how **real ARM processors** work! The only difference is that our kernel's syscall dispatch happens in TypeScript (host-side), while a real kernel would have assembly-language dispatch code.

**Key insight:** SWI is a **synchronous** trap — unlike hardware IRQs, the trap happens exactly when the instruction executes, not at some unpredictable time. This makes syscalls deterministic.`,
        codeExample: `; What the CPU does internally for SWI #11:
;
; 1. bankedRegisters[USER].sp = SP
;    bankedRegisters[USER].lr = LR
;    bankedRegisters[USER].cpsr = CPSR
;
; 2. CPSR = (CPSR & ~0x1F) | SVC_MODE
;    CPSR |= 0x80   ; disable IRQs
;
; 3. LR = PC + 4    ; return address
;
; 4. PC = memory[0x0008]  ; IVT vector #2
;
; The kernel handler runs, then:
;   MOV PC, LR      ; return to caller`,
      },
      {
        id: 'syscall-exercise2',
        title: 'Exercise: Read Timer & Print Digit',
        type: 'exercise',
        instruction: `Combine two syscalls: first read the timer, then print a digit.

**Task:**
1. Call \`SWI #12\` (get_time) — this puts the timer count in R0
2. Save the timer value to R4
3. Compute R4 modulo 10 to get the last digit (the timer value varies, but we want a single digit 0–9)
4. Convert to ASCII by adding 48 (ASCII '0')
5. Print it with \`SWI #11\` (putchar)
6. Store the ASCII value you printed in R0 and HALT

The timer value depends on how many cycles have elapsed, so R0 will be some ASCII digit character (48–57). We just need R0 to be in that range.

**Important:** Boot the kernel first!`,
        hints: [
          'SWI #12 puts the timer count in R0',
          'Save it: MOV R4, R0',
          'Modulo 10: use DIV and MUL. R5 = R4 / 10, R5 = R5 * 10, R6 = R4 - R5',
          'Add 48: ADD R0, R6, #48, then SWI #11',
        ],
        starterCode: `; Read timer, extract last digit, print it
; SWI #12 = get_time (result in R0)
; SWI #11 = putchar (R0 = character)
; TODO: Read time, compute last digit, convert to ASCII, print

HALT`,
        solutionCode: `; Read timer, extract last digit, print it
SWI #12            ; R0 = timer count
MOV R4, R0         ; save timer value
; Compute R4 mod 10
MOV R5, #10
DIV R6, R4, R5     ; R6 = R4 / 10
MUL R6, R6, R5     ; R6 = (R4/10) * 10
SUB R6, R4, R6     ; R6 = R4 - R6 = last digit
ADD R0, R6, #48    ; convert to ASCII
SWI #11            ; print it
HALT`,
        validate: (sim) => {
          const halted = checkHalted(sim);
          if (!halted.passed) return halted;
          const r0 = sim.cpu.getRegister(0);
          if (r0 >= 48 && r0 <= 57) {
            return { passed: true, message: `R0 = ${r0} (ASCII '${String.fromCharCode(r0)}') — a valid digit. Correct!` };
          }
          return { passed: false, message: `R0 = ${r0}, expected an ASCII digit (48-57). Did you add 48 to convert to ASCII?` };
        },
      },
      {
        id: 'syscall-quiz1',
        title: 'Syscall Quiz',
        type: 'quiz',
        question: 'Why can\'t user-mode programs directly write to MMIO addresses (like 0x7000 for UART)?',
        options: [
          'MMIO addresses don\'t exist in user mode',
          'The MMU marks kernel pages as not user-accessible, causing a protection fault',
          'User programs can only use R0–R7, not memory',
          'The UART hardware ignores writes from user mode',
        ],
        correctIndex: 1,
        explanation: 'The MMU\'s page table marks pages below 0x4000 as not user-accessible, and MMIO space (0x7000+) is also kernel-only. If user code tries to read or write these addresses, the MMU raises a DATA_ABORT or PREFETCH_ABORT exception. This is why syscalls exist — they provide a controlled gateway for user programs to access kernel services.',
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  //  Tutorial 10: Process Scheduling (Kernel Track)
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'process-scheduling',
    title: 'Process Scheduling',
    description: 'Learn how the kernel manages multiple processes with a round-robin scheduler and context switching.',
    difficulty: 'advanced',
    estimatedMinutes: 15,
    steps: [
      {
        id: 'sched-intro',
        title: 'What Is Scheduling?',
        type: 'explanation',
        content: `A kernel's **scheduler** creates the illusion that multiple programs run simultaneously on a single CPU. It does this by rapidly switching between processes — each gets a small **time slice**.

Our kernel uses **round-robin scheduling**:
1. Each process gets equal CPU time
2. When the timer fires (every 100 cycles), the scheduler activates
3. The current process is **paused** and the next ready process **resumes**
4. This rotation continues indefinitely

**The Process Control Block (PCB)** stores everything about a paused process:
- **pid** — unique process ID (starting from 1)
- **state** — ready, running, sleeping, blocked, or terminated
- **registers[0–15]** — all 16 saved register values
- **cpsr** — saved status register (flags + mode)
- **pc, sp** — saved program counter and stack pointer
- **memoryStart/memoryEnd** — allocated memory region

When the scheduler switches from Process A to Process B:
1. Save A's registers, PC, SP, CPSR into A's PCB
2. Set A's state to "ready"
3. Load B's registers, PC, SP, CPSR from B's PCB
4. Set B's state to "running"
5. The CPU continues executing — but now it's running B's code!`,
        codeExample: `; Context switch pseudocode:
;
; schedule():
;   if current_process.state == RUNNING:
;     current_process.state = READY
;     save R0-R15, CPSR → current_process.pcb
;
;   // Wake sleeping processes
;   for each process:
;     if state == SLEEPING and currentCycle >= sleepUntil:
;       state = READY
;
;   // Find next ready process (round-robin)
;   next = find_next_ready_after(current_pid)
;
;   if next found:
;     next.state = RUNNING
;     restore R0-R15, CPSR from next.pcb
;     current_pid = next.pid`,
      },
      {
        id: 'sched-timer',
        title: 'The Timer: Heartbeat of the OS',
        type: 'explanation',
        content: `The scheduler is driven by the **timer device** — a hardware peripheral at MMIO address 0x7010.

**Timer registers:**
| Address | Register | Purpose |
|---------|----------|---------|
| 0x7010 | COUNT | Current tick count (increments each cycle) |
| 0x7014 | COMPARE | Fires interrupt when count reaches this value |
| 0x7018 | CONTROL | Bit 0: enable, Bit 1: auto-reload |

The kernel's boot code configures the timer:
\`\`\`
COMPARE = 100      ; fire every 100 cycles
CONTROL = 3        ; enabled + auto-reload
\`\`\`

Every 100 CPU cycles:
1. Timer count reaches 100 → fires **IRQ #8** (TIMER)
2. IRQ controller sets the pending bit
3. CPU detects pending IRQ (if I bit clear) → enters IRQ mode
4. CPU jumps to the IRQ handler in the IVT
5. Handler acknowledges the interrupt
6. Kernel's scheduler runs → switches to next process

This creates a **preemptive** scheduler — processes don't need to voluntarily give up the CPU. The timer **forces** a context switch. This prevents any single process from hogging the CPU.

A process CAN voluntarily yield with \`SWI #3\` (yield) or sleep with \`SWI #5\` (sleep for N cycles).`,
        codeExample: `; Configure timer for 200-cycle intervals:
MOVW R0, #0x7014   ; TIMER_COMPARE address
MOV R1, #200
STR R1, [R0]       ; compare = 200

MOVW R0, #0x7018   ; TIMER_CONTROL address
MOV R1, #3         ; enable + auto-reload
STR R1, [R0]

; Now the timer fires IRQ #8 every 200 cycles

; A process can also voluntarily yield:
SWI #3             ; yield — let another process run

; Or sleep for a specific number of cycles:
MOV R0, #500
SWI #5             ; sleep for 500 cycles`,
      },
      {
        id: 'sched-exercise1',
        title: 'Exercise: Voluntary Yield',
        type: 'exercise',
        instruction: `Write a program that demonstrates cooperative scheduling by **yielding** between iterations of a loop.

**Task:**
1. Initialize a counter R4 = 0
2. Loop 5 times:
   - Increment R4
   - Call \`SWI #3\` (yield) to let other processes run
3. After the loop, R4 should equal 5
4. Store R4 into R0 and HALT

This simulates a well-behaved process that cooperates with the scheduler. Even if no other processes exist, the yield syscall still works (the scheduler just resumes the same process).

**Important:** Boot the kernel first!`,
        hints: [
          'Initialize: MOV R4, #0',
          'Loop body: ADD R4, R4, #1 then SWI #3',
          'Compare: CMP R4, #5 then BNE loop',
          'Finally: MOV R0, R4 then HALT',
        ],
        starterCode: `; Yield between loop iterations
; SWI #3 = yield (give up CPU voluntarily)
; TODO: Loop 5 times, yielding each iteration
; Store final count in R0

HALT`,
        solutionCode: `; Yield between loop iterations
MOV R4, #0
loop:
  ADD R4, R4, #1    ; increment counter
  SWI #3            ; yield to scheduler
  CMP R4, #5
  BNE loop
MOV R0, R4          ; R0 = 5
HALT`,
        validate: (sim) => {
          const halted = checkHalted(sim);
          if (!halted.passed) return halted;
          return checkReg(sim, 0, 5);
        },
      },
      {
        id: 'sched-quiz1',
        title: 'Scheduling Quiz',
        type: 'quiz',
        question: 'In a round-robin scheduler with a 100-cycle timer, what happens if a process enters an infinite loop without any SWI instructions?',
        options: [
          'The system hangs forever — the process monopolizes the CPU',
          'The timer interrupt fires after 100 cycles and the scheduler preempts the process',
          'The CPU automatically detects the infinite loop and kills the process',
          'The kernel\'s watchdog timer triggers a reset',
        ],
        correctIndex: 1,
        explanation: 'This is the beauty of preemptive scheduling! The timer is a hardware device that fires independently of what the CPU is executing. Even if a process is stuck in an infinite loop, the timer IRQ will fire after 100 cycles, the CPU will enter the IRQ handler, and the scheduler will switch to another process. No process can monopolize the CPU (as long as IRQs are enabled).',
      },
      {
        id: 'sched-exercise2',
        title: 'Exercise: Read the Timer',
        type: 'exercise',
        instruction: `The timer count register at 0x7010 increments every CPU cycle. Read it to understand timing.

**Task:**
1. Read the timer count (address 0x7010) into R4 — this is the "start" time
2. Run a small computation loop (add 1 to R5, 10 times)
3. Read the timer count again into R6 — this is the "end" time
4. Compute the elapsed cycles: R0 = R6 - R4
5. HALT

R0 should be a positive number representing how many cycles the loop took.

**Important:** Boot the kernel first so the timer is configured!`,
        hints: [
          'MOVW R1, #0x7010 loads the timer address',
          'LDR R4, [R1] reads the current timer count',
          'After the loop, LDR R6, [R1] reads again',
          'SUB R0, R6, R4 gives elapsed cycles',
        ],
        starterCode: `; Measure how many cycles a loop takes using the timer
; Timer count register: 0x7010
; TODO: Read start time, run loop, read end time, compute difference

HALT`,
        solutionCode: `; Measure how many cycles a loop takes using the timer
MOVW R1, #0x7010   ; timer count address
LDR R4, [R1]       ; R4 = start time
; Small loop: add 1 to R5, 10 times
MOV R5, #0
MOV R3, #10
loop:
  ADD R5, R5, #1
  SUB R3, R3, #1
  CMP R3, #0
  BNE loop
LDR R6, [R1]       ; R6 = end time
SUB R0, R6, R4     ; R0 = elapsed cycles
HALT`,
        validate: (sim) => {
          const halted = checkHalted(sim);
          if (!halted.passed) return halted;
          const r0 = sim.cpu.getRegister(0);
          if (r0 > 0) {
            return { passed: true, message: `R0 = ${r0} cycles elapsed. The loop took real measurable time! Correct!` };
          }
          return { passed: false, message: `R0 = ${r0}. Expected a positive number (elapsed cycles). Did you read the timer before and after the loop?` };
        },
      },
      {
        id: 'sched-quiz2',
        title: 'Context Switch Quiz',
        type: 'quiz',
        question: 'During a context switch, which of these is NOT saved/restored for each process?',
        options: [
          'The 16 general-purpose registers (R0–R15)',
          'The CPSR (flags and mode bits)',
          'The contents of the UART transmit buffer',
          'The program counter (PC)',
        ],
        correctIndex: 2,
        explanation: 'A context switch saves and restores the CPU state per process: all 16 registers (including PC and SP) and the CPSR. I/O device state like the UART buffer is shared system-wide — it\'s not per-process. This is why I/O must be managed by the kernel, not individual processes.',
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  //  Tutorial 11: Memory Management (Kernel Track)
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'memory-management',
    title: 'Memory Management',
    description: 'Explore the MMU, page tables, memory protection, and MMIO — how the kernel controls who can access what.',
    difficulty: 'advanced',
    estimatedMinutes: 15,
    steps: [
      {
        id: 'mm-intro',
        title: 'The Memory Map',
        type: 'explanation',
        content: `Our system has **32KB of RAM** (addresses 0x0000 – 0x7FFF). The kernel carves this into distinct regions:

| Address Range | Size | Region | Access |
|---------------|------|--------|--------|
| 0x0000 – 0x003F | 64 B | **IVT** (Interrupt Vector Table) | Kernel only |
| 0x0040 – 0x3FFF | ~16 KB | **Kernel space** | Kernel only |
| 0x4000 – 0x6FFF | ~12 KB | **User space** | User + Kernel |
| 0x7000 – 0x7EFF | ~4 KB | **MMIO** (device registers) | Kernel only |
| 0x7F00 – 0x7FFF | 256 B | **Stack** (initial) | User + Kernel |

**Why separate regions?**
- Kernel code and the IVT must be protected — a buggy user program shouldn't be able to overwrite interrupt handlers!
- MMIO is kernel-only because direct hardware access from user code would be dangerous
- User programs get their own sandbox (0x4000–0x6FFF)

The **stack** starts at 0x8000 and grows **downward** (SP decreases on PUSH). The initial 256 bytes below 0x8000 provide stack space.

User programs are loaded at **0x4000** by default — this is the \`userBaseAddress\`. When you assemble and load code via the UI, it goes here.`,
        codeExample: `; Memory map visualization:
;
; 0x0000 ┌─────────────────────┐
;        │ IVT (64 bytes)      │ ← Kernel only
; 0x0040 ├─────────────────────┤
;        │ Kernel code & data  │ ← Kernel only
;        │ (~16 KB)            │
; 0x4000 ├─────────────────────┤
;        │ User space           │ ← User programs loaded here
;        │ (~12 KB)            │
; 0x7000 ├─────────────────────┤
;        │ MMIO                │ ← Device registers
;        │ (UART, Timer, IRQ,  │
;        │  Display, Storage)  │
; 0x7F00 ├─────────────────────┤
;        │ Stack (grows down)  │ ← SP starts at 0x8000
; 0x7FFF └─────────────────────┘`,
      },
      {
        id: 'mm-mmu',
        title: 'The MMU & Page Tables',
        type: 'explanation',
        content: `The **Memory Management Unit (MMU)** enforces access control using a **page table**.

**Pages:** Memory is divided into **256-byte pages** (128 pages total in 32KB). Each page has a **Page Table Entry (PTE)** with these permission bits:

| Bit | Meaning |
|-----|---------|
| **valid** | Page is present and usable |
| **readable** | Read access allowed |
| **writable** | Write access allowed |
| **executable** | Code execution allowed |
| **userAccessible** | User mode can access this page |
| **dirty** | Page has been written to |
| **accessed** | Page has been read or written |

**Key protection rule:** Pages below 0x4000 (kernel space) have \`userAccessible = false\`. If user-mode code tries to read or write kernel memory, the MMU raises a **protection fault**:
- **DATA_ABORT** (IRQ #4) for load/store faults
- **PREFETCH_ABORT** (IRQ #3) for instruction fetch faults

Our MMU uses **identity mapping** — virtual address = physical address. There's no address translation, just protection checks. This is simpler than real ARM's virtual memory but demonstrates the core concepts.

**When does the MMU check?** On every memory access in \`LDR\`/\`STR\` instructions, the CPU calls \`memory.checkAccess()\`. If it fails, the CPU raises the appropriate abort exception instead of completing the memory operation.`,
        codeExample: `; The MMU checks permissions on every memory access:
;
; LDR R0, [R1]  → MMU checks:
;   1. Is the page valid?
;   2. Is it readable?
;   3. If CPU is in USER mode, is userAccessible true?
;   → If any check fails: DATA_ABORT exception
;
; STR R0, [R1]  → MMU checks:
;   1. Is the page valid?
;   2. Is it writable?
;   3. If CPU is in USER mode, is userAccessible true?
;   → If any check fails: DATA_ABORT exception
;
; Page table initialization:
;   Pages 0-63 (0x0000-0x3FFF):  userAccessible = false (kernel)
;   Pages 64-127 (0x4000-0x7FFF): userAccessible = true (user)`,
      },
      {
        id: 'mm-exercise1',
        title: 'Exercise: Explore the Memory Map',
        type: 'exercise',
        instruction: `Write to user memory and verify it persists by reading it back.

**Task:**
1. Store the value **0xBEEF** (48879) at user memory address **0x5000**
2. Read it back from 0x5000 into R0
3. Verify R0 = 48879

This demonstrates basic memory read/write in the user space region.

Steps:
- Use MOVW to load the value 0xBEEF into a register
- Use MOVW to load the address 0x5000 into another register
- Use STR to store, then LDR to load back`,
        hints: [
          'MOVW R1, #0xBEEF loads the value (48879)',
          'MOVW R2, #0x5000 loads the address',
          'STR R1, [R2] stores the word',
          'LDR R0, [R2] reads it back',
        ],
        starterCode: `; Store and read back a value in user memory
; Address 0x5000 is in user space (safe to use)
; TODO: Store 0xBEEF at 0x5000, read it back into R0

HALT`,
        solutionCode: `; Store and read back a value in user memory
MOVW R1, #0xBEEF   ; value to store (48879)
MOVW R2, #0x5000   ; user memory address
STR R1, [R2]       ; store it
LDR R0, [R2]       ; read it back
HALT`,
        validate: (sim) => {
          const halted = checkHalted(sim);
          if (!halted.passed) return halted;
          return checkReg(sim, 0, 0xBEEF);
        },
      },
      {
        id: 'mm-mmio',
        title: 'Memory-Mapped I/O (MMIO)',
        type: 'explanation',
        content: `Instead of special I/O instructions, our CPU accesses hardware devices through **regular memory addresses** in the MMIO region (0x7000–0x7EFF). Reading and writing these addresses talks directly to device registers.

**MMIO Device Map:**

| Address | Device | Register |
|---------|--------|----------|
| **0x7000** | UART | Data (read: receive, write: transmit) |
| **0x7004** | UART | Status (bit 0: RX ready, bit 1: TX ready) |
| **0x7010** | Timer | Count (current tick count) |
| **0x7014** | Timer | Compare (interrupt fires at this count) |
| **0x7018** | Timer | Control (bit 0: enable, bit 1: auto-reload) |
| **0x7020** | IRQ Ctrl | Pending (which IRQs are waiting) |
| **0x7024** | IRQ Ctrl | Enable mask (which IRQs are active) |
| **0x7028** | IRQ Ctrl | Acknowledge (write to clear pending) |
| **0x7040** | Display | Control (bit 0: enable, bit 1: cursor) |
| **0x7100** | Display | Framebuffer start (40×20 text characters) |

When the kernel writes a byte to 0x7000 (UART_DATA), the UART device transmits it — that's how characters appear in the Terminal tab!

When the kernel reads 0x7020 (IRQ_PENDING), it gets a bitmask showing which interrupts need attention. Writing to 0x7028 (IRQ_ACK) clears those pending bits.

**This is how ALL modern hardware works** — GPUs, network cards, disk controllers all use MMIO. The CPU just sees memory addresses, but the hardware intercepts reads and writes to its address range.`,
        codeExample: `; Direct UART output via MMIO (kernel mode only!)
MOVW R1, #0x7000   ; UART data register
MOV R0, #72        ; 'H'
STR R0, [R1]       ; → transmits 'H' to terminal

; Check if UART has received data
MOVW R1, #0x7004   ; UART status register
LDR R0, [R1]       ; read status
AND R0, R0, #1     ; bit 0 = RX ready
CMP R0, #1
BEQ has_data       ; branch if data available

; Read IRQ pending register
MOVW R1, #0x7020   ; IRQ pending register
LDR R0, [R1]       ; bitmask of pending IRQs`,
      },
      {
        id: 'mm-exercise2',
        title: 'Exercise: Write to Display MMIO',
        type: 'exercise',
        instruction: `Write directly to the display framebuffer via MMIO to put a character on screen.

**Task:**
1. Enable the display by writing **3** to the display control register at **0x7040** (bit 0 = enable, bit 1 = cursor visible)
2. Write the ASCII value for **'X'** (88) to the first framebuffer cell at **0x7100**
3. Read back the value from 0x7100 into R0 to verify
4. HALT with R0 = 88

**Important:** Boot the kernel first so you're in a privileged mode (MMIO is kernel-only)! Switch to the I/O Bus tab to see the display after running.`,
        hints: [
          'MOVW R1, #0x7040 for display control register',
          'MOV R0, #3 then STR R0, [R1] enables the display',
          'MOVW R1, #0x7100 for framebuffer start',
          'MOV R0, #88 then STRB R0, [R1] writes "X" to position 0',
        ],
        starterCode: `; Write a character to the display framebuffer
; Display control: 0x7040 (write 3 to enable)
; Framebuffer: 0x7100 onwards (one byte per character)
; TODO: Enable display, write 'X' to framebuffer, read back into R0

HALT`,
        solutionCode: `; Write a character to the display framebuffer
MOVW R1, #0x7040   ; display control register
MOV R0, #3         ; enable + cursor visible
STR R0, [R1]       ; enable display
MOVW R1, #0x7100   ; framebuffer address (row 0, col 0)
MOV R0, #88        ; ASCII 'X'
STRB R0, [R1]      ; write to framebuffer
LDRB R0, [R1]      ; read back
HALT`,
        validate: (sim) => {
          const halted = checkHalted(sim);
          if (!halted.passed) return halted;
          return checkReg(sim, 0, 88);
        },
      },
      {
        id: 'mm-quiz1',
        title: 'Memory Protection Quiz',
        type: 'quiz',
        question: 'A user program at 0x4000 tries to execute LDR R0, [0x0008] (read the SWI vector from the IVT). What happens?',
        options: [
          'It succeeds — the IVT is readable by everyone',
          'The MMU raises a DATA_ABORT (IRQ #4) because address 0x0008 is in kernel-only space',
          'The CPU ignores the instruction and moves to the next one',
          'R0 is set to 0 automatically',
        ],
        correctIndex: 1,
        explanation: 'Address 0x0008 is in page 0 (0x0000–0x00FF), which has userAccessible = false. When user-mode code tries to load from it, the MMU detects a protection violation and raises a DATA_ABORT exception (IRQ #4). This prevents user programs from reading kernel data — a fundamental security boundary in every OS.',
      },
      {
        id: 'mm-quiz2',
        title: 'MMIO Quiz',
        type: 'quiz',
        question: 'Why is MMIO implemented as memory addresses rather than special I/O instructions?',
        options: [
          'It\'s slower but easier to implement in hardware',
          'Special I/O instructions would require a larger instruction set',
          'It allows devices to be accessed with regular LDR/STR instructions, simplifying the CPU design and enabling uniform memory protection',
          'There is no technical difference — it\'s purely a historical convention',
        ],
        correctIndex: 2,
        explanation: 'MMIO is elegant because the CPU doesn\'t need special I/O opcodes — it reuses LDR/STR, which means the same instruction decoder and pipeline work for both memory and devices. The MMU can also apply the same protection checks to device registers, preventing user programs from directly accessing hardware. This is why ARM (and most modern architectures) prefer MMIO over port-mapped I/O.',
      },
    ],
  },
];

// ── Progress tracking ────────────────────────────────────────────

export interface TutorialProgress {
  completedSteps: Set<string>;
  completedTutorials: Set<string>;
  quizScores: Map<string, boolean>;     // step id → answered correctly
  exerciseAttempts: Map<string, number>; // step id → attempt count
}

export function createProgress(): TutorialProgress {
  return {
    completedSteps: new Set(),
    completedTutorials: new Set(),
    quizScores: new Map(),
    exerciseAttempts: new Map(),
  };
}

// ── Persistence (localStorage) ─────────────────────────────────

const PROGRESS_KEY = 'cpu-sim-tutorial-progress';

interface SerializedProgress {
  completedSteps: string[];
  completedTutorials: string[];
  quizScores: [string, boolean][];
  exerciseAttempts: [string, number][];
}

/** Save progress to localStorage */
export function saveProgress(progress: TutorialProgress): void {
  try {
    const data: SerializedProgress = {
      completedSteps: [...progress.completedSteps],
      completedTutorials: [...progress.completedTutorials],
      quizScores: [...progress.quizScores],
      exerciseAttempts: [...progress.exerciseAttempts],
    };
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(data));
    // Notify sync layer (if auth is active)
    window.dispatchEvent(new CustomEvent('cpu-sim-data-changed'));
  } catch {
    // Silently fail if localStorage is unavailable
  }
}

/** Load progress from localStorage, returning a fresh progress if none found */
export function loadProgress(): TutorialProgress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return createProgress();

    const data: SerializedProgress = JSON.parse(raw);
    return {
      completedSteps: new Set(data.completedSteps || []),
      completedTutorials: new Set(data.completedTutorials || []),
      quizScores: new Map(data.quizScores || []),
      exerciseAttempts: new Map(data.exerciseAttempts || []),
    };
  } catch {
    return createProgress();
  }
}

/** Clear all saved progress */
export function resetProgress(): void {
  try {
    localStorage.removeItem(PROGRESS_KEY);
  } catch {
    // ignore
  }
}

/** Check if all steps in a tutorial are completed */
export function isTutorialComplete(tutorial: Tutorial, progress: TutorialProgress): boolean {
  return tutorial.steps.every(step => progress.completedSteps.has(step.id));
}

/** Get completion percentage for a tutorial */
export function getTutorialProgress(tutorial: Tutorial, progress: TutorialProgress): number {
  const completed = tutorial.steps.filter(s => progress.completedSteps.has(s.id)).length;
  return Math.round((completed / tutorial.steps.length) * 100);
}
