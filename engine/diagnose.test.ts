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

test("unprocessed midday hours (API returns 0) count as missing data, not darkness", () => {
  const s = day("2026-10-10", 700);
  const i12 = s.time.indexOf("2026-10-10T12:00"); // hour 11:00–12:00
  s.gti[i12] = 0;
  const irr = irradiationForDate(s, "2026-10-10");
  assert.equal(irr.missingDaylightHours, 1);
  const d = diagnose({ kWp: 3 }, [{ date: "2026-10-10", kWh: 12 }], [irr]);
  assert.equal(d.verdict, "no-data");
});

test("a date the satellite response does not cover is no-data, not 'too little sun'", () => {
  const irr = irradiationForDate(day("2026-10-10", 700), "2026-10-05");
  assert.equal(irr.missingDaylightHours, 13);
  assert.equal(diagnose({ kWp: 3 }, [{ date: "2026-10-05", kWh: 12 }], [irr]).verdict, "no-data");
});

test("earlier days with missing satellite hours are excluded from the usual level and listed", () => {
  const kWp = 3;
  const dates = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07"];
  const irr = dates.map((dt) => irradiationForDate(day(dt, 700), dt));
  // Day 2 lost its 12:00 hour: irradiation undercounted, so its PR would look too high.
  const s = day(dates[1], 700);
  s.gti[s.time.indexOf(`${dates[1]}T13:00`)] = null;
  irr[1] = irradiationForDate(s, dates[1]);
  const readings = dates.map((date, i) => ({ date, kWh: (i === 1 ? irradiationForDate(day(date, 700), date).kWhPerM2 : irr[i].kWhPerM2) * kWp * 0.8 }));
  const d = diagnose({ kWp }, readings, irr);
  assert.equal(d.history.length, 5);
  assert.equal(d.days.length, 7);
  assert.equal(d.days[1].excluded, "satellite data incomplete");
  assert.ok(Math.abs(d.baselinePR - 0.8) < 1e-9, `baseline ${d.baselinePR}`);
  assert.equal(d.verdict, "ok");
});

test("readings out of order or with repeated dates are rejected", () => {
  const irr = irradiationForDate(day("2026-10-10", 700), "2026-10-10");
  assert.throws(() => diagnose({ kWp: 3 }, [{ date: "2026-10-10", kWh: 1 }, { date: "2026-10-10", kWh: 1 }], [irr, irr]));
});

// --- sprint additions: normal vs low cases, invalid inputs, and the numbers the UI shows

const week = ["2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10"];
const sun = [5.3, 5.1, 4.6, 4.9, 5.2, 4.4, 4.8]; // kWh/m², complete days
const full = (k: number) => ({ kWhPerM2: k, missingDaylightHours: 0, daylightHours: 11 });
const readingsAt = (prs: number[], kWp = 3) => week.map((date, i) => ({ date, kWh: sun[i] * kWp * prs[i] }));

test("normal performance with history: the latest day at the usual ratio is 'ok', nothing to recover", () => {
  const d = diagnose({ kWp: 3, tariffINRperKWh: 8 }, readingsAt([0.8, 0.79, 0.81, 0.8, 0.78, 0.8, 0.8]), sun.map(full));
  assert.equal(d.baselineSource, "history");
  assert.equal(d.verdict, "ok");
  assert.ok(d.systemLossPct < 0.08);
});

test("possible underperformance with history: 20% below the usual ratio is 'act'", () => {
  const d = diagnose({ kWp: 3, tariffINRperKWh: 8 }, readingsAt([0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.64]), sun.map(full));
  assert.equal(d.verdict, "act");
  assert.ok(Math.abs(d.systemLossPct - 0.2) < 1e-9);
  // 10% below is 'watch' (between the 8% and 15% thresholds)
  const w = diagnose({ kWp: 3 }, readingsAt([0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.72]), sun.map(full));
  assert.equal(w.verdict, "watch");
});

test("invalid readings and capacity are rejected, never judged", () => {
  const irr = [full(5)];
  for (const kWh of [NaN, -1, Infinity]) assert.throws(() => diagnose({ kWp: 3 }, [{ date: "2026-10-10", kWh }], irr), /reading/);
  for (const kWp of [0, -3, NaN, Infinity]) assert.throws(() => diagnose({ kWp }, [{ date: "2026-10-10", kWh: 10 }], irr), /kWp/);
  assert.throws(() => diagnose({ kWp: 3 }, [{ date: "2026-10-10", kWh: 10 }], [full(NaN)]), /irradiation/);
  assert.throws(() => diagnose({ kWp: 3 }, [], []), /align/);
});

test("displayed values are consistent: expected, shortfall, percentage and cost all derive from one formula", () => {
  const kWp = 3, tariff = 8;
  const r = readingsAt([0.8, 0.79, 0.81, 0.8, 0.78, 0.8, 0.64]);
  const d = diagnose({ kWp, tariffINRperKWh: tariff }, r, sun.map(full));
  const expected = d.today.irradiation * kWp * d.baselinePR; // kWh/m² × kW × ratio = kWh
  assert.ok(Math.abs(d.bar.expectedTodayKWh - expected) < 1e-9);
  assert.ok(Math.abs(d.recoverableKWhToday - (expected - d.today.kWh)) < 1e-9);
  // shortfall % = 1 − made/expected = 1 − PR/baseline
  assert.ok(Math.abs(d.systemLossPct - (1 - d.today.kWh / expected)) < 1e-9);
  // ₹ per month = shortfall kWh/day × 30 days × ₹/kWh
  assert.ok(Math.abs(d.recoverableINRperMonth! - d.recoverableKWhToday * 30 * tariff) < 1e-9);
  // no CO₂ figure without a configured grid emission factor
  assert.equal(d.recoverableKgCO2perMonth, undefined);
});
