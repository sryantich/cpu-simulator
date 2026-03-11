/**
 * Syntax Highlighting for Assembly & TinyC editors
 *
 * Uses the "transparent textarea over highlighted <pre>" technique:
 * - A <pre><code> backdrop renders colored tokens
 * - A transparent <textarea> sits on top for user input
 * - Both share identical font, padding, and line-height
 * - Scroll positions are synchronised
 */

// ── Token types ──────────────────────────────────────────────────

export type TokenType =
  | 'instruction'    // MOV, ADD, LDR, etc.
  | 'register'       // R0-R15, SP, LR, PC, CPSR
  | 'number'         // #42, 0xFF, 0b1010, plain numbers
  | 'label'          // loop:, start:
  | 'label-ref'      // label references in operands (branch targets, etc.)
  | 'directive'      // .data, .text, .word, etc.
  | 'comment'        // ; comment
  | 'string'         // "..." or '...'
  | 'shift'          // LSL, LSR, ASR, ROR (when used as shift specifiers)
  | 'condition'      // Condition suffixes (EQ, NE, etc.) — colored as part of instruction
  | 'punctuation'    // [ ] , { } ! #
  | 'keyword'        // TinyC keywords: if, else, while, return, int, void, etc.
  | 'type'           // TinyC types: int, void, char
  | 'operator'       // TinyC operators: +, -, *, /, =, ==, !=, etc.
  | 'plain';         // everything else

export interface Token {
  type: TokenType;
  text: string;
}

// ── Instruction mnemonics (our ISA) ──────────────────────────────

const INSTRUCTIONS = new Set([
  'MOV', 'MVN', 'ADD', 'SUB', 'MUL', 'DIV', 'MOD',
  'AND', 'ORR', 'EOR', 'LSL', 'LSR', 'ASR',
  'CMP', 'CMN', 'TST', 'ADC', 'SBC', 'RSB', 'BIC',
  'TEQ', 'ROR', 'RRX', 'CLZ', 'MLA',
  'LDR', 'STR', 'LDRB', 'STRB', 'LDRH', 'STRH', 'LDRSB', 'LDRSH',
  'B', 'BL', 'BX', 'BLX',
  'PUSH', 'POP',
  'SWI', 'NOP', 'HALT', 'MRS', 'MSR', 'WFI',
  'MOVW', 'MOVT',
]);

const CONDITION_SUFFIXES = new Set([
  'EQ', 'NE', 'CS', 'CC', 'MI', 'PL', 'VS', 'VC',
  'HI', 'LS', 'GE', 'LT', 'GT', 'LE', 'AL', 'NV',
  'HS', 'LO', // aliases for CS/CC
]);

const SHIFT_NAMES = new Set(['LSL', 'LSR', 'ASR', 'ROR', 'RRX']);

const REGISTERS = new Set([
  'R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7',
  'R8', 'R9', 'R10', 'R11', 'R12', 'R13', 'R14', 'R15',
  'SP', 'LR', 'PC', 'FP', 'CPSR',
]);

const DIRECTIVES = new Set([
  '.DATA', '.TEXT', '.WORD', '.BYTE', '.HALF', '.ASCIZ',
  '.ASCII', '.SPACE', '.ALIGN', '.GLOBAL', '.EXTERN',
  '.EQU', '.SET', '.SECTION',
]);

// TinyC keywords
const TINYC_KEYWORDS = new Set([
  'if', 'else', 'while', 'for', 'return', 'break', 'continue',
  'do', 'switch', 'case', 'default', 'struct', 'typedef',
  'sizeof', 'const', 'static', 'extern', 'volatile',
]);

const TINYC_TYPES = new Set([
  'int', 'void', 'char', 'short', 'long', 'unsigned', 'signed',
]);

// ── Assembly Tokenizer ───────────────────────────────────────────

export function tokenizeAssembly(source: string): Token[][] {
  const lines = source.split('\n');
  return lines.map(tokenizeAsmLine);
}

