"""Reads a raw TP Catalyst .xlsx without openpyxl (its stylesheet has an attribute openpyxl rejects).
Usage: python -I explore/xlsx_raw.py <file.xlsx>
Prints the sheet names, the whole 'Search summary' sheet and only the heading row of 'Results'.
"""
import re, sys, zipfile
import xml.etree.ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}


def read(path):
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
            shared.append("".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])))
    rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
    sheets = {}
    for s in ET.fromstring(z.read("xl/workbook.xml")).find("m:sheets", NS):
        target = rels[s.get("{%s}id" % NS["r"])].lstrip("/")
        sheets[s.get("name")] = target if target.startswith("xl/") else "xl/" + target

    def rows(name, limit=None):
        out = []
        for row in ET.fromstring(z.read(sheets[name])).iter("{%s}row" % NS["m"]):
            cells = []
            for c in row.findall("m:c", NS):
                v = c.find("m:v", NS)
                if c.get("t") == "s" and v is not None:
                    cells.append(shared[int(v.text)])
                elif c.get("t") == "inlineStr":
                    cells.append("".join(t.text or "" for t in c.iter("{%s}t" % NS["m"])))
                elif v is not None:
                    cells.append(v.text)
            out.append(cells)
            if limit and len(out) >= limit:
                break
        return out

    return sheets, rows


if __name__ == "__main__":
    sheets, rows = read(sys.argv[1])
    print("SHEETS:", list(sheets))
    for r in rows("Search summary"):
        r = [re.sub(r"\s+", " ", c)[:230] for c in r if c and c.strip()]
        if r:
            print(" | ".join(r))
    all_rows = rows("Results")
    hdr = [re.sub(r"\s+", " ", c) for c in all_rows[0]]
    print(f"\nRESULTS: {len(all_rows) - 1} data rows, {len(hdr)} columns")
    print("FIRST 12 COLUMNS:", hdr[:12])
    print("LAST 6 COLUMNS:", hdr[-6:])
