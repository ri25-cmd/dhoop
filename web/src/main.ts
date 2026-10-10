import "./style.css";
import { diagnose, irradiationForDate, type Diagnosis, type DayReading } from "../../engine/diagnose.ts";
import { fetchSatellite, todayIST, SOURCE } from "../../engine/satellite.ts";
import { threeBars, prBars } from "./charts.ts";
import { demoData, DEMO_SYSTEM } from "./demo.ts";

const API_URL: string | undefined = import.meta.env.VITE_API_URL || undefined;
const GRID_EF = import.meta.env.VITE_GRID_EF_TCO2_PER_MWH ? Number(import.meta.env.VITE_GRID_EF_TCO2_PER_MWH) : undefined;

const CITIES: Record<string, [number, number]> = {
  Delhi: [28.61, 77.21], Mumbai: [19.08, 72.88], Bengaluru: [12.97, 77.59], Chennai: [13.08, 80.27],
  Kolkata: [22.57, 88.36], Hyderabad: [17.39, 78.49], Pune: [18.52, 73.86], Ahmedabad: [23.02, 72.57],
  Jaipur: [26.91, 75.79], Lucknow: [26.85, 80.95], Chandigarh: [30.73, 76.78],
};
const FACING: Record<string, number> = { South: 0, "South-east": -45, "South-west": 45, East: -90, West: 90 };

type Path = "aws" | "browser" | "demo";
interface Outcome { d: Diagnosis; path: Path; grid?: { lat: number; lon: number }; fallbackReason?: string }

const lastDays = (n: number) => {
  const t = Date.parse(todayIST() + "T00:00:00Z");
  return Array.from({ length: n }, (_, i) => new Date(t - (n - i) * 86400_000).toISOString().slice(0, 10));
};
const DATES = lastDays(7);
const fmtDate = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const $ = <T extends HTMLElement>(s: string) => document.querySelector(s) as T;

document.querySelector("#app")!.innerHTML = `
<header class="top">
  <div class="brand"><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="7"/><g><path d="M16 2v4M16 26v4M2 16h4M26 16h4M6 6l3 3M23 23l3 3M6 26l3-3M23 9l3-3"/></g></svg><span>Dhoop</span></div>
  <p class="tag">Is your rooftop solar making what the sunlight allowed?</p>
</header>
<main>
  <section class="intro">
    <h1>Check your solar against the sun that actually reached your roof.</h1>
    <p>Enter your system and the last 7 days from your inverter. Dhoop compares each day with satellite-measured sunlight for your location, so a hazy week isn't mistaken for a problem with your panels.</p>
  </section>

  <form id="form" novalidate>
    <fieldset class="card">
      <legend><span class="step">1</span>Your system</legend>
      <div class="grid2">
        <label>City<select id="city">${Object.keys(CITIES).map((c) => `<option>${c}</option>`).join("")}<option value="custom">Other location…</option></select></label>
        <label>System size (kW)<input id="kwp" type="number" inputmode="decimal" min="0.5" max="100" step="0.1" placeholder="e.g. 3" required /></label>
      </div>
      <div class="grid2 custom-loc" hidden>
        <label>Latitude<input id="lat" type="number" step="0.0001" inputmode="decimal" /></label>
        <label>Longitude<input id="lon" type="number" step="0.0001" inputmode="decimal" /></label>
        <button type="button" id="geo" class="link">Use my current location</button>
      </div>
      <details class="more">
        <summary>Roof angle, direction and electricity rate</summary>
        <div class="grid3">
          <label>Panel tilt (°)<input id="tilt" type="number" min="0" max="60" value="25" inputmode="numeric" /></label>
          <label>Panels face<select id="facing">${Object.keys(FACING).map((f) => `<option>${f}</option>`).join("")}</select></label>
          <label>Your rate (₹/kWh)<input id="tariff" type="number" min="0" step="0.1" value="8" inputmode="decimal" /></label>
        </div>
        <p class="hint">Not sure? The defaults suit most Indian rooftops. A wrong tilt or direction shifts every day equally, so it barely changes the comparison between days.</p>
      </details>
    </fieldset>

    <fieldset class="card">
      <legend><span class="step">2</span>Last 7 days from your inverter</legend>
      <p class="hint">Open your inverter app or display and copy each day's total ("E-Today", "Daily yield"). Completed days only.</p>
      <div class="days">${DATES.map((d, i) => `<label class="day"><span>${fmtDate(d)}</span><input type="number" inputmode="decimal" min="0" step="0.1" data-i="${i}" placeholder="kWh" /></label>`).join("")}</div>
    </fieldset>

    <div class="actions">
      <button type="submit" class="primary">Check my system</button>
      <button type="button" id="demo" class="secondary">Try with demo data</button>
    </div>
    <p id="error" class="error" role="alert" hidden></p>
  </form>

  <section id="result" aria-live="polite" hidden></section>
</main>
<footer>
  <p>Sunlight data: ${SOURCE}. Built for the WeMakeDevs × AWS Bharat Builds Tour, Environmental Hacks.</p>
</footer>`;

