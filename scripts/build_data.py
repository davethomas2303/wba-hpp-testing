#!/usr/bin/env python3
"""
Warriors HPP - build report data from the testing spreadsheet.

Usage (from the project folder):
    python3 scripts/build_data.py "source/HPP Testing Results.xlsx"

Reads:
    the testing results workbook (one sheet per group, as exported from testing day)
    source/CRP 2026-27 athletes.csv     (for team names / team averages)
    source/VJBL 2027 athletes.csv       (fallback team list)
    data/access-codes.csv               (if it exists - existing codes are KEPT, so
                                         families keep the same code for the retest)
Writes:
    data/kv-bulk.json        upload this to Cloudflare KV (see README)
    data/access-codes.csv    one row per tested athlete, for the mail merge
    data/coach-codes.csv     one code per team, for the coach / team view
    data/import-report.txt   anything that needs a human to check
"""
import csv, hashlib, json, math, os, re, secrets, statistics, sys, unicodedata
from datetime import datetime
from openpyxl import load_workbook

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
SRC = os.path.join(ROOT, "source")

# ---- Session settings (change these for the mid-season retest) -------------
SESSION = {
    "id": "2026-pre",
    "label": "Pre-season testing",
    "date": "Sunday 25 October 2026",
    "dateShort": "25 Oct 2026",
}
MIN_TEAM_N = 4      # need at least this many tested team-mates to show a team average
MIN_AGE_N = 6       # comparisons are always age-specific; a same-age, same-gender group smaller than
                    # this is compared with all athletes of that age instead (e.g. U10 girls -> all U10s)

TESTS = {
    "vj":     {"col": 7,  "tries": (4, 5, 6),    "name": "Vertical jump", "unit": "cm",    "higher": True,  "dp": 1},
    "bj":     {"col": 11, "tries": (8, 9, 10),   "name": "Broad jump",    "unit": "cm",    "higher": True,  "dp": 1},
    "sprint": {"col": 15, "tries": (12, 13, 14), "name": "20 m sprint",   "unit": "sec",   "higher": False, "dp": 2},
    "yoyo":   {"col": 16, "name": "Yo-Yo test",    "unit": "level", "higher": True,  "dp": 1},
}
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"   # no 0/O, 1/I/L


def norm_name(s):
    s = str(s).replace("\u2019", "'").replace("\u2018", "'")
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\s*-\s*", "-", s)
    s = re.sub(r"[^a-z\-' ]", "", s)
    return re.sub(r"\s+", " ", s).strip()


def surname_key(s):
    # what the parent types: compare surnames loosely (no spaces, hyphens, apostrophes)
    return re.sub(r"[^a-z]", "", norm_name(s))


def hash_code(code):
    return hashlib.sha256(code.strip().upper().replace("-", "").encode()).hexdigest()


def new_code(existing):
    while True:
        raw = "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))
        code = raw[:4] + "-" + raw[4:]
        if code not in existing:
            existing.add(code)
            return code


def to_num(v):
    if v is None or (isinstance(v, str) and not v.strip()):
        return None
    try:
        return float(str(v).strip())
    except ValueError:
        return None


def yoyo_fmt(v):
    """Yo-Yo is recorded as level.shuttle text, e.g. '14.2'. Keep that text for display."""
    if v is None:
        return None
    s = str(v).strip()
    if not s:
        return None
    if re.fullmatch(r"\d+", s):
        s += ".0"
    if isinstance(v, float):
        s = f"{v:.1f}"
    return s


