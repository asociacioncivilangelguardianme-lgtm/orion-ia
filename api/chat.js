export default async function handler(req, res) {

  // ==========================================
  // CORS - PERMITE CONECTAR GITHUB CON VERCEL
  // ==========================================

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept"
  );

  // El navegador pregunta primero si puede conectarse
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const apiKey = process.env.GEMINI_API_KEY;

  // ==========================================
  // PRUEBA DEL SERVIDOR
  // ==========================================

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      backend: true,
      geminiConfigured: !!apiKey,
      configured: !!apiKey,
      model: "gemini-3.5-flash",
      mensaje: "Servidor de ÁNGELA funcionando correctamente"
    });
  }

  // ==========================================
  // SOLO POST PARA HABLAR CON ÁNGELA
  // ==========================================

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método no permitido"
    });
  }

  try {

    const body = req.body || {};

    // ==========================================
    // DIAGNÓSTICO
    // ==========================================

    if (body.mode === "diagnostic") {
      return res.status(200).json({
        ok: true,
        backend: true,
        geminiConfigured: !!apiKey,
        configured: !!apiKey,
        geminiOk: !!apiKey,
        verified: !!apiKey,
        model: "gemini-3.5-flash"
      });
    }

    // ==========================================
    // ACEPTA HTML NUEVO Y VIEJO
    // ==========================================

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

    // ==========================================
    // VERIFICAR CLAVE GEMINI
    // ==========================================

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY no está configurada en Vercel"
      });
    }

    const usuario =
      body.usuario ||
      body.user ||
      "Usuario";

    const ubicacion =
      body.ubicacion ||
      body.location ||
      "";

    // ==========================================
    // INSTRUCCIONES DE ÁNGELA
    // ==========================================

    let instrucciones = `
Sos ÁNGELA, una asistente de inteligencia artificial general.

Respondé principalmente en español.

Tu forma de responder debe ser:
- clara
- natural
- útil
- directa
- amable
- precisa

Podés ayudar con temas generales y especialmente con:

- grabado láser
- LightBurn
- AlgoLaser
- sublimación
- impresión 3D
- CNC
- diseño
- imágenes
- computación
- programación
- proyectos
- cálculos
- explicaciones
- redacción
- aprendizaje
- tareas cotidianas

No inventes acciones.

No digas que abriste páginas, enviaste mensajes,
modificaste archivos o ejecutaste herramientas
si realmente no ocurrió.

Si no conocés una respuesta, explicalo claramente.

Usuario actual: ${usuario}
`;

    if (ubicacion) {
      instrucciones += `\nUbicación aproximada: ${ubicacion}`;
    }

    // ==========================================
    // LLAMADA A GEMINI
    // ==========================================

    const respuestaGemini = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },

        body: JSON.stringify({
          system_instruction: {
            parts: [
              {
                text: instrucciones
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
          ]
        })
      }
    );

    // ==========================================
    // LEER RESPUESTA GEMINI
    // ==========================================

    const data = await respuestaGemini.json();

    if (!respuestaGemini.ok) {

      console.error("ERROR GEMINI:", data);

      return res.status(respuestaGemini.status).json({
        error: "Gemini rechazó la solicitud",
        detalle:
          data?.error?.message ||
          "Error desconocido de Gemini"
      });

    }

    // ==========================================
    // SACAR EL TEXTO DE LA RESPUESTA
    // ==========================================

    const partes =
      data?.candidates?.[0]?.content?.parts || [];

    const texto = partes
      .map(parte => parte?.text || "")
      .join("")
      .trim();

    if (!texto) {
      return res.status(500).json({
        error: "Gemini respondió pero no devolvió texto"
      });
    }

    // ==========================================
    // RESPUESTA PARA ÁNGELA
    // ==========================================

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

    console.error("ERROR SERVIDOR ÁNGELA:", error);

    return res.status(500).json({
      error: "Error interno del servidor",
      detalle: error?.message || "Error desconocido"
    });

  }
}
