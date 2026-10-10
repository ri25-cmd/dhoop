# Dhoop: submission writeup

**Track:** Waste & Energy (rooftop solar)
**Live app:** [ADD AMPLIFY URL AFTER DEPLOY]
**Repo:** [ADD GITHUB URL]
**Demo video:** [ADD YOUTUBE URL]

## The problem

India has more than 51 lakh rooftop solar installations under PM Surya Ghar alone (scheme portal, 9 Oct 2026). Every system loses output over time to dust, bird droppings, new shade and inverter faults, and in October that coincides with haze across the north. An owner looking at a lower number on the inverter can't tell whether it was a hazy week or a problem with the system, so most never check. Clean electricity that was already paid for is quietly lost.

## What we built

Dhoop is a mobile-first web app. The owner enters their city, system size and the last 7 days of daily kWh from their inverter. Dhoop fetches the sunlight that actually reached that roof, measured by the Himawari satellite, and computes a performance ratio for each day: energy produced divided by the sunlight available. Because the satellite figure already includes clouds and haze, a drop in this ratio points at the system rather than the weather.

The result shows:
- a verdict: working as expected, slightly below usual, or possible underperformance
- a three-bar view: what the brightest day would have made, what this day's sunlight should have made, and what the system made
- performance ratio by day, against the system's own usual level
- practical next steps: check for dirt, shade or inverter faults

We were careful about what the app claims. It never names a cause, never attributes losses to smog, flags a day only when it is clearly outside normal uncertainty, and accepts only completed days. We validated units and timestamps against a real API response for Delhi; it is stored as a test fixture.

## Where AWS fits

- **AWS Lambda** with a **Function URL** runs the diagnosis: it fetches satellite sunlight for the location and computes the result.
- **Amazon CloudWatch Logs** records each request: the satellite grid cell, hours returned, timezone, and the verdict with its performance ratios.
- **AWS Amplify Hosting** serves the web app.
- **AWS SAM** defines the infrastructure (`infra/template.yaml`).

## Impact

Each flagged system is an owner prompted to fix a loss that would otherwise go unnoticed. The app reports the possible shortfall in kWh and, with the owner's tariff, in rupees per month if it continues. We report a CO₂ figure only when a verified grid emission factor is configured.

## Limitations

Satellite sunlight is an estimate for a ~5 km cell. Local shade, panel temperature, true orientation and system differences are not captured. The 8% and 15% thresholds are our judgement. The app needs a few days of the owner's readings to compare against their own usual level; with fewer, it falls back to a typical ratio of 0.80 and says so.

## AI tools used

Claude (Anthropic) assisted with code, tests and documentation.