def load_teams():
    """Returns (athlete -> main team, team -> roster). CRP is the athlete's main team;
    every CRP and VJBL team gets a roster for the coach view."""
    teams, rosters = {}, {}
    crp = os.path.join(SRC, "CRP 2026-27 athletes.csv")
    vjbl = os.path.join(SRC, "VJBL 2027 athletes.csv")
    if os.path.exists(vjbl):
        with open(vjbl, newline="", encoding="utf-8-sig") as f:
            for r in csv.DictReader(f):
                if r.get("Status", "").strip().lower() == "declined":
                    continue
                tn = f"VJBL {r['Team']}"
                teams[norm_name(r["Player"])] = {"team": tn, "program": "VJBL", "dob": r["Date of birth"]}
                rosters.setdefault(tn, {"program": "VJBL", "members": []})["members"].append(r["Player"].strip())
    if os.path.exists(crp):   # CRP wins: it is the current-season rep team
        with open(crp, newline="", encoding="utf-8-sig") as f:
            for r in csv.DictReader(f):
                t = r["Team"].replace(" · CRP", "")
                if "shadow" in t.lower():
                    continue
                teams[norm_name(r["Athlete"])] = {"team": t, "program": "CRP", "dob": r["Date of Birth"]}
                rosters.setdefault(t, {"program": "CRP", "members": []})["members"].append(r["Athlete"].strip())
    return teams, rosters


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", str(s).lower()).strip("-")


def team_short(t):
    # "U16 Boys 16.2 · A Grade" -> "16.2" ; "U12 Boys 12.2 Red · B Grade" -> "12.2 Red"
    m = re.search(r"\d+\.\d+(?: [A-Za-z]+)?", t.split("·")[0])
    return m.group(0).strip() if m else t


