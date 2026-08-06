// ÁNGELA PRO v4 - Backend multi-IA con respuestas directas y datos actuales
// Vercel Environment Variables:
// GEMINI_API_KEY, OPENROUTER_API_KEY
// Opcionales: GEMINI_MODEL, OPENROUTER_MODELS, AI_PROVIDER_ORDER, ALLOWED_ORIGIN, SITE_URL

const TEMPORARY = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

function cors(req,res){
  const configured=process.env.ALLOWED_ORIGIN||"*";
  const origin=req.headers?.origin||"";
  const allow=configured==="*"?"*":(
    configured.split(",").map(x=>x.trim()).includes(origin)
      ? origin
      : configured.split(",")[0].trim()
  );

  res.setHeader("Access-Control-Allow-Origin",allow||"*");
  res.setHeader("Vary","Origin");
  res.setHeader("Access-Control-Allow-Methods","POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type, Authorization");
  res.setHeader("Cache-Control","no-store");
}

function clean(v,max=60000){
  return typeof v==="string" ? v.trim().slice(0,max) : "";
}

function sleep(ms){
  return new Promise(r=>setTimeout(r,ms));
}

function normalize(s){
  return clean(s,10000)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"");
}

function uniqueSources(items=[]){
  const seen=new Set();
  const out=[];

  for(const s of items){
    const url=clean(s?.url||s?.uri,1500);

    if(!url || seen.has(url)) continue;

    seen.add(url);

    out.push({
      title:clean(s?.title||"Fuente",180),
      url
    });

    if(out.length>=6) break;
  }

  return out;
}

function isFreshQuestion(body,message){
  if(
    body?.fresh===true ||
    body?.actualidad===true ||
    body?.useWeb===true
  ) return true;

  const p=normalize(message);

  return /\b(hoy|ahora|actual|actualmente|ultimo|ultima|ultimos|ultimas|reciente|noticia|noticias|esta semana|este mes|presidente actual|gobierno actual|ministro actual|gobernador actual|intendente actual|cotizacion|dolar|precio|resultado|en vivo|elecciones|quien gobierna|clima|pronostico)\b/.test(p);
}

function normalizeHistory(body){
  const raw=
    Array.isArray(body?.history)
      ? body.history
      : Array.isArray(body?.historial)
        ? body.historial
        : [];

  return raw
    .slice(-16)
    .map(m=>({
      role:m?.role==="assistant" ? "assistant" : "user",
      content:clean(m?.content||m?.text,5000)
    }))
    .filter(m=>m.content);
}

function baseSystem(body,fresh){
  const assistant=
    clean(body?.assistant||body?.asistente,50) || "Ángela";

  const date=new Date().toLocaleDateString(
    "es-AR",
    {
      timeZone:"America/Argentina/Buenos_Aires",
      year:"numeric",
      month:"long",
      day:"numeric"
    }
  );

  return `Sos ${assistant}, una asistente virtual general, clara y conversacional. Fecha actual en Argentina: ${date}.

REGLAS OBLIGATORIAS:

- Respondé primero y directamente lo que preguntó el usuario.
- Evitá introducciones innecesarias.
- Por defecto usá 2 a 5 frases o párrafos cortos.
- Ampliá solamente si el usuario pide más detalles.
- Conservá siempre el hilo de la conversación.
- Resolvé referencias como “él”, “ella”, “el prócer”, “ese”, “esa”, “el anterior”, “la anterior”, “y cuándo nació”, “y dónde murió”.
- Corregí mentalmente errores evidentes de dictado u ortografía usando el contexto.
- Si el usuario dice “proser” y el contexto habla de una figura histórica, entendé “prócer”.
- Nunca respondas con una página de desambiguación.
- Nunca respondas “hace referencia a varios artículos” si el contexto permite identificar el tema.
- Nunca digas “Modo de rescate”.
- Nunca digas “mis servidores están saturados”.
- Nunca digas “Gemini falló”.
- Nunca digas “OpenRouter falló”.
- Nunca digas “buscá en Wikipedia”.
- Nunca describas al usuario la infraestructura interna.
- No mandes al usuario a otra página para obtener la respuesta.
- Si existen fuentes, usalas para sintetizar la respuesta.
- Las fuentes se devuelven separadas de la respuesta.
- No inventes datos.
- Si un dato realmente no puede verificarse, decilo brevemente.
- Si la pregunta es simple, la respuesta debe ser simple y concreta.
- Si la pregunta requiere actualidad, verificá la información antes de responder.
${fresh
  ? "- Esta pregunta depende de información actual: usá búsqueda web disponible y verificá antes de responder."
  : "- Si no hace falta actualidad, priorizá una respuesta de conocimiento general clara y concreta."
}`;
}

