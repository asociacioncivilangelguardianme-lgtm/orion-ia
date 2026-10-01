function leerCookies(req) {
  const header = req.headers.cookie || "";

  return header.split(";").reduce((cookies, parte) => {
    const [nombre, ...resto] = parte.trim().split("=");

    if (nombre) {
      cookies[nombre] = decodeURIComponent(resto.join("="));
    }

    return cookies;
  }, {});
}

function decodificarBase64Url(texto = "") {
  try {
    texto = texto.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(texto, "base64").toString("utf8");
  } catch {
    return "";
  }
}

function obtenerTextoParte(parte) {
  if (!parte) return "";

  let texto = "";

  if (parte.body && parte.body.data) {
    texto += decodificarBase64Url(parte.body.data) + "\n";
  }

  if (Array.isArray(parte.parts)) {
    for (const subparte of parte.parts) {
      texto += obtenerTextoParte(subparte) + "\n";
    }
  }

  return texto;
}

function limpiarHTML(texto = "") {
  return texto
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function esIngresoMercadoPago(texto = "") {
  const t = texto.toLowerCase();

  const frasesIngreso = [
    "recibiste dinero",
    "recibiste una transferencia",
    "transferencia recibida",
    "te transfirió",
    "te transfirio",
    "te enviaron dinero",
    "te envió dinero",
    "te envio dinero",
    "dinero recibido",
    "pago recibido",
    "se acreditó",
    "se acredito",
    "acreditamos",
    "ingresó dinero",
    "ingreso de dinero"
  ];

  const frasesExcluir = [
    "transferencia enviada",
    "enviaste dinero",
    "transferiste dinero",
    "pago realizado",
    "pago enviado",
    "compraste",
    "rechazado",
    "rechazada",
    "cancelado",
    "cancelada",
    "pago pendiente",
    "transferencia pendiente"
  ];

  const tieneIngreso = frasesIngreso.some(frase =>
    t.includes(frase)
  );

  const tieneExclusion = frasesExcluir.some(frase =>
    t.includes(frase)
  );

  return tieneIngreso && !tieneExclusion;
}

function extraerMonto(texto = "") {
  const coincidencia = texto.match(
    /(?:ARS\s*|\$\s*)([\d.]+(?:,\d{1,2})?)/i
  );

  return coincidencia ? coincidencia[1] : "";
}

function extraerEmail(texto = "") {
  const emails =
    texto.match(
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
    ) || [];

  const valido = emails.find(email => {
    const e = email.toLowerCase();

    return (
      !e.includes("mercadopago") &&
      !e.includes("mercadolibre")
    );
  });

  return valido || "";
}

function extraerReferencia(texto = "") {
  const coincidencia = texto.match(
    /(?:operaci[oó]n|referencia|n[uú]mero|numero|nro\.?|id)\s*[:#]?\s*([A-Z0-9-]{5,})/i
  );

  return coincidencia ? coincidencia[1] : "";
}

export default async function handler(req, res) {
  try {
    const cookies = leerCookies(req);

    const refreshToken =
      cookies.angela_gmail_refresh_token;

    if (!refreshToken) {
      return res.status(401).json({
        connected: false,
        error: "Gmail todavía no está conectado."
      });
    }

    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(500).json({
        error: "Faltan variables de Gmail en Vercel."
      });
    }

    const tokenRespuesta = await fetch(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token"
        })
      }
    );

    const tokenDatos = await tokenRespuesta.json();

    if (!tokenRespuesta.ok || !tokenDatos.access_token) {
      return res.status(401).json({
        connected: false,
        error: "La autorización de Gmail debe renovarse."
      });
    }

    const accessToken = tokenDatos.access_token;

    const listaRespuesta = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?q=%22Mercado%20Pago%22&maxResults=100",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    const lista = await listaRespuesta.json();

    if (!listaRespuesta.ok) {
      return res.status(500).json({
        error: "No se pudieron consultar los correos."
      });
    }

    const mensajes = lista.messages || [];
    const ingresos = [];

    for (const item of mensajes) {
      const mensajeRespuesta = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=full`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      );

      if (!mensajeRespuesta.ok) continue;

      const mensaje = await mensajeRespuesta.json();

      const headers =
        mensaje.payload?.headers || [];

      const obtenerHeader = nombre =>
        headers.find(
          h =>
            h.name.toLowerCase() ===
            nombre.toLowerCase()
        )?.value || "";

      const asunto = obtenerHeader("Subject");
      const fecha = obtenerHeader("Date");
      const remitente = obtenerHeader("From");

      let cuerpo =
        obtenerTextoParte(mensaje.payload);

      cuerpo = limpiarHTML(cuerpo);

      const textoCompleto =
        `${asunto} ${cuerpo}`;

      if (!esIngresoMercadoPago(textoCompleto)) {
        continue;
      }

      ingresos.push({
        id: mensaje.id,
        fecha,
        nombre: "",
        monto: extraerMonto(textoCompleto),
        email: extraerEmail(cuerpo),
        referencia:
          extraerReferencia(textoCompleto),
        asunto,
        remitente
      });
    }

    const unicos = Array.from(
      new Map(
        ingresos.map(item => [
          item.referencia || item.id,
          item
        ])
      ).values()
    );

    return res.status(200).json({
      connected: true,
      total: unicos.length,
      ingresos: unicos
    });

  } catch (error) {
    console.error(
      "Error buscando ingresos Mercado Pago:",
      error
    );

    return res.status(500).json({
      error:
        "Error al buscar ingresos de Mercado Pago."
    });
  }
}
