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

  const MODELS = {
    voice: "fal-ai/gemini-3.1-flash-tts",
    transcribe: "fal-ai/wizper"
  };

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
      return { raw: text };
    }
  }

  async function requireAngelaUser() {
    const authHeader = req.headers.authorization || "";

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

  function getModel(kind) {
    return MODELS[kind] || null;
  }

  function secondsToSrtTime(seconds) {
    const totalMs = Math.max(
      0,
      Math.round(Number(seconds || 0) * 1000)
    );

    const hours = Math.floor(totalMs / 3600000);
    const minutes = Math.floor(
      (totalMs % 3600000) / 60000
    );
    const secs = Math.floor(
      (totalMs % 60000) / 1000
    );
    const ms = totalMs % 1000;

    return (
      String(hours).padStart(2, "0") +
      ":" +
      String(minutes).padStart(2, "0") +
      ":" +
      String(secs).padStart(2, "0") +
      "," +
      String(ms).padStart(3, "0")
    );
  }

  function chunksToSrt(chunks = []) {
    if (!Array.isArray(chunks)) {
      return "";
    }

    return chunks
      .map((chunk, index) => {
        const timestamp =
          Array.isArray(chunk.timestamp)
            ? chunk.timestamp
            : [0, 0];

        const start = Number(timestamp[0] || 0);
        const end = Number(
          timestamp[1] != null
            ? timestamp[1]
            : start + 2
        );

        const text = String(
          chunk.text || ""
        ).trim();

        if (!text) {
          return "";
        }

        return (
          `${index + 1}\n` +
          `${secondsToSrtTime(start)} --> ` +
          `${secondsToSrtTime(end)}\n` +
          `${text}\n`
        );
      })
      .filter(Boolean)
      .join("\n");
  }

  /*
    =====================================================
    PRUEBA SEGURA
    GET sin action no genera audio ni consume créditos
    =====================================================
  */

  if (req.method === "GET" && !req.query?.action) {
    return res.status(200).json({
      ok: true,
      studio: "ANGELA STUDIO IA",
      module: "Audio, Voz y Subtítulos",
      falConfigured: Boolean(FAL_KEY),
      supabaseConfigured: Boolean(
        SUPABASE_URL &&
        SUPABASE_PUBLIC_KEY
      ),

      models: {
        voice: MODELS.voice,
        transcribe: MODELS.transcribe
      },

      voices: [
        "Kore",
        "Aoede",
        "Zephyr",
        "Charon",
        "Puck",
        "Fenrir"
      ],

      language: "Spanish (Latin America)",

      functions: [
        "texto-a-voz",
        "audio-a-texto",
        "subtitulos-srt"
      ]
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
    DESDE ACÁ SE EXIGE USUARIO AUTENTICADO
    Evita que cualquiera use tus créditos
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
    const action = String(
      req.query?.action || ""
    );

    const kind = String(
      req.query?.kind || "voice"
    );

    const requestId = String(
      req.query?.request_id || ""
    );

    const model = getModel(kind);

    if (!model) {
      return jsonError(
        400,
        "Tipo de audio no reconocido"
      );
    }

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
        `https://queue.fal.run/${model}` +
        `/requests/${encodeURIComponent(requestId)}/status`;

      const response = await fetch(url, {
        method: "GET",
        headers: falHeaders(false),
        cache: "no-store"
      });

      const data = await readJson(response);

      return res.status(response.status).json({
        ok: response.ok,
        kind,
        model,
        request_id: requestId,
        ...data
      });
    }

    /*
      OBTENER RESULTADO
    */

    if (action === "result") {
      const url =
        `https://queue.fal.run/${model}` +
        `/requests/${encodeURIComponent(requestId)}`;

      const response = await fetch(url, {
        method: "GET",
        headers: falHeaders(false),
        cache: "no-store"
      });

      const data = await readJson(response);

      /*
        Si es transcripción, ÁNGELA también
        prepara automáticamente el SRT.
      */

      if (kind === "transcribe" && response.ok) {
        const output =
          data?.data ||
          data;

        const chunks =
          output?.chunks ||
          [];

        return res.status(response.status).json({
          ok: true,
          kind,
          model,
          request_id: requestId,
          ...data,

          transcript:
            output?.text || "",

          subtitles_srt:
            chunksToSrt(chunks),

          chunks
        });
      }

      return res.status(response.status).json({
        ok: response.ok,
        kind,
        model,
        request_id: requestId,
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
    voice / transcribe / cancel
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

    const action = String(
      body.action || ""
    );

    /*
      ===================================================
      TEXTO → VOZ
      ===================================================
    */

    if (action === "voice") {
      const text = String(
        body.text ||
        body.prompt ||
        ""
      ).trim();

      if (!text) {
        return jsonError(
          400,
          "Falta el texto para generar la voz"
        );
      }

      const voice =
        String(body.voice || "Kore");

      const style =
        String(
          body.style ||
          body.style_instructions ||
          "Hablar de forma natural, clara y cálida, en español latino."
        );

      const outputFormat =
        String(
          body.output_format || "mp3"
        );

      const input = {
        prompt: text,
        style_instructions: style,
        voice,
        language_code:
          "Spanish (Latin America)",
        output_format: outputFormat
      };

      const model = MODELS.voice;

      const response = await fetch(
        `https://queue.fal.run/${model}`,
        {
          method: "POST",
          headers: falHeaders(true),
          body: JSON.stringify(input),
          cache: "no-store"
        }
      );

      const data = await readJson(response);

      if (!response.ok) {
        return res.status(response.status).json({
          ok: false,
          error:
            data?.detail ||
            data?.error ||
            "No se pudo generar la voz",
          details: data
        });
      }

      return res.status(200).json({
        ok: true,
        action: "voice",
        kind: "voice",
        model,
        voice,
        language:
          "Spanish (Latin America)",
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
      AUDIO / VIDEO → TEXTO + SUBTÍTULOS
      ===================================================
    */

    if (action === "transcribe") {
      const audioUrl = String(
        body.audio_url ||
        body.video_url ||
        ""
      ).trim();

      if (!audioUrl) {
        return jsonError(
          400,
          "Falta audio_url o video_url"
        );
      }

      const input = {
        audio_url: audioUrl,
        task: "transcribe",
        language:
          body.language || "es",
        chunk_level: "segment",
        max_segment_len:
          Number(
            body.max_segment_len || 8
          ),
        merge_chunks:
          body.merge_chunks === undefined
            ? false
            : Boolean(body.merge_chunks),
        version: "3"
      };

      const model =
        MODELS.transcribe;

      const response = await fetch(
        `https://queue.fal.run/${model}`,
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
        return res.status(response.status).json({
          ok: false,
          error:
            data?.detail ||
            data?.error ||
            "No se pudo transcribir el audio",
          details: data
        });
      }

      return res.status(200).json({
        ok: true,
        action: "transcribe",
        kind: "transcribe",
        model,
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
      CANCELAR TRABAJO
      ===================================================
    */

    if (action === "cancel") {
      const requestId =
        String(
          body.request_id || ""
        );

      const kind =
        String(
          body.kind || "voice"
        );

      const model =
        getModel(kind);

      if (!model) {
        return jsonError(
          400,
          "Tipo no reconocido"
        );
      }

      if (!requestId) {
        return jsonError(
          400,
          "Falta request_id"
        );
      }

      const url =
        `https://queue.fal.run/${model}` +
        `/requests/${encodeURIComponent(requestId)}/cancel`;

      const response = await fetch(
        url,
        {
          method: "PUT",
          headers:
            falHeaders(false),
          cache: "no-store"
        }
      );

      const data =
        await readJson(response);

      return res.status(response.status).json({
        ok: response.ok,
        action: "cancel",
        kind,
        model,
        request_id:
          requestId,
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
