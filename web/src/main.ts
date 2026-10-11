import "./style.css";
import { diagnose, irradiationForDate, type DayReading } from "../../engine/diagnose.ts";
import { fetchSatellite, todayIST, SOURCE } from "../../engine/satellite.ts";
import { arcLoader, heroIllustration, shortDate, sunPath, weekday } from "./charts.ts";
import { renderReport, drawReportCharts, type Outcome } from "./report.ts";
import { demoData, DEMO_SYSTEM } from "./demo.ts";

const API_URL: string | undefined = import.meta.env.VITE_API_URL || undefined;
const GRID_EF = import.meta.env.VITE_GRID_EF_TCO2_PER_MWH ? Number(import.meta.env.VITE_GRID_EF_TCO2_PER_MWH) : undefined;

const CITIES: Record<string, [number, number]> = {
  Delhi: [28.61, 77.21], Mumbai: [19.08, 72.88], Bengaluru: [12.97, 77.59], Chennai: [13.08, 80.27],
  Kolkata: [22.57, 88.36], Hyderabad: [17.39, 78.49], Pune: [18.52, 73.86], Ahmedabad: [23.02, 72.57],
  Jaipur: [26.91, 75.79], Lucknow: [26.85, 80.95], Chandigarh: [30.73, 76.78],
};
const FACING: Record<string, number> = { South: 0, "South-east": -45, "South-west": 45, East: -90, West: 90 };

const lastDays = (n: number) => {
  const t = Date.parse(todayIST() + "T00:00:00Z");
  return Array.from({ length: n }, (_, i) => new Date(t - (n - i) * 86400_000).toISOString().slice(0, 10));
};
const DATES = lastDays(7);
const $ = <T extends HTMLElement>(s: string) => document.querySelector(s) as T;

