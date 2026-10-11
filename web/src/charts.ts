import type { DayResult } from "../../engine/diagnose.ts";

// Hand-drawn SVG, no chart library. Data charts are rendered at their real container width so
// text stays at true size on phones; CSS handles colour (light/dark) and motion.
// Colour carries the same meaning everywhere: green = measured output, yellow = sunlight and the
// output it should allow, coral = a possible shortfall.

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const kwh = (x: number) => `${x.toFixed(1)} kWh`;
const dayOf = (d: string, o: Intl.DateTimeFormatOptions) => new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { ...o, timeZone: "UTC" });
export const shortDate = (d: string) => dayOf(d, { day: "numeric", month: "short" });
export const weekday = (d: string) => dayOf(d, { weekday: "short" });

const niceStep = (raw: number) => {
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw)!;
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/* ------------------------------------------------------------------ the motif */

// One graphic idea runs through Dhoop: the sun's path across the sky, drawn as a fine dashed arc
// marked with seven points, one for each day being compared. It is linework only; colour comes
// from CSS. It appears in the hero, as a section rule, on the day counter and as the loader.

const f = (n: number) => n.toFixed(1);

/** Fine rays around a point: the sun glyph used for "the day being checked" and the verdict. */
export function rays(cx: number, cy: number, r0: number, r1: number, n = 8): string {
  let s = "";
  for (let k = 0; k < n; k++) {
    const a = (k * 2 * Math.PI) / n;
    s += `<line x1="${f(cx + r0 * Math.cos(a))}" y1="${f(cy + r0 * Math.sin(a))}" x2="${f(cx + r1 * Math.cos(a))}" y2="${f(cy + r1 * Math.sin(a))}"/>`;
  }
  return s;
}

export function sunGlyph(cls = "sun-glyph"): string {
  return `<svg class="${cls}" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="3.6"/><g>${rays(10, 10, 6.2, 8.8)}</g></svg>`;
}

/**
 * The sun path: a dashed arc with seven day-points. `sun` draws the last point as the sun
 * (today); otherwise every point is a plain dot that CSS can fill (the day counter).
 */
export function sunPath(cls: string, o: { w?: number; h?: number; sun?: boolean } = {}): string {
  const w = o.w ?? 120, h = o.h ?? 34;
  const cx = w / 2, rx = w / 2 - 5, ry = h - 9, base = h - 2;
  const pt = (t: number) => [cx - rx * Math.cos(Math.PI * t), base - ry * Math.sin(Math.PI * t)];
  let s = `<svg class="${cls}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true" focusable="false">`;
  s += `<path d="M${f(cx - rx)},${base} A${rx},${ry} 0 0 1 ${f(cx + rx)},${base}" class="sp-arc"/>`;
  for (let i = 0; i < 7; i++) {
    const [x, y] = pt((i + 1) / 8);
    if (o.sun && i === 6) s += `<g class="sp-sun"><circle cx="${f(x)}" cy="${f(y)}" r="3.6"/>${rays(x, y, 6, 8.5)}</g>`;
    else s += `<circle cx="${f(x)}" cy="${f(y)}" r="2.6" class="sp-dot" data-i="${i}"/>`;
  }
  return s + `</svg>`;
}

/** The loading mark: a small sun crossing its arc. */
export function arcLoader(): string {
  return `<svg class="arc-loader" viewBox="0 0 30 17" width="30" height="17" aria-hidden="true" focusable="false"><path d="M3,15 A12,12 0 0 1 27,15" class="al-arc"/><g class="al-orbit"><circle cx="3" cy="15" r="2.8"/></g></svg>`;
}

/* ------------------------------------------------------------------ hero illustration */

/**
 * The product in one picture, read left to right: the sun crosses its path; its light reaches the
 * panels; the inverter turns it into a daily reading; the reading lands in a chart beside what the
 * sunlight allowed. A pulse of light travels that route (sun → panels → inverter → chart) once on
 * load and then every few seconds. It is an illustration, labelled as such, not data.
 */
