// ÁNGELA PRO V6.1 - Backend para Vercel
// Variables de entorno necesarias:
// GEMINI_API_KEY
// OPENROUTER_API_KEY
// GEMINI_MODEL=gemini-2.5-flash
// OPENROUTER_MODELS=openrouter/free
// AI_PROVIDER_ORDER=gemini,openrouter
// Opcionales: ALLOWED_ORIGIN, SITE_URL, OPENROUTER_WEB=true

const TEMPORARY = new Set([408,409,425,429,500,502,503,504]);

function clean(v,max=60000){return typeof v==="string"?v.trim().slice(0,max):"";}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function normalize(s){return clean(s,12000).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");}

function cors(req,res){
  const configured=clean(process.env.ALLOWED_ORIGIN||"*",2000);
  const origin=clean(req.headers?.origin||"",1000);
  const allowed=configured.split(",").map(x=>x.trim()).filter(Boolean);
  const allow=configured==="*"?"*":(allowed.includes(origin)?origin:(allowed[0]||"*"));

  res.setHeader("Access-Control-Allow-Origin",allow);
  res.setHeader("Vary","Origin");
  res.setHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type,Authorization,Accept");
  res.setHeader("Access-Control-Max-Age","86400");
  res.setHeader("Cache-Control","no-store");
}

function uniqueSources(items=[]){
  const seen=new Set(),out=[];

  for(const s of items){
    const url=clean(s?.url||s?.uri,1800);

    if(!url||seen.has(url))continue;

    seen.add(url);

    out.push({
      title:clean(s?.title||"Fuente",200),
      url
    });

    if(out.length>=6)break;
  }

  return out;
}

function normalizeHistory(body){
  const context=body?.context||body?.contexto||{};

  const raw=
    Array.isArray(body?.history)
      ? body.history
      : Array.isArray(body?.historial)
        ? body.historial
        : Array.isArray(context?.history)
          ? context.history
          : [];

  return raw
    .slice(-16)
    .map(m=>({
      role:(m?.role==="assistant"||m?.role==="model")?"assistant":"user",
      content:clean(m?.content??m?.text,5000)
    }))
    .filter(m=>m.content);
}

function currentMessage(body){
  const direct=clean(
    body?.message||
    body?.prompt||
    body?.pregunta||
    body?.text,
    12000
  );

  if(direct)return direct;

  const rich=clean(body?.mensaje,60000);

  const m=rich.match(
    /Pregunta actual del usuario:\s*([\s\S]*)$/i
  );

  return m
    ? clean(m[1],12000)
    : rich;
}

function isFresh(body,message){
  if(
    body?.fresh===true||
    body?.actualidad===true||
    body?.useWeb===true
  )return true;

  const q=normalize(message);

  // Preguntas "quién es" pueden depender
  // de un cargo, profesión o situación actual.
  if(/^quien\s+es\b/.test(q))return true;

  return /\b(hoy|ahora|actual|actualmente|ultimo|ultima|ultimos|ultimas|reciente|noticia|noticias|esta semana|este mes|presidente actual|gobierno actual|ministro actual|gobernador actual|intendente actual|cotizacion|dolar|precio|resultado|en vivo|elecciones|quien gobierna|clima|pronostico|temperatura|ultimo partido)\b/.test(q);
}

function attachmentText(body){
  return clean(
    body?.attachmentText||
    body?.archivoTexto||
    "",
    42000
  );
}

function binaryAttachments(body){
  const raw=Array.isArray(body?.attachments)
    ? body.attachments
    : [];

  return raw
    .slice(0,4)
    .map(a=>({
      name:clean(a?.name||"adjunto",180),
      type:clean(a?.type||a?.mimeType||"",120),
      data:clean(a?.data||"",3_600_000)
    }))
    .filter(a=>
      a.type &&
      a.data &&
      /^(image|audio)\//i.test(a.type)
    );
}

function systemPrompt(body,fresh,hasAttachments){
  const context=body?.context||body?.contexto||{};

  const assistant=
    clean(
      body?.assistant||
      body?.asistente||
      context?.assistant,
      50
    )||"Ángela";

  const usuario=
    clean(
      body?.usuario||
      body?.user||
      context?.profile,
      100
    )||"Usuario";

  const ubicacion=
    clean(
      body?.ubicacion||
      body?.location,
      300
    );

  const fecha=
    new Date().toLocaleDateString(
      "es-AR",
      {
        timeZone:"America/Argentina/Buenos_Aires",
        year:"numeric",
        month:"long",
        day:"numeric"
      }
    );

  return `Sos ${assistant}, una asistente virtual general, inteligente, clara, rápida y conversacional.
Respondés en español con voseo argentino. Fecha actual en Argentina: ${fecha}.

REGLAS:
- Respondé directamente lo que preguntó el usuario.
- Por defecto respondé en 2 a 5 frases o párrafos cortos; ampliá si lo piden.
- Conservá el hilo de la conversación y entendé referencias como “él”, “ella”, “el prócer”, “el anterior”, “y cuándo nació”, “y dónde murió”.
- Corregí mentalmente errores evidentes de dictado u ortografía usando el contexto.
- Si preguntan “quién es” una persona viva y tiene un cargo, función o actividad pública actual relevante, verificá la actualidad y mencioná ese rol en la primera frase.
- Nunca respondas con una página de desambiguación cuando el contexto permite saber de quién o de qué hablan.
- Nunca digas “Modo de rescate”, que Gemini/OpenRouter falló, que hay saturación, ni muestres errores técnicos o nombres internos de modelos.
- Nunca mandes al usuario a Wikipedia o Google para conseguir la respuesta: contestá vos.
- Si existen fuentes, usalas como respaldo y devolvelas por separado.
- No inventes información. Si algo realmente no puede verificarse, decilo brevemente.
${fresh?"- Esta consulta depende de información actual: verificá datos recientes con búsqueda web disponible antes de responder.":"- Esta consulta no parece requerir actualidad: priorizá conocimiento general y continuidad."}
${hasAttachments?"- Hay archivos, imágenes o audio adjuntos. Analizalos y usalos como base cuando sean relevantes. Si el archivo es un video representado por fotogramas, aclaralo solo si la limitación importa para la respuesta.":""}

DATOS DEL COMEDOR ÁNGEL GUARDIÁN, SOLO SI EL USUARIO PREGUNTA POR EL COMEDOR:
Nombre: Asociación Civil Ángel Guardián para la Niñez de Merlo.
Dirección: García Velloso 4269, Mariano Acosta, Merlo, Buenos Aires.
Teléfonos: 11-3898-0135 / 11-2257-3722.
Email: comedor.angel.guardian@gmail.com
Instagram: @comedorangelguardian_ok
X: @angelguardianc3
Alias Banco Provincia: NIEBLA.REMO.TAMBOR
Web: https://www.comedorangelguardian.com.ar/
Usuario actual: ${usuario}
${ubicacion?`Ubicación informada: ${ubicacion}`:""}`.trim();
}

function weak(reply,question){
  const r=normalize(reply);
  const q=normalize(question);

  if(!r||r.length<15)return true;

  if(
    /reporte tecnico|modo de rescate|servidores?.{0,30}saturad|gemini.{0,25}(fall|error|ocup)|openrouter.{0,25}(fall|error|ocup)/.test(r)
  )return true;

  if(
    /hace referencia a varios|puede referirse a|desambiguacion|varios articulos/.test(r)
  )return true;

  if(
    /busca(?:lo)? en wikipedia|consulta wikipedia|leer mas en wikipedia|te recomiendo buscar|busca en google/.test(r)
  )return true;

  if(
    /^(quien fue|quien es|quien era)\b/.test(q) &&
    /\bsan martin\b/.test(q) &&
    !/jose de san martin|libertador|general argentino/.test(r)
  )return true;

  return false;
}

function cleanReply(reply){
  let t=clean(reply,14000);

  t=t.replace(
    /^\s*⚠️?\s*reporte t[eé]cnico autom[aá]tico[^\n]*\n*/i,
    ""
  );

  t=t.replace(
    /^\s*\(?\s*modo de rescate[^\n\)]*\)?\s*/i,
    ""
  );

  t=t.replace(
    /\n?\s*(?:🔗\s*)?\[?leer m[aá]s en wikipedia\]?\s*(?:\([^\)]*\)|https?:\/\/\S+)\s*$/i,
    ""
  );

  return t.trim();
}

