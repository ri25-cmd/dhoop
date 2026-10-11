// The results page. Pure rendering: every number comes from the engine's Diagnosis.
import type { Diagnosis } from "../../engine/diagnose.ts";
import { dailyChart, ratioGauge, shortDate, sunGlyph, sunPath, weekday, type ChartPoint } from "./charts.ts";

export type Path = "aws" | "browser" | "demo";
export interface Outcome {
  d: Diagnosis;
  path: Path;
  kWp: number;
  place: string;
  grid?: { lat: number; lon: number };
  fallbackReason?: string;
  demoInputs?: boolean;
  sunlight?: Sunlight; // provenance of real satellite data; absent for the simulated sample
}
export interface Sunlight {
  source: string;
  grid: { lat: number; lon: number };
  first: string; // first hourly label used, local IST, hour-ending
  last: string;
  hours: number;
  retrievedAt: string; // ISO
}

const istTime = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });

/** Where the numbers came from: the satellite source and window, and who supplied the readings. */
function provenance(o: Outcome): string {
  if (o.path === "demo") return `<p class="provenance"><strong>Sunlight:</strong> simulated for this sample, not satellite data. <strong>Readings:</strong> simulated.</p>`;
  const s = o.sunlight;
  const readings = o.demoInputs ? "include simulated sample values" : "entered by you";
  const all = o.d.days ?? [...o.d.history, o.d.today];
  const days = all.length > 1 ? `${shortDate(all[0].date)} to ${shortDate(all[all.length - 1].date)}` : shortDate(all[0].date);
  if (!s) return `<p class="provenance"><strong>Sunlight:</strong> Open-Meteo satellite estimate (Himawari). <strong>Readings:</strong> ${readings}.</p>`;
  return `<p class="provenance"><strong>Sunlight:</strong> satellite estimate from the Open-Meteo Satellite Radiation API (JMA/JAXA Himawari), ~5 km grid cell at ${s.grid.lat.toFixed(2)}°N, ${s.grid.lon.toFixed(2)}°E. Hourly values summed into each day you entered, ${days}, fetched at ${istTime(s.retrievedAt)} IST. <strong>Readings:</strong> ${readings}.</p>`;
}

const VERDICT = {
  ok: { title: "Working as expected", tone: "ok", status: "Within the normal range" },
  watch: { title: "Slightly below usual", tone: "watch", status: "Worth watching" },
  act: { title: "Possible underperformance", tone: "act", status: "Worth checking" },
  "insufficient-sun": { title: "Not enough sunlight to judge", tone: "info", status: "No verdict" },
  "check-inputs": { title: "Check your inputs", tone: "info", status: "No verdict" },
  "no-data": { title: "Satellite data incomplete", tone: "info", status: "No verdict" },
} as const;

// Ordered by priority: the first item is the one to do first.
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
  "no-data": ["Try again in a few hours, once the satellite data for that day has been processed.", "Or judge an earlier day: leave the latest box empty."],
};

const longDate = (d: string) => `${weekday(d)} ${shortDate(d)}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** The engine's thresholds, expressed as measured ÷ expected (= PR ÷ baseline PR). */
function thresholds(d: Diagnosis) {
  return d.baselineSource === "history"
    ? { watchBelow: 0.92, actBelow: 0.85 } // systemLossPct > 8% / > 15%
    : { watchBelow: 0.7 / d.baselinePR, actBelow: 0.6 / d.baselinePR }; // PR < 0.70 / < 0.60
}

function why(d: Diagnosis, sim: boolean): string {
  const r = d.today.pr / d.baselinePR;
  const t = thresholds(d);
  const level = d.baselineSource === "history" ? `your system's usual level over the earlier days (ratio ${d.baselinePR.toFixed(2)})` : `a typical level (ratio ${d.baselinePR.toFixed(2)}), because fewer than five earlier days were usable`;
  const what =
    d.verdict === "act"
      ? "That is further below expected than Dhoop's allowance for satellite error, so something on the roof or in the system may be holding output back. It is a prompt to look, not a confirmed fault."
      : d.verdict === "watch"
        ? "That is a little below expected. One such day can be normal variation; several in a row would be worth a look."
        : "That is within the range satellite estimates and day-to-day variation normally produce.";
  return `<p>On ${longDate(d.today.date)} the system made <strong>${pct(r)}</strong> of what ${sim ? "the simulated" : "that day's"} sunlight should have produced at ${level}.</p><p>${what}</p><p class="why-rule">Dhoop flags a day below ${pct(t.watchBelow)} as slightly low, and below ${pct(t.actBelow)} as possible underperformance.</p>`;
}

