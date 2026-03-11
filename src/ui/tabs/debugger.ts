/**
 * Debugger Tab - Code editor, assembly view, breakpoints, stepping
 */

import type { Simulator } from '../../core/simulator.ts';
import { el, hex } from '../helpers.ts';
import { disassembleRange } from '../../assembler/assembler.ts';
import { EXAMPLES, CATEGORY_LABELS, getExamplesByCategory, type ExampleProgram } from '../../learning/examples.ts';
import { createHighlightedEditor } from '../syntax-highlight.ts';
import { loadProfile, awardExampleXP } from '../../learning/progress.ts';
import { showXPNotification } from '../xp-notification.ts';
import { createSplitter } from '../splitter.ts';
import { createCasmView, type CasmView } from '../casm-view.ts';

export function createDebuggerTab(sim: Simulator): { element: HTMLElement; update: () => void } {
  const container = el('div', { className: 'tab-content debugger-tab' });

  // Top: Code editor
  const editorSection = el('div', { className: 'section editor-section' });

  // Build example program selector
  const exampleSelect = document.createElement('select');
  exampleSelect.id = 'example-select';
  exampleSelect.className = 'example-select';
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = 'Load Example...';
  exampleSelect.appendChild(defaultOpt);

  const grouped = getExamplesByCategory();
  for (const [category, examples] of grouped) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = CATEGORY_LABELS[category];
    for (const ex of examples) {
      const opt = document.createElement('option');
      opt.value = ex.id;
      const diffIcon = ex.difficulty === 'beginner' ? '\u25CB' : ex.difficulty === 'intermediate' ? '\u25D2' : '\u25CF';
      opt.textContent = `${diffIcon} ${ex.title}`;
      optgroup.appendChild(opt);
    }
    exampleSelect.appendChild(optgroup);
  }

  // Info panel for selected example (below header, above editor)
  const exampleInfo = el('div', { className: 'example-info', id: 'example-info' });
  exampleInfo.style.display = 'none';

  const editorHeader = el('div', { className: 'section-header', children: [
    el('h3', { text: 'Code Editor', className: 'section-title' }),
    el('div', { className: 'editor-controls', children: [
      exampleSelect,
      el('select', { id: 'lang-select', children: [
        el('option', { text: 'Assembly', attrs: { value: 'asm' } }),
        el('option', { text: 'TinyC', attrs: { value: 'tinyc' } }),
      ]}),
    ]}),
  ]});

  const codeEditor = createHighlightedEditor({
    id: 'code-editor',
    value: getSampleAssembly(),
    language: 'asm',
    placeholder: '; Write assembly or TinyC code here...\n; Or select an example from the dropdown above!\n\n  MOV R0, #42\n  ADD R1, R0, #8\n  SWI #11\n  HALT',
  });
  const editor = codeEditor.textarea;

  // Handle example selection
  exampleSelect.addEventListener('change', () => {
    const id = exampleSelect.value;
    if (!id) {
      exampleInfo.style.display = 'none';
      return;
    }
    const example = EXAMPLES.find(e => e.id === id);
    if (example) {
      editor.value = example.source;
      // Switch language selector to match
      const langSelect = document.getElementById('lang-select') as HTMLSelectElement;
      if (langSelect) {
        langSelect.value = example.language;
      }
      codeEditor.setLanguage(example.language as 'asm' | 'tinyc');
      codeEditor.refresh();
      // Clean up C↔ASM view when switching to a non-TinyC example
      if (example.language !== 'tinyc') {
        destroyCasmView();
      }
      // Show info panel
      const diffLabel = example.difficulty.charAt(0).toUpperCase() + example.difficulty.slice(1);
      exampleInfo.innerHTML = '';
      exampleInfo.style.display = 'block';
      exampleInfo.appendChild(
        el('div', { className: 'example-info-content', children: [
          el('div', { className: 'example-info-header', children: [
            el('strong', { text: example.title }),
            el('span', { className: `example-difficulty diff-${example.difficulty}`, text: diffLabel }),
          ]}),
          el('div', { className: 'example-info-desc', text: example.description }),
          el('div', { className: 'example-info-concepts', children: [
            el('span', { className: 'concepts-label', text: 'Concepts: ' }),
            ...example.concepts.map(c =>
              el('span', { className: 'concept-tag', text: c })
            ),
          ]}),
        ]})
      );

      // Award XP for exploring this example
      const profile = loadProfile();
      const xpEvent = awardExampleXP(profile, example.id);
      if (xpEvent) showXPNotification(xpEvent);
    }
  });

  // Sync language selector with highlighter
  const langSelectEl = editorHeader.querySelector('#lang-select') as HTMLSelectElement;
  if (langSelectEl) {
    langSelectEl.addEventListener('change', () => {
      codeEditor.setLanguage(langSelectEl.value as 'asm' | 'tinyc');
      // Clean up C↔ASM view when switching away from TinyC
      if (langSelectEl.value !== 'tinyc') {
        destroyCasmView();
      }
    });
  }

  const editorButtons = el('div', { className: 'editor-buttons' });
  const assembleBtn = el('button', { className: 'btn btn-primary', text: 'Assemble & Load' });
  const asmOutputDisplay = el('pre', { className: 'asm-output', id: 'asm-output', text: '' });

  // Track the current C↔ASM view instance
  let activeCasmView: CasmView | null = null;
  const casmContainer = el('div', { className: 'casm-container' });
  casmContainer.style.display = 'none';

  function destroyCasmView() {
    if (activeCasmView) {
      activeCasmView.destroy();
      activeCasmView = null;
    }
    casmContainer.innerHTML = '';
    casmContainer.style.display = 'none';
    editorSection.classList.remove('casm-active');
  }

  assembleBtn.addEventListener('click', () => {
    const lang = (document.getElementById('lang-select') as HTMLSelectElement)?.value || 'asm';
    const source = editor.value;

    // Always clean up the old C↔ASM view
    destroyCasmView();

    if (lang === 'tinyc') {
      const result = sim.compileAndLoad(source);
      if (result.success) {
        // Show brief status in the output bar
        asmOutputDisplay.textContent = `Compiled successfully! ${result.assemblerResult?.binary.length || 0} bytes`;
        asmOutputDisplay.className = 'asm-output success';

        // Show interactive C↔ASM view
        activeCasmView = createCasmView({
          cSource: source,
          asmSource: result.assembly,
          sourceMap: result.sourceMap,
        });
        casmContainer.appendChild(activeCasmView.element);
        casmContainer.style.display = 'flex';
        editorSection.classList.add('casm-active');
      } else {
        asmOutputDisplay.textContent = `Errors:\n${result.errors.join('\n')}`;
        asmOutputDisplay.className = 'asm-output error';
      }
    } else {
      const result = sim.assembleAndLoad(source);
      if (result.success) {
        asmOutputDisplay.textContent = `Assembled successfully! ${result.binary.length} bytes\n\nListing:\n${result.listing}`;
        asmOutputDisplay.className = 'asm-output success';
      } else {
        asmOutputDisplay.textContent = `Errors:\n${result.errors.map(e => `Line ${e.line}: ${e.message}`).join('\n')}`;
        asmOutputDisplay.className = 'asm-output error';
      }
    }
  });

  editorButtons.appendChild(assembleBtn);
  editorSection.appendChild(editorHeader);
  editorSection.appendChild(exampleInfo);
  editorSection.appendChild(codeEditor.wrapper);
  editorSection.appendChild(editorButtons);
  editorSection.appendChild(asmOutputDisplay);
  editorSection.appendChild(casmContainer);

  // Bottom: Disassembly view
  const disasmSection = el('div', { className: 'section disasm-section' });
  const disasmTitle = el('h3', { text: 'Disassembly', className: 'section-title' });
  const disasmView = el('div', { className: 'disasm-view', id: 'disasm-view' });
  disasmSection.appendChild(disasmTitle);
  disasmSection.appendChild(disasmView);

  // Breakpoint controls
  const bpSection = el('div', { className: 'section bp-section' });
  const bpTitle = el('h3', { text: 'Breakpoints', className: 'section-title' });
  const bpList = el('div', { className: 'bp-list', id: 'bp-list' });
  const bpInput = el('div', { className: 'bp-input-row' });
  const bpAddr = document.createElement('input');
  bpAddr.type = 'text';
  bpAddr.placeholder = '0x4000';
  bpAddr.className = 'bp-addr-input';
  const bpAddBtn = el('button', { className: 'btn btn-sm', text: 'Add BP' });
  bpAddBtn.addEventListener('click', () => {
    const addr = parseInt(bpAddr.value, 16) || parseInt(bpAddr.value, 10);
    if (!isNaN(addr)) {
      sim.cpu.addBreakpoint(addr);
      bpAddr.value = '';
      update();
    }
  });
  bpInput.appendChild(bpAddr);
  bpInput.appendChild(bpAddBtn);
  bpSection.appendChild(bpTitle);
  bpSection.appendChild(bpInput);
  bpSection.appendChild(bpList);

  // Right side: disassembly + breakpoints stacked
  const rightPane = el('div', { className: 'debugger-right' });
  rightPane.appendChild(disasmSection);
  rightPane.appendChild(bpSection);

  // Use splitter: editor on left, disasm+bp on right
  const splitter = createSplitter({
    id: 'debugger-main',
    direction: 'horizontal',
    defaultSize: 50,
    minFirst: 250,
    minSecond: 200,
    first: editorSection,
    second: rightPane,
  });

  container.appendChild(splitter);

  function update() {
    // Update disassembly around PC
    const pc = sim.cpu.getPC();
    const start = Math.max(0, pc - 20);
    const entries = disassembleRange(sim.memory, start, 16);

    disasmView.innerHTML = '';
    for (const entry of entries) {
      const isCurrent = entry.address === pc;
      const isBP = sim.cpu.getBreakpoints().has(entry.address);
      const row = el('div', {
        className: `disasm-row ${isCurrent ? 'disasm-current' : ''} ${isBP ? 'disasm-bp' : ''}`,
        children: [
          el('span', { className: 'disasm-marker', text: isCurrent ? '\u25B6' : (isBP ? '\u25CF' : ' ') }),
          el('span', { className: 'disasm-addr', text: hex(entry.address, 4) }),
          el('span', { className: 'disasm-hex', text: hex(entry.word) }),
          el('span', { className: 'disasm-text', text: entry.text }),
        ],
      });
      // Click to toggle breakpoint
      row.addEventListener('click', () => {
        if (sim.cpu.getBreakpoints().has(entry.address)) {
          sim.cpu.removeBreakpoint(entry.address);
        } else {
          sim.cpu.addBreakpoint(entry.address);
        }
        update();
      });
      disasmView.appendChild(row);
    }

    // Update breakpoint list
    bpList.innerHTML = '';
    for (const addr of sim.cpu.getBreakpoints()) {
      const row = el('div', {
        className: 'bp-item',
        children: [
          el('span', { text: hex(addr, 4) }),
          el('button', {
            className: 'btn btn-sm btn-danger',
            text: '\u00D7',
            onClick: () => { sim.cpu.removeBreakpoint(addr); update(); },
          }),
        ],
      });
      bpList.appendChild(row);
    }
  }

  return { element: container, update };
}

function getSampleAssembly(): string {
  return `; ── Hello World Example ──
; Prints characters via UART (syscall 11 = putchar)

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

  ; Count from 0 to 9
  MOV R4, #0
loop:
  MOV R0, R4
  ADD R0, R0, #48   ; convert to ASCII digit
  SWI #11           ; putchar
  ADD R4, R4, #1
  CMP R4, #10
  BNE loop

  MOV R0, #10       ; newline
  SWI #11

  HALT`;
}