// --- form wiring
const city = $<HTMLSelectElement>("#city");
city.addEventListener("change", () => ($<HTMLElement>(".custom-loc").hidden = city.value !== "custom"));
$<HTMLButtonElement>("#geo").addEventListener("click", () => {
  navigator.geolocation?.getCurrentPosition(
    (p) => {
      $<HTMLInputElement>("#lat").value = p.coords.latitude.toFixed(4);
      $<HTMLInputElement>("#lon").value = p.coords.longitude.toFixed(4);
    },
    () => showError("Couldn't get your location. Enter latitude and longitude instead."),
  );
});

function showError(msg: string) {
  const e = $<HTMLElement>("#error");
  e.textContent = msg;
  e.hidden = !msg;
}

function readForm() {
  const kWp = Number($<HTMLInputElement>("#kwp").value);
  let lat: number, lon: number;
  if (city.value === "custom") {
    lat = Number($<HTMLInputElement>("#lat").value);
    lon = Number($<HTMLInputElement>("#lon").value);
  } else [lat, lon] = CITIES[city.value];
  const tilt = Number($<HTMLInputElement>("#tilt").value || 25);
  const azimuth = FACING[$<HTMLSelectElement>("#facing").value] ?? 0;
  const tariff = Number($<HTMLInputElement>("#tariff").value) || undefined;
  const readings: DayReading[] = [];
  document.querySelectorAll<HTMLInputElement>(".day input").forEach((inp) => {
    if (inp.value.trim() !== "") readings.push({ date: DATES[Number(inp.dataset.i)], kWh: Number(inp.value) });
  });
  return { kWp, lat, lon, tilt, azimuth, tariff, readings };
}

