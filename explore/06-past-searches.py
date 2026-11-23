"""Reads the 'Search summary' sheet of every past TP Catalyst export and saves the search strategies.
Usage: python -I explore/06-past-searches.py "<folder>" sop/past-searches.json
Only the strategy and the result column headings are kept; no company rows are read.
"""
import json, os, re, sys
import openpyxl

folder, out = sys.argv[1], sys.argv[2]
records, errors = [], []
for name in sorted(os.listdir(folder)):
    if not name.lower().endswith(".xlsx") or name.startswith("~$"):
        continue
    try:
        wb = openpyxl.load_workbook(os.path.join(folder, name), read_only=True, data_only=True)
        if "Search summary" not in wb.sheetnames:
            errors.append((name, f"sheets: {wb.sheetnames}"))
            continue
        rows = [[str(c).strip() for c in r if c is not None] for r in wb["Search summary"].iter_rows(values_only=True)]
        rows = [r for r in rows if r]
        rec = {"file": name, "steps": [], "boolean": None, "total": None, "release": None, "fiscalYearEnd": None, "rejection": []}
        section = None
        for r in rows:
            head = r[0]
            if head in ("Search Strategy", "Rejection summary", "Information options", "General parameters"):
                section = head
            elif head == "Analysis based on" and len(r) > 1:
                rec["release"] = r[1]
            elif head == "Fiscal year end" and len(r) > 1:
                rec["fiscalYearEnd"] = r[1]
            elif section == "Search Strategy":
                if head == "Boolean search":
                    rec["boolean"] = r[1] if len(r) > 1 else None
                elif head == "TOTAL":
                    rec["total"] = r[1] if len(r) > 1 else None
                elif re.match(r"^\d+\. ", head):
                    rec["steps"].append({"step": head, "detail": r[1] if len(r) > 2 else "", "count": r[-1]})
            elif section == "Rejection summary" and re.match(r"^\d+\. ", head):
                rec["rejection"].append(r)
        if "Results" in wb.sheetnames:
            hdr = next(wb["Results"].iter_rows(values_only=True))
            rec["columns"] = [str(h).replace("\n", " ") for h in hdr if h is not None]
        rec["sheets"] = wb.sheetnames
        wb.close()
        records.append(rec)
    except Exception as e:  # report unreadable files instead of hiding them
        errors.append((name, repr(e)[:120]))

with open(out, "w", encoding="utf-8") as f:
    json.dump(records, f, indent=1, ensure_ascii=False)
print(f"read {len(records)} files, {len(errors)} problems")
for e in errors:
    print("PROBLEM", e)
