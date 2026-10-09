// ======================================================
// ÁNGELA PRO · GENERADOR DE IMÁGENES IA · FAL
// Archivo destino: /api/image.js
// Backend Vercel + fal.ai + FLUX.1 [schnell]
// Reemplaza la conexión anterior de Cloudflare.
// Usa la variable FAL_KEY ya configurada en Vercel.
// ======================================================

const IMAGE_MODEL = "fal-ai/flux/schnell";
const FAL_ENDPOINT = `https://fal.run/${IMAGE_MODEL}`;

function cors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
}

function responderError(res, status, mensaje, detalle = "") {
  return res.status(status).json({
    ok: false,
    error: mensaje,
    detail: detalle
  });
}

function texto(v) {
  return typeof v === "string" ? v.trim() : "";
}

function detectarAspecto(body = {}) {
  const raw = texto(
    body.aspectRatio ||
    body.aspecto ||
    body.ratio ||
    body.formato ||
    body.format ||
    "1:1"
  ).toLowerCase();

  // Tamaños moderados para que la prueba sea rápida y barata.
  if (raw.includes("9:16") || raw === "vertical") {
    return { width: 576, height: 1024 };
  }
  if (raw.includes("16:9") || raw === "horizontal") {
    return { width: 1024, height: 576 };
  }
  if (raw.includes("4:5")) {
    return { width: 768, height: 960 };
  }
  if (raw.includes("2:3")) {
    return { width: 768, height: 1152 };
  }
  if (raw.includes("3:2")) {
    return { width: 1152, height: 768 };
  }
  return { width: 1024, height: 1024 };
}

function construirPrompt(body = {}) {
  const pedido = texto(
    body.prompt ||
    body.text ||
    body.descripcion ||
    body.pedido ||
    body.originalPrompt
  );

  const uso = texto(
    body.uso ||
    body.use ||
    body.tipo ||
    body.task ||
    "general"
  ).toLowerCase();

  const transparente =
    body.transparent === true ||
    body.transparente === true ||
    body.fondoTransparente === true ||
    String(body.fondo || "").toLowerCase() === "transparente";

  let instrucciones = "";

  if (uso.includes("laser") || uso.includes("láser")) {
    instrucciones += `\nProfessional artwork for laser engraving. Pure white background. Strong clean black lines. Very high contrast. No unnecessary shadows or gradients. Avoid tiny details. Keep the full subject visible and centered.`;
  }

  if (uso.includes("fotograbado")) {
    instrucciones += `\nPrepare for photographic laser engraving: balanced grayscale, clear separation of highlights and shadows, sharp important details, natural faces, no crushed blacks, no blown highlights.`;
  }

  if (uso.includes("vector") || uso.includes("lineart") || uso.includes("line art")) {
    instrucciones += `\nClean vector-style line art, continuous defined contours, no photographic texture, no visual noise, no gradients, suitable for tracing and laser engraving.`;
  }

  if (uso.includes("sublim")) {
    instrucciones += `\nProfessional sublimation artwork, vivid separated colors, sharp details, balanced composition, full design inside the canvas, no product mockup unless requested.`;
  }

  if (uso.includes("dtf")) {
    instrucciones += `\nProfessional DTF artwork, clean defined edges, strong colors, high-resolution appearance, complete artwork visible, no mockup unless requested.`;
  }

  if (uso.includes("sticker")) {
    instrucciones += `\nProfessional sticker artwork, clear silhouette, clean defined edges, centered subject, no mockup unless requested.`;
  }

  if (uso.includes("redes") || uso.includes("social")) {
    instrucciones += `\nProfessional social-media composition, visually clear, balanced, strong focal point, readable at phone size.`;
  }

  if (transparente) {
    // FLUX Schnell no garantiza canal alfa real; pedimos sujeto aislado para
    // que ÁNGELA pueda quitar el fondo después si hace falta.
    instrucciones += `\nIsolate the main subject. No scenery or decorative background. Use a plain pure white background with strong separation from the subject so the background can be removed cleanly afterward.`;
  }

  const anchoMm = Number(body.widthMm || body.anchoMm || 0) || 0;
  const altoMm = Number(body.heightMm || body.altoMm || 0) || 0;
  if (anchoMm > 0 && altoMm > 0) {
    instrucciones += `\nIntended physical proportion approximately ${anchoMm} mm x ${altoMm} mm.`;
  }

  return `${pedido}\n\nPRODUCTION INSTRUCTIONS:${instrucciones}\nKeep all important elements completely inside the image. Do not add words, names, numbers, logos or text unless the user explicitly requests them. Do not crop the main subject. Create a clean, professional, well-defined composition.`.trim();
}

