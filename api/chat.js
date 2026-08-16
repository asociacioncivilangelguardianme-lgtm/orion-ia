// ============================================================
// ÁNGELA PRO V7.8
// MULTI-IA + INTERNET + RESPALDO AUTOMÁTICO
// Archivo: /api/chat.js
// ============================================================

export default async function handler(req, res) {
  // ----------------------------------------------------------
  // CORS
  // ----------------------------------------------------------
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Método no permitido"
    });
  }

  try {
    const body = req.body || {};

    const mensaje =
      body.message ||
      body.mensaje ||
      body.prompt ||
      body.text ||
      "";

    const historial = Array.isArray(body.history)
      ? body.history
      : Array.isArray(body.historial)
      ? body.historial
      : [];

    const memoria =
      body.memory ||
      body.memoria ||
      "";

    const proveedorSolicitado = String(
      body.provider ||
      body.proveedor ||
      body.ai ||
      "auto"
    ).toLowerCase();

    const usarInternet =
      body.internet === true ||
      body.web === true ||
      body.buscarInternet === true;

    if (!mensaje || !String(mensaje).trim()) {
      return res.status(400).json({
        ok: false,
        error: "No se recibió ningún mensaje."
      });
    }

    const promptSistema = crearPromptSistema(memoria);

    // ----------------------------------------------------------
    // ORDEN DE PROVEEDORES
    // ----------------------------------------------------------

    let proveedores = [];

    if (proveedorSolicitado === "auto") {
      proveedores = [
        "gemini",
        "openai",
        "claude",
        "openrouter"
      ];
    } else {
      proveedores = [
        proveedorSolicitado,
        "gemini",
        "openai",
        "claude",
        "openrouter"
      ];
    }

    // eliminar repetidos
    proveedores = [...new Set(proveedores)];

    const errores = [];

    for (const proveedor of proveedores) {
      try {
        let resultado = null;

        if (proveedor === "gemini") {
          resultado = await consultarGemini({
            mensaje,
            historial,
            promptSistema,
            usarInternet
          });
        }

        if (proveedor === "openai") {
          resultado = await consultarOpenAI({
            mensaje,
            historial,
            promptSistema
          });
        }

        if (
          proveedor === "claude" ||
          proveedor === "anthropic"
        ) {
          resultado = await consultarClaude({
            mensaje,
            historial,
            promptSistema
          });
        }

        if (proveedor === "openrouter") {
          resultado = await consultarOpenRouter({
            mensaje,
            historial,
            promptSistema
          });
        }

        if (
          resultado &&
          resultado.text &&
          resultado.text.trim()
        ) {
          return res.status(200).json({
            ok: true,

            // distintos nombres para compatibilidad
            reply: resultado.text,
            response: resultado.text,
            respuesta: resultado.text,
            text: resultado.text,

            provider: proveedor,
            proveedor: proveedor,

            model: resultado.model || "",
            modelo: resultado.model || "",

            internet:
              proveedor === "gemini"
                ? usarInternet
                : false,

            fallback:
              proveedor !== proveedorSolicitado &&
              proveedorSolicitado !== "auto",

            sources: resultado.sources || []
          });
        }

      } catch (errorProveedor) {
        console.error(
          `Error proveedor ${proveedor}:`,
          errorProveedor
        );

        errores.push({
          proveedor,
          error:
            errorProveedor?.message ||
            String(errorProveedor)
        });
      }
    }

    return res.status(500).json({
      ok: false,
      error:
        "Ninguna IA disponible pudo responder.",
      detalles: errores
    });

  } catch (error) {
    console.error("ERROR GENERAL ÁNGELA:", error);

    return res.status(500).json({
      ok: false,
      error:
        error?.message ||
        "Error interno del servidor."
    });
  }
}


// ============================================================
// PROMPT MAESTRO DE ÁNGELA
// ============================================================

