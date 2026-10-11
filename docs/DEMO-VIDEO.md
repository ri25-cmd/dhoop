# Demo video script (2:55)

**Setup before recording**
- Chrome, window about 1280 px wide, zoom 100%. Close other tabs.
- Tab 1: the live app, http://dhoop-riddhi-demo-2026.s3-website-ap-southeast-2.amazonaws.com/
- Tab 2: the S3 bucket in the AWS console (Properties tab, scrolled to "Static website hosting").
- Tab 3: https://github.com/ri25-cmd/dhoop open at `lambda/handler.ts`.
- Test readings for the real check, ready to paste (one line, spaces between): `14.0 13.7 13.4 12.6 12.2 11.4 9.0`
  These are **test values, not from a real system**; say so on camera. They were chosen for the week 4–10 Oct (recording on 11 Oct). If you record on another day, the satellite sunlight will differ, so re-run the check first and confirm the verdict before recording.
- Do one full practice run so the satellite request is fast.

**Honesty rules on screen**
- Sample week: keep the yellow "Simulated" band visible while talking about it.
- Real check: say "the sunlight is real satellite data, the readings are test values".
- Say "hosted on Amazon S3". Don't say the Lambda is running.

| Time | Screen action | Say |
|---|---|---|
| 0:00–0:15 | Live app, top of the home page. | "India is putting solar on millions of roofs. But when the inverter shows a low number, the owner can't tell: was it a hazy day, or is the system losing power to dust, shade or a fault? Most never find out." |
| 0:15–0:25 | Point at the hero line and the three facts. | "Dhoop is for those owners. It checks a week of inverter readings against satellite-measured sunlight for their roof." |
| 0:25–0:55 | Click "Check my solar performance". Leave Delhi, type `3` in System capacity. Click the first day box and paste the seven test values. | "Two steps: the system's size, and seven daily readings from the inverter app. These readings are test values for the demo. The sunlight is not: it's fetched live." |
| 0:55–1:25 | Click "Check against satellite sunlight". On the report, point at the green "Live satellite data" band, then the source line (grid cell, dates, fetch time), then the verdict and the 80% bar. | "Dhoop just pulled hourly sunlight from the Himawari satellite through Open-Meteo for this ~5 km grid cell. The latest day made 80% of what its sunlight allowed: Possible underperformance, with a possible shortfall of about 2.3 kWh. That's an estimate, and it says so." |
| 1:25–1:55 | Scroll to the 7-day chart. Hover Sunday, then Saturday. | "Here's why satellite sunlight matters. Output fell all week, from 14 to 11.4 kWh, but the sunlight fell too: this was a hazy week. A naive alert would fire every day. Dhoop says those days were normal. Only Saturday dropped further than the sunlight explains." |
| 1:55–2:15 | Scroll to "Why it was flagged" and "What to do next". | "It shows the thresholds, never guesses the cause, and gives the owner a safe first step: look for dust, droppings or new shade, then check the inverter for fault codes." |
| 2:15–2:25 | Click "← Edit readings", then "Use a simulated sample week" briefly; point at the yellow "Simulated" band. Go back. | "There's also a sample week for anyone to try. It's clearly marked as simulated, so it's never mistaken for real data." |
| 2:25–2:45 | Tab 2: S3 bucket, static website hosting endpoint. Then Tab 3: `lambda/handler.ts`, then `infra/template.yaml`. | "The app is hosted on Amazon S3 and computes in the browser. We've also built an AWS Lambda backend with a Function URL and CloudWatch logging, defined in SAM. Our organisation's AWS policy blocked deploying it, so it isn't live yet, and every result says where it was computed." |
| 2:45–2:55 | Back to the live app, "Method & limits" section. | "Satellite sunlight is an estimate, and we haven't measured real-world savings yet. But for an owner who's never checked, Dhoop turns a confusing number into a clear next step. Dhoop: check your solar against the sun." |

**After recording:** upload to YouTube as Unlisted or Public, open the link in a private window to confirm it plays without signing in, and check the length is under 3:00.