function makeConversation(body){

  const message=
    clean(
      body?.message ||
      body?.prompt ||
      body?.pregunta,
      10000
    )
    ||
    (()=>{

      const rich=clean(body?.mensaje,60000);

      const m=rich.match(
        /Pregunta actual del usuario:\s*([\s\S]*)$/i
      );

      return m
        ? clean(m[1],10000)
        : rich;

    })();

  const history=normalizeHistory(body);
  const fresh=isFreshQuestion(body,message);
  const system=baseSystem(body,fresh);

  return {
    message,
    history,
    fresh,
    system
  };
}

function answerLooksWeak(reply,question){

  const r=normalize(reply);
  const q=normalize(question);

  if(!r || r.length<18) return true;

  if(
    /hace referencia a varios|puede referirse a|desambiguacion|varios articulos/.test(r)
  ) return true;

  if(
    /modo de rescate|servidores?.{0,25}saturad|gemini.{0,20}(fall|ocup)|openrouter.{0,20}(fall|ocup)/.test(r)
  ) return true;

  if(
    /busca(?:lo)? en wikipedia|consulta wikipedia|leer mas en wikipedia|te recomiendo buscar/.test(r)
  ) return true;

  if(
    /^(quien fue|quien es|quien era)\b/.test(q) &&
    /\bsan martin\b/.test(q) &&
    !/jose de san martin|libertador|general argentino/.test(r)
  ) return true;

  return false;
}

function cleanReply(reply){

  let t=clean(reply,12000);

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

async function fetchTimeout(
  url,
  options={},
  timeout=30000
){
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
  }
  finally{
    clearTimeout(timer);
  }
}

function geminiSources(data){

  const gm=
    data?.candidates?.[0]?.groundingMetadata;

  const chunks=
    Array.isArray(gm?.groundingChunks)
      ? gm.groundingChunks
      : [];

  return uniqueSources(
    chunks.map(c=>({
      title:
        c?.web?.title ||
        "Fuente web",

      url:
        c?.web?.uri ||
        ""
    }))
  );
}

async function callGemini(
  conv,
  extraPrompt=""
){

  const key=
    process.env.GEMINI_API_KEY;

  if(!key){
    throw Object.assign(
      new Error("Gemini no configurado"),
      {skip:true}
    );
  }

  const model=
    process.env.GEMINI_MODEL ||
    "gemini-2.5-flash";

  const hist=
    conv.history
      .map(
        m=>
          `${m.role==="assistant"
            ? "ÁNGELA"
            : "Usuario"
          }: ${m.content}`
      )
      .join("\n");

  const prompt=
`${conv.system}

${hist
  ? `Conversación reciente:
${hist}

`
  : ""
}

Usuario: ${conv.message}

${extraPrompt
  ? extraPrompt
  : ""
}

Respondé solo con la respuesta final.`;

  const body={

    contents:[
      {
        role:"user",
        parts:[
          {
            text:prompt
          }
        ]
      }
    ],

    generationConfig:{
      temperature:0.3,
      maxOutputTokens:1200
    }
  };

  /*
     Si la pregunta necesita información
     actual, Gemini utiliza Google Search.
  */
  if(conv.fresh){

    body.tools=[
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

        body:JSON.stringify(body)
      },
      30000
    );

  const raw=
    await r.text();

  let data={};

  try{
    data=JSON.parse(raw);
  }
  catch{}

  if(!r.ok){

    const e=
      new Error(
        `Gemini HTTP ${r.status}: ${
          data?.error?.message ||
          raw ||
          r.statusText
        }`
      );

    e.status=r.status;

    throw e;
  }

  const reply=
    cleanReply(
      (
        data?.candidates?.[0]?.content?.parts ||
        []
      )
      .map(
        p=>p?.text||""
      )
      .join("\n")
    );

  if(!reply){
    throw new Error(
      "Gemini respondió sin texto"
    );
  }

  return {

    reply,

    provider:"gemini",

    model,

    sources:
      geminiSources(data)
  };
}