export function heroIllustration(): string {
  const W = 600, H = 392, ground = 372;
  // house: walls, a roof plane facing the viewer, panels on it
  const x = 64, w = 200, wallH = 104, roofH = 82;
  const top = ground - wallH, ry = top - roofH;
  const rl = x - 16, rr = x + w + 16, tl = x + 30, tr = x + w - 30;
  const edgeAt = (y: number) => {
    const t = (y - ry) / (top - ry);
    return [lerp(tl, rl, t) + 14, lerp(tr, rr, t) - 14];
  };
  let panels = "";
  const rows = 2, cols = 5, py0 = ry + 12, py1 = top - 10;
  for (let r = 0; r < rows; r++) {
    const y0 = lerp(py0, py1, r / rows) + 1.5, y1 = lerp(py0, py1, (r + 1) / rows) - 1.5;
    const [a0, b0] = edgeAt(y0), [a1, b1] = edgeAt(y1);
    for (let c = 0; c < cols; c++) {
      const u0 = c / cols + 0.01, u1 = (c + 1) / cols - 0.01;
      panels += `<polygon points="${f(lerp(a0, b0, u0))},${f(y0)} ${f(lerp(a0, b0, u1))},${f(y0)} ${f(lerp(a1, b1, u1))},${f(y1)} ${f(lerp(a1, b1, u0))},${f(y1)}"/>`;
    }
  }

  // the sun's path: an arc from horizon to horizon, seven points, the sun on the third
  const pcx = 172, prx = 158, pry = 300;
  const arcPt = (t: number) => [pcx - prx * Math.cos(Math.PI * t), ground - pry * Math.sin(Math.PI * t)];
  const [sunX, sunY] = arcPt(3 / 8);
  let pathDots = "";
  for (let i = 0; i < 7; i++) {
    if (i === 2) continue; // the sun sits here
    const [px, py] = arcPt((i + 1) / 8);
    pathDots += `<circle cx="${f(px)}" cy="${f(py)}" r="2.6" class="hi-dot"/>`;
  }

  // light: three fine rays to the roof; the middle one carries the pulse
  const rayLines = [0, 1, 2].map((k) => {
    const tx = lerp(tl + 18, tr - 18, k / 2), ty = ry + 16;
    return { x1: sunX + (tx - sunX) * 0.32, y1: sunY + (ty - sunY) * 0.32, x2: tx, y2: ty - 4 };
  });
  const raysSvg = rayLines.map((l, k) => `<line x1="${f(l.x1)}" y1="${f(l.y1)}" x2="${f(l.x2)}" y2="${f(l.y2)}" class="hi-ray" style="--k:${k}"/>`).join("");
  const mid = rayLines[1];

  // the inverter on the wall, wired from the roof and out to the chart
  const inv = { x: x + 146, y: top + 32, w: 28, h: 38 };
  const dc = `M${inv.x + 14},${top} V${inv.y}`;
  const cx = 340, cy = 40, cw = 244, ch = 332;
  const wireY = cy + 262;
  const flow = `M${inv.x + inv.w},${inv.y + 20} C ${inv.x + inv.w + 52},${inv.y + 20} ${cx - 52},${wireY} ${cx - 3},${wireY}`;

  // the chart card: seven days, bars = made, ticks = what the sunlight allowed, today highlighted
  const made = [0.82, 0.8, 0.74, 0.79, 0.81, 0.7, 0.56];
  const allowed = [0.84, 0.81, 0.76, 0.8, 0.82, 0.72, 0.7];
  const bw = 18, bx0 = cx + 24, gap = (cw - 48 - bw * 7) / 6, base = cy + ch - 44, span = 230;
  let bars = "";
  made.forEach((m, i) => {
    const bx = bx0 + i * (bw + gap);
    const last = i === 6;
    if (last) {
      bars += `<rect x="${f(bx - 6)}" y="${cy + 70}" width="${bw + 12}" height="${f(base - cy - 70)}" rx="5" class="hi-today"/>`;
      bars += `<rect x="${f(bx)}" y="${f(base - allowed[i] * span)}" width="${bw}" height="${f((allowed[i] - m) * span)}" class="hi-gap" fill="url(#hi-hatch)" style="--i:${i}"/>`;
    }
    bars += `<rect x="${f(bx)}" y="${f(base - m * span)}" width="${bw}" height="${f(m * span)}" rx="2" class="hi-bar${last ? " hi-bar-last" : ""}" style="--i:${i}"/>`;
    bars += `<line x1="${f(bx - 4)}" x2="${f(bx + bw + 4)}" y1="${f(base - allowed[i] * span)}" y2="${f(base - allowed[i] * span)}" class="hi-tick" style="--i:${i}"/>`;
  });

  return `<svg class="hero-illo" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="hi-t">
  <title id="hi-t">Illustration: the sun crosses the sky and its light falls on a house's solar panels; the inverter's daily readings flow into a chart that sets each day's output against what the sunlight allowed.</title>
  <defs><pattern id="hi-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" class="hi-hatch-line"/></pattern></defs>
  <path d="M${pcx - prx},${ground} A${prx},${pry} 0 0 1 ${pcx + prx},${ground}" class="hi-arc"/>
  <g class="hi-dots">${pathDots}</g>
  <g class="hi-rays">${raysSvg}</g>
  <g class="hi-sun-wrap"><circle cx="${f(sunX)}" cy="${f(sunY)}" r="40" class="hi-halo"/><circle cx="${f(sunX)}" cy="${f(sunY)}" r="22" class="hi-sun"/><g class="hi-sun-rays">${rays(sunX, sunY, 28, 34, 12)}</g></g>
  <text x="150" y="38" class="hi-cap">Sunlight</text>
  <text x="150" y="56" class="hi-sub">estimated by satellite</text>
  <line x1="0" x2="${W}" y1="${ground}" y2="${ground}" class="hi-ground"/>
  <rect x="${x}" y="${top}" width="${w}" height="${wallH}" class="hi-wall"/>
  <polygon points="${rl},${top} ${tl},${ry} ${tr},${ry} ${rr},${top}" class="hi-roof"/>
  <g class="hi-panels">${panels}</g>
  <g class="hi-glow">${panels}</g>
  <rect x="${x + 26}" y="${top + 28}" width="30" height="40" class="hi-win"/>
  <rect x="${x + 86}" y="${ground - 62}" width="28" height="62" class="hi-door"/>
  <path d="${dc}" class="hi-wire"/>
  <rect x="${inv.x}" y="${inv.y}" width="${inv.w}" height="${inv.h}" rx="3" class="hi-inv"/>
  <rect x="${inv.x + 6}" y="${inv.y + 7}" width="${inv.w - 12}" height="8" rx="1.5" class="hi-inv-screen"/>
  <path d="${flow}" class="hi-flow"/>
  <circle cx="${cx - 3}" cy="${wireY}" r="3.5" class="hi-flow-end"/>
  <line x1="${f(mid.x1)}" y1="${f(mid.y1)}" x2="${f(mid.x2)}" y2="${f(mid.y2)}" pathLength="100" class="hi-pulse hi-pulse-ray"/>
  <path d="${dc}" pathLength="100" class="hi-pulse hi-pulse-dc"/>
  <path d="${flow}" pathLength="100" class="hi-pulse hi-pulse-flow"/>
  <g class="hi-card">
    <rect x="${cx + 4}" y="${cy + 10}" width="${cw - 8}" height="${ch - 6}" rx="14" class="hi-card-shadow"/>
    <rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="12" class="hi-card-bg"/>
    <text x="${cx + 22}" y="${cy + 34}" class="hi-card-t">Last 7 days</text>
    <text x="${cx + 22}" y="${cy + 54}" class="hi-sub">Daily kWh from your inverter</text>
    <line x1="${cx + 22}" x2="${cx + cw - 22}" y1="${base}" y2="${base}" class="hi-axis"/>
    ${bars}
    <rect x="${cx + 22}" y="${base + 17}" width="9" height="9" rx="1.5" class="hi-bar hi-key-mark"/><text x="${cx + 36}" y="${base + 26}" class="hi-key">made</text>
    <line x1="${cx + 88}" x2="${cx + 104}" y1="${base + 21.5}" y2="${base + 21.5}" class="hi-tick hi-key-mark"/><text x="${cx + 110}" y="${base + 26}" class="hi-key">sunlight allowed</text>
  </g>
</svg>`;
}

