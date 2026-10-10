// AWS Lambda behind a Function URL.
// POST { lat, lon, kWp, tilt?, azimuth?, tariff?, readings: [{date: "YYYY-MM-DD", kWh}] }
// Readings must be COMPLETED days (before today, IST). The satellite API returns 0.0 for hours
// that have not been processed yet, which would undercount a partial day.
import { irradiationForDate, diagnose, type DayReading } from "../engine/diagnose.ts";
import { fetchSatellite, todayIST, SOURCE } from "../engine/satellite.ts";

const GRID_EF = process.env.GRID_EF_TCO2_PER_MWH ? Number(process.env.GRID_EF_TCO2_PER_MWH) : undefined;

const res = (status: number, body: unknown) => ({
  statusCode: status,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
const log = (msg: string, data: Record<string, unknown>) => console.log(JSON.stringify({ msg, ...data }));

export async function handler(event: { body?: string; isBase64Encoded?: boolean; requestContext?: { http?: { method?: string } } }) {
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body ?? "", "base64").toString() : (event.body ?? "{}");
    const req = JSON.parse(raw);
    const { lat, lon, kWp } = req;
    if (![lat, lon, kWp].every((x) => typeof x === "number" && Number.isFinite(x))) return res(400, { error: "lat, lon and kWp must be numbers" });
    if (lat < 6 || lat > 37 || lon < 68 || lon > 98) return res(400, { error: "Location must be in India" });

    const readings: DayReading[] = (Array.isArray(req.readings) ? req.readings : [])
      .filter((r: DayReading) => /^\d{4}-\d{2}-\d{2}$/.test(r?.date) && typeof r.kWh === "number" && r.kWh >= 0)
      .map((r: DayReading) => ({ date: r.date, kWh: r.kWh }))
      .sort((a: DayReading, b: DayReading) => a.date.localeCompare(b.date));
    if (readings.length === 0) return res(400, { error: "Enter at least one day's reading" });
    const today = todayIST();
    if (readings.some((r) => r.date >= today)) return res(400, { error: "Use completed days only (yesterday or earlier)" });

    const daysBack = Math.ceil((Date.parse(today) - Date.parse(readings[0].date)) / 86400_000);
    if (daysBack > 31) return res(400, { error: "Readings must be from the last 31 days" });

    const tilt = typeof req.tilt === "number" ? req.tilt : 25;
    const azimuth = typeof req.azimuth === "number" ? req.azimuth : 0;
    const { series, grid, meta } = await fetchSatellite(lat, lon, tilt, azimuth, daysBack + 1);
    log("satellite-fetched", { gridLat: grid.lat, gridLon: grid.lon, ...meta });
    const irr = readings.map((r) => irradiationForDate(series, r.date));

    const result = diagnose({ kWp, tariffINRperKWh: req.tariff, gridEF_tCO2perMWh: GRID_EF }, readings, irr);
    log("diagnosis", {
      kWp,
      tilt,
      azimuth,
      days: readings.length,
      verdict: result.verdict,
      baselineSource: result.baselineSource,
      baselinePR: Number(result.baselinePR.toFixed(3)),
      latestPR: Number(result.today.pr.toFixed(3)),
      latestIrradiation: Number(result.today.irradiation.toFixed(2)),
    });
    return res(200, { result, grid, source: SOURCE, tilt, azimuth });
  } catch (e) {
    console.error(JSON.stringify({ msg: "error", error: (e as Error).message }));
    return res(502, { error: "Couldn't get satellite sunlight data right now. Try again shortly." });
  }
}
