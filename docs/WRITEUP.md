# Dhoop: submission writeup

**Track:** Waste & Energy (rooftop solar)
**Live app:** not deployed (see "Where AWS fits"); run locally with `npm run dev`
**Repo:** [ADD GITHUB URL]
**Demo video:** [ADD YOUTUBE URL]

## The problem

Rooftop solar is spreading quickly across India, including under the PM Surya Ghar scheme. Every system loses output over time to dust, bird droppings, new shade and inverter faults, and in October that coincides with haze across the north. An owner looking at a lower number on the inverter can't tell whether it was a hazy week or a problem with the system, so most never check. Clean electricity that was already paid for is quietly lost.

## What we built

Dhoop is a mobile-first web app. The owner enters their city, system size and the last 7 days of daily kWh from their inverter. Dhoop fetches a satellite estimate of the sunlight that reached that roof (Open-Meteo, from the JMA/JAXA Himawari satellite), and computes a performance ratio for each day: energy produced divided by the sunlight available. Because the satellite figure already includes clouds and haze, a drop in this ratio points at the system rather than the weather.

The result shows:
- a verdict: working as expected, slightly below usual, or possible underperformance
- the latest day's measured output next to what its sunlight should have produced, and the possible shortfall as an estimate
- a 7-day chart of measured output against expected output, with hover and keyboard details for each day
- a scale showing output as a share of expected, with the 8% and 15% thresholds drawn, so the owner can see why a day was or wasn't flagged
- a table of each day's reading, sunlight and performance ratio, showing which days formed the usual level
- practical next steps: check for dirt, shade or inverter faults

We were careful about what the app claims. It never names a cause, never attributes losses to smog, flags a day only when it is clearly outside normal uncertainty, and accepts only completed days. We validated units and timestamps against a real API response for Delhi; it is stored as a test fixture. Each result states where its sunlight came from (satellite grid cell, days summed, time fetched), and the built-in sample week is labelled as simulated everywhere it appears.

## Where AWS fits

Designed for, and implemented as:
- **AWS Lambda** with a **Function URL** to run the diagnosis: it fetches satellite sunlight for the location and computes the result (`lambda/handler.ts`).
- **Amazon CloudWatch Logs** to record each request: the satellite grid cell, hours returned, missing hours, and the verdict with its performance ratios.
- **AWS SAM** to define the infrastructure (`infra/template.yaml`), and **AWS Amplify Hosting** to serve the web app.

**Status: not deployed.** Deployment from our AWS account was blocked: an AWS Organizations service control policy explicitly denies the CloudFormation and Lambda actions. What we verified instead: the Lambda handler has automated tests (validation, satellite failures, provenance), and the built bundle (`dist/index.mjs`) was invoked locally with a Function URL-style event against the live Open-Meteo API and returned a diagnosis. Until it is deployed, the web app runs the same engine in the browser and labels every result "Computed in your browser (AWS endpoint not configured)".

## Impact

Dhoop has not been piloted with real owners yet, so we make no claim of measured savings. What it is designed to do: prompt an owner to check a system when a loss would otherwise go unnoticed. The app reports the possible shortfall in kWh and, with the owner's tariff, in rupees per month if it continues. We report a CO₂ figure only when a verified grid emission factor is configured.

## Limitations

Satellite sunlight is an estimate for a ~5 km cell. Local shade, panel temperature, true orientation and system differences are not captured. The 8% and 15% thresholds are our judgement. The app needs a few days of the owner's readings to compare against their own usual level; with fewer, it falls back to a typical ratio of 0.80 and says so. Days with incomplete satellite data are never judged; the app says the data is missing rather than guessing.

## AI tools used

Claude (Anthropic) assisted with code, tests and documentation.