document.querySelector("#app")!.innerHTML = `
<a class="skip" href="#check">Skip to the check</a>
<header class="site-head">
  <div class="wrap site-head-inner">
    <a class="wordmark" href="#top" aria-label="Dhoop, home"><span class="mark" aria-hidden="true"></span>Dhoop</a>
    <nav aria-label="Main"><a href="#check">Check</a><a href="#method">Method &amp; limits</a><a href="#data">Data sources</a></nav>
  </div>
</header>

<div id="home">
  <section class="hero wrap" id="top" aria-labelledby="hero-title">
    <div class="hero-copy">
      <p class="eyebrow">For rooftop solar owners · India</p>
      <h1 id="hero-title">Is your solar producing what the sunlight allows?</h1>
      <p class="lede">Dust, new shade and inverter faults quietly cut a rooftop's clean energy, and on a hazy week an owner can't tell a fault from the weather. Enter a week of daily readings from your inverter. Dhoop sets each day against the sunlight a satellite estimates reached your roof, and tells you plainly when output falls clearly short of what that sunlight allowed.</p>
      <div class="hero-actions">
        <a class="btn btn-primary btn-lg" href="#check" id="cta">Check my solar performance</a>
        <button type="button" class="text-link" id="demo-hero">Explore a sample week <span aria-hidden="true">→</span></button>
      </div>
      <ul class="facts" aria-label="How it works">
        <li><strong>Live satellite sunlight</strong>Himawari, via Open-Meteo</li>
        <li><strong>Your own baseline</strong>Compared with your usual days</li>
        <li><strong>No guessed causes</strong>It flags; you inspect</li>
      </ul>
    </div>
    <figure class="hero-fig">
      ${heroIllustration()}
      <figcaption>Illustration, not data.</figcaption>
    </figure>
  </section>

  <section id="check" class="tool" aria-labelledby="tool-title">
    <div class="rule-sun rule-sun-edge">${sunPath("rule-sun-arc", { sun: true })}</div>
    <div class="wrap">
      <header class="tool-head">
        <h2 id="tool-title">Check your system</h2>
        <p>Two parts, about a minute with your inverter app open.</p>
      </header>

      <form id="form" class="tool-form" novalidate aria-labelledby="tool-title">
        <div class="progress" aria-hidden="true"></div>
        <div id="demo-note" class="source-band" role="note" hidden><span class="src-tag">Simulated</span><p><strong>Sample week loaded.</strong> The highlighted values are made up, not measurements. Type over them, or <button type="button" id="clear" class="text-link">clear the form</button>.</p></div>

        <fieldset class="part part-system" data-part="system">
          <legend><span class="part-n" aria-hidden="true">1</span>System details<span class="sr part-state"></span></legend>
          <div class="sys-grid">
            <label class="field f-city"><span class="lbl">City</span>
              <select id="city">${Object.keys(CITIES).map((c) => `<option>${c}</option>`).join("")}<option value="custom">Another place (latitude/longitude)</option></select>
            </label>
            <label class="field"><span class="lbl">System capacity</span><span class="unit" data-unit="kW"><input id="kwp" type="number" inputmode="decimal" min="0.5" max="100" step="0.1" required aria-describedby="sys-hint" /></span></label>
            <label class="field"><span class="lbl">Panel tilt</span><span class="unit" data-unit="°"><input id="tilt" type="number" min="0" max="60" value="25" inputmode="numeric" /></span></label>
            <label class="field"><span class="lbl">Panels face</span><select id="facing">${Object.keys(FACING).map((f) => `<option>${f}</option>`).join("")}</select></label>
            <label class="field"><span class="lbl">Electricity rate</span><span class="unit" data-unit="₹/kWh"><input id="tariff" type="number" min="0" step="0.1" value="8" inputmode="decimal" /></span></label>
          </div>
          <div class="custom-loc" hidden>
            <label class="field"><span class="lbl">Latitude</span><input id="lat" type="number" step="0.0001" inputmode="decimal" placeholder="28.6139" /></label>
            <label class="field"><span class="lbl">Longitude</span><input id="lon" type="number" step="0.0001" inputmode="decimal" placeholder="77.2090" /></label>
            <button type="button" id="geo" class="text-link">Use my current location</button>
          </div>
          <p class="hint" id="sys-hint">Capacity is on your installer's paperwork or the inverter label. The tilt and direction defaults suit most Indian rooftops; sunlight is estimated for a ~5 km area around your city.</p>
        </fieldset>

        <fieldset class="part part-gen" data-part="gen">
          <legend><span class="part-n" aria-hidden="true">2</span>Daily generation, last seven days<span class="sr part-state"></span></legend>
          <div class="gen-head">
            <p class="hint">Each day's total in kWh from your inverter app or display ("E-Today", "Daily yield"). Completed days only. Paste seven numbers into the first box to fill the week; Enter moves to the next day.</p>
            <div class="count-wrap">${sunPath("count-path", { w: 70, h: 24 })}<p class="count" id="count" aria-live="polite"></p></div>
          </div>
          <div class="week" role="group" aria-label="Daily generation in kWh">
            ${DATES.map((d, i) => `<label class="day"><span class="day-name">${weekday(d)}</span><span class="day-date">${shortDate(d)}</span><span class="day-field"><input type="number" inputmode="decimal" min="0" step="0.1" data-i="${i}" placeholder="0.0" aria-label="${weekday(d)} ${shortDate(d)}, kWh" aria-describedby="week-msg" /><span class="day-unit" aria-hidden="true">kWh</span></span><span class="day-bar" aria-hidden="true"><i></i></span></label>`).join("")}
          </div>
          <p class="week-msg" id="week-msg" aria-live="polite"></p>
        </fieldset>

        <div class="action-bar">
          <button type="submit" id="submit" class="btn btn-primary btn-lg primary">Check against satellite sunlight</button>
          <button type="button" id="demo" class="btn btn-secondary btn-lg">Use a simulated sample week</button>
          <p class="action-note">Sunlight is fetched live for your location. Readings stay in your browser${API_URL ? " and the Dhoop service" : ""}.</p>
        </div>
        <div id="error-box" class="error-box" role="alert" hidden>
          <p id="error" class="error"></p>
          <button type="button" id="error-demo" class="text-link" hidden>Show the simulated sample week instead (works offline)</button>
        </div>
      </form>
    </div>
  </section>

  <section id="method" class="method wrap" aria-labelledby="method-title">
    <header class="method-head">
      <p class="eyebrow">Method &amp; limits</p>
      <h2 id="method-title">What Dhoop measures, and what it doesn't</h2>
    </header>
    <div class="method-grid">
      <div><h3>The sunlight</h3><p>Hourly sunlight on the panels' angle from the Himawari satellite, via Open-Meteo, summed into each day. It is an estimate for a ~5 km area, fetched live for your location. Days with missing satellite hours are never judged.</p></div>
      <div><h3>The comparison</h3><p>Each day's output divided by its sunlight and system size gives a performance ratio. Dhoop compares the latest day with your system's own usual level (the 75th percentile of earlier days), or a typical 0.80 with fewer than five earlier days.</p></div>
      <div><h3>What it won't claim</h3><p>It never names a cause. A low day is "possible underperformance", flagged only beyond 8% or 15% below usual to leave room for satellite error; these thresholds are our judgement. It doesn't measure air pollution.</p></div>
    </div>
  </section>
</div>

<section id="result" class="report-page" aria-label="Your report" hidden></section>

<footer class="site-foot">
  <div class="wrap foot-grid">
    <div class="foot-brand">
      <a class="wordmark" href="#top"><span class="mark" aria-hidden="true"></span>Dhoop</a>
      <p>Solar performance, in context.</p>
    </div>
    <div>
      <p class="foot-h">Check</p>
      <ul><li><a href="#check">Run a check</a></li><li><button type="button" class="foot-link" id="demo-foot">Explore a sample week</button></li></ul>
    </div>
    <div>
      <p class="foot-h">Method &amp; limits</p>
      <ul><li><a href="#method">How Dhoop compares</a></li><li><a href="#method">What it can't tell you</a></li></ul>
    </div>
    <div id="data">
      <p class="foot-h">Data sources</p>
      <ul><li><a href="https://open-meteo.com/">Open-Meteo</a> Satellite Radiation API, CC BY 4.0</li><li>JMA/JAXA Himawari satellite</li></ul>
    </div>
  </div>
  <div class="wrap foot-base">
    <p>Sunlight data: ${SOURCE}.</p>
    <p>Built for the WeMakeDevs × AWS Bharat Builds Tour, Environmental Hacks.</p>
  </div>
</footer>`;

