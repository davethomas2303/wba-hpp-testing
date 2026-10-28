// POST /api/admin/upload   (Authorization: Bearer <ADMIN_TOKEN>)
//   { action: "put", items: [{ key, value }, ...] }      write a batch of records (max 100)
//   { action: "finish", keep: ["key", ...] }               delete old athlete/team/coach keys not in `keep`
// Used by /admin to publish data/kv-bulk.json without the command line.

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const ALLOWED = /^(athlete|team|coach):[a-z0-9-]+$|^meta:(index|teams|session)$/;

export async function onRequestPost({ request, env }) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) return json({ error: "Not authorised." }, 401);
  if (!env.HPP_DATA) return json({ error: "The HPP_DATA store isn't bound to this site yet." }, 503);

  let body;
  try { body = await request.json(); } catch { return json({ error: "Bad request." }, 400); }

  if (body.action === "check") return json({ ok: true });

  if (body.action === "put") {
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length > 100) return json({ error: "Too many items in one batch." }, 400);
    for (const it of items) {
      if (!it || typeof it.key !== "string" || typeof it.value !== "string" || !ALLOWED.test(it.key))
        return json({ error: `Unexpected key: ${it && it.key}` }, 400);
    }
    for (const it of items) await env.HPP_DATA.put(it.key, it.value);
    return json({ ok: true, written: items.length });
  }

  if (body.action === "finish") {
    const keep = new Set(Array.isArray(body.keep) ? body.keep : []);
    if (!keep.has("meta:index")) return json({ error: "Missing key list." }, 400);
    let removed = 0;
    for (const prefix of ["athlete:", "team:", "coach:"]) {
      let cursor;
      do {
        const page = await env.HPP_DATA.list({ prefix, cursor });
        for (const k of page.keys) {
          if (!keep.has(k.name)) { await env.HPP_DATA.delete(k.name); removed++; }
        }
        cursor = page.list_complete ? null : page.cursor;
      } while (cursor);
    }
    return json({ ok: true, removed });
  }

  return json({ error: "Unknown action." }, 400);
}
