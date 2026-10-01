export default function handler(req, res) {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const redirectUri = process.env.GMAIL_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return res.status(500).json({
      error: "Faltan las variables de Gmail en Vercel"
    });
  }

  const scope = "https://www.googleapis.com/auth/gmail.readonly";

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scope,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true"
  });

  const authUrl =
    "https://accounts.google.com/o/oauth2/v2/auth?" +
    params.toString();

  return res.redirect(authUrl);
}
