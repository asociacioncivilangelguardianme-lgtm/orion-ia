// ÁNGELA — generador de imágenes mediante Space público FLUX.1-schnell.
// El Space es gratuito con límites; la API puede aplicar cuotas, cola o restricciones.
// HF_TOKEN debe configurarse como variable privada en Vercel.
const { Client } = require('@gradio/client');
const SPACE = 'black-forest-labs/FLUX.1-schnell';
function respond(res, code, body){res.status(code).setHeader('Cache-Control','no-store').json(body)}
module.exports = async function handler(req,res){
  if(req.method==='GET') return respond(res,200,{ok:true,provider:'Hugging Face Space',space:SPACE,tokenConfigured:!!process.env.HF_TOKEN,note:'Estado del conector; no garantiza GPU disponible.'});
  if(req.method!=='POST') return respond(res,405,{error:'Método no permitido.'});
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
    const prompt=String(body.prompt||body.originalPrompt||'').trim();
    if(prompt.length<3||prompt.length>5000)return respond(res,400,{error:'El texto debe tener entre 3 y 5000 caracteres.'});
    const ratio=String(body.aspectRatio||body.formato||body.aspecto||'1:1');
    const sizes={'1:1':[1024,1024],'9:16':[576,1024],'16:9':[1024,576],'4:5':[768,960],'2:3':[672,1008]};
    const [width,height]=sizes[ratio]||sizes['1:1'];
    const options={hf_token:process.env.HF_TOKEN||undefined};
    const client=await Client.connect(SPACE,options);
    const result=await client.predict('/infer',{prompt,seed:0,randomize_seed:true,width,height,num_inference_steps:5});
    const image=result?.data?.[0];
    let url=typeof image==='string'?image:(image?.url||image?.path||'');
    if(url.startsWith('/'))url='https://black-forest-labs-flux-1-schnell.hf.space'+url;
    if(!/^https:\/\//.test(url))throw Error('El Space no devolvió una URL válida.');
    // Entregar base64 evita depender de URLs temporales o CORS del Space.
    const imageResponse=await fetch(url,{signal:AbortSignal.timeout(18000)});
    if(!imageResponse.ok)throw Error('No se pudo recuperar la imagen generada ('+imageResponse.status+').');
    const mime=(imageResponse.headers.get('content-type')||'image/webp').split(';')[0];
    if(!mime.startsWith('image/'))throw Error('El Space devolvió un archivo que no es una imagen.');
    const bytes=Buffer.from(await imageResponse.arrayBuffer());
    if(bytes.length>9_000_000)throw Error('La imagen supera el tamaño permitido.');
    return respond(res,200,{ok:true,provider:'Hugging Face FLUX.1-schnell',url:`data:${mime};base64,${bytes.toString('base64')}`,mime});
  }catch(e){
    const msg=String(e?.message||e||'Error desconocido');
    const status=/quota|limit|rate|gpu|queue|capacity|exceeded|credit/i.test(msg)?429:502;
    return respond(res,status,{error:'Hugging Face no pudo generar esta imagen.',detail:msg.slice(0,350),help:'Puede ser una cola, límite gratuito o falta de acceso a la API del Space. No se cobrará automáticamente desde ÁNGELA.'});
  }
};
