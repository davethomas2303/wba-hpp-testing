/* Warriors HPP coach view: squad profile, results table, training focus. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const { esc, fmtVal, TESTS, BANDS, bandOf } = HPP;
  const FOCUS_Q = { vj: "Power", bj: "Power", sprint: "Speed", yoyo: "Fitness" };
  const TEAM_NAME = { standoutall: "Standout squad", allround: "All-round squad", developing: "Developing squad", balanced: "Balanced squad",
    explosive: "Explosive squad", power: "Power squad", speed: "Speed squad", engine: "Fitness squad", partial: "Profile in progress" };
  let code = "", state = null, sortKey = "name", sortDir = 1;

  // "U14 Boys 14.2 Red · B Grade" -> "14.2 Red · B Grade"
  const teamShort = (t) => String(t || "").replace(/^U\d+(?:\/\d+)?\s+(Boys|Girls)\s+/, "");
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

  function analyse(team) {
    const players = team.players.map((p) => {
      const Q = HPP.qualities(p.tests);
      const type = HPP.profileType(Q);
      const goal = HPP.retestGoal(p.tests);
      const bands = {};
      TESTS.forEach((t) => {
        const d = p.tests[t.k];
        bands[t.k] = d && d.value != null ? bandOf(d.z == null ? 0 : d.z) : null;
      });
      return { ...p, type, goal, bands, focus: goal ? FOCUS_Q[goal.k] : null };
    });
    const teamZ = {}, teamAvg = {}, ageAvg = {};
    TESTS.forEach((t) => {
      const ds = players.map((p) => p.tests[t.k]).filter((d) => d && d.value != null);
      teamZ[t.k] = mean(ds.filter((d) => d.z != null).map((d) => d.z));
      teamAvg[t.k] = mean(ds.map((d) => d.value));
      const ages = [...new Set(ds.map((d) => d.ageAvg))];
      ageAvg[t.k] = ages.length === 1 ? ages[0] : null;
    });
    const cmpShorts = [...new Set(players.map((p) => p.compareShort))];
    return { players, teamZ, teamAvg, ageAvg, cmp: cmpShorts.length === 1 ? cmpShorts[0] : "age-group" };
  }

  function sortPlayers(players) {
    const val = (p) => {
      if (sortKey === "name") return p.name.split(" ").slice(-1)[0] + p.name;
      if (sortKey === "team") return teamShort(p.team) + p.name.split(" ").slice(-1)[0];
      if (sortKey === "type") return p.type.name;
      if (sortKey === "focus") return p.focus || "~";
      const d = p.tests[sortKey];
      return d && d.z != null ? d.z : -99;
    };
    return players.slice().sort((a, b) => {
      const va = val(a), vb = val(b);
      if (typeof va === "string") return va.localeCompare(vb) * sortDir;
      return (vb - va) * sortDir;
    });
  }

  function render() {
    const team = state.team, A = analyse(team);
    $("who-name").textContent = team.name;
    $("who-sub").textContent = `${team.players.length} tested · ${team.session.label} · ${team.session.dateShort}`;
    document.title = `Coach view - ${team.name}`;

    const pick = $("team-pick");
    if (state.teams.length > 1) {
      pick.innerHTML = state.teams.map((t) => `<option value="${esc(t.slug)}" ${t.slug === team.slug ? "selected" : ""}>${esc(t.name)} (${t.tested})</option>`).join("");
      pick.classList.remove("hidden");
    } else pick.classList.add("hidden");

    // ---- squad profile
    const tType = HPP.profileType({
      power: mean([A.teamZ.vj, A.teamZ.bj].filter((v) => v != null)),
      speed: A.teamZ.sprint, engine: A.teamZ.yoyo,
    });
    const labels = {};
    TESTS.forEach((t) => (labels[t.k] = { value: A.teamAvg[t.k] != null ? `${fmtVal(t.k, A.teamAvg[t.k])} ${t.unit}` : null, band: bandOf(A.teamZ[t.k]) }));
    const chart = HPP.radar([{ z: A.teamZ, cls: "team" }], labels);
    const avgRows = TESTS.map((t) => {
      const b = bandOf(A.teamZ[t.k]);
      return `<tr><td>${t.name}</td><td><b>${A.teamAvg[t.k] != null ? fmtVal(t.k, A.teamAvg[t.k]) : "—"}</b></td>
        <td>${A.ageAvg[t.k] != null ? fmtVal(t.k, A.ageAvg[t.k]) : "—"}</td>
        <td>${b ? `<span class="bchip b-${b.key}">${b.name}</span>` : "—"}</td></tr>`;
    }).join("");

    // ---- results table
    const th = (k, label, cls = "") =>
      `<th class="${cls} ${sortKey === k ? "sorted" : ""}" data-sort="${k}">${label}${sortKey === k ? (sortDir === 1 ? " ↓" : " ↑") : ""}</th>`;
    const rows = sortPlayers(A.players).map((p) => {
      const cells = TESTS.map((t) => {
        const d = p.tests[t.k], b = p.bands[t.k];
        if (!d || d.value == null) return `<td class="tc na">—</td>`;
        return `<td class="tc b-${b.key}"><b>${esc(d.display)}</b><span>${b.name}</span></td>`;
      }).join("");
      const g = p.goal;
      return `<tr><td class="pn"><b>${esc(p.name)}</b></td><td class="tm">${esc(teamShort(p.team))}</td>${cells}
        <td class="ty">${esc(p.type.name)}</td>
        <td class="fo">${p.focus ? `<b>${p.focus}</b><span>${g.name}</span>` : "—"}</td>
        <td class="go">${g ? `${esc(g.now)} → <b>${esc(g.target)}</b>` : "—"}</td></tr>`;
    }).join("");

    // ---- training focus
    const groups = {};
    A.players.forEach((p) => { if (p.focus) (groups[p.focus] = groups[p.focus] || []).push(p.first || p.name.split(" ")[0]); });
    const focusOrder = ["Power", "Speed", "Fitness"].filter((f) => groups[f]);
    const biggest = focusOrder.slice().sort((a, b) => groups[b].length - groups[a].length)[0];
    const focusHtml = focusOrder.map((f) => `
      <div class="fgroup ${f === biggest ? "top" : ""}"><div class="fh"><b>${f}</b><span>${groups[f].length} of ${A.players.length}</span></div>
        <div class="fbar"><i style="width:${(groups[f].length / A.players.length) * 100}%"></i></div>
        <p>${groups[f].map(esc).join(", ")}</p></div>`).join("");
    const tip = {
      Power: "Build jumps, landings and lower-body strength into warm-ups: pogo jumps, squat jumps and stick-the-landing drills.",
      Speed: "Add short acceleration work early in sessions while players are fresh: falling starts and 5–10 m races.",
      Fitness: "Use game-like conditioning: small-sided games with short rests and repeat-effort shuttles at the end of training.",
    }[biggest];

    // ---- band spread
    const spread = TESTS.map((t) => {
      const counts = BANDS.map((b) => A.players.filter((p) => p.bands[t.k] === b).length);
      const n = counts.reduce((a, b) => a + b, 0);
      const segs = BANDS.map((b, i) => (counts[i] ? `<i class="s-${b.key}" style="flex:${counts[i]}" title="${b.name}: ${counts[i]}">${counts[i]}</i>` : "")).join("");
      return `<div class="sp"><span>${t.name}</span><div class="spbar">${n ? segs : '<em>No results</em>'}</div></div>`;
    }).join("");

    const kindNote = team.kind === "age" ? "This age-group view includes every tested CRP athlete in the age group." : "";
    $("sheet").innerHTML = `
      <section class="csec head">
        <div class="eyebrow">${esc(team.program)} · ${esc(team.session.label)} · ${esc(team.session.date)}</div>
        <h1 class="h-title">${esc(team.name)} <em>squad.</em></h1>
        <p class="sub">${A.players.length} player${A.players.length === 1 ? "" : "s"} tested${team.notTested.length ? ` · ${team.notTested.length} not tested` : ""}. Each player is compared with their own age group (${esc(A.cmp)}). ${kindNote}</p>
      </section>

      <section class="csec grid2">
        <div class="card profile cprof">
          <div class="pchart">${chart}</div>
          <div class="ptype"><div class="kicker">Squad profile</div><h3>${TEAM_NAME[tType.key] || tType.name}</h3><p>${HPP.teamProfileText(tType)}</p>
            <div class="pleg"><span><i class="team"></i>Squad average</span><span><i class="avg"></i>${esc(A.cmp)} average</span></div></div>
        </div>
        <div class="card avgs">
          <div class="kicker">Squad averages</div>
          <table class="atable"><tr><th>Test</th><th>Squad</th><th>${esc(A.cmp)}</th><th>Band</th></tr>${avgRows}</table>
          <p class="fine">Sprint: lower is better. Yo-Yo is the level reached (level.shuttle).</p>
        </div>
      </section>

      <section class="csec">
        <div class="sech"><h2>Squad results</h2><span>Click a column to sort. Tests sort best first.</span></div>
        <div class="tablewrap"><table class="rtable">
          <thead><tr>${th("name", "Player")}${th("team", "Team")}${TESTS.map((t) => th(t.k, t.short, "tcol")).join("")}${th("type", "Athlete type")}${th("focus", "Focus")}<th>Retest goal</th></tr></thead>
          <tbody>${rows}</tbody></table></div>
      </section>

      <section class="csec grid2 low">
        <div class="card focus"><div class="kicker">Training focus</div><h3>Where the squad can grow</h3>${focusHtml || "<p>No results yet.</p>"}
          ${tip ? `<div class="ctip"><b>Session idea · ${biggest}</b>${tip}</div>` : ""}</div>
        <div class="card spread"><div class="kicker">Band spread</div><h3>How the squad is spread</h3>${spread}
          <div class="bandkey">${BANDS.map((b) => `<span class="bk"><i class="seg s-${b.key}"></i>${b.name}</span>`).join("")}</div>
          ${team.notTested.length ? `<div class="nt"><b>Not tested</b>${team.notTested.map(esc).join(", ")}</div>` : ""}</div>
      </section>
      <p class="confid">For coaches only. Player results are private to each family: please use them to plan training and don't share them outside the coaching group.</p>`;

    $("sheet").querySelectorAll("th[data-sort]").forEach((el) =>
      el.addEventListener("click", () => {
        const k = el.dataset.sort;
        if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = 1; }
        render();
      })
    );
  }

  async function load(team) {
    const res = await fetch("/api/coach", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, team }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
    state = data;
    render();
  }

  const err = $("err"), go = $("go");
  $("access").addEventListener("submit", async (e) => {
    e.preventDefault();
    err.classList.add("hidden");
    code = $("code").value.trim();
    if (!code) { err.textContent = "Enter your coach code."; err.classList.remove("hidden"); return; }
    go.disabled = true;
    try {
      await load();
      $("gate").classList.add("hidden");
      $("viewer").classList.remove("hidden");
      window.scrollTo(0, 0);
    } catch (ex) {
      err.textContent = ex.message; err.classList.remove("hidden");
    } finally { go.disabled = false; }
  });
  $("team-pick").addEventListener("change", (e) => { sortKey = "name"; sortDir = 1; load(e.target.value).catch((ex) => alert(ex.message)); });
  $("close").addEventListener("click", () => {
    state = null; code = ""; $("code").value = ""; $("sheet").innerHTML = "";
    $("viewer").classList.add("hidden"); $("gate").classList.remove("hidden");
  });
  $("pdf").addEventListener("click", () => window.print());
})();
