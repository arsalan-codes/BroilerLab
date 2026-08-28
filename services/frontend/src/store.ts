import { create } from 'zustand';
import type { Cycle, Experiment, Lang, ScenarioResult, SimEvent, SimulationState, StrainKey } from './types';
import { STRAINS } from './engine/strains';

const THEME_KEY = 'rossim_theme';
const LANG_KEY = 'rossim_lang';

export interface AppState {
  lang: Lang;
  theme: 'dark' | 'light';
  strain: StrainKey;
  cycles: Cycle[];
  activeCycle: Cycle | null;
  experiment: Experiment | null;
  sim: SimulationState;
  scenario: ScenarioResult | null;
  toasts: { id: number; msg: string; kind: 'ok' | 'warn' | 'bad' | 'info' }[];
  // actions
  setLang: (l: Lang) => void;
  toggleLang: () => void;
  setTheme: (t: 'dark' | 'light') => void;
  toggleTheme: () => void;
  setStrain: (s: StrainKey) => void;
  addCycle: (c: Cycle) => void;
  removeCycle: (id: string) => void;
  setActiveCycle: (id: string) => void;
  setExperiment: (e: Experiment) => void;
  setScenario: (s: ScenarioResult | null) => void;
  pushEvent: (e: SimEvent) => void;
  setSim: (patch: Partial<SimulationState>) => void;
  resetCycleData: () => void;
  toast: (msg: string, kind?: 'ok' | 'warn' | 'bad' | 'info') => void;
  dismissToast: (id: number) => void;
}

function loadTheme(): 'dark' | 'light' {
  const v = localStorage.getItem(THEME_KEY);
  return v === 'light' ? 'light' : 'dark';
}
function loadLang(): Lang {
  const v = localStorage.getItem(LANG_KEY);
  return v === 'en' ? 'en' : 'fa';
}

const defaultExp: Experiment = {
  pens: [
    { id: 'P01', birdCount: 12, treatment: 'control' },
    { id: 'P02', birdCount: 12, treatment: 'probiotic' },
    { id: 'P03', birdCount: 12, treatment: 'growth' },
    { id: 'P04', birdCount: 12, treatment: 'vaccine' },
    { id: 'P05', birdCount: 12, treatment: 'lowprotein' },
    { id: 'P06', birdCount: 12, treatment: 'heat' },
  ],
  seed: 308,
};

export const useStore = create<AppState>((set, get) => ({
  lang: loadLang(),
  theme: loadTheme(),
  strain: 'ross308',
  cycles: [],
  activeCycle: null,
  experiment: defaultExp,
  sim: {
    currentDay: 15,
    currentHour: 8,
    age: 15,
    isRunning: false,
    isPaused: false,
    progress: 0,
    simulationSpeed: 4,
    selectedPen: null,
    selectedBird: null,
    activeDevice: 'rfid',
    liveEvents: [],
    deviceRecords: [],
    registrations: [],
    feedBin: 25,
    environment: { tempC: 22, humidity: 58, isDark: false, hour: 8 },
    generatedRows: 0,
    currentScenario: null,
    currentExperiment: null,
    currentCycle: null,
    seed: 308,
  },
  scenario: null,
  toasts: [],
  setLang: (l) => { localStorage.setItem(LANG_KEY, l); set({ lang: l }); document.documentElement.setAttribute('dir', l === 'fa' ? 'rtl' : 'ltr'); },
  toggleLang: () => { const l = get().lang === 'fa' ? 'en' : 'fa'; get().setLang(l); },
  setTheme: (t) => { localStorage.setItem(THEME_KEY, t); set({ theme: t }); document.documentElement.setAttribute('data-theme', t); },
  toggleTheme: () => { const t = get().theme === 'dark' ? 'light' : 'dark'; get().setTheme(t); },
  setStrain: (s) => set({ strain: s }),
  addCycle: (c) => set((st) => ({ cycles: [...st.cycles, c], activeCycle: c })),
  removeCycle: (id) => set((st) => ({ cycles: st.cycles.filter((c) => c.id !== id), activeCycle: st.activeCycle?.id === id ? null : st.activeCycle })),
  setActiveCycle: (id) => set((st) => ({ activeCycle: st.cycles.find((c) => c.id === id) ?? null })),
  setExperiment: (e) => set({ experiment: e }),
  setScenario: (s) => set({ scenario: s }),
  pushEvent: (e) => set((st) => ({ sim: { ...st.sim, liveEvents: [e, ...st.sim.liveEvents].slice(0, 60) } })),
  setSim: (patch) => set((st) => ({ sim: { ...st.sim, ...patch } })),
  resetCycleData: () => set((st) => ({
    sim: { ...st.sim, liveEvents: [], deviceRecords: [], registrations: [], generatedRows: 0, isRunning: false, progress: 0, currentDay: 15 },
  })),
  toast: (msg, kind = 'info') => { const id = Date.now() + Math.random(); set((st) => ({ toasts: [...st.toasts, { id, msg, kind }] })); setTimeout(() => get().dismissToast(id), 3200); },
  dismissToast: (id) => set((st) => ({ toasts: st.toasts.filter((x) => x.id !== id) })),
}));

// init DOM attrs
if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('dir', loadLang() === 'fa' ? 'rtl' : 'ltr');
  document.documentElement.setAttribute('data-theme', loadTheme());
}
