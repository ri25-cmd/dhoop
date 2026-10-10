import { test } from "node:test";
import assert from "node:assert/strict";
import { irradiationForDate, diagnose } from "./diagnose.ts";
import { delhiTilted, delhiHorizontal } from "./fixtures/delhi-2026-10-08_10.ts";

const r2 = (x: number) => Math.round(x * 100) / 100;

test("real Delhi satellite data: daily irradiation from hourly W/m² means", () => {
  // Σ hourly means (W/m² × 1 h) / 1000 = kWh/m² per day
  assert.equal(r2(irradiationForDate(delhiTilted, "2026-10-08").kWhPerM2), 5.26);
  assert.equal(r2(irradiationForDate(delhiTilted, "2026-10-09").kWhPerM2), 4.91);
  assert.equal(r2(irradiationForDate(delhiTilted, "2026-10-10").kWhPerM2), 4.83);
  assert.equal(r2(irradiationForDate(delhiHorizontal, "2026-10-08").kWhPerM2), 4.66);
});

test("real data sanity: 28° south tilt gains 5–25% over horizontal in October at 28.6°N", () => {
  for (const d of ["2026-10-08", "2026-10-09", "2026-10-10"]) {
    const ratio = irradiationForDate(delhiTilted, d).kWhPerM2 / irradiationForDate(delhiHorizontal, d).kWhPerM2;
    assert.ok(ratio > 1.05 && ratio < 1.25, `${d}: ${ratio}`);
  }
});

test("real data sanity: irradiance-weighted centre of day is near Delhi solar noon (hour-ending labels)", () => {
  const idx = delhiTilted.time.map((t, i) => [t, i] as const).filter(([t]) => t.startsWith("2026-10-08"));
  let w = 0, wt = 0;
  for (const [t, i] of idx) {
    const v = delhiTilted.gti[i] as number;
    const midHour = Number(t.slice(11, 13)) - 0.5; // hour-ending label → mid-point half an hour earlier
    w += v; wt += v * midHour;
  }
  const centre = wt / w; // hours, IST
  // Solar noon in Delhi ≈ 12:08 IST in early October; allow ±45 min for haze asymmetry.
  assert.ok(Math.abs(centre - 12.13) < 0.75, `centre ${centre.toFixed(2)}h`);
});

test("illustrative 3 kWp system on the real sunlight (readings are hypothetical, not measured)", () => {
  const dates = ["2026-10-08", "2026-10-09", "2026-10-10"];
  const irr = dates.map((d) => irradiationForDate(delhiTilted, d));
  // Hypothetical readings: PR 0.80, 0.80, then 0.66 on the last day.
  const readings = dates.map((date, i) => ({ date, kWh: r2(irr[i].kWhPerM2 * 3 * (i < 2 ? 0.8 : 0.66)) }));
  const d = diagnose({ kWp: 3 }, readings, irr);
  assert.equal(d.baselineSource, "nominal"); // only 2 earlier days, so not enough history
  // Without history the nominal rule applies: PR between 0.60 and 0.70 is "watch", not "act".
  assert.equal(d.verdict, "watch");
  assert.ok(Math.abs(d.today.pr - 0.66) < 0.005);
});