function extraerDetalleError(data, status) {
  if (!data) return `fal.ai respondió ${status}`;
  if (typeof data === "string") return data.slice(0, 700);
  return String(
    data.detail ||
    data.error ||
    data.message ||
    data.body ||
    `fal.ai respondió ${status}`
  ).slice(0, 700);
}

export default async function handler(req, res) {
  cors(req, res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const falKey = process.env.FAL_KEY;

  // Diagnóstico seguro: nunca devuelve la clave.
  if (req.method === "GET") {
    return res.status(200).json({
      ok: Boolean(falKey),
      module: "ÁNGELA Imágenes IA",
      provider: "fal.ai",
      model: IMAGE_MODEL,
      falConfigured: Boolean(falKey)
    });
  }

  if (req.method !== "POST") {
    return responderError(res, 405, "Método no permitido. Usá GET o POST.");
  }

  if (!falKey) {
    return responderError(
      res,
      500,
      "Falta FAL_KEY en Vercel.",
      "ÁNGELA Studio ya usa FAL_KEY para los otros motores; verificá que también esté disponible para Production."
    );
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : (req.body || {});

    const prompt = construirPrompt(body);
    if (!prompt || prompt.length < 3) {
      return responderError(res, 400, "Escribí qué imagen querés crear.");
    }

    const imageSize = detectarAspecto(body);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    let respuesta;
    try {
      respuesta = await fetch(FAL_ENDPOINT, {
        method: "POST",
        headers: {
          "Authorization": `Key ${falKey}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          prompt: prompt.slice(0, 12000),
          image_size: imageSize,
          num_inference_steps: 4,
          num_images: 1,
          enable_safety_checker: true,
          output_format: "png",
          acceleration: "none"
        }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    const raw = await respuesta.text();
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }

    if (!respuesta.ok) {
      return responderError(
        res,
        respuesta.status || 502,
        "No se pudo generar la imagen con fal.ai.",
        extraerDetalleError(data, respuesta.status)
      );
    }

    const image =
      data?.images?.[0] ||
      data?.data?.images?.[0] ||
      null;

    const imageUrl =
      image?.url ||
      data?.image?.url ||
      data?.url ||
      "";

    if (!imageUrl) {
      return responderError(
        res,
        502,
        "fal.ai respondió pero no devolvió una imagen.",
        typeof data === "string" ? data.slice(0, 900) : JSON.stringify(data).slice(0, 900)
      );
    }

    return res.status(200).json({
      ok: true,
      image: imageUrl,
      imageUrl: imageUrl,
      image_url: imageUrl,
      url: imageUrl,
      mimeType: image?.content_type || "image/png",
      width: image?.width || imageSize.width,
      height: image?.height || imageSize.height,
      model: IMAGE_MODEL,
      provider: "fal.ai",
      seed: data?.seed ?? null,
      has_nsfw_concepts: data?.has_nsfw_concepts ?? null
    });
  } catch (error) {
    const abortado = error?.name === "AbortError";
    console.error("ANGELA FAL IMAGE ERROR:", error);
    return responderError(
      res,
      abortado ? 504 : 500,
      abortado
        ? "El generador de imágenes tardó demasiado. Probá nuevamente."
        : "Error interno al generar la imagen.",
      error?.message || String(error)
    );
  }
}
