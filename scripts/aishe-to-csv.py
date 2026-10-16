"""Turn the AISHE "Download as Excel" exports into db/colleges.csv.gz for the CCE college picker.

Source: AISHE Higher Education Institution Directory, Ministry of Education, Government of India
(https://dashboard.aishe.gov.in/hedirectory), under the Open Government License - India.
On that page: "University" -> Excel icon, and "Colleges" -> Excel icon.

    python -I scripts/aishe-to-csv.py --universities U.xlsx --colleges C.xlsx [--out db/colleges.csv.gz]
    python -I scripts/aishe-to-csv.py --inspect FILE.xlsx

Standard library only: an .xlsx is a zip of XML, and only the first sheet's cell values are needed.
Then load it with: npm run db:import-colleges
"""
import argparse, csv, gzip, io, re, sys, zipfile
import xml.etree.ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}

def read_rows(path):
    """Yield each row of the first worksheet as a list of strings (merged/blank cells become '')."""
    with zipfile.ZipFile(path) as z:
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
                shared.append("".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])))
        wb = ET.fromstring(z.read("xl/workbook.xml"))
        first = wb.find("m:sheets/m:sheet", NS).get("{%s}id" % NS["r"])
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        target = next(r.get("Target") for r in rels if r.get("Id") == first)
        sheet = "xl/" + target.lstrip("/").replace("xl/", "", 1) if not target.startswith("/xl/") else target.lstrip("/")
        for row in ET.fromstring(z.read(sheet)).iter("{%s}row" % NS["m"]):
            cells = {}
            for c in row.findall("m:c", NS):
                col = re.match(r"[A-Z]+", c.get("r")).group(0)
                idx = 0
                for ch in col: idx = idx * 26 + (ord(ch) - 64)
                t, v = c.get("t"), c.find("m:v", NS)
                if t == "s" and v is not None: val = shared[int(v.text)]
                elif t == "inlineStr": val = "".join(x.text or "" for x in c.iter("{%s}t" % NS["m"]))
                else: val = v.text if v is not None else ""
                cells[idx - 1] = val or ""
            if cells:
                out = [""] * (max(cells) + 1)
                for k, val in cells.items(): out[k] = val
                yield out

def clean(s):
    s = re.sub(r"\s+", " ", str(s or "")).strip()
    return re.sub(r"\s*,\s*(?=\S)", ", ", s).strip(" ,")   # "G.S.I.T.S. , Park" / "23,Park" -> "G.S.I.T.S., Park" / "23, Park"

SMALL = {"of", "and", "the", "for", "in", "at", "on", "to", "by", "a", "an", "&"}
ROMAN = re.compile(r"^(i{1,3}|iv|v|vi{0,3}|ix|x)$", re.I)

def tidy_case(name):
    """AISHE names are mostly typed in capitals. Title-case them for display, keeping short
    all-capital tokens that are clearly initials (IIT, NIT, IET, M.P., (Autonomous) stays readable)."""
    letters = [c for c in name if c.isalpha()]
    if not letters or sum(c.isupper() for c in letters) / len(letters) < 0.8:
        return name                                   # already mixed case: leave it alone
    words = name.split(" ")
    out = []
    for i, w in enumerate(words):
        core = re.sub(r"[^A-Za-z]", "", w)
        if not core:
            out.append(w)
        elif ROMAN.match(core) or (len(core) <= 4 and not re.search(r"[AEIOU]", core.upper())) or "." in w:
            out.append(w.upper())                     # initials, roman numerals, dotted abbreviations
        elif i > 0 and core.lower() in SMALL:
            out.append(w.lower())
        else:
            out.append("-".join(p[:1].upper() + p[1:].lower() for p in w.split("-")))
    return " ".join(out)

def header_index(rows):
    """Find the header row (the one naming 'AISHE Code') and map column names to positions."""
    for i, r in enumerate(rows[:15]):
        names = [clean(x).lower() for x in r]
        if any("aishe" in n for n in names):
            return i, {n: k for k, n in enumerate(names)}
    sys.exit("No header row with 'AISHE Code' found")

def col(hdr, *keys):
    for k in keys:                                    # exact header first ("name", not "university name")
        if k in hdr: return hdr[k]
    for k in keys:
        for name, idx in hdr.items():
            if k in name: return idx
    return None

CODE_PREFIX = re.compile(r"^\d+\s*[-.)]\s*")       # "061-PT. SRI ..." : a university's own college number

def convert(path, kind):
    rows = list(read_rows(path))
    h, hdr = header_index(rows)
    ci, ni, si, di = col(hdr, "aishe code", "aishe"), col(hdr, "name"), col(hdr, "state"), col(hdr, "district")
    if None in (ci, ni, si, di): sys.exit(f"{path}: expected AISHE Code / Name / State / District columns, got {list(hdr)}")
    out = []
    for r in rows[h + 1:]:
        g = lambda k: clean(r[k]) if k < len(r) else ""
        code, name = g(ci), CODE_PREFIX.sub("", g(ni))
        if not code or not name: continue
        out.append((code, tidy_case(name), tidy_case(g(di)), tidy_case(g(si)), kind))
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--universities"); ap.add_argument("--colleges"); ap.add_argument("--out", default="db/colleges.csv.gz")
    ap.add_argument("--inspect")
    a = ap.parse_args()
    if a.inspect:
        rows = list(read_rows(a.inspect))
        print(f"{len(rows)} rows")
        for r in rows[:6]: print([clean(x)[:40] for x in r])
        return
    if not (a.universities and a.colleges): sys.exit("Pass --universities and --colleges (or --inspect FILE)")
    data = convert(a.universities, "university") + convert(a.colleges, "college")
    seen, rows = set(), []
    for r in data:
        if r[0] in seen: continue
        seen.add(r[0]); rows.append(r)
    buf = io.StringIO(); w = csv.writer(buf, lineterminator="\n")
    w.writerow(["aishe_code", "name", "district", "state", "kind"]); w.writerows(rows)
    with gzip.open(a.out, "wt", encoding="utf-8", newline="") as f: f.write(buf.getvalue())
    print(f"wrote {a.out}: {sum(r[4] == 'university' for r in rows)} universities, {sum(r[4] == 'college' for r in rows)} colleges"
          f" ({len(data) - len(rows)} duplicate codes dropped)")

if __name__ == "__main__":
    main()
