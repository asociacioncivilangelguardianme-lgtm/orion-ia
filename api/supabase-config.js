module.exports = function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const url = process.env.SUPABASE_URL || "";
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";

  if (!url || !key) {
    return res.status(500).json({
      error: "Falta configurar Supabase en Vercel"
    });
  }

  res.setHeader("Cache-Control", "no-store");

  return res.status(200).json({
    url: url,
    key: key,
    publishableKey: key,
    bucket: "eventos-qr"
  });
};
