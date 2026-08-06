export default async function handler(req, res) {

  // =====================================================
  // CORS - PERMITE CONECTAR ÁNGELA DESDE GITHUB PAGES
  // =====================================================

  res.setHeader("Access-Control-Allow-Origin", "*");

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Accept"
  );

  res.setHeader("Access-Control-Max-Age", "86400");

  // El navegador hace esta consulta ANTES del POST.
  // Si no respondemos esto aparece "Failed to fetch".
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }


  // =====================================================
  // CONFIGURACIÓN
  // =====================================================

  const apiKey = process.env.GEMINI_API_KEY;


  // =====================================================
  // GET - PRUEBA DE ESTADO DEL BACKEND
  // =====================================================

  if (req.method === "GET") {

    return res.status(200).json({
      ok: true,
      backend: true,
      geminiConfigured: Boolean(apiKey),
      configured: Boolean(apiKey),
      model: "gemini-3.5-flash",
      mensaje: "Backend de ÁNGELA funcionando"
    });

  }


  // =====================================================
  // SOLO POST PARA HABLAR CON LA IA
  // =====================================================

  if (req.method !== "POST") {

    return res.status(405).json({
      error: "Método no permitido"
    });

  }


  try {

    // =====================================================
    // DIAGNÓSTICO DESDE EL HTML
    // =====================================================

    const body = req.body || {};

    if (body.mode === "diagnostic") {

      return res.status(200).json({
        ok: true,
        backend: true,
        geminiConfigured: Boolean(apiKey),
        configured: Boolean(apiKey),
        geminiOk: Boolean(apiKey),
        verified: Boolean(apiKey),
        model: "gemini-3.5-flash"
      });

    }


    // =====================================================
    // COMPATIBILIDAD HTML VIEJO + HTML NUEVO
    // =====================================================

    const mensaje =
      body.mensaje ||
      body.message ||
      body.text ||
      body.prompt ||
      "";


    if (!mensaje || !String(mensaje).trim()) {

      return res.status(400).json({
        error: "Falta el mensaje"
      });

    }


    // =====================================================
    // VERIFICAR CLAVE GEMINI
    // =====================================================

    if (!apiKey) {

      console.error("GEMINI_API_KEY no configurada");

      return res.status(500).json({
        error: "GEMINI_API_KEY no está configurada en Vercel"
      });

    }


    // =====================================================
    // CONTEXTO OPCIONAL QUE MANDA ÁNGELA
    // =====================================================

    const usuario =
      body.usuario ||
      body.user ||
      "Usuario";

    const asistente =
      body.asistente ||
      body.assistant ||
      "Ángela";

    const ubicacion =
      body.ubicacion ||
      body.location ||
      "";

    const contexto =
      body.contexto ||
      body.context ||
      null;


    // =====================================================
    // PROMPT DE ÁNGELA
    // =====================================================

    let promptSistema = `
Sos ÁNGELA, una asistente de inteligencia artificial general.

Tu nombre es ÁNGELA.

Respondé siempre en español salvo que el usuario solicite otro idioma.

Respondé de forma:
- natural
- clara
- útil
- directa
- amable
- precisa

Podés ayudar con:
- preguntas generales
- informática
- programación
- grabado láser
- LightBurn
- sublimación
- impresión 3D
- CNC
- imágenes y diseño
- proyectos
- cálculos
- explicaciones
- redacción
- aprendizaje
- tareas cotidianas

No inventes que realizaste acciones que no realizaste.

No digas que abriste páginas, enviaste mensajes,
modificaste archivos o ejecutaste herramientas
si realmente no ocurrió.

Si no sabés algo, decilo claramente.

Nombre del usuario: ${usuario}
Nombre del asistente: ${asistente}
`;

    if (ubicacion) {
      promptSistema += `\nUbicación aproximada del usuario: ${ubicacion}\n`;
    }

    if (contexto) {

      try {

        const contextoTexto =
          typeof contexto === "string"
            ? contexto
            : JSON.stringify(contexto);

        // Evitamos mandar un contexto gigantesco
        promptSistema +=
          "\nContexto disponible de la conversación:\n" +
          contextoTexto.slice(0, 12000);

      } catch (e) {

        console.warn("No se pudo procesar contexto:", e);

      }

    }


    // =====================================================
    // CONSULTAR GEMINI
    // =====================================================

    const respuesta = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },

        body: JSON.stringify({

          systemInstruction: {
            parts: [
              {
                text: promptSistema
              }
            ]
          },

          contents: [
            {
              role: "user",
              parts: [
                {
                  text: String(mensaje).trim()
                }
              ]
            }
          ],

          generationConfig: {
            temperature: 0.7,
            topP: 0.95,
            maxOutputTokens: 4096
          }

        })
      }
    );


    // =====================================================
    // LEER RESPUESTA DE GEMINI
    // =====================================================

    let data;

    try {

      data = await respuesta.json();

    } catch (error) {

      console.error(
        "Gemini devolvió una respuesta no JSON",
        error
      );

      return res.status(502).json({
        error: "Respuesta inválida del servidor de Gemini"
      });

    }


    // =====================================================
    // ERROR DE GEMINI
    // =====================================================

    if (!respuesta.ok) {

      console.error(
        "Error Gemini:",
        respuesta.status,
        JSON.stringify(data)
      );

      return res.status(respuesta.status).json({

        error: "Gemini rechazó la solicitud",

        detalle:
          data?.error?.message ||
          data?.message ||
          "Error desconocido de Gemini",

        codigo:
          data?.error?.code ||
          respuesta.status

      });

    }


    // =====================================================
    // EXTRAER TEXTO
    // =====================================================

    const partes =
      data?.candidates?.[0]?.content?.parts || [];

    const texto = partes
      .map(parte => parte?.text || "")
      .join("")
      .trim();


    if (!texto) {

      console.error(
        "Respuesta Gemini sin texto:",
        JSON.stringify(data)
      );

      return res.status(500).json({

        error:
          "Gemini respondió pero no devolvió texto",

        detalle:
          data?.promptFeedback || null

      });

    }


    // =====================================================
    // RESPUESTA COMPATIBLE CON TODAS LAS VERSIONES
    // DE ÁNGELA
    // =====================================================

    return res.status(200).json({

      ok: true,

      respuesta: texto,

      reply: texto,

      response: texto,

      text: texto,

      model: "gemini-3.5-flash",

      modelo: "gemini-3.5-flash",

      geminiConfigured: true,

      geminiOk: true,

      configured: true,

      verified: true

    });


  } catch (error) {

    // =====================================================
    // ERROR GENERAL
    // =====================================================

    console.error(
      "ERROR ÁNGELA / API:",
      error
    );

    return res.status(500).json({

      error: "Error interno del servidor",

      detalle:
        error?.message ||
        "Error desconocido"

    });

  }

}
