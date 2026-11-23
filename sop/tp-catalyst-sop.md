# TP Catalyst search: operating procedure and site map

Built from live exploration on 16 Nov 2026 (software version 12.01, release 199 / `202610-1`), test analysis
"ZZ automation test". The demo video is one example of this procedure; nothing here is tied to its filters.

Status of each part: **verified** = done live and seen to work, **mapped** = screen read but not confirmed with OK,
**open** = not reached yet.

## 1. Addresses

Base: `https://tpcatalyst-r1.bvdinfo.com/<release>/tpcatalyst/1/Companies` (release changes monthly; read it from the
address after login, never hard-code it).

| Page | Address after base | Status |
|---|---|---|
| Home (list of analyses) | `` | verified |
| Create analysis | `/Analysis/CreateAnalysis` | verified |
| Search page | `/SearchExpert` | verified |
| A search criterion | `/SearchExpert/By/<Id>` (ids in `criteria-catalogue.json`) | verified |
| Edit an existing step | `/SearchExpert/By/<Id>?editIndex=<n>` | mapped |
| Results list | `/List` | partly (see 6) |
| Free preview of results | `/List/Display/FreeDefault` | mapped |
| Add/remove columns | `/ListEdition` | open |
| Screening steps | `/Search` | open |
| Settings | `/Settings` (exports: `/Settings/ExportsPreference`) | mapped |

Every criterion can be opened by address, so the script does not depend on the user's Favourites list.

## 2. Create analysis  (verified)

| Field | Selector | Notes |
|---|---|---|
| Database version | `#SelectedRelease` | Current release plus monthly back-releases |
| Analysis name | `#analysisname` | |
| No tested party | `label[name='SkipTested']` (input `name=SkipTested`) | Ticked: goes straight to the search page |
| Data source | `input[name=Datasource]` values Orbis, Osiris, Amadeus, Oriana, America, Sabi | Only Orbis ("All companies, worldwide") is enabled on this licence |
| Company size scope | `#CompanyTypesOrbis` | All / Very large, large and medium / Very large and large / Very large / Medium and small |
| Accounts closing date | `#CutOffDate` | Day/month. This account defaults to **31/03**; the demo video showed 31/12 |
| Comment | `#GeneralComment` | |
| Start | `input[type=submit].button.ok` | |

## 3. Search page  (verified)

| Element | Selector |
|---|---|
| Running total | `#records-count` ("Your search: N companies") |
| Step rows | `table.search-summary tbody tr[data-index]`: step text, step count, running count |
| Step on/off | `input[name=stepActive]` in the row |
| Delete a step | `td.remove-step img` in the row (asks to confirm "Delete") |
| Boolean expression | `#searchFormula`, then `button.refresh` |
| Clear all steps | link "Clear search steps" (no confirmation) |
| Save search | link "Save" (dialog: new or replace, Name, Description) |
| View results | `a[href$='/Companies/List']` |
| Load a search / company set | `#tooltabload-search-section`, `#tooltabload-set-section` |

Common shape of every criterion screen:
- Heading `#main-content h4`: "No choices made" or "Choices made: N companies selected".
- Left tabs `#tab-<Name>`.
- `a.button.ok` (has class `disabled` until a choice is made) and `a.cancel`.
- After OK the site returns to the search page with one more row.

## 4. Criteria

### Verified

| Criterion | Id | How to set it |
|---|---|---|
| Region / country | `CountryRegion` | Type in `input[name=freetext]`, wait, click `li[data-id] div[title='<exact name>'] span.selector`. Regions and countries have fixed ids (MENA = `9X2`, countries = `9` + ISO code, e.g. `9AE`). Tab `#tab-TypeOfAddress`: `input[name=picklist]` value `PriorityOnly` (incorporation, default) or `TradingAddressOnly` |
| Industry codes | `IndustryClassificationsTP` | Pick the scheme tab, type the code in `input[name=freetext]`, click `li[data-id='<code>'] span.selector`. Tab `#tab-CodeType`: `input[name=picklist]` value `Primary` (default), `All`, `Secondary` |
| Status | `Status` | Click `li[data-id='ActiveRootKeys'] span.selector` (also `InactiveRootKeys`, `UnknownSituationKeys`; first two expand into sub-statuses). Tab "Change date" |

Industry schemes (tab ids): Nace, UsSic, SICUK2007, Naics, ANZSIC2006, ATECO2007, CNAE22, CSIC2011, NIC2008 (India),
IDSIC, KRSIC, KZOKED, NACEBEL2008, NAF2, OKVED2014, PSIC2010, SBI2008, SNISE2007, SSIC2015, TSEC2010, WZ2008.

### Mapped (controls read; OK not yet pressed live)

