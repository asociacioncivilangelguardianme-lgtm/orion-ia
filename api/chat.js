const TEMPORARY = new Set([408,409,425,429,500,502,503,504]);

function clean(v,max=60000){
  return typeof v==="string" ? v.trim().slice(0,max) : "";
}

function sleep(ms){
  return new Promise(r=>setTimeout(r,ms));
}

function normalize(s){
  return clean(s,12000)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"");
}

function cors(req,res){
  const configured=clean(process.env.ALLOWED_ORIGIN||"*",2000);
  const origin=clean(req.headers?.origin||"",1000);

  const allowed=configured
    .split(",")
    .map(x=>x.trim())
    .filter(Boolean);

  const allow=configured==="*"
    ? "*"
    : (
        allowed.includes(origin)
          ? origin
          : (allowed[0]||"*")
      );

  res.setHeader("Access-Control-Allow-Origin",allow);
  res.setHeader("Vary","Origin");
  res.setHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type,Authorization,Accept"
  );
  res.setHeader("Cache-Control","no-store");
}

function uniqueSources(items=[]){
  const seen=new Set();
  const out=[];

  for(const s of items){
    const url=clean(s?.url||s?.uri,1800);

    if(!url || seen.has(url)){
      continue;
    }

    seen.add(url);

    out.push({
      title:clean(s?.title||"Fuente",200),
      url
    });

    if(out.length>=6){
      break;
    }
  }

  return out;
}

function normalizeHistory(body){

  const context=
    body?.context ||
    body?.contexto ||
    {};

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

      role:
        (
          m?.role==="assistant" ||
          m?.role==="model"
        )
          ? "assistant"
          : "user",

      content:
        clean(
          m?.content ?? m?.text,
          5000
        )

    }))
    .filter(m=>m.content);
}

function currentMessage(body){

  const direct=
    clean(
      body?.message ||
      body?.prompt ||
      body?.pregunta ||
      body?.text,
      12000
    );

  if(direct){
    return direct;
  }

  const rich=
    clean(body?.mensaje,60000);

  const match=
    rich.match(
      /Pregunta actual del usuario:\s*([\s\S]*)$/i
    );

  return match
    ? clean(match[1],12000)
    : rich;
}

function isFresh(body,message){

  if(
    body?.fresh===true ||
    body?.actualidad===true ||
    body?.useWeb===true
  ){
    return true;
  }

  return /\b(hoy|ahora|actual|actualmente|ultimo|ultima|ultimos|ultimas|reciente|noticia|noticias|esta semana|este mes|presidente actual|gobierno actual|ministro actual|gobernador actual|intendente actual|cotizacion|dolar|precio|resultado|en vivo|elecciones|quien gobierna|clima|pronostico|temperatura|ultimo partido)\b/
    .test(
      normalize(message)
    );
}

