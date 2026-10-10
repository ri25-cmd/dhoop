# Dhoop

**Is your rooftop solar making what the sunlight allowed?**

India has millions of rooftop solar systems, and every October the air over the north turns hazy. When an owner sees lower numbers on the inverter, they can't tell whether the sky gave them less sunlight or the system itself is underperforming because of dust, new shade or a fault. Most owners never check, so lost clean energy goes unnoticed.

Dhoop compares each day's inverter reading with **satellite-measured sunlight for that rooftop** and flags only the days when output falls clearly below what the available sunlight should have produced.

Built for the WeMakeDevs × AWS Bharat Builds Tour, Environmental Hacks: Waste & Energy track (rooftop solar).

## How it works

1. The owner enters their city, system size and the last 7 days of daily kWh from the inverter app or display.
2. An AWS Lambda function fetches hourly sunlight on the panels' plane (global tilted irradiance) for that location from the Open-Meteo Satellite Radiation API. Over India this comes from the JMA/JAXA Himawari satellite.
3. For each day it computes a **performance ratio**:

   ```
   PR = energy produced (kWh) / (sunlight on the panels (kWh/m²) × system size (kWp))
   ```

   Satellite sunlight already includes clouds and haze, so PR normalises for the weather.
4. It compares the latest day's PR with the system's own usual level: the 75th percentile of the earlier days, or a typical 0.80 when there are fewer than 5 earlier days.
5. The result shows a verdict, a three-bar view (brightest day / what this day's sunlight should have made / what was made), PR by day, and practical next steps.

### What Dhoop does not claim

- It does **not** identify the cause. A low PR is "possible system underperformance"; the owner is told to check for dirt, shade or faults.
- It does **not** attribute losses to smog. The "less sunlight" figure is a satellite-to-satellite comparison with the brightest day in the week.
- Satellite normalisation reduces weather uncertainty; it doesn't remove it. Satellite estimation error for a ~5 km cell, local shade, panel temperature, true orientation and system differences remain. For that reason a day is flagged only beyond 8% (watch) or 15% (act) below the usual level. These thresholds are our judgement, not a published standard.
- Only completed days are accepted. The satellite API returns 0 for hours not yet processed, which would understate a partial day.

### Data checks we ran

A real API response for Delhi (8–10 Oct 2026, 28° south tilt) is stored as a test fixture in `engine/fixtures/`. Tests confirm:

- Hourly W/m² means sum to daily kWh/m²: 5.26, 4.91 and 4.83 kWh/m² on the tilted plane.
- Labels are IST and hour-ending. The `00:00` value belongs to the previous day.
- Tilted vs horizontal sunlight ratio is 1.05–1.25 (1.13 on 8 Oct), as expected for 28° south at 28.6°N in October.
- The irradiance-weighted centre of the day falls within 45 minutes of Delhi solar noon only under the hour-ending reading of the labels.

## AWS

| Service | Role |
|---|---|
| **AWS Lambda** (Node.js 22, arm64) | Fetches satellite data, runs the diagnosis |
| **Lambda Function URL** | Public HTTPS endpoint with CORS |
| **Amazon CloudWatch Logs** | Structured log per request: satellite grid cell, hours, timezone, verdict, PR |
| **AWS Amplify Hosting** | Hosts the web app |
| **AWS SAM** (open source) | Infrastructure as code: `infra/template.yaml` |

If the Lambda can't be reached, the web app runs the same engine in the browser and labels the result "Computed in your browser". If satellite data is unavailable, it shows an error and no result.

## Run locally

```bash
npm install
npm test          # 14 tests: engine, real-data fixture, Lambda handler
npm run dev       # web app at http://localhost:5173
```

## Deploy

```bash
npm run build:lambda
sam deploy --template-file infra/template.yaml --stack-name dhoop \
  --capabilities CAPABILITY_IAM --resolve-s3 --region ap-south-1
# copy the ApiUrl output into web/.env as VITE_API_URL, then:
npm run build:web  # upload dist-web/ to Amplify Hosting
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

"Try with demo data" loads a **simulated** 3 kW system with simulated sunlight, and the app labels it as demo data on screen. It exists to show the interface; it is not a measurement.

## Credits

- Sunlight data: [Open-Meteo](https://open-meteo.com/) Satellite Radiation API (JMA/JAXA Himawari). Used under Open-Meteo's licence with attribution.
- AI tools used: Claude (Anthropic) assisted with code, tests and documentation.

## Licence

MIT