export function renderReport(el: HTMLElement, o: Outcome, tariff?: number) {
  const { d } = o;
  const v = VERDICT[d.verdict];
  const flagged = d.verdict === "watch" || d.verdict === "act";
  const sim = o.path === "demo";
  const judged = ["ok", "watch", "act"].includes(d.verdict);
  const allDays = d.days ?? [...d.history, d.today]; // older Lambda builds don't send `days`
  const expected = d.bar.expectedTodayKWh;
  const gap = d.today.kWh - expected;

  const sourceBand = sim
    ? `<div class="source-band" role="note"><span class="src-tag">Simulated</span><p><strong>Simulated sample week.</strong> These readings and this sunlight are made up to show how Dhoop works. They are not measurements from any real installation.</p></div>`
    : o.demoInputs
      ? `<div class="source-band" role="note"><span class="src-tag">Not a real result</span><p><strong>Includes sample values.</strong> Some readings or the system size are still from the simulated sample, checked against real satellite sunlight.</p></div>`
      : `<div class="source-band source-real" role="note"><span class="src-tag">Live satellite data</span><p><strong>Real sunlight, your readings.</strong> Each day's sunlight was fetched just now from the Himawari satellite via Open-Meteo. The generation readings are the ones you entered. Expected output and any shortfall are Dhoop's estimates.</p></div>`;
  const pathNote =
    o.path === "aws" ? "Computed on AWS Lambda"
    : o.path === "browser" ? `Computed in your browser (${o.fallbackReason})`
    : "Computed in your browser from the sample";

  // At a glance: measured as a share of expected, drawn on one scale (the same ratio the
  // "why" section and the threshold scale use).
  const ratio = expected > 0 ? d.today.kWh / expected : NaN;
  const scaleMax = Math.max(d.today.kWh, expected);
  const w = (x: number) => `${((x / scaleMax) * 100).toFixed(1)}%`;
  const meter = judged && Number.isFinite(ratio)
    ? `<div class="cmp">
        <p class="cmp-head"><span class="cmp-n">${pct(ratio)}</span><span class="cmp-of">of the output the sunlight allowed</span></p>
        <div class="cmp-track" aria-hidden="true">
          <span class="cmp-fill" style="width:${w(d.today.kWh)}"></span>
          ${flagged && expected > d.today.kWh ? `<span class="cmp-gap" style="left:${w(d.today.kWh)};width:${w(expected - d.today.kWh)}"></span>` : ""}
          <span class="cmp-exp" style="left:${w(expected)}"></span>
        </div>
      </div>`
    : "";
  const money = flagged && tariff && d.recoverableINRperMonth
    ? `<p class="fig-money">If every day fell this short: about ₹${(Math.round(d.recoverableINRperMonth / 10) * 10).toLocaleString("en-IN")} a month at ₹${tariff}/kWh${d.recoverableKgCO2perMonth ? `, ${Math.round(d.recoverableKgCO2perMonth)} kg CO₂` : ""}. An estimate, not a measured loss.</p>`
    : "";

  const sum = (cls: string, label: string, value: string, note: string) =>
    `<div class="sum ${cls}"><dt><span class="sum-key" aria-hidden="true"></span>${label}</dt><dd><span class="sum-n">${value}<small> kWh</small></span><span class="sum-note">${note}</span></dd></div>`;

  el.innerHTML = `
  <div class="wrap report-wrap">
    <nav class="report-nav" aria-label="Report">
      <a href="#check" class="back-link edit-link">← Edit readings</a>
      <p class="report-meta">${longDate(d.today.date)} · ${o.place} · ${o.kWp} kW · <span>${pathNote}</span></p>
    </nav>
    ${sourceBand}
    ${provenance(o)}
    <p class="stale-note" hidden role="status">Your inputs have changed since this report. Run the check again to update it.</p>

    <section class="verdict tone-${v.tone}" aria-labelledby="verdict-title">
      <div class="verdict-main">
        <p class="status">${sunGlyph("status-sun")}${v.status}${judged ? ` · ${longDate(d.today.date)}` : ""}</p>
        <h1 id="verdict-title" tabindex="-1">${v.title}</h1>
        <p class="v-reason">${d.reason}</p>
        <p class="v-caveat"><strong>${sim ? "Simulated." : "Uncertainty."}</strong> ${sim
          ? "Sample readings and sunlight are made up, so this verdict says nothing about a real system."
          : "Sunlight is a satellite estimate for a ~5 km area. Small differences are within normal uncertainty, and Dhoop can't see the cause of a drop: it only compares output with the sunlight."}</p>
      </div>
      ${judged ? `<div class="figs-wrap">${meter}<dl class="figs" aria-label="Latest day in numbers">
        ${sum("sum-made", sim ? "Simulated reading" : "Measured", d.today.kWh.toFixed(1), sim ? "Sample value" : "From your inverter")}
        ${sum("sum-exp", "Expected", expected.toFixed(1), `For that day's ${sim ? "simulated" : "satellite-estimated"} sunlight`)}
        ${sum(flagged ? "sum-gap" : "sum-diff", flagged ? "Possible shortfall" : "Difference", flagged ? Math.abs(gap).toFixed(1) : `${gap < 0 ? "−" : "+"}${Math.abs(gap).toFixed(1)}`, flagged ? "An estimate, not a confirmed loss" : "Within normal uncertainty")}
      </dl>
      ${money}</div>` : ""}
    </section>

    <section class="chart-section" aria-labelledby="chart-title">
      <header class="section-head">
        <h2 id="chart-title">Seven days: what was made, and what the sunlight allowed</h2>
        <div id="legend-slot"></div>
      </header>
      <div class="chart-frame">
        <div class="chart" id="chart-slot"><div class="tip" id="chart-tip" role="status" hidden></div></div>
        <p class="chart-note">Expected = ${sim ? "simulated" : "satellite-estimated"} sunlight on the panels × ${o.kWp} kW × ${d.baselineSource === "history" ? "your usual" : "a typical"} performance ratio of ${d.baselinePR.toFixed(2)}. Figures are rounded. Hover, tap or tab through the days for details.</p>
        <details class="numbers"><summary>Show the numbers</summary>
          <div class="table-scroll"><table><thead><tr><th scope="col">Day</th><th scope="col">${sim ? "Simulated" : "Measured"}</th><th scope="col">Sunlight on panels</th><th scope="col">Ratio</th><th scope="col">In usual level</th></tr></thead><tbody>
          ${allDays.map((x) => `<tr${x.date === d.today.date ? ' class="row-latest"' : ""}><th scope="row">${longDate(x.date)}</th><td>${x.kWh.toFixed(1)} kWh</td><td>${x.irradiation.toFixed(2)} kWh/m²</td><td>${Number.isFinite(x.pr) ? x.pr.toFixed(2) : "–"}</td><td>${x.date === d.today.date ? "Day being checked" : x.excluded ? `No: ${x.excluded}` : "Yes"}</td></tr>`).join("")}
          </tbody></table></div>
        </details>
      </div>
    </section>

    <div class="analysis">
      ${judged ? `<section class="why" aria-labelledby="why-title">
        <h2 id="why-title">Why it ${flagged ? "was" : "wasn't"} flagged</h2>
        <div class="why-text">${why(d, sim)}</div>
        <div class="gauge-wrap" id="gauge-slot"></div>
      </section>` : ""}
      <section class="next-steps" aria-labelledby="next-title">
        <h2 id="next-title">What to do next</h2>
        <ol class="next">${NEXT[d.verdict].map((s) => `<li>${s}</li>`).join("")}</ol>
      </section>
    </div>

    <div class="rule-sun">${sunPath("rule-sun-arc", { sun: true })}</div>
    <section class="limits" aria-labelledby="limits-title">
      <h2 id="limits-title">What this can't tell you</h2>
      <ul>
        <li>It can't see your roof, so it can't tell whether a drop comes from dirt, shade, a fault or something else.</li>
        <li>${sim ? "The sunlight here is simulated." : `Sunlight comes from the Himawari satellite via Open-Meteo for the ~5 km grid cell at ${o.grid?.lat.toFixed(3)}, ${o.grid?.lon.toFixed(3)}.`} Local shade, panel temperature and true orientation aren't captured.</li>
        <li>It doesn't measure air pollution or haze; it only uses the sunlight that reached the ground.</li>
      </ul>
      <p class="limits-foot">The comparison level is ${d.baselineSource === "history" ? "your own system's usual performance over the earlier days (75th percentile)" : "a typical performance ratio of 0.80, because there were fewer than 5 earlier days"}; the 8% and 15% thresholds are our judgement. <a href="#method">Read the full method &amp; limitations</a></p>
      ${d.notes.length ? `<details class="calc-notes"><summary>Calculation notes for this check</summary><ul>${d.notes.map((n) => `<li>${n}</li>`).join("")}</ul></details>` : ""}
    </section>
  </div>`;
  el.hidden = false;
}