async function viaAws(body: ReturnType<typeof readForm>): Promise<Outcome> {
  const r = await fetch(API_URL!, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (r.status >= 400 && r.status < 500) throw Object.assign(new Error(data.error || "Check your inputs"), { user: true });
  if (!r.ok) throw new Error(data.error || `Server error ${r.status}`);
  return { d: data.result, path: "aws", grid: data.grid };
}

async function viaBrowser(b: ReturnType<typeof readForm>, fallbackReason?: string): Promise<Outcome> {
  const sorted = [...b.readings].sort((x, y) => x.date.localeCompare(y.date));
  const daysBack = Math.ceil((Date.parse(todayIST()) - Date.parse(sorted[0].date)) / 86400_000);
  const { series, grid } = await fetchSatellite(b.lat, b.lon, b.tilt, b.azimuth, daysBack + 1);
  const irr = sorted.map((r) => irradiationForDate(series, r.date));
  return { d: diagnose({ kWp: b.kWp, tariffINRperKWh: b.tariff, gridEF_tCO2perMWh: GRID_EF }, sorted, irr), path: "browser", grid, fallbackReason };
}

$<HTMLFormElement>("#form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  showError("");
  $<HTMLElement>("#result").hidden = true; // never leave an old result next to a new error
  const b = readForm();
  if (!(b.kWp > 0)) return showError("Enter your system size in kW. It's on your installer's paperwork or inverter label.");
  if (!Number.isFinite(b.lat) || !Number.isFinite(b.lon)) return showError("Enter a valid location.");
  if (b.readings.length < 3) return showError("Enter at least 3 days. All 7 gives a much better comparison.");
  if (b.readings.some((r) => !(r.kWh >= 0))) return showError("Each day's reading must be a number of kWh.");

  const btn = $<HTMLButtonElement>(".primary");
  btn.disabled = true;
  btn.textContent = "Fetching satellite sunlight…";
  try {
    let out: Outcome;
    if (API_URL) {
      try {
        out = await viaAws(b);
      } catch (e) {
        if ((e as { user?: boolean }).user) throw e;
        out = await viaBrowser(b, "AWS service unreachable");
      }
    } else out = await viaBrowser(b, "AWS endpoint not configured");
    render(out, b.tariff);
  } catch (e) {
    showError(`${(e as Error).message}. No result is shown rather than a guess.`);
  } finally {
    btn.disabled = false;
    btn.textContent = "Check my system";
  }
});

$<HTMLButtonElement>("#demo").addEventListener("click", () => {
  showError("");
  const { readings, irr } = demoData(DATES);
  document.querySelectorAll<HTMLInputElement>(".day input").forEach((inp, i) => (inp.value = String(readings[i].kWh)));
  $<HTMLInputElement>("#kwp").value = String(DEMO_SYSTEM.kWp);
  city.value = "Delhi";
  const d = diagnose({ kWp: DEMO_SYSTEM.kWp, tariffINRperKWh: DEMO_SYSTEM.tariff, gridEF_tCO2perMWh: GRID_EF }, readings, irr);
  render({ d, path: "demo" }, DEMO_SYSTEM.tariff);
});

// --- results
const VERDICT = {
  ok: { icon: "✓", title: "Working as expected", cls: "v-ok" },
  watch: { icon: "!", title: "Slightly below usual", cls: "v-watch" },
  act: { icon: "▲", title: "Possible underperformance", cls: "v-act" },
  "insufficient-sun": { icon: "i", title: "Not enough sunlight to judge", cls: "v-info" },
  "check-inputs": { icon: "?", title: "Check your inputs", cls: "v-info" },
} as const;

const NEXT: Record<Diagnosis["verdict"], string[]> = {
  ok: ["Nothing to do. Check again next week, or after a dusty or smoggy spell."],
  watch: ["Keep entering daily readings for a few more days. One low day can be normal variation.", "If it stays low, look at the panels for dust, bird droppings or new shade."],
  act: [
    "Look at the panels from a safe spot: dust, bird droppings, leaves or a new shadow from a building, tree or water tank.",
    "Check the inverter display or app for error or fault codes.",
    "If the panels need cleaning, use water and a soft cloth early in the morning. Don't climb onto an unsafe roof; ask your installer instead.",
    "Enter the next few days after any fix and check again. Dhoop will show whether output returned to your usual level.",
  ],
  "insufficient-sun": ["Try again with days that had more sunshine."],
  "check-inputs": ["Make sure the system size (kW) and each day's reading are right, and that readings are daily totals."],
};

