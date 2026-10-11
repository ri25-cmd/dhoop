// The chart must plot exactly the numbers the engine computed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { diagnose } from "../../engine/diagnose.ts";
import { dailyChart } from "./charts.ts";
import { demoData, DEMO_SYSTEM } from "./demo.ts";

const dates = ["2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10"];

test("chart points match the diagnosis: measured = reading, expected = sunlight × kWp × usual ratio", () => {
  const { readings, irr } = demoData(dates);
  const d = diagnose({ kWp: DEMO_SYSTEM.kWp, tariffINRperKWh: 8 }, readings, irr);
  const c = dailyChart(d.days, { kWp: DEMO_SYSTEM.kWp, baselinePR: d.baselinePR, latest: d.today.date, flagged: true, simulated: true, noExpected: new Set(), W: 900 });
  assert.equal(c.points.length, 7);
  c.points.forEach((p, i) => {
    assert.equal(p.measured, readings[i].kWh);
    assert.ok(Math.abs(p.expected - irr[i].kWhPerM2 * DEMO_SYSTEM.kWp * d.baselinePR) < 1e-9);
  });
  const last = c.points[6];
  assert.ok(last.latest);
  assert.ok(Math.abs(last.expected - d.bar.expectedTodayKWh) < 1e-9);
  // the sample is designed to be flagged, and says so
  assert.equal(d.verdict, "act");
  assert.match(c.legend, /Simulated reading/);
});

test("a day with incomplete satellite data gets no expected value in the chart", () => {
  const { readings, irr } = demoData(dates);
  irr[2] = { ...irr[2], missingDaylightHours: 3 };
  const d = diagnose({ kWp: 3 }, readings, irr);
  const c = dailyChart(d.days, { kWp: 3, baselinePR: d.baselinePR, latest: d.today.date, flagged: false, simulated: false, noExpected: new Set([dates[2]]), W: 900 });
  assert.ok(Number.isNaN(c.points[2].expected));
  assert.match(c.footnote, /incomplete/);
});