// --- elements
const home = $<HTMLElement>("#home");
const form = $<HTMLFormElement>("#form");
const city = $<HTMLSelectElement>("#city");
const result = $<HTMLElement>("#result");
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const scrollBehavior = (): ScrollBehavior => (reducedMotion() ? "auto" : "smooth");

const dayInputs = () => Array.from(document.querySelectorAll<HTMLInputElement>(".day input"));
// Demo values are tracked per box, so a result can never quietly mix simulated and real readings.
const valueInputs = () => [$<HTMLInputElement>("#kwp"), ...dayInputs()];
const hasDemoValues = () => valueInputs().some((i) => i.dataset.demo === "1");

function showError(msg: string, offerDemo = false) {
  $<HTMLElement>("#error").textContent = msg;
  $<HTMLElement>("#error-box").hidden = !msg;
  $<HTMLElement>("#error-demo").hidden = !offerDemo;
}

const syncDemoNote = () => {
  const on = hasDemoValues();
  $<HTMLElement>("#demo-note").hidden = !on;
  form.classList.toggle("has-demo", on);
};

function readForm() {
  const kWp = Number($<HTMLInputElement>("#kwp").value);
  let lat: number, lon: number;
  if (city.value === "custom") {
    lat = Number($<HTMLInputElement>("#lat").value.trim() || NaN);
    lon = Number($<HTMLInputElement>("#lon").value.trim() || NaN);
  } else [lat, lon] = CITIES[city.value];
  const tilt = Number($<HTMLInputElement>("#tilt").value || 25);
  const azimuth = FACING[$<HTMLSelectElement>("#facing").value] ?? 0;
  const tariff = Number($<HTMLInputElement>("#tariff").value) || undefined;
  const readings: DayReading[] = [];
  dayInputs().forEach((inp) => {
    if (inp.value.trim() !== "") readings.push({ date: DATES[Number(inp.dataset.i)], kWh: Number(inp.value) });
  });
  return { kWp, lat, lon, tilt, azimuth, tariff, readings };
}
const placeName = (b: ReturnType<typeof readForm>) => (city.value === "custom" ? `${b.lat.toFixed(2)}, ${b.lon.toFixed(2)}` : city.value);

