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

export default async function handler(req, res) {
  try {
    const cookies = leerCookies(req);

    const gmailConectado =
      cookies.angela_gmail_connected === "1";

    return res.status(200).json({
      connected: gmailConectado
    });

  } catch (error) {
    console.error("Error comprobando Gmail:", error);

    return res.status(200).json({
      connected: false
    });
  }
}