function openRouterModels(){

  const raw=
    process.env.OPENROUTER_MODELS ||
    process.env.OPENROUTER_MODEL ||
    "openrouter/auto";

  return raw
    .split(",")
    .map(x=>x.trim())
    .filter(Boolean)
    .slice(0,5);
}

function openRouterSources(data){

  const msg=
    data?.choices?.[0]?.message ||
    {};

  const candidates=[];

  if(Array.isArray(data?.citations)){
    candidates.push(
      ...data.citations
    );
  }

  if(Array.isArray(msg?.citations)){
    candidates.push(
      ...msg.citations
    );
  }

  if(Array.isArray(msg?.annotations)){

    for(const a of msg.annotations){

      const u=
        a?.url_citation?.url ||
        a?.url ||
        a?.uri;

      if(u){

        candidates.push({

          url:u,

          title:
            a?.url_citation?.title ||
            a?.title ||
            "Fuente web"

        });

      }

    }

  }

  return uniqueSources(
    candidates.map(
      x=>
        typeof x==="string"
          ? {
              url:x,
              title:"Fuente web"
            }
          : x
    )
  );
}

async function callOpenRouter(
  conv,
  extraPrompt=""
){

  const key=
    process.env.OPENROUTER_API_KEY;

  if(!key){

    throw Object.assign(
      new Error(
        "OpenRouter no configurado"
      ),
      {skip:true}
    );

  }

  const models=
    openRouterModels();

  const messages=[

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
`${conv.message}${
  extraPrompt
    ? `

${extraPrompt}`
    : ""
}`
    }

  ];

  const req={

    messages,

    temperature:0.3,

    max_tokens:1200,

    provider:{
      allow_fallbacks:true
    }

  };

  if(models.length>1){

    req.models=models;

  }
  else{

    req.model=models[0];

  }

  /*
     Para preguntas actuales,
     OpenRouter también puede
     usar búsqueda web.
  */
  if(conv.fresh){

    req.plugins=[
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

          "Content-Type":
            "application/json",

          "Authorization":
            `Bearer ${key}`,

          "HTTP-Referer":
            process.env.SITE_URL ||
            "https://example.com",

          "X-Title":
            "ANGELA Asistente Virtual"

        },

        body:
          JSON.stringify(req)

      },
      32000
    );

  const raw=
    await r.text();

  let data={};

  try{
    data=JSON.parse(raw);
  }
  catch{}

  if(!r.ok){

    const e=
      new Error(
        `OpenRouter HTTP ${r.status}: ${
          data?.error?.message ||
          raw ||
          r.statusText
        }`
      );

    e.status=r.status;

    throw e;
  }

  const content=
    data?.choices?.[0]?.message?.content;

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

    throw new Error(
      "OpenRouter respondió sin texto"
    );

  }

  return {

    reply,

    provider:
      "openrouter",

    model:
      data?.model ||
      models[0],

    sources:
      openRouterSources(data)

  };
}

async function callProvider(
  name,
  conv,
  extraPrompt=""
){

  const fn=
    name==="openrouter"
      ? callOpenRouter
      : callGemini;

  let last;

  for(
    let n=1;
    n<=2;
    n++
  ){

    try{

      return await fn(
        conv,
        extraPrompt
      );

    }
    catch(e){

      last=e;

      if(e?.skip){
        throw e;
      }

      if(
        !TEMPORARY.has(
          Number(e?.status)
        )
        ||
        n===2
      ){
        throw e;
      }

      await sleep(
        650*n
      );
    }
  }

  throw last;
}