async function fetchTimeout(url,options={},timeout=30000){
  const c=new AbortController();

  const timer=setTimeout(
    ()=>c.abort(),
    timeout
  );

  try{
    return await fetch(
      url,
      {
        ...options,
        signal:c.signal
      }
    );
  }finally{
    clearTimeout(timer);
  }
}

function geminiModels(){
  const raw=clean(
    process.env.GEMINI_MODELS||
    process.env.GEMINI_MODEL||
    "gemini-2.5-flash",
    500
  );

  return [
    ...new Set(
      raw
        .split(",")
        .map(x=>x.trim())
        .filter(Boolean)
    )
  ].slice(0,3);
}

function openRouterModels(){
  const raw=clean(
    process.env.OPENROUTER_MODELS||
    process.env.OPENROUTER_MODEL||
    "openrouter/free",
    1000
  );

  return [
    ...new Set(
      raw
        .split(",")
        .map(x=>x.trim())
        .filter(Boolean)
    )
  ].slice(0,5);
}

function providerOrder(){
  const allowed=new Set([
    "gemini",
    "openrouter"
  ]);

  const order=clean(
    process.env.AI_PROVIDER_ORDER||
    "gemini,openrouter",
    100
  )
  .split(",")
  .map(x=>x.trim().toLowerCase())
  .filter(x=>allowed.has(x));

  return order.length
    ? [...new Set(order)]
    : ["gemini","openrouter"];
}

