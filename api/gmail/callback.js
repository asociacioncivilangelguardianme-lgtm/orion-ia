function cookie(nombre, valor, maxAge) {
  return `${nombre}=${encodeURIComponent(valor)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export default async function handler(req, res) {
  const { code } = req.query;

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
        "No se pudo completar la conexión con Gmail."
      );
    }

    if (!tokens.refresh_token) {
      return res.status(400).send(
        "Google no entregó una autorización permanente. Volvé a conectar Gmail."
      );
    }

    /*
      Guardamos el refresh token solamente en una cookie
      HttpOnly y Secure. El JavaScript del navegador
      no puede leer esta cookie.
    */

    res.setHeader("Set-Cookie", [
      cookie(
        "angela_gmail_refresh_token",
        tokens.refresh_token,
        60 * 60 * 24 * 30
      ),
      cookie(
        "angela_gmail_connected",
        "1",
        60 * 60 * 24 * 30
      )
    ]);

    return res.redirect("/?gmail=conectado");

  } catch (error) {
    console.error(
      "Error Gmail callback:",
      error
    );

    return res.status(500).send(
      "Error al conectar Gmail con ÁNGELA."
    );
  }
}