function tokenizeAsmLine(line: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < line.length) {
    // Whitespace
    if (/\s/.test(line[pos])) {
      let start = pos;
      while (pos < line.length && /\s/.test(line[pos])) pos++;
      tokens.push({ type: 'plain', text: line.slice(start, pos) });
      continue;
    }

    // Comment (rest of line)
    if (line[pos] === ';' || (line[pos] === '/' && line[pos + 1] === '/')) {
      tokens.push({ type: 'comment', text: line.slice(pos) });
      pos = line.length;
      continue;
    }

    // String literals
    if (line[pos] === '"' || line[pos] === "'") {
      const quote = line[pos];
      let end = pos + 1;
      while (end < line.length && line[end] !== quote) {
        if (line[end] === '\\') end++; // skip escaped char
        end++;
      }
      if (end < line.length) end++; // include closing quote
      tokens.push({ type: 'string', text: line.slice(pos, end) });
      pos = end;
      continue;
    }

    // Numeric: #imm or 0x... or 0b... or plain digits
    if (line[pos] === '#') {
      let end = pos + 1;
      // optional sign
      if (end < line.length && (line[end] === '-' || line[end] === '+')) end++;
      // hex, bin, or decimal
      if (end < line.length && line[end] === '0' && end + 1 < line.length && (line[end + 1] === 'x' || line[end + 1] === 'X' || line[end + 1] === 'b' || line[end + 1] === 'B')) {
        end += 2;
        while (end < line.length && /[0-9a-fA-F]/.test(line[end])) end++;
      } else {
        while (end < line.length && /[0-9]/.test(line[end])) end++;
      }
      tokens.push({ type: 'number', text: line.slice(pos, end) });
      pos = end;
      continue;
    }

    // Standalone numbers (0x..., 0b..., digits)
    if (/[0-9]/.test(line[pos])) {
      let end = pos;
      if (line[pos] === '0' && pos + 1 < line.length && (line[pos + 1] === 'x' || line[pos + 1] === 'X')) {
        end += 2;
        while (end < line.length && /[0-9a-fA-F]/.test(line[end])) end++;
      } else if (line[pos] === '0' && pos + 1 < line.length && (line[pos + 1] === 'b' || line[pos + 1] === 'B')) {
        end += 2;
        while (end < line.length && /[01]/.test(line[end])) end++;
      } else {
        while (end < line.length && /[0-9]/.test(line[end])) end++;
      }
      tokens.push({ type: 'number', text: line.slice(pos, end) });
      pos = end;
      continue;
    }

    // Punctuation: [ ] , { } !
    if ('[]{}!,'.includes(line[pos])) {
      tokens.push({ type: 'punctuation', text: line[pos] });
      pos++;
      continue;
    }

    // Words (identifiers, instructions, registers, labels)
    if (/[a-zA-Z_.]/i.test(line[pos])) {
      let end = pos;
      while (end < line.length && /[a-zA-Z0-9_.]/.test(line[end])) end++;

      const word = line.slice(pos, end);
      const upper = word.toUpperCase();

      // Check if it's a label definition (followed by ':')
      if (end < line.length && line[end] === ':') {
        tokens.push({ type: 'label', text: word + ':' });
        pos = end + 1;
        continue;
      }

      // Directive
      if (word.startsWith('.') && DIRECTIVES.has(upper)) {
        tokens.push({ type: 'directive', text: word });
        pos = end;
        continue;
      }

      // Register
      if (REGISTERS.has(upper)) {
        tokens.push({ type: 'register', text: word });
        pos = end;
        continue;
      }

      // Instruction (with optional condition suffix and S flag)
      const instrMatch = matchInstruction(upper);
      if (instrMatch) {
        tokens.push({ type: 'instruction', text: word });
        pos = end;
        continue;
      }

      // Shift specifier (LSL, LSR, ASR, ROR when appearing as operand modifier)
      if (SHIFT_NAMES.has(upper)) {
        tokens.push({ type: 'shift', text: word });
        pos = end;
        continue;
      }

      // Otherwise — could be a label reference or unknown identifier
      tokens.push({ type: 'label-ref', text: word });
      pos = end;
      continue;
    }

    // Anything else — single character
    tokens.push({ type: 'plain', text: line[pos] });
    pos++;
  }

  return tokens;
}

/**
 * Check if an uppercase word is a valid instruction mnemonic
 * (possibly with a condition suffix and/or S flag).
 * e.g. ADDEQS, MOVNE, BEQ, LDRB, etc.
 */
