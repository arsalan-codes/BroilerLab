import type { SimEvent } from './types';

export interface DeviceStreamProvider {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  subscribe(listener: (e: SimEvent) => void): () => void;
  status(): 'connected' | 'disconnected' | 'error';
}

// Mock stream: generates synthetic device events locally (offline-first).
export class MockDeviceStream implements DeviceStreamProvider {
  private listeners: ((e: SimEvent) => void)[] = [];
  private timer: any = null;
  private running = false;
  status(): 'connected' | 'disconnected' | 'error' {
    return this.running ? 'connected' : 'disconnected';
  }
  async connect(): Promise<void> {
    this.running = true;
    this.timer = setInterval(() => {
      const kinds: SimEvent['kind'][] = ['rfid_read', 'meal_started', 'scale_sample', 'feed_consumed'];
      const k = kinds[Math.floor(Math.random() * kinds.length)];
      const e: SimEvent = {
        kind: k,
        ts: Date.now(),
        birdId: `B${String(Math.floor(Math.random() * 999)).padStart(3, '0')}`,
        penId: `P0${Math.floor(Math.random() * 6) + 1}`,
        text: `${k} · B${Math.floor(Math.random() * 999)}`,
        tone: k === 'rfid_miss' ? 'warn' : 'ok',
      };
      this.listeners.forEach((l) => l(e));
    }, 900);
  }
  async disconnect(): Promise<void> {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
  subscribe(listener: (e: SimEvent) => void): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter((l) => l !== listener); };
  }
}

// WebSocket stream (used when backend is available).
export class WebSocketDeviceStream implements DeviceStreamProvider {
  private ws: WebSocket | null = null;
  private listeners: ((e: SimEvent) => void)[] = [];
  constructor(private url: string) {}
  status(): 'connected' | 'disconnected' | 'error' { return this.ws?.readyState === 1 ? 'connected' : 'disconnected'; }
  async connect(): Promise<void> {
    try {
      this.ws = new WebSocket(this.url);
      this.ws.onmessage = (ev) => {
        const e = JSON.parse(ev.data) as SimEvent;
        this.listeners.forEach((l) => l(e));
      };
    } catch { /* ignore */ }
  }
  async disconnect(): Promise<void> { this.ws?.close(); this.ws = null; }
  subscribe(listener: (e: SimEvent) => void): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter((l) => l !== listener); };
  }
}