| Criterion | Id | Controls |
|---|---|---|
| Account type | `AccountType` | `input[name=picklist]` values `C1Keys`, `C2Keys`, `U1Keys`, `U2Keys` (click the `label[for=...]`) |
| Independence indicator | `IndependenceIndicator` | `input[name=values]` values `a`, `b`, `c`, `DKey`, `UKey`; confidence `#confidencea/b/c` (All, High, Medium, Low); extras `name=listed`, `name=individual`, `name=branches`. **A is pre-ticked** when the screen opens. Tab "Time period" |
| All companies with | `TPAllCompaniesWith` | `input[name=ids]` values `AllCompaniesWithAddress`, `...PhoneNumber`, `...FaxNumber`, `...WebsiteAddressSM`, `...EmailSM`, `...Overview`, `...TradeDescription`. Tabs Accounts, Identifiers. One search step is added per ticked box |
| Financial value | `TPKeyFinancials`, `TPGlobalStandardFormat`, `TPGlobalDetailed`, `TPSpecificRatios`, `TPPLIGlobal`, `TPGlobalRatios` | Units `#unit` (thousand, million, billion), `#currency`; `input[name=valueType]` values `Value`, `GrowthRate`, `DecreasingRate`, `PositiveTrend`, `NotNA`; `input[name=minValue]`, `input[name=maxValue]`, `#topValue`; `input[name=includeNas]` |
| ... variable | tab `#tab-FinancialItem` | Radio list of items. Key financials: Operating revenue, P/L before tax, P/L for period, Cash flow, Total assets, Shareholders funds, Current ratio, ROE, ROCE, Solvency ratio, Number of employees |
| ... time period | tab `#tab-TimePeriod` | **Relative**: `input[name=time]` values `year-0` (last available) to `year-9`. **Absolute**: `year-2026` down to `year-2017`. Rule: `input[name=choiceOfValidation]` values `AtLeastOneYear` (+ count), `AllYears`, `Average` |
| Activity text search | `TradeDescriptionLucene` | `textarea#text` (Boolean operators and `*` allowed), then the "Search" button, then OK. `input[name=exactMatch]`. Tab `#tab-Scope`: 23 tick boxes for which text fields are searched (all ticked by default) and primary vs primary+secondary activity labels |

### One-click criteria (verified by accident)

These add a step as soon as they are clicked, with no screen: All companies, All Global SIFIs, All companies with
preliminary data, All companies with notes, All companies with royalty agreements.

### Not yet opened

The other 50 or so criteria in `criteria-catalogue.json` (legal form, employees, year of incorporation, size class,
entity type, BvD sectors, listing status, ownership by profile, own variables, and so on).

## 5. Rules the script must follow

1. **Population cap:** the results list refuses more than **10,000** companies ("Limited population"). Check the
   running total before opening results.
2. **Step numbers:** the Boolean expression refers to row numbers, so build it from the rows actually present after
   all steps are added (one box in "All companies with" = one row).
3. **Counts:** read "Choices made" before OK and the row counts after; log both. Stop if a step gives 0.
4. **Site stability:** the site returned 502/503/504 errors three times during a 40-minute session and one page load
   hung the browser connection for about a minute. Every step needs a long timeout, a check that the page is a
   TP Catalyst page and not an error page, and a wait-and-retry that never repeats a step already applied.
5. **Credits:** opening or exporting a results page spends a credit unless the free preview is chosen.
   Default is no credit spend without an explicit setting in the job.
6. **Financial year:** absolute years are available per financial filter, and the analysis has its own accounts
   closing date. How "FY 25-26" maps to these two is a tax decision, not a site fact (see open questions).

## 6. Results list  (partly mapped)

- Heading `#records-count`: "Your rejection summary: N companies".
- "Add a screening step" (`/Search`), filter button `a.add-filter`, page box `input[data-action=navigate]`,
  rows per page `#recordsPerPage` (15, 25, 50, 100).
- View menu `a.menu-view__toggle--dropdown`; "Add/remove columns" (`/ListEdition`).
- Over the cap: "Switch to free preview" (`#okLink`) or "Go to search".
- Pay-per-view panel (verified): `div.creditResults`, balance in `p.creditBalanceMsg b`, radios
  `input[name=ViewFormat]` value `current` (spend 1 credit) or `free`; confirm with `#okLink`.
  The paid option is selected by default, so the script must pick one explicitly.
- Free preview (verified, no credit spent): lands on `/List/Display/FreeDefault`, shows only company name, country,
  NACE core code, consolidation code and last available year. The view menu offers only "Free view" there.
