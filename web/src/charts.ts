import type { Diagnosis } from "../../engine/diagnose.ts";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const kwh = (x: number) => `${x.toFixed(1)} kWh`;

/**
 * The signature visual: three bars on one kWh axis.
 * 1. what the brightest day this week would have produced (at the system's usual level)
 * 2. what this day's sunlight should have produced
 * 3. what the system actually produced
 * The ghost segments show the two gaps. The second gap is only labelled when the verdict says
 * it is beyond normal uncertainty.
 */
export function threeBars(d: Diagnosis, W = 640): string {
  const { bestDayKWh, expectedTodayKWh, actualKWh } = d.bar;
  const left = 0, right = 78, rowH = 64, barH = 22, top = 8;
  const max = Math.max(bestDayKWh, expectedTodayKWh, actualKWh) || 1;
  const x = (v: number) => left + (v / max) * (W - left - right);
  const flag = d.verdict === "watch" || d.verdict === "act";

  const rows = [
    { label: "Your brightest day this week would have made", value: bestDayKWh, cls: "bar-best" },
    { label: "This day's sunlight should have made", value: expectedTodayKWh, cls: "bar-expected" },
    { label: "Your system actually made", value: actualKWh, cls: "bar-actual" },
  ];

  let svg = `<svg class="three-bars" viewBox="0 0 ${W} ${top + rowH * 3 + 4}" role="img" aria-labelledby="tb-title tb-desc">
  <title id="tb-title">Expected versus actual output</title>
  <desc id="tb-desc">Brightest day ${kwh(bestDayKWh)}, this day's sunlight ${kwh(expectedTodayKWh)}, actual ${kwh(actualKWh)}.</desc>
  <defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" class="hatch-line"/></pattern></defs>`;

  rows.forEach((r, i) => {
    const y = top + i * rowH;
    const by = y + 22;
    svg += `<text x="${left}" y="${y + 12}" class="bar-label">${esc(r.label)}</text>`;
    // ghost segment for the gap relative to the row above
    if (i === 1 && bestDayKWh - expectedTodayKWh > 0.05) {
      svg += `<rect x="${x(expectedTodayKWh) + 2}" y="${by}" width="${Math.max(0, x(bestDayKWh) - x(expectedTodayKWh) - 2)}" height="${barH}" rx="4" class="gap-sun"><title>${kwh(bestDayKWh - expectedTodayKWh)} less, because there was less sunlight than on the brightest day</title></rect>`;
    }
    if (i === 2 && expectedTodayKWh - actualKWh > 0.05) {
      svg += `<rect x="${x(actualKWh) + 2}" y="${by}" width="${Math.max(0, x(expectedTodayKWh) - x(actualKWh) - 2)}" height="${barH}" rx="4" class="${flag ? "gap-system" : "gap-normal"}" fill="${flag ? "url(#hatch)" : "none"}"><title>${kwh(expectedTodayKWh - actualKWh)} below what this day's sunlight should have produced</title></rect>`;
    }
    svg += `<rect x="${left}" y="${by}" width="${Math.max(4, x(r.value) - left)}" height="${barH}" rx="4" class="${r.cls}"><title>${esc(r.label)}: ${kwh(r.value)}</title></rect>`;
    const labelX = i === 0 ? x(r.value) : x(Math.max(r.value, i === 1 ? bestDayKWh : expectedTodayKWh));
    svg += `<text x="${Math.min(labelX + 8, W - right + 8)}" y="${by + 16}" class="bar-value">${kwh(r.value)}</text>`;
  });
  svg += `</svg>`;

  const sunGap = bestDayKWh - expectedTodayKWh;
  const sysGap = expectedTodayKWh - actualKWh;
  const legend = `<ul class="gap-legend">
    <li><span class="swatch swatch-sun"></span>Less sunlight than your brightest day: <strong>${kwh(Math.max(0, sunGap))}</strong> <span class="muted">(weather and haze, nothing to fix)</span></li>
    <li><span class="swatch ${flag ? "swatch-system" : "swatch-normal"}"></span>${flag ? "Possible system underperformance" : "Difference from expected"}: <strong>${kwh(Math.max(0, sysGap))}</strong>${flag ? "" : ` <span class="muted">(within normal uncertainty)</span>`}</li>
  </ul>`;
  return svg + legend;
}

/** Performance ratio per day, with the usual level as a reference line. */
export function prBars(d: Diagnosis, W = 640): string {
  const days = [...d.history, d.today].filter((x) => Number.isFinite(x.pr)).sort((a, b) => a.date.localeCompare(b.date));
  const H = 200, padL = 36, padB = 28, padT = 16;
  const ymax = 1.0;
  const n = days.length;
  const slot = (W - padL) / Math.max(n, 1);
  const bw = Math.min(44, slot - 10);
  const y = (v: number) => padT + (1 - Math.min(v, ymax) / ymax) * (H - padT - padB);
  let svg = `<svg class="pr-bars" viewBox="0 0 ${W} ${H}" role="img" aria-label="Performance ratio by day"><title>Performance ratio by day</title>`;
  for (const g of [0, 0.25, 0.5, 0.75, 1]) {
    svg += `<line x1="${padL}" x2="${W}" y1="${y(g)}" y2="${y(g)}" class="grid"/><text x="${padL - 6}" y="${y(g) + 4}" class="axis" text-anchor="end">${g.toFixed(2)}</text>`;
  }
  days.forEach((dd, i) => {
    const cx = padL + slot * i + slot / 2;
    const isLatest = dd.date === d.today.date;
    const h = H - padB - y(dd.pr);
    svg += `<rect x="${cx - bw / 2}" y="${y(dd.pr)}" width="${bw}" height="${Math.max(0, h)}" rx="4" class="${isLatest ? "pr-latest" : "pr-day"}"><title>${dd.date}: ${dd.kWh.toFixed(1)} kWh from ${dd.irradiation.toFixed(2)} kWh/m² of sunlight → performance ratio ${dd.pr.toFixed(2)}</title></rect>`;
    const dt = new Date(dd.date + "T00:00:00Z");
    svg += `<text x="${cx}" y="${H - 8}" class="axis" text-anchor="middle">${dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" })}</text>`;
  });
  svg += `<line x1="${padL}" x2="${W}" y1="${y(d.baselinePR)}" y2="${y(d.baselinePR)}" class="baseline"/><text x="${W - 4}" y="${y(d.baselinePR) - 6}" class="baseline-label" text-anchor="end">${d.baselineSource === "history" ? "your usual level" : "typical level"} ${d.baselinePR.toFixed(2)}</text>`;
  svg += `</svg>`;
  return svg;
}
