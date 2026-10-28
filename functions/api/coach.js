// POST /api/coach  { code, team? }  ->  { teams: [allowed teams], team: one team's squad data }
// A coach code opens that coach's team. The ADMIN_TOKEN opens every team and age group.

const MAX_FAILS = 8;
const WINDOW_SECONDS = 900;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequestPost({ request, env }) {
  const kv = env.HPP_DATA;
  if (!kv) return json({ error: "The report store isn't connected yet." }, 503);

  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const rlKey = `rl:${await sha256(ip)}`;
  const fails = parseInt((await kv.get(rlKey)) || "0", 10);
  if (fails >= MAX_FAILS) return json({ error: "Too many attempts. Please wait 15 minutes and try again." }, 429);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Something went wrong. Please try again." }, 400);
  }
  const raw = String(body.code || "").trim();
  const index = JSON.parse((await kv.get("meta:teams")) || "[]");

  let allowed = null;
  if (env.ADMIN_TOKEN && raw && raw === env.ADMIN_TOKEN) {
    allowed = index.map((t) => t.slug);
  } else {
    const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length === 8) {
      const rec = JSON.parse((await kv.get(`coach:${await sha256(code)}`)) || "null");
      if (rec) allowed = rec.teams.filter((s) => index.some((t) => t.slug === s));
    }
  }
  if (!allowed || !allowed.length) {
    await kv.put(rlKey, String(fails + 1), { expirationTtl: WINDOW_SECONDS });
    return json({ error: "That coach code doesn't match. Check the code the club sent you." }, 401);
  }

  const slug = body.team && allowed.includes(body.team) ? body.team : allowed[0];
  const team = JSON.parse((await kv.get(`team:${slug}`)) || "null");
  if (!team) return json({ error: "That team couldn't be found." }, 404);

  return json({ teams: index.filter((t) => allowed.includes(t.slug)), team, admin: allowed.length > 1 });
}
