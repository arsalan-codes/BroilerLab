// Core domain types for BroilerLab simulation
export type StrainKey = 'ross308' | 'cobb500' | 'aaplus' | 'hubbardep';

export type Lang = 'fa' | 'en';

export interface CatalogPoint {
  day: number;
  bwM: number; // male BW g
  bwF: number; // female BW g
  fiM: number; // male feed intake g/day
  fiF: number;
  fcr: number;
}

export interface StrainCatalog {
  key: StrainKey;
  name: string;
  bwHorizon: number;
  points: CatalogPoint[];
}

export type TreatmentType =
  | 'control'
  | 'probiotic'
  | 'growth'
  | 'vaccine'
  | 'lowprotein'
  | 'heat';

export interface Pen {
  id: string;
  birdCount: number;
  treatment: TreatmentType;
}

export interface Experiment {
  pens: Pen[];
  seed: number;
}

export type Sex = 'm' | 'f';

export interface Bird {
  id: string;
  penId: string;
  sex: Sex;
  treatment: TreatmentType;
  cv: number;
  eps: number;
  mPen: number;
  baseSeed: number;
}

export interface FeedingEvent {
  birdId: string;
  penId: string;
  day: number;
  mealCount: number;
  size: number;
  durationMin: number;
  startHour: number;
}

export interface DeviceRecord {
  timestamp: string;
  flock_id: string;
  bird_id: string;
  sensor_id: string;
  age_day: number;
  raw_weight_g: number;
  weight_g: number;
  feed_bin_kg: number;
  feed_delta_g: number;
  temp_c: number;
  humidity: number;
  rssi: number;
}

export interface Registration {
  id: string;
  bird_id: string;
  initial_weight_g: number;
  shamsi_date: string;
  gregorian_date: string;
  time: string;
  sensor_id: string;
  rssi: number;
}

export interface EnvironmentSnapshot {
  tempC: number;
  humidity: number;
  isDark: boolean;
  hour: number;
}

export interface Cycle {
  id: string;
  code: string;
  label: string;
  strain: StrainKey;
  active: boolean;
}

export interface ScenarioResult {
  dBw: number;
  dip: number;
  dFcr: number;
  dBusy: number;
  baseGrowth: number[];
  scnGrowth: number[];
  baseFi: number[];
  scnFi: number[];
  penRows: {
    pen: string;
    n: number;
    bwBase: number;
    bwScn: number;
    dPct: number;
    fcrBase: number;
    fcrScn: number;
    busyBase: number;
    busyScn: number;
  }[];
}

export interface ValidationRow {
  day: number;
  sim: number;
  po: number;
  dev: number;
  fiSim: number;
  fiPo: number;
  status: string;
}

export interface ValidationResult {
  rows: ValidationRow[];
  mae: number;
  fcr: number;
  finalBw: number;
  dailyIntake: number;
}

export interface StatResult {
  group: string;
  n: number;
  mean: number;
  sd: number;
  se: number;
}

export interface StatOutput {
  anovaF: number;
  anovaP: number;
  eta2: number;
  tests: {
    groupA: string;
    groupB: string;
    t: number;
    p: number;
    padj: number;
    significant: boolean;
  }[];
  groups: StatResult[];
}

export interface SimulationState {
  currentDay: number;
  currentHour: number;
  age: number;
  isRunning: boolean;
  isPaused: boolean;
  progress: number;
  simulationSpeed: number;
  selectedPen: string | null;
  selectedBird: string | null;
  activeDevice: string;
  liveEvents: SimEvent[];
  deviceRecords: DeviceRecord[];
  registrations: Registration[];
  feedBin: number;
  environment: EnvironmentSnapshot;
  generatedRows: number;
  currentScenario: ScenarioResult | null;
  currentExperiment: Experiment | null;
  currentCycle: Cycle | null;
  seed: number;
}

export type SimEventKind =
  | 'bird_entered'
  | 'rfid_read'
  | 'rfid_miss'
  | 'meal_started'
  | 'meal_middle'
  | 'meal_finished'
  | 'scale_sample'
  | 'feed_consumed'
  | 'bin_refilled'
  | 'queue_started'
  | 'queue_timeout'
  | 'environment_changed'
  | 'bird_died';

export interface SimEvent {
  kind: SimEventKind;
  ts: number;
  birdId?: string;
  penId?: string;
  text: string;
  tone?: 'ok' | 'warn' | 'bad' | 'info';
}
