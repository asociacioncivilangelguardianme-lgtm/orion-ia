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

function crearCookie(nombre, valor, maxAge) {
  return `${nombre}=${encodeURIComponent(valor)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function borrarCookie(nombre) {
  return `${nombre}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export default async function handler(req, res) {
  const { code, state } = req.query;

  const cookies = leerCookies(req);
  const stateGuardado = cookies.angela_gmail_state;

  // Comprobación de seguridad OAuth
  if (!state || !stateGuardado || state !== stateGuardado) {
    return res.status(403).send(
      "La verificación de seguridad de Gmail no es válida. Volvé a conectar Gmail desde ÁNGELA."
    );
  }

  if (!code) {
    return res.status(400).send(
      "Falta el código de autorización de Google."
    );
  }

  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const redirectUri = process.env.GMAIL_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return res.status(500).send(
      "Faltan variables de Gmail en Vercel."
    );
  }

  try {
    const respuesta = await fetch(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code"
        })
      }
    );

    const tokens = await respuesta.json();

    if (!respuesta.ok) {
      console.error("Error OAuth Gmail:", tokens);

      return res.status(500).send(
        "Google no pudo completar la conexión con Gmail."
      );
    }

    if (!tokens.refresh_token) {
      return res.status(400).send(
        "Google no entregó la autorización permanente. Volvé a conectar Gmail desde ÁNGELA."
      );
    }

    res.setHeader("Set-Cookie", [
      crearCookie(
        "angela_gmail_refresh_token",
        tokens.refresh_token,
        60 * 60 * 24 * 30
      ),

      crearCookie(
        "angela_gmail_connected",
        "1",
        60 * 60 * 24 * 30
      ),

      borrarCookie("angela_gmail_state")
    ]);

    return res.redirect("/?gmail=conectado");

  } catch (error) {
    console.error("Error Gmail callback:", error);

    return res.status(500).send(
      "Ocurrió un error al conectar Gmail con ÁNGELA."
    );
  }
}
