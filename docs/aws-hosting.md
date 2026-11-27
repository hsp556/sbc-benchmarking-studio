# Hosted Studio: https://www.tpdocgenai.com/benchmarkingStudio

The Studio (website + API) runs on AWS in TAIGA's account (600627321277, ap-south-1), on TAIGA's load balancer and
ECS cluster `taiga-dev`, as its own CloudFormation stack `bm-studio-dev` (`deploy/app.mjs`). Runners stay on the
office PCs (they need the logged-in Chrome) and call the hosted Studio over HTTPS.

- Route: HTTPS listener rule priority 900, host `www.tpdocgenai.com`, paths `/benchmarkingStudio` and `/benchmarkingStudio/*`,
  target group `bm-studio-dev`. Not on the HTTP listener, and not named `taiga-dev-*`, so TAIGA's deploy-time rule
  mirror neither copies nor deletes it.
- One Fargate task (SQLite on EFS, encrypted, retained on teardown). Logs: CloudWatch `/bm-studio/dev`.
- `EXPORTS_ON_RUNNER=1`: the hosted Studio refuses export files (410). TP Catalyst Excel files stay on the runner PC
  and, when `SHAREPOINT_DIR` is set, are copied to the team's SharePoint folder (user decision, 27 Nov 2026); the run
  page says so and the last progress step gives the folder. Runners need the 410 handling in `runner/runner.mjs`.
- Secrets (Secrets Manager): `bm-studio/dev/studio-password` (website sign-in, any user name),
  `bm-studio/dev/runner-token` (runners' `RUNNER_TOKEN`), `bm-studio/dev/anthropic-api-key` (planner; created as a
  placeholder: put the real key in, then restart). No Gemini fallback on the hosted copy.

## Release a new version

```powershell
$env:AWS_PROFILE='taiga'; $env:AWS_REGION='ap-south-1'
$R='600627321277.dkr.ecr.ap-south-1.amazonaws.com'
aws ecr get-login-password | docker login --username AWS --password-stdin $R
docker build --platform linux/amd64 -t "$R/bm-studio:latest" .   # from the repo root
docker push "$R/bm-studio:latest"
aws ecs update-service --cluster taiga-dev --service bm-studio-dev --force-new-deployment
```
Infra changes: `cd deploy; npm install; npx cdk diff; npx cdk deploy` (check the diff touches only `bm-studio-dev`).
Build the image on a PC that has `sop/past-searches.json` and `sop/prowess-product-groups.json`: they are copied in when
present (Prowess plans need the second).

## Point a runner at it

In the runner PC's `office.env`:
```
STUDIO_URL=https://www.tpdocgenai.com/benchmarkingStudio
RUNNER_TOKEN=<value of bm-studio/dev/runner-token>
SHAREPOINT_DIR=<the SharePoint exports folder, synced to this PC by OneDrive>
```
The folder must exist (it is not created, so a typo cannot make a folder that syncs nowhere). Each export is copied
there without overwriting; the run page shows "Saved to SharePoint: ..." or the reason it was not.

## Remove it

`cd deploy; npx cdk destroy`, then delete the retained EFS file system and the ECR repository `bm-studio` by hand.
