# Warriors HPP · Athlete reports

Parents go to **https://wba-hpp-testing.pages.dev**, enter their child's **surname + access code**, and get their own 8-page report, which they can save as a PDF or print.

Coaches go to **https://wba-hpp-testing.pages.dev/coach**, enter their **coach code**, and get their squad view: the team's profile, every player's results and bands, each player's training focus and retest goal, and how the squad is spread. You can open any team or age group by entering the admin password (ADMIN_TOKEN) as the code.

- `public/`: the website (report template, styling, logos). It holds **no athlete data**.
- `functions/api/report.js`: the lookup. It checks the surname and code and returns only that athlete's results. After 8 wrong attempts from one connection, that connection is locked out for 15 minutes.
- `functions/api/coach.js`: the coach lookup. A coach code opens that team only; the admin password opens every team and age group.
- `functions/api/admin/views.js`: a CSV showing which families have opened their report.
- `functions/api/admin/upload.js` + `public/admin.html`: the admin page that publishes results.
- `wrangler.example.toml`: only needed for local testing with wrangler. It has no bindings, so Cloudflare uses the dashboard settings.
- `scripts/build_data.py`: turns the testing spreadsheet into the data file and the access codes.
- `data/`: generated files. **Private, never publish or commit this folder.**
  - `kv-bulk.json`: the data you upload to Cloudflare
  - `access-codes.csv`: one code per athlete, for the mail merge
  - `coach-codes.csv`: one code per CRP / VJBL team, to send to each team's coach
  - `import-report.txt`: anything that needs checking
- `source/`: the spreadsheet, the CRP and VJBL team lists, and the original template.

---

## One-time setup (no command line needed)

The site deploys from a **private GitHub repo** that holds only the website code. Athlete data never goes into GitHub: you upload it through the site's admin page.

1. **GitHub:** create an empty **private** repo called `wba-hpp-testing`, then push this folder to it. `.gitignore` keeps `data/` and `source/` out.
2. **Cloudflare → Workers & Pages → Create → Pages → Connect to Git:** pick the repo, then set:
   - Framework preset: **None**
   - Build command: *(leave empty)*
   - Build output directory: **public**
   - Project name: **wba-hpp-testing**, which gives wba-hpp-testing.pages.dev. If that name is already taken by an older project, delete the old one first.
3. **Cloudflare → Storage & Databases → KV → Create namespace** called `HPP_DATA`.
4. **The Pages project → Settings → Bindings → Add → KV namespace:** set the variable name to `HPP_DATA` and pick the namespace from step 3. Do this for Production.
5. **The Pages project → Settings → Variables and Secrets → Add:** name it `ADMIN_TOKEN`, choose type **Secret**, and give it a long password you make up. This is the admin password.
6. **Deployments → Retry deployment**, so the binding and secret take effect.
7. Open **wba-hpp-testing.pages.dev/admin**, enter the admin password, choose `data/kv-bulk.json`, and click **publish to site**.
8. Test the site: open wba-hpp-testing.pages.dev and use a code from `data/access-codes.csv`.

From then on, any change pushed to the GitHub repo redeploys the site automatically.

## Sending codes to families

`data/access-codes.csv` has one row per tested athlete: name, group, team and code. Join it to your parent contact list (by athlete name) for an email or TeamApp mail merge. A suggested message:

> Hi [Parent],
> [First name]'s Warriors High Performance Program testing report is ready.
> Go to **wba-hpp-testing.pages.dev**, enter **[Surname]** and the access code **[Code]**.
> You can save it as a PDF or print it from there. Please keep the code private, because it opens [First name]'s results.

The codes don't change when you rerun the import, so families keep the same code for the mid-season retest.

## Sending codes to coaches

`data/coach-codes.csv` has one code per CRP age group (e.g. CRP U14 boys). Each view includes CRP athletes only, never VJBL-only or Future Warriors Academy athletes. It shows the group summary plus every player's results, with their CRP team. Send each age-group coach their code with the link **wba-hpp-testing.pages.dev/coach**. A coach code only opens its own age group. Coach codes also stay the same when you rerun the import.

## Who has opened their report?

Open **wba-hpp-testing.pages.dev/admin**, enter the admin password, and click **download views csv**. It downloads a CSV with every athlete, whether the report has been opened, how many times, and when.

## Fixing a result, or the mid-season retest

