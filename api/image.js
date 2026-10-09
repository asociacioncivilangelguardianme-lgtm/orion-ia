// ÁNGELA - conexión de imágenes Hugging Face / FLUX.1-schnell
// Archivo completo para api/image.js. Versión ESM-2. No requiere editar otras partes de ÁNGELA.
const SPACE = 'black-forest-labs/FLUX.1-schnell';
function send(res, status, data) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(data);
}
module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return send(res, 200, {
      ok: true,
      version: 'ESM-2',
      provider: 'Hugging Face',
      space: SPACE,
      tokenConfigured: Boolean(process.env.HF_TOKEN),
      note: 'La ruta responde. Esto no prueba la generación de imágenes.'
    });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'Método no permitido' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const prompt = String(body.prompt || body.originalPrompt || '').trim();
    if (prompt.length < 3) return send(res, 400, { error: 'Escribí una descripción para la imagen.' });
    if (!process.env.HF_TOKEN) return send(res, 503, { error: 'Falta HF_TOKEN en las variables de Vercel.' });
    let Client;
    try {
      ({ Client } = await import('@gradio/client'));
    } catch (err) {
      return send(res, 503, { error: 'Vercel no pudo cargar @gradio/client.', detail: String(err.message || err).slice(0, 300) });
    }
    const sizes = { '1:1': [1024, 1024], '9:16': [576, 1024], '16:9': [1024, 576], '4:5': [768, 960], '2:3': [672, 1008] };
    const ratio = String(body.aspectRatio || body.formato || body.aspecto || '1:1');
    const [width, height] = sizes[ratio] || sizes['1:1'];
    const client = await Client.connect(SPACE, { hf_token: process.env.HF_TOKEN });
    const result = await client.predict('/infer', { prompt, seed: 0, randomize_seed: true, width, height, num_inference_steps: 5 });
    const item = result && result.data && result.data[0];
    let url = typeof item === 'string' ? item : (item && (item.url || item.path)) || '';
    if (url.startsWith('/')) url = 'https://black-forest-labs-flux-1-schnell.hf.space' + url;
    if (!/^https:\/\//.test(url)) throw new Error('El Space no devolvió una URL de imagen válida.');
    const response = await fetch(url, { signal: AbortSignal.timeout(18000) });
    if (!response.ok) throw new Error('No se pudo descargar la imagen: HTTP ' + response.status);
    const mime = (response.headers.get('content-type') || 'image/webp').split(';')[0];
    if (!mime.startsWith('image/')) throw new Error('La respuesta del Space no es una imagen.');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 9000000) throw new Error('La imagen es demasiado grande.');
    return send(res, 200, { ok: true, provider: 'Hugging Face FLUX.1-schnell', url: 'data:' + mime + ';base64,' + bytes.toString('base64'), mime });
  } catch (err) {
    const detail = String(err && err.message || err || 'Error desconocido').slice(0, 350);
    console.error('ANGELA_IMAGE_ERROR:', detail);
    return send(res, 502, { error: 'No se pudo generar la imagen.', detail });
  }
};
