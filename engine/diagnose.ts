// Dhoop diagnosis engine.
//
// Method: satellite-normalised performance ratio (PR).
//   PR = energy the inverter reports (kWh) / (plane-of-array irradiation (kWh/m²) × kWp)
// The satellite irradiation includes clouds and aerosols, so it normalises for the sunlight
// that was available. It does NOT remove all uncertainty: satellite estimation error, local
// shading, panel temperature, the true orientation and system differences remain. So a low
// PR is "possible system underperformance", never a diagnosis of a specific cause.
//
// We deliberately do NOT model a clear-sky baseline or attribute loss to smog.
// "Sunlight vs your best recent day" is a satellite-to-satellite comparison.

export interface HourlySeries {
  time: string[]; // local ISO, e.g. "2026-10-10T13:00"; value = mean of the PRECEDING hour
  gti: (number | null)[]; // W/m², plane of array
}

export interface DayReading {
  date: string; // YYYY-MM-DD (local)
  kWh: number; // inverter "today" energy
  readAt?: string; // HH:MM if read before end of day
}

export interface Config {
  kWp: number;
  nominalPR?: number; // used only when there is no history; default 0.80
  tariffINRperKWh?: number; // for ₹ figures
  gridEF_tCO2perMWh?: number; // from the latest CEA CO2 Baseline Database; no default on purpose
}

