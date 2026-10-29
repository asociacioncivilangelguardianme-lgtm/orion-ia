const shortLink = require("./_shortlink.js");

module.exports = function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  // Link corto de los Regalos QR (/r/código llega acá con ?r=código)
  if (req.query && req.query.r) {
    return shortLink(req, res);
  }

  // Meta en vivo de las campañas del comedor (?camp=ID)
  if (req.query && req.query.camp) {
    return shortLink.campaign(req, res);
  }

  // Sincronización entre aparatos (?sync=ID): devuelve la última copia cifrada
  if (req.query && req.query.sync) {
    return shortLink.sync(req, res);
  }

  // Estudio Web: traer una página pública (?page=URL) o controlar enlaces (?checks=a|b|c)
  if (req.query && req.query.page) {
    return shortLink.page(req, res);
  }
  if (req.query && req.query.checks) {
    return shortLink.checks(req, res);
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
      error: "Falta configurar Supabase en Vercel"
    });
  }

  res.setHeader("Cache-Control", "no-store");

  return res.status(200).json({
    url,
    key,
    publishableKey: key,
    bucket: "eventos-qr"
  });
};
