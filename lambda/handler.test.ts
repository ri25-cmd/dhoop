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

test("rejects repeated dates, impossible dates and bad angles; ignores a junk tariff", async () => {
  stubSatellite();
  const base = { lat: 28.61, lon: 77.21, kWp: 3 };
  assert.equal((await call({ ...base, readings: [{ date: "2026-10-09", kWh: 5 }, { date: "2026-10-09", kWh: 6 }] })).statusCode, 400);
  assert.equal((await call({ ...base, readings: [{ date: "2026-02-31", kWh: 5 }] })).statusCode, 400);
  assert.equal((await call({ ...base, tilt: 120, readings: [{ date: "2026-10-10", kWh: 9 }] })).statusCode, 400);
  const ok = await call({ ...base, tariff: "lots", readings: [{ date: "2026-10-10", kWh: 9 }] });
  assert.equal(ok.statusCode, 200);
  assert.equal(JSON.parse(ok.body).result.recoverableINRperMonth, undefined);
});

test("satellite API that times out returns 502", async () => {
  globalThis.fetch = (async () => { throw new DOMException("timeout", "TimeoutError"); }) as typeof fetch;
  const out = await call({ lat: 28.61, lon: 77.21, kWp: 3, readings: [{ date: "2026-10-10", kWh: 9 }] });
  assert.equal(out.statusCode, 502);
});

test("a bad reading is rejected, not silently dropped (which would judge a different day)", async () => {
  stubSatellite();
  const base = { lat: 28.61, lon: 77.21, kWp: 3 };
  for (const kWh of ["9.6", -2, null]) {
    const out = await call({ ...base, readings: [{ date: "2026-10-09", kWh: 11.8 }, { date: "2026-10-10", kWh }] });
    assert.equal(out.statusCode, 400, `kWh ${kWh}`);
  }
  assert.equal((await call({ ...base, kWp: 0, readings: [{ date: "2026-10-10", kWh: 9 }] })).statusCode, 400);
  assert.equal((await call({ ...base, readings: "lots" })).statusCode, 400);
});

test("malformed satellite responses (wrong units, no hourly data) return 502, not a diagnosis", async () => {
  for (const body of [
    { utc_offset_seconds: 19800, hourly_units: { global_tilted_irradiance: "kWh/m²" }, hourly: { time: [], global_tilted_irradiance: [] } },
    { utc_offset_seconds: 19800, hourly_units: { global_tilted_irradiance: "W/m²" } },
    { utc_offset_seconds: 0, hourly_units: { global_tilted_irradiance: "W/m²" }, hourly: { time: [], global_tilted_irradiance: [] } },
  ]) {
    globalThis.fetch = (async () => new Response(JSON.stringify(body), { status: 200 })) as typeof fetch;
    const out = await call({ lat: 28.61, lon: 77.21, kWp: 3, readings: [{ date: "2026-10-10", kWh: 9 }] });
    assert.equal(out.statusCode, 502);
  }
});

test("the response states where the sunlight came from and which hours were used", async () => {
  stubSatellite();
  const out = await call({ lat: 28.61, lon: 77.21, kWp: 3, readings: [{ date: "2026-10-10", kWh: 9 }] });
  const { sunlight } = JSON.parse(out.body);
  assert.match(sunlight.source, /Open-Meteo.*Himawari/);
  assert.equal(sunlight.first, delhiTilted.time[0]);
  assert.equal(sunlight.last, delhiTilted.time.at(-1));
  assert.equal(sunlight.hours, delhiTilted.time.length);
  assert.ok(!Number.isNaN(Date.parse(sunlight.retrievedAt)));
});
