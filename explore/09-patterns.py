"""Summarises the house patterns in sop/past-searches.json (strategies only, no company data)."""
import json, re, statistics, sys
from collections import Counter

recs = json.load(open("sop/past-searches.json", encoding="utf-8"))
print("searches:", len(recs))
kind, detail = Counter(), {}
for r in recs:
    for s in r["steps"]:
        k = re.sub(r"^\d+\. ", "", s["step"])
        kind[k] += 1
        detail.setdefault(k, Counter())[s["detail"][:150]] += 1
print("\nSTEP TYPES (count of searches' steps):")
for k, n in kind.most_common(30):
    print(f"  {n:4d}  {k}")
for k in ["World region/Country/Region in country", "Consolidation code", "Status", "BvD Independence indicator",
          "Operating profit (loss) [EBIT] (m USD)", "Operating revenue (Turnover) (m USD)"]:
    print(f"\nTOP DETAILS for {k}:")
    for d, n in detail.get(k, Counter()).most_common(6):
        print(f"  {n:4d}  {d}")
print("\nBOOLEAN SHAPES:")
for b, n in Counter(r["boolean"] for r in recs).most_common(10):
    print(f"  {n:4d}  {b}")
print("\nFISCAL YEAR END:", Counter(r["fiscalYearEnd"] for r in recs).most_common())
print("RELEASES:", Counter(r["release"] for r in recs).most_common(8))
tot = [int(r["total"].replace(",", "")) for r in recs if r["total"] and r["total"].replace(",", "").isdigit()]
print("TOTAL companies: min", min(tot), "median", statistics.median(tot), "max", max(tot), "over 2000:", sum(t > 2000 for t in tot))
print("STEPS per search:", Counter(len(r["steps"]) for r in recs).most_common(8))
print("COLUMN counts:", Counter(len(r.get("columns", [])) for r in recs).most_common(6))
print("NAME PREFIX categories:", Counter(r["file"].split(" - ")[1] for r in recs if r["file"].count(" - ") >= 2).most_common(15))
schemes = Counter(k for r in recs for k in {re.sub(r"^\d+\. ", "", s["step"]) for s in r["steps"]} if "codes" in k)
print("INDUSTRY SCHEMES per search:", schemes.most_common())
print("with rejection steps beyond population:", sum(len(r["rejection"]) > 1 for r in recs))