function systemPrompt(body,fresh){

  const context=
    body?.context ||
    body?.contexto ||
    {};

  const assistant=
    clean(
      body?.assistant ||
      body?.asistente ||
      context?.assistant,
      50
    ) || "Ángela";

  const usuario=
    clean(
      body?.usuario ||
      body?.user ||
      context?.profile,
      100
    ) || "Usuario";

  const ubicacion=
    clean(
      body?.ubicacion ||
      body?.location,
      300
    );

  const fecha=
    new Date().toLocaleDateString(
      "es-AR",
      {
        timeZone:
          "America/Argentina/Buenos_Aires",
        year:"numeric",
        month:"long",
        day:"numeric"
      }
    );

  return `Sos ${assistant}, una asistente virtual general, inteligente, clara, rápida y conversacional.

Respondés en español con voseo argentino.

Fecha actual en Argentina: ${fecha}.

REGLAS:

- Respondé directamente lo que preguntó el usuario.
- No des vueltas ni agregues introducciones innecesarias.
- Por defecto respondé en 2 a 5 frases o párrafos cortos.
- Si el usuario pide más detalles, ampliá la respuesta.
- Conservá el hilo de toda la conversación.
- Entendé referencias como:
  “él”
  “ella”
  “ese”
  “esa”
  “el prócer”
  “el anterior”
  “y cuándo nació”
  “y dónde murió”
  “qué hizo después”
- Corregí mentalmente errores evidentes de dictado u ortografía usando el contexto.
- Si dice “proser” hablando de una figura histórica, entendé “prócer”.
- Nunca respondas con una página de desambiguación.
- Nunca contestes solamente “hace referencia a varios artículos” si podés identificar de quién hablan.
- Nunca digas “Modo de rescate”.
- Nunca digas que Gemini falló.
- Nunca digas que OpenRouter falló.
- Nunca muestres errores técnicos.
- Nunca muestres nombres internos de modelos.
- Nunca mandes al usuario a buscar la respuesta en Wikipedia.
- Nunca mandes al usuario a Google para obtener la respuesta.
- Contestá vos.
- Si existen fuentes, usalas para preparar la respuesta y devolvelas separadas.
- No inventes información.
- Si realmente no podés verificar algo, decilo brevemente.

${
fresh
?
`Esta consulta depende de información actual.
Usá Google Search si está disponible.
Verificá los datos recientes antes de responder.`
:
`Esta consulta no parece requerir información actual.
Priorizá conocimiento general y continuidad de la conversación.`
}

DATOS DEL COMEDOR ÁNGEL GUARDIÁN,
SOLO SI EL USUARIO PREGUNTA POR EL COMEDOR:

Nombre:
Asociación Civil Ángel Guardián para la Niñez de Merlo.

Dirección:
García Velloso 4269,
Mariano Acosta,
Merlo,
Buenos Aires.

Teléfonos:
11-3898-0135
11-2257-3722

Email:
comedor.angel.guardian@gmail.com

Instagram:
@comedorangelguardian_ok

X:
@angelguardianc3

Alias Banco Provincia:
NIEBLA.REMO.TAMBOR

Web:
https://www.comedorangelguardian.com.ar/

Usuario actual:
${usuario}

${ubicacion ? `Ubicación informada: ${ubicacion}` : ""}`.trim();
}

function weak(reply,question){

  const r=normalize(reply);
  const q=normalize(question);

  if(!r || r.length<15){
    return true;
  }

  if(
    /reporte tecnico|modo de rescate|servidores?.{0,30}saturad|gemini.{0,25}(fall|error|ocup)|openrouter.{0,25}(fall|error|ocup)/
      .test(r)
  ){
    return true;
  }

  if(
    /hace referencia a varios|puede referirse a|desambiguacion|varios articulos/
      .test(r)
  ){
    return true;
  }

  if(
    /busca(?:lo)? en wikipedia|consulta wikipedia|leer mas en wikipedia|te recomiendo buscar|busca en google/
      .test(r)
  ){
    return true;
  }

  if(
    /^(quien fue|quien es|quien era)\b/
      .test(q)
    &&
    /\bsan martin\b/
      .test(q)
    &&
    !/jose de san martin|libertador|general argentino/
      .test(r)
  ){
    return true;
  }

  return false;
}

