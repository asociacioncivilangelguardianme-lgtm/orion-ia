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
    economico: {
      text: "fal-ai/hunyuan-video-v1.5/text-to-video",
      image: "fal-ai/wan/v2.2-5b/image-to-video",
      video: "fal-ai/wan/v2.2-a14b/video-to-video"
    },

    calidad: {
      text: "fal-ai/vidu/q2/text-to-video",
      image: "fal-ai/vidu/q2/image-to-video/pro",
      video: "fal-ai/wan/v2.2-a14b/video-to-video"
    },

    premium: {
      text: "fal-ai/kling-video/v3/standard/text-to-video",
      image: "fal-ai/kling-video/v3/standard/image-to-video",
      video: "fal-ai/wan/v2.2-a14b/video-to-video"
    }
  };

  const ALLOWED_MODELS = new Set(
    Object.values(MODELS).flatMap(x => Object.values(x))
  );

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

  function getModel(mode = "economico", type = "text", explicitModel = "") {
    if (explicitModel && ALLOWED_MODELS.has(explicitModel)) {
      return explicitModel;
    }

    const selectedMode = MODELS[mode] ? mode : "economico";
    const selectedType =
      ["text", "image", "video"].includes(type)
        ? type
        : "text";

    return MODELS[selectedMode][selectedType];
  }

  /*
    =========================================================
    GET SIN ACCIÓN = PRUEBA SEGURA
    No genera videos ni consume créditos.
    =========================================================
  */

  if (req.method === "GET" && !req.query?.action) {
    return res.status(200).json({
      ok: true,
      studio: "ANGELA STUDIO IA",
      falConfigured: Boolean(FAL_KEY),
      supabaseConfigured:
        Boolean(SUPABASE_URL && SUPABASE_PUBLIC_KEY),

      modes: {
        economico: "Económico / rápido",
        calidad: "Mayor calidad",
        premium: "Premium"
      },

      types: [
        "text",
        "image",
        "video"
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
    =========================================================
    TODAS LAS FUNCIONES QUE PUEDEN USAR FAL
    EXIGEN USUARIO AUTENTICADO EN ÁNGELA
    =========================================================
  */

  const user = await requireAngelaUser();

  if (!user) {
    return jsonError(
      401,
      "Necesitás iniciar sesión en ÁNGELA STUDIO IA"
    );
  }

  /*
    =========================================================
    CONSULTAR ESTADO / RESULTADO POR GET
    =========================================================
  */

  if (req.method === "GET") {
    const action = String(req.query?.action || "");
    const requestId = String(req.query?.request_id || "");
    const mode = String(req.query?.mode || "economico");
    const type = String(req.query?.type || "text");
    const explicitModel = String(req.query?.model || "");

    const model = getModel(
      mode,
      type,
      explicitModel
    );

    if (!requestId) {
      return jsonError(
        400,
        "Falta request_id"
      );
    }

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
        model,
        request_id: requestId,
        ...data
      });
    }

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

      return res.status(response.status).json({
        ok: response.ok,
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
    =========================================================
    POST
    submit = crear video
    cancel = cancelar trabajo
    =========================================================
  */

  if (req.method === "POST") {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : (req.body || {});

    const action = body.action || "submit";

    const mode =
      String(body.mode || "economico").toLowerCase();

    const type =
      String(body.type || "text").toLowerCase();

    const model = getModel(
      mode,
      type,
      String(body.model || "")
    );

    /*
      ---------------------------------------------------------
      CANCELAR
      ---------------------------------------------------------
    */

    if (action === "cancel") {
      const requestId = String(
        body.request_id || ""
      );

      if (!requestId) {
        return jsonError(
          400,
          "Falta request_id"
        );
      }

      const url =
        `https://queue.fal.run/${model}` +
        `/requests/${encodeURIComponent(requestId)}/cancel`;

      const response = await fetch(url, {
        method: "PUT",
        headers: falHeaders(false),
        cache: "no-store"
      });

      const data = await readJson(response);

      return res.status(response.status).json({
        ok: response.ok,
        action: "cancel",
        model,
        request_id: requestId,
        ...data
      });
    }

    /*
      ---------------------------------------------------------
      CREAR VIDEO
      ---------------------------------------------------------
    */

    if (action === "submit") {
      const input = {
        ...(body.input || {})
      };

      /*
        ÁNGELA puede mandar datos simples
        o un input avanzado completo.
      */

      if (
        body.prompt &&
        !input.prompt
      ) {
        input.prompt = body.prompt;
      }

      /*
        IMAGEN → VIDEO
      */

      if (type === "image") {
        const imageUrl =
          body.image_url ||
          body.start_image_url ||
          input.image_url ||
          input.start_image_url;

        if (!imageUrl) {
          return jsonError(
            400,
            "Para imagen a video falta image_url"
          );
        }

        if (model.includes("kling-video")) {
          if (!input.start_image_url) {
            input.start_image_url = imageUrl;
          }
        } else {
          if (!input.image_url) {
            input.image_url = imageUrl;
          }
        }
      }

      /*
        VIDEO → VIDEO
      */

      if (type === "video") {
        const videoUrl =
          body.video_url ||
          input.video_url;

        if (!videoUrl) {
          return jsonError(
            400,
            "Para video a video falta video_url"
          );
        }

        if (!input.video_url) {
          input.video_url = videoUrl;
        }
      }

      /*
        TEXTO → VIDEO
      */

      if (
        type === "text" &&
        !input.prompt
      ) {
        return jsonError(
          400,
          "Escribí una idea o prompt para crear el video"
        );
      }

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
            "fal.ai rechazó la generación",
          model,
          details: data
        });
      }

      return res.status(200).json({
        ok: true,
        action: "submit",
        mode,
        type,
        model,
        request_id: data.request_id,
        status_url: data.status_url,
        response_url: data.response_url,
        cancel_url: data.cancel_url
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
