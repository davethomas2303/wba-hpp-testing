"""Build coach emails (one per head coach) from data/coach-codes.csv.

Writes data/emails/coach-emails.json. Coach -> group mapping comes from source/coaches.csv.
"""
import csv, json, html, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
codes = {r["Team"].replace("CRP ", ""): r for r in csv.DictReader(open(ROOT / "data/coach-codes.csv"))}
ORDER = list(codes)

# source/coaches.csv (private, gitignored): First,Email,Group  (Group "ALL" = every code)
COACHES = [(r["First"], r["Email"], r["Group"]) for r in csv.DictReader(open(ROOT / "source/coaches.csv"))]

LINK = '<a href="https://wba-hpp-testing.pages.dev/coach">wba-hpp-testing.pages.dev/coach</a>'
COVERS = (
    "<ul>"
    "<li><b>Squad summary:</b> a short overview, the squad's mix of athlete types, and the squad average on each test, compared with the next age group up</li>"
    "<li><b>Each player:</b> results, bands (adjusted for exact age), athlete type, training focus and retest goal, with top-age and bottom-age tags</li>"
    "<li><b>Training focus:</b> how many players share each focus, with a session idea for the biggest group</li>"
    "</ul>"
)
SIGN = ("<p>Families have each received their own child's report. Any questions, email "
        '<a href="mailto:hpp@warragulbasketball.org.au">hpp@warragulbasketball.org.au</a>.</p>'
        "<p>Warragul Basketball Association<br>Warriors High Performance Program</p>")

out, skipped = [], []
for first, email, group in COACHES:
    if group == "ALL":
        rows = "".join(f"<li><b>{g}</b> ({codes[g]['Tested']} tested): code <b>{codes[g]['Coach code']}</b></li>" for g in ORDER)
        subject = "Warriors HPP testing results: CRP coach view codes (all age groups)"
        body = (f"<p>Hi {first},</p><p>The CRP coach view from the pre-season testing on Sunday 25 October is ready. "
                f"Here are the codes for all nine tested CRP age groups. Each code opens one group.</p>"
                f"<p><b>Coach view:</b> {LINK}</p><ul>{rows}</ul><p>Each view covers:</p>{COVERS}"
                "<p>Please keep these codes to coaching staff, as they show every player's results. "
                "Each age-group head coach has been sent their own code.</p>" + SIGN)
    elif group not in codes:
        skipped.append((first, email, group)); continue
    else:
        c = codes[group]
        subject = f"Warriors HPP testing results: CRP {group} coach view"
        body = (f"<p>Hi {first},</p><p>The pre-season testing results for your CRP {group} squad from Sunday 25 October are ready "
                f"({c['Tested']} of {c['Squad']} players tested).</p>"
                f"<p><b>Coach view:</b> {LINK}<br><b>Your code:</b> {c['Coach code']}</p><p>It covers:</p>{COVERS}"
                "<p>Please keep this code to your coaching staff, as it shows every player's results.</p>" + SIGN)
    out.append({"First": first, "Email": email, "Group": group, "Subject": subject, "_html": body})

pathlib.Path(ROOT / "data/emails").mkdir(exist_ok=True)
json.dump(out, open(ROOT / "data/emails/coach-emails.json", "w"), indent=1, ensure_ascii=False)
print(len(out), "emails; skipped:", skipped)
