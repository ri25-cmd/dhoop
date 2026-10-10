// REAL response from the Open-Meteo Satellite Radiation API, retrieved 10 Oct 2026 19:47 IST.
// Request: latitude=28.61, longitude=77.21, hourly=shortwave_radiation,global_tilted_irradiance,
//          tilt=28, azimuth=0, past_days=2, timezone=Asia/Kolkata
// Grid cell returned: 28.576448, 77.18678. Units W/m², preceding-hour means, labels in IST.
// Transcribed from the raw JSON; daylight values are listed per day, all other hours were 0.0.
import type { HourlySeries } from "../diagnose.ts";

const days = ["2026-10-08", "2026-10-09", "2026-10-10"];
// Values for labels 07:00..19:00 (hour ending), per day.
const GTI = [
  [0, 76.0, 255.5, 457.5, 656.6, 783.4, 755.2, 718.9, 627.5, 485.0, 308.8, 123.6, 7.7],
  [0, 75.6, 247.9, 229.0, 482.1, 744.6, 806.9, 763.5, 660.5, 486.7, 289.3, 113.0, 7.7],
  [0, 50.7, 214.3, 413.8, 615.6, 799.7, 831.7, 699.9, 588.9, 309.5, 182.2, 113.2, 6.9],
];
const GHI = [
  [1.0, 68.0, 229.0, 409.0, 578.0, 688.0, 669.0, 640.0, 557.0, 431.0, 273.0, 110.0, 7.0],
  [1.0, 67.0, 224.0, 219.0, 445.0, 657.0, 708.0, 671.0, 579.0, 427.0, 256.0, 100.0, 7.0],
  [0.0, 50.0, 199.0, 373.0, 544.0, 695.0, 725.0, 621.0, 530.0, 291.0, 173.0, 101.0, 6.0],
];

function build(vals: number[][]): HourlySeries {
  const time: string[] = [];
  const gti: number[] = [];
  days.forEach((d, di) => {
    for (let h = 0; h < 24; h++) {
      time.push(`${d}T${String(h).padStart(2, "0")}:00`);
      gti.push(h >= 7 && h <= 19 ? vals[di][h - 7] : 0);
    }
  });
  return { time, gti };
}

export const delhiTilted = build(GTI);
export const delhiHorizontal = build(GHI);