function render(o: Outcome, tariff?: number) {
  const { d } = o;
  const v = VERDICT[d.verdict];
  const showGap = d.verdict === "watch" || d.verdict === "act";
  const el = $<HTMLElement>("#result");
  // Draw charts at the real container width so text renders at true size on phones.
  const W = Math.max(300, Math.min(640, ($<HTMLElement>("main").clientWidth || 640) - 32 - 38));
  const pathBadge =
    o.path === "aws" ? `<span class="badge badge-aws">Computed on AWS Lambda</span>`
    : o.path === "browser" ? `<span class="badge">Computed in your browser (${o.fallbackReason})</span>`
    : `<span class="badge badge-demo">DEMO DATA: simulated system, not a real rooftop</span>`;

  el.innerHTML = `
  ${o.path === "demo" ? `<div class="demo-banner" role="note"><strong>Demo data.</strong> These readings and sunlight values are simulated to show how Dhoop works. They are not measurements from a real system.</div>` : ""}
  <div class="card verdict ${v.cls}">
    <div class="verdict-head"><span class="v-icon" aria-hidden="true">${v.icon}</span><div><p class="v-kicker">${fmtDate(d.today.date)} · ${pathBadge}</p><h2>${v.title}</h2></div></div>
    <p class="v-reason">${d.reason}</p>
    <dl class="stats">
      <div><dt>Performance ratio</dt><dd>${Number.isFinite(d.today.pr) ? d.today.pr.toFixed(2) : "–"}<span> vs ${d.baselineSource === "history" ? "your usual" : "typical"} ${d.baselinePR.toFixed(2)}</span></dd></div>
      <div><dt>Sunlight vs brightest day</dt><dd>−${Math.round(d.sunlightBelowBestPct * 100)}%<span> satellite-measured</span></dd></div>
      ${showGap ? `<div><dt>Possible shortfall</dt><dd>${d.recoverableKWhToday.toFixed(1)} kWh<span>that day${tariff && d.recoverableINRperMonth ? ` · ≈ ₹${Math.round(d.recoverableINRperMonth)}/month if it continues` : ""}${d.recoverableKgCO2perMonth ? ` · ≈ ${Math.round(d.recoverableKgCO2perMonth)} kg CO₂/month` : ""}</span></dd></div>` : ""}
    </dl>
  </div>

  <div class="card">
    <h3>Where the energy went on ${fmtDate(d.today.date)}</h3>
    ${threeBars(d, W)}
  </div>

  <div class="card">
    <h3>Day by day</h3>
    <p class="hint">Performance ratio = energy produced ÷ (sunlight on the panels × system size). It removes the effect of cloudy or hazy days, so a drop points at the system.</p>
    ${prBars(d, W)}
    <details class="table-view"><summary>Show as a table</summary>
      <table><thead><tr><th>Day</th><th>Produced</th><th>Sunlight on panels</th><th>Ratio</th></tr></thead><tbody>
      ${[...d.history, d.today].map((x) => `<tr><td>${fmtDate(x.date)}</td><td>${x.kWh.toFixed(1)} kWh</td><td>${x.irradiation.toFixed(2)} kWh/m²</td><td>${Number.isFinite(x.pr) ? x.pr.toFixed(2) : "–"}</td></tr>`).join("")}
      </tbody></table>
    </details>
  </div>

  <div class="card">
    <h3>What to do next</h3>
    <ol class="next">${NEXT[d.verdict].map((s) => `<li>${s}</li>`).join("")}</ol>
    <p class="hint">Dhoop can't see your roof, so it can't tell which of these is the cause. It only tells you whether output matched the sunlight.</p>
  </div>

  <details class="card method">
    <summary>How this works, and its limits</summary>
    <ul>
      <li>Sunlight comes from the ${o.path === "demo" ? "demo dataset (simulated)" : `Himawari satellite via Open-Meteo, for the ~5 km grid cell at ${o.grid?.lat.toFixed(3)}, ${o.grid?.lon.toFixed(3)}`}. Hourly values are summed into each day's total on the panels' angle.</li>
      <li>The comparison level is ${d.baselineSource === "history" ? "your own system's usual performance over the earlier days you entered (75th percentile)" : "a typical performance ratio of 0.80, because there were fewer than 5 earlier days"}.</li>
      <li>We flag a day only when it falls more than 8% (watch) or 15% (act) below that level, because a satellite estimate for one day and one area has its own error.</li>
      ${d.notes.map((n) => `<li>${n}</li>`).join("")}
    </ul>
  </details>`;
  el.hidden = false;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}
