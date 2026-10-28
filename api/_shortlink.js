// ÁNGELA · Link corto de los Regalos QR: /r/AAMMDDcodigo
// El guion bajo del nombre hace que Vercel no lo cuente como función aparte
// (el plan gratis permite 12): lo usa api/supabase-config.js cuando llega ?r=
// Abre el regalo guardado en Supabase y, cuando se comparte por WhatsApp o redes,
// muestra el título del regalo con la imagen de ÁNGELA en la vista previa.
const PROJECT_URL = 'https://xbbmqfapcfqndwanfkvh.supabase.co';
const BUCKET = 'eventos-qr';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = async function shortLink(req, res) {
  const code = String((req.query && (req.query.r || req.query.c)) || '').toLowerCase();
  const m = code.match(/^(\d{2})(\d{2})(\d{2})([a-z0-9]{6,16})$/);
  if (!m) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><p style="font-family:Arial;text-align:center;padding:60px 20px">Este link de regalo no es válido.</p>');
  }
  const base = String(process.env.SUPABASE_URL || PROJECT_URL).replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
  const day = `20${m[1]}-${m[2]}-${m[3]}`;
  const publicUrl = `${base}/storage/v1/object/public/${BUCKET}/regalos/${day}/${m[4]}/index.html`;

  let title = 'Tenés una sorpresa 🎁';
  try {
    const r = await fetch(publicUrl, { headers: { Range: 'bytes=0-6000' } });
    if (r.ok || r.status === 206) {
      const head = Buffer.from(await r.arrayBuffer()).toString('utf8');
      const t = head.match(/<title>([^<]{1,140})<\/title>/i);
      if (t) title = t[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    } else if (r.status === 404 || r.status === 400) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><p style="font-family:Arial;text-align:center;padding:60px 20px">No encontramos este regalo. Puede que lo hayan borrado.</p>');
    }
  } catch (_) { /* si no responde, igual se intenta abrir desde el celular */ }

  const host = req.headers['x-forwarded-host'] || req.headers.host || 'orion-ia-sooty.vercel.app';
  const origin = `https://${host}`;
  const img = `${origin}/icon-512.png`;
  const desc = 'Tocá para abrir tu sorpresa. Hecho con ÁNGELA 👼';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.end(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(img)}"><meta property="og:image:width" content="512"><meta property="og:image:height" content="512">
<meta property="og:url" content="${esc(origin + '/r/' + code)}"><meta name="twitter:card" content="summary"><meta name="description" content="${esc(desc)}">
</head><body style="margin:0;font-family:Georgia,serif;background:#fff7ed;color:#7c2d12">
<p id="m" style="text-align:center;padding:60px 20px;font-size:20px">🎁 Abriendo tu regalo…</p>
<script>
(async () => {
  const m = document.getElementById('m');
  try {
    const r = await fetch(${JSON.stringify(publicUrl)}, { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    const html = new TextDecoder('utf-8').decode(await r.arrayBuffer());
    document.open(); document.write(html); document.close();
  } catch (e) {
    m.textContent = 'No se pudo abrir el regalo. Probá de nuevo en un rato.';
  }
})();
</script></body></html>`);
};
