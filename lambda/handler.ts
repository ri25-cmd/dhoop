// AWS Lambda (Function URL). POST JSON:
// { lat, lon, kWp, tilt?, azimuth?, tariff?, readings?: [{date, kWh, readAt?}], image?: base64 jpeg/png }
// If `image` is present, Bedrock reads today's kWh from the inverter display or app screenshot.
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { irradiationForDate, diagnose, type DayReading, type HourlySeries } from "../engine/diagnose.ts";

const bedrock = new BedrockRuntimeClient({ region: process.env.BEDROCK_REGION ?? process.env.AWS_REGION });
const GRID_EF = process.env.GRID_EF_TCO2_PER_MWH ? Number(process.env.GRID_EF_TCO2_PER_MWH) : undefined;

const json = (status: number, body: unknown) => ({
  statusCode: status,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export async function fetchSatellite(lat: number, lon: number, tilt: number, azimuth: number, pastDays: number): Promise<HourlySeries> {
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
  const res = await fetch(u);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}: ${await res.text()}`);
  const data = await res.json();
  console.log(JSON.stringify({ msg: "satellite", url: u.toString(), hours: data?.hourly?.time?.length }));
  return { time: data.hourly.time, gti: data.hourly.global_tilted_irradiance };
}

async function readInverter(imageB64: string): Promise<{ kWh: number | null; confidence: number; seen: string }> {
  const modelId = process.env.BEDROCK_MODEL_ID;
  if (!modelId) throw new Error("BEDROCK_MODEL_ID not set");
  const bytes = Buffer.from(imageB64.replace(/^data:image\/\w+;base64,/, ""), "base64");
  const format = bytes[0] === 0x89 ? "png" : "jpeg";
  const out = await bedrock.send(
    new ConverseCommand({
      modelId,
      inferenceConfig: { maxTokens: 200, temperature: 0 },
      messages: [
        {
          role: "user",
          content: [
            { image: { format, source: { bytes } } },
            {
              text:
                'This is a solar inverter display or monitoring-app screenshot. Find the energy generated TODAY (labels like "E-Today", "Today", "Daily Yield", "आज"). ' +
                'Reply with JSON only: {"kWh": number or null, "confidence": 0-1, "seen": "the exact label and value you read"}. ' +
                "Convert Wh to kWh. If you cannot find today's energy, use null. Never guess.",
            },
          ],
        },
      ],
    }),
  );
  const text = out.output?.message?.content?.find((c) => "text" in c)?.text ?? "";
  const m = text.match(/\{[\s\S]*\}/);
  const parsed = m ? JSON.parse(m[0]) : { kWh: null, confidence: 0, seen: text };
  console.log(JSON.stringify({ msg: "bedrock-read", modelId, parsed }));
  return parsed;
}

export async function handler(event: { body?: string; isBase64Encoded?: boolean; requestContext?: { http?: { method?: string } } }) {
  if (event.requestContext?.http?.method === "OPTIONS") return json(204, {});
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body ?? "", "base64").toString() : event.body ?? "{}";
    const req = JSON.parse(raw);
    const { lat, lon, kWp } = req;
    if (![lat, lon, kWp].every((x) => typeof x === "number")) return json(400, { error: "lat, lon and kWp are required numbers" });

    const readings: DayReading[] = Array.isArray(req.readings) ? [...req.readings] : [];
    let read: Awaited<ReturnType<typeof readInverter>> | undefined;
    if (req.image) {
      read = await readInverter(req.image);
      if (read.kWh === null || read.confidence < 0.6) return json(422, { error: "Couldn't read today's energy clearly. Enter it by hand.", read });
      const now = new Date(Date.now() + 5.5 * 3600_000); // IST
      readings.push({ date: now.toISOString().slice(0, 10), kWh: read.kWh, readAt: now.toISOString().slice(11, 16) });
    }
    if (readings.length === 0) return json(400, { error: "Send an image or at least one reading" });
    readings.sort((a, b) => a.date.localeCompare(b.date));

    const first = Date.parse(readings[0].date + "T00:00:00Z");
    const pastDays = Math.min(31, Math.max(1, Math.ceil((Date.now() - first) / 86400_000) + 1));
    const series = await fetchSatellite(lat, lon, req.tilt ?? 25, req.azimuth ?? 0, pastDays);
    const irr = readings.map((r) => irradiationForDate(series, r.date, r.readAt));

    const result = diagnose({ kWp, tariffINRperKWh: req.tariff ?? 8, gridEF_tCO2perMWh: GRID_EF }, readings, irr);
    return json(200, { result, read, source: "Open-Meteo Satellite Radiation API (JMA/JAXA Himawari-9 over India)" });
  } catch (e) {
    console.error(e);
    return json(500, { error: (e as Error).message });
  }
}
