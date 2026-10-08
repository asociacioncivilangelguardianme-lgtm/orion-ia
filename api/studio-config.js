module.exports = function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const rawUrl = process.env.SUPABASE_URL || "";

  const url = rawUrl
    .replace(/\/rest\/v1\/?$/i, "")
    .replace(/\/+$/, "");

  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";

  if (!url || !key) {
    return res.status(500).json({
      error: "Falta configurar Supabase para STUDIO IA"
    });
  }

  res.setHeader("Cache-Control", "no-store");

  return res.status(200).json({
    ok: true,
    studio: "ANGELA STUDIO IA",
    url,
    key,
    publishableKey: key,
    buckets: {
      images: "studio-images",
      audio: "studio-audio",
      videos: "studio-videos",
      thumbnails: "studio-thumbnails",
      private: "studio-private"
    }
  });
};
