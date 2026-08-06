const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function extraerTexto(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map(p => p?.text || "").join("").trim();
}

function extraerFuentes(data) {
  const chunks = data?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const out = [];
  const seen = new Set();

  for (const chunk of chunks) {
    const web = chunk?.web;

    if (!web?.uri || seen.has(web.uri)) continue;

    seen.add(web.uri);

    out.push({
      title: web.title || "Fuente web",
      url: web.uri
    });
  }

  return out.slice(0, 8);
}

function historialAContents(history, currentMessage) {
  const contents = [];

  if (Array.isArray(history)) {
    for (const item of history.slice(-12)) {

      const text = String(
        item?.content ??
        item?.text ??
        ""
      ).trim();

      if (!text) continue;

      const role =
        item?.role === "assistant" ||
        item?.role === "model"
          ? "model"
          : "user";

      contents.push({
        role,
        parts: [
          {
            text: text.slice(0, 6000)
          }
        ]
      });
    }
  }

  contents.push({
    role: "user",
    parts: [
      {
        text: String(currentMessage).trim()
      }
    ]
  });

  return contents;
}

async function llamarGemini({
  apiKey,
  model,
  contents,
  systemText
}) {

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  return fetch(url, {

    method: "POST",

    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },

    body: JSON.stringify({

      system_instruction: {
        parts: [
          {
            text: systemText
          }
        ]
      },

      contents,

      tools: [
        {
          google_search: {}
        }
      ],

      generationConfig: {
        temperature: 0.65,
        topP: 0.95,
        maxOutputTokens: 4096
      }

    })
  });
}