function matchInstruction(upper: string): boolean {
  // Direct match first
  if (INSTRUCTIONS.has(upper)) return true;

  // Try stripping trailing S (set-flags)
  let base = upper;
  if (base.endsWith('S') && base.length > 1) {
    const withoutS = base.slice(0, -1);
    if (INSTRUCTIONS.has(withoutS)) return true;
    // Try condition + S: e.g., ADDNES -> ADD + NE + S
    if (withoutS.length >= 3) {
      const cond = withoutS.slice(-2);
      const mnem = withoutS.slice(0, -2);
      if (CONDITION_SUFFIXES.has(cond) && INSTRUCTIONS.has(mnem)) return true;
    }
  }

  // Try condition suffix (last 2 chars)
  if (base.length >= 3) {
    const cond = base.slice(-2);
    const mnem = base.slice(0, -2);
    if (CONDITION_SUFFIXES.has(cond) && INSTRUCTIONS.has(mnem)) return true;
  }

  return false;
}

// ── TinyC Tokenizer ──────────────────────────────────────────────

export function tokenizeTinyC(source: string): Token[][] {
  const lines = source.split('\n');
  return lines.map(tokenizeTinyCLine);
}

function tokenizeTinyCLine(line: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < line.length) {
    // Whitespace
    if (/\s/.test(line[pos])) {
      let start = pos;
      while (pos < line.length && /\s/.test(line[pos])) pos++;
      tokens.push({ type: 'plain', text: line.slice(start, pos) });
      continue;
    }

    // Single-line comment
    if (line[pos] === '/' && line[pos + 1] === '/') {
      tokens.push({ type: 'comment', text: line.slice(pos) });
      pos = line.length;
      continue;
    }

    // Block comment start (handle as a line-level highlight, not multi-line for simplicity)
    if (line[pos] === '/' && line[pos + 1] === '*') {
      let end = line.indexOf('*/', pos + 2);
      if (end === -1) {
        tokens.push({ type: 'comment', text: line.slice(pos) });
        pos = line.length;
      } else {
        end += 2;
        tokens.push({ type: 'comment', text: line.slice(pos, end) });
        pos = end;
      }
      continue;
    }

    // String literals
    if (line[pos] === '"' || line[pos] === "'") {
      const quote = line[pos];
      let end = pos + 1;
      while (end < line.length && line[end] !== quote) {
        if (line[end] === '\\') end++;
        end++;
      }
      if (end < line.length) end++;
      tokens.push({ type: 'string', text: line.slice(pos, end) });
      pos = end;
      continue;
    }

    // Numbers
    if (/[0-9]/.test(line[pos])) {
      let end = pos;
      if (line[pos] === '0' && pos + 1 < line.length && (line[pos + 1] === 'x' || line[pos + 1] === 'X')) {
        end += 2;
        while (end < line.length && /[0-9a-fA-F]/.test(line[end])) end++;
      } else {
        while (end < line.length && /[0-9]/.test(line[end])) end++;
      }
      tokens.push({ type: 'number', text: line.slice(pos, end) });
      pos = end;
      continue;
    }

    // Multi-char operators
    const twoChar = line.slice(pos, pos + 2);
    if (['==', '!=', '<=', '>=', '&&', '||', '<<', '>>', '+=', '-=', '*=', '/=', '++', '--'].includes(twoChar)) {
      tokens.push({ type: 'operator', text: twoChar });
      pos += 2;
      continue;
    }

    // Single-char operators & punctuation
    if ('+-*/%=<>&|^!~'.includes(line[pos])) {
      tokens.push({ type: 'operator', text: line[pos] });
      pos++;
      continue;
    }

    if ('(){}[];,.'.includes(line[pos])) {
      tokens.push({ type: 'punctuation', text: line[pos] });
      pos++;
      continue;
    }

    // Preprocessor (#include, #define)
    if (line[pos] === '#') {
      let end = pos + 1;
      while (end < line.length && /[a-zA-Z]/.test(line[end])) end++;
      tokens.push({ type: 'directive', text: line.slice(pos, end) });
      pos = end;
      continue;
    }

    // Words
    if (/[a-zA-Z_]/.test(line[pos])) {
      let end = pos;
      while (end < line.length && /[a-zA-Z0-9_]/.test(line[end])) end++;

      const word = line.slice(pos, end);

      if (TINYC_KEYWORDS.has(word)) {
        tokens.push({ type: 'keyword', text: word });
      } else if (TINYC_TYPES.has(word)) {
        tokens.push({ type: 'type', text: word });
      } else {
        // Could be function name or variable — mark as plain
        tokens.push({ type: 'plain', text: word });
      }
      pos = end;
      continue;
    }

    // Anything else
    tokens.push({ type: 'plain', text: line[pos] });
    pos++;
  }

  return tokens;
}