function crearPromptSistema(memoria = "") {
  return `
Sos ÁNGELA, una asistente virtual inteligente.

Respondé de forma natural, clara, directa y útil.

REGLAS:

- No respondas como un robot.
- No inventes información.
- Si no sabés algo, decilo.
- Cuando haya información suficiente, respondé directamente.
- Priorizá respuestas fáciles de entender.
- Usá español de Argentina salvo que el usuario use otro idioma.
- Recordá el contexto de la conversación.
- Aprovechá la memoria disponible cuando sea relevante.
- No menciones detalles técnicos internos innecesariamente.
- No digas "User Safety", "Response Safety" ni textos internos del modelo.
- Para cálculos, verificá correctamente los números.
- Para láser, sublimación, herramientas o maquinaria, diferenciá claramente orientación de parámetros confirmados.
- Si hay información actual obtenida de Internet, indicá que se usó información actual cuando sea útil.
- No afirmes que hiciste una acción externa si realmente no fue ejecutada.

MEMORIA DISPONIBLE:
${limitarTexto(memoria, 12000)}
`;
}


// ============================================================
// GEMINI
// ============================================================

async function consultarGemini({
  mensaje,
  historial,
  promptSistema,
  usarInternet
}) {

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY no configurada"
    );
  }

  const model =
    process.env.GEMINI_MODEL ||
    "gemini-2.5-flash";

  const contents = [];

  // Historial
  for (const item of historial.slice(-20)) {
    const role =
      item.role === "assistant" ||
      item.role === "model"
        ? "model"
        : "user";

    const texto =
      item.content ||
      item.text ||
      item.message ||
      "";

    if (!texto) continue;

    contents.push({
      role,
      parts: [
        {
          text: String(texto)
        }
      ]
    });
  }

  contents.push({
    role: "user",
    parts: [
      {
        text: String(mensaje)
      }
    ]
  });

  const requestBody = {
    systemInstruction: {
      parts: [
        {
          text: promptSistema
        }
      ]
    },

    contents,

    generationConfig: {
      temperature: 0.65,
      maxOutputTokens: 4096
    }
  };

  // INTERNET REAL CON GOOGLE SEARCH
  if (usarInternet) {
    requestBody.tools = [
      {
        google_search: {}
      }
    ];
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(model)}:generateContent?key=` +
    `${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  const data = await leerJsonSeguro(response);

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      `Gemini HTTP ${response.status}`
    );
  }

  const partes =
    data?.candidates?.[0]?.content?.parts || [];

  const texto = partes
    .map(p => p.text || "")
    .join("\n")
    .trim();

  if (!texto) {
    throw new Error(
      "Gemini devolvió una respuesta vacía."
    );
  }

  const sources = extraerFuentesGemini(data);

  return {
    text: texto,
    model,
    sources
  };
}


// ============================================================
// OPENAI
// Responses API
// ============================================================

async function consultarOpenAI({
  mensaje,
  historial,
  promptSistema
}) {

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY no configurada"
    );
  }

  const model =
    process.env.OPENAI_MODEL ||
    "gpt-5-mini";

  let historialTexto = "";

  for (const item of historial.slice(-20)) {
    const rol =
      item.role === "assistant"
        ? "ÁNGELA"
        : "Usuario";

    const texto =
      item.content ||
      item.text ||
      item.message ||
      "";

    if (!texto) continue;

    historialTexto +=
      `${rol}: ${texto}\n`;
  }

  const input = `
${historialTexto}

Usuario:
${mensaje}
`;

  const response = await fetch(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },

      body: JSON.stringify({
        model,
        instructions: promptSistema,
        input,
        max_output_tokens: 4096
      })
    }
  );

  const data = await leerJsonSeguro(response);

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      `OpenAI HTTP ${response.status}`
    );
  }

  let texto = "";

  if (data.output_text) {
    texto = data.output_text;
  }

  if (
    !texto &&
    Array.isArray(data.output)
  ) {
    for (const item of data.output) {
      if (!Array.isArray(item.content)) continue;

      for (const contenido of item.content) {
        if (
          contenido.type === "output_text" &&
          contenido.text
        ) {
          texto += contenido.text;
        }
      }
    }
  }

  texto = String(texto || "").trim();

  if (!texto) {
    throw new Error(
      "OpenAI devolvió una respuesta vacía."
    );
  }

  return {
    text: texto,
    model
  };
}


