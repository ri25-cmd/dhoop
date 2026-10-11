# Dhoop

**Is your rooftop solar making what the sunlight allowed?**

Rooftop solar is spreading quickly across Indian homes, and every October the air over the north turns hazy. When an owner sees lower numbers on the inverter, they can't tell whether the sky gave them less sunlight or the system itself is underperforming because of dust, new shade or a fault. Most owners never check, so lost clean energy goes unnoticed.

Dhoop compares each day's inverter reading with a **satellite estimate of the sunlight that reached that rooftop** and flags only the days when output falls clearly below what the available sunlight should have produced.

Built for the WeMakeDevs × AWS Bharat Builds Tour, Environmental Hacks: Waste & Energy track (rooftop solar).

**Live app (hosted on Amazon S3):** http://dhoop-riddhi-demo-2026.s3-website-ap-southeast-2.amazonaws.com/

**Who it's for:** a household or small business in India with a rooftop solar system and an inverter app or display showing daily kWh, but no monitoring service and no way to tell a hazy week from a dirty or faulty system.

**What changes for them:** instead of guessing, they get a plain verdict (working as expected, slightly below usual, or possible underperformance) plus what to check first. A system that is quietly losing output to dust, new shade or a fault gets noticed and fixed sooner, so more of the clean electricity it was installed to produce actually gets used. We have not measured this effect with real owners yet (see Limitations).

## How it works

1. The owner enters their city, system size and the last 7 days of daily kWh from the inverter app or display.
2. The diagnosis engine (in the live app it runs in the browser; it is also packaged for AWS Lambda, which is not yet deployed, see AWS below) fetches hourly sunlight on the panels' plane (global tilted irradiance) for that location from the Open-Meteo Satellite Radiation API. Over India this comes from the JMA/JAXA Himawari satellite.
3. For each day it computes a **performance ratio**:

   ```
   PR = energy produced (kWh) / (sunlight on the panels (kWh/m²) × system size (kWp))
   ```

   Satellite sunlight already includes clouds and haze, so PR normalises for the weather.
4. It compares the latest day's PR with the system's own usual level: the 75th percentile of the earlier days, or a typical 0.80 when there are fewer than 5 earlier days.
5. The report shows a verdict with the measured and expected output for the latest day, a 7-day chart of measured output against the output each day's sunlight should have produced, a "why it was flagged" scale showing output as a share of expected against the thresholds, next steps, and what the data can't establish.

### What Dhoop does not claim

- It does **not** identify the cause. A low PR is "possible system underperformance"; the owner is told to check for dirt, shade or faults.
- It does **not** attribute losses to smog or haze, and it doesn't measure air pollution. It only uses the sunlight that reached the ground.
- Satellite normalisation reduces weather uncertainty; it doesn't remove it. Satellite estimation error for a ~5 km cell, local shade, panel temperature, true orientation and system differences remain. For that reason a day is flagged only beyond 8% (watch) or 15% (act) below the usual level. These thresholds are our judgement, not a published standard.
- Only completed days are accepted. The satellite API returns 0 for hours not yet processed, which would understate a partial day.
- A day whose satellite data is incomplete (a daylight hour that is missing, null, or an implausible 0 between 09:00 and 15:00 IST) is never judged. If it's the latest day, the verdict is "Satellite data incomplete". If it's an earlier day, it's left out of the usual level, and the table shows why.

### Data checks we ran

A real API response for Delhi (8–10 Oct 2026, 28° south tilt) is stored as a test fixture in `engine/fixtures/`. Tests confirm:

- Hourly W/m² means sum to daily kWh/m²: 5.26, 4.91 and 4.83 kWh/m² on the tilted plane.
- Labels are IST and hour-ending. The `00:00` value belongs to the previous day.
- Tilted vs horizontal sunlight ratio is 1.05–1.25 (1.13 on 8 Oct), as expected for 28° south at 28.6°N in October.
- The irradiance-weighted centre of the day falls within 45 minutes of Delhi solar noon only under the hour-ending reading of the labels.

## Demo flow

