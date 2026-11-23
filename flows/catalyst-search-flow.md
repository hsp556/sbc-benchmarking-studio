# TP Catalyst comparable search: screen-by-screen flow

Source: `TP Catalyst Comparable screening Demo.mp4` (9 min 50 s, no narration used; read from 163 key frames).
Site: `tpcatalyst-r1.bvdinfo.com/<release>/TPCatalyst/1/companies/...` (release in the demo: `202610-1`).
Demo case: fruit and vegetable trading/wholesale, MENA + Eastern Europe + Africa.

Every search-step screen has the same shape: a "Choices made" panel at the top with a running
"N companies selected" count, **Cancel** / **OK** on the right (OK is grey until a choice is made),
and the options below. **OK** shows a "Loading ..." overlay and returns to the search page.

## A. Create the analysis  (`/Analysis/CreateAnalysis`)

| # | Screen element | Action in the demo |
|---|---|---|
| A1 | Section "Analysis" > dropdown **Version of the database** | Left at "Current release - Release 199 - Oct 2026" |
| A2 | Text box **Analysis name** | Left at the default "TP Catalyst analysis 5" |
| A3 | Checkbox **I don't want to use a tested party** | Header later shows tested party "None" |
| A4 | Section "Data source" > radio **All companies, worldwide** + dropdown "All companies" | Left at default (other radios are greyed out) |
| A5 | Section "Financial year cutoff" > **Accounts closing date** | Left at "31/12" |
| A6 | Section "Add a comment" | Left empty |
| A7 | Confirm button at the bottom of the page | Not visible in the frames; lands on the tested-party page |

Tested-party page (`/Search/TestedParty`): tabs **Select a favourite / Search for a company / Select an own company**,
a company search box, **Cancel** / **OK**. The demo leaves it without choosing one (search icon in the left bar).

## B. Search page  (`/SearchExpert`)

Layout, top to bottom:
- Header: analysis name, tested party, **Close and save analysis**, **Generate TP report**.
- Buttons: **Comments**, **Clear search steps**, **Save**.
- Heading **Your search: N companies**.
- Step table: columns "Search step", "Result for: Step", "Search". Each added step has an **X** (delete),
  a checkbox (on/off), a **>** (edit) and sometimes **Show more**.
- **Boolean search** text box, a refresh button, a help button, and **Total**.
- Link **VIEW RESULTS >**.
- **Add a search step** panel: box **Find a search criterion**, category list (Favourites, Company, Identifiers,
  Location, Activities and industry, Financials, Directors managers and advisors, Ownership, Stock data,
  Notes and custom data, Royalty agreements) and, under Favourites, the starred criteria used below.

Left bar tabs beside it: **Load a search**, **Load a company set**.

## C. Search steps, in the order of the demo

Each one starts from **Favourites** on the search page. "Step" and "Search" are the demo's counts, kept only so a
replay with the same inputs can be compared.