// Each part of the form shows when it holds enough to run the check.
function syncParts() {
  const b = readForm();
  const done = {
    system: b.kWp > 0 && Number.isFinite(b.lat) && Number.isFinite(b.lon),
    gen: b.readings.filter((r) => r.kWh >= 0).length >= 3,
  };
  for (const [k, ok] of Object.entries(done)) {
    const fs = $<HTMLElement>(`.part[data-part="${k}"]`);
    fs.classList.toggle("is-done", ok);
    fs.querySelector(".part-state")!.textContent = ok ? " (complete)" : "";
  }
}

// Live feedback on the week: a small bar per day shows its shape, so a slipped decimal stands
// out, and readings that can't be right are flagged before submitting.
function syncWeek() {
  const vals = dayInputs().map((i) => (i.value.trim() === "" ? NaN : Number(i.value)));
  const max = Math.max(...vals.filter((v) => v > 0), 0);
  const kWp = Number($<HTMLInputElement>("#kwp").value);
  const msgs: string[] = [];
  dayInputs().forEach((inp, i) => {
    const v = vals[i];
    const bad = inp.value.trim() !== "" && !(v >= 0);
    // ~8 kWh per kW in a day would need a performance ratio above 1 even on India's sunniest days.
    const high = v >= 0 && kWp > 0 && v > kWp * 8;
    inp.setAttribute("aria-invalid", String(bad));
    inp.classList.toggle("is-high", high);
    inp.closest<HTMLElement>(".day")!.style.setProperty("--v", v > 0 && max > 0 ? String(v / max) : "0");
    if (bad) msgs.push(`${weekday(DATES[i])}: enter a number of kWh, 0 or more.`);
    else if (high) msgs.push(`${weekday(DATES[i])}: ${v} kWh is unusually high for a ${kWp} kW system. Check the decimal point.`);
  });
  $<HTMLElement>("#week-msg").textContent = msgs.join(" ");
  $<HTMLElement>(".week").classList.toggle("has-values", max > 0);
  const n = vals.filter((v) => v >= 0).length;
  // the counter's seven points fill as days are entered; sample values fill in yellow
  document.querySelectorAll<SVGCircleElement>(".count-path .sp-dot").forEach((c, i) => {
    c.classList.toggle("is-on", vals[i] >= 0);
    c.classList.toggle("is-demo", dayInputs()[i].dataset.demo === "1");
  });
  $<HTMLElement>("#count").textContent = n === 7 ? "All 7 days entered" : `${n} of 7 days entered${n < 3 ? " · at least 3 needed" : ""}`;
  syncParts();
}

// --- form wiring
const syncLoc = () => {
  $<HTMLElement>(".custom-loc").hidden = city.value !== "custom";
  syncParts();
};
city.addEventListener("change", syncLoc);
for (const id of ["#lat", "#lon"]) $<HTMLInputElement>(id).addEventListener("input", syncParts);
// Browsers only allow location on HTTPS (or localhost); on a plain-HTTP page the button can't work.
$<HTMLButtonElement>("#geo").hidden = !window.isSecureContext;
$<HTMLButtonElement>("#geo").addEventListener("click", () => {
  navigator.geolocation?.getCurrentPosition(
    (p) => {
      $<HTMLInputElement>("#lat").value = p.coords.latitude.toFixed(4);
      $<HTMLInputElement>("#lon").value = p.coords.longitude.toFixed(4);
      syncParts();
      markStale();
    },
    () => showError("Couldn't get your location. Enter latitude and longitude instead."),
  );
});

