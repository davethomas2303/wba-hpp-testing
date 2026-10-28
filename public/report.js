/* Warriors HPP athlete report: access form + report renderer.
   The page holds no athlete data. It asks /api/report for one athlete's record
   (surname + access code) and builds the 8-page A4 report from it. */
(function () {
  "use strict";

  // ------------------------------------------------------------------ helpers
  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const MINUS = "−";
  const fmt = (n, dp) => (n == null ? "" : Number(n).toFixed(dp).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1"));
  const signed = (n, dp) => (n > 0 ? "+" : n < 0 ? MINUS : "") + fmt(Math.abs(n), dp);

  const TESTS = [
    { k: "vj", name: "Vertical jump", q: "Explosive power", unit: "cm", higher: true, dp: 1, even: 0.5,
      game: "It shows up in rebounding, finishing at the rim and contesting shots." },
    { k: "bj", name: "Broad jump", q: "Horizontal power", unit: "cm", higher: true, dp: 1, even: 2,
      game: "It shows up in a strong first push off the mark and bursting out of a stoppage." },
    { k: "sprint", name: "20 m sprint", q: "Acceleration & speed", unit: "sec", higher: false, dp: 2, even: 0.02,
      game: "It shows up in the first step past a defender and running the floor in transition." },
    { k: "yoyo", name: "Yo-Yo test", q: "Repeat-effort fitness", unit: "level", higher: true, dp: 1, even: 0.15,
      game: "It shows up in staying sharp in the last quarter and the last game of a tournament." },
  ];
  const QUALITY_TITLE = { vj: "Explosive power", bj: "Horizontal power", sprint: "Speed", yoyo: "Repeat-effort fitness" };

  const ICON = {
    star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    pulse: '<path d="M2 12h4l3-8 4 16 3-8h6"/>',
    route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h6a4 4 0 0 0 0-8h-4a4 4 0 0 1 0-8h6"/>',
    flame: '<path d="M12 22a7 7 0 0 0 7-7c0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-2 2-5 5-5 8a7 7 0 0 0 7 7z"/>',
    snow: '<path d="M12 2v20M4.9 4.9l14.2 14.2M2 12h20M4.9 19.1 19.1 4.9"/>',
    drop: '<path d="M12 2.7 6.3 9.4a7 7 0 1 0 11.4 0z"/>',
    apple: '<path d="M12 7c-1-3-4-4-6-3 0 3 2 5 6 3zM12 7c4-2 8 0 8 5 0 6-4 10-6 10-1 0-1.5-.5-2-.5s-1 .5-2 .5c-2 0-6-4-6-10 0-5 4-7 8-5z"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H3a4 4 0 0 0 4 4M17 6h4a4 4 0 0 1-4 4"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    doc: '<path d="M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  };
  const svg = (name, extra = "") =>
    `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${ICON[name]}</svg>`;

  // --------------------------------------------------------------- analysis
  function analyse(r) {
    const he = r.gender === "Girls" ? "she" : "he";
    const his = r.gender === "Girls" ? "her" : "his";
    const him = r.gender === "Girls" ? "her" : "him";
    const ageNum = parseInt(String(r.age).replace(/\D/g, ""), 10) || 14;
    const ageLong = `Under ${ageNum} ${r.gender}`;
    const cmp = r.compareLabel || `${r.age} ${r.gender.toLowerCase()}`;

    const rows = TESTS.map((t) => {
      const d = r.tests[t.k] || {};
      const has = d.value != null;
      let diff = null, state = "none";
      if (has && d.ageAvg != null) {
        diff = t.higher ? d.value - d.ageAvg : d.ageAvg - d.value; // positive = better
        state = Math.abs(diff) < t.even ? "even" : diff > 0 ? "up" : "down";
      }
      const band = has ? HPP.bandOf(d.z == null ? 0 : d.z) : null;
      return { ...t, ...d, has, diff, state, band };
    });
    const ranked = rows.filter((x) => x.has && x.z != null).sort((a, b) => b.z - a.z);
    return { he, his, him, ageNum, ageLong, cmp, rows, ranked };
  }

  function diffLine(x) {
    if (!x.has) return "Not tested on the day";
    if (x.state === "even" || x.diff == null) return "Right on the average";
    if (x.k === "sprint") return `${fmt(Math.abs(x.diff), 2)}\u00a0s ${x.state === "up" ? "faster" : "slower"} than average`;
    if (x.k === "yoyo") return x.state === "up" ? "Above average" : "Below average";
    return `${fmt(Math.round(Math.abs(x.diff) * 10) / 10, 1)}\u00a0cm ${x.state === "up" ? "above" : "below"} average`;
  }
  function triesLine(x) {
    const t = (x.tries || []).filter((v) => v != null);
    if (!x.has || t.length < 2) return "";
    const best = x.higher ? Math.max(...t) : Math.min(...t);
    let marked = false;
    return "Attempts " + t.map((v) => {
      const s = HPP.fmtVal(x.k, v);
      if (!marked && v === best) { marked = true; return `<strong>${s}</strong>`; }
      return s;
    }).join(" · ");
  }

  function badgeText(x) {
    if (!x.has) return "Not tested";
    if (x.state === "even") return "on the avg";
    if (x.k === "sprint") return `${fmt(Math.abs(x.diff), 2)}\u00a0s · ${x.state === "up" ? "faster" : "slower"} than avg`;
    if (x.k === "yoyo") return x.state === "up" ? "above avg" : "below avg";
    return `${signed(Math.round(x.diff * 10) / 10, 1)}\u00a0cm · ${x.state === "up" ? "above" : "below"} avg`;
  }

  function diffPhrase(x) {
    // e.g. "6 cm under", "0.12 s faster than", "above"
    const a = Math.abs(x.diff);
    if (x.state === "even") return "right on";
    if (x.k === "sprint") return `${fmt(a, 2)}\u00a0seconds ${x.state === "up" ? "faster than" : "slower than"}`;
    if (x.k === "yoyo") return x.state === "up" ? "above" : "below";
    return `${fmt(Math.round(a * 10) / 10, 1)}\u00a0cm ${x.state === "up" ? "above" : "under"}`;
  }

  function strongestPanel(A, r) {
    const s = A.ranked[0];
    if (!s) {
      return { title: "Your baseline is set", body: `${esc(r.first)}'s results from today are the starting point for the mid-season retest.` };
    }
    const v = `${s.display}\u00a0${s.unit === "sec" ? "seconds" : s.unit === "level" ? "" : s.unit}`.trim();
    let body;
    if (s.state === "up") {
      body = `${esc(r.first)}'s ${(s.k === "yoyo" ? "Yo-Yo test" : s.name.toLowerCase())} result of ${esc(v)} is ${diffPhrase(s)} the ${esc(A.cmp)} average, ${A.his} best result against ${A.his} age group. ${s.game}`;
    } else if (s.state === "even") {
      body = `${esc(r.first)}'s ${(s.k === "yoyo" ? "Yo-Yo test" : s.name.toLowerCase())} result of ${esc(v)} is right on the ${esc(A.cmp)} average, ${A.his} best result against ${A.his} age group. ${s.game}`;
    } else {
      body = `Of ${A.his} results, ${A.his} ${(s.k === "yoyo" ? "Yo-Yo test" : s.name.toLowerCase())} (${esc(v)}) sits closest to the ${esc(A.cmp)} average. ${s.game}`;
    }
    return { title: `${QUALITY_TITLE[s.k]} · ${s.name}`, body };
  }

  function focusPanel(A, r) {
    const pool = A.ranked;
    if (pool.length < 2) {
      return { title: "All-round development", body: `With only part of ${A.his} testing complete, ${esc(r.first)}'s best next step is building all four qualities together.` };
    }
    const f = pool[pool.length - 1];
    const vj = A.rows.find((x) => x.k === "vj"), bj = A.rows.find((x) => x.k === "bj");
    const train = `This is very trainable at ${esc(r.first)}'s age and the biggest opportunity in ${A.his} results.`;
    if ((f.k === "vj" || f.k === "bj") && vj.state === "down" && bj.state === "down") {
      return {
        title: "Lower-body power",
        body: `Vertical jump ${fmt(Math.round(Math.abs(vj.diff) * 10) / 10, 1)}\u00a0cm and broad jump ${fmt(Math.round(Math.abs(bj.diff) * 10) / 10, 1)}\u00a0cm under the ${esc(A.cmp)} average. ${train}`,
      };
    }
    if (f.state === "down") {
      return { title: QUALITY_TITLE[f.k], body: `${f.name} ${diffPhrase(f)} the ${esc(A.cmp)} average. ${train}` };
    }
    return {
      title: `Next level: ${QUALITY_TITLE[f.k].toLowerCase()}`,
      body: `Every result is at or above the ${esc(A.cmp)} average. ${QUALITY_TITLE[f.k]} has the most room to grow next, and it's very trainable at ${esc(r.first)}'s age.`,
    };
  }

  // --------------------------------------------------------------- pages
  const TOTAL = 8;
  const foot = (r, n) => `
    <div class="page-foot"><img src="/assets/warriors-logo.png" alt="">
      <span class="ft">Warriors High Performance Program · ${esc(r.name)}</span><img class="msc" src="/assets/msc-logo-dark.png" alt="Myers Sports Coaching"><b>${n} / ${TOTAL}</b></div>`;
  const head = (eyebrow, title, em) => `
    <div class="sec-head"><div class="eyebrow">${eyebrow}</div>
      <h2 class="h-title">${title} <em>${em}</em></h2><div class="rule"></div></div>`;

  function pCover(r, A) {
    const team = r.team ? `${A.ageLong}<small>${esc(r.program === "VJBL" ? r.team : "CRP " + (r.teamShort || ""))}</small>` : `${A.ageLong}<small>Future Warriors Academy</small>`;
    return `
    <section class="page cover">
      <div class="cover-top"><div class="rings"></div>
        <div class="cover-brand">
          <div class="assoc">Warragul Basketball Association<span>Warragul Warriors</span></div>
          <div class="partner">In partnership with<img src="/assets/msc-logo-white.png" alt="Myers Sports Coaching"></div>
        </div>
        <div class="cover-title">
          <div class="pill">${svg("star")}Warriors High Performance Program · 2026/27</div>
          <h1 class="h-title">Athlete Performance <em>report.</em></h1>
          <p>${esc(r.first)}'s ${esc(r.session.label.toLowerCase())} results, what they mean for basketball and ${A.his} other sports, where they fit on the pathway, and how to keep improving this season.</p>
        </div>
      </div>
      <div class="cover-band"></div>
      <div class="cover-bottom">
        <div class="cover-logo"><img src="/assets/warriors-logo.png" alt="Warragul Warriors">
          <div class="hp">HIGH PERFORMANCE</div><div class="prog">PROGRAM</div></div>
        <div>
          <table class="meta">
            <tr><td>Athlete</td><td>${esc(r.name)}</td></tr>
            <tr><td>Team</td><td>${team}</td></tr>
            <tr><td>Tested</td><td>${esc(r.session.date)}</td></tr>
            <tr><td>Tested by</td><td>Murray Myers<small>Myers Sports Coaching</small></td></tr>
          </table>
          <div class="cover-tag">#WARRIORSPIRIT</div>
        </div>
      </div>
    </section>`;
  }

  function pResults(r, A) {
    const cards = A.rows.map((x) => {
      const avgs = [];
      if (x.teamAvg != null) avgs.push(`Team avg <strong>${fmt(x.teamAvg, x.dp)}</strong>`);
      if (x.ageAvg != null) avgs.push(`${esc(r.compareShort || A.cmp.replace(/ (boys|girls)$/, ""))} avg <strong>${fmt(x.ageAvg, x.dp)}</strong>`);
      return `
      <div class="card rcard">
        <div class="top"><div><h3>${x.name}</h3><div class="q">${x.q}</div></div>
          <span class="bchip b-${x.band ? x.band.key : "none"}">${x.band ? x.band.name : "Not tested"}</span></div>
        <div class="val ${x.has ? "" : "na"}"><b>${x.has ? esc(x.display) : "—"}</b><span>${x.unit}</span></div>
        <div class="diff">${diffLine(x)}</div>
        <div class="avgs">${avgs.join(" · ") || "&nbsp;"}</div>
        ${triesLine(x) ? `<div class="tries">${triesLine(x)}</div>` : ""}
      </div>`;
    }).join("");

    const pos = (x, v) => {
      const lo = x.scaleMin, hi = x.scaleMax;
      let p = (v - lo) / (hi - lo);
      if (!x.higher) p = 1 - p;
      return Math.max(0.01, Math.min(0.99, p)) * 100;
    };
    const posRaw = (x, v) => {
      let p = (v - x.scaleMin) / (x.scaleMax - x.scaleMin);
      if (!x.higher) p = 1 - p;
      return Math.max(0, Math.min(1, p)) * 100;
    };
    const segs = (x) => {
      if (x.ageAvg == null || !x.ageSd) return "";
      const cuts = [-0.5, 0.5, 1.25].map((z) => posRaw(x, HPP.valueAtZ(x, x, z)));
      const edges = [0, ...cuts, 100];
      return '<span class="bands">' + HPP.BANDS.map((b, i) =>
        `<i class="seg s-${b.key}" style="left:${edges[i]}%;width:${Math.max(0, edges[i + 1] - edges[i])}%"></i>`).join("") + "</span>";
    };
    const scales = A.rows.map((x) => {
      const ends = x.higher
        ? [`${fmt(x.scaleMin, 1)} ${x.unit}`, `${fmt(x.scaleMax, 1)} ${x.unit}`]
        : [`${Number(x.scaleMax).toFixed(2)} ${x.unit}`, `${Number(x.scaleMin).toFixed(2)} ${x.unit}`];
      const track = x.has
        ? `<div class="track">${segs(x)}
             ${x.teamAvg != null ? `<i class="mk team" style="left:${pos(x, x.teamAvg)}%"></i>` : ""}
             ${x.ageAvg != null ? `<i class="mk age" style="left:${pos(x, x.ageAvg)}%"></i>` : ""}
             <i class="mk me" style="left:${pos(x, x.value)}%"></i></div>`
        : `<div class="track empty">Not tested on the day · included at the mid-season retest</div>`;
      return `<div class="scale"><div class="lbl"><b>${x.name}</b><span>${x.higher ? "Higher is better" : "Lower time is better"}</span></div>
        ${track}<div class="ends"><span>${ends[0]}</span><span>${ends[1]}</span></div></div>`;
    }).join("");

    const anyTeam = A.rows.some((x) => x.teamAvg != null);
    const who = r.team ? "Team averages use tested team-mates" : "";
    return `
    <section class="page"><div class="page-body">
      ${head("Your results", `${esc(r.first)}'s`, "results.")}
      <p class="sec-intro">Four tests, chosen because each one carries over to every sport ${esc(r.first)} plays. Every result is compared with all ${esc(A.cmp)} tested across the Warriors program${anyTeam ? `, and with ${A.his} tested team-mates` : ""}, and given a band from <b>Building</b> to <b>Standout</b> that allows for ${A.his} exact age.</p>
      <div class="result-grid">${cards}</div>
      <div class="sits">
        <div class="sits-head"><h3>Where ${esc(r.first)} sits</h3>
          <div class="legend"><span><i class="dot"></i>${esc(r.first)}</span><span><i class="tk"></i>Age avg</span>${anyTeam ? '<span><i class="tk team"></i>Team avg</span>' : ""}</div></div>
        <div class="card scales">${scales}</div>
        <div class="bandkey"><span>Further right is better. Bands allow for exact age:</span>
          ${HPP.BANDS.map((b) => `<span class="bk"><i class="seg s-${b.key}"></i>${b.name}</span>`).join("")}</div>
      </div>
    </div>${foot(r, 2)}</section>`;
  }

  function pProfile(r, A) {
    const p = { first: r.first, he: A.he, his: A.his, him: A.him, cmp: A.cmp };
    const Q = HPP.qualities(r.tests);
    const type = HPP.profileType(Q);
    const labels = {};
    A.rows.forEach((x) => (labels[x.k] = { value: x.has ? `${x.display} ${x.unit}` : null, band: x.band }));
    const z = {};
    A.rows.forEach((x) => (z[x.k] = x.has && x.z != null ? x.z : null));
    const chart = HPP.radar([{ z, cls: "me" }], labels);
    const bandCards = HPP.BANDS.map((b) => {
      const mine = A.rows.filter((x) => x.band === b).map((x) => x.name);
      return `<div class="bandcard s-${b.key} ${mine.length ? "has" : ""}"><div class="bn">${b.name}</div><p>${b.desc}</p>
        <div class="mine">${mine.length ? mine.map((m) => `<span>${m}</span>`).join("") : '<em>—</em>'}</div></div>`;
    }).join("");
    const g = HPP.retestGoal(r.tests);
    const goal = g ? `
      <div class="goal">
        <div class="gl"><div class="kicker">Retest goal · Feb–Mar</div>
          <div class="gn">${g.name}</div>
          <div class="gv"><span class="now">${esc(g.now)}</span><span class="arr">→</span><b>${esc(g.target)}</b><span class="u">${g.unit === "level" ? "" : g.unit}</span></div></div>
        <p>${g.next
          ? (g.reach
            ? `Reaching <b>${esc(g.target)}${g.unit === "level" ? "" : "\u00a0" + g.unit}</b> (${esc(g.gainText)}) would move ${esc(r.first)}'s ${(g.k === "yoyo" ? "Yo-Yo test" : g.name.toLowerCase())} from <b>${g.band.name}</b> into <b>${g.next.name}</b>. It's ${A.his} focus area, so it's where training pays off most.`
            : `A realistic first step for ${A.his} focus area (${esc(g.gainText)}). It moves ${esc(r.first)} well towards the <b>${g.next.name}</b> band, and it's where training pays off most.`)
          : `Every result is in the Standout band. The goal is to stay there while beating ${A.his} ${(g.k === "yoyo" ? "Yo-Yo test" : g.name.toLowerCase())} best of ${esc(g.now)}.`}</p>
      </div>` : "";
    const ti = HPP.triesInsight(r.tests, p);
    const tries = ti ? `<div class="note floor"><div class="kicker">From the testing floor · ${ti.title}</div><p>${ti.text}</p></div>` : "";
    return `
    <section class="page"><div class="page-body">
      ${head("Athlete profile", `${esc(r.first)}'s`, "profile.")}
      <p class="sec-intro">The shape shows all four results together. The further out each point sits, the stronger the result for ${esc(r.first)}'s exact age. The dashed line is average for ${A.his} age.</p>
      <div class="card profile">
        <div class="pchart">${chart}</div>
        <div class="ptype"><div class="kicker">Athlete type</div><h3>${type.name}</h3><p>${HPP.profileText(type, p)}</p>
          <div class="pleg"><span><i class="me"></i>${esc(r.first)}</span><span><i class="avg"></i>Average for ${A.his} age</span></div></div>
      </div>
      <h3 class="sub-h">The four bands</h3>
      <div class="bandrow">${bandCards}</div>
      ${goal}
      ${tries}
    </div>${foot(r, 3)}</section>`;
  }

  function pMeaning(r, A) {
    const s = strongestPanel(A, r), f = focusPanel(A, r);
    const focusK = A.ranked.length ? A.ranked[A.ranked.length - 1].k : null;
    const hl = (ks) => (focusK && ks.includes(focusK) && A.ranked.length > 1 ? ' class="hl"' : "");
    return `
    <section class="page"><div class="page-body">
      ${head("On the court and beyond", "What it", "means.")}
      <div class="two">
        <div class="panel dark"><div class="kicker">Building on</div><h4>${s.title}</h4><p>${s.body}</p></div>
        <div class="panel light"><div class="kicker">Focus area</div><h4>${f.title}</h4><p>${f.body}</p></div>
      </div>
      <h3 class="sub-h">Why these qualities matter in every sport</h3>
      <table class="qtable">
        <tr><th>Quality</th><th>Basketball</th><th>AFL</th><th>Cricket &amp; others</th></tr>
        <tr${hl(["vj", "bj"])}><td><b>Power</b><span>Vertical &amp; broad jump</span></td><td data-label="Basketball">Rebounding, finishing at the rim, contesting shots</td><td data-label="AFL">Marking contests, ruck work, bursting from a stoppage</td><td data-label="Cricket &amp; others">Fast-bowling run-up, netball and volleyball jumps</td></tr>
        <tr${hl(["sprint"])}><td><b>Speed</b><span>20 m sprint</span></td><td data-label="Basketball">First step past a defender, running the floor in transition</td><td data-label="AFL">Leading to space, breaking away from a pack</td><td data-label="Cricket &amp; others">Running between wickets, soccer and hockey breaks</td></tr>
        <tr${hl(["yoyo"])}><td><b>Repeat-effort fitness</b><span>Yo-Yo test</span></td><td data-label="Basketball">Staying sharp in the last quarter and game four of a tournament</td><td data-label="AFL">Running out four quarters, repeat efforts to contests</td><td data-label="Cricket &amp; others">Long fielding sessions, soccer, athletics</td></tr>
      </table>
      <div class="callout"><div class="ico">${svg("globe")}</div><div>
        <h4>Plays other sports too? Good.</h4>
        <p>Kids who play more than one sport usually become better all-round athletes. Murray coaches athletes across all sports, so ${esc(r.first)}'s training is planned around ${A.his} whole week, not just basketball. Heavy AFL or cricket weeks get a lighter load, and quieter weeks get the harder sessions.</p></div></div>
      <div class="note"><div class="kicker">A note on growth</div>
        <p>Through the junior years, athletes grow at very different times, and results can dip during a growth spurt. That's normal. What matters most is ${esc(r.first)}'s improvement from one test to the next, not where ${A.he} sits against others on one day.</p></div>
    </div>${foot(r, 4)}</section>`;
  }

  function pPathway(r, A) {
    const academy = r.program === "Academy";
    const w = [
      ["Future Warriors Academy", "Open skill development for ages 7–15, the starting point for Warriors players", academy],
      ["Junior Warriors CRP &amp; VJBL", "Selective junior representative teams in the CRP and VJBL competitions", !academy],
      ["Warriors CBL", "Senior development competition for ages 16+, the step into senior basketball", false],
      ["Warriors Big V", "The top of the Warriors pathway, representing Warragul in Big V", false],
    ];
    // Basketball Victoria Country pathway (U12–U18). Steps for the athlete's age are highlighted.
    const s = [
      ["U12", "Country Skills Day", "Initial development and talent identification"],
      ["U12", "Country Jamboree", "Selected athletes at a state-level development event"],
      ["U14", "Regional Skills Day", "Development and identification for the FDP"],
      ["U14", "Future Development Program", "Regional high-performance development"],
      ["U14", "CMC · Gold Nugget Camp", "Country Metro Challenge and advanced talent camp"],
      ["U16–U18", "State Development Program", "State-level high-performance pathway"],
    ];
    const band = A.ageNum <= 12 ? "U12" : A.ageNum === 14 ? "U14" : "U16–U18";
    const firstMine = s.findIndex((x) => x[0] === band);
    const step = (t, d, cls, tag, age) =>
      `<div class="step ${cls}"><i class="ring"></i><div><b>${age ? `<span class="age">${age}</span>` : ""}${t}${tag ? `<span class="tag">${tag}</span>` : ""}</b><p>${d}</p></div></div>`;
    const wHtml = w.map(([t, d, on]) => step(t, d, on ? "on" : "", on ? "Now" : "")).join("");
    const sHtml = s.map(([age, t, d], i) => {
      if (A.ageNum < 12) return step(t, d, i === 0 ? "next" : "", i === 0 ? "Next" : "", age);
      const mine = age === band;
      return step(t, d, mine ? "on" : "", "", age);
    }).join("");
    const program = academy ? "the Future Warriors Academy" : "the Junior Warriors program";
    // Season timeline: done = full dot, now = half dot. Driven by the testing session.
    const steps = [
      ["OCT", "Pre-season testing", "Baseline results in this report"],
      ["OCT–APR", "Rep season", "Tournaments, with training around games"],
      ["FEB–MAR", "Mid-season retest", "Same four tests, with a progress report"],
      ["JUL–AUG", "Rep-Ready", "5-week prep block, Wednesday nights"],
      ["AUGUST", "CRP trials", "Selection for next season's teams"],
    ];
    const isRetest = /mid|retest/i.test((r.session && r.session.id) || "");
    const done = isRetest ? [0, 2] : [0], now = 1;
    if (isRetest) steps[2][2] = "Progress results in this report";
    const tl = {
      prog: isRetest ? 2 : 1,
      html: steps.map(([m, b, d], i) => {
        const cls = done.includes(i) ? "done" : i === now ? "now" : "";
        return `<div class="t ${cls}"><i></i><div class="m">${m}${i === now ? '<span class="nowtag">Now</span>' : ""}</div><b>${b}</b><p>${d}</p></div>`;
      }).join(""),
    };
    return `
    <section class="page"><div class="page-body">
      ${head("The pathway", "Where this can", "lead.")}
      <p class="sec-intro">${esc(r.first)} is in ${program}, which sits inside two connected pathways. Athleticism matters at every&nbsp;step.</p>
      <div class="paths">
        <div class="path red"><div class="ph"><b>Warriors pathway</b><span>Warragul Basketball Association</span></div>${wHtml}</div>
        <div class="path blk"><div class="ph"><b>State pathway · U12–U18</b><span>Basketball Victoria Country</span></div>${sHtml}</div>
      </div>
      <div class="strip red">${svg("pulse")}<div><div class="kicker">Warriors High Performance Program</div>
        <p>Runs alongside every step, from Future Warriors Academy to the CRP. Exclusive to athletes in Warriors programs, in partnership with Myers Sports Coaching.</p></div></div>
      <div class="strip blk">${svg("route")}<div><div class="kicker">Athleticism is part of selection</div>
        <p>Basketball Victoria Country's Future Development Program lists <b>physical literacy</b> (size, length, agility and coordination) in its selection framework. Pathway sessions start with a structured warm&#8209;up, so the RAMP habits ${esc(r.first)} learned at the seminar pay off here too.</p></div></div>
      <div class="year"><h3>${esc(r.first)}'s year at a glance</h3>
        <div class="tl" style="--prog:${tl.prog}">
          ${tl.html}
        </div></div>
      <p class="fine">Testing and training support ${esc(r.first)}'s development. They don't guarantee selection in any Warriors or Basketball Victoria program.</p>
    </div>${foot(r, 5)}</section>`;
  }

  function pGameDay(r, A) {
    const cards = [
      ["Warm up with RAMP", "flame", ["Raise · Activate · Mobilise · Potentiate", "10–15 minutes, building up gradually", "Shaped to your sport, not just a sweat"]],
      ["Cool down", "snow", ["A few easy minutes after hard sessions", "Light walk, easy jog or deep breathing", "No need for 15–20 minutes"]],
      ["Sleep &amp; screens", "moon", ["8–10 hours, with consistent sleep times", "Screens off 30–60 minutes before bed", "Charge your phone outside the bedroom"]],
      ["Nutrition", "apple", ["Eat a variety of foods, and eat regularly", "Before training: banana or toast", "After: carbs and protein, e.g. yoghurt"]],
      ["Hydration", "drop", ["Water is the go-to, all day", "Bring a bottle to training and games", "Sports drinks only for big game days"]],
      ["Training load", "pulse", ["Recovery is when your body adapts", "A couple of teams, not a million", "Sleep first; recovery gadgets are extras"]],
    ].map(([t, ic, li], i) => `<div class="card gd"><span class="num">0${i + 1}</span><div class="ico">${svg(ic)}</div><h4>${t}</h4><ul>${li.map((x) => `<li>${x}</li>`).join("")}</ul></div>`).join("");
    const bag = ["2 water bottles", "Snacks for breaks", "Singlet &amp; shorts", "Spare socks", "Warm-up top", "Shoes &amp; ankle braces", "Towel", "Any medication"];
    return `
    <section class="page"><div class="page-body">
      ${head("From Murray's seminar", "Beyond the", "session.")}
      <p class="sec-intro">Athletic development isn't just what ${esc(r.first)} does at training. It's also how ${A.he} prepares and recovers. These are the key messages from the seminar.</p>
      <div class="gd-grid">${cards}</div>
      <div class="bag"><div class="kicker">Tournament bag checklist</div><ul>${bag.map((b) => `<li>${b}</li>`).join("")}</ul></div>
      <a class="refresher" href="/assets/athletic-development-refresher.pdf" target="_blank" rel="noopener">
        <div class="ico">${svg("doc")}</div>
        <div><div class="kicker">Seminar refresher · 7 pages</div><b>Athletic Development Refresher</b>
          <span>Warm-ups, cool-down, recovery, screens and sleep, and nutrition.<br>Online at <b class="url">wba-hpp-testing.pages.dev/refresher</b></span></div>
        <div class="dl">download pdf</div>
      </a>
    </div>${foot(r, 6)}</section>`;
  }

  function pCoach(r, A) {
    const senior = A.ageNum >= 16;
    const specs = [
      ["Athletic Development", "Developing speed, power, coordination, agility and movement skills for junior and developing athletes.", !senior ? `${esc(r.first)}'s focus` : ""],
      ["Strength &amp; Conditioning", "Individualised strength programs designed to improve athletic performance, movement quality and resilience.", senior ? `${esc(r.first)}'s focus` : ""],
      ["Semi-Private Coaching", "Small-group coaching with individualised programming and athlete-focused development.", "Up to 3"],
      ["Online Coaching", "Individualised online programming and coaching support for athletes anywhere.", "At-home"],
      ["Sports Performance", "Performance coaching for athletes looking to improve the physical qualities required for their sport.", ""],
      ["Injury Rehabilitation &amp; Return to Sport", "Structured rehabilitation programs designed to safely return athletes to sport and improve long-term resilience.", ""],
    ].map(([t, d, chip]) => {
      const focus = chip && chip.endsWith("focus");
      return `<div class="card spec ${focus ? "focus" : ""}"><div class="sh"><b>${t}</b>${chip ? `<span class="chip">${chip}</span>` : ""}</div><p>${d}</p></div>`;
    }).join("");
    const creds = ["ESSA Accredited Sport Scientist", "Bachelor of Exercise &amp; Sports Science", "ASCA Level 1 Strength &amp; Conditioning", "Sports Medicine Australia Level 1", "Woodford ACL Mentorship"]
      .map((c) => `<li>${svg("check")}${c}</li>`).join("");
    return `
    <section class="page coach">
      <div class="coach-top"><div>
          <div class="eyebrow">Your coach</div>
          <h2 class="h-title">Meet<br><em>Murray Myers.</em></h2>
          <p>Official strength &amp; conditioning service<br>of the Warragul Warriors.</p></div>
        <img class="cutout" src="/assets/murray-cutout.webp" alt="Murray Myers"></div>
      <div class="coach-band"></div>
      <div class="coach-body">
        <div class="eyebrow">Credentials</div><ul class="card creds">${creds}</ul>
        <div class="eyebrow">Specialties</div><div class="specs">${specs}</div>
        <div class="msc-strip"><img src="/assets/msc-logo-dark.png" alt="Myers Sports Coaching"><p>Qualified, accredited, and focused on young athletes' long-term development in every sport they play.</p></div>
      </div>
      ${foot(r, 7)}
    </section>`;
  }

  function pPlan(r, A) {
    const junior = A.ageNum <= 14;
    const third = junior
      ? `<div class="offer"><div class="oh"><div class="k">Best value · U14 &amp; under</div><h4>At-home program</h4><div class="sub">10-week program · one-off cost</div>
          </div><div class="price"><b>$100</b><span>one-off</span></div>
          <ul><li>10 weeks, any day</li><li>Video for every exercise</li><li>Guidance from Murray</li><li>Around other sports</li></ul></div>`
      : `<div class="offer"><div class="oh"><div class="k">Train anywhere</div><h4>Online coaching</h4><div class="sub">8-week program · with Murray checking in</div>
          </div><div class="price"><b>$31.25</b><span>per week</span></div>
          <ul><li>Built from ${esc(r.first)}'s results</li><li>Regular check-ins</li><li>Delivered in the MSC app</li><li>Around school &amp; sport</li></ul></div>`;
    return `
    <section class="page"><div class="page-body">
      ${head("Next steps", `${esc(r.first)}'s`, "plan.")}
      <div class="start"><span class="free">START HERE · FREE</span>
        <p><b>15-minute results chat with Murray.</b> Go through ${esc(r.first)}'s report, ${A.his} other sports and ${A.his} goals, then pick the option that fits. Book online in under a minute (details below).</p></div>
      <div class="offers">
        <div class="offer dark"><div class="oh"><div class="k">Most support</div><h4>Personal training</h4><div class="sub">1:1 with Murray at Voyage Fitness</div>
          </div><div class="price"><b>$100</b><span>per week</span></div>
          <ul><li>One 1:1 session a week</li><li>Built from ${esc(r.first)}'s results</li><li>Around all ${A.his} sports</li><li>Technique coaching</li></ul></div>
        <div class="offer"><div class="oh"><div class="k">Train with mates</div><h4>Semi-private coaching</h4><div class="sub">Membership · up to 3 athletes</div>
          </div><div class="price"><b>$90</b><span>per week</span></div>
          <ul><li>Two sessions a week</li><li>Up to 3 per group</li><li>Individual programs</li><li>At Voyage Fitness</li></ul></div>
        ${third}
      </div>
      <div class="small-lines">
        ${junior ? "<p><b>Want Murray checking in?</b> Step up to Online Coaching, with regular check-ins and progress monitoring: $31.25 per week for 8 weeks.</p>" : ""}
        <p><span class="r">Warriors-only offer:</span> new junior athletes get <b>$10 off per week for their first four weeks</b> of personal training or semi&#8209;private coaching.</p>
      </div>
      <div class="rr"><div><div class="k"><i>REP-READY</i>Next block: July 2027 · dates TBC</div>
          <h4>Build your engine for the rep season.</h4>
          <p>A 5-week, basketball-specific strength &amp; conditioning block before CRP trials. Wednesdays <span class="nw">6:30–7:30 PM</span>, all age groups together, scaled to each athlete.</p></div>
        <div class="pp"><b>$12</b><span>per session</span></div></div>
      <div class="book"><div><img class="logo" src="/assets/msc-logo-white.png" alt="Myers Sports Coaching">
          <div class="k">Book your free chat online</div>
          <a class="url" href="https://myerssportscoaching.setmore.com" target="_blank" rel="noopener">myerssportscoaching.setmore.com</a>
          <p>Or contact Murray: 0468 468 579 · murrayjmyers@gmail.com</p></div>
        <div class="qr"><img src="/assets/qr-book.png" alt="QR code to book"><span>SCAN TO BOOK</span></div></div>
      <p class="fine">Training with MSC is optional and has no bearing on selection or court time. The Warriors High Performance Program is a joint WBA&nbsp;×&nbsp;MSC initiative, open only to Future Warriors Academy and Warriors program athletes.</p>
    </div>${foot(r, 8)}</section>`;
  }

  function render(r) {
    const A = analyse(r);
    const pages = [pCover(r, A), pResults(r, A), pProfile(r, A), pMeaning(r, A), pPathway(r, A), pGameDay(r, A), pCoach(r, A), pPlan(r, A)];
    $("pages").innerHTML = pages.map((p) => `<div class="page-holder">${p}</div>`).join("");
    $("who-name").textContent = r.name;
    $("who-sub").textContent = `${A.ageLong} · ${r.session.label} · ${r.session.dateShort}`;
    document.title = `Warriors HPP report - ${r.name}`;
    fit();
  }

  // Scale the A4 pages down to fit phones (print is always full size).
  // Scale the A4 pages down to fit phones with a transform (consistent in Safari and Chrome).
  // Print always uses full-size pages.
  const PHONE = 700; // below this width the report reflows (see report.css "PHONE REFLOW")
  function fit() {
    const vw = document.documentElement.clientWidth;
    if (vw < PHONE) { unfit(); return; }
    const s = Math.min(1, (vw - 24) / 794);
    document.querySelectorAll(".page-holder").forEach((h) => {
      const pg = h.firstElementChild;
      if (s < 1) {
        h.style.width = 794 * s + "px";
        h.style.height = 1123 * s + "px";
        pg.style.transform = `scale(${s})`;
      } else {
        h.style.width = h.style.height = pg.style.transform = "";
      }
    });
  }
  function unfit() {
    document.querySelectorAll(".page-holder").forEach((h) => {
      h.style.width = h.style.height = h.firstElementChild.style.transform = "";
    });
  }
  window.addEventListener("resize", fit);

  // ------------------------------------------------------------------ form
  const form = $("access"), err = $("err"), go = $("go");
  const codeInput = $("code");
  codeInput.addEventListener("input", () => {
    const raw = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    codeInput.value = raw.length > 4 ? raw.slice(0, 4) + "-" + raw.slice(4) : raw;
  });
  const showErr = (m) => { err.textContent = m; err.classList.remove("hidden"); };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.classList.add("hidden");
    const surname = $("surname").value.trim();
    const code = codeInput.value.trim();
    if (!surname || code.replace(/[^A-Za-z0-9]/g, "").length !== 8) {
      showErr("Enter your athlete's surname and the 8-character access code.");
      return;
    }
    go.disabled = true;
    const label = go.firstChild.textContent;
    go.firstChild.textContent = "opening report ";
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ surname, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
      render(data);
      $("gate").classList.add("hidden");
      $("viewer").classList.remove("hidden");
      window.scrollTo(0, 0);
    } catch (ex) {
      showErr(ex.message);
    } finally {
      go.disabled = false;
      go.firstChild.textContent = label;
    }
  });

  $("close").addEventListener("click", () => {
    $("pages").innerHTML = "";
    $("viewer").classList.add("hidden");
    $("gate").classList.remove("hidden");
    codeInput.value = "";
    document.title = "Athlete Report · Warriors HPP";
  });

  $("pdf").addEventListener("click", async () => {
    try { await document.fonts.ready; } catch (_) {}
    window.print();
  });
  window.addEventListener("beforeprint", unfit);
  window.addEventListener("afterprint", fit);
})();