// ── Highlighted editor component ─────────────────────────────────

export interface HighlightedEditor {
  /** The wrapper element to insert into the DOM */
  wrapper: HTMLElement;
  /** The underlying textarea (for reading/writing value) */
  textarea: HTMLTextAreaElement;
  /** Call to force a re-highlight (e.g. after setting value programmatically) */
  refresh: () => void;
  /** Set the language mode ('asm' | 'tinyc') */
  setLanguage: (lang: 'asm' | 'tinyc') => void;
}

/**
 * Create a syntax-highlighted editor that replaces a plain textarea.
 *
 * @param opts.className  Additional CSS class(es) on the wrapper
 * @param opts.id         ID for the textarea
 * @param opts.value      Initial content
 * @param opts.language   Initial language mode
 * @param opts.rows       Minimum visible rows
 * @param opts.placeholder  Placeholder text
 * @param opts.spellcheck   Whether to enable spellcheck
 */
export function createHighlightedEditor(opts: {
  className?: string;
  id?: string;
  value?: string;
  language?: 'asm' | 'tinyc';
  rows?: number;
  placeholder?: string;
  spellcheck?: boolean;
}): HighlightedEditor {
  let language = opts.language ?? 'asm';

  // Wrapper — position: relative container
  const wrapper = document.createElement('div');
  wrapper.className = `highlighted-editor${opts.className ? ' ' + opts.className : ''}`;

  // Backdrop — the <pre><code> that shows highlighted text
  const backdrop = document.createElement('pre');
  backdrop.className = 'he-backdrop';
  backdrop.setAttribute('aria-hidden', 'true');

  const highlightLayer = document.createElement('code');
  highlightLayer.className = 'he-highlight';
  backdrop.appendChild(highlightLayer);

  // Textarea — transparent, on top
  const textarea = document.createElement('textarea');
  textarea.className = 'he-textarea';
  if (opts.id) textarea.id = opts.id;
  textarea.spellcheck = opts.spellcheck ?? false;
  textarea.value = opts.value ?? '';
  if (opts.placeholder) textarea.placeholder = opts.placeholder;
  if (opts.rows) textarea.rows = opts.rows;

  wrapper.appendChild(backdrop);
  wrapper.appendChild(textarea);

  // ── Sync logic ──────────────────────────────────────────────

  function highlight() {
    const source = textarea.value;
    const tokenLines = language === 'tinyc'
      ? tokenizeTinyC(source)
      : tokenizeAssembly(source);

    // Build highlighted HTML
    const html = tokenLines.map(lineTokens => {
      if (lineTokens.length === 0) return '';
      return lineTokens.map(t => {
        const escaped = escapeHtml(t.text);
        if (t.type === 'plain') return escaped;
        return `<span class="ht-${t.type}">${escaped}</span>`;
      }).join('');
    }).join('\n');

    // Extra trailing newline ensures the backdrop is tall enough when
    // the textarea ends with a newline
    highlightLayer.innerHTML = html + '\n';
  }

  function syncScroll() {
    backdrop.scrollTop = textarea.scrollTop;
    backdrop.scrollLeft = textarea.scrollLeft;
  }

  // Debounced highlight for performance on large files
  let rafId = 0;
  function scheduleHighlight() {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(highlight);
  }

  textarea.addEventListener('input', scheduleHighlight);
  textarea.addEventListener('scroll', syncScroll);

  // Initial highlight
  highlight();

  return {
    wrapper,
    textarea,
    refresh() {
      highlight();
      syncScroll();
    },
    setLanguage(lang: 'asm' | 'tinyc') {
      language = lang;
      highlight();
    },
  };
}

// ── Utilities ────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
