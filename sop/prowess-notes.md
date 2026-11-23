# Prowess (CMIE): what the training deck shows

Source: "Prowess Practical Application" (15 slides, IT industry as the illustration; Taxmann-branded). Screenshots
in `sop/screens/prowess/`. Read from the deck only: nothing has been tried on a live seat, so labels are "seen", not
"verified". The deck's screenshots show database timestamp 11 Jul 2025 and 108,773 companies (5,599 listed).

## The product
- **Web application**, https://prowess.cmie.com, user name and password login. India only.
- Top menu: Query Builder · OSC & Worksheets · Report Viewer · Commands History and Planner · Query Results Today ·
  Analysis · Knowledge Base · Extract Data · Support · Directory.
- Queries are queued: a status strip shows "Queries Queued, Processing, New Outputs", and a **NEW OUTPUTS** tab blinks
  when a result is ready.
- Two kinds of output: **OSC** (Output Sheet of Companies: one row per company, indicators added as columns) and
  **WS** (worksheet: a separate table, used for related-party data). A TXT destination also exists.
- Query Triggers (left pane): Companies And Sets · Company Address and Identity Indicators · Share Holding Pattern and
  Ownership Structure · Governance Indicators · Financial Statements · Stock Prices and Capital Changes ·
  Products and Raw Materials · Business Segments · CapEx and M&A · Indices and Index Numbers · Miscellaneous.

## The procedure in the deck
1. **Industry (steps 1 to 4).** Query Builder → Products and Raw Materials → **Main Product/Services Group**. Search
   (3 letters or more) and tick values in the CMIE products/services tree (e.g. Information technology → Software
   services); a second tree offers the **NIC** classification. Selected values list below. Select Domain =
   **All Companies**, output = OSC, Execute = **Send to new OSC**. Further keywords from "Products Produced/Traded –
   Query on Name" or "Raw Materials Consumed – Query on Name" are **Added to current OSC** (a union).
   Other options under the same trigger: Structured Query versions, Structured Search on Groups, Location of Plants,
   Energy Consumption.
2. **Open the result (steps 4, 5).** Click NEW OUTPUTS → the OSC sheet opens in OSC & Worksheets (365 companies in the
   example). Sheet actions: Set as current sheet · Rename sheet · Save as user set · Multi row sort ·
   **Export as excel csv**.
3. **Identity columns (steps 5 to 8).** Company Address and Identity Indicators → Identity Indicators → tick NIC code,
   NIC name, Industry group, Industry type, Main product/service group (also available: Prowess company code, CIN,
   Entity type, Incorporation year, Business Description, Ownership group code). Domain = **Companies in current OSC**
   → Add data to OSC.
4. **Currency.** Change "Rs. Million" to **Rs. Crore** before pulling financials.
5. **Financials (steps 9 to 15).** Financial Statements → **Standardised Annual Financials** → pick indicators: Year,
   Months, Total income, Total expenses, Income from non-financial operations, Net worth, PBT, Export as (%) of Sales.
   Standalone (S) or Consolidated (C) per indicator; each has **Range From / Range To**. Query on date as
   YYYYMM – YYYYMM (FY 2021-22 to FY 2023-24). Domain = Companies in current OSC → **Add data to OSC**.
   Then OSC & Worksheets → Export as excel csv.
   Other Execute buttons seen: Send to new OSC · **Retain matched cos. in OSC** · Remove from OSC.
6. **Related parties (steps 16 to 22).** Governance Indicators → Related Party Transactions → party type
   **All Party Types** → tick "Total revenue receipts/income as % of Total income" and "Total revenue
   expenses/payments as % of Total expenses". Query on date YYYYMM, Domain = Companies in current OSC, output = **WS**,
   **Send to new WS**. Open it from NEW OUTPUTS and export as CSV.
7. **Filtering.** The deck does not filter inside Prowess: quantitative and qualitative filters are applied to the
   exported data **in Excel**.

## Hits (told by the user, 18 Nov 2026): every Execute click is charged
- The subscription has **7,001 hits allowed; 3,623 were consumed** at the start of 18 Nov 2026. The user understood **each Execute click costs 10 hits**
  (the full run below measured 1 per click on the profile page): "Send to new
  OSC" and "Add to current OSC" confirmed by the user; assume the same for Replace, Retain matched, Add data,
  Remove and Send to new WS until shown otherwise. Selecting, searching, ticking and typing cost nothing.