function markStale() {
  result.querySelector<HTMLElement>(".stale-note")?.removeAttribute("hidden");
}
for (const inp of valueInputs()) {
  inp.addEventListener("input", () => {
    delete inp.dataset.demo;
    syncDemoNote();
    syncWeek();
  });
}
form.addEventListener("input", markStale);
form.addEventListener("change", markStale);

dayInputs().forEach((inp, i) => {
  // Pasting a column or row of numbers fills this box and the ones after it.
  inp.addEventListener("paste", (ev) => {
    const nums = (ev.clipboardData?.getData("text") ?? "").split(/[\s,;]+/).filter(Boolean);
    if (nums.length < 2 || nums.some((n) => !Number.isFinite(Number(n)))) return;
    ev.preventDefault();
    const boxes = dayInputs().slice(i);
    nums.slice(0, boxes.length).forEach((n, k) => {
      boxes[k].value = n;
      delete boxes[k].dataset.demo;
    });
    syncDemoNote();
    syncWeek();
    markStale();
  });
  // Enter moves to the next day; on the last day it submits as usual.
  inp.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && i < 6) {
      ev.preventDefault();
      dayInputs()[i + 1].focus();
    }
  });
});

$<HTMLButtonElement>("#clear").addEventListener("click", () => {
  for (const i of valueInputs()) {
    i.value = "";
    delete i.dataset.demo;
  }
  syncDemoNote();
  syncWeek();
  showError("");
  hasReport = false;
  result.innerHTML = "";
  $<HTMLInputElement>("#kwp").focus();
});

// --- views: the home page (introduction, tool, method) and the results page (#report)
let hasReport = false;
let chartsPending: Outcome | null = null;

/** The first field still needing input, so moving to the tool lands somewhere useful. */
const firstEmpty = () => (!($<HTMLInputElement>("#kwp").value) ? $<HTMLInputElement>("#kwp") : dayInputs().find((i) => i.value === "") ?? dayInputs()[6]);

function route() {
  const h = location.hash;
  if (h === "#report" && hasReport) {
    home.hidden = true;
    result.hidden = false;
    window.scrollTo(0, 0);
    if (chartsPending) {
      drawReportCharts(result, chartsPending);
      chartsPending = null;
    }
    result.querySelector<HTMLElement>("#verdict-title")?.focus({ preventScroll: true });
    return;
  }
  const wasHidden = home.hidden;
  result.hidden = true;
  home.hidden = false;
  const target = h.length > 1 ? document.querySelector<HTMLElement>(h) : null;
  if (target) target.scrollIntoView({ behavior: wasHidden ? "auto" : scrollBehavior(), block: "start" });
  else if (wasHidden) window.scrollTo(0, 0);
  if (h === "#check") firstEmpty().focus({ preventScroll: true });
}
window.addEventListener("hashchange", route);
// Following a link to the hash already in the URL fires no hashchange; route anyway.
document.addEventListener("click", (e) => {
  const a = (e.target as Element).closest?.("a[href^='#']");
  if (a && a.getAttribute("href") === location.hash) {
    e.preventDefault();
    route();
  }
});

function show(o: Outcome, tariff?: number) {
  renderReport(result, o, tariff);
  hasReport = true;
  chartsPending = o;
  if (location.hash === "#report") route();
  else location.hash = "report";
}

type Computed = Omit<Outcome, "kWp" | "place">;

