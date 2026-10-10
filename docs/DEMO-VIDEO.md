# Demo video script (under 3:00)

Record the phone screen (or a narrow browser window) and the AWS console. Upload to YouTube as unlisted or public, then open the link in a signed-out browser to check it plays.

**Rule for honesty on screen:** if you use demo data, the on-screen "DEMO DATA" banner must be visible. Use real readings only if they come from a real system, with the owner's permission.

| Time | Show | Say (roughly) |
|---|---|---|
| 0:00–0:15 | Hazy sky, then a rooftop solar panel | "Millions of Indian homes have rooftop solar. When output drops, owners can't tell if it was a hazy week or a problem with the system. So most never check." |
| 0:15–0:30 | Dhoop home screen | "Dhoop compares your inverter readings with sunlight measured by satellite for your roof." |
| 0:30–1:15 | Enter city, system size and 7 days of **real** readings → tap Check | Show the inputs being typed. "Seven days from the inverter app. That's all it needs." |
| 1:15–1:55 | Verdict card, then the three bars | Point at each bar. "This is what the brightest day would have made. This is what the day's sunlight should have made. This is what the system made. The hatched part is possible underperformance." |
| 1:55–2:10 | Day-by-day chart, then "What to do next" | "Haze lowers the sunlight, not this ratio. A drop here points at the system. Dhoop doesn't guess the cause; it tells you what to check." |
| 2:10–2:40 | AWS console: the Lambda function → Function URL → CloudWatch log stream showing `satellite-fetched` and `diagnosis` lines for the request you just made | "Each check runs on AWS Lambda. Here's the log for that request: the satellite grid cell, the hours fetched, and the verdict." Show the SAM template briefly. |
| 2:40–2:55 | "How this works, and its limits" panel open | "We validated the satellite units and timestamps against real Delhi data, and we're clear about the limits." |
| 2:55–3:00 | App URL and repo URL | "Dhoop. Check your solar against the sun." |

**If you have no real system's readings:** use "Try with demo data" for the walkthrough, with the demo banner visible. Demo mode runs locally and does not call AWS. To show AWS, make one request with readings you state on camera are test values. The satellite data in that request is still real. Then show its CloudWatch log lines.