function geminiSources(data){
  const chunks=
    data?.candidates?.[0]
      ?.groundingMetadata
      ?.groundingChunks||
    [];

  return uniqueSources(
    chunks.map(c=>({
      title:c?.web?.title||"Fuente web",
      url:c?.web?.uri||""
    }))
  );
}

function makeConv(body){
  const message=currentMessage(body);
  const history=normalizeHistory(body);
  const fresh=isFresh(body,message);
  const docText=attachmentText(body);
  const attachments=binaryAttachments(body);

  return {
    message,
    history,
    fresh,
    docText,
    attachments,
    system:systemPrompt(
      body,
      fresh,
      Boolean(
        docText||
        attachments.length
      )
    )
  };
}

function geminiParts(conv,extra=""){
  let prompt=`${conv.system}\n\n`;

  if(conv.history.length){
    prompt+=
      "Conversación reciente:\n"+
      conv.history
        .map(
          m=>
            `${m.role==="assistant"?"ÁNGELA":"Usuario"}: ${m.content}`
        )
        .join("\n")+
      "\n\n";
  }

  if(conv.docText){
    prompt+=
      `CONTEXTO EXTRAÍDO DEL ARCHIVO:\n${conv.docText}\n\n`;
  }

  prompt+=
    `PREGUNTA ACTUAL DEL USUARIO:\n${conv.message}`;

  if(extra){
    prompt+=`\n\n${extra}`;
  }

  if(
    conv.attachments.some(
      a=>a.type.startsWith("audio/")
    )
  ){
    prompt+=
      "\n\nHay un audio adjunto: escuchalo y respondé a lo que dice el usuario.";
  }

  if(
    conv.attachments.some(
      a=>a.type.startsWith("image/")
    )
  ){
    prompt+=
      "\n\nHay una o más imágenes adjuntas: analizalas cuando sean relevantes.";
  }

  const parts=[
    {
      text:prompt
    }
  ];

  for(const a of conv.attachments){
    parts.push({
      inline_data:{
        mime_type:a.type,
        data:a.data
      }
    });
  }

  return parts;
}

