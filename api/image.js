module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const FAL_KEY = process.env.FAL_KEY || "";
  const HF_TOKEN = process.env.HF_TOKEN || "";
  const HF_VIDEO_ENDPOINT = process.env.HF_VIDEO_ENDPOINT || "";
  // Wan 2.2 Gradio Space. HF_VIDEO_ENDPOINT antiguo no es necesario.
  const WAN_SPACE = "https://upsampler-wan-2-2-14b-image-to-video.hf.space";
  const WAN_API = "generate_video";
  const WAN_PREFIX = "wan22:";
  const WAN_DEFAULT_NEGATIVE = "low quality, blurry, static, deformed hands, extra limbs, subtitles, watermark";

  function wanError(status, msg) { return res.status(status).json({ok:false, provider:"huggingface-wan22", error:msg}); }
  function wanHeaders(json = false) {
    return { ...(HF_TOKEN ? {Authorization:`Bearer ${HF_TOKEN}`} : {}), ...(json ? {"Content-Type":"application/json"} : {}) };
  }
  function wanBase() { return WAN_SPACE.replace(/\/+$/, ""); }
  function wanId(id) { return typeof id === "string" && id.startsWith(WAN_PREFIX) && /^[a-zA-Z0-9_-]{8,200}$/.test(id.slice(WAN_PREFIX.length)); }
  function wanFileUrl(v) {
    if (!v) return "";
    if (typeof v === "string") return v.startsWith("http") ? v : `${wanBase()}/gradio_api/file=${encodeURIComponent(v)}`;
    if (typeof v === "object") return wanFileUrl(v.url || v.path || v.name);
    return "";
  }
  function wanOutput(data) {
    const a = Array.isArray(data) ? data : (data?.data || []);
    const v = Array.isArray(a) ? a[0] : a;
    return wanFileUrl(v);
  }
  function parseWanSSE(raw) {
    let result = null, failure = null, completed = false;
    for (const block of raw.split(/\r?\n\r?\n/)) {
      let event = "", payload = "";
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) payload += line.slice(5).trim();
      }
      if (!payload) continue;
      let parsed; try { parsed = JSON.parse(payload); } catch { continue; }
      if (event === "complete") { completed = true; result = parsed; }
      if (event === "error") { failure = parsed?.message || parsed?.error || "Wan rechazó el trabajo"; }
    }
    return {result, failure, completed};
  }
  async function wanUpload(url) {
    if (/^data:image\/(png|jpeg|webp);base64,/i.test(url)) {
      const match = url.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/i);
      if (!match) throw new Error("Imagen Base64 inválida");
      const mime = match[1].toLowerCase();
      if (match[2].length > 14*1024*1024) throw new Error("Imagen Base64 demasiado grande");
      const bytes = Buffer.from(match[2], "base64");
      if (bytes.length > 10*1024*1024) throw new Error("Imagen supera 10 MB");
      const fd = new FormData();
      fd.append("files", new Blob([bytes], {type:mime}), mime === "image/png" ? "imagen.png" : mime === "image/webp" ? "imagen.webp" : "imagen.jpg");
      const uploadRes = await fetch(`${wanBase()}/gradio_api/upload`, {method:"POST",headers:wanHeaders(),body:fd,signal:AbortSignal.timeout(25000)});
      if (!uploadRes.ok) throw new Error(`Wan no aceptó imagen (${uploadRes.status}): ${(await uploadRes.text()).slice(0,200)}`);
      const paths = await uploadRes.json();
      const path = Array.isArray(paths) ? paths[0] : paths?.files?.[0];
      if (!path || typeof path !== "string") throw new Error("Wan no devolvió ruta de imagen");
      return {path,meta:{_type:"gradio.FileData"}};
    }
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") throw new Error("La imagen debe estar alojada en HTTPS o ser Base64 válida");
    // Evitar accesos a servicios internos por URLs proporcionadas por el navegador.
    const h = parsed.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h === "0.0.0.0" || /^127\.|^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2[0-9]|3[01])\./.test(h) || h === "::1") throw new Error("URL de imagen no permitida");
    const imageRes = await fetch(url, {signal:AbortSignal.timeout(18000), redirect:"error"});
    if (!imageRes.ok) throw new Error(`No pude descargar la imagen (${imageRes.status})`);
    const mime = (imageRes.headers.get("content-type") || "").split(";")[0].toLowerCase();
    if (!["image/png","image/jpeg","image/webp"].includes(mime)) throw new Error("Usá una imagen JPG, PNG o WEBP accesible mediante URL");
    const b = await imageRes.arrayBuffer();
    if (b.byteLength > 10*1024*1024) throw new Error("La imagen supera 10 MB");
    const fd = new FormData();
    fd.append("files", new Blob([b],{type:mime}), mime === "image/png" ? "imagen.png" : mime === "image/webp" ? "imagen.webp" : "imagen.jpg");
    const uploadRes = await fetch(`${wanBase()}/gradio_api/upload`, {method:"POST",headers:wanHeaders(),body:fd,signal:AbortSignal.timeout(25000)});
    if (!uploadRes.ok) throw new Error(`Wan no aceptó la imagen (${uploadRes.status}): ${(await uploadRes.text()).slice(0,200)}`);
    const paths = await uploadRes.json();
    const path = Array.isArray(paths) ? paths[0] : paths?.files?.[0];
    if (!path || typeof path !== "string") throw new Error("Wan no devolvió la ruta de imagen esperada");
    return {path,meta:{_type:"gradio.FileData"}};
  }
  async function wanSubmit(body) {
    if (!HF_TOKEN) return wanError(503,"Falta HF_TOKEN en Vercel");
    const imageUrl = body.image_url || body.start_image_url || body.input?.image_url || body.input?.start_image_url;
    if (!imageUrl) return wanError(400,"Wan 2.2 necesita una imagen inicial (image_url)");
    try {
      const image = await wanUpload(String(imageUrl));
      const endUrl = body.end_image_url || body.input?.end_image_url;
      const end = endUrl ? await wanUpload(String(endUrl)) : null;
      const prompt = String(body.prompt || body.input?.prompt || "Make this image come alive with natural cinematic motion").slice(0,2000);
      const duration = Math.max(0.5,Math.min(5,Number(body.duration_seconds || body.duration || 3) || 3));
      const steps = Math.max(1,Math.min(12,Math.round(Number(body.steps || 6) || 6)));
      const data = [image,prompt,steps,String(body.negative_prompt || WAN_DEFAULT_NEGATIVE),duration,1,1,42,true,end];
      const r = await fetch(`${wanBase()}/gradio_api/call/${WAN_API}`, {method:"POST",headers:wanHeaders(true),body:JSON.stringify({data}),signal:AbortSignal.timeout(20000)});
      const raw = await r.text();
      if (!r.ok) return wanError(r.status,`Wan rechazó la solicitud: ${raw.slice(0,400)}`);
      let payload; try { payload=JSON.parse(raw); } catch { return wanError(502,`Respuesta inesperada de Wan: ${raw.slice(0,180)}`); }
      const eventId = payload.event_id;
      if (!eventId || !/^[a-zA-Z0-9_-]{8,200}$/.test(eventId)) return wanError(502,"Wan no devolvió un identificador de trabajo válido");
      return res.status(200).json({ok:true,action:"submit",kind:"video",provider:"huggingface-wan22",request_id:WAN_PREFIX+eventId,status:"IN_QUEUE",model:"Wan 2.2 14B",note:"Consultá action=result con request_id hasta que esté COMPLETED"});
    } catch(e) { return wanError(502,`No se pudo iniciar Wan 2.2: ${e.message}`); }
  }
  async function wanResult(requestId) {
    if (!HF_TOKEN) return wanError(503,"Falta HF_TOKEN en Vercel");
    if (!wanId(requestId)) return wanError(400,"request_id de Wan inválido");
    const id = requestId.slice(WAN_PREFIX.length);
    try {
      // La respuesta Gradio es un flujo SSE. Esperamos un período corto y
      // devolvemos PENDING si continúa procesando para evitar timeout Vercel.
      const ctrl = new AbortController();
      const timer = setTimeout(()=>ctrl.abort(), 17000);
      let raw="";
      try {
        const r = await fetch(`${wanBase()}/gradio_api/call/${WAN_API}/${encodeURIComponent(id)}`,{headers:{...wanHeaders(),Accept:"text/event-stream"},signal:ctrl.signal,cache:"no-store"});
        if (!r.ok) return wanError(r.status,`Wan no pudo consultar el trabajo (${r.status})`);
        const reader=r.body.getReader(); const decoder=new TextDecoder();
        while (raw.length < 180000) {
          const {value,done}=await reader.read(); if(done)break;
          raw+=decoder.decode(value,{stream:true});
          const parsed=parseWanSSE(raw);
          if(parsed.completed || parsed.failure) { try {await reader.cancel();} catch {} break; }
        }
      } catch(e) { if(e.name!=="AbortError") throw e; }
      finally {clearTimeout(timer);}
      const parsed=parseWanSSE(raw);
      if(parsed.failure) return wanError(502,String(parsed.failure));
      if(parsed.completed) {
        const videoUrl=wanOutput(parsed.result);
        if(!videoUrl) return wanError(502,"Wan finalizó, pero no se encontró la URL del MP4");
        return res.status(200).json({ok:true,action:"result",kind:"video",provider:"huggingface-wan22",request_id:requestId,status:"COMPLETED",video_url:videoUrl,video:{url:videoUrl}});
      }
      return res.status(200).json({ok:true,action:"result",kind:"video",provider:"huggingface-wan22",request_id:requestId,status:"PENDING",retry_after_seconds:8});
    } catch(e) { return wanError(502,`Error consultando Wan: ${e.message}`); }
  }


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
      hfTokenConfigured: Boolean(HF_TOKEN),
      hfVideoEndpointConfigured: Boolean(HF_VIDEO_ENDPOINT),

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

  // Diagnóstico seguro: no invoca proveedores, no usa créditos y no expone secretos.
  if (req.method === "GET" && req.query?.action === "diagnostic") {
    return res.status(200).json({
      ok: true,
      module: "ANGELA STUDIO IA - video",
      hfTokenConfigured: Boolean(HF_TOKEN),
      hfVideoEndpointConfigured: Boolean(HF_VIDEO_ENDPOINT),
      falKeyConfigured: Boolean(FAL_KEY),
      supabaseConfigured: Boolean(SUPABASE_URL && SUPABASE_PUBLIC_KEY),
      activeVideoProvider: "huggingface-wan22",
      hfVideoGenerationEnabled: Boolean(HF_TOKEN),
       wanSpace: WAN_SPACE,
       wanIntegration: "Gradio call/generate_video (requiere prueba real)",
      note: "Solo diagnóstico. No genera videos ni consume créditos. Un token de Hugging Face no equivale a un endpoint de video disponible."
    });
  }

  // Fal.ai es opcional: solo se utiliza si se elige expresamente.
  // Hugging Face necesita un endpoint de VIDEO operativo, no solo HF_TOKEN.


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

    if (kind === "video" && wanId(requestId)) {
      if (action === "result" || action === "status") return wanResult(requestId);
      return jsonError(400,"Acción Wan no reconocida");
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
      if (!FAL_KEY) return jsonError(503, "Fal.ai no está configurado. Seleccioná Hugging Face o configurá FAL_KEY.");
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