export interface Irradiation {
  kWhPerM2: number;
  // Daylight hours (06:00–19:00 IST) that are absent, null, or an implausible 0 at midday.
  // Any of these undercounts the day's sunlight and inflates PR, so such days are not judged.
  missingDaylightHours: number;
  daylightHours: number;
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

// The satellite API returns 0.0 (not null) for hours it has not processed yet. Real irradiance
// on a panel is never exactly 0 between 09:00 and 15:00 IST anywhere in India, even under
// monsoon cloud, so a 0 there is treated as missing data rather than darkness.
const DAY_START_H = 6, DAY_END_H = 19, MIDDAY_START_H = 9, MIDDAY_END_H = 15;

/** Sum plane-of-array irradiation for one local date, optionally only up to readAt. */
export function irradiationForDate(s: HourlySeries, date: string, readAt?: string): Irradiation {
  const cutoff = readAt ? toMin(readAt) : 24 * 60;
  let wh = 0;
  let daylight = 0;
  const goodHours = new Set<number>(); // start hour of each valid daylight value
  for (let i = 0; i < s.time.length; i++) {
    // Each value is the mean of the hour ENDING at its label, so bucket by the hour's start.
    // (A "00:00" label therefore belongs to 23:00–24:00 of the previous day.)
    const startISO = new Date(Date.parse(s.time[i] + ":00Z") - 3600_000).toISOString();
    if (startISO.slice(0, 10) !== date) continue;
    const start = toMin(startISO.slice(11, 16));
    const end = start + 60;
    if (start >= cutoff) continue;
    const frac = end <= cutoff ? 1 : (cutoff - start) / 60;
    const v = s.gti[i];
    if (v === null || v === undefined || Number.isNaN(v)) continue;
    const h = start / 60;
    if (v === 0 && h >= MIDDAY_START_H && h < MIDDAY_END_H) continue; // unprocessed, not dark
    goodHours.add(h);
    if (v > 0) daylight++;
    wh += v * frac; // W/m² × 1 h = Wh/m²
  }
  // Count daylight hours (before the cutoff) that have no usable value, including hours the
  // response did not cover at all.
  let missing = 0;
  for (let h = DAY_START_H; h < DAY_END_H; h++) if (h * 60 < cutoff && !goodHours.has(h)) missing++;
  return { kWhPerM2: wh / 1000, missingDaylightHours: missing, daylightHours: daylight };
}

export type Verdict = "ok" | "watch" | "act" | "insufficient-sun" | "check-inputs" | "no-data";

export interface DayResult {
  date: string;
  kWh: number;
  irradiation: number; // kWh/m²
  pr: number;
  excluded?: string; // why this earlier day was left out of the usual level, if it was
}

export interface Diagnosis {
  verdict: Verdict;
  reason: string;
  baselinePR: number;
  baselineSource: "history" | "nominal";
  today: DayResult;
  systemLossPct: number; // possible underperformance vs baseline, 0..1
  sunlightBelowBestPct: number; // today's satellite sunlight vs brightest day in the window, 0..1
  recoverableKWhToday: number;
  recoverableINRperMonth?: number;
  recoverableKgCO2perMonth?: number;
  bar: { bestDayKWh: number; expectedTodayKWh: number; actualKWh: number };
  history: DayResult[]; // earlier days used for the usual level
  days: DayResult[]; // every day entered, in date order, with exclusion reasons
  confidence: "high" | "medium" | "low";
  notes: string[];
}

const percentile = (xs: number[], p: number) => {
  const a = [...xs].sort((x, y) => x - y);
  const idx = (a.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return a[lo] + (a[hi] - a[lo]) * (idx - lo);
};

/**
 * readings: the latest reading is "today"; earlier ones form the history.
 * irr: irradiation per reading, from irradiationForDate().
 */
export function diagnose(cfg: Config, readings: DayReading[], irr: Irradiation[]): Diagnosis {
  if (readings.length === 0 || readings.length !== irr.length) throw new Error("readings and irradiation must align");
  // Reject what can't be judged. A NaN reading would otherwise slip past every comparison below
  // and come out as "Working as expected".
  if (!(Number.isFinite(cfg.kWp) && cfg.kWp > 0)) throw new Error("kWp must be a positive number");
  for (const r of readings) if (!(Number.isFinite(r.kWh) && r.kWh >= 0)) throw new Error(`reading for ${r.date} must be a number of kWh, 0 or more`);
  for (const x of irr) if (!(Number.isFinite(x.kWhPerM2) && x.kWhPerM2 >= 0)) throw new Error("irradiation must be a number, 0 or more");
  const nominal = cfg.nominalPR ?? 0.8;
  const notes: string[] = [];

  for (let i = 1; i < readings.length; i++) {
    if (readings[i].date <= readings[i - 1].date) throw new Error("readings must be in date order with no repeated dates");
  }

  const days: DayResult[] = readings.map((r, i) => {
    const d: DayResult = {
      date: r.date,
      kWh: r.kWh,
      irradiation: irr[i].kWhPerM2,
      pr: irr[i].kWhPerM2 > 0 ? r.kWh / (irr[i].kWhPerM2 * cfg.kWp) : NaN,
    };
    if (i < readings.length - 1) {
      if (irr[i].missingDaylightHours > 0) d.excluded = "satellite data incomplete";
      else if (d.irradiation < 1.5) d.excluded = "too little sunlight";
      else if (!(d.pr <= 1.05)) d.excluded = "reading higher than the sunlight allows";
    }
    return d;
  });
  const today = days[days.length - 1];
  const todayIrr = irr[irr.length - 1];
  const history = days.slice(0, -1).filter((d) => !d.excluded);
  const excludedCount = days.length - 1 - history.length;
  if (excludedCount > 0) notes.push(`${excludedCount} earlier day${excludedCount > 1 ? "s were" : " was"} left out of the comparison (see the table).`);

  // Baseline: the system's own clean-ish level (75th percentile of recent PR) when we have
  // enough history; otherwise a nominal value, clearly labelled as provisional.
  let baselinePR = nominal;
  let baselineSource: "history" | "nominal" = "nominal";
  if (history.length >= 5) {
    baselinePR = percentile(history.map((d) => d.pr), 0.75);
    baselineSource = "history";
  } else {
    notes.push(`Fewer than 5 earlier days of readings, so the comparison uses a typical performance ratio of ${nominal.toFixed(2)}.`);
  }

  // Only days with complete satellite data can be "the brightest".
  const bestIrr = Math.max(...days.filter((d, i) => irr[i].missingDaylightHours === 0).map((d) => d.irradiation), 0);
  const sunlightBelowBestPct = bestIrr > 0 ? Math.max(0, 1 - today.irradiation / bestIrr) : 0;
  const expectedToday = today.irradiation * cfg.kWp * baselinePR;
  const bar = {
    bestDayKWh: bestIrr * cfg.kWp * baselinePR,
    expectedTodayKWh: expectedToday,
    actualKWh: today.kWh,
  };

  const base = {
    baselinePR,
    baselineSource,
    today,
    sunlightBelowBestPct,
    bar,
    history,
    days,
  };

  // Guards before any verdict. Missing data first: an incomplete day looks dark, but isn't.
  if (todayIrr.missingDaylightHours > 0) {
    return { ...base, verdict: "no-data", reason: `Satellite sunlight for this day is incomplete (${todayIrr.missingDaylightHours} daylight hour${todayIrr.missingDaylightHours > 1 ? "s" : ""} missing), so Dhoop can't judge it. This is a data gap, not a sign of a problem with your system.`, systemLossPct: 0, recoverableKWhToday: 0, confidence: "low", notes };
  }
  if (today.irradiation < 1.5) {
    return { ...base, verdict: "insufficient-sun", reason: "Too little sunlight on this day to judge the system.", systemLossPct: 0, recoverableKWhToday: 0, confidence: "low", notes };
  }
  if (today.pr > 1.05) {
    return { ...base, verdict: "check-inputs", reason: "The reading is higher than the sunlight allows. Check the system size (kWp), the date, or the reading itself.", systemLossPct: 0, recoverableKWhToday: 0, confidence: "low", notes };
  }

  const systemLossPct = Math.max(0, 1 - today.pr / baselinePR);
  const recoverableKWhToday = Math.max(0, expectedToday - today.kWh);

  // Thresholds reflect satellite uncertainty for a single ~5 km pixel on a single day.
  let verdict: Verdict;
  if (baselineSource === "history") {
    verdict = systemLossPct > 0.15 ? "act" : systemLossPct > 0.08 ? "watch" : "ok";
  } else {
    verdict = today.pr < 0.6 ? "act" : today.pr < 0.7 ? "watch" : "ok";
  }
  const reason: string =
    verdict === "ok"
      ? "Output matches the sunlight that reached your roof, within normal uncertainty."
      : verdict === "watch"
        ? "Output is a little below your usual level for the sunlight available. This can be normal variation. Check again after a few more days."
        : "Output is clearly below what the available sunlight would normally produce. This is possible system underperformance. Check for dirt, new shade or an inverter fault, or ask your installer to inspect it.";

  const confidence: Diagnosis["confidence"] = baselineSource === "history" ? "high" : "medium";
  if (readings[readings.length - 1].readAt) notes.push(`Compared against satellite sunlight up to ${readings[readings.length - 1].readAt}.`);

  notes.push("Satellite sunlight is an estimate for a ~5 km area. Local shade, panel temperature, orientation and system differences are not captured, so small differences are within normal uncertainty.");
  const monthKWh = recoverableKWhToday * 30;
  const out: Diagnosis = { ...base, verdict, reason, systemLossPct, recoverableKWhToday, confidence, notes };
  if (cfg.tariffINRperKWh && cfg.tariffINRperKWh > 0) out.recoverableINRperMonth = monthKWh * cfg.tariffINRperKWh;
  if (cfg.gridEF_tCO2perMWh && cfg.gridEF_tCO2perMWh > 0) out.recoverableKgCO2perMonth = monthKWh * cfg.gridEF_tCO2perMWh; // t/MWh == kg/kWh
  return out;
}