- **Never click an Execute button without the user's go-ahead for that run**, and plan every run to use the fewest
  executes. The live test below spent 2 executes (20 hits) before this was known.
- The deck's procedure needs **4 executes (40 hits)** per search: (1) Send to new OSC with all keywords ticked,
  (2) identity indicators → Add data to OSC, (3) financials for all years → Add data to OSC, (4) related parties →
  Send to new WS. Each extra trigger added with "Add to current OSC" (product names, raw materials) is 10 more.
- This is why the deck screens in Excel: one data pull, then free filtering outside. Filtering inside Prowess with
  "Retain matched" is possible but costs an execute per click, so put every threshold into one query if it is used.

## Details from the deck's screenshots (second read, every slide)
- The example ticks **four** CMIE values: Software services, Information technology, Wholesale trade in readymade
  software products, Retail trade in readymade software products. All are ticked first, then one Send to new OSC.
- Slide 4 note: keywords picked from "Products Produced/Traded – Query on Name" through "Raw Materials Consumed –
  Query on Name" are **added to the current OSC**, not sent to a new one.
- Financials: Query on Date/s `202203-202403` (FY 2021-22 to 2023-24), Output Date/s `AP`, eight indicators
  (Year, Months, Total income, Total expenses, Income from non-financial operations, Net worth, PBT, Export as (%)
  of Sales), Standalone ticked, output OSC, **Add data to OSC**.
- Related parties: Governance Indicators → Related Party Transactions; option "Find related parties that meet
  transaction condition"; party type **All Party Types**; Query on Date `202303` (one year per query); domain
  Companies in current OSC; destination **WS**; **Send to new WS**. The worksheet lists Company Name, Slot Date,
  Date, Party Type, Party Name, Expression Type, Transaction Type and is exported with "Export as excel csv".
- Currency list: Rs. Crore, Rs. Million, Mln. UK Pound, Mln. US Dollar, Bln. Yen, Mln. Euro.
- The slides have no speaker notes.

## Studio runner (built 18 Nov 2026)
`prowess.mjs` replaces the two exploration scripts named below (`explore/prowess-search.mjs`, `prowess-export.mjs`,
now deleted). It reloads the page first (clears stale ticks and ranges), checks each form's selection counter before
its Execute click, confirms the new sheet is the current one, reads each result from Commands History, and saves
both CSVs into `runs/<job>-<time>/`. Without `--go` it fills the forms and runs nothing. The runner
(`RUNNER_AGENT=prowess`) copies the CSVs to `SHAREPOINT_DIR` for TAIGA. Filtering is done in TAIGA (user decision).

