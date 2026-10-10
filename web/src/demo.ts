// DEMO DATA — a simulated 3 kWp system. Not a real rooftop and not real satellite data.
// Used only when the person presses "Try with demo data", and always labelled on screen.
import type { DayReading, Irradiation } from "../../engine/diagnose.ts";

export const DEMO_SYSTEM = { kWp: 3, tilt: 25, azimuth: 0, tariff: 8, lat: 28.61, lon: 77.21 };

const sunlight = [5.3, 5.1, 4.6, 4.9, 5.2, 4.4, 4.8]; // kWh/m² on the panels, simulated
const pr = [0.8, 0.79, 0.81, 0.8, 0.78, 0.8, 0.64]; // last day deliberately low

export function demoData(dates: string[]): { readings: DayReading[]; irr: Irradiation[] } {
  return {
    readings: dates.map((date, i) => ({ date, kWh: Math.round(sunlight[i] * DEMO_SYSTEM.kWp * pr[i] * 10) / 10 })),
    irr: sunlight.map((k) => ({ kWhPerM2: k, missingDaylightHours: 0, daylightHours: 11 })),
  };
}
