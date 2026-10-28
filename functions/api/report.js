// POST /api/report  { surname, code }  ->  one athlete's report data
// The athlete records live in the HPP_DATA KV namespace, keyed by a hash of the
// access code, so the code itself is never stored and nothing can be listed.

const MAX_FAILS = 8;          // wrong attempts allowed per IP ...
const WINDOW_SECONDS = 900;   // ... per 15 minutes

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const surnameKey = (s) =>
  String(s || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequestPost({ request, env }) {
  const kv = env.HPP_DATA;
  if (!kv) return json({ error: "The report store isn't connected yet. Please let the club know." }, 503);

  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const rlKey = `rl:${await sha256(ip)}`;
  const fails = parseInt((await kv.get(rlKey)) || "0", 10);
  if (fails >= MAX_FAILS) {
    return json({ error: "Too many attempts. Please wait 15 minutes and try again, or contact the club for your code." }, 429);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Something went wrong. Please try again." }, 400);
  }
  const code = String(body.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const surname = surnameKey(body.surname);
  if (code.length !== 8 || !surname) {
    return json({ error: "Enter your athlete's surname and the 8-character access code." }, 400);
  }

  const hash = await sha256(code);
  const raw = await kv.get(`athlete:${hash}`);
  let record = raw ? JSON.parse(raw) : null;

  // Only codes in the latest upload are valid: a replaced code drops out of the index.
  if (record) {
    const index = JSON.parse((await kv.get("meta:index", { cacheTtl: 60 })) || "{}");
    if (!index[hash]) record = null;
  }

  if (!record || surnameKey(record.surname) !== surname) {
    await kv.put(rlKey, String(fails + 1), { expirationTtl: WINDOW_SECONDS });
    return json({ error: "That surname and access code don't match. Check the code in your email and try again." }, 401);
  }

  // Light view log so the club can see who has opened their report.
  try {
    const vKey = `view:${hash}`;
    const prev = JSON.parse((await kv.get(vKey)) || "null") || { count: 0, first: new Date().toISOString() };
    await kv.put(vKey, JSON.stringify({ ...prev, count: prev.count + 1, last: new Date().toISOString() }));
  } catch (_) {
    /* never block a parent because logging failed */
  }

  return json(record);
}
