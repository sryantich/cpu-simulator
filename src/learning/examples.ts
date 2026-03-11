/**
 * Example Program Library
 *
 * Curated assembly and TinyC programs organized by difficulty and topic.
 * Each program includes educational metadata: what it teaches, key concepts,
 * and line-by-line commentary in the source itself.
 */

export interface ExampleProgram {
  id: string;
  title: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  category: ExampleCategory;
  language: 'asm' | 'tinyc';
  /** Key ARM concepts demonstrated */
  concepts: string[];
  /** Source code with educational comments */
  source: string;
}

export type ExampleCategory =
  | 'basics'
  | 'arithmetic'
  | 'control-flow'
  | 'memory'
  | 'functions'
  | 'system'
  | 'algorithms'
  | 'tinyc';

export const CATEGORY_LABELS: Record<ExampleCategory, string> = {
  'basics': 'Basics',
  'arithmetic': 'Arithmetic & Logic',
  'control-flow': 'Control Flow',
  'memory': 'Memory Access',
  'functions': 'Functions & Stack',
  'system': 'System & I/O',
  'algorithms': 'Algorithms',
  'tinyc': 'TinyC Programs',
};

// ── Example Programs ─────────────────────────────────────────────

export const EXAMPLES: ExampleProgram[] = [

  // ════════════════════════════════════════════════════════════════
  //  BASICS
  // ════════════════════════════════════════════════════════════════

  {
    id: 'hello-world',
    title: 'Hello World',
    description: 'Print "Hello CPU!" to the terminal using putchar syscalls.',
    difficulty: 'beginner',
    category: 'basics',
    language: 'asm',
    concepts: ['MOV', 'SWI', 'syscalls', 'ASCII encoding'],
    source: `; ── Hello World ──────────────────────────────────
; Concepts: MOV immediate, SWI (software interrupt)
;
; SWI #11 = putchar syscall: prints the ASCII
; character in R0 to the terminal.
;
; ASCII table reminder:
;   'H'=72, 'e'=101, 'l'=108, 'o'=111
;   ' '=32, 'C'=67, 'P'=80, 'U'=85, '!'=33

start:
  MOV R0, #72       ; 'H'
  SWI #11
  MOV R0, #101      ; 'e'
  SWI #11
  MOV R0, #108      ; 'l'
  SWI #11
  MOV R0, #108      ; 'l'
  SWI #11
  MOV R0, #111      ; 'o'
  SWI #11
  MOV R0, #32       ; ' '
  SWI #11
  MOV R0, #67       ; 'C'
  SWI #11
  MOV R0, #80       ; 'P'
  SWI #11
  MOV R0, #85       ; 'U'
  SWI #11
  MOV R0, #33       ; '!'
  SWI #11
  MOV R0, #10       ; newline
  SWI #11

  HALT`,
  },

  {
    id: 'mov-basics',
    title: 'MOV & Register Basics',
    description: 'Learn to move values between registers and use immediates.',
    difficulty: 'beginner',
    category: 'basics',
    language: 'asm',
    concepts: ['MOV', 'MVN', 'registers', 'immediate values'],
    source: `; ── MOV & Register Basics ────────────────────────
; Concepts: MOV, MVN, register-to-register moves
;
; MOV Rd, #imm   - Load an immediate value into Rd
; MOV Rd, Rm     - Copy value from Rm to Rd
; MVN Rd, #imm   - Load bitwise NOT of immediate
;
; Try stepping through and watch the CPU State tab!

start:
  ; Load immediate values into registers
  MOV R0, #42        ; R0 = 42
  MOV R1, #100       ; R1 = 100
  MOV R2, #0         ; R2 = 0

  ; Copy between registers
  MOV R3, R0          ; R3 = R0 (42)
  MOV R4, R1          ; R4 = R1 (100)

  ; MVN = Move NOT (bitwise complement)
  MVN R5, #0          ; R5 = ~0 = -1 (0xFFFFFFFF)
  MVN R6, #255        ; R6 = ~255 = -256 (0xFFFFFF00)

  ; Negative numbers via immediate
  MOV R7, #-1         ; R7 = -1
  MOV R8, #-50        ; R8 = -50

  HALT

; After running, check the CPU State tab:
;   R0=42, R1=100, R2=0, R3=42, R4=100
;   R5=-1, R6=-256, R7=-1, R8=-50`,
  },

  // ════════════════════════════════════════════════════════════════
  //  ARITHMETIC & LOGIC
  // ════════════════════════════════════════════════════════════════

  {
    id: 'arithmetic',
    title: 'Arithmetic Operations',
    description: 'ADD, SUB, MUL, DIV — the core math instructions.',
    difficulty: 'beginner',
    category: 'arithmetic',
    language: 'asm',
    concepts: ['ADD', 'SUB', 'MUL', 'DIV', 'MOD', 'three-operand format'],
    source: `; ── Arithmetic Operations ────────────────────────
; Concepts: ADD, SUB, MUL, DIV, MOD
;
; ARM uses a three-operand format:
;   ADD Rd, Rn, operand2
; Meaning: Rd = Rn + operand2
;
; operand2 can be a register (Rm) or immediate (#N)

start:
  ; ── Addition ──
  MOV R0, #25
  MOV R1, #17
  ADD R2, R0, R1      ; R2 = 25 + 17 = 42
  ADD R3, R2, #8      ; R3 = 42 + 8 = 50

  ; ── Subtraction ──
  SUB R4, R3, R2      ; R4 = 50 - 42 = 8
  SUB R5, R0, #5      ; R5 = 25 - 5 = 20
  RSB R6, R0, #100    ; R6 = 100 - 25 = 75 (Reverse Sub)

  ; ── Multiplication ──
  MOV R0, #7
  MOV R1, #6
  MUL R7, R0, R1      ; R7 = 7 * 6 = 42

  ; ── Division & Modulo ──
  MOV R0, #100
  MOV R1, #7
  DIV R8, R0, R1      ; R8 = 100 / 7 = 14
  MOD R9, R0, R1      ; R9 = 100 % 7 = 2

  ; ── Print the answer (42) as ASCII ──
  MOV R0, #52         ; '4'
  SWI #11
  MOV R0, #50         ; '2'
  SWI #11
  MOV R0, #10         ; newline
  SWI #11

  HALT`,
  },

  {
    id: 'bitwise-ops',
    title: 'Bitwise Operations',
    description: 'AND, ORR, EOR, BIC, LSL, LSR, ASR — bit manipulation.',
    difficulty: 'beginner',
    category: 'arithmetic',
    language: 'asm',
    concepts: ['AND', 'ORR', 'EOR', 'BIC', 'LSL', 'LSR', 'ASR', 'bit manipulation'],
    source: `; ── Bitwise Operations ───────────────────────────
; Concepts: AND, ORR, EOR, BIC, shifts
;
; These operate on individual bits of a 32-bit word.
; Essential for: flags, masks, hardware registers,
; efficient multiplication/division by powers of 2.

start:
  MOV R0, #0xFF       ; R0 = 0b11111111 (255)
  MOV R1, #0x0F       ; R1 = 0b00001111 (15)

  ; ── AND: keep only bits that are 1 in BOTH ──
  AND R2, R0, R1      ; R2 = 0xFF & 0x0F = 0x0F (15)

  ; ── ORR: set bits that are 1 in EITHER ──
  MOV R3, #0xF0       ; R3 = 0b11110000
  ORR R4, R1, R3      ; R4 = 0x0F | 0xF0 = 0xFF (255)

  ; ── EOR: flip bits (XOR) ──
  EOR R5, R0, R1      ; R5 = 0xFF ^ 0x0F = 0xF0 (240)

  ; ── BIC: clear bits (AND NOT) ──
  BIC R6, R0, R1      ; R6 = 0xFF & ~0x0F = 0xF0 (240)

  ; ── Shifts ──
  MOV R0, #1
  LSL R7, R0, #4      ; R7 = 1 << 4 = 16 (multiply by 16)
  MOV R0, #64
  LSR R8, R0, #2      ; R8 = 64 >> 2 = 16 (unsigned divide by 4)

  ; ── Arithmetic shift (preserves sign) ──
  MOV R0, #-128
  ASR R9, R0, #2      ; R9 = -128 >> 2 = -32 (signed divide by 4)

  HALT

; Tip: Use the Memory tab's hex view to see binary values.
; LSL by N = multiply by 2^N (fast!)
; LSR by N = unsigned divide by 2^N`,
  },

  {
    id: 'flags-and-cmp',
    title: 'Flags & CMP',
    description: 'How CMP works, the NZCV flags, and the S suffix.',
    difficulty: 'beginner',
    category: 'arithmetic',
    language: 'asm',
    concepts: ['CMP', 'CMN', 'TST', 'NZCV flags', 'S suffix', 'CPSR'],
    source: `; ── Flags & CMP ──────────────────────────────────
; Concepts: NZCV flags, CMP, CMN, TST, S suffix
;
; The CPSR has four condition flags:
;   N = Negative (result bit 31 is set)
;   Z = Zero     (result is zero)
;   C = Carry    (unsigned overflow / borrow)
;   V = Overflow  (signed overflow)
;
; CMP Rn, op2  =>  computes Rn - op2, sets flags, discards result
; CMN Rn, op2  =>  computes Rn + op2, sets flags, discards result
; TST Rn, op2  =>  computes Rn & op2, sets flags, discards result
;
; The S suffix makes any instruction update flags:
;   ADDS, SUBS, etc.
;
; Watch the CPU State tab > Flags section!

start:
  ; ── CMP sets Z flag when equal ──
  MOV R0, #42
  MOV R1, #42
  CMP R0, R1          ; 42 - 42 = 0 => Z=1, C=1

  ; ── CMP with greater/less ──
  MOV R0, #100
  CMP R0, #50         ; 100 - 50 = 50 => N=0, Z=0, C=1
  CMP R0, #200        ; 100 - 200 = -100 => N=1, Z=0, C=0

  ; ── ADDS sets flags (S suffix) ──
  MOV R0, #-1
  MOV R1, #1
  ADDS R2, R0, R1     ; -1 + 1 = 0 => Z=1, C=1 (carry out)

  ; ── TST for bit testing ──
  MOV R0, #0xFF
  TST R0, #0x80       ; 0xFF & 0x80 = 0x80 != 0 => Z=0
  TST R0, #0x100      ; 0xFF & 0x100 = 0 => Z=1

  ; ── SUBS and overflow ──
  MOV R0, #0x7F       ; 127 (max positive in 8-bit)
  SUBS R1, R0, #-1    ; 127 - (-1) = 128 => V may set

  HALT

; Key takeaway: CMP is just SUB that throws away the
; result. It only updates the flags for later conditional
; instructions.`,
  },

  // ════════════════════════════════════════════════════════════════
  //  CONTROL FLOW
  // ════════════════════════════════════════════════════════════════

  {
    id: 'branches',
    title: 'Branches & Conditions',
    description: 'B, BNE, BEQ, BLT, BGT — conditional execution.',
    difficulty: 'beginner',
    category: 'control-flow',
    language: 'asm',
    concepts: ['B', 'BEQ', 'BNE', 'BLT', 'BGT', 'condition codes', 'labels'],
    source: `; ── Branches & Conditions ────────────────────────
; Concepts: B, conditional branches, labels
;
; B label     - unconditional branch (jump)
; BEQ label   - branch if Z=1 (equal)
; BNE label   - branch if Z=0 (not equal)
; BLT label   - branch if N!=V (signed less than)
; BGT label   - branch if Z=0 and N=V (signed greater)
; BLE label   - branch if Z=1 or N!=V (less or equal)
; BGE label   - branch if N=V (greater or equal)
;
; Pattern: CMP first, then conditional branch

start:
  ; ── Simple comparison and branch ──
  MOV R0, #10
  MOV R1, #20
  CMP R0, R1
  BLT r0_smaller      ; 10 < 20, so this branch is taken
  B done               ; skip (not reached)

r0_smaller:
  ; Print '<'
  MOV R0, #60         ; '<' = ASCII 60
  SWI #11
  MOV R0, #10         ; newline
  SWI #11

  ; ── Count from 0 to 4 ──
  MOV R4, #0          ; counter
count_loop:
  ; Print digit
  MOV R0, R4
  ADD R0, R0, #48     ; convert to ASCII ('0' = 48)
  SWI #11

  ADD R4, R4, #1      ; counter++
  CMP R4, #5
  BNE count_loop       ; loop while counter != 5

  MOV R0, #10         ; newline
  SWI #11

  ; ── Max of two numbers ──
  MOV R0, #37
  MOV R1, #42
  CMP R0, R1
  BGT r0_bigger
  MOV R2, R1          ; R2 = max = R1
  B done
r0_bigger:
  MOV R2, R0          ; R2 = max = R0

done:
  HALT

; Output: "<" then "01234" then newline
; R2 will contain 42 (the max)`,
  },

  {
    id: 'loops',
    title: 'Loop Patterns',
    description: 'Common loop patterns: count-up, count-down, while, do-while.',
    difficulty: 'beginner',
    category: 'control-flow',
    language: 'asm',
    concepts: ['loops', 'CMP', 'BNE', 'BGT', 'SUBS', 'count-down'],
    source: `; ── Loop Patterns ────────────────────────────────
; Concepts: while-loop, count-down, SUBS optimization
;
; Four common ARM loop patterns demonstrated below.

start:
  ; ══════════════════════════════════════════════════
  ; Pattern 1: Count-up while loop
  ;   while (R4 < 5) { ... R4++ }
  ; ══════════════════════════════════════════════════
  MOV R4, #0
while_loop:
  CMP R4, #5
  BGE while_done       ; exit when R4 >= 5
  ; Print digit
  MOV R0, R4
  ADD R0, R0, #48
  SWI #11
  ADD R4, R4, #1
  B while_loop
while_done:
  MOV R0, #32          ; space
  SWI #11

  ; ══════════════════════════════════════════════════
  ; Pattern 2: Count-down (SUBS trick)
  ;   SUBS sets Z flag when reaching 0 — no CMP needed!
  ; ══════════════════════════════════════════════════
  MOV R4, #5
countdown:
  MOV R0, R4
  ADD R0, R0, #48
  SWI #11
  SUBS R4, R4, #1      ; R4-- and set flags
  BNE countdown         ; loop while R4 != 0
  MOV R0, #32
  SWI #11

  ; ══════════════════════════════════════════════════
  ; Pattern 3: Do-while (always runs at least once)
  ; ══════════════════════════════════════════════════
  MOV R4, #65          ; 'A'
do_while:
  MOV R0, R4
  SWI #11              ; print character
  ADD R4, R4, #1
  CMP R4, #70          ; 'F' (print A-E)
  BLT do_while
  MOV R0, #32
  SWI #11

  ; ══════════════════════════════════════════════════
  ; Pattern 4: Sum 1..10 (accumulator loop)
  ; ══════════════════════════════════════════════════
  MOV R4, #1           ; counter
  MOV R5, #0           ; sum
sum_loop:
  ADD R5, R5, R4       ; sum += counter
  ADD R4, R4, #1
  CMP R4, #11
  BLT sum_loop
  ; R5 now holds 55 (1+2+...+10)

  HALT

; Output: "01234 54321 ABCDE "
; R5 = 55`,
  },

  {
    id: 'conditional-exec',
    title: 'Conditional Execution',
    description: 'ARM\'s unique feature: any instruction can be conditional.',
    difficulty: 'intermediate',
    category: 'control-flow',
    language: 'asm',
    concepts: ['conditional execution', 'MOVEQ', 'ADDNE', 'condition suffixes'],
    source: `; ── Conditional Execution ────────────────────────
; Concepts: ARM conditional instruction suffixes
;
; In ARM, ANY instruction can be made conditional by
; adding a condition suffix: MOVEQ, ADDNE, SUBGT, etc.
;
; This avoids branches and is more efficient!
;
; Instead of:
;   CMP R0, #0
;   BEQ is_zero
;   MOV R1, #1
;   B done
; is_zero:
;   MOV R1, #0
; done:
;
; You can write:
;   CMP R0, #0
;   MOVNE R1, #1     ; R1=1 if R0 != 0
;   MOVEQ R1, #0     ; R1=0 if R0 == 0

start:
  ; ── abs(R0): absolute value ──
  MOV R0, #-42
  CMP R0, #0
  RSBLT R0, R0, #0    ; if R0 < 0: R0 = 0 - R0
  ; R0 is now 42

  ; ── max(R1, R2) without branches ──
  MOV R1, #37
  MOV R2, #85
  CMP R1, R2
  MOVGE R3, R1        ; R3 = R1 if R1 >= R2
  MOVLT R3, R2        ; R3 = R2 if R1 < R2
  ; R3 = 85

  ; ── clamp(R0, 0, 100) ──
  MOV R0, #150
  CMP R0, #100
  MOVGT R0, #100      ; cap at 100
  CMP R0, #0
  MOVLT R0, #0        ; floor at 0
  ; R0 = 100

  ; ── Sign function: sgn(R0) ──
  MOV R0, #-7
  CMP R0, #0
  MOVGT R4, #1        ; positive => 1
  MOVEQ R4, #0        ; zero => 0
  MOVLT R4, #-1       ; negative => -1
  ; R4 = -1

  HALT

; Key insight: Conditional execution removes branch
; penalties and makes code shorter. It is one of ARM's
; most distinctive and powerful features.`,
  },

  // ════════════════════════════════════════════════════════════════
  //  MEMORY ACCESS
  // ════════════════════════════════════════════════════════════════

  {
    id: 'load-store',
    title: 'LDR & STR — Memory Access',
    description: 'Load and store values to/from memory using LDR/STR.',
    difficulty: 'beginner',
    category: 'memory',
    language: 'asm',
    concepts: ['LDR', 'STR', 'LDRB', 'STRB', 'addressing modes', 'base+offset'],
    source: `; ── LDR & STR ────────────────────────────────────
; Concepts: Load/Store architecture, base+offset
;
; ARM is a load/store architecture:
;   - You can ONLY do math on registers
;   - LDR loads FROM memory INTO a register
;   - STR stores FROM a register INTO memory
;
; Syntax: LDR Rd, [Rn, #offset]
;   Rn = base register (address)
;   #offset = byte offset added to base
;
; Variants:
;   LDR  / STR  = 32-bit word (4 bytes)
;   LDRH / STRH = 16-bit halfword (2 bytes)
;   LDRB / STRB = 8-bit byte

start:
  ; Use R10 as a pointer to our data area
  MOV R10, #0x100     ; data area at address 0x100

  ; ── Store values to memory ──
  MOV R0, #42
  STR R0, [R10]        ; mem[0x100] = 42 (word)
  MOV R0, #100
  STR R0, [R10, #4]    ; mem[0x104] = 100 (word)
  MOV R0, #7
  STR R0, [R10, #8]    ; mem[0x108] = 7 (word)

  ; ── Load values back ──
  LDR R1, [R10]        ; R1 = mem[0x100] = 42
  LDR R2, [R10, #4]    ; R2 = mem[0x104] = 100
  LDR R3, [R10, #8]    ; R3 = mem[0x108] = 7

  ; ── Compute sum in memory ──
  ADD R4, R1, R2
  ADD R4, R4, R3       ; R4 = 42 + 100 + 7 = 149
  STR R4, [R10, #12]   ; mem[0x10C] = 149

  ; ── Byte and halfword access ──
  MOV R0, #65          ; 'A'
  STRB R0, [R10, #16]  ; store single byte
  LDRB R5, [R10, #16]  ; R5 = 65

  MOV R0, #1000
  STRH R0, [R10, #18]  ; store halfword (2 bytes)
  LDRH R6, [R10, #18]  ; R6 = 1000

  HALT

; Check the Memory tab to see values at 0x100!
; Word = 4 bytes, Halfword = 2 bytes, Byte = 1 byte`,
  },

  {
    id: 'array-access',
    title: 'Array Access Pattern',
    description: 'Access array elements using base + index*4 addressing.',
    difficulty: 'intermediate',
    category: 'memory',
    language: 'asm',
    concepts: ['arrays', 'LSL for scaling', 'base+offset', '.word directive'],
    source: `; ── Array Access Pattern ─────────────────────────
; Concepts: Arrays in memory, index calculation
;
; An array is just consecutive memory words.
; Element address = base + index * element_size
; For 32-bit words: addr = base + index * 4
;
; ARM trick: LSL #2 = multiply by 4

start:
  ; ── Build an array [10, 20, 30, 40, 50] ──
  MOV R10, #0x100     ; array base address
  MOV R0, #10
  STR R0, [R10]        ; arr[0] = 10
  MOV R0, #20
  STR R0, [R10, #4]    ; arr[1] = 20
  MOV R0, #30
  STR R0, [R10, #8]    ; arr[2] = 30
  MOV R0, #40
  STR R0, [R10, #12]   ; arr[3] = 40
  MOV R0, #50
  STR R0, [R10, #16]   ; arr[4] = 50

  ; ── Sum all elements ──
  MOV R4, #0           ; index
  MOV R5, #0           ; sum
  MOV R6, #5           ; length
sum_loop:
  ; Calculate offset: index * 4
  LSL R7, R4, #2       ; R7 = index * 4
  ADD R7, R10, R7      ; R7 = base + offset
  LDR R0, [R7]         ; R0 = arr[index]
  ADD R5, R5, R0       ; sum += arr[index]
  ADD R4, R4, #1
  CMP R4, R6
  BLT sum_loop
  ; R5 = 10+20+30+40+50 = 150

  ; ── Find max element ──
  MOV R4, #0           ; index
  LDR R8, [R10]        ; max = arr[0]
find_max:
  LSL R7, R4, #2
  ADD R7, R10, R7
  LDR R0, [R7]
  CMP R0, R8
  MOVGT R8, R0         ; if arr[i] > max: max = arr[i]
  ADD R4, R4, #1
  CMP R4, R6
  BLT find_max
  ; R8 = 50

  HALT

; R5 = 150 (sum), R8 = 50 (max)`,
  },

  // ════════════════════════════════════════════════════════════════
  //  FUNCTIONS & STACK
  // ════════════════════════════════════════════════════════════════

  {
    id: 'function-calls',
    title: 'Function Calls (BL/BX)',
    description: 'Calling and returning from functions using BL and BX LR.',
    difficulty: 'intermediate',
    category: 'functions',
    language: 'asm',
    concepts: ['BL', 'BX LR', 'LR', 'calling convention', 'R0-R3 arguments'],
    source: `; ── Function Calls ───────────────────────────────
; Concepts: BL (Branch with Link), BX LR (return)
;
; ARM calling convention:
;   - R0-R3: function arguments (and return value in R0)
;   - LR (R14): return address (set by BL)
;   - BL label: saves PC+4 into LR, then branches
;   - BX LR: returns to caller (jumps to address in LR)

start:
  ; ── Call print_char('A') ──
  MOV R0, #65          ; argument: 'A'
  BL print_char        ; call function

  ; ── Call add(10, 32) ──
  MOV R0, #10          ; first argument
  MOV R1, #32          ; second argument
  BL add               ; R0 = add(10, 32)
  ; R0 now holds 42

  ; Print the result as '*' (ASCII 42)
  SWI #11              ; putchar(42) => '*'

  MOV R0, #10          ; newline
  SWI #11

  ; ── Call multiply(6, 7) ──
  MOV R0, #6
  MOV R1, #7
  BL multiply          ; R0 = multiply(6, 7)
  ; R0 = 42

  HALT

; ── Functions ─────────────────────────────────────

print_char:
  ; Input: R0 = character to print
  SWI #11              ; putchar syscall
  BX LR                ; return to caller

add:
  ; Input: R0, R1 — Output: R0 = R0 + R1
  ADD R0, R0, R1
  BX LR

multiply:
  ; Input: R0, R1 — Output: R0 = R0 * R1
  MUL R0, R0, R1
  BX LR`,
  },

  {
    id: 'stack-frames',
    title: 'Stack Frames & Local Variables',
    description: 'PUSH/POP, frame pointers, and nested function calls.',
    difficulty: 'intermediate',
    category: 'functions',
    language: 'asm',
    concepts: ['PUSH', 'POP', 'SP', 'FP/R11', 'stack frame', 'nested calls'],
    source: `; ── Stack Frames ─────────────────────────────────
; Concepts: PUSH/POP, stack frames, nested calls
;
; Why do we need the stack?
;   - BL saves the return address in LR
;   - But if function A calls function B, B's BL
;     overwrites LR! We must save it on the stack.
;
; Standard ARM function prologue/epilogue:
;   PUSH {R11, LR}     ; save frame pointer & return addr
;   MOV R11, SP         ; set up new frame pointer
;   ... function body ...
;   POP {R11, LR}       ; restore
;   BX LR               ; return

start:
  MOV R0, #5
  BL factorial         ; R0 = factorial(5)
  ; R0 should be 120

  ; Print result: '1','2','0'
  MOV R4, R0           ; save result
  DIV R0, R4, #100
  ADD R0, R0, #48
  SWI #11              ; print '1'
  MOD R0, R4, #100
  DIV R0, R0, #10
  ADD R0, R0, #48
  SWI #11              ; print '2'
  MOD R0, R4, #10
  ADD R0, R0, #48
  SWI #11              ; print '0'
  MOV R0, #10
  SWI #11              ; newline

  HALT

; ── Recursive Factorial ───────────────────────────
; int factorial(int n) {
;   if (n <= 1) return 1;
;   return n * factorial(n - 1);
; }
factorial:
  PUSH {R11, LR}       ; save frame pointer & return addr
  MOV R11, SP           ; new frame pointer

  CMP R0, #1
  BLE base_case

  ; Recursive case: n * factorial(n-1)
  PUSH {R0}             ; save n on stack
  SUB R0, R0, #1        ; R0 = n - 1
  BL factorial           ; R0 = factorial(n-1)
  POP {R1}              ; restore n into R1
  MUL R0, R0, R1        ; R0 = factorial(n-1) * n
  B fact_done

base_case:
  MOV R0, #1            ; return 1

fact_done:
  POP {R11, LR}
  BX LR

; Walk through with Step to see the stack grow and
; shrink as recursion happens!`,
  },

  // ════════════════════════════════════════════════════════════════
  //  SYSTEM & I/O
  // ════════════════════════════════════════════════════════════════

  {
    id: 'syscalls',
    title: 'System Calls',
    description: 'Using SWI to interact with the OS kernel.',
    difficulty: 'intermediate',
    category: 'system',
    language: 'asm',
    concepts: ['SWI', 'syscall numbers', 'putchar', 'exit', 'getpid', 'get_time'],
    source: `; ── System Calls ─────────────────────────────────
; Concepts: SWI (Software Interrupt) for syscalls
;
; SWI #N triggers a supervisor call to the kernel.
; Arguments are passed in R0-R3, return value in R0.
;
; Available syscalls:
;   SWI #0  = exit(status)      - terminate process
;   SWI #1  = write(char)       - write to UART (R0=char)
;   SWI #2  = read()            - read from UART
;   SWI #3  = yield()           - give up time slice
;   SWI #4  = getpid()          - get process ID
;   SWI #5  = sleep(ticks)      - sleep R0 ticks
;   SWI #10 = open_display()    - activate display
;   SWI #11 = put_char(char)    - print char (R0=char)
;   SWI #12 = get_time()        - get tick count

start:
  ; ── Get process ID ──
  SWI #4               ; R0 = getpid()
  MOV R4, R0           ; save PID

  ; ── Get current time ──
  SWI #12              ; R0 = get_time()
  MOV R5, R0           ; save time

  ; ── Print a message via putchar ──
  MOV R0, #80          ; 'P'
  SWI #11
  MOV R0, #73          ; 'I'
  SWI #11
  MOV R0, #68          ; 'D'
  SWI #11
  MOV R0, #58          ; ':'
  SWI #11

  ; Print PID as digit (assuming single digit)
  MOV R0, R4
  ADD R0, R0, #48      ; to ASCII
  SWI #11
  MOV R0, #10          ; newline
  SWI #11

  ; ── Exit cleanly ──
  MOV R0, #0           ; exit code 0
  SWI #0               ; exit()

  HALT                  ; fallback`,
  },

  {
    id: 'display-output',
    title: 'Display Device',
    description: 'Write to the 40x20 text-mode display via MMIO.',
    difficulty: 'advanced',
    category: 'system',
    language: 'asm',
    concepts: ['MMIO', 'display', 'framebuffer', 'MOVW/MOVT'],
    source: `; ── Display Device ───────────────────────────────
; Concepts: Memory-Mapped I/O, display framebuffer
;
; The display is a 40x20 character terminal at:
;   0x7040 = Display control register
;   0x7100 = Framebuffer start (40*20 = 800 bytes)
;
; To use it:
;   1. Write 1 to control register to enable
;   2. Write ASCII chars to framebuffer addresses
;
; Address formula: 0x7100 + row*40 + col

start:
  ; ── Enable the display ──
  MOVW R10, #0x7040    ; display control address
  MOV R0, #1
  STR R0, [R10]        ; enable display

  ; ── Write "HI!" at row 0, col 0 ──
  MOVW R10, #0x7100    ; framebuffer base
  MOV R0, #72          ; 'H'
  STRB R0, [R10]       ; position (0,0)
  MOV R0, #73          ; 'I'
  STRB R0, [R10, #1]   ; position (0,1)
  MOV R0, #33          ; '!'
  STRB R0, [R10, #2]   ; position (0,2)

  ; ── Draw a line of '=' on row 1 ──
  MOV R4, #0           ; column counter
  ADD R10, R10, #40    ; move to row 1
draw_line:
  MOV R0, #61          ; '='
  STRB R0, [R10, R4]   ; wait, no register offset...
  ; Use calculated address instead
  ADD R1, R10, R4
  STRB R0, [R1]
  ADD R4, R4, #1
  CMP R4, #40
  BLT draw_line

  ; ── Write "ARM CPU" at row 5, col 16 ──
  MOVW R10, #0x7100
  ADD R10, R10, #200   ; row 5 = 5*40
  ADD R10, R10, #16    ; col 16
  MOV R0, #65          ; 'A'
  STRB R0, [R10]
  MOV R0, #82          ; 'R'
  STRB R0, [R10, #1]
  MOV R0, #77          ; 'M'
  STRB R0, [R10, #2]
  MOV R0, #32          ; ' '
  STRB R0, [R10, #3]
  MOV R0, #67          ; 'C'
  STRB R0, [R10, #4]
  MOV R0, #80          ; 'P'
  STRB R0, [R10, #5]
  MOV R0, #85          ; 'U'
  STRB R0, [R10, #6]

  HALT

; Check the I/O Bus tab to see the display!`,
  },

  // ════════════════════════════════════════════════════════════════
  //  ALGORITHMS
  // ════════════════════════════════════════════════════════════════

  {
    id: 'fibonacci',
    title: 'Fibonacci Sequence',
    description: 'Compute Fibonacci numbers iteratively.',
    difficulty: 'intermediate',
    category: 'algorithms',
    language: 'asm',
    concepts: ['loops', 'register allocation', 'ADD', 'iterative algorithm'],
    source: `; ── Fibonacci Sequence ───────────────────────────
; Concepts: Iterative computation, register planning
;
; Fibonacci: F(0)=0, F(1)=1, F(n)=F(n-1)+F(n-2)
;
; Register plan:
;   R4 = n (how many to compute)
;   R5 = F(n-2) (two back)
;   R6 = F(n-1) (one back)
;   R7 = F(n) (current)
;   R8 = loop counter

start:
  MOV R4, #10          ; compute first 10 Fibonacci numbers

  ; ── Print F(0) = 0 ──
  MOV R5, #0           ; F(0) = 0
  MOV R0, #48          ; '0'
  SWI #11
  MOV R0, #32          ; ' '
  SWI #11

  ; ── Print F(1) = 1 ──
  MOV R6, #1           ; F(1) = 1
  MOV R0, #49          ; '1'
  SWI #11
  MOV R0, #32
  SWI #11

  ; ── Compute F(2) through F(9) ──
  MOV R8, #2           ; start from index 2
fib_loop:
  ADD R7, R5, R6       ; F(n) = F(n-2) + F(n-1)

  ; Print current Fibonacci number (single/double digit)
  CMP R7, #10
  BLT single_digit
  ; Two digits: tens and ones
  DIV R0, R7, #10
  ADD R0, R0, #48
  SWI #11
  MOD R0, R7, #10
  ADD R0, R0, #48
  SWI #11
  B print_done
single_digit:
  MOV R0, R7
  ADD R0, R0, #48
  SWI #11
print_done:
  MOV R0, #32          ; space
  SWI #11

  ; Shift: F(n-2) = F(n-1), F(n-1) = F(n)
  MOV R5, R6
  MOV R6, R7
  ADD R8, R8, #1
  CMP R8, R4
  BLT fib_loop

  MOV R0, #10          ; newline
  SWI #11

  HALT

; Output: 0 1 1 2 3 5 8 13 21 34`,
  },

  {
    id: 'bubble-sort',
    title: 'Bubble Sort',
    description: 'Sort an array in memory using the bubble sort algorithm.',
    difficulty: 'advanced',
    category: 'algorithms',
    language: 'asm',
    concepts: ['nested loops', 'array access', 'swap', 'STR/LDR', 'algorithm'],
    source: `; ── Bubble Sort ──────────────────────────────────
; Concepts: Nested loops, array swap, memory access
;
; Sorts an array of integers in ascending order.
;
; Algorithm:
;   for i = 0 to n-2:
;     for j = 0 to n-2-i:
;       if arr[j] > arr[j+1]: swap them
;
; Register plan:
;   R10 = array base address
;   R4  = outer loop counter (i)
;   R5  = inner loop counter (j)
;   R6  = array length (n)
;   R7  = temp for arr[j]
;   R8  = temp for arr[j+1]

start:
  ; ── Initialize array: [5, 3, 8, 1, 9, 2, 7, 4, 6, 0] ──
  MOV R10, #0x100      ; array base
  MOV R6, #10          ; length
  MOV R0, #5
  STR R0, [R10]
  MOV R0, #3
  STR R0, [R10, #4]
  MOV R0, #8
  STR R0, [R10, #8]
  MOV R0, #1
  STR R0, [R10, #12]
  MOV R0, #9
  STR R0, [R10, #16]
  MOV R0, #2
  STR R0, [R10, #20]
  MOV R0, #7
  STR R0, [R10, #24]
  MOV R0, #4
  STR R0, [R10, #28]
  MOV R0, #6
  STR R0, [R10, #32]
  MOV R0, #0
  STR R0, [R10, #36]

  ; ── Bubble Sort ──
  MOV R4, #0           ; i = 0
outer_loop:
  SUB R0, R6, #1
  CMP R4, R0
  BGE sort_done

  MOV R5, #0           ; j = 0
inner_loop:
  SUB R0, R6, #1
  SUB R0, R0, R4       ; n - 1 - i
  CMP R5, R0
  BGE next_outer

  ; Load arr[j] and arr[j+1]
  LSL R1, R5, #2       ; j * 4
  ADD R1, R10, R1      ; &arr[j]
  LDR R7, [R1]         ; arr[j]
  LDR R8, [R1, #4]     ; arr[j+1]

  ; Compare and swap if needed
  CMP R7, R8
  BLE no_swap
  STR R8, [R1]         ; arr[j] = arr[j+1]
  STR R7, [R1, #4]     ; arr[j+1] = arr[j]
no_swap:

  ADD R5, R5, #1
  B inner_loop

next_outer:
  ADD R4, R4, #1
  B outer_loop

sort_done:
  ; ── Print sorted array ──
  MOV R4, #0
print_loop:
  LSL R1, R4, #2
  ADD R1, R10, R1
  LDR R0, [R1]
  ADD R0, R0, #48      ; to ASCII
  SWI #11
  MOV R0, #32
  SWI #11
  ADD R4, R4, #1
  CMP R4, R6
  BLT print_loop

  MOV R0, #10
  SWI #11

  HALT

; Output: 0 1 2 3 4 5 6 7 8 9`,
  },

  {
    id: 'binary-search',
    title: 'Binary Search',
    description: 'Search a sorted array efficiently using binary search.',
    difficulty: 'advanced',
    category: 'algorithms',
    language: 'asm',
    concepts: ['binary search', 'LSR for divide-by-2', 'array access', 'algorithm'],
    source: `; ── Binary Search ────────────────────────────────
; Concepts: Divide-and-conquer, LSR for /2
;
; Search for a value in a sorted array.
; Returns index in R0, or -1 if not found.
;
; Register plan:
;   R10 = array base, R6 = target value
;   R4  = low, R5 = high, R7 = mid
;   R8  = arr[mid]

start:
  ; ── Sorted array: [2, 5, 8, 12, 16, 23, 38, 42, 56, 72] ──
  MOV R10, #0x100
  MOV R0, #2
  STR R0, [R10]
  MOV R0, #5
  STR R0, [R10, #4]
  MOV R0, #8
  STR R0, [R10, #8]
  MOV R0, #12
  STR R0, [R10, #12]
  MOV R0, #16
  STR R0, [R10, #16]
  MOV R0, #23
  STR R0, [R10, #20]
  MOV R0, #38
  STR R0, [R10, #24]
  MOV R0, #42
  STR R0, [R10, #28]
  MOV R0, #56
  STR R0, [R10, #32]
  MOV R0, #72
  STR R0, [R10, #36]

  ; ── Search for 42 ──
  MOV R6, #42          ; target
  MOV R4, #0           ; low = 0
  MOV R5, #9           ; high = 9

search_loop:
  CMP R4, R5
  BGT not_found

  ; mid = (low + high) / 2
  ADD R7, R4, R5
  LSR R7, R7, #1       ; divide by 2 using shift!

  ; Load arr[mid]
  LSL R0, R7, #2       ; mid * 4
  ADD R0, R10, R0
  LDR R8, [R0]         ; arr[mid]

  CMP R8, R6
  BEQ found
  BLT search_right
  ; arr[mid] > target: search left
  SUB R5, R7, #1       ; high = mid - 1
  B search_loop
search_right:
  ; arr[mid] < target: search right
  ADD R4, R7, #1       ; low = mid + 1
  B search_loop

found:
  MOV R0, R7           ; R0 = index
  B print_result

not_found:
  MOV R0, #-1          ; R0 = -1

print_result:
  MOV R9, R0           ; save result
  ; Print "Found at index: " or "Not found"
  CMP R9, #0
  BLT print_not_found
  MOV R0, #73          ; 'I'
  SWI #11
  MOV R0, #61          ; '='
  SWI #11
  MOV R0, R9
  ADD R0, R0, #48
  SWI #11
  B done

print_not_found:
  MOV R0, #63          ; '?'
  SWI #11

done:
  MOV R0, #10
  SWI #11
  HALT

; Output: "I=7" (42 is at index 7)`,
  },

  // ════════════════════════════════════════════════════════════════
  //  TINYC PROGRAMS
  // ════════════════════════════════════════════════════════════════

  {
    id: 'tinyc-hello',
    title: 'TinyC: Hello World',
    description: 'The simplest TinyC program — print using __syscall.',
    difficulty: 'beginner',
    category: 'tinyc',
    language: 'tinyc',
    concepts: ['TinyC', '__syscall', 'functions', 'main'],
    source: `// TinyC Hello World
// Use __syscall(11, char) to print a character

void putchar(int ch) {
  __syscall(11, ch);
}

void print(int* str) {
  int i = 0;
  while (*(str + i) != 0) {
    putchar(*(str + i));
    i = i + 1;
  }
}

int main() {
  // Print "Hi!" character by character
  putchar(72);   // 'H'
  putchar(105);  // 'i'
  putchar(33);   // '!'
  putchar(10);   // newline

  // Return value goes into R0
  return 0;
}`,
  },

  {
    id: 'tinyc-factorial',
    title: 'TinyC: Factorial',
    description: 'Recursive factorial in TinyC — see how it compiles to ARM.',
    difficulty: 'intermediate',
    category: 'tinyc',
    language: 'tinyc',
    concepts: ['TinyC', 'recursion', 'function calls', 'compiler output'],
    source: `// TinyC Factorial — Recursive
// After compiling, check the assembly output to see
// how the compiler generates PUSH/POP/BL/BX!

void putchar(int ch) {
  __syscall(11, ch);
}

void print_num(int n) {
  if (n >= 10) {
    print_num(n / 10);
  }
  putchar(48 + n % 10);
}

int factorial(int n) {
  if (n <= 1) {
    return 1;
  }
  return n * factorial(n - 1);
}

int main() {
  int i = 1;
  while (i <= 7) {
    print_num(i);
    putchar(33);     // '!'
    putchar(61);     // '='
    print_num(factorial(i));
    putchar(10);     // newline
    i = i + 1;
  }
  return 0;
}`,
  },

  {
    id: 'tinyc-fizzbuzz',
    title: 'TinyC: FizzBuzz',
    description: 'The classic FizzBuzz problem implemented in TinyC.',
    difficulty: 'intermediate',
    category: 'tinyc',
    language: 'tinyc',
    concepts: ['TinyC', 'if/else', 'modulo', 'loops', 'conditionals'],
    source: `// TinyC FizzBuzz
// Print 1-20, but:
//   Multiples of 3: print 'F' (Fizz)
//   Multiples of 5: print 'B' (Buzz)
//   Multiples of both: print 'X' (FizzBuzz)

void putchar(int ch) {
  __syscall(11, ch);
}

void print_num(int n) {
  if (n >= 10) {
    print_num(n / 10);
  }
  putchar(48 + n % 10);
}

int main() {
  int i = 1;
  while (i <= 20) {
    if (i % 15 == 0) {
      putchar(88);       // 'X' = FizzBuzz
    } else if (i % 3 == 0) {
      putchar(70);       // 'F' = Fizz
    } else if (i % 5 == 0) {
      putchar(66);       // 'B' = Buzz
    } else {
      print_num(i);
    }
    putchar(32);         // space
    i = i + 1;
  }
  putchar(10);
  return 0;
}`,
  },

  // ════════════════════════════════════════════════════════════════
  //  BARREL SHIFTER & ADVANCED INSTRUCTIONS
  // ════════════════════════════════════════════════════════════════

  {
    id: 'barrel-shifter',
    title: 'Barrel Shifter Tricks',
    description: 'Demonstrates the ARM barrel shifter — performing shifts and rotates as part of data processing instructions at zero extra cost.',
    difficulty: 'intermediate',
    category: 'arithmetic',
    language: 'asm',
    concepts: ['barrel shifter', 'LSL', 'LSR', 'ASR', 'ROR', 'RRX', 'multiply by constant'],
    source: `; ──────────────────────────────────────
; Barrel Shifter Tricks
; ──────────────────────────────────────
; ARM's barrel shifter lets you shift/rotate
; the second operand of ANY data processing
; instruction for free (same cycle).
;
; Syntax: OP Rd, Rn, Rm, <shift> #amount
; Shifts: LSL, LSR, ASR, ROR

    ; ── Setup test values ──
    MOV R0, #10           ; R0 = 10
    MOV R1, #255          ; R1 = 0xFF

    ; ── Multiply by powers of 2 ──
    ; LSL #n = multiply by 2^n
    MOV R2, R0, LSL #3    ; R2 = 10 << 3 = 80 (10 * 8)
    MOV R3, R0, LSL #1    ; R3 = 10 << 1 = 20 (10 * 2)

    ; ── Multiply by non-powers of 2 ──
    ; x * 5 = x + x * 4 = x + (x << 2)
    ADD R4, R0, R0, LSL #2  ; R4 = 10 + 10*4 = 50 (10 * 5)
    ; x * 7 = x * 8 - x = (x << 3) - x
    RSB R5, R0, R0, LSL #3  ; R5 = 10*8 - 10 = 70 (10 * 7)
    ; x * 3 = x + x * 2
    ADD R6, R0, R0, LSL #1  ; R6 = 10 + 20 = 30 (10 * 3)

    ; ── Unsigned divide by power of 2 ──
    ; LSR #n = unsigned divide by 2^n
    MOV R7, R1, LSR #4    ; R7 = 255 / 16 = 15

    ; ── Signed divide by power of 2 ──
    ; ASR #n preserves the sign bit
    MOV R8, #-100
    MOV R9, R8, ASR #2    ; R9 = -100 / 4 = -25

    ; ── Rotate (useful for byte swapping) ──
    MOVW R10, #0x1234
    MOVT R10, #0xABCD     ; R10 = 0xABCD1234
    MOV R11, R10, ROR #8  ; R11 = 0x34ABCD12 (rotate right 8)

    ; ── Bit masking with shift ──
    MOV R0, #0xFF
    AND R1, R0, R0, LSR #4  ; R1 = 0xFF & 0x0F = 0x0F

    ; ── RRX: 33-bit rotate through carry ──
    MOVS R0, #3           ; R0 = 3 (binary 11), C=0
    RRX R1, R0            ; R1 = (0<<31)|(3>>1) = 1
    RRX R2, R0            ; R2 = (0<<31)|(3>>1) = 1 (C unchanged without S)

    HALT
`,
  },

  {
    id: 'addressing-modes',
    title: 'Memory Addressing Modes',
    description: 'Demonstrates ARM addressing modes: pre-index, pre-index with writeback, post-index, and register offset with shift.',
    difficulty: 'intermediate',
    category: 'memory',
    language: 'asm',
    concepts: ['pre-index', 'post-index', 'writeback', 'register offset', 'scaled index', 'LDRSB', 'LDRSH'],
    source: `; ──────────────────────────────────────
; Memory Addressing Modes
; ──────────────────────────────────────
; ARM supports flexible addressing:
;   [Rn, #off]    pre-index (base + offset)
;   [Rn, #off]!   pre-index + writeback (Rn updated)
;   [Rn], #off    post-index (use base, then update)
;   [Rn, Rm]      register offset
;   [Rn, Rm, LSL #n]  scaled register offset

    ; ── Store test data ──
    MOV R0, #100          ; base address (in RAM)
    MOV R1, #0x41         ; 'A'
    MOV R2, #0x42         ; 'B'
    MOV R3, #0x43         ; 'C'
    MOV R4, #0x44         ; 'D'

    ; ── Pre-index (normal): store at base+offset ──
    STR R1, [R0]          ; mem[100] = 'A'
    STR R2, [R0, #4]      ; mem[104] = 'B'
    STR R3, [R0, #8]      ; mem[108] = 'C'
    STR R4, [R0, #12]     ; mem[112] = 'D'

    ; ── Pre-index with writeback (!) ──
    ; Useful for walking through arrays
    MOV R5, #100          ; R5 = start address
    LDR R6, [R5, #4]!     ; R6 = mem[104], R5 = 104
    ; Now R5 has been updated to 104
    LDR R7, [R5, #4]!     ; R7 = mem[108], R5 = 108

    ; ── Post-index: load first, then advance ──
    MOV R5, #100          ; reset to start
    LDR R8, [R5], #4      ; R8 = mem[100], then R5 = 104
    LDR R9, [R5], #4      ; R9 = mem[104], then R5 = 108

    ; ── Register offset ──
    MOV R5, #100          ; base
    MOV R6, #8            ; index = 8 bytes
    LDR R7, [R5, R6]      ; R7 = mem[100 + 8] = mem[108]

    ; ── Scaled register offset ──
    ; For word arrays: index * 4
    MOV R6, #2            ; element index 2
    LDR R8, [R5, R6, LSL #2]  ; R8 = mem[100 + 2*4] = mem[108]

    ; ── Signed loads: LDRSB/LDRSH ──
    ; Store a negative byte value
    MOV R1, #0xFE         ; -2 as unsigned byte
    STRB R1, [R0]         ; store byte at addr 100
    LDRB R2, [R0]         ; R2 = 0xFE (zero-extended = 254)
    LDRSB R3, [R0]        ; R3 = 0xFFFFFFFE (sign-extended = -2)

    ; Store a negative halfword
    MOVW R1, #0xFF00      ; -256 as unsigned halfword
    STRH R1, [R0]         ; store halfword at addr 100
    LDRH R4, [R0]         ; R4 = 0xFF00 (zero-extended = 65280)
    LDRSH R5, [R0]        ; R5 = 0xFFFFFF00 (sign-extended = -256)

    HALT
`,
  },

  {
    id: 'new-instructions',
    title: 'New ARM Instructions',
    description: 'Demonstrates TEQ, CLZ, MLA, BLX, and other advanced instructions.',
    difficulty: 'advanced',
    category: 'arithmetic',
    language: 'asm',
    concepts: ['TEQ', 'CLZ', 'MLA', 'BLX', 'MUL-accumulate', 'count leading zeros', 'indirect call'],
    source: `; ──────────────────────────────────────
; Advanced ARM Instructions
; ──────────────────────────────────────

    ; ── TEQ: Test Equivalence (XOR, flags only) ──
    ; Useful to check if two values are equal
    ; without modifying any register
    MOV R0, #42
    MOV R1, #42
    TEQ R0, R1            ; Z=1 if equal (42 XOR 42 = 0)
    BEQ teq_equal         ; branch taken!
    MOV R2, #0            ; NOT reached
    B teq_done
teq_equal:
    MOV R2, #1            ; R2 = 1 (values were equal)
teq_done:

    ; ── CLZ: Count Leading Zeros ──
    ; Returns 0-32, useful for log2, priority finding
    MOV R3, #0            ; 0 = all zeros
    CLZ R4, R3            ; R4 = 32 (all bits are zero)

    MOV R3, #1            ; 0x00000001
    CLZ R4, R3            ; R4 = 31 (31 leading zeros)

    MOV R3, #0xFF         ; 0x000000FF
    CLZ R4, R3            ; R4 = 24

    MOVW R3, #0
    MOVT R3, #0x8000      ; R3 = 0x80000000
    CLZ R4, R3            ; R4 = 0 (bit 31 is set)

    ; ── MLA: Multiply-Accumulate ──
    ; Rd = Rn * Rm + Ra
    ; Great for dot products, polynomial eval
    MOV R0, #3
    MOV R1, #4
    MOV R2, #100
    MLA R3, R0, R1, R2    ; R3 = 3 * 4 + 100 = 112

    ; Polynomial: 2x^2 + 3x + 5 where x=4
    MOV R0, #4            ; x = 4
    MOV R1, #2            ; coefficient
    MUL R2, R0, R0        ; R2 = x^2 = 16
    MUL R2, R1, R2        ; R2 = 2*x^2 = 32
    MOV R1, #3
    MLA R2, R1, R0, R2    ; R2 = 3*x + 2*x^2 = 12 + 32 = 44
    ADD R2, R2, #5        ; R2 = 44 + 5 = 49

    ; ── BLX: Indirect function call via register ──
    ; Store function address, call indirectly
    MOVW R10, #double_fn  ; load function address
    MOV R0, #21           ; argument
    BLX R10               ; call double_fn(21), LR = return addr
    ; R0 now = 42
    B done

double_fn:
    ; Simple function: return R0 * 2
    ADD R0, R0, R0
    BX LR                 ; return

done:
    HALT
`,
  },

];

/** Get examples grouped by category */
export function getExamplesByCategory(): Map<ExampleCategory, ExampleProgram[]> {
  const grouped = new Map<ExampleCategory, ExampleProgram[]>();
  for (const example of EXAMPLES) {
    const list = grouped.get(example.category) || [];
    list.push(example);
    grouped.set(example.category, list);
  }
  return grouped;
}

/** Get examples filtered by difficulty */
export function getExamplesByDifficulty(difficulty: ExampleProgram['difficulty']): ExampleProgram[] {
  return EXAMPLES.filter(e => e.difficulty === difficulty);
}

/** Get a single example by ID */
export function getExampleById(id: string): ExampleProgram | undefined {
  return EXAMPLES.find(e => e.id === id);
}
