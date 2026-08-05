export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const { mensaje } = req.body || {};

    if (!mensaje) {
      return res.status(400).json({ error: "Falta el mensaje" });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY no está configurada en Vercel"
      });
    }

    const respuesta = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text:
                    "Sos ÁNGELA, una asistente de inteligencia artificial general. " +
                    "Respondé en español de forma natural, clara y directa. " +
                    "No inventes que realizaste acciones que no realizaste. " +
                    "Respondé realmente la pregunta del usuario. " +
                    "Pregunta del usuario: " + mensaje
                }
              ]
            }
          ]
        })
      }
    );

    const data = await respuesta.json();

    if (!respuesta.ok) {
      console.error("Error Gemini:", data);
      return res.status(respuesta.status).json({
        error: "Gemini rechazó la solicitud",
        detalle: data
      });
    }

    const texto =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!texto) {
      return res.status(500).json({
        error: "Gemini no devolvió una respuesta de texto"
      });
    }

    return res.status(200).json({
      respuesta: texto
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Error interno del servidor"
    });
  }
}
