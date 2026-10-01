import crypto from "crypto";

function crearCookie(nombre, valor, maxAge) {
  return `${nombre}=${encodeURIComponent(valor)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export default function handler(req, res) {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const redirectUri = process.env.GMAIL_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return res.status(500).json({
      error: "Faltan las variables de Gmail en Vercel"
    });
  }

  // Código aleatorio de seguridad para comprobar
  // que la respuesta realmente corresponde a esta conexión.
  const state = crypto.randomBytes(24).toString("hex");

  res.setHeader(
    "Set-Cookie",
    crearCookie(
      "angela_gmail_state",
      state,
      60 * 10
    )
  );

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/gmail.readonly",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: state
  });

  const authUrl =
    "https://accounts.google.com/o/oauth2/v2/auth?" +
    params.toString();

  return res.redirect(authUrl);
}
