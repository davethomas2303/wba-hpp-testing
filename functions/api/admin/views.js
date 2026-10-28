// GET /api/admin/views?token=...   (or header  Authorization: Bearer <token>)
// Returns a CSV of every athlete and whether their family has opened the report.
// Set the ADMIN_TOKEN secret in Cloudflare (see README). Without it, this is disabled.

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const supplied =
    (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") || url.searchParams.get("token") || "";
  if (!env.ADMIN_TOKEN || supplied !== env.ADMIN_TOKEN) {
    return new Response("Not found", { status: 404 });
  }

  const index = JSON.parse((await env.HPP_DATA.get("meta:index")) || "{}");
  const rows = [["Athlete", "Group", "Team", "Opened", "Times opened", "First opened", "Last opened"]];
  const entries = Object.entries(index).sort((a, b) =>
    (a[1].group + a[1].name).localeCompare(b[1].group + b[1].name)
  );
  for (const [hash, a] of entries) {
    const v = JSON.parse((await env.HPP_DATA.get(`view:${hash}`)) || "null");
    rows.push([a.name, a.group, a.team || "", v ? "Yes" : "No", v ? v.count : 0, v ? v.first : "", v ? v.last : ""]);
  }
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="hpp-report-views.csv"',
      "cache-control": "no-store",
    },
  });
}