/* ------------------------------------------------------------------ 7-day comparison */

export interface ChartPoint {
  date: string;
  measured: number;
  expected: number; // NaN when satellite data is incomplete
  irradiation: number;
  pr: number;
  excluded?: string;
  latest: boolean;
}

export interface DailyChartOpts {
  kWp: number;
  baselinePR: number;
  latest: string; // date being checked
  flagged: boolean; // verdict is watch/act, so the latest gap is drawn as a possible shortfall
  simulated: boolean; // demo data: readings and sunlight are simulated
  noExpected: Set<string>; // dates whose satellite data is incomplete: no expected value is drawn
  W: number;
}

/**
 * Measured output (bars) against the output expected for each day's sunlight (marker).
 * Expected = sunlight on the panels × system size × the usual performance ratio, the same
 * quantity the diagnosis uses. Each day is a focusable column so hover and keyboard both
 * reveal its details.
 */
export function dailyChart(days: DayResult[], o: DailyChartOpts) {
  const W = o.W;
  const H = W < 560 ? 280 : 380;
  const padL = 40, padR = 8, padT = 36, padB = 50;
  const points: ChartPoint[] = [...days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      date: d.date,
      measured: d.kWh,
      expected: o.noExpected.has(d.date) ? NaN : d.irradiation * o.kWp * o.baselinePR,
      irradiation: d.irradiation,
      pr: d.pr,
      excluded: d.excluded,
      latest: d.date === o.latest,
    }));
  const top = Math.max(...points.flatMap((p) => [p.measured, p.expected]).filter(Number.isFinite), 1);
  const step = niceStep(top / 4);
  const ymax = Math.ceil((top * 1.1) / step) * step;
  const y = (v: number) => padT + (1 - v / ymax) * (H - padT - padB);
  const slot = (W - padL - padR) / points.length;
  const bw = Math.min(40, slot * 0.42);

  let svg = `<svg class="daily" viewBox="0 0 ${W} ${H}" role="group" aria-labelledby="dc-t">
  <title id="dc-t">Measured and expected output for each day. Move through the days with Tab for details.</title>
  <defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" class="hatch-line"/></pattern></defs>`;

  for (let v = 0; v <= ymax + 1e-9; v += step) {
    svg += `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" class="${v === 0 ? "axis-base" : "grid"}"/>`;
    svg += `<text x="${padL - 10}" y="${y(v) + 4}" class="axis" text-anchor="end">${Number(v.toFixed(1))}</text>`;
  }
  svg += `<text x="0" y="${padT - 20}" class="axis axis-title">kWh per day</text>`;

  // a faint line joining the expected markers reads as "what the sunlight allowed"
  const expPts = points.map((p, i) => (Number.isFinite(p.expected) ? `${padL + slot * i + slot / 2},${y(p.expected)}` : "")).filter(Boolean);
  if (expPts.length > 1) svg += `<polyline points="${expPts.join(" ")}" class="exp-path"/>`;

  let starred = false;
  points.forEach((p, i) => {
    const x0 = padL + slot * i;
    const cx = x0 + slot / 2;
    const style = `style="--i:${i}"`;
    const hasExp = Number.isFinite(p.expected);
    const label = `${weekday(p.date)} ${shortDate(p.date)}: ${o.simulated ? "simulated reading" : "measured"} ${kwh(p.measured)}${hasExp ? `, expected ${kwh(p.expected)}` : ", no expected value (satellite data incomplete)"}${p.latest ? ", the day being checked" : ""}`;
    svg += `<g class="col${p.latest ? " col-latest" : ""}" tabindex="0" data-i="${i}" aria-label="${esc(label)}">`;
    svg += `<rect x="${x0 + 3}" y="${padT - 12}" width="${slot - 6}" height="${H - padT - padB + 12}" rx="8" class="hit"/>`;
    // the day being checked wears the motif's sun at the top of its band
    if (p.latest) svg += `<g class="day-sun" aria-hidden="true"><circle cx="${cx}" cy="${padT - 12}" r="4.2"/>${rays(cx, padT - 12, 7, 10.5)}</g>`;
    if (p.latest && o.flagged && hasExp && p.expected > p.measured) {
      svg += `<rect x="${cx - bw / 2}" y="${y(p.expected)}" width="${bw}" height="${y(p.measured) - y(p.expected)}" class="gap" fill="url(#hatch)" ${style}/>`;
    }
    svg += `<rect x="${cx - bw / 2}" y="${y(p.measured)}" width="${bw}" height="${Math.max(1, y(0) - y(p.measured))}" rx="3" class="bar" ${style}/>`;
    if (hasExp) {
      svg += `<line x1="${cx - bw / 2 - 8}" x2="${cx + bw / 2 + 8}" y1="${y(p.expected)}" y2="${y(p.expected)}" class="exp-halo" ${style}/>`;
      svg += `<line x1="${cx - bw / 2 - 8}" x2="${cx + bw / 2 + 8}" y1="${y(p.expected)}" y2="${y(p.expected)}" class="exp" ${style}/>`;
    }
    // The label is the measured value, so it sits on its bar. It only steps above the expected
    // marker when the marker sits just over the bar top and would collide with it.
    const markerJustAbove = hasExp && y(p.measured) - y(p.expected) > 0 && y(p.measured) - y(p.expected) < 20;
    const labelY = (markerJustAbove ? y(p.expected) : y(p.measured)) - 9;
    svg += `<text x="${cx}" y="${labelY}" class="val" text-anchor="middle" ${style}>${p.measured.toFixed(1)}</text>`;
    // On the checked day, name the expected value in gold above its marker, and on wide charts
    // bracket a flagged gap with its size. Both are the same numbers as the summary above.
    if (p.latest && hasExp) {
      const expY = Math.min(labelY - 16, y(p.expected) - 9);
      svg += `<text x="${cx}" y="${expY}" class="val-exp" text-anchor="middle" ${style}>${W < 560 ? "" : "expected "}${p.expected.toFixed(1)}</text>`;
      if (o.flagged && p.expected > p.measured && W >= 560 && y(p.measured) - y(p.expected) > 22) {
        const bx = cx + bw / 2 + 10, y0 = y(p.expected) + 2, y1 = y(p.measured) - 2;
        svg += `<path d="M${bx - 4},${y0} H${bx} V${y1} H${bx - 4}" class="gap-bracket" ${style}/>`;
        svg += `<text x="${bx + 6}" y="${(y0 + y1) / 2 + 4}" class="val-gap" ${style}>−${(p.expected - p.measured).toFixed(1)}</text>`;
      }
    }
    if (!hasExp) starred = true;
    svg += `<text x="${cx}" y="${H - padB + 21}" class="xday" text-anchor="middle">${weekday(p.date)}${hasExp ? "" : "*"}</text>`;
    // narrow charts show the day of the month only, so neighbouring labels never collide
    svg += `<text x="${cx}" y="${H - padB + 38}" class="xdate" text-anchor="middle">${W < 560 ? Number(p.date.slice(8)) : shortDate(p.date)}</text>`;
    svg += `</g>`;
  });
  svg += `</svg>`;

  const legend = `<ul class="legend">
    <li><span class="key key-bar" aria-hidden="true"></span>${o.simulated ? "Simulated reading" : "Measured by your inverter"}</li>
    <li><span class="key key-latest" aria-hidden="true"></span>Day being checked</li>
    <li><span class="key key-exp" aria-hidden="true"></span>Expected for that day's ${o.simulated ? "simulated" : "satellite"} sunlight</li>
    ${o.flagged ? `<li><span class="key key-gap" aria-hidden="true"></span>Possible shortfall (estimate)</li>` : ""}
  </ul>`;
  const footnote = starred ? `<p class="footnote">* No expected value: satellite data for this day is incomplete.</p>` : "";
  return { svg, legend, footnote, points };
}