async function viaAws(body: ReturnType<typeof readForm>): Promise<Computed> {
  const r = await fetch(API_URL!, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
  const data = await r.json().catch(() => ({}));
  if (r.status >= 400 && r.status < 500) throw Object.assign(new Error(data.error || "Check your inputs"), { user: true });
  if (!r.ok) throw new Error(data.error || `Server error ${r.status}`);
  return { d: data.result, path: "aws", grid: data.grid, sunlight: data.sunlight };
}

async function viaBrowser(b: ReturnType<typeof readForm>, fallbackReason?: string): Promise<Computed> {
  const sorted = [...b.readings].sort((x, y) => x.date.localeCompare(y.date));
  const daysBack = Math.ceil((Date.parse(todayIST()) - Date.parse(sorted[0].date)) / 86400_000);
  const { series, grid, meta } = await fetchSatellite(b.lat, b.lon, b.tilt, b.azimuth, daysBack + 1);
  const irr = sorted.map((r) => irradiationForDate(series, r.date));
  const sunlight = { source: SOURCE, grid, first: meta.first, last: meta.last, hours: meta.hours, retrievedAt: new Date().toISOString() };
  return { d: diagnose({ kWp: b.kWp, tariffINRperKWh: b.tariff, gridEF_tCO2perMWh: GRID_EF }, sorted, irr), path: "browser", grid, sunlight, fallbackReason };
}

function fail(msg: string, focusSel: string) {
  showError(msg);
  const target = document.querySelector<HTMLElement>(focusSel);
  if (target && !target.closest("[hidden]")) target.focus();
}

form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  showError("");
  const b = readForm();
  if (!(b.kWp > 0)) return fail("Enter your system capacity in kW. It's on your installer's paperwork or inverter label.", "#kwp");
  if (!Number.isFinite(b.lat) || !Number.isFinite(b.lon)) return fail("Enter a valid location.", "#lat");
  if (b.lat < 6 || b.lat > 37 || b.lon < 68 || b.lon > 98) return fail("Dhoop works for locations in India only. Check the latitude and longitude.", "#lat");
  if (b.readings.length < 3) return fail("Enter at least 3 days. All 7 gives a much better comparison.", ".day input");
  if (b.readings.some((r) => !(r.kWh >= 0))) return fail("Each day's reading must be a number of kWh.", ".day input[aria-invalid='true']");

  const btn = $<HTMLButtonElement>("#submit");
  btn.disabled = true;
  btn.innerHTML = `${arcLoader()}<span>Reading satellite sunlight…</span>`;
  form.classList.add("is-loading");
  form.setAttribute("aria-busy", "true");
  try {
    let out: Computed;
    if (API_URL) {
      try {
        out = await viaAws(b);
      } catch (e) {
        if ((e as { user?: boolean }).user) throw e;
        out = await viaBrowser(b, "AWS service unreachable");
      }
    } else out = await viaBrowser(b, "AWS endpoint not configured");
    show({ ...out, kWp: b.kWp, place: placeName(b), demoInputs: hasDemoValues() }, b.tariff);
  } catch (e) {
    const user = (e as { user?: boolean }).user;
    showError(`${(e as Error).message}. No result is shown rather than a guess.${user ? "" : " Real readings can only be judged against satellite sunlight."}`, !user);
  } finally {
    btn.disabled = false;
    btn.textContent = "Check against satellite sunlight";
    form.classList.remove("is-loading");
    form.removeAttribute("aria-busy");
  }
});

// The sample runs entirely in the browser on simulated sunlight, so it works with no network.
function runDemo() {
  showError("");
  const { readings, irr } = demoData(DATES);
  dayInputs().forEach((inp, i) => {
    inp.value = String(readings[i].kWh);
    inp.dataset.demo = "1";
  });
  const kwp = $<HTMLInputElement>("#kwp");
  kwp.value = String(DEMO_SYSTEM.kWp);
  kwp.dataset.demo = "1";
  city.value = "Delhi";
  syncLoc();
  syncDemoNote();
  syncWeek();
  const d = diagnose({ kWp: DEMO_SYSTEM.kWp, tariffINRperKWh: DEMO_SYSTEM.tariff, gridEF_tCO2perMWh: GRID_EF }, readings, irr);
  show({ d, path: "demo", kWp: DEMO_SYSTEM.kWp, place: "Delhi (sample)" }, DEMO_SYSTEM.tariff);
}
for (const id of ["#demo", "#demo-hero", "#demo-foot", "#error-demo"]) $<HTMLButtonElement>(id).addEventListener("click", runDemo);

// A report link with nothing to show (e.g. after a reload) falls back to the home page.
if (location.hash === "#report") history.replaceState(null, "", location.pathname + location.search);
syncWeek();
route();