First Studio runs (18 Nov 2026): two runs stopped after the industry click (1 hit each; sheets O1268 with 1,838
companies, stopped by hand, and O1269 with 201, the user's electrical-appliances search). The second failed at the
"is the new sheet current?" check because `#nav_new_output` was clicked before the "New Outputs" counter had
caught up with the history, so no sheet tab opened. Fixed by retrying until the tab appears (`openSheet`); the fix
is not yet proven by a charged run. After a page reload the OSC Sheets view is empty: earlier sheets do not reopen
from the menu. Hits after both: 3,629.

## Full deck run, 18 Nov 2026 (user's go-ahead; `explore/prowess-search.mjs`, stages e1 to e4, then exported)
| Stage | Execute button | Result | Hits consumed (profile page) |
|---|---|---|---|
| start | | | 3,623 of 7,001 |
| e1 four CMIE values, All Companies | Send to new OSC (`submit_t54NEW`) | 1,838 companies, sheet O1266 | 3,624 |
| e2 NIC code, NIC name, Industry type, Industry group, Main product/service group | Add data to OSC (`submit_t10ADDCOL`) | 1,838 | 3,625 |
| e3 eight indicators, `202203-202403`, Standalone, no ranges | Add data to OSC (`submit_t28ADDCOL`) | 1,838 | 3,626 |
| e4 All Party Types, two % fields, `202303`, WS | Send to new WS (`submit_t27NEW`) | 987 companies, O1267 / W344 | 3,627 |
- **Measured cost: 1 hit per Execute click** on the profile page (My Profile: `/kommon/bin/sr.php?kall=wuserdet&tab=1000`,
  "Maximum hits allowed" / "Hits consumed"). The user had understood 10 per click; the counter moved by 1 each time,
  read within a minute of each click. Whether it settles later is not known. Each stage finished in under a minute.
- A new OSC becomes the current sheet by itself (its tab turns blue), so "Companies in current OSC" applied to O1266.
- Forms keep their old values while the page stays open: the Net worth range 0.01 from the first test was still in
  the financials form and had to be cleared. **Check every range box before an Execute.**
- **Export (user's go-ahead, `explore/prowess-export.mjs O1266 W344`): "Export as excel csv" cost 0 hits** (3,627 before
  and after, four export clicks in all). Files: `osc_sheet_O1266.csv` (629 KB) and `osc_sheet_W344.csv` (308 KB) in
  the PC's Downloads folder. Sheet tabs are `<label>` elements; the link is `#menu_dcsv_<sheet>`, visible once the tab
  is open. Over CDP, Playwright diverts downloads to its own temporary folder, so nothing appears in Downloads:
  wait for the `download` event and `saveAs`.

## Live test, 18 Nov 2026 (project Chrome on port 9222, user logged in by hand; nothing exported)
Scripts: `explore/prowess-open.mjs`, `explore/prowess-act.mjs`, `explore/prowess-probe.mjs` (scratch), `explore/prowess-dialog.mjs`.
- 114,537 companies (6,084 listed). Currency selector `#cp_currency` was already "Rs. Crore" (value `RSCRORE`).
- **Industry step works:** Main Product/Services Group → tick "Software services" (CMIE code 803204) → All Companies →
  Send to new OSC → sheet O1265 with **1,653** companies. The query took a few minutes in the queue.
- **Filtering inside Prowess works:** Standardised Annual Financials → Net worth, Standalone, Range From 0.01,
  Query on Date 202403, Companies in current OSC → **Retain matched cos. in OSC** → the same sheet dropped to **903**.
  So thresholds can be applied in the database with a count per step; the deck's "filter in Excel" is a choice, not a limit.
- **Commands History and Planner is the audit trail:** one row per command with status, error, start and end time,
  **No of Companies**, and the sheet it wrote to. Each click is stored as a text command, for example
  `QueryOnMainProductServiceGroup -prdcodes{803204} -niccodes{} ... -trig{t54}` and
  `QueryOnFinanceStatements -qt{fc} -ficexprlist{Net worth|S|0.01||C} -currency{RSCRORE} ... -refyear{202403} -trig{t28}`.
  The page has a Planner list (copy, paste, run, upload, download commands) and "Execute User Batches": a search
  could probably be replayed as a batch of commands instead of clicks. Not tried.
- Selectors that worked: section buttons `#btn1`..`#btn11`; sub-items `#CCt<n>` (54 = Main Product/Services Group,
  28 = Standardised Annual Financials); trees `#t<n>_td_r<r>c<c>_tree_T` with `input.tree_cbox[sid=...]`
  (Software services 190701, Net worth 007002004001002, PBT 007001003001004, Total income 004001); date box
  `#t28_queryondate`; domain radios `#rp_all_t<n>` / `#rp_curr_t<n>`; execute buttons `#submit_t<n>NEW|OR|REPLACE`
  (all companies) and `#submit_t<n>AND|ADDCOL|NOT` (current OSC = Retain / Add data / Remove); queue text
  "Queries Queued: x, Processing: y, New Outputs: z"; `#nav_new_output`.
- Quirks: the trees hold thousands of rows, so Playwright `:has()` selectors hang; look rows up with one direct DOM
  query. Collapsed tree nodes are hidden: search first, or click the checkbox through the DOM. Range cells are custom
  elements: click the cell, then type. The Chrome extension could not read this site at all (timeouts).
- The history also shows the team's own runs of 16 Nov (sheets O1263, O1264, W343): not touched.
- Still open: export limits and metering; session time-out; "Ind AS" versus "Standardised" financials; the batch route;
  CMIE's licence position on automation and AI tools.

## For automation
- Web, so the route is Playwright on a logged-in Chrome, as for TP Catalyst. The user logs in themselves.
- The method is "extract, then screen outside": company rows and financials leave the database before any threshold
  is applied. The Range From/To boxes with "Retain matched cos. in OSC" suggest thresholds could be applied inside
  Prowess instead, which would give step-by-step counts like the other databases. Not shown in the deck: to verify.
- Open points for a live run: whether Range + Retain works as a filter; whether NIC codes can be typed; how long
  queued queries take; export limits and whether exports are metered; session time-out; the CMIE licence position on
  automation and on AI tools.