| Step | Favourite clicked | What is done on the step screen | Step count | Running count |
|---|---|---|---|---|
| 1 | (automatic) | "All companies in the scope of analysis" | 43,334,700 | 43,334,700 |
| 2 | **World region, country or region in country: World region, country & subdivisions** | Left tabs: "World region, country & subdivisions", "Address type" (already "Address of incorporation only"). Type in **Search by name**, click the **+** on the matching row; chosen items appear on the right with an **x**. Chosen: MENA, Middle East, Eastern Europe, United Arab Emirates, Africa. **OK** | 11,173,710 | 11,173,710 |
| 3 | **Account type: Type of account** | Tick **Unconsolidated accounts with no consolidated companion (U1)** (others: C1, C2, U2). **OK** | 40,008,755 | 11,154,353 |
| 4 | **Status: Status** | Left tabs: "Status", "Change date". Click **+** on **Active companies** (others: Inactive companies, Unknown situation). **OK** | 32,875,340 | 8,061,221 |
| 5 | **BvD independence indicator** | Left tabs: "Independence Indicator", "Time period" (current). Tick **A** Independent companies, **B** No majority ownership, **U** Unknown; confidence dropdowns left at "All". Not ticked: C, D. **OK**. Shows as "A+, A, A-, B+, B, B-, U" | 16,206,536 | 2,922,641 |
| 6-8 | **All companies with** | Left tabs: "Company information", "Accounts", "Identifiers". Tick **A website**, **An overview**, **A trade description (any language)**. **OK**. Creates three steps: website (6), overview (7), trade description (8) | 13,078,540 / 2,466,551 / 27,722,665 | 55,803 |
| 9 | **Global standard format: Operating profit (loss) [EBIT] (Corporate)** | Left tabs: "Variable", "Values", "Time period" (Last available year). Units dropdowns **million** / **USD**. Radio **Value**, **Minimum** = 0. **OK** | 17,629,970 | 38,718 |
| 10 | **Key financials & employees: Operating revenue (Turnover) (All templates)** | Same screen shape. Radio **Value**, **Minimum** = 1 (million USD), last available year. **OK** | 4,732,245 | 34,620 |
| 11 | **Industry classifications: NACE Rev. 2** | Left tabs list the schemes (NACE Rev. 2, US SIC, UK SIC, NAICS 2022, ...). "Code type: Primary codes only". Type each code in **Search by name**, click **+** on the row. Chosen: 4631, 471, 4721, 4729. **OK** | 1,259,231 | 891 |
| 12 | **Industry classifications: US SIC** | Same screen, **US SIC** tab. Chosen: 016, 5148, 5431. Primary codes only. **OK** | 215,793 | 200 |
| 13 | **Activity text search** (lower in Favourites) | Screen "Search by activity - free text". Left tabs: "Free text", "Search scope" (default scope kept). Type in **Search on**: `(trad* or wholesal* or distribut*) and (fruit* or vegetable*)`. Click **Search** ("Exact match" unticked), then **OK** | 52,884 | 110 |

Other fields seen on the value screens but not used: Maximum, Top, Growth rate, Rate of decline,
Companies with a positive/negative trend, All companies with a known value, Include n/a.

## D. Boolean search

Default after 13 steps is every step joined with "and" (110 companies). The demo edits the **Boolean search** box to

```
1 and 2 and 3 and 4 and 5 and 6 and (7 or 8) and 9 and 10 and (11 or 12) and 13
```

and clicks the refresh button next to it. Result: **236 companies**. The "Search" column disappears once the
expression is not a plain chain of "and".

## E. Save the search

**Save** (top right) opens "Save search": radio **Save as a new search** / **Replace an existing search**,
**Name** (required; demo: "Fruit and vegetables"), **Description**, **Cancel** / **Save**.

## F. Results list  (`/List`)

1. Click **VIEW RESULTS >**.
2. Page shows **Your rejection summary: 236 companies** ("Potential comparable population selected", Include),
   **+ Add a screening step**, **Filter list +**, page selector "1 / 3", **Show: 100**.
3. A **Pay per view access** panel appears: "Current credit balance: 803", radio
   **Activate 1 credit to display this page of results** / **I want to switch to the free preview**, button **Continue**.
   The demo spends 1 credit.
4. The list loads with columns Company name, Country ISO code, NACE Rev. 2 core code, Operating revenue, Review, Reason.
5. View dropdown (shows **Standard view**) lists saved views: "2025", "Animal Feed", "SBC standard view", and
   **Manage views**. The demo picks **2025**; the page reloads with more columns (BvD ID number, World region,
   Country ISO code, Date of incorporation, ...) and the note "Only 80 columns of your view can be displayed, but all
   columns are available in the export."
6. Top-right buttons: **Actions**, **Comments**, **Save**, **Excel**, currency **USD**.

## G. Export

Click **Excel**. A "Warning" dialog shows "Current balance: 803" with radio **Use 1 credit to display results** /
**I want to switch to the free preview**, and **Cancel** / **OK**. The video ends with the pointer on **Cancel**.

## Not shown in the video (must be captured before the flow file can be finished)

- How the user gets from login to the "create analysis" page.
- The confirm button on the create-analysis page and how the tested-party page is left.
- Everything after the Excel warning: export format options, file name, and how the file arrives.
- The screening and rejection steps on the results list (**Add a screening step**, Review/Reason columns).
- What the "2025" view contains and whether it is the one to use for every job.

## Points that affect automation

- **Credits are spent.** Showing each results page and exporting each cost a credit (balance 803 in the demo).
  Every test run of sections F and G costs credits unless the free preview is chosen.
- Counts change with every database release, so a replay will not match the demo's numbers exactly.
- The release number is part of the address (`202610-1`), so the flow must not hard-code it.
- Step numbers used in the Boolean expression depend on the order steps are added; "All companies with" adds
  one step per ticked box.