def nice_bounds(lo, hi, step):
    lo = math.floor(lo / step) * step
    hi = math.ceil(hi / step) * step
    if hi - lo < step * 2:
        hi = lo + step * 2
    return lo, hi


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    os.makedirs(DATA, exist_ok=True)
    wb = load_workbook(sys.argv[1], data_only=True)
    teams, rosters = load_teams()
    issues = []

    athletes = []
    for ws in wb.worksheets:
        if ws.title.lower() == "summary":
            continue
        header = [c.value for c in ws[1]]
        if not header or header[1] != "Athlete":
            continue
        sheet_group = ws.title.replace("-", "/")          # "U10/12 Boys"
        gender = "Girls" if "girl" in ws.title.lower() else "Boys"
        for row in ws.iter_rows(min_row=2, values_only=True):
            if not row[1]:
                continue
            name = str(row[1]).strip()
            res = {}
            for k, t in TESTS.items():
                v = row[t["col"]]
                if k == "yoyo":
                    disp = yoyo_fmt(v)
                    res[k] = {"value": to_num(disp), "display": disp}
                else:
                    n = to_num(v)
                    res[k] = {"value": n, "display": None if n is None else (f"{n + 1e-9:.{t['dp']}f}" if k == "sprint" else f"{n:g}")}
                    res[k]["tries"] = [to_num(row[c]) for c in t["tries"]]
            age = str(row[2]).strip() if row[2] else sheet_group.split()[0].split("/")[0]
            tinfo = teams.get(norm_name(name))
            if not tinfo:
                issues.append(f"Not on CRP or VJBL list (no team average, shown as Future Warriors Academy): {name} [{sheet_group}]")
            elif row[3] and tinfo["dob"] and str(row[3]).strip() != tinfo["dob"].strip():
                issues.append(f"DOB differs from team list: {name} sheet={row[3]} list={tinfo['dob']}")
            if row[17]:
                issues.append(f"Check column flagged: {name}: {row[17]}")
            missing = [TESTS[k]["name"] for k in TESTS if res[k]["value"] is None]
            if missing:
                issues.append(f"Missing results (card shows 'Not tested'): {name}: {', '.join(missing)}")
            athletes.append({
                "name": name, "first": name.split()[0], "surname": name.split(" ", 1)[-1],
                "gender": gender, "age": age, "sheetGroup": sheet_group, "dob": row[3],
                "team": tinfo["team"] if tinfo else None,
                "program": tinfo["program"] if tinfo else "Academy",
                "results": res,
            })

    # ---- group statistics ----------------------------------------------------
    def stats(group, k):
        vals = [a["results"][k]["value"] for a in group if a["results"][k]["value"] is not None]
        if not vals:
            return None
        return {"n": len(vals), "mean": statistics.mean(vals),
                "sd": statistics.pstdev(vals) if len(vals) > 1 else 0, "min": min(vals), "max": max(vals)}

    by_age, by_age_all, by_sheet, by_team = {}, {}, {}, {}
    for a in athletes:
        by_age.setdefault((a["age"], a["gender"]), []).append(a)
        by_age_all.setdefault(a["age"], []).append(a)
        by_sheet.setdefault(a["sheetGroup"], []).append(a)
        if a["team"]:
            by_team.setdefault(a["team"], []).append(a)

    steps = {"vj": 5, "bj": 25, "sprint": 0.25, "yoyo": 1}

    # ---- codes ---------------------------------------------------------------
    codes_path = os.path.join(DATA, "access-codes.csv")
    existing = {}
    if os.path.exists(codes_path):
        with open(codes_path, newline="", encoding="utf-8-sig") as f:
            for r in csv.DictReader(f):
                existing[norm_name(r["Athlete"])] = r["Access code"]
    used = set(existing.values())

    kv, code_rows, index = [], [], {}
    for a in athletes:
        age_grp = by_age[(a["age"], a["gender"])]
        if len(age_grp) >= MIN_AGE_N:
            cmp_grp, cmp_label, cmp_short = age_grp, f"{a['age']} {a['gender'].lower()}", a["age"]
        else:
            cmp_grp, cmp_label, cmp_short = by_age_all[a["age"]], f"{a['age']} boys and girls", a["age"]
            issues.append(f"Compared with all {a['age']}s (only {len(age_grp)} {a['age']} {a['gender'].lower()} tested): {a['name']}")
        team_grp = by_team.get(a["team"], []) if a["team"] else []

        tests = {}
        for k, t in TESTS.items():
            s_age = stats(cmp_grp, k)
            s_team = stats(team_grp, k) if len(team_grp) >= MIN_TEAM_N else None
            if s_team and s_team["n"] < MIN_TEAM_N:
                s_team = None
            v = a["results"][k]["value"]
            lo, hi = nice_bounds(s_age["min"], s_age["max"], steps[k]) if s_age else (0, 1)
            z = None
            if v is not None and s_age and s_age["sd"] > 0:
                z = (v - s_age["mean"]) / s_age["sd"] * (1 if t["higher"] else -1)
            tests[k] = {
                "value": v, "display": a["results"][k]["display"],
                "ageAvg": round(s_age["mean"], t["dp"] + (1 if k == "sprint" else 0)) if s_age else None,
                "teamAvg": round(s_team["mean"], t["dp"] + (1 if k == "sprint" else 0)) if s_team else None,
                "z": None if z is None else round(z, 3),
                "ageSd": round(s_age["sd"], 4) if s_age else None,
                "tries": a["results"][k].get("tries"),
                "scaleMin": lo, "scaleMax": hi,
            }

        code = existing.get(norm_name(a["name"])) or new_code(used)
        h = hash_code(code)
        record = {
            "session": SESSION,
            "name": a["name"], "first": a["first"], "surname": a["surname"],
            "gender": a["gender"], "age": a["age"],
            "team": a["team"], "teamShort": team_short(a["team"]) if a["team"] else None,
            "program": a["program"], "compareLabel": cmp_label, "compareShort": cmp_short,
            "tests": tests,
        }
        kv.append({"key": f"athlete:{h}", "value": json.dumps(record, separators=(",", ":"))})
        a["record"] = record
        index[h] = {"name": a["name"], "group": a["sheetGroup"], "team": a["team"]}
        code_rows.append({
            "Athlete": a["name"], "First name": a["first"], "Surname": a["surname"],
            "Group": a["sheetGroup"], "Team": a["team"] or "", "Access code": code,
        })

    kv.append({"key": "meta:index", "value": json.dumps(index, separators=(",", ":"))})

    # ---- coach / team view ---------------------------------------------------
    by_norm = {norm_name(a["name"]): a for a in athletes}

    def player(a):
        r = a["record"]
        return {k: r[k] for k in ("name", "first", "gender", "age", "team", "program", "compareLabel", "compareShort", "tests")}

    # Coach views: one per CRP age group (e.g. "CRP U14 boys"), CRP athletes only.
    # VJBL-only and Future Warriors Academy athletes are never in a coach view.
    def roster_group(team_name):
        m = re.match(r"U(\d+)(?:/\d+)?\s+(Boys|Girls)", team_name)
        return (f"U{m.group(1)}", m.group(2)) if m else None
    untested_by_group = {}
    for tn, ro in rosters.items():
        if ro["program"] != "CRP":
            continue
        g = roster_group(tn)
        for m in ro["members"]:
            if norm_name(m) not in by_norm and g:
                untested_by_group.setdefault(g, []).append(m)
    groups = []   # (name, program, kind, tested athletes, untested names)
    for (age, gender), grp in sorted(by_age.items(), key=lambda x: (int(x[0][0][1:]), x[0][1])):
        crp = [a for a in grp if a["program"] == "CRP"]
        if crp:
            groups.append((f"CRP {age} {gender.lower()}", "CRP", "team", crp, sorted(untested_by_group.get((age, gender), []))))

    ccodes_path = os.path.join(DATA, "coach-codes.csv")
    c_existing = {}
    if os.path.exists(ccodes_path):
        with open(ccodes_path, newline="", encoding="utf-8-sig") as f:
            for r in csv.DictReader(f):
                c_existing[r["Team"]] = r["Coach code"]
    c_used = set(c_existing.values()) | used

    team_index, coach_rows = [], []
    for name, program, kind, tested, untested in groups:
        sl = slug(name)
        team_index.append({"slug": sl, "name": name, "program": program, "kind": kind,
                           "tested": len(tested), "squad": len(tested) + len(untested)})
        kv.append({"key": f"team:{sl}", "value": json.dumps({
            "slug": sl, "name": name, "program": program, "kind": kind, "session": SESSION,
            "players": [player(a) for a in sorted(tested, key=lambda a: a["surname"])],
            "notTested": untested,
        }, separators=(",", ":"))})
        if kind == "team":
            code = c_existing.get(name) or new_code(c_used)
            kv.append({"key": f"coach:{hash_code(code)}", "value": json.dumps({"teams": [sl]})})
            coach_rows.append({"Team": name, "Program": program, "Tested": len(tested),
                               "Squad": len(tested) + len(untested), "Coach code": code})
    kv.append({"key": "meta:teams", "value": json.dumps(team_index, separators=(",", ":"))})
    with open(ccodes_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(coach_rows[0].keys()))
        w.writeheader(); w.writerows(coach_rows)
    kv.append({"key": "meta:session", "value": json.dumps({**SESSION, "built": datetime.now().isoformat(timespec="seconds"), "athletes": len(athletes)})})

    with open(os.path.join(DATA, "kv-bulk.json"), "w") as f:
        json.dump(kv, f)
    code_rows.sort(key=lambda r: (r["Group"], r["Surname"], r["First name"]))
    with open(codes_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(code_rows[0].keys()))
        w.writeheader(); w.writerows(code_rows)

    summary = [f"Athletes with reports: {len(athletes)}",
               f"New codes this run: {len([r for r in code_rows if norm_name(r['Athlete']) not in existing])}",
               f"Kept existing codes: {len([r for r in code_rows if norm_name(r['Athlete']) in existing])}",
               f"Coach team views: {len(coach_rows)} teams (+ {len(groups) - len(coach_rows)} admin-only groups)", ""]
    with open(os.path.join(DATA, "import-report.txt"), "w") as f:
        f.write("\n".join(summary + (issues or ["No issues."])) + "\n")
    print("\n".join(summary + issues))


if __name__ == "__main__":
    main()
