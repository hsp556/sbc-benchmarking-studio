# SBC Benchmarking Studio

Comparable-company searches in Moody's TP Catalyst, started from a plain brief (industry, function, financial year,
region). A planner proposes regions, industry codes and keywords; a person reviews them; a runner builds the search
in a logged-in Chrome window and stops at the company count. Exporting the Excel file needs a named approval.

## Parts

- **Studio** (`studio/`): the website and API. One copy, on one PC. Keeps the list of searches and export files.
- **Runner** (`runner/`, `search.mjs`): works TP Catalyst in Chrome on the PC where someone is logged in.
- **Planner** (`planner/`): calls Claude (Gemini as fallback) with the brief and past search strategies only.

Prowess (CMIE) is a second database in the same Studio: `prowess.mjs`, started with `Start Prowess Runner.cmd`.
One confirmed run spends Prowess hits and saves two CSV files for TAIGA. See `CLAUDE.md` and `sop/prowess-notes.md`.

## Start

```powershell
npm install                       # once
cd studio/web; npm install; npm run build; cd ../..     # once, and after website changes
```

Then double-click **Start Studio** and **Start Runner**, log in to TP Catalyst in the Chrome window that opens, and
open `http://127.0.0.1:3000`. Settings (network address, password, runner token) go in `office.env`; copy
`office.env.example`. Setting up another PC: `docs/office-pc-setup.md`.

## Rules

- The TP Catalyst password is typed by the user in Chrome. No script stores or sees it.
- A search spends no credits. Only an export does, and only after a named person approves it on the Run page.
- A search over the company limit (2,000 unless changed in the plan) is narrowed by requiring a code and a keyword
  together. Thresholds are never changed automatically.
- The Moody's order form, as summarised internally, restricts using TP Catalyst information with AI tools and loading
  it into third-party platforms. The planner is never sent anything from TP Catalyst, scripts read step text and
  counts rather than company rows, and exports stay on the office PCs.
- API keys live in `local.env` on the Studio PC only.

## Checks

```powershell
node --test --test-timeout=15000 studio/api/api.test.mjs     # API
node --test --test-timeout=90000 runner/runner.test.mjs      # runner, with stand-ins
node studio/web/smoke.mjs                                    # screens at four widths
node studio/acceptance.mjs                                   # five live searches against TP Catalyst, no credits
```

`CLAUDE.md` has the working notes; `sop/tp-catalyst-sop.md` describes the TP Catalyst screens.
