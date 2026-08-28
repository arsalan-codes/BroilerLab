// Environment: 18L:6D lighting regime; temperature/humidity daily cycle.
import type { EnvironmentSnapshot } from '../types';

const LIGHT_HOURS = 18;
const DARK_HOURS = 6;

export function envAt(hour: number, age: number): EnvironmentSnapshot {
  const isDark = hour >= LIGHT_HOURS; // 18..24 dark
  // base temp 22C, slight diurnal swing; heat wave handled externally
  const tempC = 22 + 3 * Math.sin((hour / 24) * 2 * Math.PI) - (isDark ? 1.5 : 0);
  const humidity = 58 + 6 * Math.cos((hour / 24) * 2 * Math.PI);
  return {
    tempC: Math.round(tempC * 10) / 10,
    humidity: Math.round(humidity),
    isDark,
    hour,
  };
}

export const LIGHTING = { LIGHT_HOURS, DARK_HOURS };
