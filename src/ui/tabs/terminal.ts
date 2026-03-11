/**
 * Terminal Tab - UART-connected terminal emulator
 */

import type { Simulator } from '../../core/simulator.ts';
import { el } from '../helpers.ts';

export function createTerminalTab(sim: Simulator): { element: HTMLElement; update: () => void } {
  let outputLines: string[] = [];
  let currentLine = '';

  const container = el('div', { className: 'tab-content terminal-tab' });

  // Description header
  const desc = el('div', { className: 'tab-description', children: [
    'UART Serial Console — sequential character output from your program via ',
    el('code', { text: 'SWI #11' }),
    ' (putchar). This is a serial stream, not a framebuffer. ',
    'For 2D random-access display, see the Display device in the I/O Bus tab.',
  ] });
  container.appendChild(desc);

  const output = el('pre', {
    className: 'terminal-output',
    id: 'terminal-output',
  });

  const inputRow = el('div', { className: 'terminal-input-row' });
  const prompt = el('span', { className: 'terminal-prompt', text: '> ' });
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'terminal-input';
  input.placeholder = 'Type here (Enter to send)';
  input.spellcheck = false;

  inputRow.appendChild(prompt);
  inputRow.appendChild(input);
  container.appendChild(output);
  container.appendChild(inputRow);

  // Handle UART transmit (CPU -> terminal)
  sim.bus.on('uart:tx', (data) => {
    const { byte } = data as { byte: number; char: string };
    const ch = String.fromCharCode(byte);
    if (ch === '\n') {
      outputLines.push(currentLine);
      currentLine = '';
      if (outputLines.length > 500) outputLines.shift();
    } else if (byte === 13) {
      // CR - ignore
    } else if (byte === 8) {
      // Backspace
      currentLine = currentLine.slice(0, -1);
    } else {
      currentLine += ch;
    }
    // Always update DOM so output is visible when user switches to terminal tab
    update();
  });

  // Clear terminal on reset
  sim.bus.on('sim:reset', () => {
    outputLines = [];
    currentLine = '';
    update();
  });

  // Handle keyboard input -> UART
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const text = input.value;
      input.value = '';
      // Send each character to UART
      for (let i = 0; i < text.length; i++) {
        sim.uart.receiveChar(text.charCodeAt(i));
      }
      sim.uart.receiveChar(10); // newline
    }
  });

  function update() {
    const text = outputLines.join('\n') + (currentLine ? '\n' + currentLine : '');
    if (text) {
      output.textContent = text;
      output.className = 'terminal-output';
    } else {
      output.textContent = 'No output yet. Run a program that uses SWI #11 (putchar) to see output here.';
      output.className = 'terminal-output terminal-empty';
    }
    output.scrollTop = output.scrollHeight;
  }

  return { element: container, update };
}
