/**
 * I/O Bus Tab - Visualize UART, Timer, IRQ, Display, Storage activity
 */

import type { Simulator } from '../../core/simulator.ts';
import { el, hex } from '../helpers.ts';
import { IRQ, MMIO } from '../../core/cpu-config.ts';

export function createIOTab(sim: Simulator): { element: HTMLElement; update: () => void } {
  const container = el('div', { className: 'tab-content io-tab' });

  // UART section
  const uartSection = el('div', { className: 'section io-device' });
  uartSection.appendChild(el('h3', { text: 'UART (Serial)', className: 'section-title' }));
  const uartStatus = el('div', { className: 'io-status', id: 'uart-status' });
  uartSection.appendChild(uartStatus);

  // Timer section
  const timerSection = el('div', { className: 'section io-device' });
  timerSection.appendChild(el('h3', { text: 'Timer', className: 'section-title' }));
  const timerStatus = el('div', { className: 'io-status', id: 'timer-status' });
  timerSection.appendChild(timerStatus);

  // IRQ Controller section
  const irqSection = el('div', { className: 'section io-device' });
  irqSection.appendChild(el('h3', { text: 'Interrupt Controller', className: 'section-title' }));
  const irqStatus = el('div', { className: 'io-status', id: 'irq-status' });
  irqSection.appendChild(irqStatus);

  // Display section
  const displaySection = el('div', { className: 'section io-device' });
  displaySection.appendChild(el('h3', { text: 'Display (Text Mode)', className: 'section-title' }));
  const displayView = el('pre', { className: 'display-view', id: 'display-view' });
  displaySection.appendChild(displayView);

  // Storage section
  const storageSection = el('div', { className: 'section io-device' });
  storageSection.appendChild(el('h3', { text: 'Storage (4MB)', className: 'section-title' }));
  const storageStatus = el('div', { className: 'io-status', id: 'storage-status' });
  storageSection.appendChild(storageStatus);

  // Bus activity log
  const busSection = el('div', { className: 'section' });
  busSection.appendChild(el('h3', { text: 'Bus Activity', className: 'section-title' }));
  const busLog = el('div', { className: 'bus-log', id: 'bus-log' });
  busSection.appendChild(busLog);

  container.appendChild(uartSection);
  container.appendChild(timerSection);
  container.appendChild(irqSection);
  container.appendChild(displaySection);
  container.appendChild(storageSection);
  container.appendChild(busSection);

  // Track bus events
  const busEvents: { type: string; detail: string; cycle: number }[] = [];
  const busEventTypes = ['mmio:read', 'mmio:write', 'irq:raise', 'irq:ack', 'storage:read_start', 'storage:write_start', 'storage:complete'];

  for (const type of busEventTypes) {
    sim.bus.on(type, (data) => {
      const detail = JSON.stringify(data).substring(0, 60);
      busEvents.push({ type, detail, cycle: sim.cpu.getCycle() });
      if (busEvents.length > 50) busEvents.shift();
    });
  }

  const IRQ_NAMES: Record<number, string> = {
    [IRQ.RESET]: 'RESET', [IRQ.UNDEFINED]: 'UNDEF', [IRQ.SWI]: 'SWI',
    [IRQ.PREFETCH_ABORT]: 'P_ABORT', [IRQ.DATA_ABORT]: 'D_ABORT',
    [IRQ.IRQ]: 'IRQ', [IRQ.FIQ]: 'FIQ', [IRQ.TIMER]: 'TIMER',
    [IRQ.UART_RX]: 'UART_RX', [IRQ.UART_TX]: 'UART_TX',
    [IRQ.STORAGE]: 'STORAGE', [IRQ.KEYBOARD]: 'KEYBOARD',
  };

  function update() {
    // UART status
    const uartHasData = sim.uart.hasData();
    uartStatus.innerHTML = '';
    uartStatus.appendChild(el('div', { className: 'io-field', children: [
      el('span', { text: 'RX Buffer: ' }),
      el('span', { className: uartHasData ? 'io-active' : 'io-inactive', text: uartHasData ? 'DATA READY' : 'empty' }),
    ]}));
    uartStatus.appendChild(el('div', { className: 'io-field', children: [
      el('span', { text: `Address: ${hex(MMIO.UART_BASE, 4)} - ${hex(MMIO.UART_CONTROL, 4)}` }),
    ]}));

    // Timer status
    const timerState = sim.timer.getState();
    timerStatus.innerHTML = '';
    timerStatus.appendChild(el('div', { className: 'io-field', children: [
      el('span', { text: 'Enabled: ' }),
      el('span', { className: timerState.enabled ? 'io-active' : 'io-inactive', text: timerState.enabled ? 'YES' : 'NO' }),
    ]}));
    timerStatus.appendChild(el('div', { className: 'io-field', children: [
      el('span', { text: `Count: ${timerState.count} / Compare: ${timerState.compare}` }),
    ]}));
    if (timerState.enabled && timerState.compare > 0) {
      const pct = Math.min(100, (timerState.count / timerState.compare) * 100);
      timerStatus.appendChild(el('div', { className: 'progress-bar', children: [
        el('div', { className: 'progress-fill', style: { width: `${pct}%` } }),
      ]}));
    }
    timerStatus.appendChild(el('div', { className: 'io-field', children: [
      el('span', { text: `Auto-reload: ${timerState.autoReload ? 'YES' : 'NO'}` }),
    ]}));

    // IRQ Controller status
    const irqState = sim.irqController.getState();
    irqStatus.innerHTML = '';
    for (let i = 0; i < 13; i++) {
      const pending = !!(irqState.pending & (1 << i));
      const enabled = !!(irqState.enableMask & (1 << i));
      if (enabled || pending) {
        irqStatus.appendChild(el('div', {
          className: `irq-line ${pending ? 'irq-pending' : ''} ${enabled ? 'irq-enabled' : 'irq-disabled'}`,
          children: [
            el('span', { className: 'irq-name', text: IRQ_NAMES[i] || `IRQ${i}` }),
            el('span', { className: 'irq-state', text: pending ? 'PENDING' : (enabled ? 'enabled' : 'disabled') }),
          ],
        }));
      }
    }
    if (irqStatus.children.length === 0) {
      irqStatus.appendChild(el('span', { className: 'io-inactive', text: '(no active interrupts)' }));
    }

    // Display
    const dispState = sim.display.getState();
    if (dispState.enabled) {
      const text = sim.display.getText();
      displayView.textContent = text;
      displayView.className = 'display-view display-active';
    } else {
      displayView.textContent = '(display disabled)';
      displayView.className = 'display-view display-inactive';
    }

    // Storage
    storageStatus.innerHTML = '';
    storageStatus.appendChild(el('div', { className: 'io-field', children: [
      el('span', { text: `Total: ${sim.storage.totalBlocks} blocks (${(sim.config.storageSize / 1024 / 1024).toFixed(1)} MB)` }),
    ]}));

    // Bus log
    busLog.innerHTML = '';
    for (const evt of busEvents.slice(-15).reverse()) {
      busLog.appendChild(el('div', {
        className: 'bus-event',
        children: [
          el('span', { className: 'bus-cycle', text: `@${evt.cycle}` }),
          el('span', { className: `bus-type bus-${evt.type.split(':')[0]}`, text: evt.type }),
          el('span', { className: 'bus-detail', text: evt.detail }),
        ],
      }));
    }
  }

  return { element: container, update };
}