async function callGemini(conv,extra=""){
  const key=clean(
    process.env.GEMINI_API_KEY,
    700
  );

  if(!key){
    throw Object.assign(
      new Error(
        "GEMINI_API_KEY no configurada"
      ),
      {
        skip:true
      }
    );
  }

  let last=null;

  for(const model of geminiModels()){
    try{
      const payload={
        contents:[
          {
            role:"user",
            parts:geminiParts(
              conv,
              extra
            )
          }
        ],
        generationConfig:{
          temperature:.32,
          topP:.9,
          maxOutputTokens:1500
        }
      };

      if(conv.fresh){
        payload.tools=[
          {
            google_search:{}
          }
        ];
      }

      const url=
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

      const r=
        await fetchTimeout(
          url,
          {
            method:"POST",
            headers:{
              "Content-Type":"application/json",
              "x-goog-api-key":key
            },
            body:JSON.stringify(payload)
          },
          35000
        );

      const raw=await r.text();

      let data={};

      try{
        data=JSON.parse(raw);
      }catch{}

      if(!r.ok){
        const e=new Error(
          `Gemini ${model} HTTP ${r.status}: ${data?.error?.message||raw||r.statusText}`
        );

        e.status=r.status;
        last=e;

        if(
          TEMPORARY.has(r.status)
        ){
          await sleep(500);
        }

        continue;
      }

      const reply=
        cleanReply(
          (
            data?.candidates?.[0]
              ?.content
              ?.parts||
            []
          )
          .map(
            p=>p?.text||""
          )
          .join("\n")
        );

      if(!reply){
        last=new Error(
          `Gemini ${model} respondió sin texto`
        );

        continue;
      }

      const sources=
        geminiSources(data);

      return {
        reply,
        provider:"gemini",
        model,
        sources,
        verified:
          conv.fresh
            ? sources.length>0
            : undefined
      };

    }catch(e){
      last=e;
    }
  }

  throw last||
    new Error(
      "Gemini no respondió"
    );
}

function openRouterSources(data){
  const msg=
    data?.choices?.[0]
      ?.message||
    {};

  const all=[];

  if(
    Array.isArray(
      data?.citations
    )
  ){
    all.push(
      ...data.citations
    );
  }

  if(
    Array.isArray(
      msg?.citations
    )
  ){
    all.push(
      ...msg.citations
    );
  }

  if(
    Array.isArray(
      msg?.annotations
    )
  ){
    for(const a of msg.annotations){
      const url=
        a?.url_citation?.url||
        a?.url||
        a?.uri;

      if(url){
        all.push({
          title:
            a?.url_citation?.title||
            a?.title||
            "Fuente web",
          url
        });
      }
    }
  }

  return uniqueSources(
    all.map(
      x=>
        typeof x==="string"
          ? {
              title:"Fuente web",
              url:x
            }
          : x
    )
  );
}

function openRouterUserContent(conv,extra=""){
  let text=conv.message;

  if(conv.docText){
    text+=
      `\n\nCONTEXTO EXTRAÍDO DEL ARCHIVO:\n${conv.docText}`;
  }

  if(extra){
    text+=`\n\n${extra}`;
  }

  const imgs=
    conv.attachments.filter(
      a=>a.type.startsWith("image/")
    );

  if(!imgs.length){
    return text;
  }

  return [
    {
      type:"text",
      text
    },
    ...imgs.map(a=>({
      type:"image_url",
      image_url:{
        url:
          `data:${a.type};base64,${a.data}`
      }
    }))
  ];
}