- Top buttons: Actions, Comments, Save, Excel, currency.
- Excel dialog (verified up to Cancel): `.popup__dialog.export`
  - Name: `input[name='component.FileName']` (default "Export <date> <time>")
  - What to export: `select[name='component.SelectedFormatId']`: Current view, Standard view, Free view, and saved
    views by id: 2025, 2025 - Team 3, Pillar Two, Activity Text, All columns, SBC VIEW, SBC standard view, Animal Feed
  - Which companies: `select[name='component.RangeOptionSelectedId']`: All, Marked, Unmarked, Range
  - "Also send email": `input[name='component.Send']`
  - "Options for Excel" link (not opened yet); buttons Cancel and Export (`a.button.submit.ok`)
  - The dialog says "Your export is saved to Exports", so the file is produced in the background and collected
    from an Exports area. That area and the download itself are **open**: pressing Export was not tested because it
    may spend a credit.

- Screening steps (mapped): "Add a screening step" opens `/Search`, which is the same criteria picker as the search
  page with the addresses under `/Search/By/<Id>`, and "APPLY SCREENING STEP" returns to the list. So the criteria
  blocks in section 4 can be reused for screening by changing the address prefix.
- Left bar (icons): search, results list `/List`, reports `/Report`, tools `/Tools`, settings `/Settings`.
  The Exports area is probably under Tools; not opened yet.

### Export, verified end to end on 16 Nov 2026 (2 credit confirmations, 160-company test search)

1. Paid display: choose `current` on the pay-per-view panel, `#okLink`. The list shows the Standard view with
   Review and Reason columns.
2. Click "Excel", set the view and "All companies", click Export.
3. The first Export request is refused (HTTP 402) and a second credit warning opens (`.popup` containing
   `.creditResults`, "Use 1 credit to display results"). Choose it and click OK in that popup.
4. The site then posts `/list/Export?SkipCreditsWarning=true`, polls `/Exports/GetSingleDelayedExportStatus`, and
   the browser **downloads the file directly** (about 20 seconds for 160 companies). No visit to an Exports page
   is needed.
5. The file name typed in the dialog was not kept: the download arrived as "Export 16_11_2026 12_52.xlsx".
   The runner must rename the file itself.
6. Excel options (all on by default): include search strategy, rejection strategy, general parameters;
   multiple values "Export each value to a distinct cell" (so 160 companies gave 177 rows) or "Keep one record
   per line".
7. The balance read 803 at both warnings; it was not re-read afterwards, so the exact cost is still unconfirmed.

### Export file format (same in the test export and in 214 past files)

- Sheet **Search summary**: general parameters (release, data source, user, export date), **Search Strategy**
  (each step with its detail and counts, the Boolean expression, TOTAL), **Rejection summary**, rejected BvD ids
  with reasons, fiscal year end, comments, ownership definitions.
- Sheet **Results**: one heading row, then companies. View "2025" gives 84 columns: name, BvD ID, world region,
  country, date of incorporation, NACE and US SIC codes, full overview, trade description, website, main products,
  then five years (2025 to 2021) each of operating revenue, EBIT, sales, cost of goods sold, gross profit, cost of
  employees, operating margin, net cost plus, gross margin, EBIT/total assets, net profit/total assets, the
  independence indicator, intangible, current and total assets, number of shareholders.
- Raw exports cannot be opened by the `openpyxl` library (stylesheet attribute `applyNumFmt`); use
  `explore/xlsx_raw.py`. Files re-saved in Excel open normally.

## 6a. House search template (from 214 past SBC searches, June to September 2026 releases)

Source: `U:\Benchmarkings\SBC Searches 2025 and 2026\2026\With 2025 numbers` (231 files; 214 read, 5 raw files
and 1 RoyaltyStat file skipped, the rest are other layouts). Strategies are stored in `sop/past-searches.json`.
File names follow `DD-MM-YY - <Category> - <Description> - TPC R<release>.xlsx`.

| # | Step | Usual setting | How often |
|---|---|---|---|
| 1 | Scope | All companies | always |
| 2 | Region | Eastern Europe, Middle East, Africa, MENA, United Arab Emirates (incorporation address) | 148 of 199; Western Europe added in 14 |
| 3 | Account type | U1 | 198 of 198 |
| 4 | Status | Active + Unknown situation | 132; Active only in 64 |
| 5 | Independence | A, B and U | 167 of 194 |
| 6-8 | Companies with | website, overview, trade description | about 200 |
| 9 | EBIT | min 0, three latest years, all selected periods | 168 of 198; "at least 2 of 3" or "3 of 4" in 30 |
| 10 | Operating revenue | min 1 million USD, same years and rule | same split |
| 11 | NACE Rev. 2 primary codes | varies by industry | 196 |
| 12 | US SIC primary codes | varies by industry | 179 |
| 13 | NAICS 2022 primary codes | varies by industry | 81 |
| 14 | Activity text search | varies by industry (often more than one) | 224 steps |

