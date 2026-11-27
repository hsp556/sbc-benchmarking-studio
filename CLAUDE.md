# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SBC Benchmarking Studio: comparable-company searches for transfer-pricing benchmarking, in Moody's TP Catalyst
(global) and CMIE Prowess (India). A plain brief (industry, function, financial year, region) is planned by a
model, reviewed by a person, and built in a logged-in Chrome window by a runner. TP Catalyst stops at a free
company count and exports to Excel only after a named approval; Prowess pulls the data in one confirmed run and
saves two CSVs for TAIGA (the firm's analysis tool), which does the filtering.

Git repository, private: github.com/hsp556/sbc-benchmarking-studio (branch main; `gh auth switch -u hsp556`). `.gitignore` keeps keys, run output, database screenshots, `sop/past-searches.json` and `sop/prowess-product-groups.json` off GitHub (licensed or team material: the planner needs both JSON files, so copy them by hand to a new PC). Windows, PowerShell, Node 25 (ES modules, no build step outside `studio/web`), Python 3.12
for the Excel helpers. Agreed build order: this PC end to end → office PCs → AWS → runners for ACE and
Capitaline (Prowess was brought forward and is built) → self-learning research agents last.

## Commands

```powershell
npm install                                 # root: API, runner, planner
cd studio/web; npm install; npm run build   # website (tsc --noEmit + vite build); no Studio restart needed after
node studio/api/server.mjs                  # Studio at http://127.0.0.1:3000 (API + studio/web/dist); data in studio/data/
npm run chrome                              # visible Chrome on debug port 9222, profile chrome-profile/; the user logs in by hand
node runner/runner.mjs                      # polls the Studio, runs search.mjs per task (TP Catalyst; Prowess below)
```

`Start Studio.cmd` / `Start Runner.cmd` / `Start Prowess Runner.cmd` do the same and read `office.env` (see `office.env.example`) through
`node --env-file-if-exists`; they must keep CRLF line endings. Env: `HOST`, `PORT`, `STUDIO_PASSWORD`,
`RUNNER_TOKEN`, `STUDIO_URL`, `RUNNER_AGENT` (`catalyst` or `prowess`), `RUNNER_NAME`, `SHAREPOINT_DIR`, `CHROME_PORT`, `LOG_LEVEL`, `PLANNER_MODEL` (Gemini fallback list).

Checks:

```powershell
node --test --test-timeout=15000 studio/api/api.test.mjs    # API with a stand-in planner. Name the file, not the folder.
node --test --test-timeout=120000 runner/runner.test.mjs    # runner with runner/fake-search.mjs and a stand-in Chrome (the export test alone takes about 90 s)
node --test --test-timeout=15000 --test-name-pattern="password" studio/api/api.test.mjs   # one test
node studio/web/smoke.mjs                   # headless screens at 375/768/1024/1440 against the running Studio; --plan adds a real plan
node planner/eval.mjs                       # 12 fixed briefs through the real model (a few cents)
node studio/acceptance.mjs                  # five live searches, Studio total vs site total (needs login; no credits)
npm test                                    # legacy run.mjs against test/mock.html
```

Always give tests a hard time limit: an open progress stream once hung a run.

Without the Studio, and site probes:

```powershell
node planner/plan.mjs "industry: ...; function: ...; FY 2025; region: ..."   # writes jobs/<name>.json
node search.mjs --job jobs/<name>.json      # builds the search live, stops at the count
node explore/02-ping.mjs                    # is the session logged in?
node explore/act.mjs explore/steps.json     # ad-hoc action list against the live tab
python -I explore/xlsx_raw.py "<export.xlsx>"   # raw exports break openpyxl (applyNumFmt)
```

Prowess (same Chrome, the user logs in to https://prowess.cmie.com by hand; see the hits rule before any `--go`):

```powershell
$env:RUNNER_AGENT='prowess'; node runner/runner.mjs   # second runner process, for Prowess (or "Start Prowess Runner.cmd")
node prowess.mjs --job <job.json>               # free check: reloads the page, fills all four forms, reads the hits, runs nothing
node prowess.mjs --job <job.json> --go          # the real run: 4 Execute clicks (hits), then both CSVs into runs/<job>-<time>/
node explore/prowess-history.mjs                # today's commands, status and company counts (free)
```
A Prowess job file is `{ job, groups: ["Software services"], fromYear: 2023, toYear: 2025, rptYear: 2024 }` (March year-ends).

## Architecture

```
website (studio/web) ──► Studio API (studio/api) ◄── runner (runner/runner.mjs, one process per database)
                              │  planner/planner.mjs (Claude, Gemini fallback)     ├─spawns─► search.mjs  ─CDP─► TP Catalyst tab
                              └  SQLite studio/data/studio.db,                     └─spawns─► prowess.mjs ─CDP─► Prowess tab
                                 export files studio/data/exports/                    both write runs/<job>-<time>/ (copies to SHAREPOINT_DIR when set; unset for now)
```

- **One spec per database** (`studio/shared/job-schema.mjs`: Zod `SearchSpec` for TP Catalyst, `ProwessSpec` for
  Prowess, chosen by `specFor(agent)`) is what the planner returns, the API stores and the search script reads as
  a job file. Add a field there first.
- **Studio API** (`server.mjs`, `db.mjs`; Fastify 5, `node:sqlite`): `build({...})` takes the planner as a parameter so
  tests inject a stand-in. Planning streams NDJSON stages; job progress is Server-Sent Events. Errors use one
  envelope `{code, message, requestId}`. `/api/runner/*` needs `Bearer RUNNER_TOKEN`; everything else needs the
  shared `STUDIO_PASSWORD` (browser Basic sign-in) when set; it refuses a non-loopback `HOST` without both.
- **Prowess path** (`ProwessSpec` in the same schema file, `prowess.mjs`, `RUNNER_AGENT=prowess`): there is no free
  count and no separate export. Creating the job needs `confirmHits: true` (the person's go-ahead for the hits);
  one task ticks the CMIE groups, makes the four Execute clicks, exports two CSVs and the runner copies them to
  `SHAREPOINT_DIR` when it is set (it is not, until the AWS stage: the CSVs stay in `runs/` and reach TAIGA by hand; filtering is TAIGA's job, not ours). The planner picks group names
  from `sop/prowess-product-groups.json` (6,943 CMIE names, read from the site's tree; Claude only, two calls).
  After the first Execute click the task is never handed back or retried (`spent` in the end event).
- **Runner** makes outgoing calls only: heartbeat (browser state read from Chrome's `/json`), claim, steps, finish.
  A claim is either a search or an approved export (exports first). `search.mjs` reports through `@@{json}` lines on
  stdout (`--events`). Failures matching "logged out / No analysis is open" hand the task back to the queue.
- **`search.mjs`** creates a new analysis per job, runs one block per criterion (`blocks`), records the row numbers
  each block added, then writes the Boolean from them: base steps and-ed, "companies with" or-ed, activity or-ed.
  If the count is over `maxCompanies` it tightens only the activity join (codes OR keywords → codes AND keywords →
  a code in every classification AND keywords). With `--export --view --expect` it then displays and exports;
  credit-spending clicks are never retried, and once `spending` is set the task is never handed back.
- **Planner** (`planBrief`): Claude `claude-opus-5-5` with structured output, about 10 s; Gemini over REST as
  fallback. The model proposes only the job name, regions, codes (NACE, US SIC, NAICS), keyword lines and
  assumptions. The house template is fixed in code (U1, Active, independence A/B/U, website/overview/trade
  description, EBIT ≥ 0 and revenue ≥ 1m USD for the latest three full years). Output is untrusted: codes are
  regex-checked and malformed keyword lines dropped. Past strategies in `sop/past-searches.json` are style examples.
- **Website**: React 19 + Vite + Tailwind v4, light theme only, tokens in `studio/web/src/index.css` (no raw hex in
  components), lucide icons, 44px targets. `App.tsx` tabs, `NewSearch.tsx` brief → plan review, `pages.tsx` Run
  (progress, export approval), Searches, Agents, Guide.
- **`sop/tp-catalyst-sop.md`** is the source of truth for the site (addresses, selectors, export procedure). Read
  it before touching `search.mjs`; update it when a screen is verified.
- `run.mjs` + `test/` + `flows/` are an earlier generic runner used only by `npm test`. `explore/` holds one-off
  probes; `explore/steps.json` and `explore/prowess-probe.mjs` are scratch.
- **`sop/prowess-notes.md`** is the same for Prowess (procedure, selectors, quirks, measured hits).
- **ACE and Capitaline** have no runner. `sop/ace-tp-nxt-notes.md` covers ACE (Windows desktop app, from a
  training recording only). Capitaline is a separate Python project, `D:\capitaline agent`.
  The aim is one filter list with standard names in the brief and plan and each database's own names in the run
  steps; three definitions still need a TP manager's ruling (size: sales / net sales / total income; profit:
  EBIT / PBT; related-party base), so do not hard-code a mapping.

## Site quirks that look like bugs if "fixed"

- Financial filter: pick the variable, **type** the value with real keystrokes on the Values tab, only then choose
  years. Any other order leaves OK disabled. Untick "Last available year" before the Absolute year list.
- Region and code search boxes react to `fill`, not key-by-key typing. The industry screen has one search box per
  scheme tab: use `:visible`, and do not click the already-selected tab.
- Step number = row `data-index` + 1; row 1 is always "All companies in the scope of analysis".
- After changing the Boolean the count is recalculated in the background: wait for it to change and then for two
  equal readings. Reading it at once gave 17 instead of 1,934.
- The release segment of the base address changes monthly: read it from the tab. With no analysis open every
  `/SearchExpert` address redirects to the home page; an unsaved analysis disappears at logout.
- The site often returns 502/503/504 and logs out after about an hour. Retries must never repeat an applied step.
- The results list refuses more than 10,000 companies.
- Gemini free tier: Pro models have no quota and flash models return 503 at busy times, hence the model list.
- Prowess: forms keep old values while the page stays open (a stale range box once nearly filtered a data pull):
  check every range box before an Execute. Its trees hold thousands of rows, so Playwright `:has()` selectors
  hang: look rows up with one `page.evaluate`. A new OSC becomes the current sheet by itself.
- Prowess: the "New Outputs" counter lags behind Commands History. Clicking it as soon as the history says OK does
  nothing and no sheet tab opens (this stopped the first Studio run after one charged click): retry until the tab
  appears (`openSheet`). After a page reload the OSC Sheets view is empty and earlier sheets do not reopen from
  the menu, so a stopped run cannot be continued: a rerun starts from the first click.
- Over CDP, Playwright diverts downloads to its own temporary folder, so nothing appears in Downloads: wait for the
  `download` event and `saveAs`.

## Rules

- **Never handle a database password** (TP Catalyst or Prowess). The user logs in themselves in the Chrome window.
- **Credits:** displaying results or exporting can spend pay-per-view credits. Never do it without the user's
  approval for that run. The one live export (paints, 660 companies) left the balance at 801, reason unknown: keep
  the approval gate and do not assume exports are free.
- **Prowess hits:** every Execute click in Prowess (Send to new OSC, Add to current OSC, and assume Retain, Add
  data, Replace, Remove, Send to new WS) spends hits from a limited balance (7,001 allowed; the user says 10 per
  click, the profile page showed 1 per click on 18 Nov 2026; "Export as excel csv" showed 0). Never click one, or
  export, without the user's go-ahead for that run, and read the hits before and after; ticking, searching and
  typing are free. Do not touch the team's sheets or saved sets. See `sop/prowess-notes.md`.
  "Run the Studio / the agent live" means start the processes so the user can drive them from the website. Never
  submit a Prowess job yourself (the API's `confirmHits`) unless the user gives the brief and says to spend the
  hits: on 18 Nov 2026 a run submitted on a misread instruction cost a hit before the user stopped it.
- **Licence:** an internal summary of the Moody's order form says TP Catalyst information may not be used with AI
  tools or loaded into third-party platforms; the user chose to proceed. Keep exposure minimal: scripts read step
  text and counts, not company rows, and the planner is never sent anything from TP Catalyst, counts included
  (which is why narrowing is rule-based).
- **Analyses:** each job creates its own, named after the search plus the time. Do not edit or delete the user's
  other analyses, saved searches or views. Do not raise the licence's 150-benchmark figure again (user decision).
- **Keys** live in `local.env` (`ANTHROPIC_API_KEY=<key>`, `gemini=<key>`) on the Studio PC only; never print them.
- **Output** stays in `runs/` and `studio/data/`. The only other destination is SBC's SharePoint (user decision,
  18 Nov 2026): when `SHAREPOINT_DIR` is set the runner copies each export into that OneDrive-synced folder, never
  overwriting, and reports `shared_path` / `shared_error` (tested with a stand-in folder, not yet with a real one).
  No Microsoft keys are held; an API upload (Graph) is only for the AWS stage.
  User decision, 19 Nov 2026: SharePoint will be connected at the AWS stage only (Graph, app registration with
  `Sites.Selected`). User decision, 27 Nov 2026 (AWS stage): the hosted Studio keeps no export files
  (`EXPORTS_ON_RUNNER=1`); the runner PC syncs a SharePoint folder with OneDrive and sets `SHAREPOINT_DIR`, so the
  comparables reach the team through SharePoint, never through AWS. A Graph upload may replace the synced folder later.
- **Nothing is fixed to the demo video.** Filters vary per job.

## User decisions

Closing date 31/12; Active only; latest three full years, all periods; export view "2025"; export file named
`<industry> - <function>.xlsx`; at most 2,000 companies per search (editable per plan), thresholds never changed
automatically; similar finished searches are offered for reuse; imported command-line runs (ids `run-…`) are
shown as unverified and not offered for reuse; one dedicated runner PC first.

Prowess (18 Nov 2026): filtering is done in TAIGA from the two CSVs, not in Prowess or the Studio. Follow our own plan (the training-deck procedure in `sop/prowess-notes.md`, run through
this project's Chrome), not the separate `prowess-tp-search` skill file (seven layers, gates G0–G8, TAIGA) for now.
The run of 18 Nov (stages e1 to e4, then the two CSV exports) is the confirmed standard: the user checked the
CSVs and said to follow those steps. The user also said to set aside the CMIE written-confirmation point from
the internal memo (their call; do not raise it again). The hits go-ahead per run still applies.

## State of things

- Proven live: plan → search → count matching the site (5 of 5 acceptance runs), narrowing (2,601 → 261,
  51,451 → 985), one approved export.
- Built, not proven live: mid-run logout hand-back; maximum thresholds (parked by the user); `Start Runner.cmd`;
  token and password across two PCs (`docs/office-pc-setup.md`).
- Prowess: the search and exports were proven live by the earlier scripts (18 Nov: 4 Execute clicks, 4 hits, two
  CSVs). The Studio path (`prowess.mjs`, runner, plan screen) is built and tested with stand-ins, and `prowess.mjs`
  passed a live run without `--go`. Two Studio runs on 18 Nov stopped after the industry click (1 hit each, hits
  unused sheets O1268 and O1269 left in the account). The cause was fixed (`openSheet`) and the user's next run
  from the website then went end to end: "Software services", 202303-202503, 1,653 companies, 832 in the
  related-party worksheet, both CSVs in `runs/it-software-services-fy2025-2026-11-18T15-12-01/`, 4 hits
  (3,629 → 3,633). So the Prowess Studio path is proven live once.
- Not built: thresholds from the brief; personal sign-in; headless mode; AWS; other database runners; qualitative
  review of comparables and the research agents.
