// ÁNGELA · Link corto de los Regalos QR: /r/AAMMDDcodigo
// El guion bajo del nombre hace que Vercel no lo cuente como función aparte
// (el plan gratis permite 12): lo usa api/supabase-config.js cuando llega ?r=
// Abre el regalo guardado en Supabase y, cuando se comparte por WhatsApp o redes,
// muestra el título del regalo con la imagen de ÁNGELA en la vista previa.
const PROJECT_URL = 'https://xbbmqfapcfqndwanfkvh.supabase.co';
const BUCKET = 'eventos-qr';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = async function shortLink(req, res) {
  const code = String((req.query && (req.query.r || req.query.c)) || '').toLowerCase();
  const m = code.match(/^(\d{2})(\d{2})(\d{2})([a-z0-9]{6,16})$/);
  if (!m) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><p style="font-family:Arial;text-align:center;padding:60px 20px">Este link de regalo no es válido.</p>');
  }
  const base = String(process.env.SUPABASE_URL || PROJECT_URL).replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
  const day = `20${m[1]}-${m[2]}-${m[3]}`;
  const publicUrl = `${base}/storage/v1/object/public/${BUCKET}/regalos/${day}/${m[4]}/index.html`;

  let title = 'Tenés una sorpresa 🎁';
  let desc = 'Alguien preparó algo especial para vos 💝 Tocá para abrir tu sorpresa.';
  let ogImg = 'og/base.jpg';
  try {
    const r = await fetch(publicUrl, { headers: { Range: 'bytes=0-6000' } });
    if (r.ok || r.status === 206) {
      const head = Buffer.from(await r.arrayBuffer()).toString('utf8');
      const t = head.match(/<title>([^<]{1,140})<\/title>/i);
      if (t) title = t[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
      if (!/name="angela-ocasion"/.test(head) && /id="journey"/.test(head)) { ogImg = 'og/evento.jpg'; desc = '¡Estás invitado! 🎉 Mirá los detalles y confirmá.'; }
      const oc = (head.match(/name="angela-ocasion" content="([a-z]+)"/) || [])[1] || '';
      const para = ((head.match(/name="angela-para" content="([^"]{1,60})"/) || [])[1] || '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
      // Regalos: la vista previa de WhatsApp no revela la sorpresa. Comedor y campañas sí dicen de dónde son.
      if (oc === 'campana') { title = 'Campaña · Comedor Ángel Guardián: ' + title; desc = 'Tocá para ver la campaña y sumarte 💛'; ogImg = 'og-campana.jpg'; }
      else if (oc === 'comedor') { title = 'Comedor Ángel Guardián: ' + title; desc = 'Un mensaje del Comedor Ángel Guardián 👼'; ogImg = 'og-comedor.jpg'; }
      else if (oc) {
        title = '🎁 Una sorpresa para ' + (para || 'vos');
        const G = { pareja: 'amor', aniversario: 'amor', sanvalentin: 'amor', propuesta: 'amor', casamiento: 'amor', amistad: 'amistad', cumple: 'cumple', quince: 'cumple', graduacion: 'cumple', familia: 'familia', abuelos: 'familia', casanueva: 'familia', viaje: 'familia', mascota: 'familia', mascotarecuerdo: 'familia', navidad: 'navidad', anionuevo: 'anionuevo', halloween: 'halloween', madre: 'madre', padre: 'padre', nino: 'nino', pascuas: 'pascuas', nacimiento: 'bebe', babyshower: 'bebe', bautismo: 'fe', comunion: 'fe', umbanda: 'fe', nacion: 'fe', quimbanda: 'fe', xeixe: 'fe', homenaje: 'fe' };
        const D = { amor: 'Alguien pensó en vos 💌 Tocá para abrir.', amistad: 'Una sorpresa de tu mejor amiga 💖 Tocá para abrir.', cumple: '¡Feliz cumpleaños! 🎂 Tocá para abrir tu regalo.', navidad: '¡Feliz Navidad! 🎄 Tocá para abrir tu regalo.', madre: 'Un regalo con mucho amor 💐 Tocá para abrir.', padre: 'Un regalo para vos 💙 Tocá para abrir.', halloween: '¿Dulce o truco? 🎃 Abrilo si te animás.' };
        const g = G[oc]; if (g) { ogImg = 'og/' + g + '.jpg'; if (D[g]) desc = D[g]; }
      }
    } else if (r.status === 404 || r.status === 400) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><p style="font-family:Arial;text-align:center;padding:60px 20px">No encontramos este regalo. Puede que lo hayan borrado.</p>');
    }
  } catch (_) { /* si no responde, igual se intenta abrir desde el celular */ }

  const host = req.headers['x-forwarded-host'] || req.headers.host || 'orion-ia-sooty.vercel.app';
  const origin = `https://${host}`;
  const img = `${origin}/${ogImg}`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.end(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta property="og:type" content="website"><meta property="og:site_name" content="Comedor Ángel Guardián"><meta property="og:locale" content="es_AR">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(img)}"><meta property="og:image:secure_url" content="${esc(img)}"><meta property="og:image:type" content="image/jpeg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Comedor Ángel Guardián">
<meta property="og:url" content="${esc(origin + '/r/' + code)}"><meta name="twitter:card" content="summary_large_image"><meta name="description" content="${esc(desc)}">
<style>
*{box-sizing:border-box}html,body{margin:0;height:100%}
body{font-family:Georgia,'Times New Roman',serif;color:#fff;background:linear-gradient(160deg,#3b0764,#be185d);overflow:hidden;transition:background 1s ease}
#fx{position:fixed;inset:0;pointer-events:none;overflow:hidden}
#fx span{position:absolute;top:-10vh;font-size:26px;opacity:.85;animation:caer linear infinite}
@keyframes caer{to{transform:translateY(120vh) rotate(360deg)}}
.c{position:relative;z-index:2;min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px 20px calc(24px + env(safe-area-inset-bottom,0px))}
.ico{font-size:92px;line-height:1;animation:salto 1.6s ease-in-out infinite;filter:drop-shadow(0 12px 18px rgba(0,0,0,.35))}
@keyframes salto{0%,100%{transform:translateY(0) rotate(0)}20%{transform:translateY(-18px) rotate(-6deg)}40%{transform:translateY(0) rotate(5deg)}60%{transform:translateY(-8px) rotate(-3deg)}}
.k{font:700 12px Arial,sans-serif;letter-spacing:.22em;text-transform:uppercase;opacity:.85;margin:22px 0 8px}
h1{font-size:clamp(26px,7vw,40px);line-height:1.12;margin:0 0 10px;text-shadow:0 3px 16px rgba(0,0,0,.35);max-width:22ch}
.sub{font-size:17px;opacity:.9;margin:0 0 26px;max-width:30ch;font-style:italic}
.dots{font:700 15px Arial,sans-serif;opacity:.9}
.dots i{display:inline-block;animation:pt 1.2s infinite;font-style:normal}.dots i:nth-child(2){animation-delay:.2s}.dots i:nth-child(3){animation-delay:.4s}
@keyframes pt{0%,100%{opacity:.2}50%{opacity:1}}
#go{display:none;border:0;border-radius:999px;padding:18px 34px;font:800 20px Arial,sans-serif;color:#222;background:#fff;box-shadow:0 0 0 0 rgba(255,255,255,.7),0 14px 30px rgba(0,0,0,.3);cursor:pointer;animation:latir 1.4s ease-in-out infinite}
@keyframes latir{0%{transform:scale(1);box-shadow:0 0 0 0 rgba(255,255,255,.7),0 14px 30px rgba(0,0,0,.3)}70%{transform:scale(1.06);box-shadow:0 0 0 18px rgba(255,255,255,0),0 14px 30px rgba(0,0,0,.3)}100%{transform:scale(1)}}
.mano{display:none;font-size:44px;margin-top:10px;animation:toca 1.2s ease-in-out infinite}
@keyframes toca{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}
.err{display:none;background:rgba(0,0,0,.25);padding:14px 16px;border-radius:14px;font:600 15px Arial,sans-serif;max-width:32ch}
.boom span{position:fixed;left:50%;top:50%;font-size:34px;animation:vuela 1s ease-out forwards;z-index:5}
@keyframes vuela{from{transform:translate(-50%,-50%) scale(.4);opacity:1}to{transform:translate(var(--dx),var(--dy)) scale(1.3);opacity:0}}
.pie{position:fixed;left:0;right:0;bottom:0;z-index:3;text-align:center;padding:10px 12px calc(12px + env(safe-area-inset-bottom,0px));background:linear-gradient(transparent,rgba(0,0,0,.45));font:700 14px Arial,sans-serif}
.pie small{display:block;font-weight:400;opacity:.8;font-size:12px;margin-top:2px}
.c{padding-bottom:90px}
@media (prefers-reduced-motion:reduce){#fx,.ico,#go,.mano{animation:none!important}}
</style>
</head><body>
<div id="fx" aria-hidden="true"></div>
<div class="c">
  <div class="ico" id="ico">🎁</div>
  <div class="k" id="k">Tenés una sorpresa</div>
  <h1 id="t">Preparando tu regalo</h1>
  <p class="sub" id="s">Esperá un segundito…</p>
  <div class="dots" id="dots">Cargando<i>.</i><i>.</i><i>.</i></div>
  <button id="go" type="button">🎁 Abrir mi regalo</button>
  <div class="mano" id="mano" aria-hidden="true">👆</div>
  <div class="err" id="err"></div>
</div>
<div class="pie" id="pie" style="display:none"></div>
<script>var SRC=${JSON.stringify(publicUrl)};


var TEMAS={
 navidad:{bg:'linear-gradient(160deg,#0f5132,#7a1020)',e:['❄️','⭐','❄️','✨','🎄'],i:'🎄',k:'Llegó un regalo de Navidad',b:'🎄 Abrir mi regalo',s:'Un regalo de Navidad te está esperando'},
 anionuevo:{bg:'linear-gradient(160deg,#0b1026,#3b2f7a)',e:['🎆','✨','🥂','⭐'],i:'🥂',k:'Feliz Año Nuevo',b:'🎆 Abrir mi sorpresa',s:'Alguien te preparó algo para empezar el año'},
 halloween:{bg:'linear-gradient(165deg,#1a0f24 40%,#c2410c)',e:['🦇','🎃','👻','🕸️'],i:'🎃',k:'¿Dulce o truco?',b:'🎃 Abrir si te animás',s:'Algo te está esperando… si te animás'},
 cumple:{bg:'linear-gradient(150deg,#db2777,#f97316)',e:['🎈','🎉','✨','🎊'],i:'🎂',k:'¡Feliz cumpleaños!',b:'🎁 Abrir mi regalo',s:'Alguien preparó algo especial por tu día'},
 amor:{bg:'linear-gradient(160deg,#9f1239,#e11d48)',e:['❤️','💕','🌹','✨'],i:'💌',k:'Hay algo para vos',b:'💌 Abrir la carta',s:'Alguien escribió algo pensando en vos'},
 madre:{bg:'linear-gradient(160deg,#be185d,#f9a8d4)',e:['🌷','💐','🌸','💗'],i:'💐',k:'Para una mamá especial',b:'🌷 Abrir mi regalo',s:'Algo hecho con mucho amor'},
 padre:{bg:'linear-gradient(160deg,#0e3a5c,#3a7ca5)',e:['💙','⚽','🧉','⭐'],i:'🧉',k:'Para un papá especial',b:'💙 Abrir mi regalo',s:'Algo hecho con mucho cariño'},
 nino:{bg:'linear-gradient(150deg,#0284c7,#16a34a)',e:['🎈','🧸','⭐','🪁'],i:'🧸',k:'¡Una sorpresa para vos!',b:'🎈 Abrir mi sorpresa',s:'Hay una sorpresa esperándote'},
 pascuas:{bg:'linear-gradient(160deg,#f59e0b,#16a34a)',e:['🐣','🥚','🌼','🐰'],i:'🐣',k:'¡Felices Pascuas!',b:'🥚 Abrir mi huevo',s:'Encontraste un huevo sorpresa'},
 bebe:{bg:'linear-gradient(160deg,#38bdf8,#f9a8d4)',e:['☁️','⭐','🍼','🤍'],i:'🍼',k:'Una dulce sorpresa',b:'☁️ Abrir',s:'Algo muy tierno te espera'},
 fe:{bg:'linear-gradient(170deg,#1c1917,#a16207)',e:['✨','🕯️','⭐','✨'],i:'🕯️',k:'Un mensaje especial',b:'✨ Abrir el mensaje',s:'Un mensaje preparado con respeto y cariño'},
 campana:{bg:'linear-gradient(170deg,#0f4f8a,#b45309)',e:['💛','⭐','👼','🍲'],i:'🍲',k:'Campaña · Comedor Ángel Guardián',b:'💛 Ver la campaña',s:'Mirá cómo podés ayudar'},
 comedor:{bg:'linear-gradient(170deg,#0f4f8a,#b45309)',e:['💛','⭐','👼','💛'],i:'👼',k:'Comedor Ángel Guardián',b:'💛 Abrir el mensaje',s:'Un mensaje del comedor para vos'},
 evento:{bg:'linear-gradient(150deg,#4c1d95,#be185d)',e:['🎉','✨','🎊','⭐'],i:'🎉',k:'¡Estás invitado!',b:'🎉 Entrar al evento',s:'Mirá todos los detalles y participá'},
 base:{bg:'linear-gradient(160deg,#3b0764,#be185d)',e:['✨','💝','⭐','🎀'],i:'🎁',k:'Tenés una sorpresa',b:'🎁 Abrir mi regalo',s:'Alguien preparó algo especial para vos'}
};
var ALIAS={quince:'cumple',graduacion:'cumple',pareja:'amor',aniversario:'amor',sanvalentin:'amor',propuesta:'amor',casamiento:'amor',amistad:'amor',familia:'amor',abuelos:'madre',nacimiento:'bebe',babyshower:'bebe',bautismo:'fe',comunion:'fe',umbanda:'fe',nacion:'fe',quimbanda:'fe',xeixe:'fe',homenaje:'fe'};
function el(i){return document.getElementById(i)}
function lluvia(lista){var fx=el('fx');fx.innerHTML='';for(var n=0;n<22;n++){var s=document.createElement('span');s.textContent=lista[n%lista.length];s.style.left=Math.round(Math.random()*96)+'%';s.style.fontSize=(16+Math.round(Math.random()*20))+'px';s.style.animationDuration=(6+Math.random()*7).toFixed(1)+'s';s.style.animationDelay=(-Math.random()*10).toFixed(1)+'s';fx.appendChild(s)}}
function tema(html){var m=html.match(/name="angela-ocasion" content="([a-z]+)"/)||html.match(/occasion-([a-z]+)/);var k=m?m[1]:'';if(!k&&html.indexOf('id="journey"')>-1)k='evento';k=ALIAS[k]||k;var t=TEMAS[k]||TEMAS.base;t.key=TEMAS[k]?k:'base';return t}
function limpio(x){return String(x||'').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>')}
function aplicar(t){document.body.style.background=t.bg;el('ico').textContent=t.i;el('k').textContent=t.k;el('go').textContent=t.b;lluvia(t.e)}
function boom(t){var b=document.createElement('div');b.className='boom';document.body.appendChild(b);for(var n=0;n<16;n++){var s=document.createElement('span');s.textContent=t.e[n%t.e.length];var a=Math.random()*6.28,d=90+Math.random()*170;s.style.setProperty('--dx',Math.round(Math.cos(a)*d)+'px');s.style.setProperty('--dy',Math.round(Math.sin(a)*d)+'px');b.appendChild(s)}}
lluvia(TEMAS.base.e);
(async function(){
  try{
    if(!SRC)throw new Error('link');
    var r=await fetch(SRC,{cache:'no-store'});
    if(!r.ok)throw new Error(r.status);
    var html=new TextDecoder('utf-8').decode(await r.arrayBuffer());
    var t=tema(html);aplicar(t);
    var tt=html.match(/<title>([^<]{1,140})<.title>/i),pp=html.match(/name="angela-para" content="([^"]{1,60})"/),para=pp?limpio(pp[1]):'';
    var publico=t.key==='campana'||t.key==='comedor'||t.key==='evento';
    el('t').textContent=publico?(tt?limpio(tt[1]):t.k):(para?'Una sorpresa para '+para:'Una sorpresa para vos');
    el('s').textContent=t.s+' · Tocá el botón';
    var pie=el('pie');pie.innerHTML=(t.key==='campana'||t.key==='comedor')?'👼 Comedor Ángel Guardián · Merlo<small>Link seguro · hecho con ÁNGELA</small>':'💝 Hecho con mucho cariño<small>Link seguro</small>';pie.style.display='block';
    el('dots').style.display='none';el('go').style.display='inline-block';el('mano').style.display='block';
    el('go').onclick=function(){el('go').disabled=true;boom(t);setTimeout(function(){document.open();document.write(html);document.close()},650)};
  }catch(e){
    el('dots').style.display='none';el('t').textContent='No se pudo abrir';el('s').textContent='';
    var er=el('err');er.style.display='block';er.textContent=String(e&&e.message)==='link'?'El link del regalo no es válido.':'No pudimos abrir el regalo. Revisá la conexión a Internet y probá de nuevo en un rato.';
  }
})();
</script></body></html>`);
};

// ÁNGELA · Meta en vivo de las campañas: devuelve el último estado guardado
// (/api/supabase-config?camp=ID). Cada actualización es un archivo nuevo en
// campanas/ID/, así no hace falta permiso para sobrescribir.
module.exports.campaign = async function campaign(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const id = String((req.query && req.query.camp) || '').toLowerCase();
  if (!/^[a-z0-9]{6,24}$/.test(id)) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'Campaña no válida' })); }
  const base = String(process.env.SUPABASE_URL || PROJECT_URL).replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  try {
    const l = await fetch(`${base}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: `campanas/${id}/`, limit: 1, offset: 0, sortBy: { column: 'name', order: 'desc' } })
    });
    const arr = l.ok ? await l.json() : [];
    const name = Array.isArray(arr) && arr[0] && arr[0].name;
    if (!name) { res.statusCode = 404; return res.end(JSON.stringify({ error: 'Todavía no hay datos de esta campaña' })); }
    const f = await fetch(`${base}/storage/v1/object/public/${BUCKET}/campanas/${id}/${encodeURIComponent(name)}`, { cache: 'no-store' });
    if (!f.ok) { res.statusCode = 502; return res.end(JSON.stringify({ error: 'No se pudo leer la campaña' })); }
    const data = JSON.parse(Buffer.from(await f.arrayBuffer()).toString('utf8'));
    res.statusCode = 200;
    return res.end(JSON.stringify(data));
  } catch (e) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: 'Error leyendo la campaña' }));
  }
};