async function callOpenRouter(conv,extra=""){
  const key=clean(
    process.env.OPENROUTER_API_KEY,
    900
  );

  if(!key){
    throw Object.assign(
      new Error(
        "OPENROUTER_API_KEY no configurada"
      ),
      {
        skip:true
      }
    );
  }

  // Si hay audio, Gemini es el proveedor adecuado.
  // OpenRouter queda como respaldo textual/visual.
  const hasAudio=
    conv.attachments.some(
      a=>a.type.startsWith("audio/")
    );

  if(hasAudio){
    throw Object.assign(
      new Error(
        "OpenRouter omitido para audio"
      ),
      {
        skip:true
      }
    );
  }

  let last=null;

  for(
    const model of openRouterModels()
  ){
    try{
      const payload={
        model,
        messages:[
          {
            role:"system",
            content:conv.system
          },
          ...conv.history.map(
            m=>({
              role:m.role,
              content:m.content
            })
          ),
          {
            role:"user",
            content:
              openRouterUserContent(
                conv,
                extra
              )
          }
        ],
        temperature:.32,
        max_tokens:1500,
        provider:{
          allow_fallbacks:true
        }
      };

      if(
        conv.fresh &&
        normalize(
          process.env.OPENROUTER_WEB
        )==="true"
      ){
        payload.plugins=[
          {
            id:"web",
            max_results:5
          }
        ];
      }

      const r=
        await fetchTimeout(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method:"POST",
            headers:{
              "Authorization":
                `Bearer ${key}`,
              "Content-Type":
                "application/json",
              "HTTP-Referer":
                clean(
                  process.env.SITE_URL,
                  1000
                )||
                "https://orion-ia-sooty.vercel.app",
              "X-Title":
                "ÁNGELA Assistant"
            },
            body:
              JSON.stringify(
                payload
              )
          },
          35000
        );

      const raw=
        await r.text();

      let data={};

      try{
        data=JSON.parse(raw);
      }catch{}

      if(!r.ok){
        const e=new Error(
          `OpenRouter ${model} HTTP ${r.status}: ${data?.error?.message||raw||r.statusText}`
        );

        e.status=r.status;
        last=e;

        if(
          TEMPORARY.has(
            r.status
          )
        ){
          await sleep(500);
        }

        continue;
      }

      const content=
        data?.choices?.[0]
          ?.message
          ?.content;

      const reply=
        cleanReply(
          typeof content==="string"
            ? content
            : Array.isArray(content)
              ? content
                  .map(
                    x=>x?.text||""
                  )
                  .join("\n")
              : ""
        );

      if(!reply){
        last=new Error(
          `OpenRouter ${model} respondió sin texto`
        );

        continue;
      }

      return {
        reply,
        provider:"openrouter",
        model:
          data?.model||
          model,
        sources:
          openRouterSources(data)
      };

    }catch(e){
      last=e;
    }
  }

  throw last||
    new Error(
      "OpenRouter no respondió"
    );
}

async function callProvider(name,conv,extra=""){
  return name==="openrouter"
    ? callOpenRouter(conv,extra)
    : callGemini(conv,extra);
}

async function cascade(conv,order,extra=""){
  const errors=[];
  let weakDraft=null;

  for(const provider of order){
    try{
      const result=
        await callProvider(
          provider,
          conv,
          extra
        );

      if(
        weak(
          result.reply,
          conv.message
        )
      ){
        weakDraft=result;

        errors.push(
          `${provider}: respuesta débil`
        );

        continue;
      }

      return {
        result,
        errors
      };

    }catch(e){
      if(!e?.skip){
        errors.push(
          `${provider}: ${e?.message||"error"}`
        );
      }
    }
  }

  if(weakDraft){
    const repair=
`La respuesta anterior fue defectuosa:
${weakDraft.reply}

Respondé nuevamente a la pregunta exacta.
Sé concreta, usá el contexto, no muestres desambiguaciones ni errores internos.`;

    for(
      const provider
      of [...order].reverse()
    ){
      try{
        const result=
          await callProvider(
            provider,
            conv,
            repair
          );

        if(
          !weak(
            result.reply,
            conv.message
          )
        ){
          return {
            result,
            errors
          };
        }

      }catch(e){
        if(!e?.skip){
          errors.push(
            `${provider} revisión: ${e?.message||"error"}`
          );
        }
      }
    }
  }

  return {
    result:null,
    errors
  };
}

