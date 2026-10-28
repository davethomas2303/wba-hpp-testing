/* Warriors HPP: shared logic for the athlete report and the coach view.
   Bands, athlete profile type, radar chart, retest goal and attempt insights. */
(function () {
  "use strict";

  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const TESTS = [
    { k: "vj", name: "Vertical jump", short: "Vert jump", q: "Explosive power", unit: "cm", higher: true, dp: 1 },
    { k: "bj", name: "Broad jump", short: "Broad jump", q: "Horizontal power", unit: "cm", higher: true, dp: 1 },
    { k: "sprint", name: "20 m sprint", short: "Sprint", q: "Acceleration & speed", unit: "sec", higher: false, dp: 2 },
    { k: "yoyo", name: "Yo-Yo test", short: "Yo-Yo", q: "Repeat-effort fitness", unit: "level", higher: true, dp: 1 },
  ];
  const T = Object.fromEntries(TESTS.map((t) => [t.k, t]));

  // ---------------------------------------------------------------- bands
  // Based on how far a result sits from the age-group average, in age-group spreads (z).
  // Roughly: Building ~30% of athletes, On track ~40%, Strong ~20%, Standout ~10%.
  const BANDS = [
    { key: "building", name: "Building", lo: -Infinity, hi: -0.5, desc: "Below the age-group average." },
    { key: "ontrack", name: "On track", lo: -0.5, hi: 0.5, desc: "Around the age-group average." },
    { key: "strong", name: "Strong", lo: 0.5, hi: 1.25, desc: "Clearly above the age-group average." },
    { key: "standout", name: "Standout", lo: 1.25, hi: Infinity, desc: "Well above the age-group average." },
  ];
  const bandOf = (z) => (z == null ? null : BANDS.find((b) => z >= b.lo && z < b.hi));
  const bandIdx = (b) => BANDS.indexOf(b);

  // value at a given z for a test
  const valueAtZ = (t, d, z) => (t.higher ? d.ageAvg + z * d.ageSd : d.ageAvg - z * d.ageSd);

  // ---------------------------------------------------------------- qualities & type
  function qualities(tests) {
    const z = (k) => (tests[k] && tests[k].value != null && tests[k].z != null ? tests[k].z : null);
    const pw = [z("vj"), z("bj")].filter((v) => v != null);
    return { power: pw.length ? pw.reduce((a, b) => a + b, 0) / pw.length : null, speed: z("sprint"), engine: z("yoyo") };
  }
  const Q_NAME = { power: "power", speed: "speed", engine: "repeat-effort fitness" };

  function profileType(Q) {
    const ent = Object.entries(Q).filter(([, v]) => v != null).sort((a, b) => b[1] - a[1]);
    if (ent.length < 2) return { key: "partial", name: "Profile in progress", top: ent[0] && ent[0][0], low: null };
    const vals = ent.map((e) => e[1]);
    const max = vals[0], min = vals[vals.length - 1], mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const top = ent[0][0], low = ent[ent.length - 1][0];
    if (min >= 0.5) return { key: mean >= 1.25 ? "standoutall" : "allround", name: mean >= 1.25 ? "Standout all-rounder" : "All-round athlete", top, low };
    if (max < -0.5) return { key: "developing", name: "Developing all-rounder", top, low };
    if (max - min < 0.6) return { key: "balanced", name: "Balanced athlete", top, low };
    if (Q.power != null && Q.speed != null && Q.engine != null && low === "engine" && Math.min(Q.power, Q.speed) - Q.engine >= 0.6)
      return { key: "explosive", name: "Explosive athlete", top, low };
    const names = { power: "Power athlete", speed: "Speed athlete", engine: "The engine" };
    return { key: top, name: names[top], top, low };
  }

  // Athlete wording. p = {first, he, his, him, cmp}
  function profileText(type, p) {
    const F = esc(p.first), He = p.he.charAt(0).toUpperCase() + p.he.slice(1);
    const low = type.low ? Q_NAME[type.low] : "";
    switch (type.key) {
      case "standoutall":
        return `${F} is well above the ${esc(p.cmp)} average across the board. Power, speed and fitness together like this is rare at any age and carries over to every sport. The aim now is to keep all four growing together, with ${low} the one to watch.`;
      case "allround":
        return `${F} is above the ${esc(p.cmp)} average in every quality we tested. That mix of power, speed and fitness carries over to any sport. ${He} has no weak link to fix, so the aim is to keep building all four together.`;
      case "developing":
        return `${F}'s results sit below the ${esc(p.cmp)} average right now, which is common for younger athletes and those yet to hit a growth spurt. Every one of these qualities is very trainable, and athletes at this stage often make the biggest jumps by the retest.`;
      case "balanced":
        return `${F}'s four qualities sit at a similar level, with no big gaps between them. A balanced base is a great platform: lifting any one quality lifts ${p.his} whole game.`;
      case "explosive":
        return `Power and speed are ${F}'s strengths: quick off the mark and strong in the air. Building ${p.his} repeat-effort fitness will let ${p.him} use those strengths for the whole game, not just the first quarter.`;
      case "power":
        return `${F}'s jumps are ${p.his} standout. ${He} produces force well, which shows up in rebounding, finishing and contesting. Lifting ${p.his} ${low} is the next step to turn that power into more impact.`;
      case "speed":
        return `${F}'s speed off the mark is ${p.his} standout. ${He} accelerates well, which shows up in beating a defender and running the floor. Lifting ${p.his} ${low} is the next step.`;
      case "engine":
        return `Fitness is ${F}'s standout: ${p.he} can keep working hard when others start to fade. Building ${p.his} ${low} will turn that engine into more impact in every contest.`;
      default:
        return `${F} didn't complete enough tests on the day for a full profile. It will fill in at the mid-season retest.`;
    }
  }

  // Team wording
  function teamProfileText(type) {
    const low = type.low ? Q_NAME[type.low] : "";
    return {
      standoutall: `Well above the age-group average across all four qualities. Keep every quality moving, with ${low} the one to watch.`,
      allround: `Above the age-group average in every quality. No weak link: keep building all four together.`,
      developing: `Below the age-group average across the board, often a younger or later-maturing group. Everything here is very trainable.`,
      balanced: `All four qualities sit at a similar level. Lifting any one of them lifts the whole squad.`,
      explosive: `Quick and powerful, but repeat-effort fitness lags. Conditioning will let the squad use that speed and power for four quarters.`,
      power: `Jumping power is the squad's strength. ${low.charAt(0).toUpperCase() + low.slice(1)} is the biggest opportunity.`,
      speed: `Speed off the mark is the squad's strength. ${low.charAt(0).toUpperCase() + low.slice(1)} is the biggest opportunity.`,
      engine: `Fitness is the squad's strength. ${low.charAt(0).toUpperCase() + low.slice(1)} is the biggest opportunity.`,
      partial: `Not enough results for a full squad profile yet.`,
    }[type.key];
  }

  // ---------------------------------------------------------------- formatting
  const fmt = (n, dp) => (n == null ? "" : Number(n).toFixed(dp).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1"));
  function fmtVal(k, v) {
    if (v == null) return "";
    if (k === "sprint") return Number(v).toFixed(2);
    if (k === "yoyo") return Number(v).toFixed(1);
    return fmt(v, 1);
  }

  // ---------------------------------------------------------------- retest goal
  const MAX_STEP = { vj: 4, bj: 12, sprint: 0.15, yoyo: 1 };
  const MIN_STEP = { vj: 1, bj: 3, sprint: 0.04, yoyo: 0.2 };

  function roundTarget(k, v, higher) {
    if (k === "vj") return Math.ceil(v * 2) / 2;
    if (k === "bj") return Math.ceil(v);
    if (k === "sprint") return Math.floor(v * 100) / 100;
    // Yo-Yo is level.shuttle: round up to the next shuttle (x.1 .. x.8)
    let lvl = Math.floor(v), sh = Math.ceil(Math.round((v - lvl) * 100) / 10);
    if (sh < 1) sh = 1;
    if (sh > 8) { lvl += 1; sh = 1; }
    return lvl + sh / 10;
  }

  /** The one goal for the retest: the athlete's focus test, aimed at the next band up. */
  function retestGoal(tests) {
    const rows = TESTS.map((t) => ({ t, d: tests[t.k] })).filter((x) => x.d && x.d.value != null && x.d.z != null && x.d.ageSd);
    if (!rows.length) return null;
    rows.sort((a, b) => a.d.z - b.d.z);
    const { t, d } = rows[0];
    const band = bandOf(d.z), idx = bandIdx(band);
    const dir = t.higher ? 1 : -1;
    let target, next = null, reach = true;
    if (idx < BANDS.length - 1) {
      next = BANDS[idx + 1];
      const need = valueAtZ(t, d, next.lo);
      let gap = (need - d.value) * dir;
      if (gap < MIN_STEP[t.k]) gap = MIN_STEP[t.k];
      if (gap > MAX_STEP[t.k]) { gap = MAX_STEP[t.k]; reach = false; }
      target = roundTarget(t.k, d.value + gap * dir, t.higher);
      if (!reach) target = roundTarget(t.k, d.value + gap * dir, t.higher);
    } else {
      target = roundTarget(t.k, d.value + MIN_STEP[t.k] * dir, t.higher);
    }
    if (t.k === "sprint" && target >= d.value) target = Math.round((d.value - 0.01) * 100) / 100;
    const gain = Math.abs(target - d.value);
    const gainText =
      t.k === "sprint" ? `${gain.toFixed(2)}\u00a0s faster` : t.k === "yoyo" ? `up from ${fmtVal("yoyo", d.value)}` : `+${fmt(gain, 1)}\u00a0cm`;
    return {
      k: t.k, name: t.name, unit: t.unit, band, next, reach,
      now: fmtVal(t.k, d.value), target: fmtVal(t.k, target), gainText,
    };
  }

  // ---------------------------------------------------------------- attempt insight
  const BIG_GAP = { vj: 4, bj: 12, sprint: 0.15 };
  function triesInsight(tests, p) {
    const F = esc(p.first);
    const rows = ["vj", "bj", "sprint"]
      .map((k) => ({ k, t: T[k], tries: ((tests[k] && tests[k].tries) || []).filter((v) => v != null) }))
      .filter((x) => x.tries.length >= 2);
    if (!rows.length) return null;
    const show = (x) => x.tries.map((v) => fmtVal(x.k, v)).join(" → ");
    // 1. biggest gap between attempts
    const gaps = rows.map((x) => ({ ...x, gap: Math.max(...x.tries) - Math.min(...x.tries) })).sort((a, b) => b.gap / BIG_GAP[b.k] - a.gap / BIG_GAP[a.k]);
    const g = gaps[0];
    if (g.gap >= BIG_GAP[g.k]) {
      const gapTxt = g.k === "sprint" ? `${g.gap.toFixed(2)}\u00a0s` : `${fmt(g.gap, 1)}\u00a0cm`;
      return { title: "Technique is the quick win", text: `${F}'s ${g.t.name.toLowerCase()} attempts were ${show(g)}, a gap of ${gapTxt}. When results move around that much between tries, a cleaner, more repeatable technique is usually the fastest way to a better score.` };
    }
    // 2. improved on every attempt
    const better = (k, a, b) => (T[k].higher ? b > a : b < a);
    const climb = rows.filter((x) => x.tries.length === 3 && better(x.k, x.tries[0], x.tries[1]) && better(x.k, x.tries[1], x.tries[2]));
    if (climb.length) {
      const x = climb[0];
      return { title: "Still finding the technique", text: `${F} improved on every ${x.t.name.toLowerCase()} attempt (${show(x)}), so ${p.he} was still getting the hang of it. Expect quick gains once the movement feels familiar.` };
    }
    // 3. best on the first try everywhere
    const firstBest = rows.filter((x) => x.tries[0] === (T[x.k].higher ? Math.max(...x.tries) : Math.min(...x.tries)));
    if (firstBest.length === rows.length && rows.length >= 2) {
      return { title: "Best effort first", text: `${F} produced ${p.his} best result on the first attempt in every test. A proper warm-up and a practice rep before the real thing should help ${p.him} show more at the retest.` };
    }
    return { title: "Consistent technique", text: `${F}'s attempts were close together in every test, a sign of a reliable, repeatable technique. Gains from here will mostly come from building strength, power and fitness.` };
  }

  // ---------------------------------------------------------------- radar
  const AX = [
    { k: "vj", ang: -90, label: "Vertical jump" },
    { k: "bj", ang: 0, label: "Broad jump" },
    { k: "sprint", ang: 90, label: "20 m sprint" },
    { k: "yoyo", ang: 180, label: "Yo-Yo test" },
  ];
  const zr = (z) => Math.max(0.05, Math.min(1, (z + 2.25) / 4.5));

  /** series: [{ z: {vj,bj,sprint,yoyo}, cls: "me"|"team"|"cmp" }]; labels: {k: {value, band}} */
  function radar(series, labels, opts = {}) {
    const W = opts.w || 520, H = opts.h || 450, cx = W / 2, cy = H / 2 + 2, R = opts.r || 140;
    const pt = (ang, rr) => [cx + Math.cos((ang * Math.PI) / 180) * rr, cy + Math.sin((ang * Math.PI) / 180) * rr];
    const ring = (f) => AX.map((a) => pt(a.ang, R * f).map((n) => n.toFixed(1)).join(",")).join(" ");
    let s = `<svg class="radar" viewBox="0 0 ${W} ${H}" role="img" aria-label="Athlete profile chart">`;
    // band zones, outside in
    const zones = [["standout", 1], ["strong", zr(1.25)], ["ontrack", zr(0.5)], ["building", zr(-0.5)]];
    zones.forEach(([k, f]) => (s += `<polygon class="z-${k}" points="${ring(f)}"/>`));
    AX.forEach((a) => { const [x, y] = pt(a.ang, R); s += `<line class="axis" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; });
    s += `<polygon class="avg" points="${ring(zr(0))}"/>`;
    series.forEach((ser) => {
      const pts = AX.filter((a) => ser.z[a.k] != null).map((a) => pt(a.ang, R * zr(ser.z[a.k])));
      if (pts.length >= 3) s += `<polygon class="shape ${ser.cls}" points="${pts.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ")}"/>`;
      else if (pts.length === 2) s += `<polyline class="shape ${ser.cls}" points="${pts.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ")}"/>`;
      if (ser.cls !== "cmp") pts.forEach(([x, y]) => (s += `<circle class="dot ${ser.cls}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6"/>`));
    });
    AX.forEach((a) => {
      const L = (labels && labels[a.k]) || {};
      let [x, y] = pt(a.ang, R + 14);
      let anchor = "middle", dy = 0;
      if (a.ang === 0) anchor = "start";
      if (a.ang === 180) anchor = "end";
      if (a.ang === -90) dy = -46;
      if (a.ang === 90) dy = 2;
      if (a.ang === 0 || a.ang === 180) dy = -18;
      const yy = y + dy;
      s += `<text class="al" text-anchor="${anchor}" x="${x.toFixed(1)}" y="${(yy + 13).toFixed(1)}">${a.label}</text>`;
      if (L.value != null) s += `<text class="av" text-anchor="${anchor}" x="${x.toFixed(1)}" y="${(yy + 30).toFixed(1)}">${esc(L.value)}</text>`;
      s += `<text class="ab b-${L.band ? L.band.key : "none"}" text-anchor="${anchor}" x="${x.toFixed(1)}" y="${(yy + 46).toFixed(1)}">${L.band ? L.band.name.toUpperCase() : "NOT TESTED"}</text>`;
    });
    return s + "</svg>";
  }

  window.HPP = { esc, fmt, fmtVal, TESTS, T, BANDS, bandOf, bandIdx, valueAtZ, qualities, profileType, profileText, teamProfileText, retestGoal, triesInsight, radar, Q_NAME };
})();
