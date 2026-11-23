# ACE TP Nxt: what the training recording shows

Source: "ACE TP Nxt Training" Teams recording, 9 Nov 2026 (107 min). Read from screen frames only
(`sop/screens/ace/f-*.jpg`, shared screen 3:14 PM to 3:52 PM). The audio was not transcribed, so anything said but
not shown is missing, and nothing here has been tried on a live seat. Treat every label as "seen", not "verified".

## The product
- Windows desktop application, "ACE TP Nxt. V1.0.2" (Accord Fintech). Menu bar: Menu · Company · Other Modules · Query.
- Status bar: `Current Currency = INR, Unit = Crores`, `Database Updated Till: <date>`. India only.
- Opens a new tab for every screen (Search, TP Search, Query, Profit And Loss, ...).

## Search screen (home icon)
- "Search by All Category": keyword box ("Enter key words for product/activity search"), **Exact Phrase/Word** tick box,
  Search button. Several keywords are comma-separated (`software, IT consulting`).
- Tick boxes for where the keywords are looked up: Accord Industry · Segment · Finished Products ·
  NIC Economic Activity (Primary) · Business Activity · Business Activity (Reported) · Select/UnSelect ALL.
- Browse lists instead of keywords: Accord Classifications (Accord Industry, Business Activity) · Company Annual Report
  (Business Activity (Reported), Finished Products, Segment) · ITC/NIC Classifications (ITC Code, NIC Code,
  NIC Economic Activity (Primary)) · Saved Models.

## TP Search screen (the benchmarking screen)
- Left pane: matched values grouped under Economic Activity · Accord Industry · Finished Products · Segment ·
  Business Activity · Business Activity (Reported), each with tick boxes and "UnSelect ALL". Unticking a value
  removes its companies.
- While searching it shows "Processing Current Request ... Completed n / 14 Steps".
- **Financial Year** row: from month/year, to month/year (e.g. Apr 2021 to Mar 2024), **Any** n (number of years),
  Apply, Clear. Tick boxes "Remove No PL Data available" (on by default) and "Remove No Full PL Data available";
  "Display Years".
- **Filter** tab: Load Filter · Save Filter, then one row per parameter with Add Criteria (operator and value) ·
  Edit · Apply Condition (**All** years or **Any n** years) · Delete. Parameters present by default:
  Sales Turnover · Exports Forex to Sales (%) · Exports to Sales (%) · RPT Sales · RPT to Sales (%) ·
  RPT Purchases (%) · FH_PBT · FH_Net Worth · Service income to total income · **Add Parameters**.
- Add Parameters dialog: tables Company Details (General details) and Finance (Profit And Loss, Cashflow,
  Raw Materials, Finished Products, Financial Highlights, Expenditure on R&D, Forex, Power & Fuel Consumption,
  Closing Stocks, ...) → tick fields → Add Selected Fields.
- Result grid: Select · Company · Industry · PL_Year End (YYYYMM, e.g. 202403) · one column per parameter and year
  (`Sales Turnover`, `Sales Turnover_1`, `Sales Turnover_2`). Header shows Total Records / Total Companies.
  "Remove Checked Companies" drops ticked rows by hand. The applied filter is shown as text at the bottom
  (`[Sales Turnover] > '1.00' And [Sales Turnover_1] > '1.00' And ... [FH_Net Worth] > '0.00' ...`) with Edit Filter.
- **Process Steps** tab: the audit trail. Columns Sr.No · Steps · Year Selected · Total Count · Action.
  Buttons Clear · Export · **Export all steps (with outputs)**: an Excel file with one sheet per step
  (Step, Financial Year, Companies Available, Action Taken, Action Count, then the company list).
- Right pane: Transfer To Query · Save as Peerset · Save This Model · Save As New Model · Preserve This Model ·
  Export Key Words; "Available In" shows which classification a selected company matched.
  Save This Model asks for Model Name, Notes, Folder, Sub Folder.

## The example run in the recording (software, IT consulting; Apr 2021 to Mar 2024, 3 years)
| Step | Count after |
|---|---|
| Keyword searched (software, IT consulting), all years | 2,938 |
| Data available for FY 202104 to 202403 | 1,439 (1,320 shown on screen at one point) |
| Sales Turnover > 1 (all years) | 1,100 |
| FH_Net Worth > 0, then all years | 1,036, then 1,020 |
| FH_PBT > 0 (any 2 of 3 years) | 895 |
| RPT to Sales (%) < 25 | not read |
| Service income to total income > 75 | 440 (185 removed) |

## Other screens shown
- Company menu: General (Background, Snapshot, Profile, Business Activity (Reported), Digital Annual Reports,
  Credit Rating, ...) · Finance (Financial Highlights, Balance Sheet, Profit And Loss, Cash Flow, Segment Finance,
  Forex, Subsidiaries, Expenditure on R&D, **Related Party Transactions**, **Related Party Details**, ...) ·
  Ratios · Products · Reports. Selectors: Standalone/Consolidated, Schedules, Actual, Reported. Excel and PDF export icons.
- Related Party Transactions columns: Associates · Joint Ventures · Key Management Personnel · Relatives of KMP ·
  Others · Group Companies · Holding Companies · Promoters · Enterprises Under Management · Total.
- Industry module: aggregated statements for an industry (Listed Companies, Standalone, Financial Year, Aggregated).
- **Query → Expression builder** (also reached by Transfer To Query): Select TableName tree (General, Finance, Ratios,
  Interim Results, Share Price Data, Equity, Reports, Corporate Actions, IPO Information, Formulae, Custom Fields);
  grid Field Order · Table Name · Field Name · Select Period (L, L-1, L-2 or 202503 ...) · Criteria · And/Or ·
  Display · Sort; options Unit (Crores), Query Condition AND/OR, Apply Criteria on All/Any, Consolidated priority,
  Remove No PL Data available; buttons Add · Remove · Load · Export · Save · Compile.
  Fields seen: PL_Year End, PL_Sales Turnover, PL_Operating Profit, PL_Operating Profit (Excl OI), PL_Profit After Tax.
- Query Output: O/P Summary (Total selection, matching, unmatching, records), Adv. View, Grouping, Options; columns
  Accord Code · Company Name · business description; Save · Save As · Organise Fields · Save MySet.

## For automation
- Desktop app, so the route is the same as Capitaline (pywinauto / computer use), not Playwright.
- Unlike TP Catalyst there is no Boolean to write: filters are and-ed in the order applied and the Process Steps tab
  already gives the step-by-step counts and the evidence file.
- Open points for a live run: operator list in Add Criteria; whether NIC codes can be typed or only picked; where
  the export lands; whether exports or views are metered; login and session time-out; whether "Any n" means any n of
  the selected years.