1. Update the spreadsheet. Keep the same layout: one sheet per group, with the same columns.
2. For the retest, change `SESSION` at the top of `scripts/build_data.py` (label and date).
3. Run the import, then publish the new `data/kv-bulk.json` at **/admin**:
   ```
   pip install openpyxl
   python3 scripts/build_data.py "source/HPP Testing Results.xlsx"
   ```
   You don't need to redeploy. Every parent's link shows the new data straight away, with the same codes.

**Lost or shared code:** delete that athlete's row from `data/access-codes.csv`, rerun step 3, and send the family their new code. The old code stops working within about a minute of publishing.

## How the report is worked out

- **Age-group average:** every tested athlete of the same age and gender (U10 boys, U12 girls, and so on). U10 and U12 are compared separately even though they tested together. If fewer than 6 athletes of that age and gender were tested, the athlete is compared with all athletes of that age. This applies to the 3 U10 girls, who are compared with all U10s.
- **Team average:** tested team-mates in the athlete's 2026/27 CRP team (or their VJBL team if they aren't in a CRP team). It's only shown when at least 4 team-mates were tested.
- **Bands:** each result is scored by how far it sits from the age-group average, in age-group spreads (a z-score).
  - Building: more than half a spread below
  - On track: within half a spread
  - Strong: half to 1¼ spreads above
  - Standout: more than 1¼ spreads above

  That's roughly 30 / 40 / 20 / 10% of athletes. Bands never show a ranking. They're shown as traffic lights: Standout green, Strong yellow, On track orange, Building red.
- **Athlete type (profile page):** uses three qualities: power (the average of the two jumps), speed (sprint) and fitness (Yo-Yo).
  - All-round athlete: all three are Strong or better.
  - Standout all-rounder: all three are Strong or better, and well above average overall.
  - Developing all-rounder: all three are below On track.
  - Balanced athlete: the three qualities are close together.
  - Explosive athlete: power and speed are clearly ahead of fitness.
  - Otherwise, the type is named after the best quality: Power athlete, Speed athlete or The engine.
- **Strongest result and focus area:** the highest and lowest band scores. If both jumps are below average, the focus is shown as "Lower-body power".
- **Retest goal:** the focus test, aimed at the next band up. If that would need an unrealistic jump in 4 months, the goal is capped:
  - Vertical jump: +4 cm
  - Broad jump: +12 cm
  - Sprint: 0.15 s faster
  - Yo-Yo: one level

  Yo-Yo goals are given as level.shuttle (e.g. 14.3).
- **From the testing floor:** looks at the three attempts for each jump and sprint, and comments on one of these: a big gap between attempts (technique), getting better every attempt (still learning the movement), best on the first try everywhere (warm-up), or consistent technique.
- **Scales:** each bar's range is set from the lowest and highest results in that age group, shaded by band.
- **Missing tests** show as "Not tested". They're left out of the band, profile and goal calculations.
- **Coach view:** squad averages, the squad profile (the average of each player's band score), every player's results, athlete type, focus and retest goal. The table can be sorted by any column. It also shows how many players have each training focus, with a session idea for the biggest group, plus the band spread for each test and who on the team list wasn't tested.
- **Age-based content:** U14-and-under athletes see the 10-week at-home program ($100 one-off, with exercise videos and guidance). U16 and U18 athletes see Online Coaching in its place. U16 and U18 athletes also get Strength & Conditioning as their focus on the coach page.
- **State pathway (Basketball Victoria Country, U12–U18):** Country Skills Day (U12), Country Jamboree (U12), Regional Skills Day (U14), Future Development Program (U14), CMC · Gold Nugget Camp (U14), State Development Program (U16–U18). The steps for the athlete's age are highlighted, and U10s see Country Skills Day marked "Next".

## Seminar refresher

Murray's "Athletic Development Refresher" fact sheet is at `public/assets/athletic-development-refresher.pdf`. Families can open it in three ways:
- the **seminar sheet** button in the report toolbar
- the download card on page 6 of the report
- the short link **wba-hpp-testing.pages.dev/refresher**

It's general information, so it doesn't need a code. To update it, replace the PDF and redeploy.

## Swapping images

- **Murray's photo:** replace `public/assets/murray-cutout.webp` with the new photo. Use a cut-out on a transparent background, roughly 460 × 670 px, cropped at the waist.
- **Logos:** `public/assets/msc-logo-dark.png` (footers) and `msc-logo-white.png` (dark panels).

Push the change to GitHub and the site redeploys.
