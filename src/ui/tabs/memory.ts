/**
 * Memory Viewer Tab - Hex dump, heatmap, page table
 */

import type { Simulator } from '../../core/simulator.ts';
import { el, hex } from '../helpers.ts';

export function createMemoryTab(sim: Simulator): { element: HTMLElement; update: () => void } {
  const container = el('div', { className: 'tab-content memory-tab' });

  // Controls
  const controls = el('div', { className: 'memory-controls' });
  const addrInput = document.createElement('input');
  addrInput.type = 'text';
  addrInput.value = '0x0000';
  addrInput.className = 'memory-addr-input';
  addrInput.placeholder = 'Address (hex)';

  const gotoBtn = el('button', { className: 'btn btn-sm', text: 'Go' });
  const viewSelect = document.createElement('select');
  viewSelect.className = 'memory-view-select';
  viewSelect.innerHTML = '<option value="hex">Hex Dump</option><option value="heatmap">Access Heatmap</option><option value="pages">Page Table</option>';

  controls.appendChild(el('span', { text: 'Address: ' }));
  controls.appendChild(addrInput);
  controls.appendChild(gotoBtn);
  controls.appendChild(el('span', { text: ' View: ' }));
  controls.appendChild(viewSelect);

  // Memory display
  const memDisplay = el('div', { className: 'memory-display', id: 'memory-display' });

  // Memory map legend
  const legend = el('div', { className: 'memory-legend', html: `
    <span class="legend-item"><span class="legend-color" style="background:#2d3748"></span>IVT (0x0000)</span>
    <span class="legend-item"><span class="legend-color" style="background:#553c9a"></span>Kernel (0x0040)</span>
    <span class="legend-item"><span class="legend-color" style="background:#2b6cb0"></span>User (0x4000)</span>
    <span class="legend-item"><span class="legend-color" style="background:#c53030"></span>MMIO (0x7000)</span>
    <span class="legend-item"><span class="legend-color" style="background:#2f855a"></span>Stack (0x7F00)</span>
  `});

  container.appendChild(controls);
  container.appendChild(legend);
  container.appendChild(memDisplay);

  let currentAddr = 0;
  const ROWS = 16;
  const COLS = 16;

  gotoBtn.addEventListener('click', () => {
    currentAddr = parseInt(addrInput.value, 16) || parseInt(addrInput.value, 10) || 0;
    currentAddr = Math.max(0, Math.min(currentAddr, sim.config.memorySize - ROWS * COLS));
    update();
  });

  function getRegionClass(addr: number): string {
    if (addr < 0x40) return 'mem-ivt';
    if (addr < 0x4000) return 'mem-kernel';
    if (addr < 0x7000) return 'mem-user';
    if (addr < 0x7F00) return 'mem-mmio';
    return 'mem-stack';
  }

  function renderHexDump() {
    memDisplay.innerHTML = '';
    const table = el('div', { className: 'hex-dump' });

    // Header row
    const header = el('div', { className: 'hex-row hex-header' });
    header.appendChild(el('span', { className: 'hex-addr', text: 'Addr' }));
    for (let i = 0; i < COLS; i++) {
      header.appendChild(el('span', { className: 'hex-byte', text: i.toString(16).toUpperCase().padStart(2, ' ') }));
    }
    header.appendChild(el('span', { className: 'hex-ascii', text: 'ASCII' }));
    table.appendChild(header);

    const pc = sim.cpu.getPC();
    const sp = sim.cpu.getSnapshot().sp;

    // Use raw buffer to avoid triggering MMIO side effects
    const rawBytes = new Uint8Array(sim.memory.getRawBuffer());

    for (let row = 0; row < ROWS; row++) {
      const rowAddr = currentAddr + row * COLS;
      const rowEl = el('div', { className: `hex-row ${getRegionClass(rowAddr)}` });

      rowEl.appendChild(el('span', { className: 'hex-addr', text: hex(rowAddr, 4) }));

      let ascii = '';
      for (let col = 0; col < COLS; col++) {
        const addr = rowAddr + col;
        if (addr < sim.config.memorySize) {
          const byte = rawBytes[addr];
          const isPC = addr >= pc && addr < pc + 4;
          const isSP = addr >= sp && addr < sp + 4;
          const byteEl = el('span', {
            className: `hex-byte ${isPC ? 'hex-pc' : ''} ${isSP ? 'hex-sp' : ''} ${byte === 0 ? 'hex-zero' : ''}`,
            text: byte.toString(16).padStart(2, '0'),
          });
          rowEl.appendChild(byteEl);
          ascii += (byte >= 32 && byte < 127) ? String.fromCharCode(byte) : '.';
        } else {
          rowEl.appendChild(el('span', { className: 'hex-byte hex-zero', text: '--' }));
          ascii += ' ';
        }
      }

      rowEl.appendChild(el('span', { className: 'hex-ascii', text: ascii }));
      table.appendChild(rowEl);
    }

    memDisplay.appendChild(table);
  }

  function renderHeatmap() {
    memDisplay.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.className = 'memory-heatmap-canvas';
    canvas.width = 256;
    canvas.height = 128;
    memDisplay.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reads = sim.memory.getReadCounts();
    const writes = sim.memory.getWriteCounts();
    const bytesPerPixel = Math.ceil(sim.config.memorySize / (canvas.width * canvas.height));

    let maxCount = 1;
    for (let i = 0; i < reads.length; i++) {
      maxCount = Math.max(maxCount, reads[i] + writes[i]);
    }

    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const addr = (y * canvas.width + x) * bytesPerPixel;
        let readSum = 0, writeSum = 0;
        for (let i = 0; i < bytesPerPixel && addr + i < reads.length; i++) {
          readSum += reads[addr + i];
          writeSum += writes[addr + i];
        }
        const r = Math.min(255, Math.floor((writeSum / maxCount) * 255));
        const g = Math.min(255, Math.floor((readSum / maxCount) * 255));
        ctx.fillStyle = `rgb(${r},${g},0)`;
        ctx.fillRect(x, y, 1, 1);
      }
    }

    memDisplay.appendChild(el('div', { className: 'heatmap-legend', html: '<span style="color:#0f0">Green = Reads</span> | <span style="color:#f00">Red = Writes</span> | <span style="color:#ff0">Yellow = Both</span>' }));
  }

  function renderPageTable() {
    memDisplay.innerHTML = '';
    const table = el('div', { className: 'page-table-view' });
    const pages = sim.memory.getPageTable();

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const addr = i * sim.config.pageSize;
      const pageEl = el('div', {
        className: `page-entry ${page.valid ? 'page-valid' : 'page-invalid'} ${page.dirty ? 'page-dirty' : ''} ${page.accessed ? 'page-accessed' : ''} ${getRegionClass(addr)}`,
        children: [
          el('span', { className: 'page-num', text: `#${i}` }),
          el('span', { className: 'page-addr', text: hex(addr, 4) }),
          el('span', { className: 'page-flags', text: `${page.readable ? 'R' : '-'}${page.writable ? 'W' : '-'}${page.executable ? 'X' : '-'}${page.userAccessible ? 'U' : 'K'}` }),
          el('span', { className: 'page-status', text: `${page.accessed ? 'A' : '.'}${page.dirty ? 'D' : '.'}` }),
        ],
      });
      table.appendChild(pageEl);
    }

    memDisplay.appendChild(table);
  }

  viewSelect.addEventListener('change', update);

  function update() {
    const view = viewSelect.value;
    switch (view) {
      case 'hex': renderHexDump(); break;
      case 'heatmap': renderHeatmap(); break;
      case 'pages': renderPageTable(); break;
    }
  }

  return { element: container, update };
}
