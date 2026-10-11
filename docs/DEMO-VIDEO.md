# Demo video script (3:00)

Record a browser window at about 1280 px wide (or a phone-width window) running `npm run dev` at http://localhost:5173/, plus your code editor for the AWS segment. Upload to YouTube as unlisted or public, then open the link in a signed-out browser to check it plays.

**Rules for honesty on screen**
- Sample week: keep the "Simulated sample week" band visible while you talk about it.
- Real-sunlight check: use real readings only if they come from a real system, with the owner's permission. Otherwise say on camera that the readings are test values; the satellite sunlight is still real.
- Don't say the app runs on AWS. It isn't deployed (see the AWS segment).

| Time | Show | Say (roughly) |
|---|---|---|
| 0:00–0:15 | Home page, hero | "When rooftop solar output drops, owners can't tell whether it was a hazy week or a problem with the system. So most never check." |
| 0:15–0:30 | Scroll to "Check your system" | "Dhoop compares a week of inverter readings with a satellite estimate of the sunlight that reached that roof." |
| 0:30–1:20 | "Explore a sample week" → report. Point to the yellow "Simulated" band and the source line. Hover the last day in the chart. | "This is a simulated sample, labelled everywhere. The bar is what the system made; the gold marker is what that day's sunlight should have made at this system's usual level. The hatched part is a possible shortfall, an estimate. This day made 80% of expected, past the 85% threshold, so it's flagged." |
| 1:20–1:40 | "Why it was flagged" scale, then "What to do next" | "Haze lowers the sunlight, not this ratio, so a drop points at the system. Dhoop never guesses the cause; it tells you what to check." |
| 1:40–2:15 | "← Edit readings" → "clear the form" → enter 3 kW and seven readings (e.g. 12.4, 12.1, 11.6, 12.0, 12.3, 11.2, 9.5) → "Check against satellite sunlight". Point to the source line. | "Now real satellite sunlight for Delhi; these readings are test values. The source line shows the Himawari grid cell, the days summed and when the data was fetched. If the satellite API fails, Dhoop shows an error, not a made-up result." |
| 2:15–2:45 | Editor: `lambda/handler.ts`, `infra/template.yaml`, then a terminal running `npm test` (29 passing) | "The same engine is packaged as an AWS Lambda with a Function URL and CloudWatch logging, defined in SAM. Deployment from our account was blocked by an organisation policy, so today it runs in the browser and every result says so. The bundle was tested locally against the live satellite API." |
| 2:45–3:00 | "Method & limits" section, then the repo URL | "Satellite sunlight is an estimate, the thresholds are our judgement, and we haven't measured real-world savings yet. Dhoop: check your solar against the sun." |