// ============================================================
// CLAUDE / ANTHROPIC
// ============================================================

async function consultarClaude({
  mensaje,
  historial,
  promptSistema
}) {

  const apiKey =
    process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY no configurada"
    );
  }

  const model =
    process.env.ANTHROPIC_MODEL ||
    "claude-sonnet-4-5";

  const messages = [];

  for (const item of historial.slice(-20)) {
    const role =
      item.role === "assistant"
        ? "assistant"
        : "user";

    const texto =
      item.content ||
      item.text ||
      item.message ||
      "";

    if (!texto) continue;

    messages.push({
      role,
      content: String(texto)
    });
  }

  messages.push({
    role: "user",
    content: String(mensaje)
  });

  const response = await fetch(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },

      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: promptSistema,
        messages
      })
    }
  );

  const data = await leerJsonSeguro(response);

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      `Claude HTTP ${response.status}`
    );
  }

  const texto = Array.isArray(data.content)
    ? data.content
        .filter(x => x.type === "text")
        .map(x => x.text)
        .join("\n")
        .trim()
    : "";

  if (!texto) {
    throw new Error(
      "Claude devolvió una respuesta vacía."
    );
  }

  return {
    text: texto,
    model
  };
}


// ============================================================
// OPENROUTER
// ============================================================

async function consultarOpenRouter({
  mensaje,
  historial,
  promptSistema
}) {

  const apiKey =
    process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY no configurada"
    );
  }

  const model =
    process.env.OPENROUTER_MODEL ||
    "google/gemini-2.5-flash";

  const messages = [
    {
      role: "system",
      content: promptSistema
    }
  ];

  for (const item of historial.slice(-20)) {
    const role =
      item.role === "assistant"
        ? "assistant"
        : "user";

    const texto =
      item.content ||
      item.text ||
      item.message ||
      "";

    if (!texto) continue;

    messages.push({
      role,
      content: String(texto)
    });
  }

  messages.push({
    role: "user",
    content: String(mensaje)
  });

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,

        "HTTP-Referer":
          process.env.APP_URL ||
          "https://angela.vercel.app",

        "X-Title":
          "ANGELA PRO"
      },

      body: JSON.stringify({
        model,
        messages,
        temperature: 0.65,
        max_tokens: 4096
      })
    }
  );

  const data = await leerJsonSeguro(response);

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      `OpenRouter HTTP ${response.status}`
    );
  }

  const texto =
    data?.choices?.[0]?.message?.content;

  if (!texto) {
    throw new Error(
      "OpenRouter devolvió una respuesta vacía."
    );
  }

  return {
    text: String(texto).trim(),
    model
  };
}


// ============================================================
// EXTRAER FUENTES DE GEMINI
// ============================================================

function extraerFuentesGemini(data) {
  try {
    const metadata =
      data?.candidates?.[0]?.groundingMetadata;

    const chunks =
      metadata?.groundingChunks || [];

    return chunks
      .map(chunk => {
        const web = chunk.web;

        if (!web) return null;

        return {
          title:
            web.title || "Fuente",
          url:
            web.uri || ""
        };
      })
      .filter(Boolean);

  } catch {
    return [];
  }
}


// ============================================================
// UTILIDADES
// ============================================================

async function leerJsonSeguro(response) {
  const texto = await response.text();

  try {
    return JSON.parse(texto);
  } catch {
    return {
      raw: texto
    };
  }
}


function limitarTexto(texto, max = 12000) {
  if (!texto) return "";

  const limpio = String(texto);

  if (limpio.length <= max) {
    return limpio;
  }

  return limpio.slice(
    limpio.length - max
  );
}