export default async function handler(req, res) {

  // ==========================================
  // CORS
  // ==========================================

  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Accept"
  );

  res.setHeader(
    "Access-Control-Max-Age",
    "86400"
  );

  res.setHeader(
    "Cache-Control",
    "no-store"
  );


  // ==========================================
  // OPTIONS
  // ==========================================

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }


  // ==========================================
  // CONFIGURACIÓN
  // ==========================================

  const apiKey =
    process.env.GEMINI_API_KEY;

  const models = [
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite"
  ];


  // ==========================================
  // PRUEBA DEL SERVIDOR
  // ==========================================

  if (req.method === "GET") {

    return res.status(200).json({

      ok: true,

      backend: true,

      geminiConfigured:
        Boolean(apiKey),

      configured:
        Boolean(apiKey),

      webSearch: true,

      model:
        models[0],

      fallbacks:
        models.slice(1),

      mensaje:
        "Servidor de ÁNGELA funcionando correctamente"

    });

  }


  // ==========================================
  // SOLO POST
  // ==========================================

  if (req.method !== "POST") {

    return res.status(405).json({
      error: "Método no permitido"
    });

  }


  try {

    const body =
      req.body || {};


    // ==========================================
    // DIAGNÓSTICO
    // ==========================================

    if (body.mode === "diagnostic") {

      return res.status(200).json({

        ok: true,

        backend: true,

        geminiConfigured:
          Boolean(apiKey),

        configured:
          Boolean(apiKey),

        geminiOk:
          Boolean(apiKey),

        verified:
          Boolean(apiKey),

        webSearch: true,

        model:
          models[0],

        fallbacks:
          models.slice(1)

      });

    }


    // ==========================================
    // MENSAJE
    // ==========================================

    const mensaje = String(

      body.message ||
      body.mensaje ||
      body.text ||
      body.prompt ||
      ""

    ).trim();


    if (!mensaje) {

      return res.status(400).json({
        error: "Falta el mensaje"
      });

    }


    // ==========================================
    // VERIFICAR GEMINI
    // ==========================================

    if (!apiKey) {

      return res.status(500).json({

        error:
          "GEMINI_API_KEY no está configurada en Vercel"

      });

    }


    // ==========================================
    // CONTEXTO
    // ==========================================

    const context =
      body.context ||
      body.contexto ||
      {};


    const history =
      body.history ||
      body.historial ||
      context.history ||
      [];


    const usuario =
      body.usuario ||
      body.user ||
      context.profile ||
      "Usuario";


    const ubicacion =
      body.ubicacion ||
      body.location ||
      "";


    // ==========================================
    // INSTRUCCIONES DE ÁNGELA
    // ==========================================

    const systemText = `

Sos ÁNGELA, una asistente de inteligencia artificial general.

Respondé en español de forma natural, clara, útil, directa y precisa.


REGLAS IMPORTANTES:

- Conservá el contexto de la conversación.

- Si el usuario usa expresiones como
  "las redes",
  "la dirección",
  "ese lugar",
  "eso",
  interpretalas usando los mensajes anteriores.

- Tenés disponible Búsqueda de Google.

- Usala cuando la pregunta dependa de información pública,
  actual o verificable.

Por ejemplo:

- direcciones
- redes sociales
- teléfonos públicos
- comercios
- instituciones
- noticias
- precios
- horarios
- productos
- lugares
- personas públicas
- datos que puedan haber cambiado


- Si usaste búsqueda web,
  basá la respuesta en lo encontrado.

- No digas que no podés buscar en Internet
  cuando la herramienta esté disponible.

- No inventes direcciones,
  teléfonos,
  redes,
  horarios
  ni acciones.

- No afirmes que abriste una página,
  mandaste un mensaje
  o modificaste algo
  si no ocurrió realmente.

- Evitá Markdown con asteriscos.

- No uses **negrita**
  ni *cursiva*.

- Escribí texto limpio,
  con párrafos y viñetas simples.


DATOS CONFIRMADOS DEL COMEDOR ÁNGEL GUARDIÁN:

Nombre:
Comedor Ángel Guardián /
Asociación Civil Ángel Guardián para la Niñez de Merlo.

Dirección:
García Velloso 4269
entre Ocanto y Perelli,
Mariano Acosta,
Merlo,
Buenos Aires.

Teléfonos públicos:

11-3898-0135

11-2257-3722


Email público:

comedor.angel.guardian@gmail.com


Instagram:

@comedorangelguardian_ok


X / Twitter:

@angelguardianc3


Facebook:

Comedor ángel guardián


YouTube:

Comedor angel guardian


Sitio web:

https://www.comedorangelguardian.com.ar/


Alias Banco Provincia:

NIEBLA.REMO.TAMBOR


Usuario actual:

${String(usuario).slice(0, 100)}


${ubicacion
  ? `Ubicación autorizada por el usuario: ${String(ubicacion).slice(0, 250)}`
  : ""
}

`.trim();


    // ==========================================
    // HISTORIAL
    // ==========================================

    const contents =
      historialAContents(
        history,
        mensaje
      );


    const errores = [];


    // ==========================================
    // PROBAR MODELOS
    // ==========================================

    for (const model of models) {

      for (
        let intento = 0;
        intento < 2;
        intento++
      ) {

        let respuesta;


        try {

          respuesta =
            await llamarGemini({

              apiKey,

              model,

              contents,

              systemText

            });


        } catch (error) {

          errores.push(
            `${model}: ${error?.message || "error de red"}`
          );


          if (intento === 0) {

            await sleep(
              800 +
              Math.floor(
                Math.random() * 500
              )
            );

            continue;

          }


          break;
        }


        // ==========================================
        // LEER RESPUESTA
        // ==========================================

        let data = {};


        try {

          data =
            await respuesta.json();

        } catch {

          data = {};

        }


        // ==========================================
        // RESPUESTA CORRECTA
        // ==========================================

        if (respuesta.ok) {

          const texto =
            extraerTexto(data);


          if (!texto) {

            errores.push(
              `${model}: respuesta sin texto`
            );

            break;

          }


          return res.status(200).json({

            ok: true,

            respuesta: texto,

            reply: texto,

            response: texto,

            text: texto,

            model,

            modelo: model,

            geminiConfigured: true,

            geminiOk: true,

            configured: true,

            verified: true,

            webSearch: true,

            sources:
              extraerFuentes(data)

          });

        }


        // ==========================================
        // ERROR GEMINI
        // ==========================================

        const detalle =

          data?.error?.message ||
          data?.message ||
          `HTTP ${respuesta.status}`;


        errores.push(

          `${model}: HTTP ${respuesta.status} ${detalle}`

        );


        const transitorio = [

          408,
          429,
          500,
          502,
          503,
          504

        ].includes(
          respuesta.status
        );


        // ==========================================
        // REINTENTO AUTOMÁTICO
        // ==========================================

        if (
          transitorio &&
          intento === 0
        ) {

          await sleep(

            1000 +
            Math.floor(
              Math.random() * 700
            )

          );

          continue;

        }


        // ==========================================
        // PASAR AL SIGUIENTE MODELO
        // ==========================================

        if (
          respuesta.status === 404 ||
          transitorio
        ) {

          break;

        }


        // ==========================================
        // ERROR DEFINITIVO
        // ==========================================

        return res
          .status(respuesta.status)
          .json({

            error:
              "Gemini rechazó la solicitud",

            detalle,

            model

          });

      }

    }


    // ==========================================
    // TODOS LOS MODELOS OCUPADOS
    // ==========================================

    return res.status(503).json({

      error:
        "Gemini está temporalmente ocupado",

      detalle:
        "ÁNGELA probó varios modelos y reintentó automáticamente. Volvé a intentar en unos segundos.",

      intentos:
        errores.slice(-6)

    });


  } catch (error) {

    console.error(
      "ERROR SERVIDOR ÁNGELA:",
      error
    );


    return res.status(500).json({

      error:
        "Error interno del servidor",

      detalle:
        error?.message ||
        "Error desconocido"

    });

  }

}
