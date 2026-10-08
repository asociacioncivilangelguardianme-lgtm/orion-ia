module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const rawUrl = process.env.SUPABASE_URL || "";

  const url = rawUrl
    .replace(/\/rest\/v1\/?$/i, "")
    .replace(/\/+$/, "");

  const secretKey = process.env.SUPABASE_SECRET_KEY || "";

  if (!url || !secretKey) {
    return res.status(500).json({
      ok: false,
      error: "Falta configurar SUPABASE_URL o SUPABASE_SECRET_KEY en Vercel"
    });
  }

  const headers = {
  apikey: secretKey
};

  const tables = [
    "studio_projects",
    "studio_channels",
    "studio_scripts",
    "studio_scenes",
    "studio_assets",
    "studio_jobs",
    "studio_publications",
    "studio_private_access"
  ];

  const expectedBuckets = [
    "studio-images",
    "studio-audio",
    "studio-videos",
    "studio-thumbnails",
    "studio-private"
  ];

  async function checkTable(table) {
    try {
      const r = await fetch(
        `${url}/rest/v1/${encodeURIComponent(table)}?select=*&limit=1`,
        {
          method: "GET",
          headers,
          cache: "no-store"
        }
      );

      return {
        name: table,
        ok: r.ok,
        status: r.status
      };
    } catch {
      return {
        name: table,
        ok: false,
        status: 0
      };
    }
  }

  try {
    const tableResults = await Promise.all(
      tables.map(checkTable)
    );

    let bucketResults = expectedBuckets.map(name => ({
      name,
      ok: false
    }));

    try {
      const r = await fetch(`${url}/storage/v1/bucket`, {
        method: "GET",
        headers,
        cache: "no-store"
      });

      if (r.ok) {
        const data = await r.json();

        const existing = new Set(
          (Array.isArray(data) ? data : [])
            .map(b => b?.name)
            .filter(Boolean)
        );

        bucketResults = expectedBuckets.map(name => ({
          name,
          ok: existing.has(name)
        }));
      }
    } catch {}

    const missingTables = tableResults
      .filter(x => !x.ok)
      .map(x => x.name);

    const missingBuckets = bucketResults
      .filter(x => !x.ok)
      .map(x => x.name);

    const ok =
      missingTables.length === 0 &&
      missingBuckets.length === 0;

    res.setHeader("Cache-Control", "no-store");

    return res.status(200).json({
      ok,
      studio: "ANGELA STUDIO IA",
      supabase: true,
      tables: tableResults,
      buckets: bucketResults,
      missingTables,
      missingBuckets,
      privateStorageReady:
        bucketResults.find(x => x.name === "studio-private")?.ok || false
    });

  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "No se pudo verificar STUDIO IA"
    });
  }
};