/** Draws the charts once the report is visible, at their real widths. */
export function drawReportCharts(el: HTMLElement, o: Outcome) {
  const { d } = o;
  const flagged = d.verdict === "watch" || d.verdict === "act";
  const sim = o.path === "demo";
  const allDays = d.days ?? [...d.history, d.today];
  const slot = el.querySelector<HTMLElement>("#chart-slot")!;
  const noExpected = new Set(allDays.filter((x) => x.excluded === "satellite data incomplete").map((x) => x.date));
  if (d.verdict === "no-data") noExpected.add(d.today.date);
  const chart = dailyChart(allDays, { kWp: o.kWp, baselinePR: d.baselinePR, latest: d.today.date, flagged, simulated: sim, noExpected, W: Math.max(300, Math.round(slot.clientWidth)) });
  slot.insertAdjacentHTML("afterbegin", chart.svg);
  slot.insertAdjacentHTML("afterend", chart.footnote);
  el.querySelector("#legend-slot")!.innerHTML = chart.legend;
  wireTooltip(slot, chart.points, sim, flagged);

  const gslot = el.querySelector<HTMLElement>("#gauge-slot");
  if (gslot) {
    const ratios = allDays
      .filter((x) => Number.isFinite(x.pr) && (x.date === d.today.date || !x.excluded))
      .map((x) => ({ date: x.date, r: x.pr / d.baselinePR, latest: x.date === d.today.date }));
    const t = thresholds(d);
    gslot.innerHTML = `${ratioGauge({ ...t, ratios, W: Math.max(280, Math.round(gslot.clientWidth)) })}
      <ul class="gauge-key">
        <li><span class="gk gk-act"></span>Possible underperformance, below ${pct(t.actBelow)}</li>
        <li><span class="gk gk-watch"></span>Slightly below, ${pct(t.actBelow)}–${pct(t.watchBelow)}</li>
        <li><span class="gk gk-ok"></span>Normal variation</li>
        <li><span class="gk gk-day"></span>Earlier days</li>
        <li><span class="gk gk-usual"></span>100% = expected</li>
      </ul>`;
  }
}

