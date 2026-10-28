#!/usr/bin/env python3
"""Build one personalised email per family from source/contacts.csv + data/access-codes.csv.
Writes data/family-emails.csv (mail merge) and data/emails/family-emails.json (HTML bodies)."""
import csv, json, re, unicodedata, collections, html, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
URL = "https://wba-hpp-testing.pages.dev"
def norm(s):
    s = str(s).replace("’", "'"); s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\s*-\s*", "-", s); return re.sub(r"\s+", " ", re.sub(r"[^a-z\-' ]", "", s)).strip()
def andjoin(xs): return xs[0] if len(xs) == 1 else ", ".join(xs[:-1]) + " and " + xs[-1]
codes = {norm(r["Athlete"]): r for r in csv.DictReader(open("data/access-codes.csv", encoding="utf-8-sig"))}
prog = {}
for e in json.load(open("data/kv-bulk.json")):
    if e["key"].startswith("athlete:"):
        r = json.loads(e["value"]); prog[norm(r["name"])] = r["program"]
contacts = list(csv.DictReader(open("source/contacts.csv", encoding="utf-8-sig")))
FIX = {"@hmail.com": "@hotmail.com"}
fam = collections.OrderedDict(); seen = set()
for c in contacts:
    n = norm(c["Player"])
    if n not in codes or n in seen: continue
    seen.add(n)
    em = c["Email"].strip()
    for a, b in FIX.items(): em = em.replace(a, b)
    f = fam.setdefault(em.lower(), {"email": em, "parent": c["Parent first name"].strip(), "parent_full": c["Parent full name"], "mobile": c["Mobile"], "kids": []})
    f["kids"].append({"name": codes[n]["Athlete"], "first": codes[n]["First name"], "surname": codes[n]["Surname"], "code": codes[n]["Access code"], "crp": prog.get(n) == "CRP"})
rows = []
for f in fam.values():
    kids = sorted(f["kids"], key=lambda k: k["first"]); firsts = [k["first"] for k in kids]; one = len(kids) == 1
    subj = f"{firsts[0]}'s Warriors HPP testing report is ready" if one else f"Your Warriors HPP testing reports are ready ({andjoin(firsts)})"
    crp = [k["first"] for k in kids if k["crp"]]
    intro = (f"{firsts[0]}'s Warriors High Performance Program testing report from Sunday 25 October is now ready." if one else
             f"The Warriors High Performance Program testing reports for {andjoin(firsts)} from Sunday 25 October are now ready. Each child has their own access code.")
    covers = (f"The report covers {firsts[0]}'s results in all four tests, their athletic profile, what it means for basketball and other sports, and a goal for the Feb–Mar retest." if one else
              "Each report covers the results in all four tests, an athletic profile, what it means for basketball and other sports, and a goal for the Feb–Mar retest.")
    coachline = f"{andjoin(crp)}'s CRP age-group coaches can also see their results, to help plan training." if crp else ""
    keep = f"Please keep this code private, as it opens {firsts[0]}'s results." if one else "Please keep these codes private, as each one opens a child's results."
    lines_txt = "\n".join(f"  {k['name']}: surname {k['surname']} · access code {k['code']}" for k in kids)
    lines_html = "".join(f"<li><b>{html.escape(k['name'])}</b>: surname <b>{html.escape(k['surname'])}</b> · access code <b>{k['code']}</b></li>" for k in kids)
    txt = "\n\n".join([f"Hi {f['parent']},", intro, f"View the report: {URL}\n{lines_txt}",
        covers + f" You can save it as a PDF or print it from the page. Murray's seminar refresher is there too, or at {URL}/refresher.",
        *([coachline] if coachline else []),
        keep + " If you have any questions, or would like a free 15-minute results chat with Murray, email hpp@warragulbasketball.org.au.",
        "Warragul Basketball Association\nWarriors High Performance Program"])
    htm = (f"<p>Hi {html.escape(f['parent'])},</p><p>{html.escape(intro, quote=False)}</p>"
           f"<p><b>View the report:</b> <a href=\"{URL}\">wba-hpp-testing.pages.dev</a></p><ul>{lines_html}</ul>"
           f"<p>{html.escape(covers, quote=False)} You can save it as a PDF or print it from the page. Murray's seminar refresher is there too, or at <a href=\"{URL}/refresher\">wba-hpp-testing.pages.dev/refresher</a>.</p>"
           + (f"<p>{html.escape(coachline, quote=False)}</p>" if coachline else "")
           + f"<p>{html.escape(keep, quote=False)} If you have any questions, or would like a free 15-minute results chat with Murray, email <a href=\"mailto:hpp@warragulbasketball.org.au\">hpp@warragulbasketball.org.au</a>.</p>"
           "<p>Warragul Basketball Association<br>Warriors High Performance Program</p>")
    rows.append({"Parent": f["parent_full"], "Parent first name": f["parent"], "Email": f["email"], "Mobile": f["mobile"],
                 "Athletes": "; ".join(k["name"] for k in kids), "Codes": "; ".join(f"{k['first']}: {k['surname']} / {k['code']}" for k in kids),
                 "Subject": subj, "Body (text)": txt, "_html": htm})
os.makedirs("data/emails", exist_ok=True)
with open("data/family-emails.csv", "w", newline="", encoding="utf-8") as fh:
    w = csv.DictWriter(fh, fieldnames=[k for k in rows[0] if not k.startswith("_")]); w.writeheader()
    for r in rows: w.writerow({k: v for k, v in r.items() if not k.startswith("_")})
json.dump(rows, open("data/emails/family-emails.json", "w"))
missing = sorted(codes[n]["Athlete"] for n in codes if n not in seen)
print(f"{len(rows)} family emails covering {len(seen)} athletes. No contact: {missing}")