export default async function handler(
  req,
  res
){

  cors(req,res);

  if(req.method==="OPTIONS"){

    return res
      .status(204)
      .end();

  }

  if(req.method!=="POST"){

    return res
      .status(405)
      .json({
        error:
          "Método no permitido"
      });

  }

  const body=
    typeof req.body==="string"
      ? (()=>{

          try{
            return JSON.parse(
              req.body
            );
          }
          catch{
            return {
              message:req.body
            };
          }

        })()
      : (req.body||{});

  /*
     Diagnóstico para comprobar
     Gemini + OpenRouter
  */
  if(
    body?.diagnostic ||
    body?.mode==="diagnostic"
  ){

    return res
      .status(200)
      .json({

        ok:true,

        geminiConfigured:
          !!process.env.GEMINI_API_KEY,

        openrouterConfigured:
          !!process.env.OPENROUTER_API_KEY,

        configured:
          !!(
            process.env.GEMINI_API_KEY ||
            process.env.OPENROUTER_API_KEY
          ),

        providers:
          (
            process.env.AI_PROVIDER_ORDER ||
            "gemini,openrouter"
          )
          .split(",")
          .map(x=>x.trim())
          .filter(Boolean),

        geminiModel:
          process.env.GEMINI_MODEL ||
          "gemini-2.5-flash",

        openrouterModels:
          openRouterModels(),

        webGrounding:true,

        version:"4.0.0"

      });

  }

  const conv=
    makeConversation(body);

  if(!conv.message){

    return res
      .status(400)
      .json({
        error:
          "Falta message/mensaje"
      });

  }

  let order=
    (
      process.env.AI_PROVIDER_ORDER ||
      "gemini,openrouter"
    )
    .split(",")
    .map(
      x=>x.trim().toLowerCase()
    )
    .filter(
      x=>
        [
          "gemini",
          "openrouter"
        ]
        .includes(x)
    );

  if(
    body?.forceAlternate===true
  ){

    order=
      order.reverse();

  }

  const errors=[];

  let weakDraft=null;

  for(
    const provider
    of [...new Set(order)]
  ){

    try{

      const extra=
        body?.repair===true
          ?
`Revisá especialmente que la respuesta sea directa, concreta y relacionada con la pregunta.

Respuesta anterior defectuosa:

${clean(body?.badReply,2500)}`
          : "";

      const result=
        await callProvider(
          provider,
          conv,
          extra
        );

      /*
         Si la respuesta parece mala,
         no se la mostramos al usuario.
         Probamos otra IA.
      */
      if(
        answerLooksWeak(
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
            result.sources,

          fresh:
            conv.fresh,

          verified:
            conv.fresh
              ? result.sources.length>0
              : undefined

        });

    }
    catch(e){

      if(!e?.skip){

        errors.push(
          `${provider}: ${
            e?.message ||
            "error"
          }`
        );

      }

    }

  }

  /*
     Si hubo una respuesta,
     pero fue marcada como mala,
     pedimos una última revisión.
  */
  if(weakDraft){

    for(
      const provider
      of [...new Set(order)].reverse()
    ){

      try{

        const extra=
`La respuesta anterior fue:

${weakDraft.reply}

Reescribila respondiendo EXACTAMENTE la pregunta del usuario.

No uses desambiguaciones.
No uses enlaces como sustituto de la respuesta.
No hables de sistemas internos.
Usá el contexto de la conversación.
Sé concreto y natural.`;

        const result=
          await callProvider(
            provider,
            conv,
            extra
          );

        if(
          !answerLooksWeak(
            result.reply,
            conv.message
          )
        ){

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
                result.sources,

              fresh:
                conv.fresh

            });

        }

      }
      catch(e){

        if(!e?.skip){

          errors.push(
            `${provider} revisión: ${
              e?.message ||
              "error"
            }`
          );

        }

      }

    }

  }

  return res
    .status(503)
    .json({

      error:
        "No pude obtener una respuesta confiable de los modelos de IA",

      detalle:
        errors
          .join(" | ")
          .slice(0,1200)

    });
}