1. Open the [live app](http://dhoop-riddhi-demo-2026.s3-website-ap-southeast-2.amazonaws.com/), or run `npm run dev` and open http://localhost:5173/.
2. **Sample week (works offline):** click "Explore a sample week". A simulated 3 kW system with simulated sunlight opens as a report: "Possible underperformance", 80% of expected. Every figure, the legend and the banner say "Simulated", and the source line reads "Sunlight: simulated for this sample, not satellite data. Readings: simulated."
3. **Real sunlight:** "← Edit readings", "clear the form", enter a capacity and up to seven daily kWh readings, then "Check against satellite sunlight". The report opens with a green "Live satellite data" band, and its source line names the satellite source, grid cell, days summed and fetch time, and says the readings were entered by you. If the satellite API fails, the app shows an error and no result; it never substitutes made-up sunlight.

## Architecture

What runs today (live):

```
Amazon S3 static website hosting (ap-southeast-2)
  │  serves index.html + JS/CSS bundle (dist-web/)
  ▼
Browser (Vite + TypeScript)
  │  GET hourly tilted irradiance for the location
  ▼
Open-Meteo Satellite Radiation API (JMA/JAXA Himawari, hourly W/m², IST)
  │  engine/diagnose.ts, in the browser: hourly → daily kWh/m² → performance ratio → verdict
  ▼
Verdict, 7-day expected-vs-actual chart, threshold scale
```

Planned, built and tested but not deployed: the browser POSTs the readings to an AWS Lambda Function URL, which fetches the satellite data and runs the same `engine/` code, logging each request to CloudWatch. The web app already supports this: set `VITE_API_URL` and it uses the Lambda first, falling back to the browser if it can't be reached.

## AWS

| Service | Role | Status |
|---|---|---|
| **Amazon S3** (static website hosting, ap-southeast-2) | Hosts the production web app (`dist-web/`) | **Live** |
| **AWS Lambda** (Node.js 22, arm64) + **Function URL** | Fetches satellite data and runs the diagnosis server-side | Built and tested, **not deployed** |
| **Amazon CloudWatch Logs** | Structured log per request: satellite grid cell, hours, missing hours, verdict, PR | Defined in SAM, **not deployed** |
| **AWS SAM** (open source) | Infrastructure as code for the Lambda: `infra/template.yaml` | Template ready |

**Lambda status (11 Oct 2026): not deployed.** The Lambda code, SAM template and bundle are complete and tested locally: the built `dist/index.mjs` was invoked with a Function URL-style event against the live Open-Meteo API and returned a diagnosis. Deploying from the team's AWS account was blocked by an AWS Organizations service control policy that denies the CloudFormation and Lambda actions. So the live app computes in the browser and says so on every result ("Computed in your browser (AWS endpoint not configured)").

If the Lambda can't be reached, the web app runs the same engine in the browser and labels the result "Computed in your browser". If satellite data is unavailable, it shows an error and no result for real readings, and offers the offline demo instead.

## Data sources

- **Sunlight:** [Open-Meteo Satellite Radiation API](https://open-meteo.com/), hourly global tilted irradiance (W/m², plane of the panels), derived from JMA/JAXA Himawari observations. No API key. Licence CC BY 4.0, credited in the app footer.
- **Inverter readings:** typed in by the owner. Nothing is stored; readings go only to the satellite comparison.
- **Sample week:** simulated readings and simulated sunlight in `web/src/demo.ts`, labelled in the app.

## Limitations

- Satellite sunlight is an **estimate** for a ~5 km grid cell. Local shade, panel temperature, soiling patterns, true orientation and inverter clipping aren't captured.
- The method is a heuristic, not a validated solar performance model: a performance ratio compared with the system's own usual level (75th percentile of earlier days), or a typical 0.80 with fewer than five earlier days. The 8% and 15% thresholds are our judgement.
- A flag means "possible underperformance". Satellite data cannot show a specific rooftop fault, so the app never names a cause.
- The ₹ figure assumes the latest day's shortfall repeats for 30 days at the entered tariff. It is an estimate, not a measured loss. CO₂ is shown only if a grid emission factor is configured (none is by default).
- Not tested with real owners yet, so we make no claim of measured savings or impact. Tested only in Chrome. A report is not saved: reloading `#report` returns to the home page.

## Tests

`npm test` runs 29 tests (Node's built-in runner, no extra dependencies):
- **Engine:** hourly-to-daily sums, hour-ending IST labels, partial days, nominal vs own-baseline comparisons, normal (`ok`), `watch` and `act` cases, missing satellite hours, invalid readings and capacity rejected.
- **Real data:** a stored Delhi API response checks units, tilt gain and solar-noon timing.
- **Consistency:** expected output, shortfall (kWh and %), the ₹ estimate and the chart's plotted values all derive from the same formula.
- **Lambda handler:** validation (bad readings rejected, not dropped), locations outside India, satellite outage, timeout, malformed responses, and the sunlight-source fields in the response.

## Run locally

Requires Node.js 22 or later (tests use `--experimental-strip-types`). No API keys are needed: Open-Meteo is called without a key.

```bash
npm install
npm test          # 29 tests: engine, real-data fixture, chart/engine consistency, Lambda handler
npm run dev       # web app at http://localhost:5173
npm run build:web # production build into dist-web/
```

Without `web/.env`, the app computes in the browser and labels results "Computed in your browser (AWS endpoint not configured)".

## Deploy

### Web app to Amazon S3 (what the live app uses)

```bash
npm run build:web
aws s3 sync dist-web/ s3://dhoop-riddhi-demo-2026/ --delete
```

The bucket has static website hosting enabled with `index.html` as the index document and a public-read bucket policy. Without the AWS CLI, upload the contents of `dist-web/` (`index.html` and the `assets/` folder) in the S3 console.

### Lambda backend (not yet deployed, see AWS above)

```bash
npm run build:lambda
sam deploy --template-file infra/template.yaml --stack-name dhoop \
  --capabilities CAPABILITY_IAM --resolve-s3 --region ap-south-1
# copy the ApiUrl output into web/.env as VITE_API_URL, then:
npm run build:web  # then upload dist-web/ to S3 as above
```

## Project layout

```
engine/diagnose.ts     PR, baseline, verdicts, guards (shared by Lambda and browser)
engine/satellite.ts    Open-Meteo satellite fetch
engine/fixtures/       real Delhi API response used in tests
lambda/handler.ts      Lambda handler
web/                   Vite + TypeScript front end
infra/template.yaml    AWS SAM template
```

## Demo data

"Explore a sample week" (in the hero and footer) or "Use a simulated sample week" (in the form) loads a **simulated** 3 kW system with simulated sunlight. It runs fully in the browser with no network. It exists to show the interface; it is not a measurement. The form shows a "Simulated · Sample week loaded" band, results open on their own page (#report), the report carries a "Simulated sample week" band, and every figure and legend says "simulated". Boxes holding sample values stay highlighted until you type over them. If any sample value is still present when you check, the report carries an "Includes sample values" warning.

## Credits

- Sunlight data: [Open-Meteo](https://open-meteo.com/) Satellite Radiation API, derived from JMA/JAXA Himawari observations. Open-Meteo data is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); the app credits it in the page footer.
- AI coding assistance: Claude (Anthropic), via Claude Code, assisted with code, tests and documentation. All diagnostic logic is covered by tests, and the satellite units and timestamps were checked against a real API response.

## Licence

MIT