/* ------------------------------------------------------------------ why it was flagged */

export interface GaugeOpts {
  ratios: { date: string; r: number; latest: boolean }[]; // measured ÷ expected
  watchBelow: number; // ratio under which a day is "slightly below"
  actBelow: number; // ratio under which a day is "possible underperformance"
  W: number;
}

/**
 * Actual output as a share of the sunlight-adjusted expectation, on one horizontal scale with
 * the diagnosis thresholds drawn as zones (named in the HTML key). Thresholds come from the engine.
 */
export function ratioGauge(o: GaugeOpts): string {
  const W = o.W;
  const H = 96;
  const padL = 14, padR = 14;
  const rs = o.ratios.map((x) => x.r);
  const lo = Math.max(0.3, Math.min(0.6, Math.floor((Math.min(...rs) - 0.05) * 10) / 10));
  const hi = Math.min(1.5, Math.max(1.1, Math.ceil((Math.max(...rs) + 0.05) * 10) / 10));
  const x = (r: number) => padL + ((Math.min(hi, Math.max(lo, r)) - lo) / (hi - lo)) * (W - padL - padR);
  const bandY = 36, bandH = 16, mid = bandY + bandH / 2;

  let svg = `<svg class="gauge" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="g-t g-d">
  <title id="g-t">Output as a share of what the sunlight should have made</title>
  <desc id="g-d">${esc(o.ratios.map((r) => `${shortDate(r.date)}: ${Math.round(r.r * 100)}%`).join("; "))}. Below ${Math.round(o.watchBelow * 100)}% is slightly below usual; below ${Math.round(o.actBelow * 100)}% is possible underperformance.</desc>`;
  svg += `<rect x="${x(lo)}" y="${bandY}" width="${x(o.actBelow) - x(lo)}" height="${bandH}" rx="3" class="z-act"/>`;
  svg += `<rect x="${x(o.actBelow) + 2}" y="${bandY}" width="${x(o.watchBelow) - x(o.actBelow) - 4}" height="${bandH}" class="z-watch"/>`;
  svg += `<rect x="${x(o.watchBelow)}" y="${bandY}" width="${x(hi) - x(o.watchBelow)}" height="${bandH}" rx="3" class="z-ok"/>`;
  svg += `<line x1="${x(1)}" x2="${x(1)}" y1="${bandY - 6}" y2="${bandY + bandH + 6}" class="z-usual"/>`;
  for (let t = Math.ceil(lo * 10) / 10; t <= hi + 1e-9; t += 0.1) {
    svg += `<text x="${x(t)}" y="${bandY + bandH + 24}" class="axis" text-anchor="middle">${Math.round(t * 100)}%</text>`;
  }
  for (const r of o.ratios.filter((r) => !r.latest)) {
    svg += `<line x1="${x(r.r)}" x2="${x(r.r)}" y1="${bandY + 3}" y2="${bandY + bandH - 3}" class="g-day"><title>${shortDate(r.date)}: ${Math.round(r.r * 100)}%</title></line>`;
  }
  const latest = o.ratios.find((r) => r.latest);
  if (latest) {
    const lx = x(latest.r);
    const anchor = lx < 50 ? "start" : lx > W - 50 ? "end" : "middle";
    svg += `<g class="g-latest-wrap"><line x1="${lx}" x2="${lx}" y1="${bandY - 12}" y2="${mid}" class="g-leader"/><circle cx="${lx}" cy="${mid}" r="7" class="g-latest"/>`;
    svg += `<text x="${lx}" y="${bandY - 17}" class="g-latest-label" text-anchor="${anchor}">${shortDate(latest.date)}: ${Math.round(latest.r * 100)}%</text></g>`;
  }
  return svg + `</svg>`;
}
