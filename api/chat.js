const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ==========================================
// UTILIDADES GEMINI
// ==========================================
function extraerTextoGemini(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map(p => p?.text || "").join("").trim();
}

function extraerFuentesGemini(data) {
  const chunks = data?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const out = [];
  const seen = new Set();
  for (const chunk of chunks) {
    const web = chunk?.web;
    if (!web?.uri || seen.has(web.uri)) continue;
    seen.add(web.uri);
    out.push({ title: web.title || "Fuente web", url: web.uri });
  }
  return out.slice(0, 8);
}

function historialAGemini(history, currentMessage) {
  const contents = [];
  if (Array.isArray(history)) {
    for (const item of history.slice(-12)) {
      const text = String(item?.content ?? item?.text ?? "").trim();
      if (!text) continue;
      const role = (item?.role === "assistant" || item?.role === "model") ? "model" : "user";
      contents.push({ role, parts: [{ text: text.slice(0, 6000) }] });
    }
  }
  contents.push({ role: "user", parts: [{ text: String(currentMessage).trim() }] });
  return contents;
}

async function llamarGemini({ apiKey, model, contents, systemText }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemText }] },
      contents,
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.65, topP: 0.95, maxOutputTokens: 4096 }
    })
  });
}

// ==========================================
// UTILIDADES OPENROUTER
// ==========================================
function historialAOpenRouter(history, currentMessage, systemText) {
  const messages = [{ role: "system", content: systemText }];
  if (Array.isArray(history)) {
    for (const item of history.slice(-12)) {
      const text = String(item?.content ?? item?.text ?? "").trim();
      if (!text) continue;
      const role = (item?.role === "assistant" || item?.role === "model") ? "assistant" : "user";
      messages.push({ role, content: text.slice(0, 6000) });
    }
  }
  messages.push({ role: "user", content: String(currentMessage).trim() });
  return messages;
}

async function llamarOpenRouter({ apiKey, models, messages }) {
  return fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://orion-ia-sooty.vercel.app", 
      "X-Title": "Ángela Assistant"
    },
    body: JSON.stringify({
      models: models, 
      messages: messages,
      temperature: 0.65,
      max_tokens: 4096
    })
  });
}

// ==========================================
// UTILIDAD WIKIPEDIA (Rescate Final)
// ==========================================
async function buscarWikipedia(texto) {
  try {
    const query = texto.replace(/^(qué es|quién es|dónde está|dónde queda|hablame de|buscá sobre|qué significa|quien es|que es)\s+/i, "").trim();
    if (!query) return null;

    const searchRes = await fetch(`https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&origin=*`);
    const searchData = await searchRes.json();
    const topResult = searchData?.query?.search?.[0];

    if (!topResult) return null;

    const pageRes = await fetch(`https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topResult.title.replace(/\s+/g, "_"))}`);
    const pageData = await pageRes.json();

    if (pageData.extract) {
      return `*(Modo de rescate: mis servidores principales están saturados)*\n\n**${pageData.title}**\n${pageData.extract}\n\n🔗 [Leer más en Wikipedia](${pageData.content_urls?.desktop?.page || "https://es.wikipedia.org"})`;
    }
  } catch (e) {
    return null;
  }
  return null;
}

