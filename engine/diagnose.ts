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
  missingDaylightHours: number;
  daylightHours: number;
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** Sum plane-of-array irradiation for one local date, optionally only up to readAt. */
export function irradiationForDate(s: HourlySeries, date: string, readAt?: string): Irradiation {
  const cutoff = readAt ? toMin(readAt) : 24 * 60;
  let wh = 0;
  let missing = 0;
  let daylight = 0;
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
    if (v === null || v === undefined || Number.isNaN(v)) {
      if (start >= 6 * 60 && end <= 19 * 60) missing++;
      continue;
    }
    if (v > 0) daylight++;
    wh += v * frac; // W/m² × 1 h = Wh/m²
  }
  return { kWhPerM2: wh / 1000, missingDaylightHours: missing, daylightHours: daylight };
}

export type Verdict = "ok" | "watch" | "act" | "insufficient-sun" | "check-inputs";

export interface DayResult {
  date: string;
  kWh: number;
  irradiation: number; // kWh/m²
  pr: number;
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
  history: DayResult[];
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
  if (!(cfg.kWp > 0)) throw new Error("kWp must be positive");
  const nominal = cfg.nominalPR ?? 0.8;
  const notes: string[] = [];

  const days: DayResult[] = readings.map((r, i) => ({
    date: r.date,
    kWh: r.kWh,
    irradiation: irr[i].kWhPerM2,
    pr: irr[i].kWhPerM2 > 0 ? r.kWh / (irr[i].kWhPerM2 * cfg.kWp) : NaN,
  }));
  const today = days[days.length - 1];
  const todayIrr = irr[irr.length - 1];
  const history = days.slice(0, -1).filter((d) => d.irradiation >= 1.5 && Number.isFinite(d.pr) && d.pr <= 1.05);

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

  const bestIrr = Math.max(...days.map((d) => d.irradiation));
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
  };

  // Guards before any verdict.
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

  let confidence: Diagnosis["confidence"] = baselineSource === "history" ? "high" : "medium";
  if (todayIrr.missingDaylightHours > 2) {
    confidence = "low";
    notes.push("Some satellite hours were missing today.");
  }
  if (readings[readings.length - 1].readAt) notes.push(`Compared against satellite sunlight up to ${readings[readings.length - 1].readAt}.`);

  notes.push("Satellite sunlight is an estimate for a ~5 km area. Local shade, panel temperature, orientation and system differences are not captured, so small differences are within normal uncertainty.");
  const monthKWh = recoverableKWhToday * 30;
  const out: Diagnosis = { ...base, verdict, reason, systemLossPct, recoverableKWhToday, confidence, notes };
  if (cfg.tariffINRperKWh) out.recoverableINRperMonth = monthKWh * cfg.tariffINRperKWh;
  if (cfg.gridEF_tCO2perMWh) out.recoverableKgCO2perMonth = monthKWh * cfg.gridEF_tCO2perMWh; // t/MWh == kg/kWh
  return out;
}
