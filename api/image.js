// ÁNGELA STUDIO IA — api/image.js
// Compatible con Vercel (CommonJS) y @gradio/client.
// Requiere HF_TOKEN y @gradio/client en package.json.
const SPACE = 'black-forest-labs/FLUX.1-schnell';
const TIMEOUT_MS = 55000;
const SIZES = { '1:1':[1024,1024], '9:16':[576,1024], '16:9':[1024,576], '4:5':[768,960], '2:3':[672,1008] };

function reply(res, status, payload) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(payload);
}
function detailOf(error) {
  return String(error?.message || error || 'Error desconocido').slice(0, 700);
}
function extractImage(data) {
  const first = Array.isArray(data) ? data[0] : data;
  if (typeof first === 'string') return first;
  if (first && typeof first === 'object') {
    if (typeof first.url === 'string') return first.url;
    if (typeof first.path === 'string') return first.path;
    if (typeof first.image === 'string') return first.image;
    if (first.image && typeof first.image.url === 'string') return first.image.url;
  }
  return '';
}
function safeUrl(raw) {
  if (raw.startsWith('data:image/')) return raw;
  if (raw.startsWith('https://')) return raw;
  if (raw.startsWith('/')) return new URL(raw, 'https://black-forest-labs-flux-1-schnell.hf.space').href;
  throw new Error('Hugging Face no devolvió una dirección válida de imagen.');
}
async function withTimeout(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label + ': tiempo de espera agotado.')), ms); })
    ]);
  } finally { clearTimeout(timer); }
}
module.exports = async function handler(req, res) {
  if (req.method === 'GET') return reply(res, 200, {
    ok: true, version: 'ANGELA-IMAGE-3', provider: 'Hugging Face',
    space: SPACE, tokenConfigured: Boolean(process.env.HF_TOKEN),
    note: 'La ruta responde; la generación se comprueba con POST.'
  });
  if (req.method !== 'POST') return reply(res, 405, { ok: false, error: 'Método no permitido.' });
  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch { return reply(res, 400, { ok: false, error: 'El JSON recibido no es válido.' }); }
  const prompt = String(body.prompt || body.originalPrompt || '').trim();
  if (prompt.length < 3) return reply(res, 400, { ok: false, error: 'Falta la descripción de la imagen.' });
  if (!process.env.HF_TOKEN) return reply(res, 503, { ok: false, error: 'Falta HF_TOKEN en Vercel.' });
  const ratio = String(body.aspectRatio || body.formato || body.aspecto || '1:1');
  const [width, height] = SIZES[ratio] || SIZES['1:1'];
  try {
    let Client;
    try { ({ Client } = await import('@gradio/client')); }
    catch (err) { return reply(res, 503, { ok: false, error: 'Falta instalar @gradio/client en el proyecto de Vercel.', detail: detailOf(err) }); }
    const client = await withTimeout(Client.connect(SPACE, { hf_token: process.env.HF_TOKEN }), 18000, 'Conexión a Hugging Face');
    const args = { prompt, seed: 0, randomize_seed: true, width, height, num_inference_steps: 5 };
    let result;
    try {
      result = await withTimeout(client.predict('/infer', args), TIMEOUT_MS, 'Generación FLUX');
    } catch (err) {
      // Los endpoints de Spaces pueden cambiar; el diagnóstico queda visible.
      throw new Error('FLUX no pudo completar /infer. ' + detailOf(err));
    }
    const raw = extractImage(result?.data);
    if (!raw) throw new Error('FLUX respondió sin imagen. Respuesta: ' + JSON.stringify(result?.data || null).slice(0, 250));
    const url = safeUrl(raw);
    if (url.startsWith('data:image/')) return reply(res, 200, { ok: true, provider: 'Hugging Face FLUX.1-schnell', url });
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('No se pudo descargar la imagen: HTTP ' + response.status);
    const mime = (response.headers.get('content-type') || '').split(';')[0].trim();
    if (!mime.startsWith('image/')) throw new Error('El servidor devolvió contenido que no es una imagen.');
    const declaredSize = Number(response.headers.get('content-length') || 0);
    if (declaredSize > 9_000_000) throw new Error('La imagen supera el límite de 9 MB.');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 9_000_000) throw new Error('La imagen supera el límite de 9 MB.');
    return reply(res, 200, { ok: true, provider: 'Hugging Face FLUX.1-schnell', url: `data:${mime};base64,${bytes.toString('base64')}`, mime });
  } catch (err) {
    const detail = detailOf(err);
    console.error('ANGELA_IMAGE_ERROR:', detail);
    return reply(res, 502, { ok: false, error: 'No se pudo generar la imagen con FLUX.', detail });
  }
};
