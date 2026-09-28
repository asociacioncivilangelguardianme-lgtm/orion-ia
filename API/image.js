// ======================================================
// ÁNGELA PRO · GENERADOR DE IMÁGENES IA
// Archivo: /API/image.js
// Backend Vercel + Gemini
// ======================================================

const IMAGE_MODEL =
  process.env.GEMINI_IMAGE_MODEL ||
  "gemini-2.5-flash-image";

function cors(req, res) {
  const permitido = process.env.ALLOWED_ORIGIN || "*";

  res.setHeader("Access-Control-Allow-Origin", permitido);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
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

function normalizarAspecto(valor) {
  const permitidos = [
    "1:1",
    "2:3",
    "3:2",
    "3:4",
    "4:3",
    "4:5",
    "5:4",
    "9:16",
    "16:9",
    "21:9"
  ];

  return permitidos.includes(valor) ? valor : "1:1";
}

function construirPrompt(body) {
  const pedido =
    body.prompt ||
    body.text ||
    body.descripcion ||
    body.pedido ||
    "";

  const uso = String(
    body.uso ||
    body.tipo ||
    "general"
  ).toLowerCase();

  const fondoTransparente =
    body.transparent === true ||
    body.fondoTransparente === true ||
    body.fondo === "transparente";

  let instrucciones = "";

  // ==============================================
  // GRABADO LÁSER
  // ==============================================

  if (
    uso.includes("laser") ||
    uso.includes("láser")
  ) {
    instrucciones = `
La imagen será utilizada para grabado láser.

Crear un diseño extremadamente limpio y bien definido.
Usar alto contraste.
Evitar detalles diminutos que puedan desaparecer al grabar.
Utilizar contornos claros y perfectamente distinguibles.
No utilizar sombras innecesarias.
No utilizar degradados complejos.
Mantener el motivo principal perfectamente reconocible.
Preparar profesionalmente la composición para grabado láser.
`;
  }

  // ==============================================
  // FOTOGRABADO
  // ==============================================

  else if (
    uso.includes("fotograbado") ||
    uso.includes("foto grabado")
  ) {
    instrucciones = `
Preparar la composición para fotograbado láser.

Excelente separación entre luces y sombras.
Escala tonal clara.
Rostros y detalles principales muy definidos.
Evitar negros empastados.
Evitar blancos quemados.
Mantener alta nitidez.
Conservar rasgos naturales cuando existan personas.
`;
  }

  // ==============================================
  // VECTOR / LINE ART
  // ==============================================

  else if (
    uso.includes("vector") ||
    uso.includes("lineart") ||
    uso.includes("line art")
  ) {
    instrucciones = `
Crear un diseño estilo vectorial limpio.

Utilizar líneas fuertes, claras y continuas.
Fondo limpio.
Sin ruido.
Sin sombras fotográficas.
Sin texturas innecesarias.
Preparado para posterior vectorización o grabado.
`;
  }

  // ==============================================
  // SUBLIMACIÓN
  // ==============================================

  else if (uso.includes("sublim")) {
    instrucciones = `
Crear una imagen profesional para sublimación.

Colores definidos y vivos.
Muy buena nitidez.
Composición limpia.
Alta calidad visual.
Mantener todos los elementos importantes dentro del diseño.
`;
  }

  // ==============================================
  // DTF
  // ==============================================

  else if (uso.includes("dtf")) {
    instrucciones = `
Crear un diseño profesional para impresión DTF.

Contornos perfectamente definidos.
Colores sólidos y claros.
Composición apta para estampar en prendas.
Mantener el diseño principal completamente visible.
`;
  }

  // ==============================================
  // STICKERS
  // ==============================================

  else if (uso.includes("sticker")) {
    instrucciones = `
Crear un diseño profesional para sticker.

Silueta clara.
Bordes perfectamente definidos.
Elemento principal completamente visible.
Composición limpia y preparada para recorte.
`;
  }

  // ==============================================
  // REDES SOCIALES
  // ==============================================

  else if (
    uso.includes("redes") ||
    uso.includes("instagram") ||
    uso.includes("facebook")
  ) {
    instrucciones = `
Crear una imagen profesional para redes sociales.

Composición visual equilibrada.
Elementos principales claramente visibles.
Excelente legibilidad.
Diseño limpio y atractivo.
`;
  }

  // ==============================================
  // FONDO TRANSPARENTE
  // ==============================================

  if (fondoTransparente) {
    instrucciones += `
El usuario solicita fondo transparente.

El elemento principal debe quedar aislado y limpio.
No agregar escenario.
No agregar fondos decorativos.
Mantener bordes definidos alrededor del elemento principal.
`;
  }

  return `
${pedido}

${instrucciones}

Respetar exactamente el tema solicitado por el usuario.
No agregar palabras, nombres ni textos que el usuario no haya solicitado.
Mantener todos los elementos importantes dentro de los límites de la imagen.
Crear una imagen de buena calidad y claramente definida.
`;
}

// ======================================================
// FUNCIÓN PRINCIPAL
// ======================================================

export default async function handler(req, res) {
  cors(req, res);

  // Respuesta CORS
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Solamente POST
  if (req.method !== "POST") {
    return responderError(
      res,
      405,
      "Método no permitido. Usá POST."
    );
  }

  // Utiliza la misma clave de Gemini configurada
  // en Vercel para ÁNGELA.
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return responderError(
      res,
      500,
      "Falta GEMINI_API_KEY en Vercel."
    );
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : (req.body || {});

    const prompt = construirPrompt(body).trim();

    if (!prompt) {
      return responderError(
        res,
        400,
        "Escribí qué imagen querés crear."
      );
    }

    const aspecto = normalizarAspecto(
      body.aspectRatio ||
      body.aspect_ratio ||
      body.formato ||
      "1:1"
    );

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${encodeURIComponent(IMAGE_MODEL)}:generateContent`;

    const solicitud = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: prompt
            }
          ]
        }
      ],

      generationConfig: {
        responseModalities: [
          "TEXT",
          "IMAGE"
        ]
      }
    };

    const respuesta = await fetch(url, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },

      body: JSON.stringify(solicitud)
    });

    const data = await respuesta.json();

    if (!respuesta.ok) {
      const mensajeGoogle =
        data?.error?.message ||
        `Gemini respondió ${respuesta.status}`;

      return responderError(
        res,
        respuesta.status,
        "No se pudo generar la imagen.",
        mensajeGoogle
      );
    }

    const parts =
      data?.candidates?.[0]?.content?.parts || [];

    let imagenBase64 = null;
    let mimeType = "image/png";
    let texto = "";

    for (const part of parts) {
      if (part.inlineData?.data) {
        imagenBase64 = part.inlineData.data;

        mimeType =
          part.inlineData.mimeType ||
          "image/png";
      }

      if (part.inline_data?.data) {
        imagenBase64 = part.inline_data.data;

        mimeType =
          part.inline_data.mime_type ||
          "image/png";
      }

      if (part.text) {
        texto += part.text;
      }
    }

    if (!imagenBase64) {
      const bloqueo =
        data?.promptFeedback?.blockReason ||
        data?.candidates?.[0]?.finishReason ||
        "";

      return responderError(
        res,
        502,
        "Gemini respondió pero no devolvió una imagen.",
        bloqueo ||
        texto ||
        "Sin imagen en la respuesta."
      );
    }

    const dataUrl =
      `data:${mimeType};base64,${imagenBase64}`;

    // Devuelve varios nombres para facilitar
    // la compatibilidad con el panel de ÁNGELA.
    return res.status(200).json({
      ok: true,

      image: dataUrl,
      imageUrl: dataUrl,
      url: dataUrl,
      dataUrl: dataUrl,

      mimeType: mimeType,
      model: IMAGE_MODEL,
      aspectRatio: aspecto,

      text: texto.trim()
    });

  } catch (error) {
    console.error(
      "ANGELA IMAGE ERROR:",
      error
    );

    return responderError(
      res,
      500,
      "Error interno al generar la imagen.",
      error?.message || String(error)
    );
  }
}
