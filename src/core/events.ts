/**
 * Event bus for communication between components.
 * The real hardware uses electrical signals; we use typed events.
 */

export type EventCallback = (data: unknown) => void;

export interface SimEvent {
  type: string;
  data: unknown;
  cycle: number;
  timestamp: number;
}

export class EventBus {
  private listeners = new Map<string, Set<EventCallback>>();
  private buffer: (SimEvent | null)[];
  private maxHistory: number;
  private head = 0;    // next write position
  private count = 0;   // number of events stored
  private cycle = 0;

  constructor(maxHistory = 10000) {
    this.maxHistory = maxHistory;
    this.buffer = new Array(maxHistory).fill(null);
  }

  on(event: string, callback: EventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => this.off(event, callback);
  }

  off(event: string, callback: EventCallback): void {
    this.listeners.get(event)?.delete(callback);
  }

  emit(event: string, data?: unknown): void {
    const simEvent: SimEvent = {
      type: event,
      data,
      cycle: this.cycle,
      timestamp: Date.now(),
    };
    this.buffer[this.head] = simEvent;
    this.head = (this.head + 1) % this.maxHistory;
    if (this.count < this.maxHistory) this.count++;

    this.listeners.get(event)?.forEach(cb => cb(data));
    // Wildcard listeners
    this.listeners.get('*')?.forEach(cb => cb(simEvent));
  }

  setCycle(cycle: number): void {
    this.cycle = cycle;
  }

  getHistory(filter?: string): SimEvent[] {
    const result: SimEvent[] = [];
    // Read from oldest to newest
    const start = this.count < this.maxHistory ? 0 : this.head;
    for (let i = 0; i < this.count; i++) {
      const idx = (start + i) % this.maxHistory;
      const evt = this.buffer[idx];
      if (evt) {
        if (!filter || evt.type.startsWith(filter)) {
          result.push(evt);
        }
      }
    }
    return result;
  }

  clearHistory(): void {
    this.buffer = new Array(this.maxHistory).fill(null);
    this.head = 0;
    this.count = 0;
  }

  reset(): void {
    this.clearHistory();
    this.cycle = 0;
  }
}
