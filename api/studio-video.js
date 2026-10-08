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

  /*
  ==========================================================
  MODELOS DE VIDEO
  ==========================================================
  */

  const VIDEO_MODELS = {
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

  /*
  ==========================================================
  MODELOS DE RENDER FINAL
  ==========================================================
  */

  const RENDER_MODELS = {
    merge: "fal-ai/ffmpeg-api/merge-videos",
    compose: "fal-ai/ffmpeg-api/compose",
    audioVideo: "fal-ai/ffmpeg-api/merge-audio-video",
    subtitles: "fal-ai/workflow-utilities/auto-subtitle"
  };

  const ALLOWED_VIDEO_MODELS = new Set(
    Object.values(VIDEO_MODELS)
      .flatMap((x) => Object.values(x))
  );

  /*
  ==========================================================
  UTILIDADES
  ==========================================================
  */

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

  function getVideoModel(
    mode = "economico",
    type = "text",
    explicitModel = ""
  ) {
    if (
      explicitModel &&
      ALLOWED_VIDEO_MODELS.has(explicitModel)
    ) {
      return explicitModel;
    }

    const selectedMode =
      VIDEO_MODELS[mode]
        ? mode
        : "economico";

    const selectedType =
      ["text", "image", "video"].includes(type)
        ? type
        : "text";

    return VIDEO_MODELS[selectedMode][selectedType];
  }

  function getRenderModel(kind) {
    if (kind === "merge") {
      return RENDER_MODELS.merge;
    }

    if (kind === "compose") {
      return RENDER_MODELS.compose;
    }

    if (kind === "audio-video") {
      return RENDER_MODELS.audioVideo;
    }

    if (kind === "subtitles") {
      return RENDER_MODELS.subtitles;
    }

    return null;
  }

  /*
  ==========================================================
  PRUEBA SEGURA
  ==========================================================
  NO GENERA VIDEO
  NO USA CRÉDITOS
  */

  if (
    req.method === "GET" &&
    !req.query?.action
  ) {
    return res.status(200).json({
      ok: true,

      studio: "ANGELA STUDIO IA",

      module:
        "Video + Render MP4 Final",

      falConfigured:
        Boolean(FAL_KEY),

      supabaseConfigured:
        Boolean(
          SUPABASE_URL &&
          SUPABASE_PUBLIC_KEY
        ),

      videoModes: {
        economico:
          "Económico / rápido",

        calidad:
          "Mayor calidad",

        premium:
          "Premium"
      },

      videoTypes: [
        "text",
        "image",
        "video"
      ],

      renderFunctions: [
        "unir-escenas",
        "agregar-voz-y-musica",
        "agregar-audio",
        "subtitulos",
        "mp4-final"
      ],

      pipeline: [
        "1. crear escenas",
        "2. unir escenas",
        "3. agregar voz",
        "4. agregar musica",
        "5. agregar subtitulos",
        "6. mp4 final"
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
  ==========================================================
  PROTECCIÓN
  ==========================================================
  Todo lo que puede usar créditos exige
  sesión iniciada en ÁNGELA.
  */

  const user =
    await requireAngelaUser();

  if (!user) {
    return jsonError(
      401,
      "Necesitás iniciar sesión en ÁNGELA STUDIO IA"
    );
  }

  /*
  ==========================================================
  GET
  CONSULTAR ESTADO / RESULTADO
  ==========================================================
  */

  if (req.method === "GET") {
    const action =
      String(req.query?.action || "");

    const kind =
      String(req.query?.kind || "video");

    const requestId =
      String(req.query?.request_id || "");

    if (!requestId) {
      return jsonError(
        400,
        "Falta request_id"
      );
    }

    let model = "";

    /*
    VIDEO IA
    */

    if (kind === "video") {
      model = getVideoModel(
        String(
          req.query?.mode || "economico"
        ),

        String(
          req.query?.type || "text"
        ),

        String(
          req.query?.model || ""
        )
      );
    }

    /*
    RENDER
    */

    if (kind !== "video") {
      model =
        getRenderModel(kind);
    }

    if (!model) {
      return jsonError(
        400,
        "Tipo de trabajo no reconocido"
      );
    }

    /*
    ESTADO
    */

    if (action === "status") {
      const url =
        `https://queue.fal.run/${model}` +
        `/requests/${encodeURIComponent(requestId)}/status`;

      const response =
        await fetch(
          url,
          {
            method: "GET",
            headers:
              falHeaders(false),
            cache: "no-store"
          }
        );

      const data =
        await readJson(response);

      return res
        .status(response.status)
        .json({
          ok: response.ok,

          action:
            "status",

          kind,

          model,

          request_id:
            requestId,

          ...data
        });
    }

    /*
    RESULTADO
    */

    if (action === "result") {
      const url =
        `https://queue.fal.run/${model}` +
        `/requests/${encodeURIComponent(requestId)}`;

      const response =
        await fetch(
          url,
          {
            method: "GET",
            headers:
              falHeaders(false),
            cache: "no-store"
          }
        );

      const data =
        await readJson(response);

      const output =
        data?.data || data;

      let videoUrl = "";

      if (kind === "video") {
        videoUrl =
          output?.video?.url ||
          output?.video_url ||
          "";
      }

      if (kind === "merge") {
        videoUrl =
          output?.video?.url || "";
      }

      if (kind === "compose") {
        videoUrl =
          output?.video_url ||
          output?.video?.url ||
          "";
      }

      if (kind === "audio-video") {
        videoUrl =
          output?.video?.url ||
          output?.video_url ||
          "";
      }

      if (kind === "subtitles") {
        videoUrl =
          output?.video?.url || "";
      }

      return res
        .status(response.status)
        .json({
          ok: response.ok,

          action:
            "result",

          kind,

          model,

          request_id:
            requestId,

          video_url:
            videoUrl,

          thumbnail_url:
            output?.thumbnail_url || "",

          transcription:
            output?.transcription || "",

          subtitle_count:
            output?.subtitle_count || 0,

          data
        });
    }

    return jsonError(
      400,
      "Acción GET no reconocida"
    );
  }

  /*
  ==========================================================
  POST
  ==========================================================
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
        body.action || "submit"
      ).toLowerCase();

    /*
    ========================================================
    CREAR VIDEO IA
    ========================================================
    */

    if (action === "submit") {
      const mode =
        String(
          body.mode || "economico"
        ).toLowerCase();

      const type =
        String(
          body.type || "text"
        ).toLowerCase();

      const model =
        getVideoModel(
          mode,
          type,
          String(
            body.model || ""
          )
        );

      const input = {
        ...(body.input || {})
      };

      if (
        body.prompt &&
        !input.prompt
      ) {
        input.prompt =
          body.prompt;
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

        if (
          model.includes(
            "kling-video"
          )
        ) {
          input.start_image_url =
            imageUrl;
        } else {
          input.image_url =
            imageUrl;
        }

        if (!input.prompt) {
          input.prompt =
            "Animate this image naturally with realistic movement and camera motion.";
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

        input.video_url =
          videoUrl;

        if (!input.prompt) {
          input.prompt =
            "Enhance this video while preserving the main subjects and scene.";
        }
      }

      const response =
        await fetch(
          `https://queue.fal.run/${model}`,
          {
            method: "POST",
            headers:
              falHeaders(true),
            body:
              JSON.stringify(input),
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
              "fal.ai rechazó la generación",

            model,

            details:
              data
          });
      }

      return res.status(200).json({
        ok: true,

        action:
          "submit",

        kind:
          "video",

        mode,

        type,

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
    ========================================================
    UNIR ESCENAS
    ========================================================
    */

    if (action === "merge-scenes") {
      const videoUrls =
        Array.isArray(
          body.video_urls
        )
          ? body.video_urls.filter(Boolean)
          : [];

      if (videoUrls.length < 2) {
        return jsonError(
          400,
          "Se necesitan por lo menos 2 escenas"
        );
      }

      const input = {
        video_urls:
          videoUrls
      };

      /*
      FORMATOS
      */

      if (
        body.format === "vertical"
      ) {
        input.resolution =
          "portrait_16_9";
      }

      if (
        body.format === "horizontal"
      ) {
        input.resolution =
          "landscape_16_9";
      }

      if (
        body.format === "square"
      ) {
        input.resolution =
          "square_hd";
      }

      if (body.target_fps) {
        input.target_fps =
          Number(
            body.target_fps
          );
      }

      const model =
        RENDER_MODELS.merge;

      const response =
        await fetch(
          `https://queue.fal.run/${model}`,
          {
            method: "POST",
            headers:
              falHeaders(true),
            body:
              JSON.stringify(input),
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
              "No se pudieron unir las escenas",

            details:
              data
          });
      }

      return res.status(200).json({
        ok: true,

        action:
          "merge-scenes",

        kind:
          "merge",

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
    ========================================================
    AGREGAR VOZ + MÚSICA
    ========================================================
    */

    if (action === "compose") {
      const videoUrl =
        String(
          body.video_url || ""
        ).trim();

      const voiceUrl =
        String(
          body.voice_url || ""
        ).trim();

      const musicUrl =
        String(
          body.music_url || ""
        ).trim();

      if (!videoUrl) {
        return jsonError(
          400,
          "Falta video_url"
        );
      }

      const durationMs =
        Math.max(
          1000,
          Number(
            body.duration_ms ||
            30000
          )
        );

      const tracks = [
        {
          id:
            "video-principal",

          type:
            "video",

          keyframes: [
            {
              timestamp:
                0,

              duration:
                durationMs,

              url:
                videoUrl
            }
          ]
        }
      ];

      /*
      VOZ
      */

      if (voiceUrl) {
        tracks.push({
          id:
            "voz-angela",

          type:
            "audio",

          keyframes: [
            {
              timestamp:
                0,

              duration:
                durationMs,

              url:
                voiceUrl
            }
          ]
        });
      }

      /*
      MÚSICA
      */

      if (musicUrl) {
        tracks.push({
          id:
            "musica-fondo",

          type:
            "audio",

          keyframes: [
            {
              timestamp:
                0,

              duration:
                durationMs,

              url:
                musicUrl
            }
          ]
        });
      }

      const model =
        RENDER_MODELS.compose;

      const response =
        await fetch(
          `https://queue.fal.run/${model}`,
          {
            method: "POST",
            headers:
              falHeaders(true),
            body:
              JSON.stringify({
                tracks
              }),
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
              "No se pudo componer el video",

            details:
              data
          });
      }

      return res.status(200).json({
        ok: true,

        action:
          "compose",

        kind:
          "compose",

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
    ========================================================
    AGREGAR UN AUDIO
    ========================================================
    */

    if (action === "add-audio") {
      const videoUrl =
        String(
          body.video_url || ""
        ).trim();

      const audioUrl =
        String(
          body.audio_url || ""
        ).trim();

      if (
        !videoUrl ||
        !audioUrl
      ) {
        return jsonError(
          400,
          "Falta video_url o audio_url"
        );
      }

      const model =
        RENDER_MODELS.audioVideo;

      const input = {
        video_url:
          videoUrl,

        audio_url:
          audioUrl,

        start_offset:
          Number(
            body.start_offset || 0
          )
      };

      const response =
        await fetch(
          `https://queue.fal.run/${model}`,
          {
            method: "POST",
            headers:
              falHeaders(true),
            body:
              JSON.stringify(input),
            cache:
              "no-store"
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
              "No se pudo agregar el audio",

            details:
              data
          });
      }

      return res.status(200).json({
        ok: true,

        action:
          "add-audio",

        kind:
          "audio-video",

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
    ========================================================
    SUBTÍTULOS AUTOMÁTICOS
    ========================================================
    */

    if (action === "subtitles") {
      const videoUrl =
        String(
          body.video_url || ""
        ).trim();

      if (!videoUrl) {
        return jsonError(
          400,
          "Falta video_url"
        );
      }

      const model =
        RENDER_MODELS.subtitles;

      const input = {
        video_url:
          videoUrl,

        language:
          body.language || "es",

        font_name:
          body.font_name ||
          "Montserrat",

        font_size:
          Number(
            body.font_size || 90
          ),

        font_weight:
          body.font_weight ||
          "bold",

        font_color:
          body.font_color ||
          "white",

        highlight_color:
          body.highlight_color ||
          "yellow",

        stroke_width:
          Number(
            body.stroke_width || 3
          ),

        stroke_color:
          body.stroke_color ||
          "black",

        background_color:
          body.background_color ||
          "none",

        position:
          body.position ||
          "bottom",

        y_offset:
          Number(
            body.y_offset || 50
          ),

        words_per_subtitle:
          Number(
            body.words_per_subtitle || 3
          ),

        enable_animation:
          body.enable_animation === undefined
            ? true
            : Boolean(
                body.enable_animation
              )
      };

      const response =
        await fetch(
          `https://queue.fal.run/${model}`,
          {
            method: "POST",
            headers:
              falHeaders(true),
            body:
              JSON.stringify(input),
            cache:
              "no-store"
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
              "No se pudieron agregar los subtítulos",

            details:
              data
          });
      }

      return res.status(200).json({
        ok: true,

        action:
          "subtitles",

        kind:
          "subtitles",

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
    ========================================================
    CANCELAR
    ========================================================
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

      const kind =
        String(
          body.kind || "video"
        );

      let model = "";

      if (kind === "video") {
        model =
          getVideoModel(
            String(
              body.mode ||
              "economico"
            ),

            String(
              body.type ||
              "text"
            ),

            String(
              body.model ||
              ""
            )
          );
      } else {
        model =
          getRenderModel(kind);
      }

      if (!model) {
        return jsonError(
          400,
          "Tipo de trabajo no reconocido"
        );
      }

      const url =
        `https://queue.fal.run/${model}` +
        `/requests/${encodeURIComponent(requestId)}/cancel`;

      const response =
        await fetch(
          url,
          {
            method: "PUT",
            headers:
              falHeaders(false),
            cache:
              "no-store"
          }
        );

      const data =
        await readJson(response);

      return res
        .status(response.status)
        .json({
          ok: response.ok,

          action:
            "cancel",

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
