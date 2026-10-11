// Shared by the Lambda and the browser fallback, so both paths compute identically.
import type { HourlySeries } from "./diagnose.ts";

export interface SatelliteResult {
  series: HourlySeries;
  grid: { lat: number; lon: number };
  meta: { utcOffsetSeconds: number; units: string; hours: number; first: string; last: string; ms: number };
}

export async function fetchSatellite(lat: number, lon: number, tilt: number, azimuth: number, pastDays: number): Promise<SatelliteResult> {
  const u = new URL("https://satellite-api.open-meteo.com/v1/archive");
  u.search = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: "global_tilted_irradiance",
    tilt: String(tilt),
    azimuth: String(azimuth),
    past_days: String(pastDays),
    timezone: "Asia/Kolkata",
  }).toString();
  const t0 = Date.now();
  let r: Response;
  try {
    r = await fetch(u, { signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new Error("Satellite API did not respond");
  }
  if (!r.ok) throw new Error(`Satellite API returned ${r.status}`);
  const data = await r.json();
  if (data?.utc_offset_seconds !== 19800) throw new Error("Unexpected timezone in satellite response");
  if (!Array.isArray(data.hourly?.time) || !Array.isArray(data.hourly?.global_tilted_irradiance)) throw new Error("Satellite response had no hourly data");
  if (data.hourly_units?.global_tilted_irradiance !== "W/m²") throw new Error("Unexpected units in satellite response");
  const series: HourlySeries = { time: data.hourly.time, gti: data.hourly.global_tilted_irradiance };
  return {
    series,
    grid: { lat: data.latitude, lon: data.longitude },
    meta: {
      utcOffsetSeconds: data.utc_offset_seconds,
      units: data.hourly_units?.global_tilted_irradiance,
      hours: series.time.length,
      first: series.time[0],
      last: series.time[series.time.length - 1],
      ms: Date.now() - t0,
    },
  };
}

export const todayIST = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
export const SOURCE = "Open-Meteo Satellite Radiation API (JMA/JAXA Himawari over India), hourly global tilted irradiance";