- Boolean shape, most common: `1 and 2 and 3 and 4 and 5 and (6 or 7 or 8) and 9 and 10 and (codes or text)`.
  Variants: `6 and (7 or 8)`; text as a separate "and"; a "not" step to exclude a keyword.
- Years: "2025, 2024, 2023" in 100 searches and "2024, 2023, 2022" in 68, chosen as **absolute years**.
- Fiscal year end: 31/12 in 191, 31/03 in 14.
- Result size: median 638 companies, largest 5,611; 16 searches above 2,000.
- Screening and rejection inside TP Catalyst was used in only 2 files.

These are defaults for the planner; industry codes, keywords, region and years come from the brief.

## 6b. Search builder `search.mjs` (verified live 16 Nov 2026, no credits spent)

`node search.mjs --job jobs/<name>.json` clears the open analysis's search steps, adds every step in the job
file, sets the Boolean expression and stops at the company count. Example job
`jobs/household-appliances-mena.json` gave 13 steps, `1 and 2 and 3 and 4 and 5 and (6 or 7 or 8) and 9 and 10
and (11 or 12 or 13)`, **976 companies**, in about 4 minutes. Evidence in `runs/<job>-<time>/`.

Site quirks found while building it (all handled in the script):
- Financial filter: choose the variable, then **type** the value with real keystrokes on the Values tab, and only
  then choose the years. In any other order the count never arrives and OK stays disabled.
- Untick "Last available year" on the Relative list before switching to Absolute (it is hidden afterwards).
- Multi-year financial counts take 10 to 30 seconds.
- Industry codes: every scheme tab has its own search box; use the visible one. Do not click the tab that is
  already selected (the list hangs on "Loading").
- Region and code search boxes react to a pasted value, not to key-by-key typing.
- Step number = row `data-index` + 1; row 1 is always "All companies in the scope of analysis".
- Settings confirmed: decision 16 Nov 2026 - status **Active only**, **latest three years** (2025, 2024, 2023),
  all selected periods, closing date 31/12.

Not done yet: creating a new analysis from the script (closing date 31/12), the paid results and export step,
recovery from `_AUTOSAVE_`, NAICS (same screen as NACE, untested).

## 7. From a plain brief to a run

```
Brief (free text)                    e.g. "distribution of household appliances, FY 25-26, MENA"
   |
   v
Planner (Claude API)                 turns the brief into a job file: industry codes per scheme, keywords,
   |                                 region names, years, thresholds, Boolean logic. Uses only the brief and
   |                                 public classification lists; it is never shown TP Catalyst data.
   v
Job file (JSON) -> human review      a person checks codes and keywords before anything runs
   |
   v
Flow composer -> Runner -> Chrome    adds the steps in section 4, applies the rules in section 5
   |
   v
runs\<job>-<time>\                   dump, counts per step, search strategy, screenshots, run log
```

Draft job file:

```json
{
  "job": "HHA-MENA-FY2526",
  "operator": "named user",
  "analysis": { "name": "HHA MENA FY25-26", "closingDate": "31/03", "skipTestedParty": true },
  "steps": [
    { "use": "region", "names": ["MENA"], "address": "incorporation" },
    { "use": "status", "values": ["active"] },
    { "use": "accountType", "values": ["U1"] },
    { "use": "independence", "values": ["A", "B", "U"] },
    { "use": "companiesWith", "values": ["website", "overview", "tradeDescription"] },
    { "use": "financial", "item": "operatingRevenue", "min": 1, "unit": "million", "currency": "USD", "years": ["last"] },
    { "use": "industry", "scheme": "Nace", "codes": ["4643", "4649"], "codeType": "Primary", "tag": "nace" },
    { "use": "industry", "scheme": "UsSic", "codes": ["5064"], "codeType": "Primary", "tag": "sic" },
    { "use": "text", "query": "(wholesal* or distribut*) and (appliance*)", "tag": "text" }
  ],
  "boolean": "all except: (nace or sic)",
  "results": { "view": "SBC standard view", "spendCredits": false, "export": "excel" }
}
```

The codes and keywords above are placeholders to show the shape, not a recommended strategy.

## 8. Open questions

1. FY 25-26: which years to tick, and should the closing date be 31/03 or 31/12 for a given region?
2. May test runs spend credits, or free preview only?
3. Which saved view is the standard for exports?
4. Is screening and rejection (accept/reject with reasons) to be automated, or does it stay in TAIGA?
5. Still to explore: results list, views, columns, Excel export, save/load search, screening steps, the remaining
   criteria, and how long a login session lasts.
