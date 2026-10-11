# Dhoop: submission writeup

**Track:** Waste & Energy (rooftop solar)
**Live app (Amazon S3):** http://dhoop-riddhi-demo-2026.s3-website-ap-southeast-2.amazonaws.com/
**Repo:** https://github.com/ri25-cmd/dhoop
**Demo video:** [ADD YOUTUBE URL]

**In one line:** Dhoop tells a rooftop solar owner whether a low day was the weather or their system, by checking each day's inverter reading against satellite-measured sunlight for their roof.

## Idea and impact

**The problem.** Rooftop solar is spreading quickly across India, including under PM Surya Ghar. Systems quietly lose output to dust, bird droppings, new shade and inverter faults. In October that overlaps with haze across the north, so when the inverter shows a lower number, the owner can't tell whether the sky gave less sunlight or the system is underperforming. Most never check, and clean electricity the system was installed to produce is lost without anyone noticing.

**Who it's for.** Households and small businesses with a rooftop system and an inverter app or display showing daily kWh, but no paid monitoring service.

**What changes for them.** Instead of guessing, the owner gets a plain verdict (working as expected, slightly below usual, or possible underperformance), the size of the possible shortfall, and a short, safe list of what to check first. The key point is that Dhoop separates weather from the system: a hazy week lowers the sunlight, and Dhoop accounts for that, so it doesn't raise a false alarm. A real drop beyond what the sunlight explains is flagged.

**What we don't claim.** We haven't piloted Dhoop with real owners, so we claim no measured energy savings, CO₂ reduction or detection accuracy. The ₹ figure is labelled as an estimate if the shortfall continued.

## Built on AWS

- **Amazon S3 static website hosting (live):** the production web app is served from an S3 bucket in ap-southeast-2 at the URL above.
- **AWS Lambda + Function URL (live, ap-southeast-2 Sydney):** every real check from the live app is sent to the `dhoop-diagnose` function. It fetches the satellite sunlight, runs the diagnosis engine (`lambda/handler.ts` → `engine/diagnose.ts`) and returns the verdict with its data provenance. The report header says "Computed on AWS Lambda". Verified on 11 Oct 2026: CORS preflight 200, POST 200 with the full diagnosis in about 3–5 s, and invalid locations rejected with 400.
- **Amazon CloudWatch Logs:** the handler writes a structured log line per check: the satellite grid cell and hours fetched, then the verdict, performance ratios and any missing satellite hours.
- **Resilience:** if the Lambda can't be reached, the app runs the same engine in the browser and labels the result "Computed in your browser (AWS service unreachable)", so the check never silently changes where it ran.
- **AWS SAM:** `infra/template.yaml` defines the function, its URL and log group. An earlier SAM deployment to ap-south-1 (Mumbai) was blocked by an AWS Organizations service control policy denying the CloudFormation and Lambda actions, so the function was created from the Lambda console in Sydney instead. The handler has automated tests.

## Design and usability

- Two short steps: system details (city, size; tilt and direction have sensible defaults), then seven daily kWh readings. Pasting seven numbers fills the week.
- The report leads with one sentence verdict and a single bar: what was made against what the sunlight allowed, with any shortfall hatched.
- A 7-day chart, a "why it was flagged" scale with the thresholds drawn, and numbered next steps that start with the cheapest, safest check.
- Every report says where its data came from: a green "Live satellite data" band for real checks, a yellow "Simulated" band for the sample week, and a source line with the satellite grid cell, dates and fetch time.
- Works on phones (tested at 375px wide) and with a keyboard. A sample week runs offline so anyone can try it in one click.

## Execution

- **Works end-to-end on the live site:** the normal check fetches real hourly Himawari sunlight from Open-Meteo for the chosen location and computes the verdict in the browser.
- **The method:** performance ratio = energy produced ÷ (sunlight on the panels × system size). Satellite sunlight already includes clouds and haze, so the ratio normalises for the weather. The latest day is compared with the system's own usual level (75th percentile of the earlier days); it is flagged beyond 8% (watch) or 15% (act) below. These thresholds are our judgement.
- **Guards:** days with missing satellite hours are never judged, only completed days are accepted, impossible readings are rejected, and if the satellite API fails the app shows an error rather than a guess.
- **Checked against real data:** units and timestamps were validated against a stored real API response for Delhi. 29 automated tests cover the engine, the real-data fixture, chart/engine consistency and the Lambda handler.

## Limitations

Satellite sunlight is an estimate for a ~5 km cell; local shade, panel temperature, true orientation and system differences aren't captured. The thresholds are our judgement, not a published standard. With fewer than five usable earlier days, the app compares against a typical ratio of 0.80 and says so. It can't name the cause of a drop. The live site is plain HTTP, so "Use my current location" is hidden there (browsers allow location only on HTTPS).

## AI tools used

Claude (Anthropic) assisted with code, tests and documentation.
