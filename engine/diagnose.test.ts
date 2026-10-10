import { test } from "node:test";
import assert from "node:assert/strict";
import { irradiationForDate, diagnose, type HourlySeries } from "./diagnose.ts";

// Synthetic plane-of-array profile: half-sine between 06:00 and 18:00 local, peak `peak` W/m².
// Values are hour-ending means, labelled at the END of each hour, like Open-Meteo.
function day(date: string, peak: number): HourlySeries {
  const time: string[] = [];
  const gti: number[] = [];
  for (let h = 1; h <= 24; h++) {
    const mid = h - 0.5;
    const v = mid > 6 && mid < 18 ? peak * Math.sin((Math.PI * (mid - 6)) / 12) : 0;
    const label = h === 24 ? nextDate(date) + "T00:00" : `${date}T${String(h).padStart(2, "0")}:00`;
    time.push(label);
    gti.push(Math.round(v));
  }
  return { time, gti };
}
const nextDate = (d: string) => new Date(Date.parse(d + "T00:00:00Z") + 86400_000).toISOString().slice(0, 10);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

test("full-day irradiation equals the sum of hourly means", () => {
  const s = day("2026-10-10", 700);
  const r = irradiationForDate(s, "2026-10-10");
  assert.equal(r.kWhPerM2, sum(s.gti as number[]) / 1000);
  assert.ok(r.kWhPerM2 > 5.2 && r.kWhPerM2 < 5.5, `got ${r.kWhPerM2}`); // ≈ peak × 12h × 2/π
});

test("the 00:00 label belongs to the previous day", () => {
  const s: HourlySeries = { time: ["2026-10-11T00:00", "2026-10-11T01:00"], gti: [111, 222] };
  assert.equal(irradiationForDate(s, "2026-10-10").kWhPerM2, 0.111);
  assert.equal(irradiationForDate(s, "2026-10-11").kWhPerM2, 0.222);
});

test("partial day counts only sunlight up to the reading time, pro rata", () => {
  const s = day("2026-10-10", 700);
  const at12 = irradiationForDate(s, "2026-10-10", "12:00").kWhPerM2;
  const at1230 = irradiationForDate(s, "2026-10-10", "12:30").kWhPerM2;
  const idx13 = s.time.indexOf("2026-10-10T13:00");
  assert.ok(Math.abs(at1230 - at12 - (s.gti[idx13] as number) / 2000) < 1e-9);
});

test("no history: nominal PR, flags a clearly underperforming system", () => {
  const s = day("2026-10-10", 520); // hazy day ≈ 3.97 kWh/m²
  const irr = irradiationForDate(s, "2026-10-10");
  const d = diagnose({ kWp: 3, tariffINRperKWh: 8, gridEF_tCO2perMWh: 0.7 }, [{ date: "2026-10-10", kWh: 7.0 }], [irr]);
  assert.equal(d.baselineSource, "nominal");
  assert.ok(d.today.pr < 0.6, `pr ${d.today.pr}`);
  assert.equal(d.verdict, "act");
  // recoverable = expected (H × kWp × 0.8) − actual
  assert.ok(Math.abs(d.recoverableKWhToday - (irr.kWhPerM2 * 3 * 0.8 - 7.0)) < 1e-9);
  assert.ok(d.recoverableINRperMonth! > 0 && d.recoverableKgCO2perMonth! > 0);
});

test("with history: baseline from the system's own data; haze alone is not blamed on the panels", () => {
  const kWp = 3;
  // Ten days at PR 0.80 with varying sunlight, then a hazy day where the panels are still fine.
  const readings = [] as { date: string; kWh: number }[];
  const irr = [] as ReturnType<typeof irradiationForDate>[];
  const peaks = [720, 700, 680, 650, 690, 710, 600, 640, 660, 700];
  peaks.forEach((p, i) => {
    const date = `2026-09-${String(20 + i).padStart(2, "0")}`;
    const r = irradiationForDate(day(date, p), date);
    irr.push(r);
    readings.push({ date, kWh: r.kWhPerM2 * kWp * 0.8 });
  });
  const hazy = irradiationForDate(day("2026-09-30", 450), "2026-09-30");
  const ok = diagnose({ kWp }, [...readings, { date: "2026-09-30", kWh: hazy.kWhPerM2 * kWp * 0.79 }], [...irr, hazy]);
  assert.equal(ok.baselineSource, "history");
  assert.equal(ok.verdict, "ok");
  assert.ok(ok.sunlightBelowBestPct > 0.3, "the sky was much darker than the best day");
  assert.ok(ok.systemLossPct < 0.02, "but the panels are not at fault");

  // Same hazy day, panels now dusty: PR 0.66 vs baseline 0.80 → 17.5% system loss.
  const dusty = diagnose({ kWp }, [...readings, { date: "2026-09-30", kWh: hazy.kWhPerM2 * kWp * 0.66 }], [...irr, hazy]);
  assert.equal(dusty.verdict, "act");
  assert.ok(Math.abs(dusty.systemLossPct - 0.175) < 1e-6, `loss ${dusty.systemLossPct}`);
  assert.ok(Math.abs(dusty.recoverableKWhToday - hazy.kWhPerM2 * kWp * 0.14) < 1e-9);
  assert.ok(dusty.bar.bestDayKWh > dusty.bar.expectedTodayKWh && dusty.bar.expectedTodayKWh > dusty.bar.actualKWh);
});

test("guards: too little sun, and impossible readings", () => {
  const dim = irradiationForDate(day("2026-10-10", 100), "2026-10-10");
  assert.equal(diagnose({ kWp: 3 }, [{ date: "2026-10-10", kWh: 1 }], [dim]).verdict, "insufficient-sun");
  const sunny = irradiationForDate(day("2026-10-10", 700), "2026-10-10");
  assert.equal(diagnose({ kWp: 3 }, [{ date: "2026-10-10", kWh: 25 }], [sunny]).verdict, "check-inputs");
});