// ==========================================
// HANDLER PRINCIPAL VERCEL
// ==========================================
export default async function handler(req, res) {

  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(204).end();

  // CLAVES
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;

  const geminiModels = ["gemini-1.5-flash", "gemini-1.5-flash-8b"];
  // ACÁ ESTÁN LOS MODELOS 100% GRATUITOS DE OPENROUTER
  const openRouterModels = ["meta-llama/llama-3.1-8b-instruct:free", "google/gemma-2-9b-it:free"];

  // PRUEBA DEL SERVIDOR GET
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      backend: true,
      geminiConfigured: Boolean(geminiApiKey),
      openRouterConfigured: Boolean(openRouterApiKey),
      configured: Boolean(geminiApiKey || openRouterApiKey),
      mensaje: "Servidor de ÁNGELA funcionando con enrutador en cascada (Gemini → OpenRouter → Wikipedia)."
    });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

  try {
    const body = req.body || {};

    if (body.mode === "diagnostic") {
      return res.status(200).json({
        ok: true,
        backend: true,
        geminiConfigured: Boolean(geminiApiKey),
        openRouterConfigured: Boolean(openRouterApiKey),
        configured: Boolean(geminiApiKey || openRouterApiKey),
        geminiOk: Boolean(geminiApiKey),
        verified: Boolean(geminiApiKey || openRouterApiKey)
      });
    }

    const mensaje = String(body.message || body.mensaje || body.text || "").trim();
    if (!mensaje) return res.status(400).json({ error: "Falta el mensaje" });

    const context = body.context || body.contexto || {};
    const history = body.history || body.historial || context.history || [];
    const usuario = body.usuario || body.user || context.profile || "Usuario";
    const ubicacion = body.ubicacion || body.location || "";

    const systemText = `Sos ÁNGELA, una asistente virtual inteligente, rápida y directa. Respondé en español (voseo argentino).
Evitá formalismos. Sé práctica. No digas "según mis bases de datos".
Si el usuario pregunta por el Comedor Ángel Guardián, usá esto:
Nombre: Asociación Civil Ángel Guardián para la Niñez de Merlo.
Dirección: García Velloso 4269, Mariano Acosta, Merlo.
Teléfonos: 11-3898-0135 / 11-2257-3722.
Email: comedor.angel.guardian@gmail.com
Redes: @comedorangelguardian_ok (Instagram), @angelguardianc3 (X).
Alias Banco Provincia: NIEBLA.REMO.TAMBOR.
Web: https://www.comedorangelguardian.com.ar/
Usuario actual: ${String(usuario).slice(0, 100)}
${ubicacion ? `Ubicación GPS: ${String(ubicacion).slice(0, 250)}` : ""}`.trim();

    const errores = [];

    // ==========================================
    // PASO 1: INTENTAR GEMINI
    // ==========================================
    if (geminiApiKey) {
      const contents = historialAGemini(history, mensaje);
      for (const model of geminiModels) {
        try {
          const resGemini = await llamarGemini({ apiKey: geminiApiKey, model, contents, systemText });
          if (resGemini.ok) {
            const data = await resGemini.json();
            const texto = extraerTextoGemini(data);
            if (texto) {
              return res.status(200).json({
                ok: true, respuesta: texto, reply: texto, model: `Google ${model}`, sources: extraerFuentesGemini(data)
              });
            }
          }
          errores.push(`Gemini (${model}) falló con HTTP ${resGemini.status}`);
        } catch (error) {
          errores.push(`Gemini Error: ${error.message}`);
        }
      }
    } else {
      errores.push("GEMINI_API_KEY no configurada.");
    }

    // ==========================================
    // PASO 2: INTENTAR OPENROUTER (Fallback 1)
    // ==========================================
    if (openRouterApiKey) {
      try {
        const messages = historialAOpenRouter(history, mensaje, systemText);
        const resOR = await llamarOpenRouter({ apiKey: openRouterApiKey, models: openRouterModels, messages });
        
        if (resOR.ok) {
          const dataOR = await resOR.json();
          const textoOR = dataOR.choices?.[0]?.message?.content;
          if (textoOR) {
            return res.status(200).json({
              ok: true, respuesta: textoOR, reply: textoOR, model: `OpenRouter (${dataOR.model || "fallback"})`
            });
          }
        }
        errores.push(`OpenRouter falló con HTTP ${resOR.status}`);
      } catch (error) {
        errores.push(`OpenRouter Error: ${error.message}`);
      }
    } else {
      errores.push("OPENROUTER_API_KEY no configurada.");
    }

    // ==========================================
    // PASO 3: INTENTAR WIKIPEDIA (Rescate final)
    // ==========================================
    const wikiRespuesta = await buscarWikipedia(mensaje);
    if (wikiRespuesta) {
      return res.status(200).json({
        ok: true,
        respuesta: wikiRespuesta,
        reply: wikiRespuesta,
        model: "Wikipedia (Modo Rescate)"
      });
    }

    // ==========================================
    // SI TODO FALLA
    // ==========================================
    return res.status(503).json({
      error: "Sistemas ocupados",
      detalle: "Gemini, OpenRouter y Wikipedia no pudieron procesar la consulta en este momento. Intentá de nuevo.",
      logs: errores
    });

  } catch (error) {
    console.error("ERROR SERVIDOR ÁNGELA:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
      detalle: error?.message || "Error desconocido"
    });
  }
}
