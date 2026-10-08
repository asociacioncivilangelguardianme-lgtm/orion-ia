module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const FAL_KEY = process.env.FAL_KEY || "";

  const rawSupabaseUrl = process.env.SUPABASE_URL || "";
  const SUPABASE_URL = rawSupabaseUrl
    .replace(/\/rest\/v1\/?$/i, "")
    .replace(/\/+$/, "");

  const SUPABASE_PUBLIC_KEY =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";

  const MUSIC_MODEL = "sonilo/v1.1/text-to-music";

  function jsonError(status, message, extra = {}) {
    return res.status(status).json({
      ok: false,
      error: message,
      ...extra
    });
  }

  function falHeaders(withJson = false) {
    const headers = {
      Authorization: `Key ${FAL_KEY}`
    };

    if (withJson) {
      headers["Content-Type"] = "application/json";
    }

    return headers;
  }

  async function readJson(response) {
    const text = await response.text();

    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return {
        raw: text
      };
    }
  }

  async function requireAngelaUser() {
    const authHeader =
      req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      return null;
    }

    if (!SUPABASE_URL || !SUPABASE_PUBLIC_KEY) {
      return null;
    }

    try {
      const response = await fetch(
        `${SUPABASE_URL}/auth/v1/user`,
        {
          method: "GET",
          headers: {
            apikey: SUPABASE_PUBLIC_KEY,
            Authorization: authHeader
          },
          cache: "no-store"
        }
      );

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch {
      return null;
    }
  }

  function cleanDuration(value) {
    const duration = Number(value || 30);

    if (!Number.isFinite(duration)) {
      return 30;
    }

    /*
      Sonilo permite hasta 600 segundos.
      Dejamos mínimo 10 segundos para
      evitar generaciones demasiado cortas.
    */

    return Math.min(
      600,
      Math.max(10, Math.round(duration))
    );
  }

  /*
    =====================================================
    PRUEBA SEGURA
    NO GENERA MÚSICA
    NO CONSUME CRÉDITOS
    =====================================================
  */

  if (
    req.method === "GET" &&
    !req.query?.action
  ) {
    return res.status(200).json({
      ok: true,
      studio: "ANGELA STUDIO IA",
      module: "Música IA",

      falConfigured:
        Boolean(FAL_KEY),

      supabaseConfigured:
        Boolean(
          SUPABASE_URL &&
          SUPABASE_PUBLIC_KEY
        ),

      model: MUSIC_MODEL,

      functions: [
        "crear-musica",
        "consultar-estado",
        "obtener-resultado",
        "cancelar"
      ],

      presets: [
        "cinematica",
        "emocional",
        "alegre",
        "infantil",
        "terror",
        "suspenso",
        "documental",
        "tecnologia",
        "deportes",
        "publicidad",
        "solidaria",
        "romantica",
        "cumbia",
        "cuarteto",
        "reggaeton",
        "rock",
        "pop",
        "ambiental"
      ],

      maxDurationSeconds: 600
    });
  }

  if (!FAL_KEY) {
    return jsonError(
      500,
      "Falta configurar FAL_KEY en Vercel"
    );
  }

  /*
    =====================================================
    TODO LO QUE GENERA O CONSULTA FAL
    EXIGE SESIÓN EN ÁNGELA
    =====================================================
  */

  const user = await requireAngelaUser();

  if (!user) {
    return jsonError(
      401,
      "Necesitás iniciar sesión en ÁNGELA STUDIO IA"
    );
  }

  /*
    =====================================================
    GET
    status / result
    =====================================================
  */

  if (req.method === "GET") {
    const action =
      String(req.query?.action || "");

    const requestId =
      String(req.query?.request_id || "");

    if (!requestId) {
      return jsonError(
        400,
        "Falta request_id"
      );
    }

    /*
      CONSULTAR ESTADO
    */

    if (action === "status") {
      const url =
        `https://queue.fal.run/${MUSIC_MODEL}` +
        `/requests/${encodeURIComponent(requestId)}/status`;

      const response = await fetch(
        url,
        {
          method: "GET",
          headers: falHeaders(false),
          cache: "no-store"
        }
      );

      const data =
        await readJson(response);

      return res
        .status(response.status)
        .json({
          ok: response.ok,
          action: "status",
          model: MUSIC_MODEL,
          request_id: requestId,
          ...data
        });
    }

    /*
      OBTENER MÚSICA TERMINADA
    */

    if (action === "result") {
      const url =
        `https://queue.fal.run/${MUSIC_MODEL}` +
        `/requests/${encodeURIComponent(requestId)}`;

      const response = await fetch(
        url,
        {
          method: "GET",
          headers: falHeaders(false),
          cache: "no-store"
        }
      );

      const data =
        await readJson(response);

      const output =
        data?.data || data;

      const audio =
        output?.audio ||
        output?.audios?.[0] ||
        null;

      return res
        .status(response.status)
        .json({
          ok: response.ok,
          action: "result",
          model: MUSIC_MODEL,
          request_id: requestId,

          audio_url:
            audio?.url || "",

          audio,

          ...data
        });
    }

    return jsonError(
      400,
      "Acción GET no reconocida"
    );
  }

  /*
    =====================================================
    POST
    generate / cancel
    =====================================================
  */

  if (req.method === "POST") {
    let body = {};

    try {
      body =
        typeof req.body === "string"
          ? JSON.parse(req.body || "{}")
          : (req.body || {});
    } catch {
      return jsonError(
        400,
        "JSON inválido"
      );
    }

    const action =
      String(
        body.action || "generate"
      ).toLowerCase();

    /*
      ===================================================
      CREAR MÚSICA
      ===================================================
    */

    if (
      action === "generate" ||
      action === "music"
    ) {
      const description =
        String(
          body.prompt ||
          body.description ||
          ""
        ).trim();

      if (!description) {
        return jsonError(
          400,
          "Falta describir la música que querés crear"
        );
      }

      const duration =
        cleanDuration(body.duration);

      const instrumental =
        body.instrumental === undefined
          ? true
          : Boolean(body.instrumental);

      /*
        Si es música para acompañar un video,
        por defecto pedimos instrumental para
        no competir con la voz de narración.
      */

      let finalPrompt = description;

      if (instrumental) {
        finalPrompt +=
          ". Instrumental music only, no vocals, no spoken words.";
      }

      if (body.mood) {
        finalPrompt +=
          `. Mood: ${String(body.mood)}.`;
      }

      if (body.genre) {
        finalPrompt +=
          `. Genre: ${String(body.genre)}.`;
      }

      if (body.instruments) {
        finalPrompt +=
          `. Instruments: ${String(body.instruments)}.`;
      }

      const input = {
        prompt: finalPrompt,
        duration,
        num_samples: 1
      };

      const response = await fetch(
        `https://queue.fal.run/${MUSIC_MODEL}`,
        {
          method: "POST",
          headers: falHeaders(true),
          body: JSON.stringify(input),
          cache: "no-store"
        }
      );

      const data =
        await readJson(response);

      if (!response.ok) {
        return res
          .status(response.status)
          .json({
            ok: false,
            error:
              data?.detail ||
              data?.error ||
              "No se pudo generar la música",
            details: data
          });
      }

      return res.status(200).json({
        ok: true,

        action: "generate",

        model: MUSIC_MODEL,

        duration,

        instrumental,

        request_id:
          data.request_id,

        status_url:
          data.status_url,

        response_url:
          data.response_url,

        cancel_url:
          data.cancel_url
      });
    }

    /*
      ===================================================
      CANCELAR GENERACIÓN
      ===================================================
    */

    if (action === "cancel") {
      const requestId =
        String(
          body.request_id || ""
        );

      if (!requestId) {
        return jsonError(
          400,
          "Falta request_id"
        );
      }

      const url =
        `https://queue.fal.run/${MUSIC_MODEL}` +
        `/requests/${encodeURIComponent(requestId)}/cancel`;

      const response = await fetch(
        url,
        {
          method: "PUT",
          headers: falHeaders(false),
          cache: "no-store"
        }
      );

      const data =
        await readJson(response);

      return res
        .status(response.status)
        .json({
          ok: response.ok,
          action: "cancel",
          model: MUSIC_MODEL,
          request_id: requestId,
          ...data
        });
    }

    return jsonError(
      400,
      "Acción POST no reconocida"
    );
  }

  return jsonError(
    405,
    "Método no permitido"
  );
};
