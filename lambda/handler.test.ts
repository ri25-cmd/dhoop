import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { handler } from "./handler.ts";
import { delhiTilted } from "../engine/fixtures/delhi-2026-10-08_10.ts";

// Pretend "now" is 11 Oct 2026, 10:00 IST, so 8–10 Oct are completed days.
mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-11T04:30:00Z") });

function stubSatellite() {
  const calls: string[] = [];
  globalThis.fetch = (async (url: URL) => {
    calls.push(String(url));
    return new Response(
      JSON.stringify({
        latitude: 28.576448,
        longitude: 77.18678,
        utc_offset_seconds: 19800,
        hourly_units: { global_tilted_irradiance: "W/m²" },
        hourly: { time: delhiTilted.time, global_tilted_irradiance: delhiTilted.gti },
      }),
      { status: 200 },
    );
  }) as typeof fetch;
  return calls;
}
const call = (body: unknown) => handler({ body: JSON.stringify(body) });

test("end to end on real satellite data (hypothetical readings)", async () => {
  const calls = stubSatellite();
  const out = await call({
    lat: 28.61, lon: 77.21, kWp: 3, tilt: 28, azimuth: 0, tariff: 8,
    readings: [
      { date: "2026-10-08", kWh: 12.6 },
      { date: "2026-10-09", kWh: 11.8 },
      { date: "2026-10-10", kWh: 9.6 },
    ],
  });
  assert.equal(out.statusCode, 200);
  const body = JSON.parse(out.body);
  assert.equal(body.grid.lat, 28.576448);
  assert.ok(Math.abs(body.result.today.irradiation - 4.83) < 0.005);
  assert.ok(Math.abs(body.result.today.pr - 9.6 / (4.8264 * 3)) < 0.001);
  assert.match(calls[0], /past_days=4/);
  assert.match(calls[0], /tilt=28/);
});

test("rejects today's partial reading", async () => {
  stubSatellite();
  const out = await call({ lat: 28.61, lon: 77.21, kWp: 3, readings: [{ date: "2026-10-11", kWh: 5 }] });
  assert.equal(out.statusCode, 400);
});

test("rejects locations outside India and missing inputs", async () => {
  stubSatellite();
  assert.equal((await call({ lat: 51.5, lon: -0.1, kWp: 3, readings: [{ date: "2026-10-10", kWh: 5 }] })).statusCode, 400);
  assert.equal((await call({ lat: 28.6, lon: 77.2, readings: [] })).statusCode, 400);
});

test("satellite outage returns a clear error, not a fake diagnosis", async () => {
  globalThis.fetch = (async () => new Response("down", { status: 503 })) as typeof fetch;
  const out = await call({ lat: 28.61, lon: 77.21, kWp: 3, readings: [{ date: "2026-10-10", kWh: 9 }] });
  assert.equal(out.statusCode, 502);
  assert.match(JSON.parse(out.body).error, /satellite/i);
});
