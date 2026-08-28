// Station queue model: single opening/feeding point per station.
// Arrivals -> active bird -> queue -> wait time -> timeout -> saturation.
// Threshold 90s: if waiting exceeds, generate simultaneous/congestion event.
export interface StationState {
  activeBird: string | null;
  queue: string[];
  busySeconds: number; // accumulated busy time in window
  windowSeconds: number;
  threshold: number; // 90s
  saturation: number; // 0..1
}

export function newStation(): StationState {
  return {
    activeBird: null,
    queue: [],
    busySeconds: 0,
    windowSeconds: 0,
    threshold: 90,
    saturation: 0,
  };
}

export function stationTick(s: StationState, dtSec: number, arriving: number): { timeout: boolean; congestion: boolean } {
  s.windowSeconds += dtSec;
  let timeout = false;
  let congestion = false;
  if (s.activeBird) {
    s.busySeconds += dtSec;
  }
  if (arriving > 0) {
    // each arrival checks queue
    for (let i = 0; i < arriving; i++) {
      if (s.activeBird === null) {
        s.activeBird = 'bird';
      } else {
        s.queue.push('bird');
        if (s.queue.length * dtSec > s.threshold) {
          timeout = true;
          congestion = true;
          s.queue = [];
        }
      }
    }
  }
  s.saturation = Math.min(1, s.busySeconds / Math.max(1, s.windowSeconds));
  return { timeout, congestion };
}