export default async function handler(req,res){
  cors(req,res);

  if(req.method==="OPTIONS"){
    return res
      .status(204)
      .end();
  }

  const geminiConfigured=
    Boolean(
      clean(
        process.env.GEMINI_API_KEY,
        700
      )
    );

  const openRouterConfigured=
    Boolean(
      clean(
        process.env.OPENROUTER_API_KEY,
        900
      )
    );

  if(req.method==="GET"){
    return res
      .status(200)
      .json({
        ok:true,
        backend:true,
        configured:
          geminiConfigured||
          openRouterConfigured,
        geminiConfigured,
        openrouterConfigured:
          openRouterConfigured,
        providers:
          providerOrder(),
        geminiModels:
          geminiModels(),
        openrouterModels:
          openRouterModels(),
        multimodal:true,
        documents:true,
        version:"6.1.0"
      });
  }

  if(req.method!=="POST"){
    return res
      .status(405)
      .json({
        error:
          "Método no permitido"
      });
  }

  try{
    const body=
      typeof req.body==="string"
        ? (()=>{
            try{
              return JSON.parse(
                req.body
              );
            }catch{
              return {
                message:req.body
              };
            }
          })()
        : (
            req.body||
            {}
          );

    if(
      body?.mode==="diagnostic"||
      body?.diagnostic===true
    ){
      return res
        .status(200)
        .json({
          ok:true,
          backend:true,
          configured:
            geminiConfigured||
            openRouterConfigured,
          geminiConfigured,
          openrouterConfigured:
            openRouterConfigured,
          geminiOk:
            geminiConfigured,
          verified:
            geminiConfigured||
            openRouterConfigured,
          providers:
            providerOrder(),
          geminiModels:
            geminiModels(),
          openrouterModels:
            openRouterModels(),
          webGrounding:true,
          multimodal:true,
          documents:true,
          version:"6.1.0"
        });
    }

    const conv=
      makeConv(body);

    if(!conv.message){
      return res
        .status(400)
        .json({
          error:
            "Falta el mensaje"
        });
    }

    let order=
      providerOrder();

    if(
      body?.forceAlternate===true
    ){
      order=[
        ...order
      ].reverse();
    }

    const extra=
      body?.repair===true &&
      body?.badReply
        ? `La respuesta anterior fue mala:
${clean(body.badReply,2500)}
Rehacela correctamente.`
        : "";

    const {
      result,
      errors
    }=
      await cascade(
        conv,
        order,
        extra
      );

    if(result){
      return res
        .status(200)
        .json({
          ok:true,
          respuesta:
            result.reply,
          reply:
            result.reply,
          provider:
            result.provider,
          model:
            result.model,
          sources:
            result.sources||[],
          fresh:
            conv.fresh,
          verified:
            result.verified
        });
    }

    console.error(
      "ÁNGELA: todos los proveedores fallaron",
      errors
    );

    return res
      .status(503)
      .json({
        ok:false,
        error:
          "No pude obtener una respuesta confiable en este momento.",
        detalle:
          "Revisá los logs de Vercel para ver el detalle técnico."
      });

  }catch(error){
    console.error(
      "ERROR SERVIDOR ÁNGELA:",
      error
    );

    return res
      .status(500)
      .json({
        ok:false,
        error:
          "Error interno del servidor",
        detalle:
          "Revisá los logs de Vercel para ver el detalle técnico."
      });
  }
}
