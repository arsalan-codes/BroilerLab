import type { Cycle, Registration, SimEvent, StrainKey } from '../types';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://127.0.0.1:3001/api/v1';
const WS_BASE = (import.meta as any).env?.VITE_WS_BASE || 'http://127.0.0.1:3001';

function token(): string | null {
  return localStorage.getItem('broiler_token');
}

async function apiFetch(path: string, init: RequestInit = {}) {
  const t = token();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText} ${body}`);
  }
  return res.json();
}

export interface LoginResult { access_token: string; token_type: string; }

export const api = {
  base: API_BASE,
  wsBase: WS_BASE,
  async login(email: string, password: string): Promise<LoginResult> {
    return apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  },
  async listCycles(): Promise<Cycle[]> {
    return apiFetch('/cycles');
  },
  async createCycle(c: { cycle_code: string; label: string; strain: StrainKey }): Promise<Cycle> {
    return apiFetch('/cycles', { method: 'POST', body: JSON.stringify(c) });
  },
  async deleteCycle(id: string): Promise<void> {
    await apiFetch(`/cycles/${id}`, { method: 'DELETE' });
  },
  async stats(id: string): Promise<any> {
    return apiFetch(`/cycles/${id}/stats`);
  },
  async visits(id: string, limit = 50): Promise<any[]> {
    return apiFetch(`/cycles/${id}/visits?limit=${limit}`);
  },
  async registrations(id: string, limit = 50): Promise<Registration[]> {
    return apiFetch(`/cycles/${id}/registrations?limit=${limit}`);
  },
  async addRegistration(id: string, r: Partial<Registration>): Promise<Registration> {
    return apiFetch(`/cycles/${id}/registrations`, { method: 'POST', body: JSON.stringify(r) });
  },
  async ingest(id: string, batch: any): Promise<any> {
    return apiFetch(`/cycles/${id}/ingest`, { method: 'POST', body: JSON.stringify(batch) });
  },
};

// Auto-login helper for demo/seeded researcher account
export async function ensureAuth(): Promise<boolean> {
  if (token()) return true;
  try {
    const r = await api.login('researcher@lab.local', 'broilerlab123');
    localStorage.setItem('broiler_token', r.access_token);
    return true;
  } catch {
    return false;
  }
}