function cleanReply(reply){

  let t=
    clean(reply,14000);

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

async function fetchTimeout(
  url,
  options={},
  timeout=30000
){

  const c=
    new AbortController();

  const timer=
    setTimeout(
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

  const raw=
    clean(
      process.env.GEMINI_MODELS ||
      process.env.GEMINI_MODEL ||
      "gemini-2.5-flash,gemini-2.5-flash-lite",
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

  const raw=
    clean(
      process.env.OPENROUTER_MODELS ||
      process.env.OPENROUTER_MODEL ||
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

  const allowed=
    new Set([
      "gemini",
      "openrouter"
    ]);

  const order=
    clean(
      process.env.AI_PROVIDER_ORDER ||
      "gemini,openrouter",
      100
    )
    .split(",")
    .map(
      x=>x.trim().toLowerCase()
    )
    .filter(
      x=>allowed.has(x)
    );

  return order.length
    ? [...new Set(order)]
    : ["gemini","openrouter"];
}

function geminiContents(
  history,
  message
){

  const out=
    history.map(
      m=>({

        role:
          m.role==="assistant"
            ? "model"
            : "user",

        parts:[
          {
            text:m.content
          }
        ]

      })
    );

  out.push({

    role:"user",

    parts:[
      {
        text:message
      }
    ]

  });

  return out;
}

function geminiText(data){

  return cleanReply(
    (
      data?.candidates?.[0]?.content?.parts ||
      []
    )
    .map(
      p=>p?.text||""
    )
    .join("\n")
  );
}

function geminiSources(data){

  const chunks=
    data?.candidates?.[0]
      ?.groundingMetadata
      ?.groundingChunks ||
    [];

  return uniqueSources(
    chunks.map(
      c=>({

        title:
          c?.web?.title ||
          "Fuente web",

        url:
          c?.web?.uri ||
          ""

      })
    )
  );
}

async function callGemini(
  conv,
  extra=""
){

  const key=
    clean(
      process.env.GEMINI_API_KEY,
      500
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

  for(
    const model of geminiModels()
  ){

    try{

      const payload={

        system_instruction:{
          parts:[
            {
              text:
`${conv.system}${
  extra
    ? `

${extra}`
    : ""
}`
            }
          ]
        },

        contents:
          geminiContents(
            conv.history,
            conv.message
          ),

        generationConfig:{
          temperature:0.35,
          topP:0.9,
          maxOutputTokens:1400
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
              "Content-Type":
                "application/json",

              "x-goog-api-key":
                key
            },

            body:
              JSON.stringify(
                payload
              )
          },
          30000
        );

      const raw=
        await r.text();

      let data={};

      try{
        data=JSON.parse(raw);
      }catch{}

      if(!r.ok){

        const e=
          new Error(
`Gemini ${model} HTTP ${r.status}: ${
  data?.error?.message ||
  raw ||
  r.statusText
}`
          );

        e.status=
          r.status;

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

      const reply=
        geminiText(data);

      if(!reply){

        last=
          new Error(
            `Gemini ${model} respondió sin texto`
          );

        continue;
      }

      const sources=
        geminiSources(data);

      return {

        reply,

        provider:
          "gemini",

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

  throw last ||
    new Error(
      "Gemini no respondió"
    );
}

function openRouterMessages(
  conv,
  extra=""
){

  return [

    {
      role:"system",

      content:
`${conv.system}${
  extra
    ? `

${extra}`
    : ""
}`
    },

    ...conv.history.map(
      m=>({

        role:m.role,

        content:
          m.content

      })
    ),

    {
      role:"user",
      content:
        conv.message
    }

  ];
}

function openRouterSources(data){

  const msg=
    data?.choices?.[0]
      ?.message ||
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

    for(
      const a of msg.annotations
    ){

      const url=
        a?.url_citation?.url ||
        a?.url ||
        a?.uri;

      if(url){

        all.push({

          title:
            a?.url_citation?.title ||
            a?.title ||
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

async function callOpenRouter(
  conv,
  extra=""
){

  const key=
    clean(
      process.env.OPENROUTER_API_KEY,
      700
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

  let last=null;

  for(
    const model of openRouterModels()
  ){

    try{

      const payload={

        model,

        messages:
          openRouterMessages(
            conv,
            extra
          ),

        temperature:
          0.35,

        max_tokens:
          1400,

        provider:{
          allow_fallbacks:true
        }

      };

      /*
      La búsqueda web de OpenRouter
      puede tener costo independiente.

      Por ahora NO la activamos
      automáticamente.

      Si algún día creás en Vercel:

      OPENROUTER_WEB=true

      recién ahí se activa.
      */

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
                )
                ||
                "https://orion-ia-sooty.vercel.app",

              "X-Title":
                "ÁNGELA Assistant"

            },

            body:
              JSON.stringify(
                payload
              )

          },
          32000
        );

      const raw=
        await r.text();

      let data={};

      try{
        data=JSON.parse(raw);
      }catch{}

      if(!r.ok){

        const e=
          new Error(
`OpenRouter ${model} HTTP ${r.status}: ${
  data?.error?.message ||
  raw ||
  r.statusText
}`
          );

        e.status=
          r.status;

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

        last=
          new Error(
            `OpenRouter ${model} respondió sin texto`
          );

        continue;

      }

      return {

        reply,

        provider:
          "openrouter",

        model:
          data?.model ||
          model,

        sources:
          openRouterSources(data)

      };

    }catch(e){

      last=e;

    }

  }

  throw last ||
    new Error(
      "OpenRouter no respondió"
    );
}

async function callProvider(
  name,
  conv,
  extra=""
){

  return name==="openrouter"
    ? callOpenRouter(
        conv,
        extra
      )
    : callGemini(
        conv,
        extra
      );
}

async function cascade(
  conv,
  order,
  extra=""
){

  const errors=[];

  let weakDraft=null;

  for(
    const provider of order
  ){

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
          `${provider}: ${
            e?.message ||
            "error"
          }`
        );

      }

    }

  }

  /*
  Si una IA respondió algo
  pero fue una respuesta mala,
  intentamos que la otra IA
  la corrija.
  */

  if(weakDraft){

    const repair=
`La respuesta anterior fue defectuosa:

${weakDraft.reply}

Respondé nuevamente a la pregunta exacta.

Sé concreta.
Usá el contexto de la conversación.
No muestres desambiguaciones.
No reemplaces la respuesta por enlaces.
No hables de errores internos.
No menciones proveedores ni modelos.`;

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
            `${provider} revisión: ${
              e?.message ||
              "error"
            }`
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

  const geminiConfigured=
    Boolean(
      clean(
        process.env.GEMINI_API_KEY,
        500
      )
    );

  const openRouterConfigured=
    Boolean(
      clean(
        process.env.OPENROUTER_API_KEY,
        700
      )
    );

  /*
  Si abrís directamente /api/chat
  desde el navegador,
  devuelve el estado del backend.
  */

  if(req.method==="GET"){

    return res
      .status(200)
      .json({

        ok:true,

        backend:true,

        configured:
          geminiConfigured ||
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

        version:
          "5.0.0"

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
            req.body ||
            {}
          );

    /*
    Diagnóstico de ÁNGELA.
    No muestra ninguna API Key.
    */

    if(
      body?.mode==="diagnostic" ||
      body?.diagnostic===true
    ){

      return res
        .status(200)
        .json({

          ok:true,

          backend:true,

          configured:
            geminiConfigured ||
            openRouterConfigured,

          geminiConfigured,

          openrouterConfigured:
            openRouterConfigured,

          geminiOk:
            geminiConfigured,

          verified:
            geminiConfigured ||
            openRouterConfigured,

          providers:
            providerOrder(),

          geminiModels:
            geminiModels(),

          openrouterModels:
            openRouterModels(),

          webGrounding:
            true,

          version:
            "5.0.0"

        });

    }

    const message=
      currentMessage(body);

    if(!message){

      return res
        .status(400)
        .json({
          error:
            "Falta el mensaje"
        });

    }

    const fresh=
      isFresh(
        body,
        message
      );

    const conv={

      message,

      history:
        normalizeHistory(body),

      fresh,

      system:
        systemPrompt(
          body,
          fresh
        )

    };

    let order=
      providerOrder();

    if(
      body?.forceAlternate===true
    ){

      order=
        [...order].reverse();

    }

    const extra=
      body?.repair===true &&
      body?.badReply
        ?
`La respuesta anterior fue mala:

${clean(
  body.badReply,
  2500
)}

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

    /*
    RESPUESTA CORRECTA
    */

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
            result.sources ||
            [],

          fresh,

          verified:
            result.verified

        });

    }

    /*
    IMPORTANTE:
    los detalles técnicos
    van SOLO a los logs de Vercel.
    No aparecen en el chat.
    */

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
          "Los proveedores de IA no respondieron correctamente. Revisá los logs de Vercel para ver el detalle técnico."

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
