export default async function handler(req, res) {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send("Falta el código de autorización de Google.");
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
    const respuesta = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code"
      })
    });

    const tokens = await respuesta.json();

    if (!respuesta.ok) {
      console.error("Error OAuth Gmail:", tokens);
      return res.status(500).send(
        "No se pudo completar la conexión con Gmail."
      );
    }

    /*
      Por ahora comprobamos que Google autorizó correctamente.
      El CLIENT_SECRET nunca se envía al navegador.
      En el siguiente paso guardaremos de forma segura
      la autorización para que ÁNGELA pueda consultar Gmail.
    */

    return res.redirect(
      "/?gmail=autorizado"
    );

  } catch (error) {
    console.error("Error Gmail callback:", error);

    return res.status(500).send(
      "Error al conectar Gmail con ÁNGELA."
    );
  }
}