function wireTooltip(slot: HTMLElement, points: ChartPoint[], sim: boolean, flagged: boolean) {
  const tip = slot.querySelector<HTMLElement>("#chart-tip")!;
  const show = (g: SVGGElement) => {
    const p = points[Number(g.dataset.i)];
    const hasExp = Number.isFinite(p.expected);
    // the same one-scale comparison as the summary: measured fill, expected mark, any gap hatched
    const max = hasExp ? Math.max(p.measured, p.expected) : p.measured;
    const at = (v: number) => `${max > 0 ? ((v / max) * 100).toFixed(1) : 0}%`;
    const short = p.latest && flagged && hasExp && p.expected > p.measured;
    const bar = hasExp && max > 0
      ? `<div class="tip-bar" aria-hidden="true"><span class="cmp-fill" style="width:${at(p.measured)}"></span>${short ? `<span class="cmp-gap" style="left:${at(p.measured)};width:${at(p.expected - p.measured)}"></span>` : ""}<span class="cmp-exp" style="left:${at(p.expected)}"></span></div>`
      : "";
    tip.innerHTML = `<p class="tip-date">${p.latest ? sunGlyph("tip-sun") : ""}${longDate(p.date)}${p.latest ? " · day being checked" : ""}</p>
      <dl>
        <div><dt><span class="tk tk-made"></span>${sim ? "Simulated" : "Measured"}</dt><dd>${p.measured.toFixed(1)} kWh</dd></div>
        <div><dt><span class="tk tk-exp"></span>Expected</dt><dd>${hasExp ? `${p.expected.toFixed(1)} kWh` : "–"}</dd></div>
        <div><dt>Sunlight</dt><dd>${p.irradiation.toFixed(2)} kWh/m²</dd></div>
        <div><dt>Made vs expected</dt><dd>${hasExp && p.expected > 0 ? pct(p.measured / p.expected) : "–"}</dd></div>
        ${short ? `<div class="tip-gap"><dt><span class="tk tk-gap"></span>Possible shortfall</dt><dd>${(p.expected - p.measured).toFixed(1)} kWh</dd></div>` : ""}
      </dl>${bar}${short ? `<p class="tip-note">An estimate from satellite sunlight, not a measured loss.</p>` : ""}${p.excluded ? `<p class="tip-note">Not in usual level: ${p.excluded}</p>` : ""}`;
    tip.hidden = false;
    // Beside the column, so it never covers the bar it describes. On phones the tip is a panel
    // under the chart instead (set in CSS), and needs no position.
    if (getComputedStyle(tip).position === "absolute") {
      const box = slot.getBoundingClientRect();
      const r = (g.querySelector(".hit") ?? g).getBoundingClientRect();
      const barTop = Math.min(...Array.from(g.querySelectorAll(".bar, .exp")).map((b) => b.getBoundingClientRect().top)) - box.top;
      const right = r.right - box.left + 8;
      const left = right + tip.offsetWidth <= box.width ? right : r.left - box.left - 8 - tip.offsetWidth;
      tip.style.left = `${Math.max(0, left)}px`;
      tip.style.top = `${Math.min(Math.max(barTop - 8, 0), box.height - tip.offsetHeight)}px`;
    }
    slot.querySelectorAll(".col.is-active").forEach((c) => c.classList.remove("is-active"));
    g.classList.add("is-active");
  };
  const hide = () => {
    tip.hidden = true;
    slot.querySelectorAll(".col.is-active").forEach((c) => c.classList.remove("is-active"));
  };
  slot.querySelectorAll<SVGGElement>(".col").forEach((g) => {
    g.addEventListener("mouseenter", () => show(g));
    g.addEventListener("focus", () => show(g));
    g.addEventListener("click", () => show(g));
  });
  slot.addEventListener("mouseleave", hide);
  slot.addEventListener("focusout", (e) => {
    if (!slot.contains(e.relatedTarget as Node)) hide();
  });
  slot.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hide();
  });
}
