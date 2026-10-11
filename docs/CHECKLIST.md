# Submission checklist

## Website
- [ ] Rebuild and upload: `npm run build:web`, then upload everything inside `dist-web/` (`index.html` and `assets/`) to the S3 bucket, replacing the old files.
- [ ] Open the live URL in a private window. Press Ctrl+F5 if you still see the old version.
- [ ] Sample week: click "Explore a sample week"; the yellow "Simulated" band appears.
- [ ] Real check: Delhi, 3 kW, seven readings → report header says "Computed on AWS Lambda", with the green "Live satellite data" band and a source line naming the grid cell and dates.
- [ ] Check it on a phone.

## Repository
- [ ] `npm test` passes (29 tests) and `npm run build:web` succeeds.
- [ ] Commit and push to https://github.com/ri25-cmd/dhoop.
- [ ] The README on GitHub shows the live link and the AWS table (S3 and Lambda both live).
- [ ] The repository is public: open it in a private window.
- [ ] No secrets committed (`web/.env` is not in the repo; only `web/.env.example`).

## Video
- [ ] Follow `docs/DEMO-VIDEO.md`; under 3:00.
- [ ] Shows the problem, the target user, the working product with live satellite data, and the AWS setup.
- [ ] Says the readings are test values, and shows "Computed on AWS Lambda" plus the CloudWatch log line.
- [ ] Uploaded as Unlisted or Public; plays in a private window.

## Submission form
- [ ] Live URL, GitHub URL and video URL each open in a private window.
- [ ] Description taken from `docs/WRITEUP.md`; paste the video URL into its header.
- [ ] Track: Waste & Energy. AWS services: Amazon S3 (hosts the app), AWS Lambda with Function URL (runs every check, ap-southeast-2), Amazon CloudWatch Logs (per-check logs); AWS SAM template in the repo.
- [ ] Submit before the deadline, and keep a screenshot of the confirmation.
